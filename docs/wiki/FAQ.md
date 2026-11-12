# FAQ

**What does Tabellify do today?**
Version 0.1.0 is a plugin shell: it adds **Tools → Tabellify…** to Zotero, which opens a
placeholder workspace as a **Tabellify** tab in the main Zotero window. Building tables is
planned; see [Home](Home) for the roadmap.

**Which Zotero versions are supported?**
Zotero 10.0.x only. Support for newer Zotero versions is added after testing each one.

**Where do I download it?**
From [GitHub Releases](https://github.com/asmithlabs/tabellify/releases). No release has been
published yet; releases will appear there. See [Getting Started](Getting-Started).

**Will Tabellify change my library or my tags?**
No. Version 0.1.0 does not even read your library. The only Zotero state it touches is its
own Tabellify tab in Zotero's list of open tabs. Later versions will read collections,
items, tags and annotations, but not change them. See
[Data Safety and Privacy](Data-Safety-and-Privacy).

**Does Tabellify send my data anywhere?**
No. Tabellify's own code makes no network requests. Zotero itself checks GitHub for
Tabellify updates. Planned AI features (F010+) will be documented before they ship.

**Does the workspace work when Zotero is in full screen?**
Yes. Since Feature 002 the workspace is a tab inside the main Zotero window, so it stays in
the full-screen window with your library and PDF tabs. (Feature 001 used a separate window,
which got left behind in full screen.) See [Workspace](Workspace).

**Why does the Tabellify tab not come back after I restart Zotero?**
On purpose. Zotero offers plugins no supported way to restore their own tabs, and a saved
Tabellify tab could stop your PDF and note tabs from being restored. So Tabellify closes its
tab just before Zotero saves your open tabs at quit. Reopen it with **Tools → Tabellify…**.
If your PDF tabs ever do not come back, see
[Troubleshooting](Troubleshooting#pdf-or-note-tabs-not-restored-after-a-restart).

**Why did Tabellify open a separate window instead of a tab?**
That is an automatic fallback for when Zotero's tab system is not available to Tabellify
(for example after a Zotero update changed it). Please
[report it](Troubleshooting#reporting-a-bug); Tabellify probably needs an update.

**Can I export to Excel?**
**Planned.** CSV export is Feature F008, with Excel (XLSX) as an optional later step. See
[Export](Export).

**Is Tabellify free and open source?**
Yes, under the [AGPL-3.0-or-later](https://github.com/asmithlabs/tabellify/blob/main/LICENSE)
license.

**Something went wrong. What should I do?**
See [Troubleshooting](Troubleshooting).

**Can I contribute?**
Yes. See [Contributing](Contributing).
