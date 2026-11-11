/* Tabellify — main plugin object (Feature 001: menu item, workspace window, cleanup).
 *
 * `bootstrap.js` loads this file with `Services.scriptloader.loadSubScript`, which runs it
 * in the bootstrap's own global scope. That's why `Tabellify` is declared with `var` at the
 * top level: it becomes a global that bootstrap.js can call. (Classic script, not an ES
 * module, so no `import`/`export` here.)
 *
 * The method names and call order are fixed by bootstrap.js:
 *
 *   startup  → Tabellify.init(...)               → onMainWindowLoad for each open main window
 *   window   → Tabellify.onMainWindowLoad/Unload  (forwarded from bootstrap)
 *   shutdown → Tabellify.shutdown()              → close workspace windows, unregister menu,
 *                                                  onMainWindowUnload for each open main window,
 *                                                  then (in bootstrap) chromeHandle.destruct()
 *
 * Verified APIs: docs/zotero-api-notes.md. This file never reads or writes library data.
 */
"use strict";

/**
 * @typedef {object} TabellifyInitParams
 * @property {string} id       Plugin ID ("tabellify@asmithlabs.com")
 * @property {string} version  Plugin version from manifest.json
 * @property {string} rootURI  URI of the plugin root, ending in "/"
 */

var Tabellify = {
  /** URL of the workspace window. Resolves only while bootstrap's chrome registration lives. */
  WORKSPACE_URL: "chrome://tabellify/content/workspace.xhtml",
  /** Matches `windowtype` on the root <window> in workspace.xhtml. */
  WORKSPACE_WINDOWTYPE: "tabellify:workspace",
  /** Our Fluent file in `locale/en-US/`. Zotero registers it automatically. */
  FTL_FILE: "tabellify.ftl",

  /** @type {string | null} */
  id: null,
  /** @type {string | null} */
  version: null,
  /** @type {string | null} */
  rootURI: null,
  /** True between `init` and `shutdown`. */
  initialized: false,
  /**
   * ID returned by `Zotero.MenuManager.registerMenu`, or null when no menu is registered.
   * @type {string | null}
   */
  menuID: null,

  /**
   * Plugin-wide setup, called once per `startup`: register the menu, then do the per-window
   * setup for main windows that are already open.
   *
   * Zotero calls `onMainWindowLoad` only for windows that open AFTER the plugin started, so
   * when the plugin is enabled while Zotero is already running we run it here ourselves.
   * @param {TabellifyInitParams} params
   */
  init({ id, version, rootURI }) {
    if (this.initialized) return;
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this.initialized = true;
    this.log(`init (version ${version})`);

    this.registerMenu();

    for (const window of Zotero.getMainWindows()) {
      this.onMainWindowLoad({ window });
    }
  },

  /**
   * Add "Tabellify…" to the Tools menu. Registered once for the whole app (not per window):
   * MenuManager adds the item to every main window itself.
   */
  registerMenu() {
    try {
      // registerMenu returns a NAMESPACED id (our plugin ID + menuID), not the plain
      // "open-workspace" we pass in. `unregisterMenu` needs that returned id, so we keep it.
      // It returns `false` if registration failed.
      const registeredID = Zotero.MenuManager.registerMenu({
        menuID: "open-workspace",
        pluginID: this.id,
        target: "main/menubar/tools",
        menus: [
          {
            menuType: "menuitem",
            // MenuManager only sets data-l10n-id on the item; the text comes from
            // tabellify.ftl, which onMainWindowLoad inserts into each main window.
            l10nID: "tabellify-menu-open",
            // Arrow function, so `this` still means the Tabellify object when clicked.
            onCommand: () => this.openWorkspace(),
          },
        ],
      });
      if (registeredID) {
        this.menuID = registeredID;
        this.log(`menu registered (${registeredID})`);
      }
      else {
        this.log("menu registration failed");
      }
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /** Remove the menu item added by `registerMenu`. Safe to call when none is registered. */
  unregisterMenu() {
    if (!this.menuID) return;
    try {
      Zotero.MenuManager.unregisterMenu(this.menuID);
      this.log(`menu unregistered (${this.menuID})`);
    }
    catch (err) {
      Zotero.logError(err);
    }
    // Reset even on error, so a later re-enable starts clean instead of holding a stale id.
    this.menuID = null;
  },

  /**
   * Open the workspace window, or bring it to the front if it's already open.
   *
   * Single instance: Services.wm keeps track of open windows by their `windowtype`. If one
   * of ours exists (and isn't in the middle of closing), focus it instead of opening a
   * second copy.
   */
  openWorkspace() {
    try {
      const existing = Services.wm.getMostRecentWindow(this.WORKSPACE_WINDOWTYPE);
      if (existing && !existing.closed) {
        this.log("workspace already open; focusing it");
        existing.focus();
        return;
      }

      const mainWindow = Zotero.getMainWindow();
      if (!mainWindow) {
        this.log("no main window; cannot open workspace");
        return;
      }
      this.log("opening workspace window");
      // "dialog=no" gives a normal window (minimize/maximize) rather than a dialog.
      mainWindow.openDialog(
        this.WORKSPACE_URL,
        "tabellify-workspace",
        "chrome,titlebar,centerscreen,resizable=yes,dialog=no",
      );
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /** Close every open workspace window. */
  closeWorkspaceWindows() {
    try {
      // getEnumerator yields every open window whose `windowtype` matches.
      for (const win of Services.wm.getEnumerator(this.WORKSPACE_WINDOWTYPE)) {
        if (!win.closed) {
          this.log("closing workspace window");
          win.close();
        }
      }
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /**
   * Add per-window UI to one main window: insert `tabellify.ftl` so the menu label can be
   * localized. (Our own workspace window loads the file itself via <html:link>.)
   * insertFTLIfNeeded appends a <link rel="localization"> and skips it if already present.
   * @param {{ window: Window }} params
   */
  onMainWindowLoad({ window }) {
    try {
      // @ts-ignore MozXULElement exists on Zotero's chrome windows, not on plain DOM Window.
      window.MozXULElement.insertFTLIfNeeded(this.FTL_FILE);
      this.log("onMainWindowLoad: inserted FTL");
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /**
   * Remove everything `onMainWindowLoad` added to one main window: the
   * `link[href="tabellify.ftl"]` element. `?.` makes it a no-op if the link is missing.
   * @param {{ window: Window }} params
   */
  onMainWindowUnload({ window }) {
    try {
      window.document.querySelector(`link[href="${this.FTL_FILE}"]`)?.remove();
      this.log("onMainWindowUnload: removed FTL");
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /**
   * Undo everything `init` did. Order matters:
   *   1. Close workspace windows. Bootstrap destroys the chrome registration right after
   *      this returns; a window left open would point at a chrome:// URL that no longer
   *      exists.
   *   2. Unregister the menu, so no menu item is left calling into this unloaded code.
   *   3. Remove the FTL link from every main window (the menu that needed it is gone).
   * Each step catches its own errors, so one failure doesn't skip the rest.
   */
  shutdown() {
    if (!this.initialized) return;
    this.log("shutdown");

    this.closeWorkspaceWindows();
    this.unregisterMenu();

    // Mirror of the loop in `init`: undo per-window UI on every main window still open.
    for (const window of Zotero.getMainWindows()) {
      this.onMainWindowUnload({ window });
    }
    this.initialized = false;
  },

  /**
   * Write to Zotero's Debug Output (Help → Debug Output Logging), prefixed "Tabellify: ".
   * @param {string} message
   */
  log(message) {
    Zotero.debug(`Tabellify: ${message}`);
  },
};
