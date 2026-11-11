// A fake Zotero environment for running the REAL src/bootstrap.js (and, through it,
// src/tabellify.js) inside Node.
//
// How it works: `node:vm` creates a separate JavaScript global scope (a "context"). We put
// mock versions of the globals Zotero gives a bootstrapped plugin (`Zotero`, `Services`,
// `Cc`, `Ci`) into that context, then run bootstrap.js in it. bootstrap.js calls
// `Services.scriptloader.loadSubScript(rootURI + "tabellify.js")`; the mock answers by
// running src/tabellify.js in the same context, just like Zotero does.
//
// Every mock method appends a short string to `log`, so tests can assert both WHAT was
// called and IN WHAT ORDER. The mocks only model the APIs listed in
// docs/zotero-api-notes.md; they never touch a real Zotero profile or data directory.
// This file is a helper, not a test: its name does not match Node's `*.test.mjs` pattern.

import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
export const ROOT_URI = pathToFileURL(SRC_DIR).href + "/";
export const PARAMS = { id: "tabellify@asmithlabs.com", version: "0.1.0", rootURI: ROOT_URI };

// Zotero's bootstrap reason codes (docs/zotero-api-notes.md, bootstrap hooks row).
export const REASON = { APP_STARTUP: 1, ADDON_ENABLE: 3, ADDON_DISABLE: 4, MAIN_WINDOW_LOAD: 9 };

/**
 * Build a fresh fake Zotero with the real plugin loaded (but not started).
 * @param {{ mainWindowCount?: number, registerMenuResult?: "ok" | false }} [options]
 */
export function createHarness({ mainWindowCount = 1, registerMenuResult = "ok" } = {}) {
  /** @type {string[]} Ordered call log. */
  const log = [];
  /** @type {unknown[]} Everything passed to Zotero.logError. */
  const errors = [];
  /** @type {string[]} Debug lines. */
  const debug = [];

  // ---- Workspace windows (what openDialog creates) ----
  /** @type {Array<{ url: string, name: string, features: string, closed: boolean, focus(): void, close(): void }>} */
  const workspaceWindows = [];
  const openWorkspaceWindows = () => workspaceWindows.filter((w) => !w.closed);

  // ---- Main windows ----
  /** @type {ReturnType<typeof makeMainWindow>[]} */
  const mainWindows = [];
  let mainCounter = 0;

  function makeMainWindow() {
    const name = `main${++mainCounter}`;
    /** @type {Array<{ rel: string, href: string, remove(): void }>} */
    const links = [];
    const win = {
      name,
      links,
      MozXULElement: {
        // Real behaviour (moz: toolkit/content/customElements.js): append
        // <link rel="localization" href=path>, skip if one is already present.
        insertFTLIfNeeded(path) {
          log.push(`${name}.insertFTLIfNeeded(${path})`);
          if (links.some((l) => l.href === path)) return;
          const link = {
            rel: "localization",
            href: path,
            remove() {
              const i = links.indexOf(link);
              if (i >= 0) links.splice(i, 1);
              log.push(`${name}.link(${path}).remove`);
            },
          };
          links.push(link);
        },
      },
      document: {
        // Supports only the selector shape the plugin uses: link[href="…"].
        querySelector(selector) {
          log.push(`${name}.querySelector(${selector})`);
          const m = /^link\[href="([^"]+)"\]$/.exec(selector);
          if (!m) throw new Error(`mock querySelector: unsupported selector ${selector}`);
          return links.find((l) => l.href === m[1]) ?? null;
        },
      },
      openDialog(url, dialogName, features) {
        log.push(`${name}.openDialog(${url}, ${dialogName}, ${features})`);
        const ws = {
          url,
          name: dialogName,
          features,
          closed: false,
          focus() { log.push("workspace.focus"); },
          close() { this.closed = true; log.push("workspace.close"); },
        };
        workspaceWindows.push(ws);
        return ws;
      },
    };
    return win;
  }
  for (let i = 0; i < mainWindowCount; i++) mainWindows.push(makeMainWindow());

  // ---- MenuManager ----
  /** @type {Map<string, any>} Currently registered menus by returned id. */
  const menus = new Map();
  let menuSeq = 0;

  // ---- Chrome registration ----
  let chromeRegistrations = 0;

  /** @type {Record<string, any>} */
  const sandbox = {
    Zotero: {
      debug(message) { debug.push(String(message)); },
      logError(err) { errors.push(err); log.push(`Zotero.logError(${err})`); },
      getMainWindows() { return [...mainWindows]; },
      getMainWindow() { return mainWindows[0] ?? null; },
      MenuManager: {
        registerMenu(options) {
          log.push(`MenuManager.registerMenu(${options.target})`);
          if (registerMenuResult === false) return false;
          // The real return value is namespaced (pluginID + "-" + menuID, CSS-escaped).
          // Add a sequence number too, so it is certainly DIFFERENT from options.menuID and
          // unique across re-enables; tests then prove the plugin stores what is returned.
          const id = `${options.pluginID}-${options.menuID}#${++menuSeq}`;
          menus.set(id, options);
          return id;
        },
        unregisterMenu(id) {
          log.push(`MenuManager.unregisterMenu(${id})`);
          return menus.delete(id);
        },
      },
    },
    Services: {
      io: { newURI(spec) { return { spec }; } },
      scriptloader: {
        loadSubScript(url) {
          log.push(`loadSubScript(${url})`);
          if (!url.startsWith(ROOT_URI)) throw new Error(`unexpected subscript URL ${url}`);
          const file = join(SRC_DIR, ...url.slice(ROOT_URI.length).split("/"));
          vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
        },
      },
      wm: {
        getMostRecentWindow(type) {
          if (type !== "tabellify:workspace") return null;
          return openWorkspaceWindows().at(-1) ?? null;
        },
        // Real nsIWindowMediator enumerators are iterable; a snapshot array models that.
        getEnumerator(type) {
          return type === "tabellify:workspace" ? openWorkspaceWindows() : [];
        },
      },
    },
    Ci: { amIAddonManagerStartup: "amIAddonManagerStartup" },
    Cc: {
      "@mozilla.org/addons/addon-manager-startup;1": {
        getService(iface) {
          if (iface !== "amIAddonManagerStartup") throw new Error(`unexpected interface ${iface}`);
          return {
            registerChrome(manifestURI, entries) {
              log.push(`registerChrome(${manifestURI.spec}, ${JSON.stringify(entries)})`);
              chromeRegistrations++;
              let destroyed = false;
              return {
                destruct() {
                  if (destroyed) throw new Error("chrome handle destructed twice");
                  destroyed = true;
                  chromeRegistrations--;
                  log.push("chromeHandle.destruct");
                },
              };
            },
          };
        },
      },
    },
  };

  const context = vm.createContext(sandbox);
  const bootstrapFile = join(SRC_DIR, "bootstrap.js");
  vm.runInContext(readFileSync(bootstrapFile, "utf8"), context, { filename: bootstrapFile });

  /** Call a bootstrap hook by name, inside the plugin's context. */
  function call(hook, ...args) {
    const fn = vm.runInContext(hook, context);
    if (typeof fn !== "function") throw new Error(`bootstrap.js does not define ${hook}()`);
    return fn(...args);
  }

  return {
    log,
    errors,
    debug,
    mainWindows,
    workspaceWindows,
    openWorkspaceWindows,
    menus,
    get chromeRegistrations() { return chromeRegistrations; },
    /** Evaluate an expression in the plugin's global scope (e.g. "typeof Tabellify"). */
    evaluate(code) { return vm.runInContext(code, context); },
    startup(reason = REASON.ADDON_ENABLE) { call("startup", { ...PARAMS }, reason); },
    shutdown(reason = REASON.ADDON_DISABLE) { call("shutdown", { ...PARAMS }, reason); },
    install() { call("install", { ...PARAMS }, 5); },
    uninstall() { call("uninstall", { ...PARAMS }, 6); },
    addMainWindow() {
      const win = makeMainWindow();
      mainWindows.push(win);
      call("onMainWindowLoad", { window: win }, REASON.MAIN_WINDOW_LOAD);
      return win;
    },
    removeMainWindow(win) {
      // Zotero 10.0.8 passes reason 9 to the unload hook too (api-notes R4).
      call("onMainWindowUnload", { window: win }, REASON.MAIN_WINDOW_LOAD);
      mainWindows.splice(mainWindows.indexOf(win), 1);
    },
    /** Simulate choosing the "Tabellify…" menu item: run the registered onCommand. */
    clickMenu() {
      const [options] = [...menus.values()];
      if (!options) throw new Error("no menu registered");
      options.menus[0].onCommand({}, {});
    },
    /** Return and clear the call log (handy for asserting one phase at a time). */
    takeLog() { return log.splice(0); },
  };
}
