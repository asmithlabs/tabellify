# Feature 005: Tag monitor (used / remaining curated tags for a collection)

- **Status:** Approved (owner, 2026-11-13)
- **Branch:** `feat/005-tag-monitor`
- **Related ADRs:** 0009 (workspace tab), 0012 (Proposed: data storage, read only here),
  0011 (security), 0003 (no bundler). **No new ADR** (reasoning in "Live updates → Does this
  need an ADR?"). PRD §3 step 3, §4 "Tag monitor" sketch, §7 Q2.
- **Process:** prototype mode (CLAUDE.md). Developer builds; `npm test` + `npm run build`
  pass; owner runs one smoke test (the `[manual]` ACs) with Debug Output captured to
  `build/debug-N.txt`.

## Problem / objective
While reading and tagging the papers of a collection, the researcher wants to know **how much
of the codebook has been applied** — overall and **per paper** — and **which planned tags are
still missing** (PRD §3 step 3; sketch: "Tags used 4/15", list of remaining tags). F003 lists
a collection's items and tags; F004 stores the codebook. F005 compares the two: codebook tags
(planned) against **manual** tags actually on the chosen collection's papers, including papers
in its subcollections and tags on their highlights (used).

## Owner decisions (2026-11-12)
1. **Subcollections count, recursively.** A paper in several subcollections (or in the
   collection and a subcollection) counts once.
2. **Annotation (highlight) tags count.**
3. **Live updates** through a `Zotero.Notifier` observer (registered when the workspace opens,
   unregistered on unload, also when the plugin shuts down with the tab open), debounced
   recompute, **and always a "Refresh" button**. If live updates cannot be verified, ship
   Refresh only (see "Fallback").
4. **Automatic tags do not count** (only manual tags, `type` 0).
5. **Paper count per used tag: yes.** Plus a **per-paper view**: "codebook tags on this paper:
   k/M" and a way to see that paper's remaining codebook tags (recommended: in-tab expandable
   row, no dialog).
6. **Tags used but not in the codebook: not shown.**
7. **Reader / item-pane panel: deferred** (F005b, ADR-0013 when scheduled).

### Final decisions (2026-11-13)
- **Q-new-1:** one table: the per-paper table replaces the F003 item list.
- **Q-new-2 (changed):** **clickable column headers sort the table** (click again to reverse).
  Default order when a collection is chosen: fewest codebook tags first, then title.
  `sortPapers` takes a sort key and direction; unit-test every sortable column.
- **Q-new-3, Q-new-4, Q-new-5, Q-new-6:** recommendations accepted.
- **Reader popup:** the owner's main goal is a compact popup in the reader showing this
  paper's remaining codebook tags. That is **F005b**, scheduled next, with ADR-0013 drafted
  in parallel with this build.

## Scope
**In scope:**
- A **"Tag monitor"** section in the workspace tab, under the F003 collection dropdown, driven
  by that dropdown.
- **Summary:** "Tags used N/M" (M = tags in the codebook, N = codebook tags used on at least
  one paper in scope); "All codebook tags are used" when N = M; "Papers: P" (distinct papers
  in scope).
- **Per group** (codebook order): group name, "n/m", **remaining** tags, **used** tags each with
  its paper count ("Heat index · 3 papers").
- **Per paper** (replaces the F003 items table, see Q-new-1): one row per distinct paper in
  scope with title, "k/M", the subcollection(s) it sits in, and a "Show remaining" toggle
  that expands a detail row listing, per group, that paper's present and remaining codebook
  tags. Default sort: fewest codebook tags first (Q-new-2).
- **Live updates** (debounced) + **Refresh** button.
- Recompute after codebook edits in the same tab (no library read needed).
- Read-only library access; nothing written anywhere.

**Out of scope (deferred, with reason):**
- Reader / item-pane panel (F005b): new UI surface, needs ADR-0013 and a "which collection"
  rule.
- Off-plan tags (decision 6).
- Group libraries (F004 decision 7: My Library only).
- A dialog or separate window for the per-paper view (a new surface; not needed, see Design).
- Per-annotation drill-down (which highlight carries a tag): F006.
- Writing anything (no creating missing tags, no notes, no saved monitor state).

## User stories
- As a researcher, I choose my "Heat & health" collection, which I split into one
  subcollection per phenotype, and see "Tags used 4/15" across all its papers.
- As a researcher, I see each paper's "k/15", with the least-coded papers first, and expand a
  paper to see which planned tags it still lacks.
- As a researcher, I tag a highlight in the reader, switch back to the Tabellify tab, and the
  monitor already counts it (or I click Refresh).
- As a researcher, automatic tags that came with imported metadata don't inflate my counts.
- As a researcher, I trust that the monitor never changes my library.

## How "used" is computed
Assumes F004 decisions: one global codebook, exact case-sensitive match after trimming, every
tag in a group, My Library only.

1. **Codebook tags** (`M`): every tag in `data.codebooks[0].groups`, in codebook order (already
   trimmed and unique).
2. **Collections in scope**: the chosen collection and **all its descendants**. Computed by a
   pure function from a fresh snapshot `{ id, parentID, name }` of
   `Zotero.Collections.getByLibrary(libraryID, true)` (already verified in F003: synchronous,
   in-memory, excludes trashed collections). No new API. Guarded against cycles with a
   visited set (should never happen in a tree, but cheap).
3. **Papers in scope**: for each collection in scope, `collection.getChildItems()` (direct,
   non-trashed members) filtered with `isRegularItem()`, **de-duplicated by `item.id`**. For
   each paper we remember the names of the in-scope collections it was found in (for the
   per-paper "In" column; trivial, since we already walk them).
4. **Tags on a paper** = the union of
   - **item tags** `item.getTags()`, and
   - **annotation tags**: `Zotero.Items.get(item.getAttachments())` →
     `.filter(a => a.isFileAttachment())` → `a.getAnnotations()` → `ann.getTags()`,
   keeping **only manual tags**: `(t.type ?? 0) === 0`. (`getTags()` omits `type` for manual
   tags and sets `1` for automatic ones; Zotero allows only 0 and 1. Highlights tagged in the
   reader are saved without a type, i.e. manual.) Tag names are trimmed before comparing.
5. A codebook tag is **used** if at least one paper in scope carries it (item or highlight).
   **Paper count** = number of distinct papers carrying it (a paper with the tag on the item
   and on three highlights counts once).
6. **Per paper:** `k` = number of codebook tags the paper carries; **remaining** = the other
   codebook tags, grouped by group, in codebook order.

All of 2–6 except the Zotero reads is **pure logic** in `src/content/tag-monitor-model.js`,
unit-tested in Node. The document code only gathers plain objects:
```
collections: Array<{ id: number, parentID: number | null | false, name: string }>
papers:      Array<{ id: number, title: string, collectionId: number,
                     itemTags: Array<{tag, type?}>, annotationTags: Array<{tag, type?}> }>
```
(one `papers` entry per paper *per collection it was found in*; the model merges duplicates.)

**Why not a Zotero search?** There is no annotation-tag search condition and the `resultLevel`
syntax is UNVERIFIED (API notes R5/R6). Walking already-loaded items uses only
source-verified, read-only getters.

**Data loading.** F003 already calls `await library.waitForDataLoad("item")`. At 10.0.9,
`Zotero.Item.prototype._dataTypes` includes `tags`, `annotation`, `childItems`, and annotations
are items, so that call should load attachment/annotation lists and annotation tags too
(source inference; **R10** confirms). Fallback if R10 fails: `await
Zotero.Items.loadDataTypes(annotations, ["tags"])`.

**Cost.** A 90-paper collection with subcollections is a few thousand in-memory calls per
recompute, no database query after the first load. Fine with debouncing.

## Live updates
### Which events fire (Zotero 10.0.9 source; see API notes)
| User action | Notifier event (`event`, `type`) | `ids` | Source |
|---|---|---|---|
| Add a tag to an item **or a highlight** (any save of a `Zotero.Item`) | `add`, `item-tag` | `"<itemID>-<tagID>"` strings; `extraData[id] = { libraryID, tag, type }` | `item.js` `_saveData` |
| Remove a tag from an item or highlight | `remove`, `item-tag` | same | `item.js` `_saveData` |
| Tag a highlight in the reader | same as above: `Zotero.Annotations.saveFromJSON` → `item.setTags(...)` → `item.saveTx(saveOptions)` (no `skipNotifier`) | annotation item ID | `annotations.js` |
| Rename a tag (tag selector) | `modify`, `item-tag` | `"<itemID>-<newTagID>"` | `tags.js` `rename` |
| Delete a tag from the library (tag selector) | `remove`, `item-tag` | `"<itemID>-<tagID>"` | `tags.js` `removeFromLibrary` |
| Add / remove a paper to / from a collection | `add` / `remove`, `collection-item` | `"<collectionID>-<itemID>"` | `item.js` `_saveData` |
| Move a paper to the trash | `trash`, `item` | item ID | `item.js` `_saveData` |
| Create / move / delete a subcollection | `collection` events (`add`/`modify`/`delete`/`trash`) | collection IDs | **UNVERIFIED** which events; covered by R11 and by Refresh |

Exception: a save with `skipNotifier: true` fires nothing. Zotero uses that for some internal
saves (e.g. parts of sync); Refresh covers them.

### Design
- In `workspace.js`, after the first successful load:
  `this.notifierKey = Zotero.Notifier.registerObserver({ notify: this.onNotify },
  ["item-tag", "collection-item", "item", "collection"], "tabellify-tag-monitor")`.
  Store the **returned key**.
- `onNotify(event, type, ids, extraData)`: if no collection is chosen, do nothing; otherwise
  schedule one recompute **500 ms** after the last event (`window.clearTimeout` +
  `window.setTimeout`, timers of this document). No filtering by ID in the MVP (simple and
  correct; one recompute is cheap). The recompute reuses F003's `requestCounter`, so a stale
  result is dropped.
- **Unregister:** in the document's `unload` handler: `Zotero.Notifier.unregisterObserver(key)`,
  clear the pending timer, log `Tabellify: workspace: tag monitor: notifier observer
  unregistered`.
- **Plugin shutdown with the tab open:** `Tabellify.shutdown()` already closes every workspace
  tab and fallback window (`closeAllWorkspaceTabs`, `src/tabellify.js`), which unloads the
  workspace document and runs the handler above. **Belt and braces:** `onNotify` first checks
  that its document is still alive (`document.defaultView` is non-null, inside `try`); if not,
  it unregisters itself and returns. This needs no change to `tabellify.js` or `bootstrap.js`.
  Whether the iframe's `unload` fires when `Zotero_Tabs.close` removes the container is
  **checked by AC10** (log line on disable).
- **Refresh** button always present: recomputes immediately.

### Fallback
If R11 shows no `item-tag` events for a highlight tag, or AC10 shows the observer is not
unregistered on disable, the developer removes the observer and ships **Refresh only** (AC9
becomes "after clicking Refresh"). The spec stays valid otherwise.

### Does this need an ADR?
**No** (agreeing with the coordinator), because CLAUDE.md rule 7 lists new subsystems, storage
formats, dependencies, public interfaces and UI surfaces, and this is none of them:
- No new UI surface: everything is inside the existing workspace tab document.
- No new subsystem or storage: a recompute trigger for an existing view, no persisted state.
- No public interface: Tabellify exposes nothing to Zotero or other plugins.
- `Zotero.Notifier` is Zotero's standard change-notification mechanism (described on the
  JSAPI page; methods verified in source), and its lifecycle is fully specified here (one
  register, one unregister, a self-check, an AC).
What *would* tip it into an ADR: registering the observer from `tabellify.js` (plugin-wide,
outliving documents), or sharing monitor state across documents (e.g. for the F005b reader
panel). Neither is in F005.

## Where the monitor appears
- **Chosen: section in the workspace tab** (Option A). No new surface, no `bootstrap.js` /
  `tabellify.js` changes.
- **Per-paper detail: in-tab expandable row**, not a dialog. Each paper row has a "Show
  remaining" toggle button (`aria-expanded`), which shows a detail row under it with the
  paper's present and remaining codebook tags, per group. Reasons: no new window/dialog
  surface (no ADR, no lifecycle), works in the tab and the fallback window alike,
  `window.prompt/confirm`-style dialogs are not verified in the tab iframe (F004 note),
  several papers can be open side by side. A dialog would only be better for very long
  content; nothing here needs it.
- **Reader / item-pane panel (F005b, deferred):** `Zotero.ItemPaneManager.registerSection`
  (verified at 10.0.8). It shows a section for **one** paper beside the reader; the monitor
  is per collection, so it needs a rule for which collection, plus ADR-0013. The pure model
  is reused unchanged.

## Acceptance criteria
`[manual]` = owner smoke test in the dev profile (Zotero 10.0.9). `[auto]` = `npm test`.

**Smoke-test setup (owner, in the dev profile, by hand in Zotero, not by plugin code):**
- Codebook: "Exposure" = `Heat index`, `Temperature`; "Outcome" = `Hospitalization`,
  `Mortality` (M = 4).
- Collection "F005 test" with subcollections "Phenotype A" and "Phenotype B".
  - Paper 1 directly in "F005 test": item tag `Heat index`.
  - Paper 2 in **both** "Phenotype A" and "Phenotype B": `Hospitalization` on a **highlight
    only** (PDF attached).
  - Paper 3 in "Phenotype B": an **automatic** tag named `Temperature` (e.g. imported with the
    metadata) and no manual codebook tags. If no automatic tag is at hand, skip AC3.

- [ ] AC1 `[manual]` **Summary with subcollections.** Choosing "F005 test" shows "Tags used
  2/4" and "Papers: 3" (Paper 2 counted once).
- [ ] AC2 `[manual]` **Per group.** "Exposure 1/2": `Heat index · 1 paper` used, `Temperature`
  remaining. "Outcome 1/2": `Hospitalization · 1 paper` used (highlight only), `Mortality`
  remaining. Codebook order kept.
- [ ] AC3 `[manual]` **Automatic tags excluded.** `Temperature` stays remaining although Paper 3
  carries it as an automatic tag; Paper 3 shows 0/4.
- [ ] AC4 `[manual]` **Per-paper view.** The paper list shows Paper 3 (0/4) first, then Papers 1
  and 2 (1/4); Paper 2's "In" column names both "Phenotype A" and "Phenotype B". Clicking
  "Show remaining" on Paper 1 shows `Temperature` (Exposure), `Hospitalization`, `Mortality`
  (Outcome) as remaining and `Heat index` as present; clicking again hides it.
- [ ] AC5 `[manual]` **Choosing a subcollection** ("Phenotype A") shows only Paper 2: "Tags used
  1/4", "Papers: 1".
- [ ] AC6 `[manual]` **Live update (item tag).** With the Tabellify tab showing "F005 test", the
  owner adds the manual tag `Mortality` to Paper 1 in the library view and switches back:
  without clicking anything, the summary reads "Tags used 3/4" and Paper 1 shows 2/4.
- [ ] AC7 `[manual]` **Live update (highlight tag).** The owner adds `Temperature` to a highlight
  of Paper 2 in the reader and switches back to the Tabellify tab: "Tags used 4/4" and "All
  codebook tags are used". Then removes it again: back to 3/4.
- [ ] AC8 `[manual]` **Refresh.** Clicking "Refresh" gives the same numbers as the live view and
  logs `Tabellify: workspace: tag monitor: recomputed …`.
- [ ] AC9 `[manual]` **Codebook edits.** Adding `Humidity` to "Exposure" changes the summary to
  "…/5", lists `Humidity` as remaining, and every paper's k/M to k/5.
- [ ] AC10 `[manual]` **Observer cleanup.** (a) Closing the Tabellify tab logs `tag monitor:
  notifier observer unregistered`. (b) Reopening the tab, then disabling Tabellify in Tools →
  Plugins with the tab open, logs the same line; adding a tag afterwards produces no
  Tabellify log lines or errors.
- [ ] AC11 `[manual]` **Empty states.** No collection chosen → "Choose a collection" hint; empty
  codebook → "The codebook has no tags yet"; codebook could not be loaded (F004 AC7) → monitor
  unavailable message; collection without papers → "No papers in this collection".
- [ ] AC12 `[manual]` **Nothing written.** After AC1–AC11 the tag selector shows no tags that the
  owner did not add by hand; `codebooks.json` changed only through AC9; Debug Output has no
  Tabellify errors.
- [ ] AC13 `[auto]` **Pure model** (`tests/unit/tag-monitor-model.test.mjs`):
  - `descendantIds`: root only; nested levels; siblings excluded; unknown root → empty;
    cycle-safe.
  - `summarize`: empty codebook; no papers; item-tag match; highlight-tag match; a paper
    listed under two collections counts once and keeps both collection names; tag on item and
    highlight of the same paper counts the paper once; **automatic tags (`type: 1`) ignored**
    for item and highlight tags, missing `type` = manual; case-sensitive; surrounding spaces
    ignored; non-codebook tags ignored; per-group n/m; total N/M; `allUsed`; paper counts.
  - **Per paper:** k/M; remaining grouped by group in codebook order; present list.
  - `sortPapers`: fewest k first, then title (`localeCompare`, base sensitivity, numeric);
    untitled last within the same k.
  - Inputs not mutated.
- [ ] AC14 `[auto]` **Safety guards.** `write-guard` passes with **no** new allow-list entries;
  the F003 allow-list in `tests/static/workspace-script.test.mjs` gains exactly
  `Zotero.Items.get`, `Zotero.Notifier.registerObserver`, `Zotero.Notifier.unregisterObserver`;
  `tag-monitor-model.js` uses no Zotero / DOM / IOUtils globals; `workspace.js` contains
  exactly one `registerObserver(` and at least one `unregisterObserver(` (symmetry);
  `no-html-sinks` passes; every new Fluent id exists; `tag-monitor-model.js` loads after
  `codebook-model.js` and before `workspace.js`.

## Design
### Files
- **New pure model** `src/content/tag-monitor-model.js`: one global `TabellifyTagMonitor`
  (classic script with `var`, like `codebook-model.js`):
  - `descendantIds(collections, rootId)` → `number[]` (root first).
  - `summarize(codebookData, collections, rootId, papers)` →
    `{ total, used, allUsed, paperCount,
       groups: [{ id, name, total, used, usedTags: [{ tag, papers }], remainingTags }],
       papers: [{ id, title, untitled, collectionNames, count, total,
                  groups: [{ id, name, present, remaining }] }] }`
  - `sortPapers(papers)` → new array, fewest `count` first, then title.
- **Workspace** `src/content/workspace.xhtml` / `workspace.js` / `workspace.css`:
  - `<html:section id="tabellify-tag-monitor">` under the collection row: heading, summary
    line, "Refresh" button, status line, group list.
  - The F003 items table becomes the per-paper table: Title | Codebook tags (k/M) | In |
    All tags (existing column) | toggle. Detail rows created with `createElementNS` +
    `textContent` only.
  - `showCollection(value)` gathers collections in scope and papers, calls the model, renders
    the section and the table. Annotation gathering per paper is wrapped in `try/catch`: on
    error, log, use the item tags only, and show "Some highlights could not be read".
  - Notifier observer as in "Live updates".
- **Fluent** `src/locale/en-US/tabellify.ftl`: `tabellify-monitor-*` messages; counts use
  Fluent variables (`{ $used }`, `{ $total }`, `{ $papers }`) via
  `document.l10n.formatValue(id, args)`.

### Lifecycle
Nothing new in `bootstrap.js` or `tabellify.js`. New in the workspace document: one Refresh
click listener and one toggle click listener (delegated, on the table), one Notifier
observer, one pending debounce timer. All removed / cleared / unregistered in `onUnload`.

## Zotero APIs used
All in `docs/zotero-api-notes.md`, Zotero 10.0.9 source:

| API | Status |
|---|---|
| `Zotero.Collections.getByLibrary(libID, true)` (subcollection walk, `parentID`) | Verified (source), F003 |
| `collection.getChildItems()`, `item.isRegularItem()`, `item.getTags()`, `getDisplayTitle()` | Verified (source), F003 |
| Tag `type`: 0 manual (omitted in `getTags()`), 1 automatic; only 0/1 allowed | Verified (source) |
| `item.getAttachments()` → IDs | Verified (docs + source) |
| `Zotero.Items.get(ids)` (array) | Verified (source) |
| `item.isFileAttachment()` | Verified (source) |
| `attachment.getAnnotations()` | Verified (source) |
| `waitForDataLoad("item")` covers annotations and their tags | Verified (source, by inference); **R10** |
| `Zotero.Notifier.registerObserver` / `unregisterObserver` | Verified (source) |
| Notifier events for tag add/remove (`item-tag`), collection membership (`collection-item`), trash (`item`), highlight tags via `Zotero.Annotations.saveFromJSON` | Verified (source); **R11** observes them live |
| Notifier events for subcollection changes (`collection`) | **UNVERIFIED** (R11; Refresh covers it) |
| `collection.getDescendents(…)` | Verified (source); **not used** (alternative) |
| `Zotero.ItemPaneManager.registerSection` | Verified (source, 10.0.8); **not used** (F005b) |

Runtime checks for the owner (read-only, Run JavaScript): **R10** (annotation tags readable
after `waitForDataLoad`) and **R11** (Notifier events while adding/removing a tag). Both in
`docs/zotero-api-notes.md`.

## Data safety
- **Read from the library:** collections (in memory), the chosen collection's and its
  descendants' regular items, their attachments and annotations, and tags on all of these.
  Only getters that do not call `save()`, `saveTx()`, setters or `Zotero.DB`.
- **Observed:** Zotero change notifications (an observer only listens; it cannot change
  anything).
- **Written:** nothing. No library writes, no file writes, no prefs. Write guard: no new entry.
- **In-memory side effect (Zotero's own, not saved):** `waitForDataLoad` fills the item cache,
  as in F003.
- **Untrusted text:** tag, group, collection names and titles shown with `textContent` only.
- Development and testing use only the dev profile and `~/Zotero tabellify-dev`. The test
  tags in the smoke-test setup are added by the owner by hand in the dev library.

## Test plan
| AC | How |
|---|---|
| AC1–AC12 | Owner smoke test (manual), Debug Output in `build/debug-N.txt`; R10 and R11 before or during it |
| AC13 | `tests/unit/tag-monitor-model.test.mjs` (Node `vm` sandbox) |
| AC14 | `tests/static/workspace-script.test.mjs` (allow-list, symmetry, script order), existing `write-guard`, `no-html-sinks`, Fluent checks |

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T1 | Pure `TabellifyTagMonitor` (`descendantIds`, `summarize`, `sortPapers`) + unit tests (AC13) | developer | spec approved | `src/content/tag-monitor-model.js`, `tests/unit/tag-monitor-model.test.mjs` |
| T2 | Workspace: monitor section, per-paper table with toggle rows, subcollection gathering, annotation gathering, manual-tag filter via model, Refresh, re-render on codebook edits, Fluent strings, CSS; load `tag-monitor-model.js` after `codebook-model.js`; static checks (AC14) | developer | T1 | `src/content/workspace.xhtml`, `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/static/workspace-script.test.mjs` |
| T3 | Live updates: Notifier observer, 500 ms debounce, unregister on unload, self-check in `onNotify`, log lines (AC10); symmetry check in AC14 | developer | T2 | `src/content/workspace.js`, `tests/static/workspace-script.test.mjs` |
| T4 | `npm test`, `npm run build`; owner runs R10 + R11, then smoke test AC1–AC12. If R11/AC10 fail: remove T3's observer, ship Refresh only (Fallback) | developer → owner | T3 | — |

T2 and T3 touch the same files, so they run one after the other (no parallel worktrees).

## Open questions for the owner (all answered 2026-11-13, see "Final decisions")
Earlier questions 1–7 are answered (see "Owner decisions"). New ones, each with the
recommendation the spec assumes:

1. **Q-new-1 — Does the per-paper table replace the F003 item list?** *Recommended: yes.* The
   F003 list shows direct members only; with subcollections counting, two lists with different
   papers would confuse. The F003 "All tags" column stays.
2. **Q-new-2 — Default sort of papers?** *Recommended: fewest codebook tags first (papers
   needing work on top), then title.* Alternative: by title. A sort control can come later.
3. **Q-new-3 — "In" column for papers directly in the chosen collection:** *Recommended: show
   the chosen collection's name*, like any other collection (simple and unambiguous).
4. **Q-new-4 — Debounce delay:** *Recommended: 500 ms.* Shorter feels more live but may
   recompute several times during a sync burst.
5. **Q-new-5 — Highlights in the trash:** *Recommended: ignore them* (Zotero's default for
   `getAnnotations()`), as F003 ignores trashed items.
6. **Q-new-6 — Codebook tags that exist in Zotero only as automatic tags:** *Recommended: no
   special hint in F005* (they show as remaining, per decision 4). If this confuses in
   practice, a later feature could mark "present only as automatic tag".
