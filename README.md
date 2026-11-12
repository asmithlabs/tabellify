# Tabellify

**Turn curated Zotero tags into literature tables.**

Tabellify is a Zotero plugin for researchers doing literature reviews. The goal: tag papers
with a planned list of tags (a codebook), see which tags you have covered, build a synthesis
table with grouped columns, and export it to CSV.

> **Status: early development.** Version 0.1.0 is a plugin shell: it installs, adds
> **Tabellify…** to Zotero's Tools menu, and opens a placeholder workspace window. It does not
> read your library or build tables yet. Everything else is planned; see the
> [roadmap](docs/product-requirements.md).

## Compatibility

Zotero **10.0.x** only (`strict_min_version` 10.0, `strict_max_version` 10.0.* in
[`src/manifest.json`](src/manifest.json)). Zotero refuses to install Tabellify on other
versions.

## Install

1. Download the `.xpi` file from
   [GitHub Releases](https://github.com/asmithlabs/tabellify/releases). No release has been
   published yet; releases will appear there.
2. In Zotero, choose **Tools → Plugins**.
3. In the Manage Your Plugins window, click the gear icon (⚙) in the top-right corner and choose
   **Install Plugin From File…**, then pick the `.xpi` file you downloaded.
4. Tabellify appears in the Plugins window, enabled. In the main Zotero window, choose
   **Tools → Tabellify…** to open the workspace.

If Zotero says the plugin "could not be installed", see
[Troubleshooting](https://github.com/asmithlabs/tabellify/wiki/Troubleshooting).

## Documentation

The user guide and developer reference live in the
[Tabellify wiki](https://github.com/asmithlabs/tabellify/wiki) (source: [`docs/wiki/`](docs/wiki/)).

- Developers: [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/development.md](docs/development.md)
- Architecture: [docs/architecture.md](docs/architecture.md); decisions:
  [docs/decisions/](docs/decisions/)

## Your library is safe

Tabellify reads your Zotero library; it does not change your items, tags, or annotations.
Version 0.1.0 does not read library data at all. Details:
[Data Safety and Privacy](https://github.com/asmithlabs/tabellify/wiki/Data-Safety-and-Privacy).

## Security

Please report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0-or-later](LICENSE) © 2026 Antonio Smith
