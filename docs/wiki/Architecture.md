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
| `src/tabellify.js` | `Tabellify` object: menu registration, workspace tab (open/select/close per main window), `quit-application-granted` observer, F001 window as fallback, FTL link per main window, cleanup |
| `src/content/workspace.xhtml`, `workspace.css` | Placeholder workspace page (no script): loaded in an `<iframe>` inside the tab, or as the fallback window |
| `src/locale/en-US/tabellify.ftl` | Strings: menu label, tab title (`tabellify-tab-title`), window title, placeholder text |
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
| Workspace as a main-window tab (ADR-0009): internal `Zotero_Tabs` (`add`/`select`/`close`/`getTabInfo` only) + `<iframe>` loading `workspace.xhtml` | Implemented in F002 (unreleased) |
| Workspace as a separate chrome window (ADR-0004, superseded) | F001; kept only as automatic fallback if `Zotero_Tabs` is missing or `add` fails (F002 AC9) |
| Tag monitor surface | **Planned (F005)**, not decided |

### Workspace tab in brief

- **Open:** `openWorkspace(win)` feature-detects `win.Zotero_Tabs`, selects the window's
  existing Tabellify tab if `getTabInfo(id).type === "tabellify"`, otherwise calls `add` with
  type `"tabellify"` (no hyphen), `data: {}`, `select: true` and an `onClose` callback, then
  appends an `<iframe>` with `chrome://tabellify/content/workspace.xhtml` to the returned
  container. Tab ids are kept in a `Map` per main window.
- **Never persisted:** Zotero 8+ fails to restore any saved tab after one of an unknown type,
  so the tab is closed at `quit-application-granted` (before Zotero saves its session), in
  `onMainWindowUnload`, and in `shutdown()` before `chromeHandle.destruct()`. It is not
  restored after a restart. See [Plugin Lifecycle](Plugin-Lifecycle).
- **Risk:** `Zotero_Tabs` is undocumented; the internal-API allow-list is enforced by
  `tests/static/tabs-api.test.mjs`. A crash with the tab open after Zotero's periodic session
  save can still leave a Tabellify entry in `session.json` (accepted residual risk, F002 Q3).

## Data

- **Reads:** no library data in F001/F002. F002 reads only Zotero's in-memory tab list for
  its own tab (`getTabInfo`). Collections, items, tags and annotations, read-only, from
  **F003 (Planned)**.
- **Tabellify-owned data** (codebooks, table configurations): storage format is an open
  decision for **F004 / F007 (Planned)**. Never stored in item fields.
- **Exports:** **Planned (F008)**, written only to a user-chosen location.

## Note on feature numbers

This wiki and `docs/architecture.md` use the roadmap as renumbered when Feature 002 was
inserted (F002 workspace tab, F003 data access, … F010+ AI). Accepted ADRs written before
that keep the old numbers; see the mapping in the [Decision Log](Decision-Log).
