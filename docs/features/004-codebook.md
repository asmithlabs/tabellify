# Feature 004: Curated tag list (codebook) with super-tag groups

- **Status:** Approved (owner, 2026-11-12)
- **Branch:** `feat/004-codebook`
- **Related ADRs:** 0012 (Proposed: data storage), 0009 (workspace tab), 0003 (no bundler),
  0011 (security). PRD §3 step 2, §7 Q2 and Q4.
- **Process:** prototype mode (CLAUDE.md). Developer builds; `npm test` + `npm run build`
  pass; owner runs one smoke test (the ACs below) with Debug Output captured to
  `build/debug-N.txt`.

## Problem / objective
A researcher tags papers with a **preplanned list of tags** (a codebook) so that tagging is
consistent and the tags can later become table columns. The tags are grouped under
**super-tags** (e.g. *Exposure* → `Heat index`, `Temperature`), which become grouped column
headers in the Table Builder (F006). Today Tabellify can only show tags already in the
library (F003). This feature lets the user **create and edit one codebook inside the
Tabellify workspace tab**. The codebook is stored by Tabellify in its own file (ADR-0012);
Zotero tags and items are never changed.

## Scope
**In scope (MVP):**
- One codebook (no codebook picker). The file format already holds a list of codebooks so a
  later feature can add more without a migration.
- Groups (super-tags): create, rename, delete.
- Tags in a group: add (type a name, or pick from tags already used in My Library), remove.
- Automatic save after every change to `<Zotero data directory>/tabellify/codebooks.json`.
- Load on workspace open; clear messages for "empty", "could not load", "could not save",
  "changed in another tab".
- Show the codebook in a new "Codebook" section of the existing workspace tab, above the F003
  collection browser.

**Out of scope (deferred, with reason):**
- Several codebooks, renaming the codebook: not needed until tables are saved (F007).
- Import / export of codebooks (JSON or CSV): useful for sharing and moving between
  computers, but not needed to prove the model. Later feature.
- Importing groups from a tag prefix convention (`Exposure: Heat index`, PRD Q4 "optional
  later").
- Drag-and-drop reordering of groups and tags (order = order of creation for now; F009 handles
  column reordering).
- Tag colours, descriptions / coding notes per tag.
- Tag monitor "used / remaining" (F005) and any table building (F006).
- Automatic recovery from `codebooks.json.bak` (owner can copy it by hand; see ADR-0012 §3).
- Writing anything to Zotero (creating Zotero tags from the codebook, renaming Zotero tags).

## User stories
- As a researcher, I create super-tag groups like "Exposure" and "Outcome" and put my planned
  tags under them, so my tagging follows a plan.
- As a researcher, I pick tags I have already used in Zotero, so the codebook spelling matches
  my library exactly.
- As a researcher, I close Zotero and reopen it and my codebook is still there.
- As a researcher, I trust that editing the codebook never changes my Zotero tags.

## Data model
Stored in `codebooks.json` (ADR-0012). Example:

```json
{
  "schemaVersion": 1,
  "revision": 7,
  "nextId": 5,
  "codebooks": [
    {
      "id": "c1",
      "name": "Codebook",
      "groups": [
        { "id": "g2", "name": "Exposure", "tags": ["Heat index", "Temperature"] },
        { "id": "g3", "name": "Outcome",  "tags": ["Hospitalization"] }
      ]
    }
  ]
}
```

- `schemaVersion` (integer, `1`): the file shape. See ADR-0012 §4.
- `revision` (integer): +1 on every save; detects edits from another Tabellify tab
  (ADR-0012 §5).
- `nextId` (integer): source for short stable ids (`"c1"`, `"g2"`, …). Ids let F007 tables
  refer to a group even after it is renamed. A counter avoids needing a random-id API.
- Codebook → **groups** (ordered) → **tags** (ordered list of strings).
- **Tag strings are matched to Zotero tags exactly** (case-sensitive, after trimming spaces at
  both ends). `Heat index` and `heat index` are different codebook entries, as they are
  different tags in Zotero. (Zotero's own case handling is **UNVERIFIED**; see Q3.)
- Rules (checked by the pure model, unit-tested):
  - Group name: trimmed, not empty, unique within the codebook (compared ignoring case, so
    "Exposure" and "exposure" can't both exist as headers).
  - Tag name: trimmed, not empty, and appears **at most once in the whole codebook** (a tag
    can't be under two super-tags, so it maps to one column).
  - Every tag belongs to a group. To add tags, create a group first.
  - Maximum lengths: none in the MVP (Q4).
- A tag in the codebook does **not** have to exist in Zotero yet: a codebook is a plan.

## Acceptance criteria
`[manual]` = owner smoke test in the dev profile (Zotero 10.0.9). `[auto]` = `npm test`.
Before the smoke test, the dev data directory has **no** `tabellify` folder (delete
`~/Zotero tabellify-dev/tabellify/` if it exists from an earlier try).

- [ ] AC1 `[manual]` **Empty start.** Given Tabellify is freshly installed in the dev profile,
  when the owner chooses Tools → Tabellify…, then the workspace tab shows a "Codebook" section
  with an "empty codebook" message and a way to add a group, and the F003 collection browser
  still works below it. No `tabellify` folder exists yet in `~/Zotero tabellify-dev/`.
- [ ] AC2 `[manual]` **Groups.** When the owner adds groups "Exposure" and "Outcome", renames
  "Outcome" to "Health outcome", adds a third group "Temp" and deletes it, then the section
  shows exactly "Exposure" and "Health outcome", in that order. Adding an empty name or a
  duplicate ("exposure") shows a message and adds nothing.
- [ ] AC3 `[manual]` **Tags by typing.** When the owner types `Heat index` into "Exposure"'s
  tag box and adds it, it appears under "Exposure". Adding `Heat index` again (to any group)
  shows a message and adds nothing. Removing it with its remove button takes it away.
- [ ] AC4 `[manual]` **Tags from the library.** Given the dev library has items with tags,
  when the owner opens a group's "pick from library" list, then it lists the tag names used in
  My Library (each name once, sorted, without names already in the codebook), and choosing one
  adds it to that group.
- [ ] AC5 `[manual]` **Persists.** After AC2–AC4, the owner quits Zotero and starts it again
  with the dev profile, opens Tools → Tabellify…, and the codebook shows the same groups and
  tags in the same order. The file `~/Zotero tabellify-dev/tabellify/codebooks.json` exists
  and contains those names; `codebooks.json.bak` exists after the second save.
- [ ] AC6 `[manual]` **Library unchanged.** In the dev Zotero window, the tag selector (bottom
  left) shows no new tags; a tag that is only in the codebook (typed in AC3, not used on any
  item) does **not** appear in Zotero. Debug Output (`build/debug-N.txt`) shows Tabellify
  log lines for load and save and no Tabellify errors.
- [ ] AC7 `[manual]` **Damaged file is not overwritten.** With Zotero closed, the owner
  replaces the contents of `codebooks.json` with `not json`, starts Zotero and opens the
  workspace. Then the Codebook section shows a "could not load" message naming the file, the
  editing controls are disabled, and the file still contains `not json` afterwards. (Restore:
  copy `codebooks.json.bak` over `codebooks.json`.)
- [ ] AC8 `[auto]` **Model rules.** Unit tests for the pure model: empty data; add / rename /
  delete group; add / remove tag; trimming; every rejection rule in "Data model"; ids from
  `nextId`; order kept; the input object is not mutated (functions return new data).
- [ ] AC9 `[auto]` **Validation and versions.** Unit tests: valid v1 passes; wrong types,
  missing fields, duplicate tags, non-string tags are rejected with a reason; a
  `schemaVersion` higher than 1 is reported as "newer"; an object with no `schemaVersion` is
  rejected (no v0 exists).
- [ ] AC10 `[auto]` **Store logic with a fake file system.** `codebook-store.js` takes its
  file functions as parameters (like F002's fake `Zotero_Tabs`) so Node can test: missing file
  → empty data, no write; invalid file → error state, no write; save calls `makeDirectory`
  then `writeJSON` with `tmpPath` and `backupFile` next to the target; a changed `revision` on
  disk → no write, "changed elsewhere" result; `revision` +1 on success.
- [ ] AC11 `[auto]` **Safety guards.** `tests/static/write-guard.test.mjs` passes with exactly
  one new allow-list entry (`content/codebook-store.js`, "IOUtils write", this spec); no
  `Zotero.DB`, no item/tag write API anywhere in `src/`; `no-html-sinks` passes (names are
  shown with `textContent` / `new Option` only); every Fluent id used exists in
  `tabellify.ftl`.

## Design

### Where things go
- **Pure model** `src/content/codebook-model.js`: a classic script (like `workspace.js`) that
  defines one global `TabellifyCodebook` with pure functions, no Zotero / DOM / IOUtils:
  `emptyData()`, `validate(data)` → `{ ok, reason?, newer? }`, `migrate(data)`,
  `addGroup(data, name)`, `renameGroup(data, groupId, name)`, `deleteGroup(data, groupId)`,
  `addTag(data, groupId, tag)`, `removeTag(data, groupId, tag)`, `availableTags(data,
  libraryTagNames)`. Each edit returns `{ ok: true, data }` (a new object) or
  `{ ok: false, error: "<fluent-id>" }`. Lives in `src/content/` (not `src/modules/`) for the
  reason given at the top of `workspace.js`: only `src/content/` has a `chrome://` URL.
- **Store** `src/content/codebook-store.js`: one global `TabellifyCodebookStore` with
  `load(fs, dir)` and `save(fs, dir, data, loadedRevision)`. `fs` is an object
  `{ readJSON, writeJSON, makeDirectory, join }`. The real one comes from
  `TabellifyCodebookStore.platformFs()`, defined in this same file, which wraps `IOUtils`
  and `PathUtils`; tests pass a fake. `dir` is
  `PathUtils.join(Zotero.DataDirectory.dir, "tabellify")`, computed by
  `TabellifyCodebookStore.dataDir()`. This is the **only** file that mentions
  `IOUtils.writeJSON` / `IOUtils.makeDirectory` (so the single write-guard allow-list entry
  covers it), and the only file that reads `Zotero.DataDirectory.dir`.
- **UI** `src/content/workspace.xhtml` / `workspace.js` / `workspace.css`: a "Codebook"
  section above the collection row.
  - Top: text box + "Add group" button.
  - Per group: name, "Rename" (turns the name into a text box with Save / Cancel), "Delete"
    (needs a second click on "Confirm delete" if the group has tags), its tags as a list with
    a remove (×) button each, a text box + "Add tag" button, and a "Pick from library"
    dropdown (`<select>`) whose options are library tags not yet in the codebook.
  - One status line for messages (empty / saved / error / changed elsewhere).
  - All names are put on the page with `textContent` or `new Option(text, value)` only.
    `codebooks.json` is user-editable and library tags come from synced data: both are
    untrusted text in a privileged document (ADR-0011).
  - Plain HTML controls only; no `window.prompt` / `confirm` (not verified in the tab
    iframe).
- **Library tags for the picker:** `await Zotero.Tags.getAll(Zotero.Libraries.userLibraryID)`
  (read-only SELECT; returns `{ tag, type? }` objects; covers item and annotation tags, PRD
  Q2). De-duplicate by name (a manual and an automatic tag can share one), sort with the
  existing `compareText`. Loaded once when the workspace opens.
- **Data flow:** open tab → `await Zotero.initializationPromise` → `load` → render. Each edit
  → model function → if ok, `save` → on success keep the returned data and `revision`, render;
  on "changed elsewhere" reload and show the message; on write error keep the edit on screen,
  show "could not save".
- **Lifecycle:** nothing new in `bootstrap.js` or `tabellify.js`. All listeners live in the
  workspace document and are removed in its `unload` handler (as in F003). No timers.
- **Fluent:** new `tabellify-codebook-*` messages in `src/locale/en-US/tabellify.ftl` for every
  heading, button, placeholder and message. Error messages that come from the model are
  Fluent ids, so JS shows them with `document.l10n.formatValue(id)`.

## Zotero APIs used
All in `docs/zotero-api-notes.md` (Feature 004 rows), checked at Zotero 10.0.9 / Firefox ESR 140:

| API | Status |
|---|---|
| `Zotero.DataDirectory.dir` | Verified (source), **Internal** |
| `PathUtils.join` | Verified (source) |
| `IOUtils.readJSON` (`NotFoundError` on missing file) | Verified (source) |
| `IOUtils.writeJSON` with `tmpPath`, `backupFile` | Verified (source) |
| `IOUtils.makeDirectory` | Verified (source) |
| `Zotero.Tags.getAll(libraryID)` | Verified (source); whether it includes tags only on trashed items is UNVERIFIED (R9) |
| `IOUtils` / `PathUtils` available inside `workspace.xhtml` | Verified (source: `[ChromeOnly, Exposed=Window]`); runtime check R9 part A |
| Already verified in F003: `Zotero.initializationPromise`, `Zotero.Libraries.userLibraryID`, `Zotero.debug`, `Zotero.logError`, `document.l10n.formatValue` | — |

Runtime check **R9** (read-only) is in `docs/zotero-api-notes.md`; the owner runs it before
or during the smoke test.

## Data safety
- **Read from the library:** tag names in My Library (`Zotero.Tags.getAll`, read-only
  `SELECT`). Nothing else new.
- **Written:** only files in `<Zotero data directory>/tabellify/`: `codebooks.json`,
  `codebooks.json.tmp` (short-lived), `codebooks.json.bak`. Created only after the user's
  first edit.
- **Never written:** `zotero.sqlite`, items, tags, notes, collections, attachments,
  annotations, prefs, or any other file. Zotero tags are **not** created when a tag is added
  to the codebook.
- **Not synced** by Zotero sync (ADR-0012 §7). Uninstall behaviour: owner question Q1.
- **Untrusted input:** `codebooks.json` content and library tag names are shown as text only
  and validated before use.
- Development uses only the dev profile and `~/Zotero tabellify-dev`.

## Test plan
| AC | How |
|---|---|
| AC1–AC7 | Owner smoke test (manual), Debug Output in `build/debug-N.txt` |
| AC8, AC9 | `tests/unit/codebook-model.test.mjs` (Node `vm` sandbox, like `workspace-helpers.test.mjs`) |
| AC10 | `tests/unit/codebook-store.test.mjs` with a fake `fs` |
| AC11 | existing static tests + updated allow-lists |

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T1 | Pure model + unit tests (AC8, AC9) | developer | spec + ADR-0012 approved | `src/content/codebook-model.js`, `tests/unit/codebook-model.test.mjs` |
| T2 | Store with injectable `fs` + unit tests (AC10); write-guard allow-list entry for `content/codebook-store.js` / "IOUtils write" citing this spec; add `makeDirectory` to the guard's IOUtils pattern (it is a disk write the denylist does not match today) with a fixture | developer | T1 | `src/content/codebook-store.js`, `tests/unit/codebook-store.test.mjs`, `tests/static/write-guard.test.mjs` |
| T3 | Workspace UI: Codebook section, load/save wiring, library tag picker, Fluent strings, CSS; load the two new scripts after `include.js` and before `workspace.js`; extend the F003 allow-list in `workspace-script.test.mjs` with `Zotero.Tags.getAll` (and add a similar allow-list check for `codebook-store.js`: `Zotero.DataDirectory.dir` only) and check the new script order | developer | T2 | `src/content/workspace.xhtml`, `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/static/workspace-script.test.mjs` |
| T4 | `npm test`, `npm run build`, then owner smoke test AC1–AC7 (prototype mode) | developer → owner | T3 | — |

Notes for the developer:
- The write guard scans comments too: don't write `IOUtils.write…(` in comments outside
  `codebook-store.js`.
- Keep model functions free of `Zotero`, `IOUtils`, `PathUtils`, `document` and `window` so
  they run in the Node sandbox.

## Owner decisions (2026-11-12)
All eight recommendations below were approved by the owner as written. R9 skipped (prototype mode); the smoke test confirms the file location.
Each has a recommended answer; the spec above assumes the recommendation.

1. **Uninstall: keep or delete the codebook folder?** *Recommended: keep.* Zotero also calls
   `uninstall()` on every upgrade, so deleting there risks erasing codebooks on updates
   (ADR-0012 §8). Users can delete the folder by hand; the docs will say where it is.
2. **Storage location: Zotero data directory or profile?** *Recommended: data directory*
   (`<data dir>/tabellify/`), so codebooks travel with the library folder (ADR-0012 §1).
3. **Tag matching: exact (case-sensitive) or ignore case?** *Recommended: exact, after
   trimming*, because the codebook should name the same tag Zotero has. Whether Zotero itself
   treats `Heat` and `heat` as one tag is **UNVERIFIED**; if R9 or the owner's experience
   shows Zotero merges them, switch to "ignore case" for duplicate checks (one-line change in
   the model).
4. **Limits on names?** *Recommended: none in the MVP* (no verified Zotero tag-length limit
   was looked up). Revisit if exports or headers break on very long names.
5. **One codebook for everything, or one per collection?** *Recommended: one global codebook
   in F004*; the file can hold several, and F005/F007 can link a table or collection to a
   codebook later. This affects how the tag monitor (F005) counts "4/15", so please confirm.
6. **Tags outside a group?** *Recommended: no;* every tag sits under a super-tag (simpler
   table headers). Alternative: an implicit "Ungrouped" group.
7. **Pick-from-library scope:** My Library only (recommended, matches F003) or also group
   libraries? Group libraries are deferred.
8. **ADR-0012 approval** is needed before T2 (new storage format, CLAUDE.md rule 7).
