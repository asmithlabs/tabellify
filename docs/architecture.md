# Tabellify — Architecture

Status: v0.1 (2026-11-11; §3–4 updated 2026-11-13 for ADR-0013). Covers decisions through
ADR-0009, plus ADR-0013 (§4). Updated by the architect when ADRs are accepted.

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
├── tabellify.js           plugin object: init/shutdown, menu registration, workspace tab (window fallback), quit cleanup
├── reader-tags.js         F005b: "Tabellify tags" item pane section (bootstrap scope, read-only)
├── modules/               PURE logic (no Zotero globals) — table model, CSV, codebook
├── content/               workspace page: workspace.xhtml / .css (shown in the main-window tab; F001 window as fallback)
│   └── tokens.css         F005d: design tokens, linked before workspace.css (ADR-0015)
└── locale/en-US/          Fluent strings (tabellify.ftl)
```

`src/content/tokens.css` is the single source of Tabellify's colours (ADR-0015):
`--tabellify-palette-*` primitives (the only colour literals in `src/`) and
`--tabellify-color-*` semantic tokens (light in `:root`, dark in
`@media (prefers-color-scheme: dark)`), plus non-colour tokens. `workspace.xhtml` links it
before `workspace.css`; components use only the semantic tokens.

Layering rule: `modules/` knows nothing about Zotero. A future thin **data-access layer**
(F003) will be the only code that reads from `Zotero.*`; UI talks to it, and it hands plain
objects to `modules/`. This keeps most logic testable in Node and isolates Zotero API
churn to one place.

## 4. UI surfaces

| Surface | Use | API basis | Status |
|---|---|---|---|
| Menu item ("Tabellify…") | Open the workspace | `Zotero.MenuManager.registerMenu()` (Zotero 8+) | F001 |
| Workspace tab (main window) | Planner, builder, saved tables | chrome registration + internal `Zotero_Tabs` (`add`/`select`/`close`/`getTabInfo` only) + `<iframe>` loading `workspace.xhtml` (ADR-0009) | F002 (placeholder) |
| Workspace window (fallback) | Same document, used automatically if `Zotero_Tabs` is missing or `add` throws | chrome registration + XHTML window (ADR-0004, superseded) | F001; kept as fallback (F002 AC9) |
| Settings pane | Possibly codebook management (sketch) | `Zotero.PreferencePanes.register()` | Pending Q3 |
| Item pane / reader section ("Tabellify tags") | This paper's codebook progress ("k / M" in the header, remaining tags by super-tag) beside the reader and in the library item pane; read-only | `Zotero.ItemPaneManager.registerSection()` + one `Zotero.Notifier` observer, both registered in `Tabellify.init` and unregistered in `shutdown` (`src/reader-tags.js`, ADR-0013) | F005b |

**Tab risk and cleanup (ADR-0009).** Zotero 8+ throws on restore when its saved session
contains a tab type it doesn't know, and then skips every later tab, so a Tabellify tab must
never be saved. Tabellify closes its tabs on `quit-application-granted` (before Zotero saves
the session; ordering UNVERIFIED until F002 AC6), in `onMainWindowUnload`, and in `shutdown()`
before `chromeHandle.destruct()`. The tab is not restored after a restart.

**Look (ADR-0015).** The workspace document (tab and fallback window) uses the Tabellify brand
palette through `tokens.css`. The "Tabellify tags" item pane section lives inside Zotero's own
pane and stays Zotero-native (no Tabellify stylesheet is injected into the main window).

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
