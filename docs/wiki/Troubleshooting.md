# Troubleshooting

## "Could not be installed"

Zotero shows a message like: **"… could not be installed. It may be incompatible with this
version of Zotero."**

Common causes and fixes:

1. **Your Zotero version is not 10.0.x.** Tabellify 0.1.0 only installs on Zotero 10.0.x.
   Check your version (macOS: **Zotero → About Zotero**).
   - On Zotero 9 or earlier: update Zotero to 10.0.x.
   - On Zotero 10.1 or later: Tabellify has not been tested there yet, so Zotero refuses it.
     Wait for a Tabellify release that supports your version.
2. **The download is incomplete or damaged.** Delete the `.xpi` file, download it again from
   [GitHub Releases](https://github.com/asmithlabs/tabellify/releases), and install the new
   copy. Make sure you saved the `.xpi` file itself (not a web page) and that the download
   finished.

If neither helps, [collect Debug Output](#collecting-debug-output) while you try to install,
and [report a bug](#reporting-a-bug).

## Choosing Tools → Tabellify… does nothing visible

If a **Tabellify** tab is already open, **Tools → Tabellify…** switches to it rather than
opening a new one. Look for the **Tabellify** tab in the tab bar of the main Zotero window.
If you have several main Zotero windows, the tab opens in the window whose Tools menu you
used.

## The Tabellify… menu item is missing

1. Choose **Tools → Plugins** and check that Tabellify is listed and enabled (the row title
   does not end in "(disabled)"). If it is disabled, click the toggle switch on the right of
   the Tabellify row.
2. If you recently removed and reinstalled Tabellify, see the next section.

## Two copies after remove and reinstall

**Symptom:** after you removed Tabellify and installed it again without restarting Zotero,
the menu item misbehaves, or Debug Output shows `MenuAPI: 'menuID' must be unique` and
`Tabellify: menu registration failed`.

**Cause:** a bug in Zotero 10 (not in Tabellify). Zotero finishes a removal later without
fully shutting the old copy down, so a reinstall in the same session can start a second copy.

**Fix:** quit Zotero completely and start it again. In future, **restart Zotero between
Remove and Install**. Installing a new version over an enabled Tabellify (without removing
it first) is fine.

## PDF or note tabs not restored after a restart

**Symptom:** you start Zotero and some of the PDF or note tabs that were open before are
missing. Debug Output may show an error containing
`Cannot destructure property 'itemID'`.

**Why it can happen:** Zotero saves your open tabs (when you quit, and also automatically
every few minutes) and reopens them at the next start. If a saved list contains a
**Tabellify** tab, Zotero does not know how to reopen it, stops there, and the tabs after it
are not reopened. Tabellify closes its tab just before Zotero saves at quit, so this should
not happen in normal use. It can still happen in rare cases, for example if **Zotero
crashes** (or is forced to quit) while the Tabellify tab is open. This is a known, accepted
risk of Feature 002.

**Your library is not affected.** Only the list of open tabs is lost. Your items, PDFs,
notes, annotations and tags are unchanged.

**What to do:**

1. Reopen the PDFs or notes you need from the library, as usual.
2. When you are done, quit Zotero normally (**Zotero → Quit Zotero** on macOS). Zotero then
   saves your current tabs again, without a Tabellify tab, so the next start should restore
   them normally.
3. If tabs go missing again after a normal quit, that is a Tabellify bug. Please
   [report it](#reporting-a-bug): start Zotero with
   [Debug Output](#collecting-debug-output) enabled (**Restart with Logging Enabled…**),
   and include the lines that start with `Tabellify:` and any line containing
   `Cannot destructure property 'itemID'`. Say whether Zotero crashed or quit normally
   before the problem.

## The workspace opens as a separate window

**Symptom:** **Tools → Tabellify…** opens a separate window titled **Tabellify Workspace**
instead of a **Tabellify** tab.

**Why:** Tabellify opens its tab through a part of Zotero that is not officially documented
for plugins. If it is missing or does not work (for example after a Zotero update),
Tabellify falls back to a separate window so you can still use it. Debug Output then shows a
line such as `Tabellify: Zotero_Tabs unavailable; opening workspace window instead`.

**What to do:** check your Zotero version (it should be 10.0.x) and
[report it](#reporting-a-bug) with the Debug Output lines that start with `Tabellify:`.

## Errors you can ignore

Debug Output may show these messages. They come from Zotero itself, not from Tabellify:

- A failed request (HTTP 404) for
  `https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json`. Zotero checks
  this address for Tabellify updates; the file does not exist yet.
- A `TypeError` about `getTabForBrowser` in `browser-custom-element.mjs`.
- A focus `TypeError` in `basicViewer.xhtml`.

A Tabellify problem is an error line that mentions `tabellify` (for example `tabellify.js`,
`bootstrap.js` from Tabellify, or a `chrome://tabellify/` address). An error containing
`Cannot destructure property 'itemID'` is **not** ignorable; see
[PDF or note tabs not restored after a restart](#pdf-or-note-tabs-not-restored-after-a-restart).

## Collecting Debug Output

Debug Output is Zotero's internal log. Tabellify writes its own lines there, all starting
with `Tabellify: `. Sending these lines with a bug report helps a lot.

Zotero's own instructions: <https://www.zotero.org/support/debug_output>.

1. In the main Zotero window, open the **Help → Debug Output Logging** submenu.
2. Turn logging on. Zotero's documentation names the items in this submenu **Enable**,
   **Restart with Logging Enabled…**, **View Output** and **Submit Output** (names from
   Zotero's docs; not yet checked in Tabellify's own tests). Use **Restart with Logging
   Enabled…** if the problem happens while Zotero starts or while installing; otherwise use
   **Enable**.
3. Do the thing that goes wrong (for example, install Tabellify or choose
   **Tools → Tabellify…**).
4. Choose **Help → Debug Output Logging → View Output**. A window with the log opens.
5. Copy the lines that start with `Tabellify:` and any error lines near them, and paste them
   into your bug report. Do not include anything you consider private; the log can contain
   titles from your library.

**Submit Output** sends the log to Zotero's servers (see Zotero's page). For Tabellify
problems, paste the relevant lines into a GitHub issue instead.

## Reporting a bug

Open an issue at <https://github.com/asmithlabs/tabellify/issues> using the **Bug report**
template. Include your Tabellify version, Zotero version, operating system, steps to
reproduce, and the Debug Output lines.

Security problems: do **not** open a public issue; follow
[SECURITY.md](https://github.com/asmithlabs/tabellify/blob/main/SECURITY.md).
