# Feature 003b: Group libraries

- **Status:** Approved (owner, 2026-11-16, all recommendations Q1–Q13) (drafted by the architect, 2026-11-16). Owner setup of the test account (T0) still to do; answers to
  the open questions.
- **Branch:** `feat/003b-group-libraries` (from `main`)
- **Related ADRs:** 0012 (Accepted: Tabellify's own files, write-guard allow-list), 0014 /
  0019 (Accepted: `layout.json`, manual orders keyed `"<libraryID>/<collectionKey>"`), 0018
  (saved tables, `tables.json`), 0011 (security review), 0020 (release integrity), 0008
  (Zotero 10 target). **No new ADR is needed**: no storage format, schema, dependency or new
  UI surface changes (see "Is an ADR needed?").
- **Process:** prototype mode (CLAUDE.md). The owner runs RT-G1–RT-G3 first (AC1–AC3, read-only,
  needs a test group library: see "Owner setup"), then the developer builds; `npm test` and
  `npm run build` pass; the owner runs one smoke test (the `[manual]` ACs) with Debug Output in
  `build/debug-N.txt`. Because 0.2.0 becomes the **first public release**, the full security
  audit (ADR-0011) and docs pass (ADR-0010) that end prototype mode run before release.
- **Why "003b":** the feature extends F003 (read-only data access: which collections can be
  chosen). The product roadmap already reserves F009 for column customization, so a new
  number would clash (open question Q1).

## Owner requirement (2026-11-16, as relayed by the orchestrator)
The first public release must support Zotero **group libraries**, not only My Library.

## Problem / objective
Tabellify 0.1.0 lists only the collections of **My Library** (`workspace.js` builds the
dropdown from `Zotero.Libraries.userLibraryID`). Many research teams keep their papers in a
shared **group library** on zotero.org. Those users cannot use Tabellify at all today.

003b lets the user choose a collection in **any library they can see in Zotero**: My Library
and every group library. Everything that works for a My Library collection (tag counts, table,
manual order, suggestions, saved tables, CSV export, the reader section) works the same for a
group collection. Nothing is written to any library.

A **group library** is a library that belongs to a group on zotero.org and is shared by its
members. Zotero copies it to each member's computer through sync, and shows it in the left
pane under **Group Libraries**. A **feed** (RSS) is also a Zotero "library" internally, but it
is not a research library: Tabellify never lists feeds.

## Release and version (recommendation)
- **Ship this as 0.2.0, not 0.1.1.** In [Semantic Versioning](https://semver.org/), for a 0.x
  project the middle number goes up for new features and the last number for bug fixes only.
  Group library support is a new capability, so 0.2.0 says the right thing. 0.1.1 would tell
  users "only fixes".
- **The unpublished v0.1.0:** the tag `v0.1.0` is protected and cannot move, so leave it where
  it is (it is harmless: nobody downloaded a release from it). **Delete the draft GitHub
  release** for v0.1.0 so it can never be published by mistake (owner action, with approval;
  `gh release delete v0.1.0 --yes` deletes the draft only; do **not** add `--cleanup-tag`).
  In `CHANGELOG.md`, keep the `[0.1.0]` section but replace "First public release." with a
  line saying 0.1.0 was tagged but never published and its contents first ship in 0.2.0; the
  `[0.2.0]` section then says "First public release" and adds group libraries under "Added".
- `src/manifest.json` and `package.json` go to `0.2.0` (the existing static test
  `tests/static/xpi.test.mjs` "versions agree" checks they match). `updates.json` (ADR-0020)
  gets its first entry for 0.2.0 at release time. `docs/release-checklist.md` replaces the
  hard-coded `0.1.0` / `v0.1.0` with `0.2.0` / `v0.2.0` (task T6).

## Decisions recommended in this spec
1. **Libraries listed:** My Library first, then every group library, sorted by name (Zotero's
   own order). Read-only groups and "kept" (archived) groups are listed too: Tabellify only
   reads. Feeds are never listed.
2. **One collection dropdown, grouped by library** (option A below): each library is a
   heading inside the dropdown, with its collections indented under it.
3. **"Tags used" suggestions** (F006b) read the tags of the **chosen collection's library**;
   before any collection is chosen, My Library.
4. **One codebook for all libraries** (unchanged). Codebook tags match Zotero tags **by name**,
   with the same rule as today (trim + Unicode NFC, case-sensitive). **Create tag** is
   unchanged: it adds to the codebook only.
5. **No storage or schema change.** `layout.json` and `tables.json` already key everything by
   `"<libraryID>/<collectionKey>"`. Two in-memory lookups become "all libraries" instead of
   "the current library", and the manual-order pruning rule is fixed (see "Data" below; this
   is a **data-loss bug** that groups would otherwise trigger).
6. **Saved tables list shows the library name** of each table, from the live library list.
7. **Reader section** (F005b): no code change; it already uses the shown item's own library.
8. **Library list stays current:** Refresh, and Zotero's `group` and `collection` change events,
   rebuild the dropdown while the tab is open (keeping the chosen collection if it still exists).

## Scope
**In scope:**
1. Collection dropdown lists My Library and every group library (grouped, Decision 2).
2. Choosing a group collection: tag monitor, per-paper table, manual order, sort, column order,
   View table, Save table, Export CSV all work as for My Library.
3. Suggestions read the chosen collection's library (Decision 3).
4. Saved tables: library name in the list and in the modal's info line; "Show live" works for
   a table of any listed library; "(collection not found)" when its group was removed.
5. Manual orders of every library survive edits in any library (pruning fix).
6. A group removed or left while the tab is open: dropdown updates; a chosen collection that
   disappeared clears the table with a message.
7. Fluent strings, unit/static tests, the Zotero mock used by the behaviour tests.
8. Version 0.2.0 and the release/CHANGELOG notes above (docs tasks).

**Out of scope (non-goals):**
- Choosing a **whole library** (all its papers, also those in no collection) as the table's
  scope. Today a table is always a collection (+ subcollections); unchanged. (Possible later
  feature: it needs a library-wide item read.)
- Feeds, "My Publications", "Unfiled Items", saved searches, duplicates as scopes.
- One codebook per library, or per-library codebook switching.
- Any write to a library: no tags created in groups, no "assign tag" (still rule 8).
- Filtering highlights by who made them (group members' highlights; see Q4).
- Making saved data portable between computers for groups (library IDs are local; see "Data").
- Showing a read-only marker for read-only groups (Q10).

## User stories
- As a researcher in a lab group, I want to pick a collection in our shared group library so
  that I can build our synthesis table from the papers we all tag.
- As a user with both My Library and a group, I want my manual paper order and saved tables of
  one library to stay intact while I work in another.
- As a group member, I want tag suggestions from the group's tags when I work on a group
  collection, so the codebook uses the names my team already uses.
- As a user who left a group, I want my saved tables of that group to stay readable (snapshot)
  and clearly marked when their collection is gone.

## Acceptance criteria
Each tagged `[auto]` (automated test, `npm test`) or `[manual]` (owner verifies in the dev
profile). The manual ones need a test group library (see "Owner setup").

**Before development (owner, read-only):**
- [x] AC1 `[manual]` **RT-G1 passes** (PASS 2026-11-18) (`docs/zotero-api-notes.md`, "Runtime checks"): the
  user library reports `type: "user"` and `name: "My Library"`; each test group reports
  `type: "group"` and its collection count; `allTypes` contains exactly one `"user"` and one
  `"group"` per group (plus `"feed"` only if the profile has feeds).
- [x] AC2 `[manual]` **RT-G2 passes** (PASS 2026-11-18): for the test group, `tagNames`, `papers` and
  `annotationTags` are non-zero and match what the owner set up (proves `waitForDataLoad`,
  `Tags.getAll` and annotation reads work for a group library).
- [x] AC3 `[manual]` **RT-G3 passes** (PASS 2026-11-18): the temporary dropdown in the Tabellify tab shows the
  headings "My Library" and "Test Group" (not selectable) with the options indented under them.
  If it fails, the developer uses the fallback in "Design" (disabled heading options).

**Dropdown and table:**
- [ ] AC4 `[manual]` Given the dev profile has My Library collections and two test groups, when
  the owner opens the Tabellify tab and opens the collection dropdown, then it shows the
  heading **My Library** with its collections, then one heading per group (alphabetical) with
  that group's collections and subcollections indented; a group with no collections shows one
  greyed "(no collections)" line; no feed appears (if the owner added a feed for this check).
- [ ] AC5 `[auto]` The pure helper that builds the grouped options (`libraryOptionGroups`,
  `workspace-helpers.test.mjs`): My Library first, then groups in the given order; options
  keep Zotero's depth-first order with NO-BREAK SPACE indentation; option values are
  collection IDs as text; a library with no collections gets one disabled placeholder; an entry
  with any `type` other than `"user"` or `"group"` is left out; names are returned unchanged as
  plain text (a name like `<img onerror=x>` comes back as the same characters).
- [ ] AC6 `[manual]` Given a group collection with a subcollection, papers with PDFs, and
  tagged highlights, when the owner chooses it, then "Tags used N/M · Papers P" and the table
  count those papers once each, using the same counting rule as My Library (highlight tags
  only unless **Also count tags on the paper itself** is ticked).
- [ ] AC7 `[manual]` Live update: with the group collection chosen, the owner adds a codebook
  tag to a highlight in a group PDF (reader tab); within about a second the table shows the ✓
  without pressing Refresh.

**Suggestions and codebook:**
- [ ] AC8 `[manual]` Given a tag that exists only in the test group (e.g. `group-only-tag`), when
  a group collection is chosen and the owner types `group-o` in the **Tags and groups** box,
  then `group-only-tag` is suggested; after choosing a My Library collection and typing again,
  it is not suggested (and a My-Library-only tag is).
- [ ] AC9 `[manual]` The codebook stays the same when switching between a My Library and a group
  collection; a codebook tag used in both libraries shows ✓ in both tables; `Heat` and `heat`
  are still two different tags. **Create tag** still adds to the codebook only (the group's
  tags on zotero.org are unchanged).
- [ ] AC10 `[auto]` Suggestion source: the library tag list is read with the chosen collection's
  `libraryID` and re-read when the chosen collection's library changes
  (`workspace-init-unload.test.mjs` / `workspace-table.test.mjs` with the Zotero mock:
  `Zotero.Tags.getAll` called with the group's ID after a group collection is chosen).

**Manual order, layout, saved tables:**
- [ ] AC11 `[auto]` Pruning rule (`table-layout-model.test.mjs`): with listed libraries
  {1, 5} and known collection keys {`1/AAAA1111`, `5/BBBB2222`}, saving keeps `1/AAAA1111` and
  `5/BBBB2222`, drops `5/GONE0000` (library listed, collection not found) and keeps
  `9/CCCC3333` (library 9 not listed). Without a list of libraries the old behaviour is kept
  (existing tests still pass).
- [ ] AC12 `[manual]` The owner gives a My Library collection a manual paper order, then
  chooses a group collection and drags a paper there, waits 2 seconds, restarts Zotero and
  opens the tab: **both** collections still open in their manual order.
- [ ] AC13 `[manual]` Save table from a group collection: the **Saved tables** list entry reads
  "<group name> · <collection> · n papers · m columns · Saved <date>"; a My Library table
  reads "My Library · …". After choosing a My Library collection, the group table still shows
  its collection name (not "(collection not found)"), and **Open** → **Show live** rebuilds it
  from the group.
- [ ] AC14 `[auto]` The saved-tables lookups use the all-libraries maps: with the mock, a saved
  table whose `collectionKey` belongs to library 5 is labelled with its current collection
  name and library name while a library 1 collection is chosen, and `liveCollectionId` finds
  it.

**Group removed, read-only groups:**
- [ ] AC15 `[manual]` Group removed while the tab is open (owner deletes the disposable group on
  zotero.org, clicks sync in the dev Zotero window and chooses **Remove Group**): with one of
  its collections chosen, the table clears and the message "The chosen collection is no longer
  available. Choose another collection." appears; the dropdown no longer lists the group (at
  the latest after **Refresh**); its saved table shows "<saved collection name> (collection not
  found)" without a library name; **Open** shows the snapshot, **Export CSV** works, **Show
  live** is disabled with the updated reason text. No error in Debug Output other than
  Tabellify's own log lines.
- [ ] AC16 `[manual]` (optional, needs a second disposable group) **Keep Group** instead: the
  group stays listed, its collections can be chosen and counted (Zotero made it read-only;
  Tabellify behaves the same).

**Safety and static checks:**
- [ ] AC17 `[auto]` Static checks pass unchanged in spirit: `write-guard.test.mjs` (no new write
  site), `no-html-sinks.test.mjs` (library and group names only via `textContent`,
  `new Option(...)` or the `label` property of an `<optgroup>`), `no-private-logs.test.mjs`
  (no library, group or collection **names** in Debug Output: only counts and numeric IDs);
  the `workspace.js` Zotero allow-list in `workspace-script.test.mjs` gains exactly
  `Zotero.Groups.getAll`; every new Fluent ID exists in `tabellify.ftl`; lifecycle symmetry
  tests pass (no new observer, timer or listener without its removal).
- [x] AC18 `[manual]` Read-only proof (PASS 2026-11-18; see RT-G notes): the owner runs RT-G2 before and after the smoke test
  (without tagging anything in between those two runs): `tagNames`, `papers` and
  `annotationTags` are unchanged, and Debug Output shows no Tabellify line about saving
  anything except `codebooks.json`, `layout.json` or `tables.json`.
- [ ] AC19 `[manual]` Reader section in a group: opening a group PDF in a reader tab shows the
  **Tabellify tags** section with "k / M" counted from that paper's highlights (same as for a
  My Library PDF).
- [ ] AC20 `[auto]` `src/manifest.json` and `package.json` both say `0.2.0`
  (`tests/static/xpi.test.mjs`, existing "versions agree" test, after T5).

## Design

### Which libraries, and how they are read (all read-only)
```js
// My Library first, then the groups. Zotero.Groups.getAll() returns only groups (no feeds),
// already sorted by name. Each group IS a Zotero.Library object.
const libraries = [Zotero.Libraries.get(Zotero.Libraries.userLibraryID), ...Zotero.Groups.getAll()];
```
- For each library: `libraryID`, `libraryType` (`"user"` or `"group"`) and `name` (My Library's
  `name` is Zotero's localized "My Library"; a group's `name` is the group name from
  zotero.org, **untrusted text written by other people**).
- Collections per library: `Zotero.Collections.getByLibrary(libraryID, true)` (existing call;
  Zotero loads collections of every non-feed library at startup).
- Items: `await Zotero.Libraries.get(root.libraryID).waitForDataLoad("item")` already uses the
  chosen collection's own library (`gatherMonitorData`), so group items load the same way. The
  first choice in a big group can take a few seconds; "Loading items…" already covers that.
- Why `Zotero.Groups.getAll()` and not `Zotero.Libraries.getAll()`: the latter also returns
  feeds, so we would have to filter them out; `Groups.getAll()` excludes them by construction.
  The pure helper still drops anything whose `libraryType` is not `"user"` or `"group"`
  (belt and braces).
- A library that was erased while we hold it throws on most property reads ("has been
  disabled"). Every read of the library list is done fresh (never cached objects across
  events) and inside `try`/`catch`; a failure logs and shows the existing load error.

Every API above is in `docs/zotero-api-notes.md` (Feature 003b rows), Verified (source) at
Zotero 10.0.9; runtime confirmation is RT-G1–RT-G3.

### UI: how the user picks a library (alternatives)
**Option A (recommended): one dropdown, grouped by library.** HTML has a built-in element for
headings inside a dropdown: `<optgroup label="…">`. The browser shows the label as a bold,
non-selectable heading and the options under it indented.

```
Collection: [ Choose a collection…            v ]
            My Library
               Climate review
                  Heat
            Lab Group
               Shared papers
            Old Project Group
               (no collections)
```
- Pros: one control, one click, like Zotero's own left pane (My Library, then the groups).
  Option values stay **collection IDs**, which are unique across all libraries (they are the
  row numbers of one database table), so `onCollectionChange` and everything after it keep
  working unchanged. Smallest code change; nothing new to explain to users.
- Cons: with many groups and collections the list gets long (no search). Needs RT-G3 because
  `<optgroup>` has not been tried in our chrome document (standard HTML, expected to work).
- **Fallback if RT-G3 fails:** a disabled `<option>` with the library name as a heading line
  before each library's collections (works in any dropdown; slightly less accessible).

**Option B: a separate "Library" dropdown before the collection dropdown.**
- Pros: each list is short; a natural place for a later "whole library" scope.
- Cons: two clicks for every switch; a second control whose state must be kept in sync with the
  first (which library is chosen when a saved table of another library is opened? when the
  chosen library disappears?); more code and more strings; for most users (only My Library)
  the first dropdown has one entry and looks odd.

Recommendation: **A**, with the fallback above.

### Workspace changes (`src/content/workspace.js`)
Pure helpers (no Zotero, no DOM; unit-tested in Node):
- `libraryOptionGroups(libraries, collectionsByLibrary, noCollectionsText)` →
  `[{ libraryID, label, options: [{ value, label }], empty: boolean }]` (AC5). Reuses
  `collectionOptions` for the indentation.
- `libraryOfKey(collectionKey)` → the numeric library ID before the `/` (or `null`).

Document code:
- **`buildCollectionIndex()`** (sync): reads the library list and every library's collections
  once and fills **all-library** maps: `collectionKeys` (collection ID → key), `collectionNames`
  (key → name), `libraryNames` (libraryID → name), `listedLibraryIDs` (a `Set`). Called in
  `init`, after every `gatherMonitorData` (instead of today's `this.collectionKeys =
  data.collectionKeys` and `this.collectionNames = new Map(…)`, which replace the maps with
  **one** library's entries), on Refresh, and after `group`/`collection` events.
- **`renderCollectionSelect()`**: rebuilds the dropdown from the index with one `<optgroup>`
  per library (created with `createElementNS(HTML_NS, "optgroup")`, `group.label = name`;
  the `label` property is a plain-text attribute, never parsed as markup); keeps the
  placeholder option; restores the chosen value if that collection still exists, otherwise
  resets to the placeholder, clears the table and shows `tabellify-collection-gone`.
  "No collections in any library" shows the existing status with new text.
- **`gatherMonitorData`**: unchanged reads (already library-aware).
- **Suggestions:** `loadLibraryTags(libraryID)` reads `Zotero.Tags.getAll(libraryID)` and
  remembers which library the index belongs to (`libraryIndexID`). When the chosen
  collection's library differs from `libraryIndexID`, the list is marked stale and re-read on
  the next focus of the script box (the existing stale-flag mechanism), or at once if the box
  has focus. Before any choice: `Zotero.Libraries.userLibraryID`. Log line: counts and the
  numeric library ID only.
- **Notifier observer:** add `"group"` to the registered types (`["item-tag",
  "collection-item", "item", "collection", "group"]`). In `onNotify`, a `group` or
  `collection` event sets `libraryListStale = true` and (re)starts the **existing** debounce
  timer even when no collection is chosen; `onRecomputeTimer` first rebuilds the index and the
  dropdown when `libraryListStale`, then re-reads the chosen collection as today. No new timer,
  no new observer (lifecycle unchanged: the same `unregisterMonitorObserver` removes it).
  `item-tag` keeps marking the suggestion list stale (no filtering by library: simpler, and a
  re-read is cheap).
- **Saved tables:** `collectionLabel(key, savedName)` unchanged in logic but now sees every
  library's collections. `savedEntry` adds a first meta part with the library name
  (`libraryNames.get(libraryOfKey(key))`), left out when the library is not listed (removed
  group). `renderViewMeta` adds the same part. `liveCollectionId` searches the all-library
  `collectionKeys`. `liveBlocker` text changes (see strings).
- **Manual-order pruning:** `saveLayout` passes `listedLibraryIDs` to
  `TabellifyTableLayout.layoutData`; see "Data".
- **Debug Output:** "listing N collection(s) in L librar(ies) (G group(s))"; never a name
  (SEC-011, `no-private-logs.test.mjs`).

### Pure model change (`src/content/table-layout-model.js`)
`cleanManualOrders(entries, knownCollectionKeys = null, listedLibraryIDs = null)` and
`layoutData(columnLayout, manualOrders, knownCollectionKeys = null, listedLibraryIDs = null)`:
when `listedLibraryIDs` is given, an entry is dropped only if its library **is** listed and
its key is not in `knownCollectionKeys`; entries of libraries that are not listed are kept.
Default `null` keeps today's behaviour (all existing tests unchanged). AC11.

### Reader section (`src/reader-tags.js`)
No change. It already calls `Zotero.Libraries.get(item.libraryID).waitForDataLoad("item")` for
the shown item's own library and reads that item's attachments and annotations, so a group
PDF is counted from its own highlights (AC19). It reads the shared codebook as before.

### Fluent strings (`src/locale/en-US/tabellify.ftl`)
- Changed text, same ID (only en-US exists, so there are no translations to invalidate; Q12):
  `tabellify-no-collections` = "Your libraries have no collections yet.";
  `tabellify-view-live-no-collection` = "This table's collection is no longer available (it
  was deleted, is in the trash, or its group library was removed), so only the saved snapshot
  can be shown."
- New: `tabellify-collection-none-in-library` = "(no collections)";
  `tabellify-collection-gone` = "The chosen collection is no longer available. Choose another
  collection."
- Library names are **not** Fluent strings: "My Library" comes from Zotero's own localized
  `library.name`, group names from zotero.org.

### Data
- **`layout.json` (ADR-0014/0019):** manual orders are already keyed `"<libraryID>/<key>"`
  (`collectionKeyMap`), and keys from different libraries cannot collide (Zotero's database
  makes `(libraryID, key)` unique). **No schema change.** Column order is one order for the
  whole tab (not per collection or library): unchanged.
- **Data-loss bug that groups would trigger (fixed here):** today `saveLayout` passes the
  current read's collection keys as "known" collections, and `cleanManualOrders` **drops every
  manual order not in that set**. With only My Library that set is every collection. With
  groups it would hold only the chosen library's collections, so one paper move in a group
  collection would delete every My Library manual order from `layout.json`. The fix: the
  known set covers every listed library, and orders of libraries not currently listed are kept
  (AC11, AC12).
- **`tables.json` (ADR-0018):** each saved table's `definition.collectionKey` is already
  `"<libraryID>/<key>"` (validated by `COLLECTION_KEY_PATTERN`). **No schema change.** The
  library name is looked up live; it is not stored (storing it would change the snapshot
  schema and need an ADR-0018 amendment). Consequence: a table whose group was removed shows
  only "<saved collection name> (collection not found)", without the old group name (Q5 notes
  the alternative).
- **Library IDs are local to this Zotero installation.** A group's `libraryID` is a row number
  in this computer's database; another computer (or a fresh install that syncs the same group)
  may give the same group a different number. Tabellify's files live in this data directory
  and are not synced, so this is fine in practice. Two edge cases, both acceptable for 0.2.0:
  1. If a user copies only the `tabellify` folder to another computer, group tables and manual
     orders may show "collection not found" there (My Library is usually ID 1 everywhere, so it
     is less affected). Copying the whole Zotero data directory (Zotero's documented way to
     move) keeps the IDs.
  2. SQLite may reuse the highest library ID after that group is removed. A later group could
     then get the old number, but its collection keys are different random 8-character keys,
     so no old entry matches; old entries are pruned at the next save.
  ADR-0014's note "keys stay valid on another computer" therefore holds for collection and item
  **keys**, not for the library-ID prefix of a group. If the owner wants portability, key
  group entries by the global zotero.org group ID (e.g. `"g<groupID>/<key>"`): that is a storage
  format change and needs an ADR (Q11).

### Codebook
One codebook for all libraries (ADR-0016 unchanged): codebook tags are names, matched against
each paper's tags by exact name after trim + NFC (case-sensitive), exactly as today. A team
that uses "Heat" in the group and "heat" in My Library sees two different tags, as Zotero does.
Per-library codebooks are a later decision (they would change `codebooks.json`: ADR needed).

### Is an ADR needed?
**No.** No new subsystem, storage format, schema, dependency, public interface or UI surface:
the dropdown and the saved-tables list exist; they show more entries. The pruning fix changes
behaviour inside ADR-0014's existing rule ("collections that no longer exist are pruned").
An ADR becomes necessary only if the owner picks Q11 (group-ID keys), Q5-alternative
(store the library name in snapshots) or per-library codebooks.

### Files touched
| File | Change |
|---|---|
| `src/content/workspace.js` | Pure helpers; `buildCollectionIndex`, `renderCollectionSelect`; suggestions per library; observer gains `"group"`; saved-tables library names; pruning call |
| `src/content/table-layout-model.js` | `cleanManualOrders` / `layoutData`: optional `listedLibraryIDs` |
| `src/content/workspace.css` | Only if needed for `<optgroup>` / disabled placeholder look (tokens only, ADR-0015) |
| `src/locale/en-US/tabellify.ftl` | Two changed, two new messages |
| `src/manifest.json`, `package.json` | `version` → `0.2.0` |
| `tests/unit/workspace-helpers.test.mjs`, `tests/unit/table-layout-model.test.mjs`, `tests/unit/workspace-init-unload.test.mjs`, `tests/unit/workspace-table.test.mjs`, `tests/helpers/zotero-mock.mjs`, `tests/static/workspace-script.test.mjs` | New/updated tests; mock gains `Zotero.Groups.getAll` and group libraries; allow-list gains `Zotero.Groups.getAll` |

Not touched: `src/reader-tags.js`, `src/tabellify.js`, `src/bootstrap.js`, all stores
(`codebook-store.js`, `layout-store.js`, `tables-store.js`), `saved-tables-model.js`,
`tag-monitor-model.js`, `codebook-model.js`, `script-suggest-model.js`, `workspace.xhtml`
(the `<select>` stays; options are built in JS).

## Zotero APIs used
All recorded in `docs/zotero-api-notes.md` ("Feature 003b" rows), checked against Zotero
source at tag **10.0.9** on 2026-11-16:
- **New in `src/`:** `Zotero.Groups.getAll()`; reading `library.libraryID`, `library.libraryType`,
  `library.name` on the returned objects; `<optgroup>` (standard HTML; runtime RT-G3);
  Notifier type `"group"` (events `add` / `modify` / `delete`).
- **Reused with a group library ID** (existing rows; RT-G2 confirms): `Zotero.Libraries.get`,
  `Zotero.Libraries.userLibraryID`, `library.waitForDataLoad("item")`,
  `Zotero.Collections.getByLibrary`, `Zotero.Tags.getAll(libraryID)`, item/attachment/annotation
  getters, `Zotero.Notifier.registerObserver` / `unregisterObserver`.
- **Recorded, not used:** `Zotero.Libraries.getAll()` (includes feeds), `library.editable`,
  `filesEditable`, `archived`, `group.groupID`, `isGroup`, `isFeed`.
- Not in any zotero.org developer guide (same status as `getByLibrary`): data-layer APIs that
  Zotero's own collection tree uses. Maintenance risk: low to moderate; re-check `groups.js`,
  `library.js` and `notifier.js` before each `strict_max_version` raise.

## Data safety
- **Read:** the list of libraries (My Library and groups), their collections, the chosen
  collection's papers, attachments, annotations and tags, and the chosen library's tag names.
  The same kinds of reads as 0.1.0, now also for group libraries.
- **Written:** nothing in any Zotero library. Tabellify's own files (`codebooks.json`,
  `layout.json`, `tables.json`) and the existing `extensions.tabellify.countItemTags` pref are
  written exactly as in 0.1.0; no new write site (`write-guard.test.mjs` unchanged).
- Group libraries are often read-only for a member anyway; Tabellify does not rely on that and
  does not read `editable`.
- `layout.json`: the pruning fix **reduces** a data-loss risk (AC11, AC12).
- **Untrusted text:** group names and the names, titles and tags inside a group are typed by
  other people. They reach the page only as plain text (`textContent`, `new Option(text, value)`,
  `optgroup.label`), never as markup (`no-html-sinks.test.mjs`), and never appear in Debug
  Output (`no-private-logs.test.mjs`).

## Owner setup: a test group library in the dev profile
Group libraries exist only through zotero.org sync (Zotero's own code says "Groups only come
from sync"). So the dev profile must sync with a zotero.org account.

**Recommendation: use a new, free zotero.org account made only for testing, not your real
account** (open question Q3). Reasons: syncing your real account would download all your real
libraries into the dev profile, and anything you do there while testing (tagging highlights,
deleting test items) would sync back into your real libraries. That is exactly what rule 8
("never access the owner's real Zotero data") is meant to prevent. Side effect to know: the
first sync uploads the dev profile's current My Library (test data) to the test account.

Numbered steps (for the owner):
1. **Create a test account.** In your web browser, open `https://www.zotero.org/user/register`,
   create an account with a username such as `tabellify-test` and an email address you can
   read, and confirm the email. *You should see:* your new account's start page on zotero.org.
2. **Create the main test group.** In the same browser, signed in as the test account, open
   `https://www.zotero.org/groups/new`. Enter the group name `Tabellify Test Group`, choose
   **Private Membership**, and click **Create Group**. On the settings page that follows, keep
   the defaults and save. *You should see:* the group's page on zotero.org.
3. **Create a disposable group** the same way, named `Tabellify Disposable Group` (it will be
   deleted in AC15). For AC16, also create `Tabellify Keep Group`.
4. **Start the dev Zotero with Debug Output captured.** In Terminal, run:
   ```
   zotero -P tabellify-dev -ZoteroDebugText > build/debug-1.txt
   ```
   (from the repository folder; use the next free number). *You should see:* the dev Zotero
   window with your test My Library.
5. **Link the dev profile to the test account.** In the dev Zotero window, choose
   **Zotero → Settings…**, then the **Sync** pane. Enter the **test** account's username and
   password and click the button under them to log in (its exact label in 10.0.9 was not
   checked). Leave file syncing for group libraries on (the free account includes 300 MB).
   *You should see:* the pane shows you logged in as the test account.
6. **Sync.** In the dev Zotero window, click the round **Sync with zotero.org** button at the
   top right. *You should see:* after a few seconds, a **Group Libraries** heading in the left
   pane with the groups from steps 2–3.
7. **Fill the main test group.** In the left pane, right-click **Tabellify Test Group** →
   **New Collection…**, name it `Shared papers`; right-click `Shared papers` → **New
   Subcollection…**, name it `Sub`. Drag 2–3 small PDFs into `Shared papers` and one into
   `Sub`. Open one PDF, make two highlights, and give them tags that are in your Tabellify
   codebook, plus one tag `group-only-tag` (used nowhere in My Library). Add one collection
   with a PDF to `Tabellify Disposable Group` too. Click **Sync with zotero.org** again.
   *You should see:* no sync error.
8. **Run RT-G1, RT-G2, RT-G3** from `docs/zotero-api-notes.md` (dev Zotero window →
   **Tools → Developer → Run JavaScript**; tick **Run as async function** for RT-G2 and RT-G3)
   and paste the results into the Claude Code session in Terminal.

Later, for AC15: on zotero.org, open `Tabellify Disposable Group` → group settings → delete the
group; then in the dev Zotero window click **Sync with zotero.org**. Zotero asks "You are no
longer a member of the group ‘Tabellify Disposable Group’." with the buttons **Remove Group**
and **Keep Group**: choose **Remove Group**. (AC16: repeat with `Tabellify Keep Group` and
choose **Keep Group**.)

## Test plan
| AC | How |
|---|---|
| AC1–AC3 | Owner runtime checks RT-G1–RT-G3 before development |
| AC5, AC11 | Unit tests (pure helpers, `node:test`) |
| AC10, AC14 | Workspace tests with the Zotero mock (group libraries added to the mock) |
| AC17, AC20 | Static tests (`npm test`) |
| AC4, AC6–AC9, AC12, AC13, AC15, AC16, AC18, AC19 | Owner smoke test in the dev profile with Debug Output in `build/debug-N.txt` (prototype mode: one combined run) |

Regression: the existing suite must pass unchanged except where this spec changes behaviour
(observer types, the "no collections" text, the select's structure).

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Approve spec, answer Q1–Q13; create test account and groups; run RT-G1–RT-G3 (AC1–AC3) | owner | — | none (dev profile, zotero.org) |
| T1 | Pruning rule with `listedLibraryIDs` + unit tests (AC11) | developer | T0 | `src/content/table-layout-model.js`, `tests/unit/table-layout-model.test.mjs` |
| T2 | Pure helpers `libraryOptionGroups`, `libraryOfKey` + unit tests (AC5) | developer | T0 | `src/content/workspace.js` (pure-helper section only), `tests/unit/workspace-helpers.test.mjs` |
| T3 | Workspace: library index, grouped dropdown (or fallback per AC3), suggestions per library, `"group"` events, saved-tables library names, pruning call, strings; mock + tests (AC10, AC14, AC17) | developer | T1, T2 | `src/content/workspace.js`, `src/content/workspace.css` (only if needed), `src/locale/en-US/tabellify.ftl`, `tests/helpers/zotero-mock.mjs`, `tests/unit/workspace-init-unload.test.mjs`, `tests/unit/workspace-table.test.mjs`, `tests/static/workspace-script.test.mjs` |
| T4 | Owner smoke test (AC4, AC6–AC9, AC12, AC13, AC15, AC16, AC18, AC19) | owner | T3, T5 | none |
| T5 | Version 0.2.0 (AC20) | developer | — | `src/manifest.json`, `package.json` |
| T6 | Release notes: CHANGELOG (0.1.0 never published; 0.2.0 first public release, group libraries), release checklist 0.1.0 → 0.2.0, PRD roadmap row for 003b | docs-writer (or orchestrator) | T0 | `CHANGELOG.md`, `docs/release-checklist.md`, `docs/product-requirements.md` |
| T7 | User docs for group libraries (part of the pre-release docs pass) | docs-writer | T4 | `README.md`, `docs/wiki/Workspace.md`, `docs/wiki/FAQ.md`, `docs/wiki/Getting-Started.md`, `docs/wiki/Saved-Tables.md`, `docs/wiki/Codebooks.md`, `docs/wiki/Data-Safety-and-Privacy.md`, `docs/wiki/Zotero-APIs-Used.md`, `docs/wiki/Changelog.md` |
| T8 | Delete the v0.1.0 draft GitHub release (tag stays) | owner (approval) | T0 | GitHub only |

T1, T2 and T5 have non-overlapping file scopes and can run in parallel. T2 and T3 both touch
`workspace.js`, so T3 starts after T2. Older specs (004, 005, 006b, 007b) say "My Library only":
leave them as historical records; this spec supersedes those lines.

## Open questions (with recommendations)
1. **Q1 Spec number.** `003b` (extends F003; F009 is taken by column customization in the
   PRD) or a new number with a PRD renumbering? *Recommended:* `003b`.
2. **Q2 Picker UI.** One grouped dropdown (A) or a separate library dropdown (B)?
   *Recommended:* A, with the disabled-heading fallback if RT-G3 fails.
3. **Q3 Test account.** A new free zotero.org test account for the dev profile, or your real
   account? *Recommended:* a new test account (reasons in "Owner setup"). Please confirm
   before step 5.
4. **Q4 Highlights by other group members.** In a group, a PDF's highlights can come from
   several people. Count all tagged highlights (what Zotero shows) or only your own?
   *Recommended:* count all for 0.2.0 (a synthesis table is usually a team product). "Only
   mine" would need annotation-author APIs that are not verified yet; a later option.
5. **Q5 Library name in the Saved tables list.** Always (also "My Library · …"), or only when
   the user has at least one group? *Recommended:* always (predictable). Alternative noted: also
   store the library name in the snapshot so a removed group's name stays visible; that changes
   `tables.json` and needs an ADR-0018 amendment; not recommended now.
6. **Q6 Pruning rule.** Keep manual orders of libraries not currently listed (recommended:
   safer if a group is briefly missing) or prune everything not found?
7. **Q7 Live dropdown.** Rebuild the dropdown on `group` and `collection` events and on Refresh
   (recommended; groups often arrive by sync while the tab is open), or only when the tab opens
   (today's behaviour)?
8. **Q8 Suggestions scope.** Chosen collection's library (recommended; matches the table) or
   all libraries combined?
9. **Q9 Version and v0.1.0.** 0.2.0 (recommended) or 0.1.1; delete the v0.1.0 draft release and
   leave the tag (recommended); CHANGELOG note that 0.1.0 was never published (recommended).
10. **Q10 Read-only marker.** Show "(read-only)" next to read-only groups? *Recommended:* no:
    Tabellify never writes, so it changes nothing for the user, and Zotero already shows it.
11. **Q11 Portable group keys.** Accept local library IDs in `layout.json` / `tables.json`
    (recommended for 0.2.0), or move group entries to global group-ID keys (needs an ADR and a
    migration)?
12. **Q12 Fluent IDs.** Change the two existing messages' text in place (recommended; only
    en-US exists) or create new IDs?
13. **Q13 Whole-library scope.** Many groups keep papers outside any collection. Add "All
    papers in <library>" as a choice later? *Recommended:* a separate small feature after
    0.2.0, not in this spec.
