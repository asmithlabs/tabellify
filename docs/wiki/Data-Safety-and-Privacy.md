# Data Safety and Privacy

Your Zotero library is your research. Tabellify is built so that it never changes it.

## In short

- Tabellify **never writes to your Zotero library**, nor to any group library. It does not
  create, change or delete items, collections, tags, notes, highlights (annotations) or
  attachments, and it never writes to Zotero's database.
- It keeps **its own files** in a folder named **`tabellify`** inside your Zotero data
  folder, and writes CSV files only where you choose.
- It **sends nothing over the internet**.

## What Tabellify reads

- The list of your libraries (**My Library** and every **group library** in your Zotero)
  with their names, and the collections in each of them. Feeds are not read.
- For the collection you choose (and its subcollections), or the collections you tick with
  **Choose several…**: the papers, their titles, their tags, their file attachments and the
  tags on their highlights.
- **Choose several…** only reads the list of collections. It never creates, renames, moves
  or deletes a collection, and never changes what is selected in Zotero's left pane.
- The list of tag names in the chosen collection's library, or in My Library before you
  choose a collection (for suggestions in the **Tags and groups** box).
- For the paper shown in Zotero's right-hand pane: its tags and its highlights' tags (for
  the **Tabellify tags** section).
- Zotero's change notifications, to know when to recount. Listening cannot change anything.

Reading is done with Zotero's read-only functions. An automated check (the "write guard")
runs on every code change and fails if Tabellify's code contains calls that write to the
library.

### Group libraries

- Tabellify **only reads** group libraries, in the same way as My Library. It never adds
  tags or changes anything in a group, even when you are allowed to edit the group, so
  nothing Tabellify does reaches the other members through sync.
- Group names, collection names, paper titles and tags in a group library are written by
  **other people**. Tabellify shows them only as plain text, so such a name cannot run code
  or change the Tabellify page.
- The library name in the **Saved tables** list is looked up each time; it is not stored
  in Tabellify's files.

### What Tabellify changes outside its own files

- **Its own tab.** Tabellify adds a **Tabellify** tab to Zotero's list of open tabs and closes
  it again. It never closes, moves or changes your other tabs.
- **One setting.** The checkbox **Also count tags on the paper itself** is stored as the
  Zotero setting `extensions.tabellify.countItemTags` (true or false) in your Zotero profile.

## Tabellify's own files

All in the `tabellify` folder of your **Zotero data folder** (the folder that also holds
`zotero.sqlite`; see [where it is](#where-is-my-zotero-data-folder)). They are created only
when you first save something.

- **`codebooks.json`**: your codebook (tag names and group names). Created when you first
  add a tag or group.
- **`layout.json`**: the column order (group IDs and tag names) and your own paper order for
  each collection and for each choice of several collections (Zotero's internal collection
  and item keys, not titles). Created when you
  first move a column or a paper, or click **Reset columns** or **Clear manual order**.
- **`tables.json`**: your saved tables: Name, Description, settings and a **snapshot that
  includes paper titles**, item keys, and collection, subcollection, group and tag names.
  Created when you first click **Save table**.
- **`tables.v1.json`**: only if you saved tables with Tabellify 0.2.x. The newer Tabellify
  stores saved tables in a new format, so the first time you save after updating, it keeps a
  one-time copy of your old `tables.json` under this name. It is never overwritten. See
  [Going back to an older Tabellify](#going-back-to-an-older-tabellify).
- **`.bak` files** (`codebooks.json.bak`, `layout.json.bak`, `tables.json.bak`): the previous
  version of each file, from the second save on. `tables.json.bak` can still contain a table
  you just deleted, until the next save.
- **`codebooks.v1.json`**: only if you used an early development build of Tabellify whose
  codebook had no groups. A one-time copy of that old codebook, never overwritten.
- **`.tmp` files**: exist only for a moment during a save.

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

## Going back to an older Tabellify

Saved tables written by the newer Tabellify (with collections chosen through **Choose
several…** and the Subcollection column) use a newer file format. If you install Tabellify
0.2.x again, it shows that the saved tables file was made by a newer Tabellify, turns saving
off and never overwrites the file, so nothing is lost.

To use your saved tables from before the update with 0.2.x:

1. Quit Zotero (macOS: **Zotero → Quit Zotero**).
2. Open the `tabellify` folder in your Zotero data folder (see
   [where it is](#where-is-my-zotero-data-folder)) in Finder.
3. Move `tables.json` somewhere safe (for example your Desktop), so you can return to the
   newer Tabellify later.
4. Select `tables.v1.json`, choose **File → Duplicate** in Finder's menu bar, and rename the
   copy to `tables.json`. Keep `tables.v1.json` itself.
5. Start Zotero.

Tables saved after the update are not in `tables.v1.json`; they are only in the copy you made
in step 3.

## Removing Tabellify's files and setting

**Uninstalling Tabellify does not remove the `tabellify` folder or the
`extensions.tabellify.countItemTags` setting.** This is on purpose: Zotero runs the same
"uninstall" step when it updates a plugin, so deleting there could erase your codebook on
every update. If you reinstall Tabellify, your codebook and saved tables are still there.

The same goes for a group library you leave or remove: `layout.json` may keep that group's
saved paper order (Zotero's internal collection and item keys only, no titles) until you
delete the file, and `tables.json` keeps any tables you saved from that group until you
delete them.

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
  or group names, library or collection names, table names, or file paths. An automated
  check guards against file paths and error messages in these lines.
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

- **AI-assisted filling of the table** is planned for later and may send paper content to an
  external service. Before any such feature ships, this page will explain
  exactly what is sent, where, and how to turn it off.
- Writing to the library (for example adding a tag from the **Tabellify tags** section) is not
  planned. If a future version ever needs it, it will be documented
  here first.

## Reporting a security problem

Please do not open a public issue. Follow
[SECURITY.md](https://github.com/asmithlabs/tabellify/blob/main/SECURITY.md).
