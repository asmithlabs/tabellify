// AC5 [auto]: lifecycle behaviour of the REAL src/bootstrap.js + src/tabellify.js, run in a
// mocked Zotero (tests/helpers/zotero-mock.mjs). Covers:
//   - startup registers chrome, one Tools menu, and the FTL link in each main window
//   - the menu command opens one workspace window and focuses it on the second click (AC4 logic)
//   - shutdown order: workspace windows closed → menu unregistered (with the RETURNED id)
//     → FTL link removed from every main window → chromeHandle.destruct (last)
//   - onMainWindowUnload removes the link; after shutdown nothing is left; re-enable works
//   - app quit (reason 2) runs the same full cleanup; a failed tabellify.js load at startup
//     still lets shutdown destruct the chrome registration exactly once
//
// The mocks model the APIs in docs/zotero-api-notes.md, not Zotero itself. A pass here
// proves the plugin calls those APIs in the right order; the manual checklist
// (docs/testing/manual/001-plugin-shell.md) proves Zotero reacts as documented.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHarness, ROOT_URI, REASON } from "../helpers/zotero-mock.mjs";

const WORKSPACE_URL = "chrome://tabellify/content/workspace.xhtml";
const OPEN_DIALOG =
  `main1.openDialog(${WORKSPACE_URL}, tabellify-workspace, ` +
  "chrome,titlebar,centerscreen,resizable=yes,dialog=no)";

/** Index of the first log line matching `pattern` (string = exact, RegExp = test). */
function indexOf(log, pattern) {
  return log.findIndex((l) => (typeof pattern === "string" ? l === pattern : pattern.test(l)));
}

/** Index of the last log line matching `pattern`. */
function lastIndexOf(log, pattern) {
  for (let i = log.length - 1; i >= 0; i--) {
    if (typeof pattern === "string" ? log[i] === pattern : pattern.test(log[i])) return i;
  }
  return -1;
}

test("AC5: startup registers chrome, loads tabellify.js, one Tools menu, FTL in each main window", () => {
  const h = createHarness({ mainWindowCount: 2 });
  h.startup();
  const log = h.takeLog();

  assert.deepEqual(h.errors, [], "no Zotero.logError calls");
  assert.equal(
    indexOf(log, `registerChrome(${ROOT_URI}manifest.json, [["content","tabellify","content/"]])`),
    0,
    "chrome registration must come first",
  );
  assert.ok(indexOf(log, `loadSubScript(${ROOT_URI}tabellify.js)`) > 0);

  const registerCalls = log.filter((l) => l.startsWith("MenuManager.registerMenu("));
  assert.deepEqual(registerCalls, ["MenuManager.registerMenu(main/menubar/tools)"]);
  assert.equal(h.menus.size, 1, "exactly one menu registered");
  const [[menuID, options]] = h.menus;
  assert.equal(options.pluginID, "tabellify@asmithlabs.com");
  assert.equal(options.menus.length, 1);
  assert.equal(options.menus[0].menuType, "menuitem");
  assert.equal(options.menus[0].l10nID, "tabellify-menu-open");
  assert.equal(typeof options.menus[0].onCommand, "function");
  assert.equal(h.evaluate("Tabellify.menuID"), menuID, "plugin keeps the RETURNED menu id");

  for (const w of h.mainWindows) {
    assert.ok(log.includes(`${w.name}.insertFTLIfNeeded(tabellify.ftl)`), `${w.name}: FTL inserted`);
    assert.deepEqual(w.links.map((l) => l.href), ["tabellify.ftl"]);
  }
  assert.equal(h.chromeRegistrations, 1);
});

test("AC5/AC4: menu command opens one workspace window, second command focuses it", () => {
  const h = createHarness();
  h.startup();
  h.takeLog();

  h.clickMenu();
  assert.deepEqual(h.takeLog().filter((l) => /openDialog|focus/.test(l)), [OPEN_DIALOG]);

  h.clickMenu();
  assert.deepEqual(h.takeLog().filter((l) => /openDialog|focus/.test(l)), ["workspace.focus"]);

  assert.equal(h.openWorkspaceWindows().length, 1, "single instance");
  assert.deepEqual(h.errors, []);
});

test("AC5/AC4: after the workspace window is closed, the menu command opens a new one", () => {
  const h = createHarness();
  h.startup();
  h.clickMenu();
  h.workspaceWindows[0].close();
  h.takeLog();
  h.clickMenu();
  assert.deepEqual(h.takeLog().filter((l) => /openDialog|focus/.test(l)), [OPEN_DIALOG]);
  assert.equal(h.openWorkspaceWindows().length, 1);
});

test("AC5: shutdown order — windows closed, menu unregistered (returned id), FTL removed, chrome destructed last", () => {
  const h = createHarness({ mainWindowCount: 2 });
  h.startup();
  const menuID = [...h.menus.keys()][0];
  h.clickMenu();
  h.takeLog();

  h.shutdown();
  const log = h.takeLog();
  assert.deepEqual(h.errors, [], "no Zotero.logError calls");

  const closeIdx = indexOf(log, "workspace.close");
  const unregisterIdx = indexOf(log, `MenuManager.unregisterMenu(${menuID})`);
  const firstLinkRemoveIdx = indexOf(log, /^main\d+\.link\(tabellify\.ftl\)\.remove$/);
  const lastLinkRemoveIdx = lastIndexOf(log, /^main\d+\.link\(tabellify\.ftl\)\.remove$/);
  const destructIdx = indexOf(log, "chromeHandle.destruct");

  assert.ok(closeIdx >= 0, "workspace window closed");
  assert.ok(unregisterIdx >= 0, `unregisterMenu called with the returned id ${menuID}`);
  assert.ok(
    !log.includes("MenuManager.unregisterMenu(open-workspace)"),
    "must not unregister with the raw menuID",
  );
  assert.equal(
    log.filter((l) => l.endsWith(".link(tabellify.ftl).remove")).length,
    2,
    "FTL link removed from every main window",
  );
  assert.ok(closeIdx < unregisterIdx, "windows closed before menu unregistered");
  assert.ok(unregisterIdx < firstLinkRemoveIdx, "menu unregistered before FTL links removed");
  assert.ok(lastLinkRemoveIdx < destructIdx, "FTL links removed before chrome destruct");
  assert.equal(destructIdx, log.length - 1, "chromeHandle.destruct is the last call");
});

test("AC5: shutdown closes ALL open workspace windows before chromeHandle.destruct", () => {
  const h = createHarness();
  h.startup();
  // Two windows can exist only if something opened one outside openWorkspace; the plugin
  // must still close every window of its windowtype.
  h.mainWindows[0].openDialog(WORKSPACE_URL, "tabellify-workspace", "chrome");
  h.mainWindows[0].openDialog(WORKSPACE_URL, "tabellify-workspace", "chrome");
  h.takeLog();
  h.shutdown();
  const log = h.takeLog();
  const closes = log.map((l, i) => (l === "workspace.close" ? i : -1)).filter((i) => i >= 0);
  assert.equal(closes.length, 2);
  assert.ok(Math.max(...closes) < indexOf(log, "chromeHandle.destruct"));
  assert.equal(h.openWorkspaceWindows().length, 0);
});

test("AC5: after shutdown no menus, FTL links, workspace windows, chrome registration or Tabellify remain", () => {
  const h = createHarness({ mainWindowCount: 2 });
  h.startup();
  h.clickMenu();
  h.shutdown();
  assert.equal(h.menus.size, 0, "menus");
  for (const w of h.mainWindows) assert.deepEqual(w.links, [], `${w.name} links`);
  assert.equal(h.openWorkspaceWindows().length, 0, "workspace windows");
  assert.equal(h.chromeRegistrations, 0, "chrome registrations");
  assert.equal(h.evaluate("typeof Tabellify"), "undefined", "Tabellify reference dropped");
  assert.deepEqual(h.errors, []);
});

test("AC5: onMainWindowLoad/onMainWindowUnload add and remove the FTL link on a later main window", () => {
  const h = createHarness();
  h.startup();
  const w2 = h.addMainWindow();
  assert.deepEqual(w2.links.map((l) => l.href), ["tabellify.ftl"]);
  h.takeLog();

  h.removeMainWindow(w2);
  const log = h.takeLog();
  assert.ok(log.includes(`${w2.name}.querySelector(link[href="tabellify.ftl"])`));
  assert.ok(log.includes(`${w2.name}.link(tabellify.ftl).remove`));
  assert.deepEqual(w2.links, []);
  assert.deepEqual(h.mainWindows[0].links.map((l) => l.href), ["tabellify.ftl"], "other window untouched");
  assert.deepEqual(h.errors, []);
});

test("AC5: onMainWindowUnload and onMainWindowLoad after shutdown are harmless no-ops", () => {
  const h = createHarness();
  h.startup();
  h.shutdown();
  h.takeLog();
  const w2 = h.addMainWindow();
  h.removeMainWindow(h.mainWindows[0]);
  assert.deepEqual(w2.links, [], "no FTL inserted while disabled");
  assert.deepEqual(h.errors, []);
});

test("AC5: re-enable (startup after shutdown) restores everything, and a second shutdown cleans up again", () => {
  const h = createHarness();
  h.startup();
  const firstID = [...h.menus.keys()][0];
  h.clickMenu();
  h.shutdown();
  h.takeLog();

  h.startup();
  assert.equal(h.menus.size, 1, "menu re-registered");
  const secondID = [...h.menus.keys()][0];
  assert.notEqual(secondID, firstID);
  assert.equal(h.evaluate("Tabellify.menuID"), secondID);
  assert.deepEqual(h.mainWindows[0].links.map((l) => l.href), ["tabellify.ftl"]);
  assert.equal(h.chromeRegistrations, 1);

  h.clickMenu();
  assert.equal(h.openWorkspaceWindows().length, 1, "workspace opens after re-enable");

  h.takeLog();
  h.shutdown();
  const log = h.takeLog();
  assert.ok(log.includes(`MenuManager.unregisterMenu(${secondID})`));
  assert.equal(h.menus.size, 0);
  assert.deepEqual(h.mainWindows[0].links, []);
  assert.equal(h.openWorkspaceWindows().length, 0);
  assert.equal(h.chromeRegistrations, 0);
  assert.equal(log.at(-1), "chromeHandle.destruct");
  assert.deepEqual(h.errors, []);
});

test("AC5: failed menu registration (registerMenu returns false) still shuts down cleanly", () => {
  const h = createHarness({ registerMenuResult: false });
  h.startup();
  assert.equal(h.evaluate("Tabellify.menuID"), null);
  h.takeLog();
  h.shutdown();
  const log = h.takeLog();
  assert.ok(!log.some((l) => l.startsWith("MenuManager.unregisterMenu(")), "nothing to unregister");
  assert.equal(log.at(-1), "chromeHandle.destruct");
  assert.deepEqual(h.mainWindows[0].links, []);
  assert.deepEqual(h.errors, []);
});

test("AC2 (support): startup and shutdown write 'Tabellify:' debug lines", () => {
  const h = createHarness();
  h.install();
  h.startup();
  h.shutdown();
  h.uninstall();
  for (const hook of ["install", "startup", "shutdown", "uninstall"]) {
    assert.ok(
      h.debug.some((l) => l.startsWith(`Tabellify: ${hook} (`)),
      `missing "Tabellify: ${hook} (" debug line`,
    );
  }
  assert.ok(h.debug.every((l) => l.startsWith("Tabellify: ")), "all debug lines are prefixed");
  assert.deepEqual(h.errors, []);
});

test("AC5: app quit (shutdown reason 2, APP_SHUTDOWN) while enabled logs the reason and cleans up in order", () => {
  const h = createHarness({ mainWindowCount: 2 });
  h.startup(REASON.APP_STARTUP);
  const menuID = [...h.menus.keys()][0];
  h.clickMenu();
  h.takeLog();
  h.debug.length = 0;

  h.shutdown(REASON.APP_SHUTDOWN);
  const log = h.takeLog();
  assert.deepEqual(h.errors, [], "no Zotero.logError calls");
  assert.equal(h.debug[0], "Tabellify: shutdown (version 0.1.0, reason 2)");

  const closeIdx = indexOf(log, "workspace.close");
  const unregisterIdx = indexOf(log, `MenuManager.unregisterMenu(${menuID})`);
  const linkRemoves = log
    .map((l, i) => (/^main\d+\.link\(tabellify\.ftl\)\.remove$/.test(l) ? i : -1))
    .filter((i) => i >= 0);
  const destructIdx = indexOf(log, "chromeHandle.destruct");

  assert.ok(closeIdx >= 0, "workspace window closed");
  assert.ok(unregisterIdx >= 0, `unregisterMenu called with the returned id ${menuID}`);
  assert.equal(linkRemoves.length, 2, "FTL link removed from every main window");
  assert.ok(closeIdx < unregisterIdx, "windows closed before menu unregistered");
  assert.ok(unregisterIdx < Math.min(...linkRemoves), "menu unregistered before FTL links removed");
  assert.ok(Math.max(...linkRemoves) < destructIdx, "FTL links removed before chrome destruct");
  assert.equal(destructIdx, log.length - 1, "chromeHandle.destruct is the last call");
  assert.equal(log.filter((l) => l === "chromeHandle.destruct").length, 1);
  assert.equal(h.menus.size, 0);
  assert.equal(h.chromeRegistrations, 0);
});

test("AC5: tabellify.js failing to load at startup — shutdown still destructs chrome exactly once", () => {
  const loadError = new Error("simulated tabellify.js load failure");
  const h = createHarness({ loadSubScriptError: loadError });
  h.startup();
  assert.deepEqual(h.errors, [loadError], "the failed load is reported once via Zotero.logError");
  assert.equal(h.evaluate("typeof Tabellify"), "undefined", "Tabellify was never defined");
  assert.equal(h.menus.size, 0, "no menu registered");
  assert.equal(h.chromeRegistrations, 1, "chrome was registered before the failed load");
  h.takeLog();

  assert.doesNotThrow(() => h.shutdown(), "shutdown must not throw");
  const log = h.takeLog();
  assert.deepEqual(log, ["chromeHandle.destruct"], "only the chrome registration is undone");
  assert.equal(h.chromeRegistrations, 0);
  assert.deepEqual(h.errors, [loadError], "no further errors logged during shutdown");
  assert.ok(h.debug.includes("Tabellify: shutdown (version 0.1.0, reason 4)"));
});
