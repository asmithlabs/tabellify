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
//
// Strictness: main windows, their documents, the fake `Zotero_Tabs`, and DOM elements are
// wrapped in `strict()` (a JavaScript Proxy: an object that intercepts property access).
// Reading or setting a property the mock does not model THROWS, so plugin code that starts
// using an unmodelled API (e.g. `Zotero_Tabs.getState`) fails loudly instead of silently
// getting `undefined`.
//
// Feature 002 additions:
//   - `Services.obs` (addObserver / removeObserver) plus `harness.notify(topic)` to fire a
//     topic. Observers are notified newest first, like Mozilla's nsObserverList
//     (`ReverseCloneObserverArray`, api-notes "Services.obs" row).
//   - A built-in "Zotero session" observer for "quit-application-granted", registered before
//     the plugin starts (as Zotero's own is). It records the tab types of every main window
//     in `harness.savedSession`, modelling `Zotero.Session.save()` at quit.
//   - An optional fake `Zotero_Tabs` per main window (option `tabs`), modelling only the
//     source/runtime-verified behaviour in api-notes (`add`, `select`, `close`, `getTabInfo`).
//   - `document.createElementNS` (XHTML iframe only) and `document.l10n.formatValue`.

import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
export const ROOT_URI = pathToFileURL(SRC_DIR).href + "/";
export const PARAMS = { id: "tabellify@asmithlabs.com", version: "0.1.0", rootURI: ROOT_URI };
export const XHTML_NS = "http://www.w3.org/1999/xhtml";
export const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

// Zotero's bootstrap reason codes (docs/zotero-api-notes.md, bootstrap hooks row).
export const REASON = { APP_STARTUP: 1, APP_SHUTDOWN: 2, ADDON_ENABLE: 3, ADDON_DISABLE: 4, MAIN_WINDOW_LOAD: 9 };

/** The four Zotero_Tabs methods Tabellify may use (ADR-0009 §1). */
export const TABS_METHODS = ["add", "select", "close", "getTabInfo"];

/**
 * Simple `id = value` messages of src/locale/en-US/tabellify.ftl (attribute-only messages
 * such as `tabellify-menu-open` have no value and are left out).
 * @returns {Map<string, string>}
 */
function readFtlValues() {
  const text = readFileSync(join(SRC_DIR, "locale", "en-US", "tabellify.ftl"), "utf8");
  const values = new Map();
  for (const line of text.split("\n")) {
    const m = /^([A-Za-z][\w-]*)\s*=\s*(\S.*)$/.exec(line);
    if (m) values.set(m[1], m[2].trim());
  }
  return values;
}

/**
 * Wrap `target` so that reading or writing any property it does not have throws.
 * `absent` lists names that read as `undefined` instead (models a member that really is
 * missing, e.g. a Zotero_Tabs method removed in some Zotero version).
 * Symbols and `then` read normally (Node's inspector and `await` probe them).
 */
function strict(target, label, absent = []) {
  return new Proxy(target, {
    get(t, key, receiver) {
      if (typeof key === "symbol" || key in t) return Reflect.get(t, key, receiver);
      if (key === "then" || absent.includes(key)) return undefined;
      throw new Error(`mock: ${label}.${String(key)} is not modelled`);
    },
    set(t, key, value) {
      if (typeof key !== "symbol" && !(key in t)) {
        throw new Error(`mock: setting ${label}.${String(key)} is not modelled`);
      }
      t[key] = value;
      return true;
    },
  });
}

/**
 * @typedef {object} TabsOptions
 * @property {string[]} [missing]  Zotero_Tabs methods to leave out (read as undefined)
 * @property {"ok" | "throw" | "noTab" | "noContainer"} [add]
 *   "throw": add throws; "noTab": add returns undefined; "noContainer": add returns {id} only
 */

/**
 * @typedef {object} WindowOptions
 * @property {boolean | TabsOptions} [tabs]  false (default): no `Zotero_Tabs` global
 * @property {"ftl" | "reject" | "missing"} [l10n]
 *   "ftl" (default): formatValue answers from tabellify.ftl if the window links it;
 *   "reject": formatValue rejects; "missing": formatValue resolves undefined
 * @property {Record<string, string>} [l10nMessages]  Override values for formatValue
 */

/**
 * Build a fresh fake Zotero with the real plugin loaded (but not started).
 * @param {{ mainWindowCount?: number, registerMenuResult?: "ok" | false,
 *           loadSubScriptError?: Error } & WindowOptions} [options]
 *   loadSubScriptError: if set, loadSubScript throws this instead of running the file
 *   (simulates tabellify.js failing to load, e.g. a syntax error).
 *   tabs / l10n / l10nMessages: applied to every main window created at the start.
 */
export function createHarness({
  mainWindowCount = 1,
  registerMenuResult = "ok",
  loadSubScriptError,
  tabs = false,
  l10n = "ftl",
  l10nMessages = {},
} = {}) {
  /** @type {string[]} Ordered call log. */
  const log = [];
  /** @type {unknown[]} Everything passed to Zotero.logError. */
  const errors = [];
  /** @type {string[]} Debug lines. */
  const debug = [];
  const ftlValues = readFtlValues();

  // ---- Workspace windows (what openDialog creates) ----
  /** @type {Array<{ url: string, name: string, features: string, closed: boolean, focus(): void, close(): void }>} */
  const workspaceWindows = [];
  const openWorkspaceWindows = () => workspaceWindows.filter((w) => !w.closed);

  // ---- Main windows ----
  /** @type {any[]} */
  const mainWindows = [];
  let mainCounter = 0;
  /** Callbacks waiting for `runTimers()` (models setTimeout in Zotero_Tabs.close). */
  const timers = [];

  /**
   * A fake DOM element. Only what the plugin uses: attributes, append, remove, parent.
   * @param {string} localName
   * @param {string} namespaceURI
   * @param {string} label  Prefix for log lines
   */
  function makeElement(localName, namespaceURI, label) {
    const attributes = new Map();
    /** @type {any} */
    const el = {
      localName,
      namespaceURI,
      id: "",
      /** @type {any} */
      parentElement: null,
      /** @type {any[]} */
      children: [],
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
      append(...nodes) {
        for (const node of nodes) {
          node.parentElement?.children.splice(node.parentElement.children.indexOf(node), 1);
          node.parentElement = proxy;
          el.children.push(node);
        }
        log.push(`${label}.append(${nodes.map(describe).join(", ")})`);
      },
      remove() {
        const parent = el.parentElement;
        if (parent) parent.children.splice(parent.children.indexOf(proxy), 1);
        el.parentElement = null;
        log.push(`${label}.remove`);
      },
    };
    const proxy = strict(el, label);
    return proxy;
  }
  /** Short description of an element for the log, e.g. `iframe src=chrome://…`. */
  function describe(node) {
    const src = node.getAttribute("src");
    return src ? `${node.localName} src=${src}` : node.localName;
  }

  /**
   * Fake `Zotero_Tabs` for one main window. Models only what api-notes records as
   * verified (source 10.0.9 + owner runs RT1/RT2):
   *   - add({type, title, data, select, onClose}) → { id, container }; the container is a
   *     `tab-content` element appended to `#tabs-deck`, with `container.id = id`; after
   *     adding, Zotero's `_update()` reads `tab.data.icon` for every non-library tab (so a
   *     missing `data` throws a TypeError, as in Zotero).
   *   - select(id): dereferences the tab without a guard, so an unknown id throws.
   *   - close(ids): string or array; throws for "zotero-pane"; removes the tab from the list
   *     immediately, calls its onClose, and removes the container LATER (setTimeout in
   *     Zotero; `harness.runTimers()` here). An id that is not open is skipped.
   *   - getTabInfo(id): a copy of the tab, or `{}` for an unknown id (RT1).
   * @param {string} name  Window name, for log lines
   * @param {TabsOptions} options
   */
  function makeTabs(name, { missing = [], add: addMode = "ok" } = {}) {
    for (const m of missing) {
      if (!TABS_METHODS.includes(m)) throw new Error(`mock: unknown Zotero_Tabs method ${m}`);
    }
    const deck = makeElement("deck", XUL_NS, `${name}.tabs-deck`);
    deck.id = "tabs-deck";
    /** Test-side view of the tab manager (NOT what the plugin sees). */
    const state = {
      deck,
      /** @type {Array<{ id: string, type: string, title: string, data: any, onClose?: () => void, container?: any }>} */
      tabs: [{ id: "zotero-pane", type: "library", title: "My Library", data: {} }],
      selectedID: "zotero-pane",
      /** Every options object passed to add, as given. */
      addCalls: [],
      types() { return state.tabs.map((t) => t.type); },
      byType(type) { return state.tabs.filter((t) => t.type === type); },
      /** The user closes a tab (× button, Cmd-W, context menu): Zotero calls close(id). */
      userClose(id) { api.close(id); },
      /** Defensive scenario: the tab vanishes WITHOUT onClose (not a known Zotero path). */
      dropSilently(id) {
        const i = state.tabs.findIndex((t) => t.id === id);
        if (i >= 0) state.tabs.splice(i, 1);
      },
    };
    let seq = 0;

    const api = {
      add(options) {
        log.push(`${name}.Zotero_Tabs.add(type=${options?.type}, select=${options?.select})`);
        state.addCalls.push(options);
        if (addMode === "throw") throw new Error("simulated Zotero_Tabs.add failure");
        if (addMode === "noTab") return undefined;
        const { type, title, data, select, onClose } = options;
        const id = `${name}-tab${++seq}`;
        const container = makeElement("tab-content", XUL_NS, `${name}.tab(${id})`);
        container.id = id;
        deck.append(container);
        state.tabs.push({ id, type, title, data, onClose, container });
        if (select) state.selectedID = id;
        // Model of Zotero's _update(): reads data.icon for every non-library tab.
        for (const t of state.tabs) if (t.type !== "library") void t.data.icon;
        return addMode === "noContainer" ? { id } : { id, container };
      },
      select(id) {
        log.push(`${name}.Zotero_Tabs.select(${id})`);
        const tab = state.tabs.find((t) => t.id === id);
        // Zotero dereferences the found tab without a guard.
        if (!tab) throw new TypeError(`can't access property "id", tab is undefined (${id})`);
        state.selectedID = tab.id;
      },
      close(ids) {
        log.push(`${name}.Zotero_Tabs.close(${ids})`);
        const list = Array.isArray(ids) ? ids : [ids];
        if (list.includes("zotero-pane")) throw new Error("Library tab cannot be closed");
        for (const id of list) {
          const i = state.tabs.findIndex((t) => t.id === id);
          if (i < 0) continue;
          const [tab] = state.tabs.splice(i, 1);
          if (state.selectedID === id) state.selectedID = state.tabs[Math.max(0, i - 1)].id;
          if (tab.onClose) tab.onClose();
          if (tab.container) timers.push(() => tab.container.remove());
        }
      },
      getTabInfo(id) {
        log.push(`${name}.Zotero_Tabs.getTabInfo(${id})`);
        const tab = state.tabs.find((t) => t.id === id);
        if (!tab) return {};
        const { container, ...copy } = tab;
        return { ...copy };
      },
    };
    for (const m of missing) delete api[m];
    return { api: strict(api, `${name}.Zotero_Tabs`, missing), state };
  }

  /** @param {WindowOptions} [options] */
  function makeMainWindow(options = {}) {
    const {
      tabs: tabsOption = tabs,
      l10n: l10nMode = l10n,
      l10nMessages: messages = l10nMessages,
    } = options;
    const name = `main${++mainCounter}`;
    /** @type {Array<{ rel: string, href: string, remove(): void }>} */
    const links = [];

    /** A fake <link rel="localization" href=path> element living in `links`. */
    function makeLink(path) {
      const link = {
        rel: "localization",
        href: path,
        // Real Element.remove(): detach from the document; a no-op if already detached.
        remove() {
          const i = links.indexOf(link);
          if (i >= 0) links.splice(i, 1);
          log.push(`${name}.link(${path}).remove`);
        },
      };
      return link;
    }

    /** Parse the only selector shape the plugin uses: link[href="…"]. Throw on anything else. */
    function hrefFromSelector(method, selector) {
      const m = /^link\[href="([^"]+)"\]$/.exec(selector);
      if (!m) throw new Error(`mock ${method}: unsupported selector ${selector}`);
      return m[1];
    }

    /**
     * Model of a STATIC NodeList (what querySelectorAll returns): a snapshot taken at call
     * time, so removing elements while looping over it does not skip any. Like a real
     * NodeList it has length, item(), forEach() and is iterable, but it is NOT an Array:
     * no map/filter/etc., so plugin code that relies on Array methods fails here too.
     */
    function makeStaticNodeList(elements) {
      const snapshot = [...elements];
      const list = {
        length: snapshot.length,
        item(i) { return snapshot[i] ?? null; },
        forEach(callback, thisArg) {
          for (let i = 0; i < snapshot.length; i++) callback.call(thisArg, snapshot[i], i, list);
        },
        [Symbol.iterator]() { return snapshot[Symbol.iterator](); },
      };
      snapshot.forEach((el, i) => { list[i] = el; });
      return Object.freeze(list);
    }

    const tabsFake = tabsOption ? makeTabs(name, tabsOption === true ? {} : tabsOption) : null;

    /**
     * Fluent in the main window. Real DOMLocalization only knows messages from linked .ftl
     * files, so by default the value is found only while `tabellify.ftl` is linked. What a
     * real `formatValue` returns for a message it cannot find is UNVERIFIED; the plugin
     * treats any falsy value as "not found", and the mock resolves `undefined`.
     */
    const l10nObject = strict({
      formatValue(id) {
        log.push(`${name}.l10n.formatValue(${id})`);
        if (l10nMode === "reject") return Promise.reject(new Error("simulated formatValue failure"));
        if (l10nMode === "missing") return Promise.resolve(undefined);
        if (id in messages) return Promise.resolve(messages[id]);
        const linked = links.some((l) => l.href === "tabellify.ftl");
        return Promise.resolve(linked ? ftlValues.get(id) : undefined);
      },
    }, `${name}.document.l10n`);

    const document = strict({
      l10n: l10nObject,
      // Both support only the selector shape the plugin uses: link[href="…"].
      querySelector(selector) {
        log.push(`${name}.querySelector(${selector})`);
        const href = hrefFromSelector("querySelector", selector);
        return links.find((l) => l.href === href) ?? null;
      },
      querySelectorAll(selector) {
        log.push(`${name}.querySelectorAll(${selector})`);
        const href = hrefFromSelector("querySelectorAll", selector);
        return makeStaticNodeList(links.filter((l) => l.href === href));
      },
      createElementNS(namespace, tag) {
        // Only what Feature 002 uses: an HTML <iframe>.
        if (namespace !== XHTML_NS || tag !== "iframe") {
          throw new Error(`mock createElementNS: ${namespace} ${tag} is not modelled`);
        }
        log.push(`${name}.createElementNS(iframe)`);
        return makeElement("iframe", XHTML_NS, `${name}.iframe`);
      },
    }, `${name}.document`);

    const win = strict({
      name,
      links,
      /** Test-side view of this window's tab manager, or null if it has no Zotero_Tabs. */
      tabState: tabsFake?.state ?? null,
      // What the plugin sees. `undefined` models a window without the Zotero_Tabs global.
      Zotero_Tabs: tabsFake?.api,
      /**
       * Test-only: append a link WITHOUT the insertFTLIfNeeded duplicate check. Simulates the
       * duplicate <link> a remove-then-reinstall in one Zotero session can leave behind.
       */
      injectLink(path) {
        log.push(`${name}.injectLink(${path})`);
        links.push(makeLink(path));
      },
      MozXULElement: {
        // Real behaviour (moz: toolkit/content/customElements.js): append
        // <link rel="localization" href=path>, skip if one is already present.
        insertFTLIfNeeded(path) {
          log.push(`${name}.insertFTLIfNeeded(${path})`);
          if (links.some((l) => l.href === path)) return;
          links.push(makeLink(path));
        },
      },
      document,
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
    }, name);
    return win;
  }
  for (let i = 0; i < mainWindowCount; i++) mainWindows.push(makeMainWindow());

  // ---- Observer service ----
  /** @type {Array<{ observer: any, topic: string, owner: "zotero" | "plugin" }>} */
  const observers = [];
  /** Tab types per main window at the moment "Zotero" saved its session (null = not yet). */
  let savedSession = null;
  // Zotero's own quit handler (src10: xpcom/zotero.js: quit-application-granted →
  // Zotero.Session.save()). Registered before the plugin starts, as in Zotero.
  observers.push({
    owner: "zotero",
    topic: "quit-application-granted",
    observer: {
      observe() {
        log.push("Zotero.Session.save");
        savedSession = mainWindows.map((w) => (w.tabState ? w.tabState.types() : []));
      },
    },
  });

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
          if (loadSubScriptError) throw loadSubScriptError;
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
      // nsIObserverService (api-notes "Services.obs" row). Only add/remove are modelled.
      obs: strict({
        addObserver(observer, topic) {
          log.push(`Services.obs.addObserver(${topic})`);
          if (typeof observer?.observe !== "function" && typeof observer !== "function") {
            throw new TypeError("mock addObserver: observer must have observe() or be a function");
          }
          observers.push({ observer, topic, owner: "plugin" });
        },
        removeObserver(observer, topic) {
          log.push(`Services.obs.removeObserver(${topic})`);
          const i = observers.findIndex((o) => o.observer === observer && o.topic === topic);
          // nsObserverList::RemoveObserver returns NS_ERROR_FAILURE for an unknown observer,
          // which XPConnect turns into an exception.
          if (i < 0) throw new Error("NS_ERROR_FAILURE: observer not registered for " + topic);
          observers.splice(i, 1);
        },
      }, "Services.obs"),
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
    /** Every registered observer (Zotero's own first, then the plugin's). */
    observers,
    /** Observers the plugin registered for `topic`. */
    pluginObservers(topic) {
      return observers.filter((o) => o.owner === "plugin" && (!topic || o.topic === topic));
    },
    /** Tab types per main window when the fake Zotero saved its session, or null. */
    get savedSession() { return savedSession; },
    get chromeRegistrations() { return chromeRegistrations; },
    /** Evaluate an expression in the plugin's global scope (e.g. "typeof Tabellify"). */
    evaluate(code) { return vm.runInContext(code, context); },
    startup(reason = REASON.ADDON_ENABLE) { call("startup", { ...PARAMS }, reason); },
    shutdown(reason = REASON.ADDON_DISABLE) { call("shutdown", { ...PARAMS }, reason); },
    install() { call("install", { ...PARAMS }, 5); },
    uninstall() { call("uninstall", { ...PARAMS }, 6); },
    /** @param {WindowOptions} [options] */
    addMainWindow(options) {
      const win = makeMainWindow(options);
      mainWindows.push(win);
      call("onMainWindowLoad", { window: win }, REASON.MAIN_WINDOW_LOAD);
      return win;
    },
    removeMainWindow(win) {
      // Zotero 10.0.8 passes reason 9 to the unload hook too (api-notes R4).
      call("onMainWindowUnload", { window: win }, REASON.MAIN_WINDOW_LOAD);
      mainWindows.splice(mainWindows.indexOf(win), 1);
    },
    /**
     * Simulate choosing the "Tabellify…" menu item: run the registered onCommand.
     * Returns whatever onCommand returns (the openWorkspace Promise), so tests can await it.
     * @param {any} [event]  e.g. `{ target: { ownerGlobal: win } }`; default `{}`
     */
    clickMenu(event = {}) {
      const [options] = [...menus.values()];
      if (!options) throw new Error("no menu registered");
      return options.menus[0].onCommand(event, {});
    },
    /** Call Tabellify.openWorkspace(win) directly. Returns its Promise. */
    openWorkspace(win) { return vm.runInContext("Tabellify", context).openWorkspace(win); },
    /**
     * Fire an observer topic to every registered observer, newest first (Mozilla order).
     * The list is copied first, as nsObserverList does.
     */
    notify(topic, subject = null, data = null) {
      for (const { observer } of observers.filter((o) => o.topic === topic).reverse()) {
        if (typeof observer === "function") observer(subject, topic, data);
        else observer.observe(subject, topic, data);
      }
    },
    /** Run pending timer callbacks (Zotero_Tabs.close removes containers in a setTimeout). */
    runTimers() { for (const fn of timers.splice(0)) fn(); },
    /** Return and clear the call log (handy for asserting one phase at a time). */
    takeLog() { return log.splice(0); },
  };
}
