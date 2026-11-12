# Development environment

> Status: owner-verified on Zotero 10.0.9 (macOS, ARM64), 2026-11-11. These are the steps
> the owner actually followed.

## Golden rule

Never develop against your real Zotero library. Use a **separate Zotero profile and data
directory**. Claude Code is denied access to `~/Zotero`, the Zotero profiles folder, and the
dev data directory `~/Zotero tabellify-dev` (`.claude/settings.json`); you perform the
profile steps below yourself.

A **profile** is Zotero's folder of settings and installed plugins; the **data directory**
is where Zotero keeps the library database and attachments. The dev setup has its own of each.

## One-time setup

1. **Quit Zotero** completely (Zotero → Quit Zotero).
2. **Open the Profile Manager.** In Terminal, run:
   ```bash
   /Applications/Zotero.app/Contents/MacOS/zotero -P
   ```
   The Zotero Profile Manager window opens.
3. **Create the dev profile.** In the Profile Manager window, click **Create Profile…** and
   name the profile `tabellify-dev`.
4. **Start Zotero** with the `tabellify-dev` profile selected (click **Start Zotero** in
   the Profile Manager window).
5. **Set the dev data directory.** In the dev Zotero window: Settings → Advanced → Files and
   Folders → Data Directory Location → custom, and choose `~/Zotero tabellify-dev`
   (the folder name contains a space; quote the path when typing it in a shell).

## Starting the dev profile

In Terminal, run:
```bash
/Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev
```

To capture Debug Output from launch (needed for startup log lines), run this from the
repository folder instead, using the next free number N (`build/` is gitignored):
```bash
/Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText > build/debug-N.txt
```
`-ZoteroDebugText` is documented at https://www.zotero.org/support/debug_output (the page
says Zotero 11+ renames it `-debug-text`). Logging switched on later from Help → Debug
Output Logging misses the startup lines.

## Everyday loop

- `npm test` before every commit; `npm run build` produces `build/tabellify-<version>.xpi`.
- Install the build in the dev Zotero window: Tools → Plugins → Install Plugin From File…,
  then pick the `.xpi` from `build/`. Installing over an enabled Tabellify is fine.
- **After Remove, quit and restart Zotero before installing again.** Zotero 10.0.9 finishes a
  pending removal later by plugin ID only (`onUninstalled` in
  [`plugins.js` L933–937](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/plugins.js#L933-L937) unloads the scope without calling `shutdown`), so an
  install in the same session can leave a second Tabellify copy running: Debug Output shows
  `MenuAPI: 'menuID' must be unique` and `Tabellify: menu registration failed`. This is a
  Zotero bug, not a Tabellify one.
- Check logging in the dev Zotero window: Help → Debug Output Logging → View Output.
- Manual checklists: `docs/testing/manual/`.

## Git basics for this repo

```bash
git switch main && git pull               # start from latest main
git switch -c feat/001-plugin-shell       # one branch per feature
git add -p && git commit                  # small, reviewed commits
git push -u origin feat/001-plugin-shell  # you push; agents ask first
```
