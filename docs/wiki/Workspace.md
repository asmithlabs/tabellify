# Workspace

The workspace is the **Tabellify** tab in the main Zotero window. Everything you do in
Tabellify, except the [Tabellify tags](Tag-Monitor#while-reading-the-tabellify-tags-section)
section beside the reader, happens here.

## Open it

In the main Zotero window, choose **Tools → Tabellify…** in the menu bar.

**What you should see:** a new tab titled **Tabellify** appears in the tab bar at the top of
the main Zotero window and is selected. Because it is part of the main window, it also works
when Zotero is maximized or in full screen.

- Choosing **Tools → Tabellify…** again while the tab is open switches to that tab; it does
  not open a second one.
- With several main Zotero windows, each can have its own Tabellify tab. The tab opens in the
  window whose Tools menu you used.

## What is on the page, top to bottom

1. **Heading: Tabellify Codebook.**
2. **Collection row:** the **Collection** list ("Choose a collection"), the **Refresh**
   button, the **Also count tags on the paper itself** checkbox, and, once a collection is
   chosen and the codebook has tags, one summary line such as **Tags used 2/4 · Papers 3**.
   When every codebook tag is used somewhere in the collection, it adds **All codebook tags
   are used.** See [Tag Monitor](Tag-Monitor).
3. **Saved tables** (closed by default; click it to open). Your saved tables with **Open**,
   **Export CSV** and **Delete**. See [Saved Tables](Saved-Tables).
4. **Tags and groups** box, with its help line and suggestion list. This is where you build
   the codebook. Messages about the codebook ("Codebook saved.", errors) appear right under
   it. See [Codebooks](Codebooks).
5. **Group pills**, for example **Exposure · 2** and **Ungrouped · 1**: one per group with
   the number of tags in it.
6. **Edit groups and tags** (closed by default): rename or delete groups, remove tags.
7. **Table toolbar:** **Reset columns**, and **Manual order** / **Clear manual order** once
   you have put papers in your own order. While you drag a column, a hint here says what the
   drop will do.
8. **The table:** one row per paper; Title, one column per codebook tag, and **k/M**. See
   [Table Builder](Table-Builder).
9. **View table** and **Export CSV** buttons under the table, shown only when the table has
   papers. See [Saved Tables](Saved-Tables) and [Export](Export).

## Which papers are shown

- Only collections in **My Library** are listed. Group libraries are not supported yet.
- Choosing a collection shows the papers in it **and in all its subcollections**. A paper
  that sits in several of them is shown once.
- Papers in the trash, and highlights in the trash, are left out.
- If the collection has no papers you see "No papers in this collection."

## Keeping it up to date

The table and counts update by themselves shortly after you add or remove a tag, move a paper
into or out of the collection, or move a paper to the trash. Click **Refresh** to recount
straight away (for example after a sync). Refresh also reloads the tag suggestions for the
**Tags and groups** box.

## Light and dark mode

The workspace follows Zotero's **Color Scheme** setting (Settings → General). The Tabellify
tab uses Tabellify's own colours; the **Tabellify tags** section beside the reader uses
Zotero's normal look.

## Close it

Click the **×** on the Tabellify tab, like any other tab. Your codebook, column order, paper
order and saved tables are kept; choose **Tools → Tabellify…** to open a fresh tab.

Tabellify also closes its tab by itself:

- **When you turn Tabellify off** (Tools → Plugins, toggle switch on the Tabellify row) or
  remove it.
- **When you quit Zotero.** The Tabellify tab is closed just before Zotero saves your open
  tabs, so it is **not reopened after a restart**. Your other tabs (PDFs, notes) are
  restored as usual. Reopen Tabellify from **Tools → Tabellify…** when you need it.
- **When you close the main Zotero window** that contains it.

Tabellify only ever closes its own tab. It never closes, moves or changes your other tabs.
If Zotero crashes while the Tabellify tab is open, see
[Troubleshooting](Troubleshooting#pdf-or-note-tabs-not-restored-after-a-restart).

What is kept only while the tab is open: unsaved Name and Description text in
**View table**, and the **Saved tables** filter choice.

## Fallback: a separate window

If a future Zotero update changes the internal tab system Tabellify relies on, Tabellify
cannot open a tab. It then automatically opens the workspace as a separate window instead,
with the same content. You do not need to do anything. In that case choosing
**Tools → Tabellify…** again brings the open window to the front, and the window closes by
itself when you turn Tabellify off. Please [report it](Troubleshooting#reporting-a-bug) if
you see this window, because it means Tabellify needs an update.

Background: [ADR-0009](Decision-Log) and
[Feature 002](https://github.com/asmithlabs/tabellify/blob/main/docs/features/002-workspace-tab.md).
