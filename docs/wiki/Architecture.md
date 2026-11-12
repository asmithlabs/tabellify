# Architecture

Source of truth:
[docs/architecture.md](https://github.com/asmithlabs/tabellify/blob/main/docs/architecture.md)
and the [Decision Log](Decision-Log). This page is an overview; follow the links for detail.

## Platform

Tabellify is a **bootstrapped Zotero plugin** for Zotero 10.0.x (ADR-0008). Zotero runs on
Mozilla's platform (Firefox 140 ESR for Zotero 8–10), so plugin code is privileged
JavaScript with access to Zotero internals and the file system.

- Plain modern JavaScript (ES2022+, strict mode), JSDoc for types, **no bundler** (ADR-0003).
- `src/` is the plugin root and is zipped as-is into the `.xpi`.
- Plugin ID `tabellify@asmithlabs.com` (permanent, ADR-0002); preference prefix
  `extensions.tabellify.`.
- All user-visible strings go through Fluent (`src/locale/en-US/tabellify.ftl`), IDs
  prefixed `tabellify-`.

## Files (version 0.1.0)

| File | Role |
|---|---|
| `src/manifest.json` | Identity, version, Zotero range (10.0 – 10.0.*), `update_url` |
| `src/bootstrap.js` | Lifecycle hooks Zotero calls; registers `chrome://tabellify/`, loads `tabellify.js`, forwards hooks |
| `src/tabellify.js` | `Tabellify` object: menu registration, opening/focusing/closing the workspace window, FTL link per main window, cleanup |
| `src/content/workspace.xhtml`, `workspace.css` | Placeholder workspace window (no script) |
| `src/locale/en-US/tabellify.ftl` | Strings: menu label, window title, placeholder text |
| `scripts/build-xpi.mjs` | Builds `build/tabellify-<version>.xpi` with Node built-ins only |
| `scripts/publish-wiki.sh` | Copies `docs/wiki/` into a local wiki clone and commits (no push) |

See [Plugin Lifecycle](Plugin-Lifecycle) for how these fit together at runtime.

## Layering

`src/modules/` (**Planned**, does not exist yet) will hold pure logic (table model, CSV,
codebook) with no Zotero globals, so Node can test it. A thin **data-access layer**
(**Planned, F003**) will be the only code that reads `Zotero.*` library data and will hand
plain objects to `modules/`.

## UI surfaces

| Surface | Status |
|---|---|
| Tools menu item **Tabellify…** (`Zotero.MenuManager`) | Shipped in F001 |
| Workspace as a separate chrome window (ADR-0004) | Shipped in F001 |
| Workspace as a main-window tab (ADR-0009, internal `Zotero_Tabs`) | **Planned (F002)**, replaces the window, which stays as a fallback |
| Tag monitor surface | **Planned (F005)**, not decided |

## Data

- **Reads:** none in F001. Collections, items, tags and annotations, read-only, from
  **F003 (Planned)**.
- **Tabellify-owned data** (codebooks, table configurations): storage format is an open
  decision for **F004 / F007 (Planned)**. Never stored in item fields.
- **Exports:** **Planned (F008)**, written only to a user-chosen location.

## Note on feature numbers

`docs/architecture.md` on `main` still uses the roadmap numbers from before Feature 002 was
inserted (for example, it calls data access "F002"). This wiki uses the renumbered roadmap
(F002 workspace tab, F003 data access, … F010+ AI).
