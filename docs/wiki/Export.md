# Export

Tabellify saves a table as a **CSV** file that you can open in Excel, Numbers, LibreOffice,
R, Python or any other tool. The file contains **exactly what the table shows**: the same
columns in the same order and the same papers in the same order. Exporting never changes your
Zotero library.

## Export the workspace table

1. In the [Tabellify tab](Workspace), choose a collection and arrange the table the way you
   want it (sorting, manual order, column order).
2. Under the table, click **Export CSV**.
3. A save dialog titled **Export table as CSV** opens. It suggests a file name made of the
   collection's name and today's date, for example `Heat and health 2026-11-14.csv`. Pick a
   folder, change the name if you like, and click the dialog's save button.

**What you should see:** under the button, "CSV saved:" followed by the file's location.

- **Cancel** in the dialog does nothing and shows no message.
- If a file with that name already exists, your computer's save dialog asks whether to
  replace it. Tabellify replaces the file only after you said yes there.
- The table is taken at the moment you click: changes in the library while the dialog is
  open do not end up in the file.
- Choosing another collection clears the "CSV saved:" line.

## Export from View table or a saved table

- In **View table**, **Export CSV** suggests the **Name** field as the file name, for example
  `Heat study 2026-11-14.csv`. If Name is empty, the collection name is used.
- In the **Saved tables** list, **Export CSV** exports that table's saved snapshot, named
  after the table.
- In a **Saved table** panel, **Export CSV** exports what is shown: the snapshot, or the live
  table after **Show live**.

See [Saved Tables](Saved-Tables). Characters that are not allowed in file names (such as
`/ \ ? * : | " < >`) are removed from the suggested name, and it is shortened to 80
characters. If nothing is left, the name starts with "Tabellify table".

## What is in the file

### Columns

**Title**, then every tag column in the order shown, then two number columns:
**Tags used (k)** and **Codebook tags (M)** (the k/M column, split in two so a spreadsheet can
calculate with it).

### Header rows

- **Two header rows** when the table on screen has group names:
  - row 1: the **group name above each of its tag columns** (repeated above every column of
    the group, so filters work); **empty above ungrouped tags** (the file does not use the
    word "Ungrouped"); empty above Title, k and M;
  - row 2: `Title`, the tag names, `Tags used (k)`, `Codebook tags (M)`.
- **One header row** (just row 2) when the table on screen has only one header row (no group
  has tags).

### One row per paper

- **Title** as shown; "(untitled)" for a paper without a title.
- **Tag cells:** `1` where the table shows ✓, **empty** otherwise. The ✓ follows the same
  counting rule as the screen, including **Also count tags on the paper itself**.
- **k and M:** the two numbers from the k/M cell. Both are empty when the table shows "–"
  (no codebook, or a codebook without tags).

### Example

On screen: Title | **Ungrouped**: age | **Exposure**: Heat index, Temperature | k/M.
The file:

```
,,Exposure,Exposure,,
Title,age,Heat index,Temperature,Tags used (k),Codebook tags (M)
Smith 2020,1,,1,2,3
"Heat, humidity and health",,1,,1,3
(untitled),,,,0,3
```

### File format

- Comma-separated, one line per row, Windows-style line ends (CRLF) after every row.
- **UTF-8 with a byte-order mark (BOM)**, an invisible marker at the start of the file that
  makes Excel read accents and non-Latin titles correctly.
- Cells that contain a comma, a double quote or a line break are put in double quotes, and a
  double quote inside is written twice (the usual CSV rule, RFC 4180).
- **Formula guard:** a spreadsheet would run any cell that starts with `=`, `+`, `-` or `@` as
  a formula. A paper title or tag name could be made to do that on purpose. So when a text
  cell (title, tag, group name) starts with one of these characters (or a tab or line break,
  or their full-width forms), Tabellify puts an apostrophe `'` in front of it and quotes the
  cell. In the spreadsheet you see the text, not a formula result.

## Messages

| Message | What to do |
|---|---|
| CSV saved: *location* | Done |
| The save dialog could not be opened. Nothing was saved. | Try again; if it keeps happening, [report a bug](Troubleshooting#reporting-a-bug) |
| The CSV file could not be saved. Check that you can write to this folder, then try again: *location* | Pick another folder (for example Documents). The old file, if there was one, is unchanged |

Only one export runs at a time; the **Export CSV** buttons are disabled until it finishes.

## Planned

- **Excel (XLSX) export:** **Planned** (optional later step of Feature F008).
- Copy the table to the clipboard, extra columns (authors, year, item key): **Planned** (no
  feature number yet).
- Highlight text in cells: **Planned, Feature 006d**.
