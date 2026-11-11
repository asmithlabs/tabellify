# Manual checklist: Feature 001 (Plugin Shell)

Covers acceptance criteria AC1–AC5 of `docs/features/001-plugin-shell.md`, plus runtime
checks R2 and R3 from `docs/zotero-api-notes.md`. The owner performs every step. Agents
never tick these boxes.

**Use the Zotero dev profile only** (`tabellify-dev`, data directory `~/Zotero tabellify-dev`).
Never run these steps in your normal Zotero profile.

## Environment

| Field | Value |
|---|---|
| Date | |
| Tester | |
| Zotero version (Zotero → About Zotero) | |
| macOS version (Apple menu → About This Mac) | |
| Build commit (output of step 2) | |
| XPI file name | `build/tabellify-0.1.0.xpi` |
| `npm test` result (step 1) | |

## Before you start

**Already verified:** AC1 (install) and AC2 (startup messages) were manually verified on
2026-11-11 with Zotero 10.0.9, on an earlier build (`94df0a1`). Re-run them here on the
final build anyway: the build has changed since then (T3 added the menu and window).

**Known Zotero errors to ignore.** These come from Zotero itself, appeared before Tabellify
was ever installed (runtime check R1), and are not Tabellify failures:
- `browser-custom-element.mjs:932` — a `TypeError` about `getTabForBrowser`
- `basicViewer.xhtml:1` — a focus `TypeError` (may appear twice)

**What counts as a Tabellify error:** an error or exception line that mentions
`tabellify` (for example `tabellify.js`, `bootstrap.js` from the Tabellify plugin, or a
`chrome://tabellify/` URL).

**Terms used below**
- **XPI**: the plugin file Zotero installs (`build/tabellify-0.1.0.xpi`). An XPI is a ZIP
  archive with a different file extension.
- **Debug Output**: Zotero's internal log. Tabellify writes every line there starting with
  `Tabellify: `.
- **The Debug Output window**: the window that opens from Help → Debug Output Logging →
  View Output in the dev Zotero window.
- **The Run JavaScript window**: a Zotero developer window that runs code you paste into
  it, opened from Tools → Developer → Run JavaScript in the dev Zotero window. Code there
  runs with full access to Zotero, so paste only the snippets from this checklist.
- **FTL link**: a `<link>` element Tabellify adds to the main Zotero window so Zotero can
  find the text of the "Tabellify…" menu item in Tabellify's string file (`tabellify.ftl`).
- **Workspace window**: Tabellify's own window, titled "Tabellify Workspace".

**How to record results:** under each step, change `[ ]` to `[x]` next to Pass or Fail,
and write anything unexpected under Notes (copy the exact error text if there is one).

---

## Part A: Build (Terminal)

### Step 1: Run the automated tests
**Where:** Terminal.
**Do:** paste the following lines and press Return:
```bash
cd ~/Documents/projects/Active/zotero_plugins/tabellify
npm test
```
**Expected:** the last lines of the Terminal output include `# fail 0` and a `# pass`
number greater than 0.

- [ ] Pass  [ ] Fail
- Notes:

### Step 2: Record the build commit and build the XPI
**Where:** Terminal (same folder as step 1).
**Do:** paste the following lines and press Return:
```bash
git rev-parse --short HEAD
npm run build
```
**Expected:** the first command prints a short commit ID (7 characters, for example
`55a31db`); copy that commit ID into the Environment table above. The second command
prints a line starting with `Built build/tabellify-0.1.0.xpi`.

- [ ] Pass  [ ] Fail
- Notes:

### Step 3: Start Zotero with the dev profile
**Where:** Terminal. First quit any running Zotero (in the Zotero menu bar: Zotero → Quit
Zotero).
**Do:** paste the following line and press Return:
```bash
/Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev
```
**Expected:** the dev Zotero window opens, showing the dev library (not your real library).

- [ ] Pass  [ ] Fail
- Notes:

---

## Part B: AC1 — Install the XPI

### Step 4: Install the XPI
**Where:** the dev Zotero window.
**Do:** choose Tools → Plugins. In the Plugins window, choose **Install Plugin From File…**
and pick `build/tabellify-0.1.0.xpi` inside the tabellify project folder. (Dragging the
XPI file from Finder onto the Plugins window also works.) If an older Tabellify is already
listed, installing the new XPI replaces the older Tabellify.
**Expected:** Tabellify appears in the Plugins window, enabled, with version 0.1.0. No
error dialog appears.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part C: AC2 — Startup messages, no Tabellify errors

### Step 5: Check Debug Output after install
**Where:** the dev Zotero window, then the Debug Output window.
**Do:** in the dev Zotero window choose Help → Debug Output Logging → View Output. In the
Debug Output window, search for `Tabellify:` (press Cmd+F if the Debug Output window
supports search; otherwise scroll).
**Expected:** the Debug Output window shows these lines (the reason number can differ):
- `Tabellify: startup (version 0.1.0, reason …)`
- `Tabellify: init (version 0.1.0)`
- `Tabellify: menu registered (…open-workspace)` — the part in brackets is Zotero's ID
  for the menu item and contains `open-workspace`
- `Tabellify: onMainWindowLoad: inserted FTL`

and no Tabellify errors (see "What counts as a Tabellify error" above). Ignore the known
Zotero errors listed in "Before you start".

> If the Debug Output window is empty, Debug Output logging may be switched off. Turn it
> on from the Help → Debug Output Logging submenu (the exact item name is not recorded in
> `docs/development.md`, flag it in Notes), then repeat step 4.

- [ ] Pass  [ ] Fail
- Notes:

### Step 6: Check Debug Output after a restart
**Where:** the dev Zotero window, then Terminal, then the Debug Output window.
**Do:** quit the dev Zotero window (Zotero → Quit Zotero). In Terminal, start the dev
profile again with the same command as step 3:
```bash
/Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev
```
Then in the dev Zotero window choose Help → Debug Output Logging → View Output.
**Expected:** the Debug Output window shows `Tabellify: startup (version 0.1.0, reason 1)`
(reason 1 means "Zotero is starting up"), followed later by
`Tabellify: onMainWindowLoad (reason 9)` and `Tabellify: onMainWindowLoad: inserted FTL`.
No Tabellify errors.

> Debug Output may have to be switched on again after a restart; see the note in step 5.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part D: AC3 — Menu item opens the workspace window (and runtime check R2)

### Step 7: R2 — Check that Tabellify's strings load
**Where:** the dev Zotero window, then the Run JavaScript window.
**Do:** in the dev Zotero window choose Tools → Developer → Run JavaScript. In the Run
JavaScript window, leave "Run as async function" unticked, paste the code below into the
code box, and run the code (with the Run JavaScript window's run button; the button's
exact label is not recorded in our docs).
```js
const l10n = new Localization(["tabellify.ftl"], true);
[
  l10n.formatValueSync("tabellify-workspace-title"),
  !!Zotero.getMainWindow().document.querySelector('link[href="tabellify.ftl"]'),
]
```
**Expected:** the Run JavaScript window shows the result `["Tabellify Workspace", true]`.
The first value proves Zotero found `tabellify.ftl`; the second proves the FTL link is in
the dev Zotero window. A `null`, `undefined`, or `false` is a failure.

- [ ] Pass  [ ] Fail
- Notes:

### Step 8: Check the Tools menu label
**Where:** the dev Zotero window.
**Do:** click the Tools menu in the menu bar.
**Expected:** the Tools menu contains an item labelled exactly **Tabellify…** (with an
ellipsis). The item is not blank and does not show a raw ID such as
`tabellify-menu-open`.

- [ ] Pass  [ ] Fail
- Notes:

### Step 9: Open the workspace window from the menu
**Where:** the dev Zotero window.
**Do:** choose Tools → Tabellify….
**Expected:** a new window titled **Tabellify Workspace** opens. The Debug Output window
(Help → Debug Output Logging → View Output) shows `Tabellify: opening workspace window`
and no Tabellify errors.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part E: AC4 — Placeholder content and single instance (and runtime check R3, first half)

### Step 10: Check the placeholder content
**Where:** the Tabellify Workspace window.
**Do:** look at the window's title bar and contents.
**Expected:** the title bar reads **Tabellify Workspace**. The window shows the heading
**Tabellify Workspace** and the sentence **Your literature tables will appear here.**
No raw IDs (text starting with `tabellify-`) and no empty boxes where text should be.

- [ ] Pass  [ ] Fail
- Notes:

### Step 11: Choose the menu item again while the workspace window is open
**Where:** the dev Zotero window (click the dev Zotero window to bring the dev Zotero
window to the front; keep the Tabellify Workspace window open behind the dev Zotero
window).
**Do:** choose Tools → Tabellify… again.
**Expected:** no second Tabellify Workspace window opens; the existing Tabellify
Workspace window comes to the front. The Debug Output window shows
`Tabellify: workspace already open; focusing it` and no Tabellify errors.

- [ ] Pass  [ ] Fail
- Notes:

### Step 12: R3 — Confirm there is exactly one workspace window, at the right URL
**Where:** the Run JavaScript window (reopen it from Tools → Developer → Run JavaScript in
the dev Zotero window if you closed the Run JavaScript window).
**Do:** replace the code in the code box with the code below and run the code:
```js
[
  Services.wm.getMostRecentWindow("tabellify:workspace")?.location.href,
  [...Services.wm.getEnumerator("tabellify:workspace")].length,
]
```
**Expected:** the Run JavaScript window shows
`["chrome://tabellify/content/workspace.xhtml", 1]` — the workspace window's address, and
a count of exactly 1 open workspace window.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part F: AC5 — Disable cleans up; re-enable restores (and runtime check R3, second half)

Keep the Tabellify Workspace window **open** at the start of this part: step 13 checks
that disabling Tabellify closes the Tabellify Workspace window.

### Step 13: Disable Tabellify
**Where:** the dev Zotero window, then the Plugins window.
**Do:** in the dev Zotero window choose Tools → Plugins. In the Plugins window, find the
Tabellify row and switch Tabellify off with the row's enable/disable control (the exact
label or shape of that control is not recorded in our docs; describe it in Notes).
**Expected:** the Tabellify Workspace window closes by itself. The Plugins window shows
Tabellify as disabled. No error dialog appears.

- [ ] Pass  [ ] Fail
- Notes:

### Step 14: Check Debug Output after disable
**Where:** the dev Zotero window, then the Debug Output window.
**Do:** choose Help → Debug Output Logging → View Output and find the newest `Tabellify:`
lines.
**Expected:** in this order:
1. `Tabellify: shutdown (version 0.1.0, reason 4)` (reason 4 means "plugin disabled")
2. `Tabellify: shutdown`
3. `Tabellify: closing workspace window`
4. `Tabellify: menu unregistered (…open-workspace)`
5. `Tabellify: onMainWindowUnload: removed FTL`

No Tabellify errors.

- [ ] Pass  [ ] Fail
- Notes:

### Step 15: Check the menu item is gone
**Where:** the dev Zotero window.
**Do:** click the Tools menu.
**Expected:** the Tools menu no longer contains **Tabellify…**.

- [ ] Pass  [ ] Fail
- Notes:

### Step 16: R3 — Confirm the workspace window and the FTL link are gone
**Where:** the Run JavaScript window (Tools → Developer → Run JavaScript in the dev Zotero
window).
**Do:** replace the code in the code box with the code below and run the code:
```js
[
  Services.wm.getMostRecentWindow("tabellify:workspace")?.location.href,
  [...Services.wm.getEnumerator("tabellify:workspace")].length,
  !!Zotero.getMainWindow().document.querySelector('link[href="tabellify.ftl"]'),
]
```
**Expected:** the Run JavaScript window shows `[undefined, 0, false]` (the first value may
be displayed as `null` or left blank; any of those counts as gone). Meaning: no workspace
window, zero workspace windows, and no FTL link in the dev Zotero window.

- [ ] Pass  [ ] Fail
- Notes:

### Step 17: Re-enable Tabellify
**Where:** the dev Zotero window, then the Plugins window.
**Do:** in the dev Zotero window choose Tools → Plugins, and switch Tabellify back on with
the Tabellify row's enable/disable control.
**Expected:** the Plugins window shows Tabellify as enabled. The Debug Output window
(Help → Debug Output Logging → View Output) shows a new
`Tabellify: startup (version 0.1.0, reason 3)` (reason 3 means "plugin enabled"),
`Tabellify: menu registered (…open-workspace)`, and
`Tabellify: onMainWindowLoad: inserted FTL`. No Tabellify errors.

- [ ] Pass  [ ] Fail
- Notes:

### Step 18: Check the menu item and workspace window work again
**Where:** the dev Zotero window.
**Do:** choose Tools → Tabellify….
**Expected:** the Tools menu shows **Tabellify…** with a real label, and choosing
Tools → Tabellify… opens the Tabellify Workspace window with the same title, heading,
and sentence as in step 10. No Tabellify errors in the Debug Output window.

- [ ] Pass  [ ] Fail
- Notes:

### Step 19: Leave the dev profile tidy
**Where:** the Tabellify Workspace window, then the dev Zotero window.
**Do:** close the Tabellify Workspace window (Cmd+W while the Tabellify Workspace window is
in front). Optionally quit the dev Zotero window (Zotero → Quit Zotero).
**Expected:** the Tabellify Workspace window closes without an error dialog.

- [ ] Pass  [ ] Fail
- Notes:

---

## Summary

| AC / check | Steps | Result (Pass / Fail) |
|---|---|---|
| AC1 install | 2, 4 | |
| AC2 startup messages, no errors | 5, 6 | |
| AC3 menu item opens window | 8, 9 | |
| AC4 placeholder + single instance | 10, 11, 12 | |
| AC5 disable cleans up, re-enable restores | 13–18 | |
| R2 Fluent + menu label | 7, 8 | |
| R3 window open/focus/close | 11, 12, 13, 16 | |

Automated coverage (run by `npm test`, step 1): AC1 in `tests/static/xpi.test.mjs`; AC5 in
`tests/behavior/lifecycle.test.mjs` and `tests/static/symmetry.test.mjs`; AC6 in
`tests/static/write-guard.test.mjs`; static support for AC3/AC4 in
`tests/static/l10n-and-window.test.mjs`.

## Unconfirmed UI labels

These controls are not described in `docs/development.md` or `docs/zotero-api-notes.md`,
so the steps above describe them instead of naming them. Please write the real labels in
the Notes fields so this checklist can be corrected:
- The run button in the Run JavaScript window (steps 7, 12, 16).
- The enable/disable control on the Tabellify row in the Plugins window (steps 13, 17).
- The menu item that switches Debug Output logging on (notes under steps 5 and 6).
- Whether the Debug Output window supports Cmd+F search (step 5).
- How the Run JavaScript window displays `undefined` inside an array (step 16).
