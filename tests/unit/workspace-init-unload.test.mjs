// SEC-012: the workspace's start-up (init) waits for several Promises. If the tab is closed
// during one of those waits, onUnload runs first; init must then stop and must NOT register
// the Zotero.Notifier observer afterwards (nothing would ever unregister it).
//
// workspace.js runs here in a node:vm sandbox with a fake Zotero (only what init and
// onUnload touch) and a permissive fake document: every element accepts any method call.
// `window` is defined only after the script is loaded, so the script does not start itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const contentDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content");

/** An object on which any property is a no-op function returning undefined. */
function anything() {
  const target = {};
  return new Proxy(target, {
    get: (t, key) => {
      if (key in t) return t[key];
      if (key === "then") return undefined; // not a Promise
      return () => undefined;
    },
    set: (t, key, value) => { t[key] = value; return true; },
  });
}

/**
 * Load workspace.js with fakes. `gate` is the Promise init() waits on first
 * (Zotero.initializationPromise).
 */
function setup(gate) {
  const calls = { register: 0, unregister: 0, collections: 0, types: null };
  const elements = new Map();
  const document = {
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, anything());
      return elements.get(id);
    },
    querySelectorAll: () => [],
    // F003b: the dropdown's <optgroup> headings.
    createElementNS: () => anything(),
    l10n: { formatValue: async () => "", formatValues: async (ids) => ids.map(() => "") },
    defaultView: {},
  };
  const Zotero = {
    initializationPromise: gate,
    debug: () => {},
    logError: () => {},
    Prefs: { get: () => false },
    // F003b: My Library and one group library (docs/zotero-api-notes.md, F003b rows).
    Libraries: { userLibraryID: 1, get: (id) => (id === 1 ? { libraryID: 1, libraryType: "user", name: "My Library" } : false) },
    Groups: { getAll: () => [{ libraryID: 5, libraryType: "group", name: "G" }] },
    Collections: {
      getByLibrary: (libraryID) => {
        calls.collections++;
        return [{ id: libraryID * 10, key: "AAAA", libraryID, name: "C", level: 0 }];
      },
    },
    Notifier: {
      registerObserver: (_ref, types) => { calls.register++; calls.types = types; return "key-1"; },
      unregisterObserver: () => { calls.unregister++; },
    },
  };
  const errors = [];
  Zotero.logError = (e) => errors.push(e);
  // `new Option(label, value)` fills the collection dropdown.
  const Option = function Option(text, value) { this.text = text; this.value = value; };
  const sandbox = vm.createContext({ Zotero, document, Option });
  for (const name of ["codebook-model.js", "tag-monitor-model.js", "table-layout-model.js", "workspace.js"]) {
    const file = join(contentDir, name);
    vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
  }
  sandbox.window = { removeEventListener: () => {}, clearTimeout: () => {}, setTimeout: () => 0 };
  const W = sandbox.TabellifyWorkspace;
  // Only the parts under test: rendering and the other start-ups are not modelled.
  W.formatStrings = async () => {};
  W.renderMonitor = () => {};
  W.renderSavedList = () => {};
  W.layoutLoading = Promise.resolve();
  return { W, calls, errors };
}

test("SEC-012: closing the tab while init() waits registers no Notifier observer", async () => {
  let release;
  const { W, calls } = setup(new Promise((resolve) => { release = resolve; }));
  const started = W.init();
  W.onUnload(); // the tab closes while init() waits for Zotero.initializationPromise
  release();
  await started;
  assert.equal(W.unloaded, true);
  assert.equal(calls.register, 0, "no observer may be registered after onUnload");
  assert.equal(W.notifierKey, null);
  assert.equal(calls.collections, 0, "init stopped before reading collections");
});

test("SEC-012: closing during a later await (layout loading) also registers nothing", async () => {
  let release;
  const { W, calls } = setup(Promise.resolve());
  W.layoutLoading = new Promise((resolve) => { release = resolve; });
  const started = W.init();
  await new Promise((r) => setImmediate(r)); // let init reach `await this.layoutLoading`
  W.onUnload();
  release();
  await started;
  assert.equal(calls.register, 0);
  assert.equal(W.notifierKey, null);
});

test("SEC-012: registerMonitorObserver() refuses once unloaded", () => {
  const { W, calls } = setup(Promise.resolve());
  W.unloaded = true;
  W.registerMonitorObserver();
  assert.equal(calls.register, 0);
  assert.equal(W.notifierKey, null);
});

test("SEC-012: control: without a close, init() registers the observer once", async () => {
  const { W, calls, errors } = setup(Promise.resolve());
  await W.init();
  assert.deepEqual(errors.map(String), [], "init ran without errors");
  assert.equal(calls.register, 1, "the fake is complete enough to reach registration");
  assert.equal(W.notifierKey, "key-1");
  // F003b: the observer also listens for group libraries; both libraries were listed.
  assert.deepEqual([...calls.types], ["item-tag", "collection-item", "item", "collection", "group"]);
  assert.equal(calls.collections, 2);
  assert.deepEqual([...W.collectionKeys.values()], ["1/AAAA", "5/AAAA"]);
  assert.deepEqual([...W.listedLibraryIDs], [1, 5]);
  W.onUnload();
  assert.equal(calls.unregister, 1, "onUnload removes it (symmetry)");
});
