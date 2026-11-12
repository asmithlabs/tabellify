# Manual checklist: Feature 002 (Workspace as a main-window tab)

Covers acceptance criteria AC1–AC8 of `docs/features/002-workspace-tab.md`, plus runtime
checks RT3 and RT4 from that spec. AC9–AC11 are automated (`npm test`, step 1). This is one
combined end-of-feature run. The owner performs every step. Agents never tick these boxes.

**Use the Zotero dev profile only** (`tabellify-dev`, data directory `~/Zotero tabellify-dev`).
Never run these steps in your normal Zotero profile.

## Environment

| Field | Value |
|---|---|
| Date | |
| Tester | |
| Zotero version (Zotero → About Zotero) | expected 10.0.9 |
| macOS version (Apple menu → About This Mac) | |
| Build commit (output of step 2) | |
| XPI file name | `build/tabellify-0.1.0.xpi` |
| `npm test` result (step 1) | |

## Before you start

**You do not need to copy log lines.** Zotero writes its Debug Output to files in the
project's `build/` folder (`build/debug-6.txt`, after the restarts in Part H
`build/debug-7.txt` and `build/debug-8.txt`, and after the restarts in Part I
`build/debug-9.txt` and `build/debug-10.txt`). The orchestrator reads those files after your
run. The expected lines are listed in "Expected Debug Output" at the end of this checklist.
Each restart needs a **new** file name, because `>` empties the file it writes to: reusing
`build/debug-6.txt` after a restart would erase the lines from before the restart.

**Known Zotero errors to ignore** (seen before Tabellify was installed, F001 runtime check R1):
- `browser-custom-element.mjs:932`: a `TypeError` about `getTabForBrowser`
- `basicViewer.xhtml:1`: a focus `TypeError` (may appear twice)
- A failed fetch (HTTP 404) of
  `https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json`

**What counts as a Tabellify error:** an error or exception line that mentions `tabellify`
(for example `tabellify.js`, `bootstrap.js` from the Tabellify plugin, or a
`chrome://tabellify/` URL). Also a failure for this feature: any line containing
`Cannot destructure property 'itemID'`. That error means Zotero tried to restore a saved
tab of a type it doesn't know, such as a leftover Tabellify tab.

**Terms used below**
- **XPI**: the plugin file Zotero installs (`build/tabellify-0.1.0.xpi`). An XPI is a ZIP
  archive with a different file extension.
- **Debug Output**: Zotero's internal log. Tabellify starts every line it writes there with
  `Tabellify: `.
- **Tab bar**: the row of tabs at the top of the dev Zotero window (the library tab, PDF
  tabs, note tabs).
- **Tabellify tab**: the new tab Feature 002 adds to the tab bar, titled **Tabellify**.
- **PDF tab**: the tab Zotero opens when you open a PDF from the dev library (Zotero calls it
  a "reader" tab, and the Run JavaScript checks below list it as `"reader"`).
- **The Run JavaScript window**: a Zotero developer window that runs code you paste into it.
  Open it from Tools → Developer → Run JavaScript in the dev Zotero window. Code there runs
  with full access to Zotero, so paste only the snippets from this checklist. Press the
  **Run** button (or Cmd-R) to run the code. Leave the **"Run as async function"** checkbox
  **unticked** for every snippet in this checklist.
- **Tab check**: the Run JavaScript snippet below. It lists the types of the tabs open right
  now in the dev Zotero window. It only reads the tab list and changes nothing:
  ```js
  Zotero.getMainWindow().Zotero_Tabs.getState().map(t => t.type)
  ```
  Example result: `["library", "reader", "tabellify"]`. `"library"` is the library tab,
  `"reader"` is a PDF tab, `"tabellify"` is the Tabellify tab.
- **Session**: the list of open tabs that Zotero saves when it quits (in a file called
  `session.json` in the dev profile) and reopens at the next start.

**How to record results:** under each step, change `[ ]` to `[x]` next to Pass or Fail,
and write anything unexpected under Notes (copy the exact error text if there is one).

**Preparation:** the dev library needs at least **two items with a PDF attachment**, so
that you can open two PDF tabs. If the dev library has fewer, add them before step 3 (any
PDF will do).

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
**Expected:** the first command prints a short commit ID (7 characters); copy that commit ID
into the Environment table above. The second command prints a line starting with
`Built build/tabellify-0.1.0.xpi`.

- [ ] Pass  [ ] Fail
- Notes:

### Step 3: Start the dev Zotero with Debug Output going to `build/debug-6.txt`
**Where:** first the Zotero menu bar, then Terminal.
**Do:** quit any running Zotero (in the Zotero menu bar: Zotero → Quit Zotero). Wait until
Zotero has closed. Then, in Terminal, paste the following line and press Return:
```bash
cd ~/Documents/projects/Active/zotero_plugins/tabellify && /Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText > build/debug-6.txt
```
**Expected:** the dev Zotero window opens and shows the dev library (not your real
library). The Terminal window stays busy while Zotero runs. Leave that Terminal window
alone until Part H. Use a second Terminal window if you need one.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part B: Install the new build

> **Install the new XPI over the installed Tabellify. Do not Remove Tabellify first.** If you
> do Remove Tabellify, quit and restart Zotero before installing (Zotero 10.0.9 bug, see
> `docs/development.md`; symptom in Debug Output: `MenuAPI: 'menuID' must be unique`).

### Step 4: Install the XPI over the installed Tabellify
**Where:** the dev Zotero window, then the Plugins window.
**Do:** in the dev Zotero window choose Tools → Plugins. In the Plugins window, choose
**Install Plugin From File…** and pick `build/tabellify-0.1.0.xpi` inside the tabellify
project folder.
**Expected:** Tabellify is listed in the Plugins window, enabled (the row title does not end
in "(disabled)"), version 0.1.0. No error dialog appears. If Tabellify shows as disabled,
switch it on with the unlabeled toggle switch on the right of the Tabellify row, and write
that in Notes. Close the Plugins window.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part C: AC1 (opens as a tab) and RT4 (which window)

### Step 5: Open Tabellify from the Tools menu
**Where:** the dev Zotero window.
**Do:** make sure the library tab is selected. Choose Tools → Tabellify….
**Expected:**
- A new tab titled **Tabellify** appears in the tab bar of the dev Zotero window and is
  selected.
- The Tabellify tab shows the heading **Tabellify Workspace** and the sentence **Your
  literature tables will appear here.** It shows no raw IDs (text starting with
  `tabellify-`) and no empty area where that text should be.
- **No separate window opens.** (A window titled "Tabellify Workspace" would mean the
  fallback ran. That is a failure.)

Also write in Notes whether the right-hand item/notes pane is shown or hidden while the
Tabellify tab is selected (spec open question Q7), and whether the heading and sentence fill
the tab sensibly (no scroll bars in odd places, nothing cut off).

- [ ] Pass  [ ] Fail
- Notes:

### Step 6: Tab check after opening
**Where:** the dev Zotero window, then the Run JavaScript window.
**Do:** in the dev Zotero window choose Tools → Developer → Run JavaScript. In the Run
JavaScript window, leave "Run as async function" unticked, paste the tab check, and click
**Run**:
```js
Zotero.getMainWindow().Zotero_Tabs.getState().map(t => t.type)
```
**Expected:** the result lists `"tabellify"` **exactly once**, for example
`["library", "tabellify"]`. Keep the Run JavaScript window open for later steps.

- [ ] Pass  [ ] Fail
- Notes:

> RT4 needs no action from you: the orchestrator checks `build/debug-6.txt` for
> `Tabellify: menu command window is main: true` (written when you chose Tools → Tabellify…
> in step 5).

---

## Part D: AC2 (single instance)

### Step 7: Open a PDF tab
**Where:** the dev Zotero window.
**Do:** select the library tab. In the items list, double-click an item that has a PDF
attachment (or double-click the PDF attachment itself).
**Expected:** a PDF tab opens and is selected. The Tabellify tab is still in the tab bar.

- [ ] Pass  [ ] Fail
- Notes:

### Step 8: Choose Tools → Tabellify… again while another tab is selected
**Where:** the dev Zotero window.
**Do:** with the PDF tab selected, choose Tools → Tabellify…. Then select the library tab
and choose Tools → Tabellify… once more.
**Expected:** both times the existing Tabellify tab becomes the selected tab. **No second
Tabellify tab appears.** No separate window opens.

- [ ] Pass  [ ] Fail
- Notes:

### Step 9: Tab check after choosing the menu item again
**Where:** the Run JavaScript window.
**Do:** click **Run** again with the same tab check:
```js
Zotero.getMainWindow().Zotero_Tabs.getState().map(t => t.type)
```
**Expected:** `"tabellify"` appears exactly once, for example
`["library", "reader", "tabellify"]` (the order can differ).

- [ ] Pass  [ ] Fail
- Notes:

---

## Part E: AC3 (full screen and maximized)

The two macOS controls used here come from the spec, not from a checked source. See
"Unconfirmed UI labels" and write the real names in Notes.

### Step 10: Full screen
**Where:** the dev Zotero window.
**Do:** put the dev Zotero window into full screen (in the menu bar: View → Enter Full
Screen, or click the green button at the top-left corner of the dev Zotero window). Select
the library tab. Choose Tools → Tabellify… (in full screen, move the pointer to the top
edge of the screen to show the menu bar).
**Expected:** the Tabellify tab is selected **inside the full-screen dev Zotero window**.
Nothing opens behind the full-screen dev Zotero window or on another desktop. Switch between
the Tabellify tab, the PDF tab and the library tab by clicking them in the tab bar. Then
try the tab-switching keyboard shortcut named in the spec (Ctrl-; or Cmd-;). Each switch
works. Write in Notes which shortcut worked, if any. Leave full screen the same way you
entered it.

- [ ] Pass  [ ] Fail
- Notes:

### Step 11: Maximized (zoomed)
**Where:** the dev Zotero window.
**Do:** make the dev Zotero window fill the screen without full screen (on macOS this is
called "zoom": in the menu bar, Window → Zoom, or Option-click the green button). Select the
library tab and choose Tools → Tabellify….
**Expected:** same as step 10: the Tabellify tab is selected inside the dev Zotero window,
no separate window, and switching tabs by clicking and by the keyboard shortcut works.
Afterwards return the dev Zotero window to its normal size.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part F: AC4 (closing the tab)

### Step 12: Close the Tabellify tab with its × button
**Where:** the dev Zotero window.
**Do:** in the tab bar, click the × (close button) on the Tabellify tab. (The × may appear
only when the pointer is over the Tabellify tab.)
**Expected:** the Tabellify tab disappears. Another tab (the one selected before) becomes
selected. No error dialog appears.

- [ ] Pass  [ ] Fail
- Notes:

### Step 12a (optional): Reopen closed tab does not bring back a broken Tabellify tab
**Where:** the dev Zotero window.
**Do:** right after step 12, press Cmd-Shift-T (the usual "reopen closed tab" shortcut; this
label and shortcut are **unconfirmed** for Zotero, see "Unconfirmed UI labels").
**Expected:** **no** broken or blank Tabellify tab appears. Any of these is a pass: nothing
happens; a working Tabellify tab (heading and sentence as in step 5) appears; a previously
closed PDF tab reappears. If a Tabellify tab appears that is blank, shows raw IDs (text
starting with `tabellify-`), or shows an error, mark Fail, copy any error text into Notes,
close that tab with its ×, and continue. Write in Notes what Cmd-Shift-T did.
If a Tabellify tab reappeared, close it with its × before step 13, so step 13 starts without
a Tabellify tab. A reopened PDF tab can stay open.

- [ ] Pass  [ ] Fail  [ ] Skipped
- Notes:

### Step 13: Tab check after closing, then reopen
**Where:** the Run JavaScript window, then the dev Zotero window.
**Do:** in the Run JavaScript window click **Run** with the tab check:
```js
Zotero.getMainWindow().Zotero_Tabs.getState().map(t => t.type)
```
Then, in the dev Zotero window, choose Tools → Tabellify….
**Expected:** the tab check result has **no** `"tabellify"`, for example
`["library", "reader"]`. After Tools → Tabellify…, a fresh Tabellify tab opens and is
selected, with the same heading and sentence as in step 5.

- [ ] Pass  [ ] Fail
- Notes:

### Step 14: Close the Tabellify tab with Cmd-W, then reopen
**Where:** the dev Zotero window.
**Do:** with the Tabellify tab selected, press Cmd-W. Then choose Tools → Tabellify….
**Expected:** Cmd-W closes **only the Tabellify tab**: the dev Zotero window stays open, and
the PDF tab and library tab stay. Tools → Tabellify… then opens a fresh Tabellify tab. If
Cmd-W closed something else (for example the whole dev Zotero window), write that in Notes,
reopen the dev Zotero window by clicking the Zotero icon in the Dock, and continue.

- [ ] Pass  [ ] Fail
- Notes:

### Step 15: Close the Tabellify tab from its right-click menu, then reopen
**Where:** the dev Zotero window.
**Do:** right-click the Tabellify tab in the tab bar. In the menu that appears, choose the
close item (the spec calls it "Close"; write the real label in Notes). Then choose
Tools → Tabellify….
**Expected:** the Tabellify tab closes. Tools → Tabellify… opens a fresh Tabellify tab. Keep
this Tabellify tab open for Part G.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part G: AC5 (disable removes the tab), AC7 (re-enable works), AC8 (main window close)

### Step 16: Disable Tabellify with the Tabellify tab open
**Where:** the dev Zotero window, then the Plugins window.
**Do:** check that the Tabellify tab is in the tab bar (open it with Tools → Tabellify… if
not). In the dev Zotero window choose Tools → Plugins. In the Plugins window, switch
Tabellify off with the unlabeled toggle switch on the right of the Tabellify row.
**Expected:** the Tabellify row title reads "Tabellify (disabled)". In the dev Zotero window
the Tabellify tab has disappeared from the tab bar. The PDF tab and the library tab are
still there. No error dialog appears.

- [ ] Pass  [ ] Fail
- Notes:

### Step 17: Check the menu item is gone and run the tab check
**Where:** the dev Zotero window, then the Run JavaScript window.
**Do:** in the dev Zotero window click the Tools menu and look for **Tabellify…**. Close the
Tools menu. In the Run JavaScript window click **Run** with the tab check:
```js
Zotero.getMainWindow().Zotero_Tabs.getState().map(t => t.type)
```
**Expected:** the Tools menu has no **Tabellify…** item. The tab check result has no
`"tabellify"`, for example `["library", "reader"]`.

- [ ] Pass  [ ] Fail
- Notes:

### Step 18: Re-enable Tabellify (AC7)
**Where:** the Plugins window, then the dev Zotero window.
**Do:** in the Plugins window switch Tabellify back on with the unlabeled toggle switch on
the right of the Tabellify row. In the dev Zotero window choose Tools → Tabellify….
**Expected:** the Tabellify row title no longer ends in "(disabled)". The Tools menu shows
**Tabellify…** again with a real label (not blank, not `tabellify-menu-open`). Tools →
Tabellify… opens a working Tabellify tab with the heading and sentence from step 5. No error
dialog appears. Close the Plugins window.

- [ ] Pass  [ ] Fail
- Notes:

### Step 19: Close and reopen the dev Zotero window (AC8)
**Where:** the dev Zotero window, then the macOS Dock.
**Do:** check that the tab bar has the Tabellify tab and at least one PDF tab. Close the
Run JavaScript window. Close the dev Zotero window with the red button at its top-left
corner. Zotero keeps running (the Zotero menu bar is still at the top of the screen, and
the Terminal window from step 3 is still busy). Then click the Zotero icon in the Dock.
**Expected:** the dev Zotero window opens again. The PDF tab is back in the tab bar. **No**
Tabellify tab is back. No error dialog appears. If the dev Zotero window does not reopen,
or Zotero quit completely, write that in Notes and go to step 21.

- [ ] Pass  [ ] Fail
- Notes:

### Step 20: Tab check after reopening the dev Zotero window
**Where:** the dev Zotero window, then the Run JavaScript window.
**Do:** in the dev Zotero window choose Tools → Developer → Run JavaScript. In the Run
JavaScript window, leave "Run as async function" unticked, paste the tab check, and click
**Run**:
```js
Zotero.getMainWindow().Zotero_Tabs.getState().map(t => t.type)
```
Then, in the dev Zotero window, choose Tools → Tabellify….
**Expected:** the tab check result contains `"reader"` and has no `"tabellify"`. Tools →
Tabellify… opens a working Tabellify tab in the reopened dev Zotero window.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part H: AC6 (quit and restart) and RT3 (saved session)

> **Stop rule for Parts H and I.** After any restart in these parts (steps 23, 26, 28, 31):
> if a PDF tab that was open at quit is **not** restored, **or** Debug Output (Help → Debug
> Output Logging → View Output) or the Error Console shows
> `Cannot destructure property 'itemID'`, **stop the checklist there.** Mark that step Fail,
> copy the error text and the tab bar contents into Notes, quit Zotero, and report to the
> orchestrator. Do not continue with later steps: they would run on a damaged session.

### Step 21: Arrange PDF tab, Tabellify tab, second PDF tab
**Where:** the dev Zotero window.
**Do:** close every PDF tab and the Tabellify tab (× on each tab), so only the library tab
is left. Then, in this order:
1. Open a PDF from the dev library (double-click an item with a PDF). A first PDF tab opens.
2. Select the library tab and choose Tools → Tabellify…. The Tabellify tab opens.
3. Select the library tab and open a **different** PDF. A second PDF tab opens.

**Expected:** the tab bar shows, left to right: the library tab, the first PDF tab, the
Tabellify tab, the second PDF tab. Write the two PDF titles in Notes. If Zotero puts the tabs
in a different order, write the order in Notes and continue.

- [ ] Pass  [ ] Fail
- Notes:

### Step 22: Quit Zotero with the Tabellify tab open
**Where:** the Zotero menu bar, then Terminal.
**Do:** choose Zotero → Quit Zotero. Wait until the Terminal window from step 3 is ready for
input again (Zotero has fully quit).
**Expected:** Zotero quits without an error dialog.

- [ ] Pass  [ ] Fail
- Notes:

### Step 23: Restart the dev Zotero with Debug Output going to `build/debug-7.txt`
**Where:** Terminal (the same Terminal window as step 3).
**Do:** paste the following line and press Return:
```bash
cd ~/Documents/projects/Active/zotero_plugins/tabellify && /Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText > build/debug-7.txt
```
**Expected:** the dev Zotero window opens. **Both PDF tabs from step 21 are back** in the tab
bar. **No Tabellify tab is back.** No error dialog appears. If either PDF tab is missing, or
`Cannot destructure property 'itemID'` appears, apply the stop rule at the top of Part H.

- [ ] Pass  [ ] Fail
- Notes:

### Step 24: RT3: check what Zotero restored from the saved session
**Where:** the dev Zotero window, then the Run JavaScript window.
**Do:** in the dev Zotero window choose Tools → Developer → Run JavaScript. In the Run
JavaScript window, leave "Run as async function" unticked, paste the code below, and click
**Run**:
```js
Zotero.Session.state.windows.map(w => ({ type: w.type, tabs: (w.tabs || []).map(t => t.type) }))
```
This snippet only reads what Zotero loaded at startup. It changes nothing.
**Expected:** an entry with `type: "pane"` whose `tabs` list contains `"reader"` twice and
**no** `"tabellify"`, for example `[{type: "pane", tabs: ["library", "reader", "reader"]}]`
(other entries may appear). Copy the whole result into Notes.

- [ ] Pass  [ ] Fail
- Notes:

### Step 25: Repeat the quit with Tabellify disabled before quitting
**Where:** the dev Zotero window, then the Plugins window, then the Zotero menu bar.
**Do:**
1. In the dev Zotero window choose Tools → Tabellify…. The Tabellify tab opens between or
   after the two PDF tabs.
2. Choose Tools → Plugins. In the Plugins window switch Tabellify off with the unlabeled
   toggle switch on the right of the Tabellify row (the row title reads
   "Tabellify (disabled)"). The Tabellify tab disappears from the tab bar.
3. Choose Zotero → Quit Zotero and wait until the Terminal window is ready for input again.

**Expected:** each part works as described, and no error dialog appears.

- [ ] Pass  [ ] Fail
- Notes:

### Step 26: Restart the dev Zotero with Debug Output going to `build/debug-8.txt`
**Where:** Terminal (the same Terminal window).
**Do:** paste the following line and press Return:
```bash
cd ~/Documents/projects/Active/zotero_plugins/tabellify && /Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText > build/debug-8.txt
```
Then repeat the RT3 snippet from step 24 in the Run JavaScript window (Tools → Developer →
Run JavaScript, "Run as async function" unticked, **Run**):
```js
Zotero.Session.state.windows.map(w => ({ type: w.type, tabs: (w.tabs || []).map(t => t.type) }))
```
**Expected:** the dev Zotero window opens with both PDF tabs back and no Tabellify tab. The
RT3 result has `"reader"` twice and no `"tabellify"`. Copy the result into Notes. If either
PDF tab is missing, or `Cannot destructure property 'itemID'` appears, apply the stop rule at
the top of Part H.

- [ ] Pass  [ ] Fail
- Notes:

### Step 27: Leave the dev profile tidy
**Where:** the dev Zotero window, then the Plugins window.
**Do:** choose Tools → Plugins and switch Tabellify back on with the unlabeled toggle switch
on the right of the Tabellify row. Close the Plugins window. Choose Tools → Tabellify… once
to confirm the Tabellify tab opens, then close the Tabellify tab with its ×. Quit Zotero
(Zotero → Quit Zotero).
**Expected:** Tabellify is enabled, the Tabellify tab opens and closes without errors, and
Zotero quits normally. Wait until the Terminal window is ready for input again, then go on
to Part I.

- [ ] Pass  [ ] Fail
- Notes:

---

## Part I: AC6 and RT3 in normal use (quit observer registered at app startup)

In Part H, Tabellify's quit observer was always registered in the middle of a session (by
the install in step 4, or by switching Tabellify on in step 18). In normal use it is
registered while Zotero starts up. Zotero notifies quit observers newest first, so the order
can differ between these two cases. This part checks the normal case. **Do not open
Tools → Plugins anywhere in Part I.** The stop rule at the top of Part H applies here too.

### Step 28: Start the dev Zotero with Debug Output going to `build/debug-9.txt`
**Where:** Terminal (the same Terminal window as step 3).
**Do:** paste the following line and press Return:
```bash
cd ~/Documents/projects/Active/zotero_plugins/tabellify && /Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText > build/debug-9.txt
```
Do nothing in Tools → Plugins.
**Expected:** the dev Zotero window opens. The two PDF tabs that were open when Zotero quit
in step 27 are back. No Tabellify tab is back. No error dialog appears. The Tools menu shows
**Tabellify…** (look, then close the menu without choosing anything).

- [ ] Pass  [ ] Fail
- Notes:

### Step 29: Arrange PDF tab, Tabellify tab, second PDF tab
**Where:** the dev Zotero window.
**Do:** close every PDF tab (× on each tab), so only the library tab is left. Then, in this
order:
1. Open a PDF from the dev library (double-click an item with a PDF). A first PDF tab opens.
2. Select the library tab and choose Tools → Tabellify…. The Tabellify tab opens.
3. Select the library tab and open a **different** PDF. A second PDF tab opens.

**Expected:** the tab bar shows the library tab, the first PDF tab, the Tabellify tab, and
the second PDF tab. The Tabellify tab shows the heading and sentence from step 5. Write the
two PDF titles and the tab order in Notes.

- [ ] Pass  [ ] Fail
- Notes:

### Step 30: Quit Zotero with the Tabellify tab open
**Where:** the Zotero menu bar, then Terminal.
**Do:** choose Zotero → Quit Zotero. Wait until the Terminal window is ready for input
again (Zotero has fully quit).
**Expected:** Zotero quits without an error dialog.

- [ ] Pass  [ ] Fail
- Notes:

### Step 31: Restart with Debug Output going to `build/debug-10.txt`, then RT3 and tab check
**Where:** Terminal, then the dev Zotero window, then the Run JavaScript window.
**Do:** paste the following line in Terminal and press Return:
```bash
cd ~/Documents/projects/Active/zotero_plugins/tabellify && /Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText > build/debug-10.txt
```
When the dev Zotero window has opened, choose Tools → Developer → Run JavaScript. Leave "Run
as async function" unticked, paste the RT3 snippet, and click **Run**:
```js
Zotero.Session.state.windows.map(w => ({ type: w.type, tabs: (w.tabs || []).map(t => t.type) }))
```
Then replace it with the tab check and click **Run** again:
```js
Zotero.getMainWindow().Zotero_Tabs.getState().map(t => t.type)
```
Both snippets only read; they change nothing.
**Expected:**
- **Both PDF tabs from step 29 are back** in the tab bar. **No Tabellify tab is back.** No
  error dialog appears.
- The RT3 result has an entry with `type: "pane"` whose `tabs` list contains `"reader"`
  twice and **no** `"tabellify"`.
- The tab check result contains `"reader"` twice and no `"tabellify"`.

Copy both results into Notes. If either PDF tab is missing, or
`Cannot destructure property 'itemID'` appears, apply the stop rule at the top of Part H.

- [ ] Pass  [ ] Fail
- Notes:

### Step 32: Finish
**Where:** the dev Zotero window, then Terminal.
**Do:** close the Run JavaScript window. Choose Zotero → Quit Zotero and wait until the
Terminal window is ready for input again.
**Expected:** Zotero quits normally. Then tell the orchestrator (the Claude Code session in
Terminal) that the run is done, so it can read `build/debug-6.txt`, `build/debug-7.txt`,
`build/debug-8.txt`, `build/debug-9.txt` and `build/debug-10.txt`.

- [ ] Pass  [ ] Fail
- Notes:

---

## Expected Debug Output (checked by the orchestrator, not the owner)

Exact strings written by `src/bootstrap.js` and `src/tabellify.js`. `<id>` is Zotero's tab
id, `<menu id>` contains `open-workspace`, and `<n>` is a reason number. In order of
appearance:

**`build/debug-6.txt`**
- Step 3: `Tabellify: startup (version 0.1.0, reason 1)`, `Tabellify: init (version 0.1.0)`,
  `Tabellify: menu registered (<menu id>)`, `Tabellify: quit observer added`,
  `Tabellify: onMainWindowLoad (reason 9)`,
  `Tabellify: onMainWindowLoad: inserted FTL (already present: false, present now: true)`
- Step 4 (install over the old build): `Tabellify: shutdown (version 0.1.0, reason <n>)`,
  `Tabellify: shutdown`, `Tabellify: quit observer removed` (**only if the installed build
  is already F002**: the build installed before this run is F001, whose shutdown does not
  write this line, so its absence here is expected),
  `Tabellify: menu unregistered (<menu id>): true`,
  `Tabellify: onMainWindowUnload: removed FTL: 1`, then a new startup block:
  `Tabellify: startup (version 0.1.0, reason <n>)`, `Tabellify: init (version 0.1.0)`,
  `Tabellify: menu registered (<menu id>)`, `Tabellify: quit observer added`,
  `Tabellify: onMainWindowLoad: inserted FTL (already present: false, present now: true)`.
  Unlike step 3, this mid-session block has **no** `Tabellify: onMainWindowLoad (reason 9)`
  line: only the `onMainWindowLoad: inserted FTL …` line. (The reason numbers for installing
  the same version over itself are not recorded yet. Write them down.)
- Step 5 (RT4, AC1): `Tabellify: menu command window is main: true`,
  `Tabellify: workspace tab opened (<id>)`
- Step 8 (AC2): `Tabellify: menu command window is main: true`,
  `Tabellify: workspace tab already open; selected it (<id>)` (twice, same `<id>`)
- Steps 12, 14, 15 (AC4): `Tabellify: workspace tab closed (<id>)`, each followed after the
  next menu command by a new `Tabellify: workspace tab opened (<id>)` with a different id
- Step 16 (AC5): `Tabellify: shutdown (version 0.1.0, reason 4)`, `Tabellify: shutdown`,
  `Tabellify: closing workspace tab (<id>)`, `Tabellify: workspace tab closed (<id>)`,
  `Tabellify: quit observer removed`, `Tabellify: menu unregistered (<menu id>): true`,
  `Tabellify: onMainWindowUnload: removed FTL: 1`
- Step 18 (AC7): `Tabellify: startup (version 0.1.0, reason 3)`, `Tabellify: init (version 0.1.0)`,
  `Tabellify: menu registered (<menu id>)`, `Tabellify: quit observer added`,
  `Tabellify: workspace tab opened (<id>)`
- Step 19 (AC8): `Tabellify: onMainWindowUnload (reason <n>)`,
  `Tabellify: closing workspace tab (<id>)`, `Tabellify: workspace tab closed (<id>)`,
  `Tabellify: onMainWindowUnload: removed FTL: 1`; after the Dock click,
  `Tabellify: onMainWindowLoad (reason 9)` and the inserted-FTL line
- Step 22 (AC6): `Tabellify: quit-application-granted: closing workspace tabs`,
  `Tabellify: closing workspace tab (<id>)`, `Tabellify: workspace tab closed (<id>)`, and
  later `Tabellify: shutdown (version 0.1.0, reason 2)` (first observation of quit-time
  shutdown, F001 step 19 note)

**`build/debug-7.txt`** (step 23): the step 3 startup block; **no**
`Cannot destructure property 'itemID'`; Zotero's own lines show two reader tabs restored.

**`build/debug-8.txt`** (steps 26–27): no Tabellify startup lines until step 27 re-enables
Tabellify (Tabellify was disabled at quit); **no** `Cannot destructure property 'itemID'`.

**`build/debug-9.txt`** (steps 28–30, quit observer registered at app startup):
- Step 28: the step 3 startup block, including `Tabellify: quit observer added` and
  `Tabellify: onMainWindowLoad (reason 9)`; **no** `Cannot destructure property 'itemID'`
- Step 29: `Tabellify: menu command window is main: true`,
  `Tabellify: workspace tab opened (<id>)`
- Step 30: `Tabellify: quit-application-granted: closing workspace tabs`,
  `Tabellify: closing workspace tab (<id>)`, `Tabellify: workspace tab closed (<id>)`, and
  later `Tabellify: shutdown (version 0.1.0, reason 2)`. The orchestrator also checks that
  the Tabellify close lines come before Zotero's own session-save lines, if Zotero logs any.

**`build/debug-10.txt`** (steps 31–32): the step 3 startup block; **no**
`Cannot destructure property 'itemID'`; Zotero's own lines show two reader tabs restored.

**Must not appear in any file:** `Tabellify: Zotero_Tabs unavailable; opening workspace window instead`,
`Tabellify: Zotero_Tabs.add failed; opening workspace window instead`,
`Tabellify: Zotero_Tabs.add returned no tab; opening workspace window instead`,
`Tabellify: closed incomplete workspace tab (<id>)`,
`Tabellify: main window closed while opening workspace; not opening a tab`,
`Tabellify: opening workspace window`, `Tabellify: tab title not found in Fluent; using fallback`,
`Tabellify: menu command window is main: false`, and any Tabellify error.

---

## Summary

| AC / check | Steps | Result (Pass / Fail) |
|---|---|---|
| AC1 opens as a tab | 5, 6 | |
| AC2 single instance | 7, 8, 9 | |
| AC3 full screen and maximized | 10, 11 | |
| AC4 closing the tab | 12, 13, 14, 15 | |
| AC4 (optional) reopen closed tab brings back no broken tab | 12a | |
| AC5 disable removes the tab | 16, 17 | |
| AC6 quit/restart, other tabs survive (observer added mid-session) | 21–26 | |
| AC6 quit/restart, other tabs survive (observer added at app startup) | 28–31 | |
| AC7 re-enable works | 18, 27 | |
| AC8 main window close (macOS) | 19, 20 | |
| RT3 saved session has no `"tabellify"` | 24, 26, 31 | |
| RT4 menu command window is main | 5, 29 (log, orchestrator) | |

Automated coverage (run by `npm test`, step 1): AC1, AC2, AC4–AC9, AC11, title fallback and
RT4 log line in `tests/behavior/workspace-tab.test.mjs`; the F001 window path (AC9 fallback)
in `tests/behavior/lifecycle.test.mjs`; AC10 internal-API allow-list, no `Zotero.Session`,
tab type and title message in `tests/static/tabs-api.test.mjs`; observer and tab symmetry in
`tests/static/symmetry.test.mjs`; write guard in `tests/static/write-guard.test.mjs`. The
automated tests use a fake `Zotero_Tabs`. Only this checklist shows what real Zotero does,
in particular whether Tabellify's quit observer runs before Zotero saves its session (AC6)
and whether the tab is closed before the main window's state is saved (AC8, spec Q6).

## Unconfirmed UI labels

Confirmed by the owner in the F001 run: the **Run** button (Cmd-R) and the
**"Run as async function"** checkbox in the Run JavaScript window; the unlabeled toggle
switch on the right of the plugin row in Tools → Plugins; the row title
"Tabellify (disabled)"; Tools → Developer → Run JavaScript; Help → Debug Output Logging →
View Output; Tools → Plugins → Install Plugin From File….

Not confirmed from a checked source (taken from the spec or macOS habit). Please write the
real labels in Notes:
- View → Enter Full Screen in the dev Zotero window, and the green button entering full
  screen (step 10).
- Window → Zoom, and Option-click on the green button for "maximized" (step 11).
- The tab-switching shortcut "Ctrl-;" / "Cmd-;" from the spec (steps 10, 11).
- Whether the tab's × button shows only on hover (step 12).
- Whether Cmd-W closes only the selected tab (step 14); the spec also names a
  File → Close Tab menu item, which is not used here.
- The label of the close item in the tab's right-click menu (step 15).
- Whether Cmd-Shift-T reopens a closed tab in Zotero, and what that command is called
  (step 12a).
- Whether opening a PDF from the items list is a double-click on the item or on its PDF
  attachment (steps 7, 21), and where Zotero places new tabs in the tab bar (step 21).
