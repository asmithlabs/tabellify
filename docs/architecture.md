# Tabellify — Architecture

Status: v0.1.0 (updated 2026-11-15 to match the code in `src/` at release 0.1.0). Covers
the Accepted ADRs through ADR-0019. ADR-0020 (release and update integrity) is Proposed
and not reflected here. Updated by the architect when ADRs are accepted.

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
             │   item pane section, l10n                                                from startup
```

Zotero can enable/disable a plugin **without restarting**, so `shutdown()` must undo
everything `startup()` did, and window hooks must be symmetric. This is enforced by a
static test (`tests/static/symmetry.test.mjs`) and by review (CLAUDE.md rule 9).

## 3. Components

```
src/
├── manifest.json            identity + compatibility
├── bootstrap.js             thin: forwards lifecycle hooks to the Tabellify object
├── tabellify.js             plugin object: init/shutdown, menu item, workspace tab (window fallback), quit cleanup
├── reader-tags.js           F005b: "Tabellify tags" item pane / reader section (read-only)
├── content/                 the workspace page and everything it loads
│   ├── workspace.xhtml      the page (shown in the main-window tab; F001 window as fallback)
│   ├── workspace.js         UI controller: reads Zotero, renders, handles events
│   ├── tokens.css           F005d: design tokens, linked before workspace.css (ADR-0015)
│   ├── workspace.css        component styles (semantic tokens only)
│   ├── *-model.js           PURE logic, no Zotero globals (see below)
│   ├── *-store.js           load/save of Tabellify's own JSON files (codebook, layout, tables)
│   ├── csv-export.js        F008: save dialog + the one write of the exported CSV (ADR-0017)
│   └── icons/               item pane section icons
└── locale/en-US/            Fluent strings (tabellify.ftl)
```

**Pure logic lives in `src/content/*-model.js`, not `src/modules/`.** CLAUDE.md's baseline
names `src/modules/` for pure logic; the established practice since F004 is to keep these
files beside the page that loads them, as classic scripts that each define one global
(`TabellifyCodebook`, `TabellifyTagScript`, `TabellifyScriptSuggest`, `TabellifyTagMonitor`,
`TabellifyTableLayout`, `TabellifyRegroup`, `TabellifySavedTables`, `TabellifyCsv`). The rule
that matters is kept: the model files use no Zotero, DOM, `IOUtils` or `PathUtils` globals,
so `node:test` loads them directly (`tests/unit/`). There is no `src/modules/` folder.
(Moving them would be a separate, owner-approved change.)

Model files: `codebook-model.js`, `tag-script-model.js`, `script-suggest-model.js`,
`tag-monitor-model.js`, `table-layout-model.js`, `regroup-model.js`,
`saved-tables-model.js`, `csv-model.js`. `workspace.xhtml` loads them with `<script>` tags
before the stores and `workspace.js`, after Zotero's `include.js` (which gives the page the
shared `Zotero` object).

**Layering rule.** `workspace.js` (and `reader-tags.js`) are the only code that reads
`Zotero.*` (collections, items, tags, prefs, Notifier). They hand plain objects to the
models. The stores take file functions as a parameter (`fs`), so Node tests pass a fake;
in Zotero they use `IOUtils` / `PathUtils`. The Zotero data directory path
(`Zotero.DataDirectory.dir`, an internal property) is read in one place only,
`TabellifyCodebookStore.dataDir()`.

**Design tokens (ADR-0015).** `tokens.css` is the single source of Tabellify's colours:
`--tabellify-palette-*` primitives (the only colour literals in `src/`) and
`--tabellify-color-*` semantic tokens (light in `:root`, dark in
`@media (prefers-color-scheme: dark)`), plus non-colour tokens. Components use only the
semantic tokens (`tests/static/design-tokens.test.mjs`).

## 4. UI surfaces

| Surface | Use | API basis | Status |
|---|---|---|---|
| Menu item ("Tabellify…") | Open the workspace | `Zotero.MenuManager.registerMenu()` (Zotero 8+) | Built (F001) |
| Workspace tab (main window) | Collection picker, tag script box and groups, tag monitor, per-paper table, saved tables, export | chrome registration + internal `Zotero_Tabs` (`add`/`select`/`close`/`getTabInfo` only) + `<iframe>` loading `workspace.xhtml` (ADR-0009) | Built (F002–F008) |
| Workspace window (fallback) | Same document, used automatically if `Zotero_Tabs` is missing or `add` throws | chrome registration + XHTML window (ADR-0004, superseded) | Built (F001; kept as fallback, F002 AC9) |
| "View table" modal | Read-only copy of the table with Name and Description; save it as a saved table, open a saved table (snapshot or "Show live"), export CSV | `html:dialog` (`#tabellify-view-dialog`) in `workspace.xhtml`, opened with `showModal()`; own Tab wrap and Escape handling (RT-S3 / RT-S3b passed) | Built (F007a) |
| CSV save dialog | User chooses where the CSV goes | Zotero's `FilePicker` module (`chrome://zotero/content/modules/filePicker.mjs`) from the tab's window (RT-S2 passed), only in `csv-export.js` (ADR-0017) | Built (F008) |
| Item pane / reader section ("Tabellify tags") | This paper's codebook progress ("k / M" in the header, remaining tags by group) beside the reader and in the library item pane; read-only | `Zotero.ItemPaneManager.registerSection()` + one `Zotero.Notifier` observer, both registered in `Tabellify.init` and unregistered in `shutdown` (`src/reader-tags.js`, ADR-0013) | Built (F005b) |
| Settings pane | — | — | Not used (planner lives in the workspace, PRD Q3) |

**Tab risk and cleanup (ADR-0009).** Zotero 8+ throws on restore when its saved session
contains a tab type it doesn't know, and then skips every later tab, so a Tabellify tab must
never be saved. Tabellify closes its tabs on `quit-application-granted` (before Zotero saves
the session; checked manually by F002 AC6 with RT3), in `onMainWindowUnload`, and in
`shutdown()` before `chromeHandle.destruct()`. The tab is not restored after a restart.

**Look (ADR-0015).** The workspace document (tab, fallback window and the modal) uses the
Tabellify brand palette through `tokens.css`. The "Tabellify tags" item pane section lives
inside Zotero's own pane and stays Zotero-native (no Tabellify stylesheet is injected into
the main window).

## 5. Data

- **Reads (read-only):** collections, items and their tags, annotation tags, and the
  library tag list (`Zotero.Tags.getAll`) for autocomplete. Tabellify never writes to the
  Zotero library or `zotero.sqlite`.
- **Tabellify-owned data (decided: ADR-0012, 0014, 0016, 0018, 0019):** JSON files in
  `<Zotero data directory>/tabellify/`, each written atomically (`.tmp` then move) with the
  previous version kept as `.bak`, never created until the first save, and never
  overwritten when it could not be read:
  - `codebooks.json` — the codebook (tags, optional groups; schema 2, ADR-0012 / ADR-0016);
    `codebooks.v1.json` is a one-time copy of an old schema 1 file (`mode: "create"`).
  - `layout.json` — column and paper order (schema 3, mixed top-level order; ADR-0014 /
    ADR-0019).
  - `tables.json` — saved tables (schema 1; F007b, ADR-0018).
  - One preference, `extensions.tabellify.countItemTags` ("Also count tags on the paper
    itself").
- **Exports:** CSV (UTF-8 with BOM) written only to the path the user picks in the save
  dialog, via `IOUtils.writeUTF8` with a `tmpPath` (ADR-0017).
- **Write guard.** `tests/static/write-guard.test.mjs` fails on any library or disk write
  call on its deny list anywhere in `src/`, except four allow-listed entries, each "IOUtils write" in one file and tied to
  a spec or ADR:
  1. `content/codebook-store.js` (F004)
  2. `content/layout-store.js` (ADR-0014)
  3. `content/csv-export.js` (F008, ADR-0017)
  4. `content/tables-store.js` (F007b)

## 6. Tooling

- Plain JavaScript, no bundler (ADR-0003). `src/` ships as-is.
- `scripts/build-xpi.mjs` zips `src/` → `build/tabellify-<version>.xpi`.
- Tests: `node:test` for unit (`tests/unit/`) and static checks (`tests/static/`); manual
  in-Zotero checklist (ADR-0005).
- CI: GitHub Actions — tests + build on every PR; never publishes.

## 7. Development environment

A dedicated Zotero **dev profile and data directory** — the owner's real library is never
loaded during development. See `docs/development.md`.
