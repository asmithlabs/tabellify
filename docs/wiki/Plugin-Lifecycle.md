# Plugin Lifecycle

Zotero calls a bootstrapped plugin's hooks in `bootstrap.js` at fixed moments, and can
enable or disable a plugin **without restarting**. So everything added in `startup()` /
`onMainWindowLoad()` must be removed in `shutdown()` / `onMainWindowUnload()` (lifecycle
symmetry, CLAUDE.md rule 9). Code: [`src/bootstrap.js`](https://github.com/asmithlabs/tabellify/blob/main/src/bootstrap.js),
[`src/tabellify.js`](https://github.com/asmithlabs/tabellify/blob/main/src/tabellify.js).

```
install ─▶ startup ─▶ onMainWindowLoad ─▶ … ─▶ onMainWindowUnload ─▶ shutdown ─▶ uninstall
```

## What Tabellify does in each hook (version 0.1.0, F001 + F002)

| Hook | Tabellify 0.1.0 |
|---|---|
| `install` | Log only |
| `startup` | Register the `chrome://tabellify/content/` package (`registerChrome`), load `tabellify.js`, call `Tabellify.init()`: register the Tools menu item, add the `quit-application-granted` observer (`Services.obs.addObserver`), then run the per-window setup for main windows that are already open |
| `onMainWindowLoad` | Insert `tabellify.ftl` into that main window (`insertFTLIfNeeded`) so the menu label and tab title resolve |
| `onMainWindowUnload` | 1. Close that window's Tabellify tab, if any (so it is not saved with the closing window's state). 2. Remove every `link[href="tabellify.ftl"]` from that window |
| `shutdown` | In `Tabellify.shutdown()`: 1. Close the Tabellify tab in every main window. 2. Close any fallback `tabellify:workspace` windows. 3. Remove the quit observer. 4. Unregister the menu. 5. Per main window: close its tab (no-op by now) and remove the FTL link. Then, in `bootstrap.js`: 6. Destroy the chrome registration (`chromeHandle.destruct()`), **after** tabs and windows are closed, while `chrome://tabellify/` still resolves. Each step has its own `try/catch` |
| `uninstall` | Log only (no stored data to remove) |

## Workspace tab and app quit (F002)

At app quit, plugin `shutdown()` runs too late to keep the Tabellify tab out of Zotero's
saved session: Zotero saves `session.json` on `quit-application-granted`, and add-ons are shut
down later, at `profile-before-change`. Since Zotero 8, restoring a saved tab of an unknown
type throws and every later tab (PDFs, notes) is not restored. So:

- `init()` registers an observer for **`quit-application-granted`** that calls
  `closeAllWorkspaceTabs()`. `Zotero_Tabs.close` removes the tab from Zotero's tab list
  immediately, so it is gone before Zotero reads the tabs, **provided our observer runs
  first**. Mozilla notifies the newest observer first and ours is added after Zotero's, but
  that order is **UNVERIFIED at runtime** until the owner's F002 AC6 check.
- `shutdown()` (disable, uninstall, upgrade) closes tabs before `chromeHandle.destruct()`
  and removes the observer (mirror of `init`).
- `onMainWindowUnload` closes the window's tab (macOS main-window close, F002 AC8; whether
  this runs before Zotero saves the pane state is open question Q6 in the spec).
- Every close path, including the user's ×, goes through `Zotero_Tabs.close`, which calls
  the tab's `onClose`; that clears the stored tab id.
- The tab is **not** restored after a restart.
- **Residual risk (accepted, F002 Q3):** Zotero also saves the session on a debounced timer.
  If Zotero crashes while the tab is open after such a save, the next start stops restoring
  tabs at the Tabellify entry and logs `Cannot destructure property 'itemID'`. Revisit
  before public release.

Design and sources: [ADR-0009](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0009-workspace-as-main-window-tab.md)
and [Feature 002](https://github.com/asmithlabs/tabellify/blob/main/docs/features/002-workspace-tab.md).

Reason codes (logged, never branched on): `APP_STARTUP 1`, `APP_SHUTDOWN 2`,
`ADDON_ENABLE 3`, `ADDON_DISABLE 4`, … `MAIN_WINDOW_LOAD 9`. Zotero 10 passes 9 to
`onMainWindowUnload` too, which is why Tabellify never branches on the reason.

## Logging

Every log line goes to Zotero's Debug Output with the prefix `Tabellify: ` (for example
`Tabellify: startup (version 0.1.0, reason 1)`, `Tabellify: menu registered (…)`,
`Tabellify: onMainWindowUnload: removed FTL: 1`). F002 adds lines such as
`Tabellify: quit observer added`, `Tabellify: workspace tab opened (<id>)`,
`Tabellify: quit-application-granted: closing workspace tabs` and
`Tabellify: menu command window is main: true`. Errors use `Zotero.logError`. The full list
of expected lines per step is in the manual checklists for
[F001](https://github.com/asmithlabs/tabellify/blob/main/docs/testing/manual/001-plugin-shell.md) and
[F002](https://github.com/asmithlabs/tabellify/blob/main/docs/testing/manual/002-workspace-tab.md).

## How symmetry is enforced

- `tests/static/symmetry.test.mjs`: every register call has a matching cleanup call in `src/`,
  every observer topic added is removed, and the tab `add`/`close` pair exists.
- `tests/behavior/lifecycle.test.mjs`: runs the hooks against a mocked Zotero and checks
  cleanup actually happens, in order (including windows closed before `destruct()`).
- `tests/behavior/workspace-tab.test.mjs`: with a fake `Zotero_Tabs` and `Services.obs`,
  checks tabs are closed before `destruct()`, at `quit-application-granted`, and on
  main-window unload, and that the observer is removed at shutdown.
- Review, plus the manual disable/re-enable steps in the checklist.

## Known Zotero issue

Zotero 10.0.9 completes a pending **Remove** later by plugin ID without calling `shutdown`, so
installing again in the same session can leave a second copy running. Restart Zotero between
Remove and Install. Details and source links:
[docs/development.md](https://github.com/asmithlabs/tabellify/blob/main/docs/development.md).