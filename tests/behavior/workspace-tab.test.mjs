// Feature 002 [auto]: the workspace as a main-window tab (docs/features/002-workspace-tab.md).
//
// Runs the REAL src/bootstrap.js + src/tabellify.js in the mocked Zotero
// (tests/helpers/zotero-mock.mjs) with a fake `Zotero_Tabs` per main window. The fake models
// only the behaviour api-notes records as verified: `add` returns {id, container} with the
// container under #tabs-deck; `close` removes the tab at once, calls onClose, and removes the
// container later; `getTabInfo` of an unknown id returns {}; `select` of an unknown id throws.
//
// Covers AC1, AC2, AC4, AC5, AC6, AC7, AC8, AC9, AC11, the tab-title fallback, the RT4 debug
// line, and the double-click race. A pass proves the plugin calls Zotero's tab API in the
// right shape and order. Whether Zotero really behaves like the fake (and whether our quit
// observer runs before Zotero saves its session) is checked by the owner in
// docs/testing/manual/002-workspace-tab.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHarness, REASON, XHTML_NS } from "../helpers/zotero-mock.mjs";

const WORKSPACE_URL = "chrome://tabellify/content/workspace.xhtml";
const QUIT = "quit-application-granted";

/** Index of the first log line matching `pattern` (string = exact, RegExp = test). */
function indexOf(log, pattern) {
  return log.findIndex((l) => (typeof pattern === "string" ? l === pattern : pattern.test(l)));
}

/** Harness with Zotero_Tabs in every main window, started. */
function started(options = {}) {
  const h = createHarness({ tabs: true, ...options });
  h.startup();
  return h;
}

/** The plugin's stored tab id for a window (reads Tabellify.tabIDs). */
function storedID(h, win) {
  const T = h.evaluate("Tabellify");
  return T.tabIDs.get(win);
}

const isAdd = (l) => /\.Zotero_Tabs\.add\(/.test(l);
const isOpenDialog = (l) => /\.openDialog\(/.test(l);

// ---------------------------------------------------------------------------------- AC1, AC11

test("F002 AC1/AC11: menu command adds ONE tab with the required shape, no openDialog", async () => {
  const h = started();
  const [w] = h.mainWindows;
  h.takeLog();

  await h.clickMenu();
  const log = h.takeLog();

  assert.deepEqual(h.errors, [], "no Zotero.logError calls");
  assert.equal(log.filter(isAdd).length, 1, "add called once");
  assert.equal(log.filter(isOpenDialog).length, 0, "no separate window");
  assert.equal(h.openWorkspaceWindows().length, 0);

  const [options] = w.tabState.addCalls;
  assert.equal(options.type, "tabellify", "AC11: type is exactly \"tabellify\"");
  assert.ok(!options.type.includes("-"), "AC11: no hyphen in the type");
  assert.equal(typeof options.data, "object", "AC11: data is an object");
  assert.ok(options.data !== null && !Array.isArray(options.data), "AC11: data is a plain object");
  assert.equal(options.select, true);
  assert.equal(typeof options.onClose, "function");
  assert.equal(options.title, "Tabellify", "title from tabellify-tab-title");
  assert.ok(log.includes("main1.l10n.formatValue(tabellify-tab-title)"), "title asked from Fluent");

  // The tab exists, is selected, and holds exactly one iframe with the workspace URL.
  const tabs = w.tabState.byType("tabellify");
  assert.equal(tabs.length, 1);
  assert.equal(w.tabState.selectedID, tabs[0].id);
  assert.equal(storedID(h, w), tabs[0].id, "plugin stored the returned id");
  const { container } = tabs[0];
  assert.equal(container.parentElement.id, "tabs-deck");
  assert.equal(container.children.length, 1);
  const [iframe] = container.children;
  assert.equal(iframe.localName, "iframe");
  assert.equal(iframe.namespaceURI, XHTML_NS);
  assert.equal(iframe.getAttribute("src"), WORKSPACE_URL);
  assert.ok(log.includes(`main1.tab(${tabs[0].id}).append(iframe src=${WORKSPACE_URL})`));
  assert.ok(h.debug.includes(`Tabellify: workspace tab opened (${tabs[0].id})`), h.debug.join("\n"));
});

test("F002 AC1: the tab title is whatever Fluent returns for tabellify-tab-title", async () => {
  const h = started({ l10nMessages: { "tabellify-tab-title": "Tabellify (test locale)" } });
  await h.clickMenu();
  assert.equal(h.mainWindows[0].tabState.addCalls[0].title, "Tabellify (test locale)");
  assert.deepEqual(h.errors, []);
});

test("F002 AC1: title falls back to \"Tabellify\" when formatValue rejects", async () => {
  const h = started({ l10n: "reject", l10nMessages: {} });
  await h.clickMenu();
  const [w] = h.mainWindows;
  assert.equal(w.tabState.addCalls.length, 1, "the tab still opens");
  assert.equal(w.tabState.addCalls[0].title, "Tabellify");
  assert.equal(h.errors.length, 1, "the rejection is logged once");
  assert.match(String(h.errors[0]), /simulated formatValue failure/);
  assert.equal(w.tabState.byType("tabellify").length, 1);
});

test("F002 AC1: title falls back to \"Tabellify\" when Fluent has no value", async () => {
  const h = started({ l10n: "missing" });
  await h.clickMenu();
  assert.equal(h.mainWindows[0].tabState.addCalls[0].title, "Tabellify");
  assert.ok(h.debug.includes("Tabellify: tab title not found in Fluent; using fallback"));
  assert.deepEqual(h.errors, []);
});

// --------------------------------------------------------------------------------------- AC2

test("F002 AC2: second command selects the existing tab, no second add", async () => {
  const h = started();
  const [w] = h.mainWindows;
  await h.clickMenu();
  const id = w.tabState.byType("tabellify")[0].id;
  // The user switches back to the library tab.
  w.tabState.selectedID = "zotero-pane";
  h.takeLog();

  await h.clickMenu();
  const log = h.takeLog();
  assert.equal(log.filter(isAdd).length, 0, "no second add");
  assert.deepEqual(log.filter((l) => l.includes(".Zotero_Tabs.select(")), [`main1.Zotero_Tabs.select(${id})`]);
  assert.equal(w.tabState.selectedID, id);
  assert.equal(w.tabState.byType("tabellify").length, 1, "still one Tabellify tab");
  assert.ok(h.debug.includes(`Tabellify: workspace tab already open; selected it (${id})`));
  assert.deepEqual(h.errors, []);
});

test("F002 AC2/AC4: after Zotero fires onClose, the next command adds a new tab", async () => {
  const h = started();
  const [w] = h.mainWindows;
  await h.clickMenu();
  const first = w.tabState.byType("tabellify")[0].id;
  w.tabState.userClose(first);
  h.takeLog();

  await h.clickMenu();
  const log = h.takeLog();
  assert.equal(log.filter(isAdd).length, 1, "add called again");
  assert.ok(!log.some((l) => l.includes(".Zotero_Tabs.select(")), "nothing to select");
  const second = w.tabState.byType("tabellify")[0].id;
  assert.notEqual(second, first);
  assert.equal(storedID(h, w), second);
  assert.deepEqual(h.errors, []);
});

test("F002 AC2: double-click race (two commands before the title resolves) gives ONE tab", async () => {
  const h = started();
  const [w] = h.mainWindows;
  const p1 = h.clickMenu();
  const p2 = h.clickMenu();
  await Promise.all([p1, p2]);
  assert.equal(w.tabState.addCalls.length, 1, "add called once");
  assert.equal(w.tabState.byType("tabellify").length, 1);
  assert.equal(h.log.filter((l) => l.includes(".Zotero_Tabs.select(")).length, 1, "second click selects");
  assert.deepEqual(h.errors, []);
});

test("F002 AC2 (defensive): a stale stored id (tab gone without onClose) is dropped and a new tab added", async () => {
  const h = started();
  const [w] = h.mainWindows;
  await h.clickMenu();
  const first = w.tabState.byType("tabellify")[0].id;
  w.tabState.dropSilently(first);
  h.takeLog();

  await h.clickMenu();
  const log = h.takeLog();
  assert.ok(!log.some((l) => l.includes(".Zotero_Tabs.select(")), "never select an unknown id");
  assert.equal(log.filter(isAdd).length, 1);
  assert.deepEqual(h.errors, []);
});

// --------------------------------------------------------------------------------------- AC4

test("F002 AC4: closing the tab in Zotero clears the stored id via onClose", async () => {
  const h = started();
  const [w] = h.mainWindows;
  await h.clickMenu();
  const id = w.tabState.byType("tabellify")[0].id;
  assert.equal(storedID(h, w), id);

  w.tabState.userClose(id);
  assert.equal(storedID(h, w), undefined, "stored id cleared");
  assert.ok(h.debug.includes(`Tabellify: workspace tab closed (${id})`));
  assert.deepEqual(w.tabState.types(), ["library"]);
  h.runTimers();
  assert.equal(w.tabState.deck.children.length, 0, "container removed later by Zotero");

  // Shutdown afterwards has no tab to close and does not touch Zotero's tabs.
  h.takeLog();
  h.shutdown();
  assert.ok(!h.takeLog().some((l) => l.includes(".Zotero_Tabs.close(")));
  assert.deepEqual(h.errors, []);
});

// --------------------------------------------------------------------------------------- AC5

test("F002 AC5: shutdown closes every Tabellify tab in every main window before destruct, removes the observer, clears ids", async () => {
  const h = started({ mainWindowCount: 2 });
  const [w1, w2] = h.mainWindows;
  await h.clickMenu({ target: { ownerGlobal: w1 } });
  await h.clickMenu({ target: { ownerGlobal: w2 } });
  const id1 = w1.tabState.byType("tabellify")[0].id;
  const id2 = w2.tabState.byType("tabellify")[0].id;
  const T = h.evaluate("Tabellify");
  assert.equal(T.tabIDs.size, 2);
  const menuID = [...h.menus.keys()][0];
  h.takeLog();

  h.shutdown();
  const log = h.takeLog();
  assert.deepEqual(h.errors, [], "no Zotero.logError calls");

  const close1 = indexOf(log, `main1.Zotero_Tabs.close(${id1})`);
  const close2 = indexOf(log, `main2.Zotero_Tabs.close(${id2})`);
  const removeObs = indexOf(log, `Services.obs.removeObserver(${QUIT})`);
  const unregister = indexOf(log, `MenuManager.unregisterMenu(${menuID})`);
  const firstLinkRemove = indexOf(log, /^main\d+\.link\(tabellify\.ftl\)\.remove$/);
  const destruct = indexOf(log, "chromeHandle.destruct");

  assert.ok(close1 >= 0 && close2 >= 0, "both tabs closed");
  assert.ok(Math.max(close1, close2) < removeObs, "tabs closed before observer removed");
  assert.ok(removeObs < unregister, "observer removed before menu unregistered");
  assert.ok(unregister < firstLinkRemove, "menu unregistered before FTL links removed");
  assert.equal(destruct, log.length - 1, "chromeHandle.destruct is last");
  assert.ok(Math.max(close1, close2) < destruct, "tabs closed before destruct");

  assert.equal(T.tabIDs.size, 0, "stored ids cleared");
  assert.deepEqual(h.pluginObservers(), [], "quit observer removed");
  for (const w of [w1, w2]) assert.deepEqual(w.tabState.types(), ["library"], `${w.name}: only Zotero's tabs left`);
  assert.equal(h.log.filter((l) => /\.Zotero_Tabs\.close\(zotero-pane\)/.test(l)).length, 0);
});

test("F002 AC5: shutdown never closes Zotero's own tabs", async () => {
  const h = started();
  const [w] = h.mainWindows;
  // A Zotero reader tab, added directly to the fake (as Zotero would).
  w.Zotero_Tabs.add({ type: "reader", title: "paper.pdf", data: {}, select: false });
  await h.clickMenu();
  h.takeLog();
  h.shutdown();
  const closes = h.takeLog().filter((l) => l.includes(".Zotero_Tabs.close("));
  assert.equal(closes.length, 1);
  assert.deepEqual(w.tabState.types(), ["library", "reader"]);
});

// --------------------------------------------------------------------------------------- AC6

test("F002 AC6: quit-application-granted closes all Tabellify tabs before Zotero saves its session", async () => {
  const h = started({ mainWindowCount: 2 });
  const [w1, w2] = h.mainWindows;
  // PDF tab, Tabellify tab, second PDF tab (the AC6 manual order).
  w1.Zotero_Tabs.add({ type: "reader", title: "a.pdf", data: {}, select: false });
  await h.clickMenu({ target: { ownerGlobal: w1 } });
  w1.Zotero_Tabs.add({ type: "reader", title: "b.pdf", data: {}, select: false });
  await h.clickMenu({ target: { ownerGlobal: w2 } });
  h.takeLog();

  h.notify(QUIT);
  const log = h.takeLog();
  assert.deepEqual(h.errors, []);
  assert.ok(h.debug.includes("Tabellify: quit-application-granted: closing workspace tabs"));
  const lastClose = log.findLastIndex((l) => l.includes(".Zotero_Tabs.close("));
  assert.equal(log.filter((l) => l.includes(".Zotero_Tabs.close(")).length, 2);
  assert.ok(lastClose < indexOf(log, "Zotero.Session.save"), "closed before the session save");
  assert.deepEqual(h.savedSession, [["library", "reader", "reader"], ["library"]], "no tabellify in the saved session");
  assert.equal(h.evaluate("Tabellify").tabIDs.size, 0);
});

test("F002 AC6: other topics are ignored; the observer is registered once and removed at shutdown", async () => {
  const h = started();
  await h.clickMenu();
  assert.equal(h.pluginObservers(QUIT).length, 1);
  // The observer is registered for one topic only; calling it with another topic does nothing.
  const [{ observer }] = h.pluginObservers(QUIT);
  observer.observe(null, "profile-before-change", null);
  assert.equal(h.mainWindows[0].tabState.byType("tabellify").length, 1);

  h.shutdown(REASON.APP_SHUTDOWN);
  assert.deepEqual(h.pluginObservers(), []);
  assert.deepEqual(h.errors, []);
});

test("F002 AC6: app quit sequence (quit-application-granted, then shutdown reason 2) is clean", async () => {
  const h = started();
  await h.clickMenu();
  h.notify(QUIT);
  h.takeLog();
  h.shutdown(REASON.APP_SHUTDOWN);
  const log = h.takeLog();
  assert.ok(!log.some((l) => l.includes(".Zotero_Tabs.close(")), "nothing left to close");
  assert.equal(log.at(-1), "chromeHandle.destruct");
  assert.deepEqual(h.errors, []);
});

// --------------------------------------------------------------------------------------- AC7

test("F002 AC7: startup after shutdown re-adds the observer and opens a working tab", async () => {
  const h = started();
  await h.clickMenu();
  h.shutdown();
  h.takeLog();

  h.startup();
  assert.equal(h.pluginObservers(QUIT).length, 1, "exactly one quit observer");
  await h.clickMenu();
  const [w] = h.mainWindows;
  assert.equal(w.tabState.byType("tabellify").length, 1, "one fresh tab");
  assert.equal(w.tabState.addCalls.length, 2, "one add per enable");
  assert.equal(storedID(h, w), w.tabState.byType("tabellify")[0].id);

  h.shutdown();
  assert.deepEqual(w.tabState.types(), ["library"]);
  assert.deepEqual(h.pluginObservers(), []);
  assert.deepEqual(h.errors, []);
});

test("F002 AC5/AC7: shutdown while the title is still resolving opens no tab", async () => {
  const h = started();
  const pending = h.clickMenu();
  h.shutdown();
  await pending;
  assert.equal(h.mainWindows[0].tabState.addCalls.length, 0);
  assert.deepEqual(h.errors, []);
});

// --------------------------------------------------------------------------------------- AC8

test("F002 AC8: onMainWindowUnload closes that window's tab only, before its FTL link is removed", async () => {
  const h = started();
  const w2 = h.addMainWindow({ tabs: true });
  const [w1] = h.mainWindows;
  await h.clickMenu({ target: { ownerGlobal: w1 } });
  await h.clickMenu({ target: { ownerGlobal: w2 } });
  const id2 = w2.tabState.byType("tabellify")[0].id;
  h.takeLog();

  h.removeMainWindow(w2);
  const log = h.takeLog();
  const close = indexOf(log, `main2.Zotero_Tabs.close(${id2})`);
  assert.ok(close >= 0, "w2's tab closed");
  assert.ok(close < indexOf(log, "main2.link(tabellify.ftl).remove"));
  assert.ok(!log.some((l) => l.startsWith("main1.Zotero_Tabs.close(")), "w1 untouched");
  assert.deepEqual(w2.tabState.types(), ["library"]);
  assert.equal(w1.tabState.byType("tabellify").length, 1);
  assert.equal(storedID(h, w2), undefined);
  assert.deepEqual(h.errors, []);
});

// --------------------------------------------------------------------------------------- AC9

for (const [label, tabs] of [
  ["Zotero_Tabs is missing", false],
  ["add is missing", { missing: ["add"] }],
  ["select is missing", { missing: ["select"] }],
  ["close is missing", { missing: ["close"] }],
  ["getTabInfo is missing", { missing: ["getTabInfo"] }],
]) {
  test(`F002 AC9: ${label} → logs once and opens the F001 window`, async () => {
    const h = started({ tabs });
    h.takeLog();
    await h.clickMenu();
    const log = h.takeLog();
    assert.equal(log.filter(isOpenDialog).length, 1, "F001 window opened");
    assert.equal(log.filter(isAdd).length, 0, "no tab added");
    assert.equal(
      h.debug.filter((l) => l === "Tabellify: Zotero_Tabs unavailable; opening workspace window instead").length,
      1,
    );
    assert.equal(h.openWorkspaceWindows().length, 1);
    assert.deepEqual(h.errors, []);
  });
}

test("F002 AC9: add throws → error logged, F001 window opens", async () => {
  const h = started({ tabs: { add: "throw" } });
  await h.clickMenu();
  assert.equal(h.errors.length, 1);
  assert.match(String(h.errors[0]), /simulated Zotero_Tabs\.add failure/);
  assert.equal(h.debug.filter((l) => l === "Tabellify: Zotero_Tabs.add failed; opening workspace window instead").length, 1);
  assert.equal(h.openWorkspaceWindows().length, 1);
  assert.equal(h.evaluate("Tabellify").tabIDs.size, 0, "no id stored");
});

for (const mode of ["noTab", "noContainer"]) {
  test(`F002 AC9: add returns ${mode === "noTab" ? "nothing" : "no container"} → F001 window opens`, async () => {
    const h = started({ tabs: { add: mode } });
    await h.clickMenu();
    assert.equal(
      h.debug.filter((l) => l === "Tabellify: Zotero_Tabs.add returned no tab; opening workspace window instead").length,
      1,
    );
    assert.equal(h.openWorkspaceWindows().length, 1);
    assert.equal(h.evaluate("Tabellify").tabIDs.size, 0, "no id stored");
    assert.deepEqual(h.errors, []);
  });
}

test("F002 AC9: add returns an id with no container → that incomplete tab is closed, then the F001 window opens", async () => {
  // The fake registers a "tabellify" tab before returning {id} only. If the plugin left it
  // open, Zotero could save it in session.json (ADR-0009 §4).
  const h = started({ tabs: { add: "noContainer" } });
  const [w] = h.mainWindows;
  h.takeLog();
  await h.clickMenu();
  const log = h.takeLog();
  assert.equal(w.tabState.addCalls.length, 1, "add called once");
  const id = "main1-tab1"; // the fake's id for the first tab added in main1
  assert.equal(w.tabState.byType("tabellify").length, 0, "incomplete tab closed");
  assert.deepEqual(w.tabState.types(), ["library"]);
  const close = indexOf(log, `main1.Zotero_Tabs.close(${id})`);
  assert.ok(close >= 0, "close called with the returned id");
  assert.ok(close < log.findIndex(isOpenDialog), "closed before the F001 window opens");
  assert.equal(h.debug.filter((l) => l === `Tabellify: closed incomplete workspace tab (${id})`).length, 1);
  assert.equal(log.filter(isOpenDialog).length, 1, "F001 window opened");
  assert.equal(h.openWorkspaceWindows().length, 1);
  assert.equal(h.evaluate("Tabellify").tabIDs.size, 0, "no id stored");
  assert.deepEqual(h.errors, []);
});

test("F002: main window closes while the title resolves → no add, no F001 window", async () => {
  const h = started();
  const [w] = h.mainWindows;
  // Close the window during the title await: formatValue marks it closed, then resolves.
  const realFormatValue = w.document.l10n.formatValue;
  w.document.l10n.formatValue = (id) => {
    w.closed = true;
    return realFormatValue(id);
  };
  h.takeLog();
  await h.clickMenu();
  const log = h.takeLog();
  assert.ok(log.includes("main1.l10n.formatValue(tabellify-tab-title)"), "title was awaited");
  assert.equal(log.filter(isAdd).length, 0, "no tab added");
  assert.equal(log.filter(isOpenDialog).length, 0, "no F001 window fallback");
  assert.equal(
    h.debug.filter((l) => l === "Tabellify: main window closed while opening workspace; not opening a tab").length,
    1,
  );
  assert.equal(h.openWorkspaceWindows().length, 0);
  assert.equal(h.evaluate("Tabellify").tabIDs.size, 0, "no id stored");
  assert.deepEqual(h.errors, []);
});

// ------------------------------------------------------------------------------- RT4 log line

test("F002 RT4: 'menu command window is main: true' and the tab opens in the event's window", async () => {
  const h = started({ mainWindowCount: 2 });
  const [w1, w2] = h.mainWindows;
  await h.clickMenu({ target: { ownerGlobal: w2 } });
  assert.ok(h.debug.includes("Tabellify: menu command window is main: true"), h.debug.join("\n"));
  assert.equal(w2.tabState.addCalls.length, 1, "tab in the window whose menu was used");
  assert.equal(w1.tabState.addCalls.length, 0);
});

test("F002 RT4: an event without ownerGlobal logs false and uses Zotero.getMainWindow()", async () => {
  const h = started({ mainWindowCount: 2 });
  const [w1, w2] = h.mainWindows;
  await h.clickMenu({});
  await h.clickMenu({ target: { ownerGlobal: { notAMainWindow: true } } });
  assert.equal(h.debug.filter((l) => l === "Tabellify: menu command window is main: false").length, 2);
  assert.ok(!h.debug.includes("Tabellify: menu command window is main: true"));
  assert.equal(w1.tabState.addCalls.length, 1, "first click adds in getMainWindow()");
  assert.equal(w2.tabState.addCalls.length, 0);
  assert.deepEqual(h.errors, []);
});
