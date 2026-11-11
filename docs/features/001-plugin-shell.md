# Feature 001: Plugin Shell

- **Status:** Approved (plan) — implementation starts after T1 verification
- **Branch:** `feat/001-plugin-shell`
- **Related ADRs:** 0002, 0003, 0004, 0005, 0008

## Objective
A minimal Tabellify plugin that loads inside Zotero and opens a dedicated workspace window
showing placeholder content.

## Scope
**In scope:** manifest, bootstrap lifecycle, chrome registration, Fluent strings, one menu
item, a placeholder workspace window, build script, static tests, CI, manual checklist.
**Out of scope:** reading library data, tables, tags, persistence, settings pane, export.

## User stories
- As a researcher, I can install Tabellify and open its workspace from Zotero's menu.
- As a researcher, I can disable or remove Tabellify without errors or side effects.

## Acceptance criteria
- [ ] AC1 `[manual]` + `[auto]` The built `.xpi` installs via Tools → Plugins (drag-and-drop or "Install Plugin From File"). Auto: XPI contains `manifest.json`, `bootstrap.js` at root; manifest fields valid.
- [ ] AC2 `[manual]` After install and after restart, Debug Output shows Tabellify startup messages and no Tabellify errors.
- [ ] AC3 `[manual]` A "Tabellify…" menu item opens the workspace window.
- [ ] AC4 `[manual]` The window shows localized placeholder content (title + short description). Reopening focuses/opens without errors.
- [ ] AC5 `[manual]` + `[auto]` Disabling removes the menu item and closes/cleans up the window with no errors; re-enabling restores it. Auto: register/unregister symmetry check.
- [ ] AC6 `[auto]` + review: `src/` contains no library-write calls (write guard passes).

## Design
- `src/manifest.json` — ID `tabellify@asmithlabs.com`, version `0.1.0`, min 10.0 / max 10.0.* (ADR-0008).
- `src/bootstrap.js` — lifecycle hooks; registers chrome; loads `tabellify.js`; forwards hooks.
- `src/tabellify.js` — `Tabellify` object: `init`, `registerMenu`, `openWorkspace`, `shutdown`.
- `src/content/workspace.xhtml|.js|.css` — placeholder window.
- `src/locale/en-US/tabellify.ftl` — strings.
- `scripts/build-xpi.mjs`, `package.json` (scripts only).

## Zotero APIs used
See `docs/zotero-api-notes.md`. To verify in T1: MenuManager `target` for the Tools menu
(or chosen menu), window-opening call, `Zotero.debug`, registerChrome boilerplate.

## Data safety
Reads nothing from the library. Writes nothing. Write guard enforces this.

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | `git init`, first commit, create public GitHub repo, branch protection | Owner | — | — |
| T1 | Read make-it-red source; verify UNVERIFIED APIs on Zotero 8/9; update api-notes; finalize this spec | architect | T0 | `docs/` |
| T2 | manifest + logging-only bootstrap + build script → installable no-op XPI | developer | T1 | `src/manifest.json`, `src/bootstrap.js`, `scripts/`, `package.json` |
| T3 | Menu item, workspace window, Fluent strings, full cleanup | developer | T2 | `src/tabellify.js`, `src/content/`, `src/locale/` |
| T4 | Static tests + manual checklist | tester | T2 | `tests/`, `docs/testing/manual/001-plugin-shell.md` |
| T5 | CI workflow | developer (worktree) | T2 | `.github/workflows/` |
| T6 | Run tests; owner runs manual checklist | tester + owner | T3, T4 | — |
| T7 | Independent review | reviewer | T5, T6 | read-only |

T3, T4, T5 run in parallel after T2 is merged to `main`.

## Open questions
- ~~Installed Zotero version~~ Resolved: 10.0.8 → verify all APIs against Zotero 10.
- Fluent: Zotero 10 consolidates plugin strings and documents `Zotero.ftl.addResourceIds()`;
  T1 must confirm whether a workspace window still loads `.ftl` via `<link rel="localization">`.
- Menu placement: Tools menu vs. View menu vs. collection context menu.
