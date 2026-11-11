# Development environment

> Status: draft. Steps marked **(verify)** are confirmed by the architect in Feature 001 T1.

## Golden rule

Never develop against your real Zotero library. Use a **separate Zotero profile and data
directory**. Claude Code is denied access to `~/Zotero` and the Zotero profiles folder
(`.claude/settings.json`); you perform the profile steps below yourself.

## One-time setup

1. **Install Zotero** 10.0.x (owner currently on 10.0.8). Note the version in Zotero → About Zotero.
2. **Create a dev profile** — quit Zotero, then run the Profile Manager **(verify flag)**:
   `/Applications/Zotero.app/Contents/MacOS/zotero -P`
   Create a profile named `tabellify-dev`.
3. **Use a separate data directory** in that profile: Settings → Advanced → Files and
   Folders → Data Directory Location → custom, e.g. `~/ZoteroDev`. Add a few test items
   and a test collection (or import a small sample library). **(verify)**
4. **Point Zotero at the source** with an extension proxy file **(verify)**: in the dev
   profile's `extensions/` folder, create a file named exactly `tabellify@asmithlabs.com`
   whose only content is the absolute path to this repo's `src/` folder.
5. Start the dev profile with debugging, e.g.
   `/Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText -jsdebugger`
   **(verify flags)**

## Everyday loop

- Edit files in `src/` → restart Zotero (dev profile) → check Help → Debug Output Logging.
- `npm test` before every commit; `npm run build` to produce an installable `.xpi`.
- Manual checklists: `docs/testing/manual/`.

## Git basics for this repo

```bash
git switch main && git pull               # start from latest main
git switch -c feat/001-plugin-shell       # one branch per feature
git add -p && git commit                  # small, reviewed commits
git push -u origin feat/001-plugin-shell  # you push; agents ask first
```
