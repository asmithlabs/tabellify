# Tabellify

**Turn curated Zotero tags into literature tables.**

Tabellify is a Zotero plugin for researchers doing literature reviews. Tag papers with a
planned codebook, watch which tags you've covered, build a synthesis table with grouped
columns, and export it to CSV.

> Status: early development (Feature 001 — plugin shell). Not yet usable.

## Planned features
- Work from any Zotero collection
- Curated tag lists (codebooks) with grouped "super-tag" columns
- Tag coverage monitor ("4 of 15 tags used")
- Table builder with customizable, reorderable columns
- Saved table configurations
- CSV export
- Later: AI-assisted extraction and classification

See [docs/product-requirements.md](docs/product-requirements.md).

## Compatibility
Zotero 10.0.x.

## Development
See [docs/development.md](docs/development.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
Architecture: [docs/architecture.md](docs/architecture.md). Decisions: [docs/decisions/](docs/decisions/).

## Safety
Tabellify reads your library; it does not modify your items, tags, or annotations.
Its own data (codebooks, tables) is stored separately.

## License
[AGPL-3.0-or-later](LICENSE) © 2026 Antonio Smith
