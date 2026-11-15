# Tabellify

**Turn curated Zotero tags into literature tables.**

Tabellify is a Zotero plugin for researchers doing literature reviews. You plan a list of tags
(a **codebook**), tag the highlights in your papers with them in Zotero's reader, and
Tabellify shows a **synthesis table**: one row per paper, one column per codebook tag, a ✓
where the paper uses the tag. You can save the table and export it as CSV.

## What it does (version 0.1.0)

- **Workspace tab.** **Tools → Tabellify…** opens a **Tabellify** tab in the main Zotero
  window. Choose a collection; its papers and those of its subcollections are shown.
- **Codebook in one line.** Type tags and groups into the **Tags and groups** box, for
  example `Exposure(heat index, temperature), age`, and press Enter. Groups are optional.
  Suggestions come from the tags already in your library; a name that is not a Zotero tag
  yet can be added as **Create tag** (codebook only).
- **Table.** Codebook tags become columns, grouped under their group name; tags without a
  group sit under **Ungrouped** headers. The last column, **k/M**, counts how many of the
  M codebook tags a paper uses. Sort by clicking a header, put papers in your own order, and
  drag tag columns to reorder them or move them between groups.
- **While reading.** A **Tabellify tags** section in Zotero's right-hand pane shows "k / M"
  for the paper you are reading and a checklist of the codebook tags it uses.
- **View table and saved tables.** **View table** shows the finished table, read-only, with
  a Name and Description. **Save table** keeps it; open it later as the saved snapshot or **Show live**
  to rebuild it from your library today.
- **Export CSV** saves the table, exactly as shown, to a file you choose.

Planned, not built yet: highlight text inside table cells, column options, AI-assisted
extraction. See the [wiki](https://github.com/asmithlabs/tabellify/wiki).

## Requirements

Zotero **10.0.x** (`strict_min_version` 10.0, `strict_max_version` 10.0.* in
[`src/manifest.json`](src/manifest.json)). Zotero refuses to install Tabellify on other
versions.

## Install

1. Download the `.xpi` file from
   [GitHub Releases](https://github.com/asmithlabs/tabellify/releases). If your browser offers
   to open it, save it instead.
2. In Zotero, choose **Tools → Plugins**.
3. In the Plugins window, click the gear icon (⚙) and choose **Install Plugin From File…**,
   then pick the `.xpi` file you downloaded.
4. Tabellify appears in the Plugins window, enabled. In the main Zotero window, choose
   **Tools → Tabellify…**: a **Tabellify** tab opens with the heading **Tabellify Codebook**.

If Zotero says the plugin "could not be installed", see
[Troubleshooting](https://github.com/asmithlabs/tabellify/wiki/Troubleshooting).

## Your library is safe

Tabellify never writes to your Zotero library: no items, tags, notes, annotations or
collections are created, changed or deleted. It stores its own files in the **`tabellify`**
folder inside your Zotero data folder. Details:
[Data Safety and Privacy](https://github.com/asmithlabs/tabellify/wiki/Data-Safety-and-Privacy).

## Documentation

- User guide and developer reference: the
  [Tabellify wiki](https://github.com/asmithlabs/tabellify/wiki) (source:
  [`docs/wiki/`](docs/wiki/))
- Changes: [CHANGELOG.md](CHANGELOG.md)
- Developers: [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/development.md](docs/development.md)

## Security

Please report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0-or-later](LICENSE) © 2026 Antonio Smith
