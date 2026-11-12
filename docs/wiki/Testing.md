# Testing

Strategy: [ADR-0005](Decision-Log). Three layers.

## 1–2. Unit and static tests (automated)

Run from the repository root (Node 22.2 or newer, no dependencies to install):

```bash
npm test
```

This runs Node's built-in test runner (`node --test`). Current tests (77 in total on the
Feature 002 branch):

| File | Checks |
|---|---|
| `tests/static/xpi.test.mjs` | Built XPI has `manifest.json` and `bootstrap.js` at its root; manifest fields valid (including the required `update_url`); build is reproducible |
| `tests/static/symmetry.test.mjs` | Every register call in `src/` has a matching cleanup call; every observer topic added is removed; the tab `add`/`close` pair exists; `Tabellify.shutdown()` runs before `chromeHandle.destruct()` |
| `tests/static/write-guard.test.mjs` | `src/` contains no library-write calls (`.save(`, `.erase(`, `Zotero.DB` writes, …) |
| `tests/static/l10n-and-window.test.mjs` | Strings and window wiring (Fluent IDs, `windowtype`, `global.css` loaded before `<window>`, no hard-coded background) |
| `tests/static/tabs-api.test.mjs` | F002: internal-API allow-list (only `Zotero_Tabs.add/select/close/getTabInfo`), no `Zotero.Session`, tab type exactly `"tabellify"` with `data: {}`, tab-title Fluent ID exists |
| `tests/behavior/lifecycle.test.mjs` | Runs the lifecycle hooks against a mocked Zotero (`tests/helpers/zotero-mock.mjs`): cleanup happens and in the right order; F001 window path |
| `tests/behavior/workspace-tab.test.mjs` | F002 against a strict fake `Zotero_Tabs` and `Services.obs`: tab shape and title (with fallback), single instance, `onClose`, shutdown/quit/unload closing, re-enable, fallback to the window, menu-command window choice |

The fake `Zotero_Tabs` models only source-verified behaviour and throws on any other member.
It cannot show what real Zotero does at quit (observer order vs session save); that is the
manual F002 checklist's job.

Unit tests for pure logic in `src/modules/` are **Planned** (no modules exist yet).

Never claim tests passed without running them in the same session and pasting the output
(CLAUDE.md rule 5).

## 3. In-Zotero manual checks

Each feature has a checklist in
[`docs/testing/manual/`](https://github.com/asmithlabs/tabellify/tree/main/docs/testing/manual)
that the maintainer runs in a **separate Zotero dev profile**, never a real library
(`001-plugin-shell.md`, `002-workspace-tab.md`; the F002 one includes quit/restart checks of
Zotero's saved session). Setup:
[docs/development.md](https://github.com/asmithlabs/tabellify/blob/main/docs/development.md).

```bash
npm run build      # build/tabellify-<version>.xpi
/Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev
```

Install the build in the dev profile with **Tools → Plugins → Install Plugin From File…**.

Automating in-Zotero tests is a possible future ADR.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `npm test` and `npm run build` on every pull
request and on pushes to `main`, then lists the XPI contents. CI never publishes anything.
