# Manual checklist: Feature 001 (Plugin Shell)

Covers acceptance criteria AC1–AC5 of `docs/features/001-plugin-shell.md`, plus runtime
checks R2, R3 and R7 from `docs/zotero-api-notes.md`. The owner performs every step. Agents
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

**Status:** AC1–AC4 were verified by the owner on 2026-11-11 in Zotero 10.0.9 (see the
spec, `docs/features/001-plugin-shell.md`). AC5 is verified except step 16 (FTL link removed
after disable). Steps 7 (R2), 12 (R3), 12a (R7) and 16 have no recorded results yet. They are pending the owner's
next combined run. The expected log lines below were updated after that run to the
outcome-reporting wording (`present now: true`, `…: true`), and then to the link count
written since commit `9a1a61d` (`removed FTL: 1`). Step 10's window-opacity check and step
12a were added after commit `64940be` (the Tabellify Workspace window now loads
`global.css`) and have not been run yet.

**Known Zotero errors to ignore.** These come from Zotero itself, appeared before Tabellify
was ever installed (runtime check R1), and are not Tabellify failures:
- `browser-custom-element.mjs:932` — a `TypeError` about `getTabForBrowser`
- `basicViewer.xhtml:1` — a focus `TypeError` (may appear twice)
- A failed fetch (HTTP 404) of
  `https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json` — Zotero's
  background update check asks for Tabellify's update file, which does not exist yet. This
  is not a Tabellify error.

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

> **Do not Remove and then reinstall Tabellify in the same Zotero session.** If you removed
> Tabellify, quit and restart Zotero before installing (Zotero 10.0.9 bug: a pending removal
> completes later without `shutdown`, see [`plugins.js` L933–937](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/plugins.js#L933-L937); symptom in
> Debug Output: `MenuAPI: 'menuID' must be unique`). Installing over an enabled Tabellify
> is fine.

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
- `Tabellify: onMainWindowLoad: inserted FTL (already present: false, present now: true)`

and no Tabellify errors (see "What counts as a Tabellify error" above). Ignore the known
Zotero errors listed in "Before you start".

> If the Debug Output window is empty, Debug Output logging may be switched off. Turn it
> on from the Help → Debug Output Logging submenu (the exact item name is not recorded in
> `docs/development.md`, flag it in Notes), then repeat step 4.

- [ ] Pass  [ ] Fail
- Notes:

### Step 6: Check Debug Output after a restart
**Where:** the dev Zotero window, then Terminal.
**Do:** quit the dev Zotero window (Zotero → Quit Zotero). In Terminal, from the repository
folder, start the dev profile with Debug Output written to a file from launch
(`-ZoteroDebugText` is the startup flag documented at
https://www.zotero.org/support/debug_output for Zotero before 11; `build/` is gitignored):
```bash
/Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText > build/debug-1.txt
```
Leave Zotero running for the remaining steps; when you finish, quit it and run:
```bash
grep -n "Tabellify" build/debug-1.txt
```
**Expected:** the `grep` output from `build/debug-1.txt` shows `Tabellify: startup (version 0.1.0, reason 1)`
(reason 1 means "Zotero is starting up"), followed later by
`Tabellify: onMainWindowLoad (reason 9)` and
`Tabellify: onMainWindowLoad: inserted FTL (already present: false, present now: true)`.
No Tabellify errors.

> Logging switched on from the Help menu starts only after launch, so it misses the startup
> lines. Use the Terminal command above for this step.
>
> Messages that Zotero prints to Terminal (stderr) rather than to `build/debug-1.txt`, such
> as `uncaught exception: undefined` and `No such JSProcessActor
> 'BrowserToolboxDevToolsProcess'`, were seen on 2026-11-11 before any Tabellify action and
> are recorded as **non-blocking**; the F001 reviewer assesses whether Tabellify could cause
> them.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part D: AC3 — Menu item opens the workspace window (and runtime check R2)

### Step 7: R2 — Check that Tabellify's strings load
**Where:** the dev Zotero window, then the Run JavaScript window.
**Do:** in the dev Zotero window choose Tools → Developer → Run JavaScript. In the Run
JavaScript window, leave "Run as async function" unticked, paste the code below into the
code box, and click **Run** (or press Cmd-R).
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

Also check that the Tabellify Workspace window is **opaque** (solid, not see-through): move
the Tabellify Workspace window so that it partly covers the dev Zotero window. Nothing of
the dev Zotero window or the desktop shows through the Tabellify Workspace window, and the
Tabellify Workspace window has a visible bottom edge (the solid background reaches all the
way down to the bottom border of the Tabellify Workspace window). Before commit `64940be`
the Tabellify Workspace window was see-through on macOS; a see-through Tabellify Workspace
window is a failure.

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

### Step 12a: R7 — Confirm the Tabellify Workspace window is opaque and loads its stylesheets
Terms: a **stylesheet** is a CSS file that sets how a window looks. `global.css` is Mozilla's
standard stylesheet that gives the Tabellify Workspace window its solid, theme-coloured
background; `workspace.css` is Tabellify's own stylesheet. A **system colour** is a colour
the app picks from the current light or dark theme instead of a fixed value.

**Where:** the Run JavaScript window (reopen it from Tools → Developer → Run JavaScript in
the dev Zotero window if you closed the Run JavaScript window). Keep the Tabellify Workspace
window open.
**Do, part 1:** leave "Run as async function" unticked, replace the code in the code box
with the code below, and click **Run** (or press Cmd-R):
```js
(w => [getComputedStyle(w.document.documentElement).backgroundColor, getComputedStyle(w.document.documentElement).appearance, [...w.document.styleSheets].map(s => s.href)])(Services.wm.getMostRecentWindow("tabellify:workspace"))
```
**Expected, part 1:** the Run JavaScript window shows an array of three values:
1. a solid colour such as `rgb(236, 236, 236)` (the numbers can differ). `rgba(0, 0, 0, 0)`
   or `transparent` is a failure.
2. `"auto"` (on macOS).
3. a list that contains both `chrome://global/skin/global.css` and
   `chrome://tabellify/content/workspace.css` (other entries may appear too).

Write the colour from value 1 in Notes.

**Do, part 2:** in the dev Zotero window open Zotero → Settings…, choose the **General**
section, and switch the colour scheme setting (Light / Dark; see "Unconfirmed UI labels")
to the other choice while the Tabellify Workspace window stays open. Then click **Run** in
the Run JavaScript window again with the same code.
**Expected, part 2:** the Tabellify Workspace window's background changes to match the new
colour scheme without reopening the Tabellify Workspace window, and value 1 in the Run
JavaScript window is now a different `rgb(…)` colour. Write the new colour in Notes. If the
background changes only after you close and reopen the Tabellify Workspace window, write
that in Notes (this is the open question R7 answers). Afterwards switch the colour scheme
setting back to its original choice.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part F: AC5 — Disable cleans up; re-enable restores (and runtime check R3, second half)

Keep the Tabellify Workspace window **open** at the start of this part: step 13 checks
that disabling Tabellify closes the Tabellify Workspace window.

### Step 13: Disable Tabellify
**Where:** the dev Zotero window, then the Plugins window.
**Do:** in the dev Zotero window choose Tools → Plugins. In the Plugins window, find the
Tabellify row and switch Tabellify off with the unlabeled toggle switch on the right of the
Tabellify row.
**Expected:** the Tabellify Workspace window closes by itself. The Tabellify row title in the
Plugins window reads "Tabellify (disabled)". No error dialog appears.

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
4. `Tabellify: menu unregistered (…open-workspace): true` — `true` means Zotero found and
   removed the menu item; `false` is a failure
5. `Tabellify: onMainWindowUnload: removed FTL: 1` — the number is how many FTL links
   Tabellify found and removed in the dev Zotero window. `1` is correct; `0` is a failure.
   A number above 1 means a duplicate FTL link was present (it can happen after removing
   and reinstalling Tabellify in one Zotero session); Tabellify removed all of them, but
   write the number in Notes

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
the unlabeled toggle switch on the right of the Tabellify row (the row title loses
"(disabled)").
**Expected:** the Plugins window shows Tabellify as enabled. The Debug Output window
(Help → Debug Output Logging → View Output) shows a new
`Tabellify: startup (version 0.1.0, reason 3)` (reason 3 means "plugin enabled"),
`Tabellify: menu registered (…open-workspace)`, and
`Tabellify: onMainWindowLoad: inserted FTL (already present: false, present now: true)`.
No Tabellify errors.

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

> Quitting Zotero while Tabellify is **disabled** logs no Tabellify `shutdown` line: a
> disabled plugin has already been shut down, so there is nothing left to shut down at quit. (On 2026-11-11 the owner quit after step 13's
> second disable, which explains the missing line in `build/debug-1.txt`.) Tabellify's
> `shutdown` has no early return for app quit, so quitting while Tabellify is **enabled**
> should log `Tabellify: shutdown (version 0.1.0, reason 2)` (reason 2 = app shutdown).
> This has not been observed in Zotero yet; it is checked in F002, whose design depends on
> quit-time cleanup. The plugin side (reason 2 runs the full cleanup) is covered by an
> automated test in `tests/behavior/lifecycle.test.mjs`.

- [ ] Pass  [ ] Fail
- Notes:

---

## Summary

| AC / check | Steps | Result (Pass / Fail) |
|---|---|---|
| AC1 install | 2, 4 | |
| AC2 startup messages, no errors | 5, 6 | |
| AC3 menu item opens window | 8, 9 | |
| AC4 placeholder, opaque window, single instance | 10, 11, 12, 12a | |
| AC5 disable cleans up, re-enable restores | 13–18 | |
| R2 Fluent + menu label | 7, 8 | |
| R3 window open/focus/close | 11, 12, 13, 16 | |
| R7 opaque window, stylesheets, colour scheme | 10, 12a | |

Automated coverage (run by `npm test`, step 1): AC1 in `tests/static/xpi.test.mjs`; AC5 in
`tests/behavior/lifecycle.test.mjs` (including removal of a duplicate FTL link, logged as
`removed FTL: 2`) and `tests/static/symmetry.test.mjs`; AC6 in
`tests/static/write-guard.test.mjs`; static support for AC3/AC4 in
`tests/static/l10n-and-window.test.mjs` (including: `workspace.xhtml` loads `global.css`
before `<window>`, and `workspace.css` sets no background). No automated test can show
that the window is opaque on screen or follows the colour scheme; steps 10 and 12a cover
that.

## Unconfirmed UI labels

These controls are not described in `docs/development.md` or `docs/zotero-api-notes.md`,
so the steps above describe them instead of naming them. Please write the real labels in
the Notes fields so this checklist can be corrected:
- ~~The run button in the Run JavaScript window~~ Confirmed by owner: **Run** (Cmd-R),
  next to the "Run as async function" checkbox.
- ~~The enable/disable control in the Plugins window~~ Confirmed by owner: an unlabeled
  toggle switch on the right of the plugin row; when off, the row title reads
  "Tabellify (disabled)".
- The menu item that switches Debug Output logging on (notes under steps 5 and 6).
- Whether the Debug Output window supports Cmd+F search (step 5).
- How the Run JavaScript window displays `undefined` inside an array (step 16).
- The menu item that opens Zotero's settings on macOS, written as Zotero → Settings… in
  step 12a (not recorded in `docs/development.md`).
- The exact name of the colour scheme setting in Zotero → Settings… → General and of its
  Light / Dark choices (step 12a). `docs/zotero-api-notes.md` records only the setting's
  internal ID (`color-scheme`), not its visible label.
