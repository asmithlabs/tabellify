# Troubleshooting

## Installing and opening

### "Could not be installed"

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

### Choosing Tools → Tabellify… does nothing visible

If a **Tabellify** tab is already open, **Tools → Tabellify…** switches to it rather than
opening a new one. Look for the **Tabellify** tab in the tab bar of the main Zotero window.
If you have several main Zotero windows, the tab opens in the window whose Tools menu you
used.

### The Tabellify… menu item is missing

1. Choose **Tools → Plugins** and check that Tabellify is listed and enabled (the row title
   does not end in "(disabled)"). If it is disabled, click the toggle switch on the right of
   the Tabellify row.
2. If you recently removed and reinstalled Tabellify, see the next section.

### Two copies after remove and reinstall

**Symptom:** after you removed Tabellify and installed it again without restarting Zotero,
the menu item misbehaves, or Debug Output shows `MenuAPI: 'menuID' must be unique` and
`Tabellify: menu registration failed`.

**Cause:** a bug in Zotero 10 (not in Tabellify). Zotero finishes a removal later without
fully shutting the old copy down, so a reinstall in the same session can start a second copy.

**Fix:** quit Zotero completely and start it again. In future, **restart Zotero between
Remove and Install**. Installing a new version over an enabled Tabellify (without removing
it first) is fine.

### The workspace opens as a separate window

**Symptom:** **Tools → Tabellify…** opens a separate window instead of a **Tabellify** tab.

**Why:** Tabellify opens its tab through a part of Zotero that is not officially documented
for plugins. If it is missing or does not work (for example after a Zotero update),
Tabellify falls back to a separate window so you can still use it. Debug Output then shows a
line such as `Tabellify: Zotero_Tabs unavailable; opening workspace window instead`.

**What to do:** check your Zotero version (it should be 10.0.x) and
[report it](#reporting-a-bug) with the Debug Output lines that start with `Tabellify:`.

## Tabs after a crash

### PDF or note tabs not restored after a restart

**In plain words:** if Zotero crashes (or you force it to quit) while the Tabellify tab is
open, Zotero may not reopen your other tabs the next time it starts. **No data is lost.**
Reopen the PDFs and notes you need from your library by hand. This is a known limitation of
this release, accepted by the maintainer.

**Symptom:** you start Zotero and some of the PDF or note tabs that were open before are
missing. Debug Output may show an error containing `Cannot destructure property 'itemID'`.

**Why it happens:** Zotero saves your open tabs (when you quit, and also automatically every
few minutes) and reopens them at the next start. If a saved list contains a **Tabellify**
tab, Zotero does not know how to reopen it, stops there, and the tabs after it are not
reopened. Tabellify closes its tab just before Zotero saves when you quit normally, so this
only happens after a crash or a forced quit.

**What to do:**

1. Reopen the PDFs or notes you need from the library, as usual.
2. When you are done, quit Zotero normally (**Zotero → Quit Zotero** on macOS). Zotero then
   saves your current tabs again, without a Tabellify tab, so the next start restores them
   normally.
3. If tabs go missing after a **normal** quit, that is a Tabellify bug. Please
   [report it](#reporting-a-bug) with [Debug Output](#collecting-debug-output) (start Zotero
   with **Restart with Logging Enabled…**), including the lines that start with `Tabellify:`
   and any line containing `Cannot destructure property 'itemID'`.

## Counts and the table

### A tag I added does not get a ✓

Check, in this order:

1. **Is it on a highlight?** By default only tags on **highlights** count. Tags on the paper
   itself count only when **Also count tags on the paper itself** is ticked in the Tabellify
   tab. See [Tag Monitor](Tag-Monitor#how-tabellify-decides-a-tag-is-used).
2. **Is the spelling exactly the same**, including capital letters and spaces? `Heat index`
   and `heat index` are different tags. Using the suggestions in the **Tags and groups** box
   avoids typos.
3. **Is it an automatic tag?** Automatic tags (imported with metadata) never count.
4. **Is the paper or highlight in the trash?** Trashed items and highlights are left out.
5. **Is the paper in this collection** or one of its subcollections, and in My Library?
6. Click **Refresh** in the Tabellify tab.

### "Some highlights could not be read"

The full message is "Some highlights could not be read, so their tags are not counted. See
Help → Debug Output Logging for details." Some counts may be too low. Click **Refresh**. If
the message stays, [collect Debug Output](#collecting-debug-output) and
[report a bug](#reporting-a-bug).

### A column disappeared after I dragged it

If you dropped a column on the **upper or lower half** of an ungrouped tag's header, one of
the two tags became a **group name** and left the codebook as a tag. The hint above the table
said "Turn into a group name: …" before you dropped. The tag in Zotero is unchanged; type it
into the **Tags and groups** box again to get its column back. See
[Table Builder](Table-Builder#moving-a-tag-between-groups-by-dragging).

### "The table layout could not be read"

Full message: "The saved table layout could not be read, so the default layout is shown.
Layout changes will not be saved, and the file is left unchanged:" followed by the location
of `layout.json`. The table still works; only your column and paper order are not used.

To fix it: quit Zotero, then in Finder either delete `layout.json` (you lose the saved column
and paper order) or copy `layout.json.bak` over it. Start Zotero again.

A similar message says the layout "was made by a newer version of Tabellify": update
Tabellify.

## Codebook and saved tables

### The codebook could not be loaded

Full message: "Could not load the codebook file. Editing is turned off so that the file is not
overwritten. Fix or delete the file, or copy codebooks.json.bak over it, then reopen
Tabellify. File:" followed by the location of `codebooks.json`.

Tabellify does not touch the damaged file. To fix it:

1. Close the Tabellify tab and quit Zotero.
2. In Finder, open the folder shown in the message (the `tabellify` folder in your Zotero
   data folder).
3. Either copy `codebooks.json.bak` over `codebooks.json` (you get the version before your
   last change), or move `codebooks.json` to the Trash (you start with an empty codebook).
4. Start Zotero and choose **Tools → Tabellify…**.

The same happens if the file is unusually large (over 10 MB). If you see "The codebook file
was made by a newer version of Tabellify", update Tabellify instead.

### Saved tables could not be read

Full message: "The saved tables file could not be read. Saving is turned off so the file is not
overwritten. File:" followed by the location of `tables.json`. You can still use the rest of
Tabellify. Fix it the same way as the codebook above, using `tables.json` and
`tables.json.bak`. Moving `tables.json` to the Trash deletes all saved tables.

### Could not save

- "Could not save the codebook. Your last change is shown but not saved."
- "The table layout could not be saved."
- "The saved tables could not be saved. Nothing was changed."

Tabellify could not write to its folder (for example the disk is full or the folder is
read-only). Your existing files are unchanged. Check free disk space and that your Zotero data
folder is writable, then try again. If it keeps failing,
[collect Debug Output](#collecting-debug-output) and [report a bug](#reporting-a-bug).

### "Changed in another Tabellify tab"

You had Tabellify open in two Zotero windows and changed the same thing in both. Tabellify
reloaded the latest version instead of overwriting it. Repeat your last change.

## Export

### The CSV file could not be saved

Pick a folder you can write to (for example Documents) and try again. See
[Export](Export#messages).

### Accents look wrong in the spreadsheet

Tabellify writes UTF-8 with a byte-order mark, which Excel and Numbers recognise. If another
program shows strange characters, choose "UTF-8" as the encoding when you import the file.

## The Tabellify tags section is missing

1. Check that Tabellify is enabled in **Tools → Plugins**.
2. The section appears for papers and for PDF, EPUB and snapshot files. It is hidden for
   notes.
3. It may be further down in the right-hand pane; click the Tabellify icon in the narrow strip
   of section icons to jump to it.
4. Reader windows separate from the main Zotero window have not been tested.

## Errors you can ignore

Debug Output may show these messages. They come from Zotero itself, not from Tabellify:

- A failed request (HTTP 404) for
  `https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json` while no update
  file has been published there.
- A `TypeError` about `getTabForBrowser` in `browser-custom-element.mjs`.
- A focus `TypeError` in `basicViewer.xhtml`.

A Tabellify problem is an error line that mentions `tabellify` (for example `tabellify.js`,
`workspace.js`, `reader-tags.js`, or a `chrome://tabellify/` address). An error containing
`Cannot destructure property 'itemID'` is explained in
[PDF or note tabs not restored after a restart](#pdf-or-note-tabs-not-restored-after-a-restart).

## Collecting Debug Output

Debug Output is Zotero's internal log. Tabellify writes its own lines there, all starting
with `Tabellify: `. Sending these lines with a bug report helps a lot.

Zotero's own instructions: <https://www.zotero.org/support/debug_output>.

1. In the main Zotero window, open the **Help → Debug Output Logging** submenu.
2. Turn logging on. Zotero's documentation names the items in this submenu **Enable**,
   **Restart with Logging Enabled…**, **View Output** and **Submit Output** (names from
   Zotero's docs; only **View Output** checked in Tabellify's own tests). Use **Restart with
   Logging Enabled…** if the problem happens while Zotero starts or while installing;
   otherwise use **Enable**.
3. Do the thing that goes wrong (for example, install Tabellify or choose
   **Tools → Tabellify…**).
4. Choose **Help → Debug Output Logging → View Output**. A window with the log opens.
5. Copy the lines that start with `Tabellify:` and any error lines near them.

**Privacy:** Tabellify's own lines contain no titles, tag names or file paths, but Zotero's
lines and error reports can contain **file paths (often with your computer's user name),
paper titles and collection names**. GitHub issues are public: read the lines and remove
anything you do not want to share before pasting. See
[Data Safety and Privacy](Data-Safety-and-Privacy#debug-output-and-bug-reports).

**Submit Output** sends the whole log to Zotero's servers (see Zotero's page). For Tabellify
problems, paste the relevant lines into a GitHub issue instead.

## Reporting a bug

Open an issue at <https://github.com/asmithlabs/tabellify/issues> using the **Bug report**
template. Include your Tabellify version, Zotero version, operating system, steps to
reproduce, and the Debug Output lines.

Security problems: do **not** open a public issue; follow
[SECURITY.md](https://github.com/asmithlabs/tabellify/blob/main/SECURITY.md).
