# Testing

Strategy: [ADR-0005](Decision-Log). Three layers: unit tests of pure logic, static checks of
the source, and manual checks in a Zotero dev profile.

## 1–2. Unit and static tests (automated)

Run from the repository root (Node 22.2 or newer, no dependencies to install):

```bash
npm test
```

This runs Node's built-in test runner (`node --test`). On the `chore/release-prep` branch
before release, 596 tests ran and passed (2026-11-15).

### Unit tests (`tests/unit/`)

The pure models are classic browser scripts; the tests load them into an empty `node:vm`
sandbox. Stores and the CSV writer get a fake file system or fake I/O.

| File | Checks |
|---|---|
| `codebook-model.test.mjs` | Codebook schema 2, v1 migration, edits, `applyScript`, regroup helpers |
| `codebook-store.test.mjs` | Load/save with a fake `fs`, revision conflicts, `.bak`, one-time `codebooks.v1.json` copy, size limits |
| `tag-script-model.test.mjs` | Tag script parser, errors with positions, `tokenAt` |
| `script-suggest-model.test.mjs` | Suggestion filtering, ranking, Create option, accept edits |
| `tag-monitor-model.test.mjs` | Subcollection walk, counting rule (highlights / item tags, manual only), sorting |
| `table-layout-model.test.mjs` | Column and row moves, layout schema 3 and migrations, drop edges |
| `layout-store.test.mjs` | `layout.json` store with a fake `fs` |
| `regroup-model.test.mjs` | Every drop rule (edges, fallbacks, emptied group turns into a tag) and where things land |
| `csv-model.test.mjs` | CSV rows, quoting, BOM, formula guard, file names |
| `csv-export.test.mjs` | Save dialog and write with a fake `io` (cancel writes nothing, one write) |
| `saved-tables-model.test.mjs` | `tables.json` validation, snapshot, live view, limits |
| `tables-store.test.mjs` | `tables.json` store with a fake `fs` |
| `reader-tags.test.mjs` | The item pane section with fake Zotero objects |
| `workspace-helpers.test.mjs`, `workspace-table.test.mjs` | Workspace helpers and table rendering with a fake DOM |
| `workspace-init-unload.test.mjs` | The real workspace `init()` / `onUnload()` with a fake Zotero (no late observer, SEC-012) |

### Static checks (`tests/static/`)

| File | Checks |
|---|---|
| `xpi.test.mjs` | The built XPI has `manifest.json` and `bootstrap.js` at its root, valid manifest fields, only git-tracked `src/` files with allowed extensions, reproducible build |
| `symmetry.test.mjs` | Every register call has a matching cleanup; observers added are removed; `shutdown()` runs before `chromeHandle.destruct()` |
| `write-guard.test.mjs` | No library-write calls in `src/`; `IOUtils` writes only in the four allow-listed files |
| `no-html-sinks.test.mjs` | No HTML-parsing or code-running sinks (and related patterns) anywhere in `src/` |
| `no-private-logs.test.mjs` | No file paths or error messages in log calls |
| `tabs-api.test.mjs` | Only the four allowed `Zotero_Tabs` methods |
| `workspace-script.test.mjs` | Workspace script order, Zotero API allow-list, listener and observer symmetry |
| `reader-tags-script.test.mjs` | Item pane section API allow-list and wiring |
| `l10n-and-window.test.mjs` | Every Fluent ID used exists and starts with `tabellify-`; window wiring |
| `design-tokens.test.mjs` | ADR-0015 colour rules and contrast in light and dark mode |

### Behaviour tests (`tests/behavior/`)

`lifecycle.test.mjs` and `workspace-tab.test.mjs` run the lifecycle hooks against a mocked
Zotero (`tests/helpers/zotero-mock.mjs`) and a strict fake `Zotero_Tabs`. The fakes model
only source-verified behaviour; what real Zotero does at quit is a manual check.

Never claim tests passed without running them in the same session and pasting the output
(CLAUDE.md rule 5).

## 3. In-Zotero manual checks

Each feature's spec lists its manual acceptance criteria; full step-by-step checklists exist
in [`docs/testing/manual/`](https://github.com/asmithlabs/tabellify/tree/main/docs/testing/manual)
for Features 001 and 002. While the project was in prototype mode (Features 002 to 008), the
owner ran one smoke test per feature instead. Manual checks run in a **separate Zotero dev
profile**, never a real library. Setup:
[docs/development.md](https://github.com/asmithlabs/tabellify/blob/main/docs/development.md).

```bash
npm run build      # build/tabellify-<version>.xpi
/Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText > build/debug-N.txt
```

Install the build in the dev profile with **Tools → Plugins → Install Plugin From File…**.

Automating in-Zotero tests is a possible future ADR.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `npm test` and `npm run build` on every pull
request and on pushes to `main`, with read-only permissions and actions pinned to commit
SHAs. CI never publishes anything.
