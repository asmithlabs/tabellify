# Tabellify — Architecture

Status: v0.1 (2026-11-11). Covers decisions through ADR-0007. Updated by the architect when
ADRs are accepted.

## 1. Platform

Tabellify is a **bootstrapped Zotero plugin** (Zotero 10.0.x, ADR-0008). Zotero is built on
Mozilla's platform (Firefox 140 ESR for Zotero 8–10), so plugin code is privileged JavaScript
with access to Zotero's internal objects and the file system — unlike a web page.

A plugin is an `.xpi` file (a zip) whose root contains:

- `manifest.json` — identity (`tabellify@asmithlabs.com`), version, compatible Zotero range.
- `bootstrap.js` — lifecycle hooks Zotero calls: `install`, `startup`, `onMainWindowLoad`,
  `onMainWindowUnload`, `shutdown`, `uninstall`.

## 2. Lifecycle (the most important concept)

```
install ─▶ startup ─▶ onMainWindowLoad ─▶ … user works … ─▶ onMainWindowUnload ─▶ shutdown ─▶ uninstall
             │              │                                     │                   │
             │   register chrome, menus,      add window UI        remove window UI   undo everything
             │   prefs pane, l10n                                                       from startup
```

Zotero can enable/disable a plugin **without restarting**, so `shutdown()` must undo
everything `startup()` did, and window hooks must be symmetric. This is enforced by a
static test and by review (CLAUDE.md rule 9).

## 3. Components

```
src/
├── manifest.json          identity + compatibility
├── bootstrap.js           thin: forwards lifecycle hooks to Tabellify object
├── tabellify.js           plugin object: init/shutdown, menu registration, window opening
├── modules/               PURE logic (no Zotero globals) — table model, CSV, codebook
├── content/               workspace window: workspace.xhtml / .js / .css
└── locale/en-US/          Fluent strings (tabellify.ftl)
```

Layering rule: `modules/` knows nothing about Zotero. A future thin **data-access layer**
(F003) will be the only code that reads from `Zotero.*`; UI talks to it, and it hands plain
objects to `modules/`. This keeps most logic testable in Node and isolates Zotero API
churn to one place.

## 4. UI surfaces

| Surface | Use | API basis | Status |
|---|---|---|---|
| Menu item ("Tabellify…") | Open the workspace | `Zotero.MenuManager.registerMenu()` (Zotero 8+) | F001 |
| Workspace window | Planner, builder, saved tables | chrome registration + XHTML window | F001 (placeholder) |
| Settings pane | Possibly codebook management (sketch) | `Zotero.PreferencePanes.register()` | Pending Q3 |
| Item pane / reader section | Tag monitor | `Zotero.ItemPaneManager.registerSection()` | F005, to verify |

## 5. Data

- **Reads:** collections, items, tags (and possibly annotations) — read-only (F003+).
- **Tabellify-owned data:** codebooks and table configurations. Storage format is an open
  ADR for F004/F007 (candidates: JSON file in the Zotero data directory's plugin area,
  Zotero prefs for small settings, a separate SQLite file). Never stored in item fields.
- **Exports:** CSV written only to a user-chosen location (file picker).

## 6. Tooling

- Plain JavaScript, no bundler (ADR-0003). `src/` ships as-is.
- `scripts/build-xpi.mjs` zips `src/` → `build/tabellify-<version>.xpi`.
- Tests: `node:test` for unit and static checks; manual in-Zotero checklist (ADR-0005).
- CI: GitHub Actions — tests + build on every PR; never publishes.

## 7. Development environment

A dedicated Zotero **dev profile and data directory** — the owner's real library is never
loaded during development. See `docs/development.md`.
