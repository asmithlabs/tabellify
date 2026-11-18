# Plugin Lifecycle

Zotero calls a bootstrapped plugin's hooks in `bootstrap.js` at fixed moments, and can
enable or disable a plugin **without restarting**. So everything added in `startup()` /
`onMainWindowLoad()` must be removed in `shutdown()` / `onMainWindowUnload()` (lifecycle
symmetry, CLAUDE.md rule 9). Code: [`src/bootstrap.js`](https://github.com/asmithlabs/tabellify/blob/main/src/bootstrap.js),
[`src/tabellify.js`](https://github.com/asmithlabs/tabellify/blob/main/src/tabellify.js),
[`src/reader-tags.js`](https://github.com/asmithlabs/tabellify/blob/main/src/reader-tags.js).

```
install ─▶ startup ─▶ onMainWindowLoad ─▶ … ─▶ onMainWindowUnload ─▶ shutdown ─▶ uninstall
```

## What Tabellify does in each hook (0.2.0)

| Hook | Tabellify |
|---|---|
| `install` | Log only |
| `startup` | Register the `chrome://tabellify/content/` package (`registerChrome`), load `tabellify.js`, call `Tabellify.init()`: 1. register the Tools menu item; 2. add the `quit-application-granted` observer; 3. load `codebook-model.js`, `codebook-store.js`, `tag-monitor-model.js` and `reader-tags.js` into the bootstrap scope and register the "Tabellify tags" item pane section plus one Notifier observer (`item`, `item-tag`); 4. run the per-window setup for main windows already open |
| `onMainWindowLoad` | Insert `tabellify.ftl` into that main window (`insertFTLIfNeeded`) so the menu label, tab title and section labels resolve |
| `onMainWindowUnload` | 1. Close that window's Tabellify tab, if any. 2. Remove every `link[href="tabellify.ftl"]` from that window |
| `shutdown` | In `Tabellify.shutdown()`: 1. close the Tabellify tab in every main window; 2. close any fallback `tabellify:workspace` windows; 3. unregister the item pane section and its Notifier observer (and clear its pending refresh timer), then drop the loaded globals; 4. remove the quit observer; 5. unregister the menu; 6. per main window: close its tab (no-op by now) and remove the FTL link. Then, in `bootstrap.js`: 7. destroy the chrome registration (`chromeHandle.destruct()`), **after** tabs and windows are closed, while `chrome://tabellify/` still resolves. Each step has its own `try/catch` |
| `uninstall` | Log only. Tabellify's data folder and pref are **kept** (ADR-0012 §8: Zotero also calls `uninstall` on upgrade and downgrade) |

## Inside the workspace document

The workspace (`workspace.js`) lives exactly as long as its document. On load it waits for
`Zotero.initializationPromise`, then loads the codebook, the layout and the saved tables,
reads the collections and the library tag names, and registers **one** Notifier observer
(`item-tag`, `collection-item`, `item`, `collection`, `group`) that schedules a recompute
500 ms after the last event; a `group` or `collection` event also rebuilds the library and
collection list (F003b), through the same timer. On `unload` it unregisters the observer, clears its timers and removes its
DOM listeners. `init()` checks after every `await` whether the document has been unloaded
and refuses to register the observer late (pre-release fix SEC-012), so closing the tab
during start-up leaves nothing behind.

Closing the tab (by the user, at quit, on disable) unloads the document, which runs that
cleanup. `onNotify` also checks that its document is still alive and unregisters itself if
not.

## Workspace tab and app quit (F002)

At app quit, plugin `shutdown()` runs too late to keep the Tabellify tab out of Zotero's
saved session: Zotero saves `session.json` on `quit-application-granted`, and add-ons are shut
down later, at `profile-before-change`. Since Zotero 8, restoring a saved tab of an unknown
type throws and every later tab is not restored. So:

- `init()` registers an observer for **`quit-application-granted`** that closes every
  Tabellify tab. Mozilla notifies the newest observer first and ours is added after Zotero's
  (see api-notes for the verification status of this ordering).
- `shutdown()` (disable, uninstall, upgrade) closes tabs before `chromeHandle.destruct()`
  and removes the observer.
- `onMainWindowUnload` closes the window's tab.
- Every close path goes through `Zotero_Tabs.close`, which calls the tab's `onClose`; that
  clears the stored tab id.
- The tab is **not** restored after a restart.
- **Residual risk, accepted for the first release:** Zotero also saves the session on a
  timer. If Zotero crashes while the tab is open after such a save, the next start stops
  restoring tabs at the Tabellify entry and logs `Cannot destructure property 'itemID'`.
  Accepted by the owner on 2026-11-14 (ADR-0009, Notes); to be revisited.

Design and sources: [ADR-0009](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0009-workspace-as-main-window-tab.md)
and [Feature 002](https://github.com/asmithlabs/tabellify/blob/main/docs/features/002-workspace-tab.md).

Reason codes (logged, never branched on): `APP_STARTUP 1`, `APP_SHUTDOWN 2`,
`ADDON_ENABLE 3`, `ADDON_DISABLE 4`, … `MAIN_WINDOW_LOAD 9`. Zotero 10 passes 9 to
`onMainWindowUnload` too, which is why Tabellify never branches on the reason.

## Logging

Every log line goes to Zotero's Debug Output with the prefix `Tabellify: ` (for example
`Tabellify: startup (version 0.2.0, reason 1)`, `Tabellify: quit observer added`,
`Tabellify: workspace: tag monitor: notifier observer unregistered (…)`). Workspace lines carry
counts, IDs, file names and error names only: never titles, tag, group or collection names,
file paths or error messages. `tests/static/no-private-logs.test.mjs` enforces the paths and
messages part (SEC-011). Errors are reported with `Zotero.logError`, which may contain paths
(ADR-0017 §5).

## How symmetry is enforced

- `tests/static/symmetry.test.mjs`: every register call has a matching cleanup call in `src/`,
  every observer topic added is removed, and the tab `add`/`close` pair exists.
- `tests/static/workspace-script.test.mjs` and `reader-tags-script.test.mjs`: one
  `registerObserver` with a matching `unregisterObserver`, every `addEventListener` has a
  `removeEventListener`.
- `tests/behavior/lifecycle.test.mjs` and `workspace-tab.test.mjs`: run the hooks against a
  mocked Zotero and check cleanup happens, in order.
- `tests/unit/workspace-init-unload.test.mjs`: runs the real workspace `init()` / `onUnload()`
  with a fake Zotero (SEC-012).
- Review, plus the manual disable/re-enable steps in the checklists.

## Known Zotero issue

Zotero 10.0.9 completes a pending **Remove** later by plugin ID without calling `shutdown`, so
installing again in the same session can leave a second copy running. Restart Zotero between
Remove and Install. Details and source links:
[docs/development.md](https://github.com/asmithlabs/tabellify/blob/main/docs/development.md).
