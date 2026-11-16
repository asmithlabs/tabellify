# Table Builder

The table in the [Tabellify tab](Workspace) is your synthesis matrix: one row per paper, one
column per [codebook](Codebooks) tag. It is built from the chosen collection and the
codebook, and it changes as you tag highlights. Nothing you do in the table changes your
Zotero library.

## Columns

From left to right:

1. A narrow **grip** column (⠿) for moving papers.
2. **Title** of the paper ("(untitled)" if it has none).
3. **One column per codebook tag**, under a header row with group names:
   - tags in a group sit under that group's name;
   - tags without a group sit under a header that reads **Ungrouped**. Ungrouped tags that
     are next to each other share one **Ungrouped** header; ungrouped tags in different
     places each get their own.
   - If no group has tags, there is only one header row (no group names, no "Ungrouped").
   - A group without tags has no column.
4. **k/M**: how many of the codebook tags the paper uses (see [Tag Monitor](Tag-Monitor)).

A tag cell shows **✓** when the paper uses that tag, and is empty otherwise. Pointing at a cell
shows, for example, "Heat index: Used" or "Heat index: Not used". The header stays visible
when you scroll down; a table with many tags scrolls sideways.

Columns follow the codebook: tags you add, remove or move in the codebook appear, disappear
or move in the table at once.

## Sorting

Click a column header to sort by it; click it again to reverse the order.

- **Title**: alphabetical.
- **k/M**: by the number of codebook tags used.
- **A tag column**: papers with ✓ first (a second click puts them last).

When you choose a collection, papers are sorted by default: fewest codebook tags first (the
papers that need the most work on top), then by title.

## Your own paper order (manual order)

Drag a paper by its **grip** (⠿, at the start of its row) and drop it where you want it. Or
click the grip and press **Option+↑** / **Option+↓** (Alt+↑ / Alt+↓ on Windows and Linux) to
move it one place.

**What you should see:** the paper moves, and the toolbar above the table shows
**Manual order** (pressed) and **Clear manual order**.

- Clicking a column header sorts by that column but **keeps** your manual order; click
  **Manual order** to go back to it.
- **Clear manual order** forgets the order for this collection and goes back to the default
  sort.
- Each collection has its own manual order. Papers added to the collection later appear
  after the papers you arranged.
- The order is kept after you close the tab or restart Zotero.

## Moving columns

Each tag header and each group header has a grip.

- **Drag a group's header** by its grip to move the whole group, left or right. A group can
  be placed between ungrouped tags.
- **Drag a tag's header** by its grip to move that column. Where you drop it decides what
  happens; see the next section.
- From the keyboard: click a column's grip and press **Option+←** / **Option+→** (Alt on
  Windows and Linux). A tag inside a group moves one place within its group; an ungrouped tag
  or a group moves one place left or right among the top-level columns.
- The **"Ungrouped"** headers have no grip: move their tags one by one.
- Title stays first and k/M stays last.
- **Reset columns** puts the columns back in codebook order. It does **not** undo changes to
  groups (grouping lives in the codebook).

The column order is kept after you close the tab or restart Zotero. It is separate from the
codebook: moving a column sideways never changes the codebook.

## Moving a tag between groups by dragging

Dragging a tag column can also change its group. These moves change the **codebook** (the
same as typing in the **Tags and groups** box) and are saved at once: you see "Codebook
saved." with what happened. Your Zotero tags are not changed.

**Where you point decides.** Every header cell has four zones: its left quarter, its right
quarter, and the middle split into an upper half and a lower half. While you drag, a line
shows where the column will go, and the toolbar shows a **hint** with the result:

| Hint | Meaning |
|---|---|
| Move column here | Only the order changes |
| Move into group: *name* | The tag joins that group |
| Move to Ungrouped | The tag leaves its group |
| Turn into a group name: *name* | That tag becomes a group name (see below) |

What each drop does (A = the column you drag):

| You drop A on… | Zone | Result |
|---|---|---|
| a tag **inside a group** | left or right | A joins that group, before or after that tag |
| a **group name** | lower half | A joins that group, at its end |
| a **group name** | left or right | A becomes an ungrouped tag beside the group |
| an **ungrouped tag** B | left or right | A becomes an ungrouped tag beside B |
| an **ungrouped tag** B (or the cells below it) | lower half | **B becomes a group name** and A goes under it |
| an **ungrouped tag** B | upper half | **A becomes a group name** and B goes under it |
| an **Ungrouped** header | left, right or lower half | A becomes ungrouped, at the start or end of that run |

Where a zone is not allowed (for example the upper half of a group name, or above or below a
tag inside a group, because there is no third level), the drop acts like the nearer left or
right zone, and the line and hint show that.

**"Becomes a group name"** means: a group with that name is made (or an existing group with
the same name, ignoring capitals, is used), and that tag **leaves the codebook as a tag**, so
its column and its count in k/M go away. The tag in Zotero is not touched; type it into the
**Tags and groups** box again if you want its column back.

**A group never disappears silently.** If a drag (or a keyboard move) takes the **last** tag
out of a group, the group turns back into an ungrouped tag with the group's name, where the
group was, and the message adds "The group became a tag again." (If a tag with that exact
name already exists, the empty group is simply removed.) This applies to dragging only; a
group emptied in **Edit groups and tags** stays as an empty group.

### The same moves from the keyboard

Click a tag column's grip, then:

| Key (Option on macOS, Alt on Windows and Linux) | Tag inside a group | Ungrouped tag |
|---|---|---|
| Option+← / Option+→ | Move one place within the group | Move one place among the top-level columns |
| Option+↑ | Leave the group: becomes ungrouped right before or after it | If the column to the left is an ungrouped tag B: this tag becomes a group name, B goes under it |
| Option+↓ | Nothing | If the column to the left is an ungrouped tag B: B becomes a group name and this tag goes under it. If it is a group: join that group at its end |

A screen reader announces the result, for example "Temperature moved to group Outcome" or
"Heat index is now ungrouped".

## Where the layout is stored

Column order and manual paper orders are saved in `layout.json` in Tabellify's own folder,
one second after your last move. If that file cannot be read, the table shows the default
layout, your changes are not saved and the file is left alone; see
[Troubleshooting](Troubleshooting#the-table-layout-could-not-be-read).

## Planned

- **Highlight text in cells** (the text of the highlights carrying a tag, instead of ✓) and a
  per-table **Cell content** choice: **Planned, Feature 006d**.
- **Column options** (your own columns, column types, hiding columns, column widths):
  **Planned, Feature F009**.
- One row per highlight instead of one per paper: open product question (Q5), not planned
  yet.
