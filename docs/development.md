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

## Builds by devorch (optional)
devorch is a separate service on the owner's server that can build an approved feature spec
without supervision: it writes the code on its own branch, runs `npm test` and `npm run build`,
has other models review the change, and opens a pull request. It cannot merge.

`.devorch.yml` in the repository root tells devorch how to work here: the test command, the
files a builder must read first, and the paths a builder may not touch. Three limits matter
for Tabellify:

- devorch cannot run Zotero. Acceptance criteria tagged `[manual]` stay with the owner, in the
  dev profile, as one checklist at the end.
- devorch's builders cannot reach zotero.org. Rule 1 in `CLAUDE.md` still applies, so a
  feature that needs a Zotero API not yet in `docs/zotero-api-notes.md` stops and asks. Verify
  the API and record it before starting the run.
- devorch pushes a `devorch/<run>` branch and opens the pull request when a run finishes. The
  code the owner sends to start a run is the owner's approval for that push (rule 6).

## Publishing the docs

The pages in `docs/wiki/` are published to https://wiki.asmithlabs.com/tabellify by
`scripts/publish-wikijs.mjs` (ADR-0010, amendment 1; API facts in
[`docs/wikijs-api-notes.md`](wikijs-api-notes.md)). The script only creates and updates
pages; it never moves, renames or deletes them.

**Key file.** The Wiki.js API key lives in `~/.config/tabellify/wikijs.env`, outside the
repository, with three lines: `WIKIJS_URL=https://wiki.asmithlabs.com`,
`WIKIJS_TOKEN=<the API key>` and `WIKIJS_LOCALE=en`. Make it readable by you only:
```bash
chmod 600 ~/.config/tabellify/wikijs.env
```
The script refuses a key file that others can read, a key file inside the repository, and
any `WIKIJS_URL` that is not `https://`. It never takes the key from the command line or the
environment and never prints it. The key comes from a dedicated Wiki.js group with only
`read:pages` and `write:pages` on paths starting with `tabellify` (not "Full Access"); setup
steps are in `docs/wikijs-api-notes.md`, section 8. Use `--env <file>` for another key file.

**Dry run (default, writes nothing).** From the repository folder:
```bash
node scripts/publish-wikijs.mjs
```
It prints one line per page: `CREATE` or `UPDATE`, the wiki path, the title and the size.
It also prints `LEFTOVER (delete by hand)` for wiki pages under `/tabellify` that no longer
exist in `docs/wiki/`, a warning `EDITED IN WIKI` when a page was changed in the Wiki.js
editor after the last publish, a warning when `_Sidebar.md` and `Home.md` list different
pages, and `git diff --stat` of `docs/wiki/` since the last publish. It stops with an error
if a page links to a page that does not exist.

**One page only.** Add `--only <wiki path>`, e.g.
`node scripts/publish-wikijs.mjs --only tabellify/getting-started`.

**Publishing.** `node scripts/publish-wikijs.mjs --publish` (optionally with `--only`)
writes to the wiki. It runs only on branch `main` with a clean working tree and `HEAD` equal
to `origin/main`, and only with the owner's OK for that publish. It stops at the first
failed page. After a successful publish it records the commit and time in
`build/wikijs-last-publish.json` (gitignored), which the next dry run compares against.
