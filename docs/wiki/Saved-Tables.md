# Saved Tables

**View table** shows the finished table on its own, with a Name and a Description. **Save
table** keeps it, so you can look at your earlier work again later, even after you have
tagged more papers or changed the codebook. Saving, opening and deleting tables never
changes your Zotero library.

## View table

1. In the [Tabellify tab](Workspace), choose a collection (or several, with
   [Choose several…](Workspace#show-several-collections-or-subcollections-in-one-table)).
2. Under the table, click **View table**.

**What you should see:** a panel over the Tabellify tab with the heading **View table**, the
note "Not saved yet. Save table keeps this table with its name and description.", a **Name**
field (filled in with the collection's name, or the chosen collections' names separated by
commas, and selected, so you can type over it), a **Description** field, and a read-only
copy of the table: the same columns (including **Subcollection**, if shown), papers, order,
group header rows, ✓ cells and k/M as in the workspace, without grips or sort buttons. A wide table scrolls
inside the panel.

- **Name** (up to 200 characters) is also used as the name of the exported CSV file.
- **Description** (up to 2,000 characters) is for your own notes about the table. It is not
  written into the CSV file.
- Buttons: **Save table**, **Export CSV** (see [Export](Export)) and **Close**. **Esc** also
  closes the panel. While it is open, Tab moves only between the panel's fields and buttons.
- If you close the panel without saving, the Name and Description you typed are remembered
  for that collection until you close the Tabellify tab.
- If the library changes while the panel is open, the table in it is updated.

## Save a table

In **View table**, type a **Name** (required) and, if you like, a **Description**, then click
**Save table**.

**What you should see:** "Table saved." The heading changes to **Saved table**, and a line
under it reads "Snapshot from *date* · *library* · *collection*", where *library* is
**My Library** or the name of the group library. The table appears in the **Saved
tables** list.

Saving from **View table** always creates a **new** saved table; it never overwrites an older
one. Two tables may have the same name.

A saved table holds:

- its **Name** and **Description**;
- its **settings**: the collection, or the collections you chose with **Choose several…**
  (including any subcollection you left out), the column order, the paper order (sort or manual order)
  and whether **Also count tags on the paper itself** was ticked;
- a **snapshot**: the table exactly as it was when you saved it (titles, columns, ✓ cells,
  k/M, and the Subcollection column if it was shown). Because of this, `tables.json` contains your paper titles; see
  [Data Safety and Privacy](Data-Safety-and-Privacy).

## The Saved tables list

In the Tabellify tab, click **Saved tables** (under the collection row) to open the list. The
heading shows how many tables are listed.

- **Show:** **All collections** (default) or **Current selection**: only tables made from
  exactly what the Tabellify tab shows now. A table saved from one collection matches when
  that collection is chosen on its own; a table saved from several collections matches when
  you tick the same collections again.
- Each entry shows the Name, then the library (**My Library** or the group library's name),
  the collection, the number of papers and columns, and when it was saved, for example
  "Lab Group · Shared papers · 12 papers · 5 columns · Saved 14 Nov 2026, 15:40". A table
  made from several collections lists their names, for example "My Library · Asthma, COPD,
  Diabetes · 20 papers · 6 columns · Saved …" (the first three, then "+2 more" and so on).
  If the collection no longer exists, its old name is shown with "(collection not found)". If its
  group library was removed from your Zotero, the library name is left out as well.
- Saved tables of every library are kept together in one list. **All collections** shows
  them all, whichever library the chosen collection is in.
- **Open** shows the table in the **Saved table** panel.
- **Export CSV** exports the saved snapshot; see [Export](Export).
- **Delete** asks "Delete this saved table? This cannot be undone." with **Delete** and
  **Cancel**. After deleting you see "Saved table deleted."

Messages: "No saved tables yet. Open "View table" and click "Save table"." / "No saved tables
for this collection." / "Choose a collection to see its saved tables."

## Snapshot or live

A saved table always opens as its **snapshot**: exactly what you saved. In the **Saved
table** panel:

- **Show live** rebuilds the table from your library **now**, with the saved settings and the
  current codebook. A table saved from several collections is rebuilt from the same
  collections, including subcollections added since under a ticked parent. While it builds you see "Building the live table…". Then the line under
  the heading reads "Live: built from your library now · *library* · *collection*".
- **Show snapshot** goes back to the saved snapshot.
- **Update snapshot** (only in the live view) replaces the saved snapshot with the live
  table. You see "Snapshot updated."
- **Save as new table** (only in the live view) keeps the old table and saves the live
  version as a new one. You see "Saved as a new table."
- **Save changes** saves your edits to Name and Description. You see "Changes saved."
- **Export CSV** exports what is shown: the snapshot or the live table.
- **Close** closes the panel.

Notes on the live view:

- Columns come from the **current** codebook. Saved columns that are no longer in the
  codebook are named in a note: "Saved columns that are no longer in the codebook: …".
- If some of a saved table's collections no longer exist, the live table is built from the
  rest, with a note such as "1 saved collection is no longer available."
- **Update snapshot** and **Save as new table** keep the saved table's collections, not what
  the Tabellify tab shows now.
- It is built once per click; to follow later changes, click **Show snapshot**, then **Show
  live** again.
- **Show live** is not available when none of its collections is left: "This table's collection is no longer available (it
  was deleted, is in the trash, or its group library was removed), so only the saved
  snapshot can be shown." or "The codebook could not be loaded, so the live
  table cannot be built." If reading fails you see "The live table could not be built. The
  saved snapshot is still shown."

Opening a saved table, or showing it live, never changes the workspace: not the chosen
collection, not the column or paper order, not the **Also count tags on the paper itself**
setting.

Unsaved edits to a saved table's Name or Description are remembered until you close the
Tabellify tab; they are written only when you click **Save changes**.

## Limits

Tabellify keeps at most **100** saved tables, each with at most **5,000** papers and **500**
columns. You see a message if a save would go over a limit, for example "Tabellify keeps at
most 100 saved tables. Delete one first."

## Where saved tables are stored

In `tables.json` in Tabellify's own folder, with the previous version as `tables.json.bak`.
If you saved tables with Tabellify 0.2.x, the first save after updating also keeps a copy of
the old file as `tables.v1.json`; see
[Data Safety and Privacy](Data-Safety-and-Privacy#tabellifys-own-files).
They are **not synced** by Zotero sync. See [Data Safety and Privacy](Data-Safety-and-Privacy).

If the file cannot be read, the list shows "The saved tables file could not be read. Saving
is turned off so the file is not overwritten." with the file's location; see
[Troubleshooting](Troubleshooting#saved-tables-could-not-be-read).

If you have Tabellify open in two Zotero windows and change saved tables in both, you may see
"Saved tables were changed in another Tabellify tab and have been reloaded. Repeat your last
change."

## Planned

These are not available yet:

- Loading a saved table back into the workspace, version history, undoing a delete, and
  sharing or importing saved tables.
- Excel (XLSX) export.
