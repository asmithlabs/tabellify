/* Tabellify — main plugin object (Feature 001 T2: logging-only stub).
 *
 * `bootstrap.js` loads this file with `Services.scriptloader.loadSubScript`, which runs it
 * in the bootstrap's own global scope. That's why `Tabellify` is declared with `var` at the
 * top level: it becomes a global that bootstrap.js can call. (Classic script, not an ES
 * module, so no `import`/`export` here.)
 *
 * Feature 001 T3 fills in these methods (menu item, workspace window, Fluent strings,
 * cleanup). The method names and call order are fixed by bootstrap.js, which T3 won't edit:
 *
 *   startup  → Tabellify.init(...)               → onMainWindowLoad for each open main window
 *   window   → Tabellify.onMainWindowLoad/Unload  (forwarded from bootstrap)
 *   shutdown → Tabellify.shutdown()              → onMainWindowUnload for each open main window,
 *                                                  then (in bootstrap) chromeHandle.destruct()
 */
"use strict";

/**
 * @typedef {object} TabellifyInitParams
 * @property {string} id       Plugin ID ("tabellify@asmithlabs.com")
 * @property {string} version  Plugin version from manifest.json
 * @property {string} rootURI  URI of the plugin root, ending in "/"
 */

var Tabellify = {
  /** @type {string | null} */
  id: null,
  /** @type {string | null} */
  version: null,
  /** @type {string | null} */
  rootURI: null,
  /** True between `init` and `shutdown`. */
  initialized: false,

  /**
   * Plugin-wide setup, called once per `startup`. T3 adds the menu here (`registerMenu`).
   *
   * Per-window setup lives in `onMainWindowLoad`. Zotero calls that hook only for windows
   * that open AFTER the plugin started, so when the plugin is enabled while Zotero is already
   * running we also run it here for every main window that's already open.
   * @param {TabellifyInitParams} params
   */
  init({ id, version, rootURI }) {
    if (this.initialized) return;
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this.initialized = true;
    this.log(`init (version ${version})`);

    for (const window of Zotero.getMainWindows()) {
      this.onMainWindowLoad({ window });
    }
  },

  /**
   * Add per-window UI to one main window. T3: insert `tabellify.ftl` so the menu label
   * can be localized.
   * @param {{ window: Window }} params
   */
  onMainWindowLoad({ window }) {
    this.log("onMainWindowLoad (stub)");
  },

  /**
   * Remove everything `onMainWindowLoad` added to one main window. T3: remove the
   * `link[href="tabellify.ftl"]` element.
   * @param {{ window: Window }} params
   */
  onMainWindowUnload({ window }) {
    this.log("onMainWindowUnload (stub)");
  },

  /**
   * Undo everything `init` did. Runs BEFORE bootstrap destroys the chrome registration, so
   * T3 must close every `tabellify:workspace` window here while its chrome:// URL still
   * resolves, and unregister the menu.
   */
  shutdown() {
    if (!this.initialized) return;
    this.log("shutdown");

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
