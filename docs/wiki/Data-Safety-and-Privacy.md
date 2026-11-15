# Data Safety and Privacy

Your Zotero library is your research. Tabellify is built so that it never changes it.

## In short

- Tabellify **never writes to your Zotero library**. It does not create, change or delete
  items, collections, tags, notes, highlights (annotations) or attachments, and it never
  writes to Zotero's database.
- It keeps **its own files** in a folder named **`tabellify`** inside your Zotero data
  folder, and writes CSV files only where you choose.
- It **sends nothing over the internet**.

## What Tabellify reads

- The collections in **My Library**.
- For the collection you choose (and its subcollections): the papers, their titles, their
  tags, their file attachments and the tags on their highlights.
- The list of tag names in My Library (for suggestions in the **Tags and groups** box).
- For the paper shown in Zotero's right-hand pane: its tags and its highlights' tags (for
  the **Tabellify tags** section).
- Zotero's change notifications, to know when to recount. Listening cannot change anything.

Reading is done with Zotero's read-only functions. An automated check (the "write guard")
runs on every code change and fails if Tabellify's code contains calls that write to the
library.

### What Tabellify changes outside its own files

- **Its own tab.** Tabellify adds a **Tabellify** tab to Zotero's list of open tabs and closes
  it again. It never closes, moves or changes your other tabs.
- **One setting.** The checkbox **Also count tags on the paper itself** is stored as the
  Zotero setting `extensions.tabellify.countItemTags` (true or false) in your Zotero profile.

## Tabellify's own files

All in the `tabellify` folder of your **Zotero data folder** (the folder that also holds
`zotero.sqlite`; see [where it is](#where-is-my-zotero-data-folder)). They are created only
when you first save something.

| File | Created when | Contains |
|---|---|---|
| `codebooks.json` | You first add a tag or group | Your codebook: tag names and group names |
| `codebooks.json.bak` | From the second save on | The previous version of `codebooks.json` |
| `codebooks.v1.json` | Only if you used an early development build of Tabellify whose codebook had no optional groups | A one-time copy of that old codebook, never overwritten |
| `layout.json` | You first move a column or a paper, or click **Reset columns** / **Clear manual order** | Column order (group IDs and tag names) and your manual paper order per collection (Zotero's internal collection and item keys, not titles) |
| `layout.json.bak` | From the second save on | The previous version of `layout.json` |
| `tables.json` | You first click **Save table** | Your saved tables: Name, Description, settings and a **snapshot that includes paper titles**, item keys, collection, group and tag names |
| `tables.json.bak` | From the second save on | The previous version of `tables.json`, including a table you just deleted, until the next save |
| `*.tmp` | Briefly, during a save | Gone after the save finishes |

Notes:

- `tables.json` is a **second copy** of your paper titles. Deleting a paper in Zotero does not
  remove its title from a saved table's snapshot; delete the saved table for that.
- Every save is done safely: the new file is written next to the old one and then moved into
  place, so a crash during a save does not damage the existing file.
- Before reading a file, Tabellify checks its size and contents. A file that is damaged, too
  large or made by a newer Tabellify is **never overwritten**; Tabellify shows a message with
  the file's location and turns saving off for that file.
- These files are **not synced** by Zotero sync. On a second computer you start with an
  empty codebook and no saved tables.
- **CSV exports** are written only to the location you pick in the save dialog (during the
  write, a temporary file ending in `.tabellify-tmp` briefly sits next to it). See
  [Export](Export).

## Removing Tabellify's files and setting

**Uninstalling Tabellify does not remove the `tabellify` folder or the
`extensions.tabellify.countItemTags` setting.** This is on purpose: Zotero runs the same
"uninstall" step when it updates a plugin, so deleting there could erase your codebook on
every update. If you reinstall Tabellify, your codebook and saved tables are still there.

To remove everything by hand:

1. Remove Tabellify: in the main Zotero window choose **Tools → Plugins**, click the ⋯ menu
   next to Tabellify and click Remove (label not yet verified).
2. Quit Zotero (macOS: **Zotero → Quit Zotero**) and start it again.
3. **Delete the folder.** Open your Zotero data folder (see below) in Finder, and move the
   folder named **`tabellify`** to the Trash. Do not touch anything else in that folder.
4. **Clear the setting** (optional; it is a single true/false value and harmless to keep).
   In the main Zotero window choose **Tools → Developer → Run JavaScript**. In the Run
   JavaScript window, leave **"Run as async function"** unticked, paste this line and click
   **Run**:
   ```js
   Zotero.Prefs.clear("extensions.tabellify.countItemTags", true)
   ```
   Nothing visible happens; the setting is gone.

### Where is my Zotero data folder?

In the main Zotero window, open Zotero's **Settings** and go to **Advanced → Files and
Folders**. The **Data Directory Location** shows the folder. Zotero's own help:
<https://www.zotero.org/support/zotero_data>. A button to open the folder directly may be
there as well (label not yet verified).

## Debug Output and bug reports

Debug Output is Zotero's internal log (see
[Troubleshooting](Troubleshooting#collecting-debug-output)).

- Tabellify's own lines start with `Tabellify:` and are written to contain only counts,
  internal IDs, file names (such as `codebooks.json`) and error types: no paper titles, tag
  or group names, collection names, table names, or file paths. An automated check guards
  against file paths and error messages in these lines.
- **Zotero's own lines, and Zotero's error reports, can contain file paths** (which often
  include your computer's user name), paper titles and other library details.
- **GitHub issues are public.** Before pasting Debug Output into an issue, read it and remove
  anything you do not want to be public. Paste only the lines that matter.
- On screen, Tabellify does show file locations (for example after "CSV saved:" or in an
  error message about a damaged file); only you see those.

## Network

Tabellify's own code makes no network requests. Like every Zotero plugin, Tabellify tells
Zotero where to look for updates, and Zotero checks
`https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json` in the background.
That request goes to GitHub and contains no library data.

## Your open tabs after a crash

Zotero saves your open tabs and reopens them at the next start. Tabellify closes its tab
just before Zotero saves them when you quit, so normally it is never saved. If Zotero
**crashes** while the Tabellify tab is open, the next start may not reopen some of your PDF
or note tabs. No data is lost; reopen them by hand. See
[Troubleshooting](Troubleshooting#pdf-or-note-tabs-not-restored-after-a-restart).

## Planned

- **AI-assisted extraction and classification** (**Planned, Feature F010+**) may send paper
  content to an external service. Before any such feature ships, this page will explain
  exactly what is sent, where, and how to turn it off.
- Writing to the library (for example adding a tag from the **Tabellify tags** section) is not
  planned for any approved feature. If a future feature ever needs it, it will be documented
  here first.

## Reporting a security problem

Please do not open a public issue. Follow
[SECURITY.md](https://github.com/asmithlabs/tabellify/blob/main/SECURITY.md).
