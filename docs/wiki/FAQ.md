# FAQ

Short answers to common questions about Tabellify, with links to the pages that explain
more.

## Questions and answers

**What does Tabellify do?**
You plan a list of tags (a [codebook](Codebooks)), tag highlights in your papers with them in
Zotero's reader, and Tabellify shows a table: one row per paper, one column per codebook tag,
✓ where the paper uses the tag, and a k/M count. You can [save](Saved-Tables) the table and
[export](Export) it as CSV. See [Getting Started](Getting-Started).

**Which Zotero versions are supported?**
Zotero 10.0.x only. Support for newer Zotero versions is added after testing each one.

**Where do I download it?**
From [GitHub Releases](https://github.com/asmithlabs/tabellify/releases). See
[Getting Started](Getting-Started).

**Will Tabellify change my library or my tags?**
No. Tabellify only reads your library. Adding a tag to the codebook, **Create tag**, dragging
columns and saving tables change only Tabellify's own files. See
[Data Safety and Privacy](Data-Safety-and-Privacy).

**Then how do tags get onto my papers?**
You add them yourself with Zotero's own tools, usually on highlights in the reader. The
**Tabellify tags** section beside the reader shows which codebook tags this paper still
lacks. See [Tag Monitor](Tag-Monitor).

**Why doesn't a tag on the paper itself count?**
By default Tabellify counts only tags on highlights, so each ✓ points to a place in the
text. Tick **Also count tags on the paper itself** in the Tabellify tab to count the paper's
own tags too.

**Do I have to use groups?**
No. Tags typed on their own (`age, sex`) have no group and appear under **Ungrouped** in the
table. You can add groups at any time, for example `Exposure(Heat index, Temperature)`.

**Is there one codebook per collection?**
No. Tabellify has one codebook, used for every collection in every library.

**Can I use group libraries?**
Yes. The **Collection** list in the Tabellify tab shows My Library and every group library
you see in Zotero, each with its collections. Tag counts, the table, saving and export work
the same way. See [Workspace](Workspace#which-papers-are-shown).

**Do I need permission to edit a group library?**
No. Tabellify only reads, so read-only group libraries work too. It never adds tags or
changes anything in a group library, even when you are allowed to edit it.

**Do highlights by other group members count?**
Yes. In a group library, every member's tagged highlights count, just as Zotero shows them.

**Where are my codebook and saved tables stored? Are they synced?**
In the `tabellify` folder inside your Zotero data folder. Zotero sync does not copy them. See
[Data Safety and Privacy](Data-Safety-and-Privacy#tabellifys-own-files).

**If I uninstall Tabellify, is my codebook deleted?**
No. The `tabellify` folder and one setting stay, so a reinstall brings everything back. To
delete them, see [Removing Tabellify's files and
setting](Data-Safety-and-Privacy#removing-tabellifys-files-and-setting).

**Does Tabellify send my data anywhere?**
No. Tabellify's own code makes no network requests. Zotero itself checks GitHub for
Tabellify updates. If AI features are added later, they will be explained before they ship.

**Does the workspace work when Zotero is in full screen?**
Yes. The workspace is a tab inside the main Zotero window. See [Workspace](Workspace).

**Why does the Tabellify tab not come back after I restart Zotero?**
On purpose. Zotero offers plugins no supported way to restore their own tabs, and a saved
Tabellify tab could stop your PDF and note tabs from being restored. So Tabellify closes its
tab just before Zotero saves your open tabs at quit. Reopen it with **Tools → Tabellify…**.
Your codebook, column order and saved tables are kept. If your PDF tabs ever do not come
back after a crash, see
[Troubleshooting](Troubleshooting#pdf-or-note-tabs-not-restored-after-a-restart).

**What is the difference between a snapshot and live?**
A saved table's snapshot is the table exactly as you saved it. **Show live** rebuilds it from
your library today with the same settings. See [Saved Tables](Saved-Tables#snapshot-or-live).

**Can I export to Excel?**
Export CSV opens in Excel, with accents shown correctly. A native Excel (XLSX) export is
**Planned** for later. See [Export](Export).

**Can a cell show the highlighted text instead of ✓?**
Not yet. This is **Planned** for later.

**Can I add my own columns, such as year or study design?**
Not yet. More column options are **Planned** for later.

**Will Tabellify extract information from papers automatically?**
Not yet. AI-assisted filling of the table is **Planned** for later; work has not started.

**Is Tabellify free and open source?**
Yes, under the [AGPL-3.0-or-later](https://github.com/asmithlabs/tabellify/blob/main/LICENSE)
license.

**Something went wrong. What should I do?**
See [Troubleshooting](Troubleshooting).

**Can I contribute?**
Yes. See [Contributing](Contributing).
