/* Tabellify — bootstrap.js
 *
 * This is the file Zotero calls into. A "bootstrapped" plugin has no other entry point:
 * Zotero loads this script and calls the functions below by name at fixed moments.
 *
 *   install  ─▶ startup ─▶ onMainWindowLoad ─▶ … ─▶ onMainWindowUnload ─▶ shutdown ─▶ uninstall
 *
 * Zotero can disable and re-enable a plugin while it keeps running, so `shutdown` must undo
 * EVERYTHING `startup` did (lifecycle symmetry, CLAUDE.md rule 9).
 *
 * This file is deliberately thin. It owns only the two things that must exist before the
 * plugin code runs: the chrome registration and loading `tabellify.js`. Everything else is
 * forwarded to the `Tabellify` object. Feature 001 T3 fills in `tabellify.js` and does not
 * edit this file.
 *
 * Globals used here (`Zotero`, `Services`, `Cc`, `Ci`) are provided by Zotero in the
 * bootstrap scope. Verified APIs: docs/zotero-api-notes.md.
 *
 * Every hook receives `({ id, version, rootURI }, reason)`. `rootURI` is a string ending in
 * "/" that points at the plugin root (the inside of the .xpi). `reason` is a number
 * (APP_STARTUP 1, APP_SHUTDOWN 2, ADDON_ENABLE 3, ADDON_DISABLE 4, …); we log it but never
 * branch on it.
 */
"use strict";

/**
 * The plugin object. `var` (not `let`) on purpose: `tabellify.js` is loaded into this same
 * global scope and declares `var Tabellify = {...}`. Two `var` declarations of one global
 * name are allowed; a `let` here would make that load fail with a redeclaration error.
 * @type {any}
 */
var Tabellify;

/**
 * Handle returned by `registerChrome`. Calling `.destruct()` on it removes our
 * `chrome://tabellify/` URLs again.
 * @type {{ destruct(): void } | null}
 */
let chromeHandle = null;

/**
 * @typedef {object} BootstrapParams
 * @property {string} id       Plugin ID ("tabellify@asmithlabs.com")
 * @property {string} version  Plugin version from manifest.json
 * @property {string} rootURI  URI of the plugin root, ending in "/"
 */

/**
 * Called once when the plugin is installed (before the first `startup`).
 * @param {BootstrapParams} data
 * @param {number} reason
 */
function install(data, reason) {
  Zotero.debug(`Tabellify: install (version ${data.version}, reason ${reason})`);
}

/**
 * Called when Zotero starts with the plugin enabled, or when the plugin is enabled/installed
 * while Zotero runs. Order matters: chrome first (so `chrome://tabellify/` URLs resolve),
 * then the plugin script, then `init`.
 * @param {BootstrapParams} data
 * @param {number} reason
 */
function startup({ id, version, rootURI }, reason) {
  Zotero.debug(`Tabellify: startup (version ${version}, reason ${reason})`);
  try {
    // Chrome registration. A plugin's files live inside its .xpi; registering a "content"
    // package makes them reachable as chrome://tabellify/content/<file>, which maps to
    // `src/content/<file>`. The path "content/" is relative to manifest.json. Chrome URLs
    // are needed to open our own privileged XHTML window (Feature 001 T3).
    const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
      .getService(Ci.amIAddonManagerStartup);
    const manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "tabellify", "content/"],
    ]);

    // Run tabellify.js in this same scope, which defines the global `Tabellify` object.
    Services.scriptloader.loadSubScript(rootURI + "tabellify.js");

    // `init` also runs the per-window setup for main windows that are already open (when
    // the plugin is enabled mid-session). At app startup there are none yet; Zotero then
    // calls `onMainWindowLoad` below once the main window appears.
    Tabellify.init({ id, version, rootURI });
  }
  catch (err) {
    Zotero.logError(err);
  }
}

/**
 * Called each time a Zotero main window finishes loading. On macOS the main window can be
 * closed and reopened during one session, so this can run more than once.
 * @param {{ window: Window }} params
 * @param {number} reason
 */
function onMainWindowLoad({ window }, reason) {
  Zotero.debug(`Tabellify: onMainWindowLoad (reason ${reason})`);
  try {
    Tabellify?.onMainWindowLoad({ window });
  }
  catch (err) {
    Zotero.logError(err);
  }
}

/**
 * Called each time a Zotero main window is about to close. Undo what `onMainWindowLoad`
 * added to that window.
 *
 * Note: Zotero 10.0.8 passes reason 9 (MAIN_WINDOW_LOAD) here instead of 10, so the reason
 * is logged only and never used for decisions (docs/zotero-api-notes.md, runtime check R4).
 * @param {{ window: Window }} params
 * @param {number} reason
 */
function onMainWindowUnload({ window }, reason) {
  Zotero.debug(`Tabellify: onMainWindowUnload (reason ${reason})`);
  try {
    Tabellify?.onMainWindowUnload({ window });
  }
  catch (err) {
    Zotero.logError(err);
  }
}

/**
 * Called when the plugin is disabled, uninstalled, or upgraded, and when Zotero quits.
 *
 * Order matters (AC5): `Tabellify.shutdown()` closes the workspace window(s) and removes
 * per-window UI FIRST, while `chrome://tabellify/` URLs still resolve. Only then is the
 * chrome registration destroyed. Doing it the other way round would leave an open window
 * whose own URL no longer exists.
 * @param {BootstrapParams} data
 * @param {number} reason
 */
function shutdown({ version }, reason) {
  Zotero.debug(`Tabellify: shutdown (version ${version}, reason ${reason})`);

  // Each step has its own try/catch, so a failure in one still lets the later cleanup run.
  try {
    Tabellify?.shutdown();
  }
  catch (err) {
    Zotero.logError(err);
  }

  try {
    chromeHandle?.destruct();
  }
  catch (err) {
    Zotero.logError(err);
  }
  chromeHandle = null;

  // Drop our reference so the old plugin object can be garbage-collected. On re-enable,
  // `startup` loads a fresh copy of tabellify.js.
  Tabellify = undefined;
}

/**
 * Called when the plugin is removed (after `shutdown`). Nothing to clean up yet: Tabellify
 * stores no data in F001.
 * @param {BootstrapParams} data
 * @param {number} reason
 */
function uninstall(data, reason) {
  Zotero.debug(`Tabellify: uninstall (version ${data.version}, reason ${reason})`);
}
