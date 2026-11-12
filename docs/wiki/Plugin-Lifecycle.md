# Plugin Lifecycle

Zotero calls a bootstrapped plugin's hooks in `bootstrap.js` at fixed moments, and can
enable or disable a plugin **without restarting**. So everything added in `startup()` /
`onMainWindowLoad()` must be removed in `shutdown()` / `onMainWindowUnload()` (lifecycle
symmetry, CLAUDE.md rule 9). Code: [`src/bootstrap.js`](https://github.com/asmithlabs/tabellify/blob/main/src/bootstrap.js),
[`src/tabellify.js`](https://github.com/asmithlabs/tabellify/blob/main/src/tabellify.js).

```
install ─▶ startup ─▶ onMainWindowLoad ─▶ … ─▶ onMainWindowUnload ─▶ shutdown ─▶ uninstall
```

## What Tabellify does in each hook (version 0.1.0)

| Hook | Tabellify 0.1.0 |
|---|---|
| `install` | Log only |
| `startup` | Register the `chrome://tabellify/content/` package (`registerChrome`), load `tabellify.js`, call `Tabellify.init()`: register the Tools menu item, then run the per-window setup for main windows that are already open |
| `onMainWindowLoad` | Insert `tabellify.ftl` into that main window (`insertFTLIfNeeded`) so the menu label resolves |
| `onMainWindowUnload` | Remove every `link[href="tabellify.ftl"]` from that window |
| `shutdown` | 1. Close all `tabellify:workspace` windows. 2. Unregister the menu. 3. Remove the FTL link from every main window. 4. Destroy the chrome registration (`chromeHandle.destruct()`), **after** the windows are closed. Each step has its own `try/catch` |
| `uninstall` | Log only (no stored data to remove) |

Reason codes (logged, never branched on): `APP_STARTUP 1`, `APP_SHUTDOWN 2`,
`ADDON_ENABLE 3`, `ADDON_DISABLE 4`, … `MAIN_WINDOW_LOAD 9`. Zotero 10 passes 9 to
`onMainWindowUnload` too, which is why Tabellify never branches on the reason.

## Logging

Every log line goes to Zotero's Debug Output with the prefix `Tabellify: ` (for example
`Tabellify: startup (version 0.1.0, reason 1)`, `Tabellify: menu registered (…)`,
`Tabellify: onMainWindowUnload: removed FTL: 1`). Errors use `Zotero.logError`. The full list
of expected lines per step is in the
[F001 manual checklist](https://github.com/asmithlabs/tabellify/blob/main/docs/testing/manual/001-plugin-shell.md).

## How symmetry is enforced

- `tests/static/symmetry.test.mjs`: every register call has a matching cleanup call in `src/`.
- `tests/behavior/lifecycle.test.mjs`: runs the hooks against a mocked Zotero and checks
  cleanup actually happens, in order (including windows closed before `destruct()`).
- Review, plus the manual disable/re-enable steps in the checklist.

## Known Zotero issue

Zotero 10.0.9 completes a pending **Remove** later by plugin ID without calling `shutdown`, so
installing again in the same session can leave a second copy running. Restart Zotero between
Remove and Install. Details and source links:
[docs/development.md](https://github.com/asmithlabs/tabellify/blob/main/docs/development.md).

## Planned (F002)

The workspace tab design adds a `quit-application-granted` observer (added in `startup`,
removed in `shutdown`) that closes Tabellify tabs before Zotero saves its session, and closes
tabs on disable and main-window unload. **Planned**; see ADR-0009 in the
[Decision Log](Decision-Log).
