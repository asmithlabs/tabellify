/* Tabellify — main plugin object (F001: menu item, cleanup; F002: workspace tab).
 *
 * `bootstrap.js` loads this file with `Services.scriptloader.loadSubScript`, which runs it
 * in the bootstrap's own global scope. That's why `Tabellify` is declared with `var` at the
 * top level: it becomes a global that bootstrap.js can call. (Classic script, not an ES
 * module, so no `import`/`export` here.)
 *
 * The method names and call order are fixed by bootstrap.js:
 *
 *   startup  → Tabellify.init(...)               → register menu + quit observer, then
 *                                                  onMainWindowLoad for each open main window
 *   window   → Tabellify.onMainWindowLoad/Unload  (forwarded from bootstrap)
 *   shutdown → Tabellify.shutdown()              → close workspace tabs and windows, remove
 *                                                  quit observer, unregister menu,
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
  /**
   * Tab type passed to `Zotero_Tabs.add` (F002 AC11). Must not contain "-": Zotero splits
   * tab types on hyphens ("reader-unloaded" → "reader" + state "unloaded").
   */
  TAB_TYPE: "tabellify",
  /** Used if Fluent cannot format `tabellify-tab-title`. */
  FALLBACK_TAB_TITLE: "Tabellify",

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
   * Open Tabellify tab id per main window. A `Map` keyed by the window object (each main
   * window has its own `Zotero_Tabs` and its own tab ids). Entries are removed by the tab's
   * `onClose`, so the Map never keeps a closed window alive for long.
   * @type {Map<any, string>}
   */
  tabIDs: new Map(),
  /**
   * Observer for "quit-application-granted", registered in `init`, removed in `shutdown`.
   * Kept here because `removeObserver` needs the very same object `addObserver` got.
   * @type {{ observe(subject: any, topic: string, data: any): void } | null}
   */
  quitObserver: null,

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
    this.addQuitObserver();

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
            // MenuManager passes (event, context); the event tells us which main window's
            // menu was used, so the tab opens in that window.
            onCommand: (event) => this.openWorkspace(this.windowFromCommandEvent(event)),
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
      // unregisterMenu returns true if it removed the menu, false if nothing matched the
      // id. Logging the result means the debug output shows what really happened.
      const removed = Zotero.MenuManager.unregisterMenu(this.menuID);
      this.log(`menu unregistered (${this.menuID}): ${removed}`);
    }
    catch (err) {
      Zotero.logError(err);
    }
    // Reset even on error, so a later re-enable starts clean instead of holding a stale id.
    this.menuID = null;
  },

  /**
   * Pick the main window a menu command came from.
   *
   * MenuManager calls `onCommand(event, context)` with the DOM event of the clicked menu item.
   * `event.target` is that <menuitem>, and `ownerGlobal` (a Mozilla chrome-only DOM
   * property) is the window it lives in. That property is UNVERIFIED for MenuManager items
   * (api-notes, runtime check RT4), so we only trust it if it really is one of Zotero's main
   * windows, and otherwise use `Zotero.getMainWindow()`.
   * @param {any} event  The command event from MenuManager (may lack `target` in tests)
   * @returns {any} A main window, or null if none is open
   */
  windowFromCommandEvent(event) {
    const candidate = event?.target?.ownerGlobal ?? null;
    const isMain = !!candidate && Zotero.getMainWindows().includes(candidate);
    // Kept on purpose (not temporary): the owner reads this line for runtime check RT4.
    this.log(`menu command window is main: ${isMain}`);
    return isMain ? candidate : Zotero.getMainWindow();
  },

  /**
   * Open the workspace as a tab in `win` (Feature 002), or select it if that window already
   * has one. Falls back to the F001 separate window if Zotero's tab manager is unusable.
   *
   * `async` because the tab title comes from Fluent, and `formatValue` returns a Promise.
   * Callers don't need to wait for it: all errors are caught and logged in here.
   * @param {any} [win]  Main window to open the tab in; defaults to `Zotero.getMainWindow()`
   * @returns {Promise<void>}
   */
  async openWorkspace(win) {
    try {
      win = win ?? Zotero.getMainWindow();
      if (!win) {
        this.log("no main window; cannot open workspace");
        return;
      }

      // AC9: feature-detect before touching Zotero internals (ADR-0009 §5).
      const tabs = this.getTabsAPI(win);
      if (!tabs) {
        this.log("Zotero_Tabs unavailable; opening workspace window instead");
        this.openWorkspaceWindow(win);
        return;
      }

      // AC2: single instance per main window.
      if (this.selectExistingTab(win, tabs)) return;

      const title = await this.getTabTitle(win);

      // `await` gave other code a chance to run. Re-check: the plugin may have been shut
      // down, or a second menu click may already have opened the tab while we waited.
      if (!this.initialized) return;
      if (this.selectExistingTab(win, tabs)) return;

      let added;
      try {
        // Zotero_Tabs is an internal, undocumented API (ADR-0009): use only add, select,
        // close and getTabInfo. AC11: the type has no hyphen (Zotero splits types on "-"),
        // and `data` must be an object (Zotero reads `tab.data.icon` for every tab).
        added = tabs.add({
          type: this.TAB_TYPE,
          title,
          data: {},
          select: true,
          // AC4: Zotero calls this for every close path (× button, Cmd-W, context menu, and
          // our own `close` calls), so the stored id never points at a closed tab.
          onClose: () => this.forgetTab(win, added?.id),
        });
      }
      catch (err) {
        // AC9: `add` threw (a Zotero change?). Keep the workspace usable as a window.
        Zotero.logError(err);
        this.log("Zotero_Tabs.add failed; opening workspace window instead");
        this.openWorkspaceWindow(win);
        return;
      }

      const { id, container } = added ?? {};
      if (!id || !container) {
        this.log("Zotero_Tabs.add returned no tab; opening workspace window instead");
        this.openWorkspaceWindow(win);
        return;
      }
      this.tabIDs.set(win, id);

      // Our content is our own chrome document in an <iframe>, so its HTML, CSS and Fluent
      // strings stay separate from Zotero's main window and leave with the tab. A chrome://
      // URL loaded from chrome code gets full (system) privileges; RT2 confirmed this.
      const iframe = win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe");
      iframe.setAttribute("style", "flex: 1; border: 0; width: 100%; height: 100%;");
      iframe.setAttribute("src", this.WORKSPACE_URL);
      container.append(iframe);
      this.log(`workspace tab opened (${id})`);
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /**
   * Return `win.Zotero_Tabs` if it has every method Tabellify uses, else null (AC9).
   * @param {any} win  A main window
   * @returns {any} The tab manager, or null
   */
  getTabsAPI(win) {
    const tabs = win?.Zotero_Tabs;
    if (!tabs) return null;
    for (const method of ["add", "select", "close", "getTabInfo"]) {
      if (typeof tabs[method] !== "function") return null;
    }
    return tabs;
  },

  /**
   * True if `id` is still an open Tabellify tab in this tab manager. For an unknown id,
   * `getTabInfo` returns `{}` on Zotero 10.0.9 (RT1), so `.type` is then undefined.
   * @param {any} tabs  A window's `Zotero_Tabs`
   * @param {string | undefined} id
   * @returns {boolean}
   */
  isOurTab(tabs, id) {
    if (!id) return false;
    return tabs.getTabInfo(id)?.type === this.TAB_TYPE;
  },

  /**
   * If this window already has our tab, select it and return true (AC2).
   * @param {any} win
   * @param {any} tabs  `win.Zotero_Tabs`
   * @returns {boolean}
   */
  selectExistingTab(win, tabs) {
    const id = this.tabIDs.get(win);
    if (!this.isOurTab(tabs, id)) {
      // Stale id (tab gone without onClose): drop it so the caller opens a new tab.
      if (id) this.tabIDs.delete(win);
      return false;
    }
    tabs.select(id);
    this.log(`workspace tab already open; selected it (${id})`);
    return true;
  },

  /**
   * Localized tab title from the main window's Fluent (`tabellify.ftl` is linked there by
   * `onMainWindowLoad`). Falls back to "Tabellify" if formatting fails or returns nothing.
   * @param {any} win
   * @returns {Promise<string>}
   */
  async getTabTitle(win) {
    try {
      const title = await win.document.l10n.formatValue("tabellify-tab-title");
      if (title) return title;
      this.log("tab title not found in Fluent; using fallback");
    }
    catch (err) {
      Zotero.logError(err);
    }
    return this.FALLBACK_TAB_TITLE;
  },

  /**
   * Forget the stored tab id for `win`, but only if it is still the one that closed (a newer
   * tab may already have replaced it).
   * @param {any} win
   * @param {string | undefined} id
   */
  forgetTab(win, id) {
    if (this.tabIDs.get(win) === id) this.tabIDs.delete(win);
    this.log(`workspace tab closed (${id})`);
  },

  /**
   * F001 behaviour, kept as the fallback (AC9, owner decision Q4): open the workspace as a
   * separate window, or bring it to the front if it's already open.
   *
   * Single instance: Services.wm keeps track of open windows by their `windowtype`. If one
   * of ours exists (and isn't in the middle of closing), focus it instead of opening a
   * second copy.
   * @param {any} [mainWindow]  Parent main window; defaults to `Zotero.getMainWindow()`
   */
  openWorkspaceWindow(mainWindow) {
    try {
      const existing = Services.wm.getMostRecentWindow(this.WORKSPACE_WINDOWTYPE);
      if (existing && !existing.closed) {
        this.log("workspace already open; focusing it");
        existing.focus();
        return;
      }

      mainWindow = mainWindow ?? Zotero.getMainWindow();
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

  /**
   * Close our tab in one main window, if it has one (AC8, and part of AC5/AC6). Only ever
   * closes the tab id Tabellify stored itself, after `getTabInfo` confirms it is still a
   * Tabellify tab, so Zotero's own tabs are never touched.
   * @param {any} win
   */
  closeWorkspaceTab(win) {
    const id = this.tabIDs.get(win);
    if (!id) return;
    try {
      const tabs = this.getTabsAPI(win);
      if (tabs && this.isOurTab(tabs, id)) {
        // `close` removes the tab from Zotero's tab list at once and calls our `onClose`;
        // the tab's content element (with our iframe) is removed a moment later.
        this.log(`closing workspace tab (${id})`);
        tabs.close(id);
      }
    }
    catch (err) {
      Zotero.logError(err);
    }
    // Forget it even if closing failed, so a re-enable starts clean.
    this.tabIDs.delete(win);
  },

  /** Close our tab in every main window we opened one in (AC5, AC6). */
  closeAllWorkspaceTabs() {
    // Copy the windows first: closing a tab runs `onClose`, which edits `tabIDs`.
    for (const win of [...this.tabIDs.keys()]) {
      this.closeWorkspaceTab(win);
    }
    this.tabIDs.clear();
  },

  /**
   * Close our tabs when the app quits, BEFORE Zotero saves its session (AC6, ADR-0009 §4).
   *
   * Why: at quit Zotero writes every open tab to `session.json` on this same
   * "quit-application-granted" notification. Since Zotero 8, restoring a saved tab of an
   * unknown type throws, and every tab saved after it (PDFs, notes) is then not restored.
   * Plugin `shutdown()` runs much later in the quit sequence, too late to help. Mozilla
   * currently notifies the newest observer first, and ours is added after Zotero's, so it
   * should run first; that order is UNVERIFIED at runtime until the owner's AC6 check.
   */
  addQuitObserver() {
    if (this.quitObserver) return;
    try {
      // Any JS object with an `observe(subject, topic, data)` method works as an observer.
      const observer = {
        observe: (_subject, topic) => {
          if (topic !== "quit-application-granted") return;
          this.log("quit-application-granted: closing workspace tabs");
          this.closeAllWorkspaceTabs();
        },
      };
      Services.obs.addObserver(observer, "quit-application-granted");
      this.quitObserver = observer;
      this.log("quit observer added");
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /** Remove the observer added by `addQuitObserver`. Safe to call when none is registered. */
  removeQuitObserver() {
    if (!this.quitObserver) return;
    try {
      Services.obs.removeObserver(this.quitObserver, "quit-application-granted");
      this.log("quit observer removed");
    }
    catch (err) {
      Zotero.logError(err);
    }
    this.quitObserver = null;
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
      // Check for our <link> before and after, so the log reports what actually happened
      // rather than assuming success. "already present: true" means the call was a no-op.
      const selector = `link[href="${this.FTL_FILE}"]`;
      const wasPresent = !!window.document.querySelector(selector);
      // @ts-ignore MozXULElement exists on Zotero's chrome windows, not on plain DOM Window.
      window.MozXULElement.insertFTLIfNeeded(this.FTL_FILE);
      const isPresent = !!window.document.querySelector(selector);
      this.log(`onMainWindowLoad: inserted FTL (already present: ${wasPresent}, present now: ${isPresent})`);
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /**
   * Remove everything Tabellify added to one main window: our workspace tab (AC8, so it is
   * not saved as part of the closing window's state), then every
   * `link[href="tabellify.ftl"]` element. If there are none, nothing happens.
   * @param {{ window: Window }} params
   */
  onMainWindowUnload({ window }) {
    this.closeWorkspaceTab(window);
    try {
      // Remove ALL matching links, not just the first. Defensive: a duplicate has not been
      // observed (insertFTLIfNeeded skips an existing link), but a stray copy left by a
      // same-session remove→reinstall (Zotero bug, see docs/development.md) should not
      // survive. This also removes a link a second running copy might use; acceptable,
      // since that state is already broken. querySelectorAll returns a static list, so
      // removing elements while looping over it is safe.
      const links = window.document.querySelectorAll(`link[href="${this.FTL_FILE}"]`);
      links.forEach((link) => link.remove());
      // Log how many we removed: 1 normally, 0 if none was present.
      this.log(`onMainWindowUnload: removed FTL: ${links.length}`);
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /**
   * Undo everything `init` did. Order matters:
   *   1. Close workspace tabs and fallback windows (AC5). Bootstrap destroys the chrome
   *      registration right after this returns; a tab or window left open would point at a
   *      chrome:// URL that no longer exists, and a leftover "tabellify" tab could be saved
   *      in Zotero's session and break tab restore after a restart.
   *   2. Remove the quit observer (mirror of `init`).
   *   3. Unregister the menu, so no menu item is left calling into this unloaded code.
   *   4. Remove the FTL link from every main window (the menu that needed it is gone).
   * Each step catches its own errors, so one failure doesn't skip the rest.
   */
  shutdown() {
    if (!this.initialized) return;
    this.log("shutdown");

    this.closeAllWorkspaceTabs();
    this.closeWorkspaceWindows();
    this.removeQuitObserver();
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
