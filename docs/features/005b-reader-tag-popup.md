# Feature 005b: Tags used / remaining while reading a paper

- **Status:** Approved (owner, 2026-11-13: option A; all recommended answers to the open questions accepted)
- **Branch:** `feat/005b-reader-tags`
- **Related ADRs:** 0013 (Proposed: reader tag surface; **must be approved first**),
  0012 (codebook storage), 0009 (workspace tab), 0011 (security), 0003 (no bundler).
  PRD §3 step 3, §4 "Tag monitor: panel beside the reader", §7 Q2. Builds on F004 (codebook)
  and **F005** (tag monitor, pure per-paper summary; on another branch, must be merged first).
- **Process:** prototype mode (CLAUDE.md). Developer builds; `npm test` + `npm run build`
  pass; owner runs one smoke test (the `[manual]` ACs) with Debug Output captured to
  `build/debug-N.txt`.

## Owner decisions (2026-11-13, after the first smoke test)
These change the approved spec; the sections below are updated to match.
1. **Counting rule: highlight (annotation) tags only by default, with a switch for paper
   (item) tags.** A codebook tag counts as used on a paper only if it is a manual tag on one of
   the paper's non-trashed highlights. Tags on the paper item itself count only when the switch
   is on. Automatic tags never count. The switch is a checkbox in the Tabellify tab next to the
   tag monitor's "Refresh" button, "Also count tags on the paper itself", stored in the global
   Zotero pref `extensions.tabellify.countItemTags` (boolean, default false; a setting, not
   library data). Only the workspace checkbox writes it; this section only reads it. The rule
   lives in the shared pure model (`TabellifyTagMonitor.countedTagNames`), so the F005 tab and
   this section always agree. This section reads the pref on every render, so a change shows
   up on its **next render** (switching item or tab, or any tag change); there is no pref
   observer (it would need an unverified API) and the workspace cannot reach the section's
   refresh functions (different scope).
2. **The section shows a checklist** instead of only the remaining tags: every codebook tag,
   grouped by super-tag in codebook order, each with ✓ (used) or ☐ (not yet). The header keeps
   "k / M" (also when collapsed); the body starts with one line "k of M codebook tags used on
   this paper". The "Remaining:" heading and the special "All N codebook tags used" text are
   removed.

## Problem / objective
While reading a paper in Zotero's reader, the researcher wants to see, without leaving the
page and without a big window covering it, **how many codebook tags this paper already has**
("4 / 15") and **which ones are still missing**, grouped by super-tag. That tells them what to
look for while reading.

ADR-0013 recommends doing this as a compact, collapsible **"Tabellify tags" section in the
right-hand pane beside the reader** (documented `Zotero.ItemPaneManager` API). Collapsed, its
header still shows "4 / 15". This spec assumes that option. If the owner picks the floating
popup (ADR-0013 option B) instead, this spec must be redrafted.

## Scope
**In scope:**
- One item pane section, registered at startup and removed at shutdown, shown in reader tabs
  (and, per Q2, in the library item pane).
- Count for the paper shown in the pane: manual tags on all annotations of its file
  attachments, plus manual tags on the item itself only when the switch is on (owner decision
  1), compared with the one codebook (F004).
- Collapsed header summary "k / M"; body with "k of M used" and the checklist of every
  codebook tag grouped by super-tag (owner decision 2).
- Messages for: no codebook / empty codebook, codebook unreadable or newer.
- Refresh when tags change (Notifier observer) while the section is shown.

**Out of scope (non-goals):**
- Floating popup / toolbar button in the reader (ADR-0013 option B), separate window,
  context-menu entries.
- Adding a tag from the section (would write to the library; a later spec could allow it).
- Collection totals (Q4), several codebooks, editing the codebook here.
- Tags on child notes (PRD Q2 names item and annotation tags only).

## User stories
- As a researcher reading a PDF, I glance at the right-hand pane and see "4 / 15" for this
  paper, so I know how much of my codebook I have applied.
- As a researcher, I expand the section and see every codebook tag grouped by super-tag, the
  4 I have applied ticked and the 11 still missing unticked, so I know what to look for.
- As a researcher, I collapse the section (or the whole pane) when I just want to read.
- As a researcher, I add a tag to a highlight and the count goes up without reopening anything.

## UI sketch (text)
Right-hand pane of a reader tab, below Zotero's own sections; side-nav strip gets a Tabellify
icon that jumps to it.

Collapsed:
```
▸ [icon] Tabellify tags                                   4 / 15
```
Expanded (checklist, owner decision 2):
```
▾ [icon] Tabellify tags                                   4 / 15
  4 of 15 codebook tags used on this paper
  Exposure
    ✓ Heat index
    ☐ Temperature
    ☐ Humidity
  Health outcome
    ✓ Hospitalization
    ☐ Mortality
  …
```
Other states (body text; header summary in brackets):
- No codebook or codebook without tags: "No codebook yet. Create one in Tools → Tabellify…" [—]
- Codebook unreadable / made by a newer Tabellify: "Could not read the codebook." [—]
- Everything used: "15 of 15 codebook tags used on this paper" and every line ticked [15 / 15]
- Loading (while async reads run): "Counting…" [no summary]

Plain list elements, no buttons. All names via `textContent`. The marks ✓ / ☐ are Fluent
messages (`tabellify-reader-mark-used` / `-unused`, with a `.title` tooltip) on a `<span>`
before the name.

## Acceptance criteria
`[manual]` = owner smoke test in the dev profile (Zotero 10.0.9). `[auto]` = `npm test`.
Setup for the smoke test: the dev codebook has groups "Exposure" (`Heat index`,
`Temperature`) and "Health outcome" (`Hospitalization`); the dev library has a paper with a PDF
whose item carries `Heat index` and one of whose highlights carries `Hospitalization`. The
switch "Also count tags on the paper itself" in the Tabellify tab starts **off**.

- [ ] AC1 `[manual]` **Beside the reader, not over it.** Given Tabellify is installed and the
  PDF is opened in a reader tab with the right-hand pane shown, then a "Tabellify tags" section
  with the Tabellify icon is in that pane and in the side-nav strip; the page itself is not
  covered by anything Tabellify adds.
- [ ] AC2 `[manual]` **Count and checklist (highlights only).** With the switch off, the
  section header shows `1 / 3`; the body says "1 of 3 codebook tags used on this paper", then
  "Exposure" with `☐ Heat index` and `☐ Temperature`, then "Health outcome" with
  `✓ Hospitalization` (the item tag `Heat index` does not count).
- [ ] AC2b `[manual]` **Switch on.** In the Tabellify tab, tick "Also count tags on the paper
  itself"; the tab's tag monitor recounts at once. Back in the reader tab, after switching to
  another item and back (or any tag change), the section shows `2 / 3` with `✓ Heat index`.
  Untick it again: the next render shows `1 / 3`. The tick survives closing and reopening the
  Tabellify tab.
- [ ] AC3 `[manual]` **Compact.** Clicking the section header collapses it to one line that
  still shows `1 / 3`; clicking again expands it. After reopening the PDF the collapsed/open
  state is kept (Zotero remembers it).
- [ ] AC4 `[manual]` **Live update.** With the section visible and the switch off, the owner
  adds the tags `Heat index` and `Temperature` to a highlight in the reader's annotation popup;
  within a moment the section shows `3 / 3` and every line ticked. Removing `Temperature`
  brings back `2 / 3` with `☐ Temperature`. (This is the owner's own tag edit in the dev
  library; Tabellify writes nothing to the library.)
- [ ] AC5 `[manual]` **Automatic tags ignored.** A paper whose only codebook-named tag is an
  automatic tag (orange in the tag selector) shows `0 / 3`, with the switch off and on. *(Skip if no such paper exists in
  the dev library; say so in the result.)*
- [ ] AC6 `[manual]` **Lifecycle.** With the PDF tab open: disable Tabellify (Tools → Plugins)
  → the section and its side-nav icon disappear from the open reader tab without reopening it;
  re-enable → they come back in the same open tab. Debug Output shows "reader section
  registered" / "reader section unregistered" and "notifier observer added / removed" lines and
  no Tabellify errors.
- [ ] AC7 `[manual]` **No codebook.** With Zotero closed, the owner renames
  `~/Zotero tabellify-dev/tabellify/codebooks.json` to `codebooks.json.off`, starts Zotero and
  opens the PDF: the section shows the "No codebook yet" message. Renaming the file back
  restores the counts (after reopening the PDF or switching items).
- [ ] AC8 `[manual]` **Library and codebook unchanged.** After AC1–AC7, the tag selector shows
  no new tags and `codebooks.json` has the same `revision` as before the test (the section
  never saves; the only thing Tabellify writes is the switch's pref, from the Tabellify tab).
- [ ] AC9 `[auto]` **Per-paper checklist (pure).** Unit tests of
  `TabellifyTagMonitor.countedTagNames` and `paperChecklist`: codebook × `{ itemTags,
  annotationTags }` × `{ countItemTags }` → `{ used, total, allUsed, groups: [{ name, tags:
  [{ tag, used }] }] }`; **both counting modes** (default highlights only; switch adds item
  tags; only exactly `true` turns it on); automatic tags never count; exact, case-sensitive
  match after trim; every codebook tag listed in codebook order; groups without tags omitted;
  empty codebook → `total 0`; input not mutated. `summarize` tested in both modes too.
- [ ] AC10 `[auto]` **Tag collection with fakes.** Unit tests of `collectPaperTags(item)` with
  fake items: item tags and annotation tags of file attachments returned **separately**;
  automatic (`type: 1`) never counted; linked-URL attachments skipped (no `getAnnotations`
  call); standalone file attachment: its own tags are item tags, its annotations' tags are
  annotation tags; notes → "not applicable" (section disabled). Rendering: the checklist lines
  (✓ / ☐) in both modes, the pref read on every render (`Zotero.Prefs.get(name, true)`), an
  unreadable pref → highlights only, never `Prefs.set`.
- [ ] AC11 `[auto]` **Registration symmetry with fakes.** With a fake `Zotero.ItemPaneManager`
  and `Zotero.Notifier` (`tests/helpers/zotero-mock.mjs`): `init` registers one section (with
  `paneID`, `pluginID`, header/sidenav `l10nID` + `icon`, `onRender`) and one observer for
  `["item", "item-tag"]`; `shutdown` calls `unregisterSection` with the **returned** id and
  `unregisterObserver` with the returned observer id, and clears the refresh Set; a second
  `init`/`shutdown` cycle works; `shutdown` still runs both unregisters if one throws.
- [ ] AC12 `[auto]` **Static guards.** `symmetry.test.mjs` passes (generic
  `Zotero.X.registerY` ↔ `unregisterY`) and is non-vacuous for `registerSection` and
  `registerObserver`; `write-guard.test.mjs` passes with **no new allow-list entry** (the new
  file never writes; `saveData` is not referenced outside the workspace; `Zotero.Prefs.set` is
  not matched by the library-write denylist, and a pref is not library data); `no-html-sinks`
  passes for the new file; every Fluent id used exists in `tabellify.ftl`; an allow-list test
  for `src/reader-tags.js` permits only the Zotero APIs listed in "Zotero APIs used"
  (including `Zotero.Prefs.get`, read only; `set`/`clear` banned). Workspace static checks:
  the checkbox, its Fluent ID `tabellify-monitor-count-item-tags`, its change listener removed
  on unload, the pref name `extensions.tabellify.countItemTags` (model constant
  `COUNT_ITEM_TAGS_PREF`), and no other file sets a pref.

## Design

### Where things go
- **Pure summary:** reuse F005's per-paper summary in `src/content/tag-monitor-model.js` if it
  has one with the shape "codebook data + list of tag names → used / total / remaining by
  group". If not, T1 adds exactly that function to the same file (pure, no Zotero/DOM) with
  tests. No dependency on the exact name until F005 is merged.
- **New file `src/reader-tags.js`** (bootstrap scope, like `tabellify.js`; not in `content/`
  because it is never loaded by a document). Defines one global `TabellifyReaderTags`:
  - `register({ pluginID, log })` → registers the section and the Notifier observer, keeps
    both ids; `unregister()` → reverse order, each step in its own `try/catch`, clears the
    `Set` of refresh functions.
  - `collectPaperTags(item)` → `{ applicable: boolean, tags: string[] }` (manual tags of item +
    annotations, de-duplicated). Takes the item as a parameter, so tests pass fakes.
  - Section hooks:
    - `onInit({ refresh })`: add `refresh` to the Set. `onDestroy`: remove it.
    - `onItemChange({ item, setEnabled })`: `setEnabled(applicable)` (notes, annotations,
      linked-URL attachments → hidden).
    - `onRender({ body, doc })`: show "Counting…".
    - `onAsyncRender({ body, doc, item, setSectionSummary })`:
      `await Zotero.Libraries.get(item.libraryID).waitForDataLoad("item")`, collect tags,
      `TabellifyCodebookStore.load(TabellifyCodebookStore.platformFs(),
      TabellifyCodebookStore.dataDir())` (**read only**), summary function, then fill `body`
      with `doc.createElementNS("http://www.w3.org/1999/xhtml", …)` + `textContent`, and
      `setSectionSummary(...)` with the formatted "k / M".
  - Strings: `data-l10n-id` / `data-l10n-args` on the created elements (the main window has
    `tabellify.ftl` linked since F001); the summary string through
    `doc.l10n.formatValue("tabellify-reader-summary", { used, total })`.
- **`src/tabellify.js`:** in `init()`, after the menu: `loadSubScript` the three scripts
  (`content/codebook-model.js`, `content/codebook-store.js`, `content/tag-monitor-model.js`)
  and `reader-tags.js` with `this.rootURI`, then `TabellifyReaderTags.register(...)`. In
  `shutdown()`, before the menu is unregistered: `TabellifyReaderTags?.unregister()`, then set
  the four globals to `undefined`. Log lines: "reader section registered (<id>)", "reader
  section unregistered: <bool>", "notifier observer added/removed".
- **`src/bootstrap.js`:** no code change expected (`Tabellify.shutdown()` already runs before
  `chromeHandle.destruct()`, so the icon URLs are valid until the section is gone). Only the
  header comment may mention the new file.
- **Icons:** `src/content/icons/reader-tags-16.svg`, `reader-tags-20.svg` (hand-written SVG,
  `fill="context-fill"` not assumed; plain single colour). URL
  `chrome://tabellify/content/icons/…` (UNVERIFIED in this spot; fallback
  `rootURI + "content/icons/…"`).
- **Fluent** (`src/locale/en-US/tabellify.ftl`): `tabellify-reader-section-header` (`.label`),
  `tabellify-reader-section-sidenav` (`.tooltiptext`), `tabellify-reader-summary` (value with
  `$used`, `$total`), `tabellify-reader-used` (sentence), `tabellify-reader-mark-used` /
  `tabellify-reader-mark-unused` (✓ / ☐ with `.title`), `tabellify-reader-no-codebook`,
  `tabellify-reader-codebook-error`, `tabellify-reader-counting`; workspace:
  `tabellify-monitor-count-item-tags` (owner decisions 2026-11-13; `tabellify-reader-remaining`
  and `tabellify-reader-all-used` removed).
- **CSS:** none in v1 (Zotero's section styling; lists and headings only). Revisit after the
  smoke test if it looks cramped.

### Data flow
Reader tab shows paper → Zotero renders our section → `onAsyncRender` reads item, attachments,
annotations, tags (memory), reads `codebooks.json` (disk, read-only) → pure summary → DOM.
Tag added/removed anywhere → Notifier → observer → `refresh()` of each live section → Zotero
re-renders the ones in the selected tab.

### Lifecycle (rule 9)
| Added | Where | Removed | Where |
|---|---|---|---|
| Item pane section | `Tabellify.init` | `unregisterSection(id)` (+ Zotero auto-cleanup) | `Tabellify.shutdown` |
| Notifier observer | `Tabellify.init` | `unregisterObserver(id)` | `Tabellify.shutdown` |
| Refresh functions in a `Set` | section `onInit` | `onDestroy`, and `Set.clear()` | section / `shutdown` |
| Globals from `loadSubScript` | `Tabellify.init` | set to `undefined` | `Tabellify.shutdown` |
Nothing per window; no timers; no DOM outside the section's own `body`.

## Zotero APIs used
All listed with sources in **ADR-0013, "Appendix: API notes to merge"** (to be merged into
`docs/zotero-api-notes.md` after F005 lands). Checked at Zotero 10.0.9.

| API | Status |
|---|---|
| `Zotero.ItemPaneManager.registerSection` / `unregisterSection`, hook props (`body`, `doc`, `item`, `tabType`, `setEnabled`, `setSectionSummary`, `refresh`) | Verified (docs + source) |
| Section shown in reader context pane for the parent item; collapse state; `onDestroy` on removal | Verified (source); runtime by AC1, AC3, AC6 |
| Section icon from a `chrome://tabellify/…` URL | UNVERIFIED (runtime: AC1) |
| `item.getAttachments()`, `attachment.getAnnotations()`, `isFileAttachment`, `isAttachment`, `isNote`, `isAnnotation`, `parentItem`, `Zotero.Items.get(ids)` | Verified (source; `getAttachments` also docs) |
| `Zotero.Notifier.registerObserver` / `unregisterObserver` | Verified (source); `item-tag` id format UNVERIFIED (RT-R3, not relied on) |
| `Services.scriptloader.loadSubScript(rootURI + …)` into the bootstrap scope | Verified (existing use) |
| `Zotero.Prefs.get(name, true)` (read the switch; missing pref → `undefined`, read as off); `Zotero.Prefs.set(name, value, true)` in the workspace only | Verified (source), api-notes Prefs row |
| Already verified: `item.getTags()`, `Zotero.Libraries.get`, `library.waitForDataLoad("item")`, `IOUtils.readJSON`, `PathUtils.join`, `Zotero.DataDirectory.dir` (internal), `insertFTLIfNeeded`, `document.l10n.formatValue`, `Zotero.debug`, `Zotero.logError` | see api-notes |

## Data safety
- **Read from the library:** the shown item, its attachments, their annotations, and the tags
  of all of these (in-memory reads after `waitForDataLoad`, which only fills Zotero's cache).
- **Read from Tabellify data:** `codebooks.json` via `TabellifyCodebookStore.load` only, and
  the pref `extensions.tabellify.countItemTags`.
- **Written by the section:** **nothing.** No items, tags, annotations, prefs or files. The
  section never calls `saveData` or `Zotero.Prefs.set`; no new write-guard allow-list entry.
- **Written by the workspace (owner decision 1):** only the boolean pref
  `extensions.tabellify.countItemTags` when the owner ticks or unticks the checkbox. A pref is
  a Tabellify setting, not library data.
- **Written by Zotero on the user's behalf:** the pref `panes.<namespaced id>.open` when the
  user collapses/expands the section (Zotero's normal behaviour for every section).
- **Untrusted input:** tag names and codebook names are shown with `textContent` / Fluent args
  only (the section lives in the privileged main window).
- Development uses only the dev profile and `~/Zotero tabellify-dev`.

## Test plan
| AC | How |
|---|---|
| AC1–AC8 | Owner smoke test (manual), Debug Output in `build/debug-N.txt`; RT-R1/RT-R2 from ADR-0013 optional beforehand |
| AC9 | `tests/unit/tag-monitor-model.test.mjs` (F005's file) |
| AC10, AC11 | `tests/unit/reader-tags.test.mjs` (Node `vm` sandbox with fakes), `tests/behavior/lifecycle.test.mjs` |
| AC12 | `tests/static/symmetry.test.mjs`, `write-guard.test.mjs`, `no-html-sinks.test.mjs`, `l10n-and-window.test.mjs`, new allow-list check |

## Task breakdown
Starts only after **ADR-0013 is accepted** and **F005 is merged** to `main` (worktrees branch
from `main`).

| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T1 | Per-paper summary: reuse F005's or add one pure function + tests (AC9) | developer | F005 merged, ADR-0013 accepted | `src/content/tag-monitor-model.js`, `tests/unit/tag-monitor-model.test.mjs` |
| T2 | `reader-tags.js`: `collectPaperTags`, section hooks, register/unregister, observer; unit tests with fakes (AC10, AC11 unit part); extend the Zotero mock with `ItemPaneManager` and `Notifier` fakes | developer | T1 | `src/reader-tags.js`, `tests/unit/reader-tags.test.mjs`, `tests/helpers/zotero-mock.mjs` |
| T3 | Wire into the plugin: `loadSubScript` + register in `init`, unregister + clear globals in `shutdown`; icons; Fluent strings; lifecycle behaviour test; static guards (non-vacuous checks, allow-list for `reader-tags.js`) (AC11, AC12) | developer | T2 | `src/tabellify.js`, `src/content/icons/reader-tags-16.svg`, `src/content/icons/reader-tags-20.svg`, `src/locale/en-US/tabellify.ftl`, `tests/behavior/lifecycle.test.mjs`, `tests/static/symmetry.test.mjs`, `tests/static/workspace-script.test.mjs` (or a new `tests/static/reader-tags-script.test.mjs`), `tests/static/l10n-and-window.test.mjs` |
| T4 | Merge ADR-0013's appendix into `docs/zotero-api-notes.md`; update `docs/architecture.md` §4 surface row | developer (docs) | ADR-0013 accepted, F005 merged | `docs/zotero-api-notes.md`, `docs/architecture.md` |
| T5 | `npm test`, `npm run build`, then owner smoke test AC1–AC8 (prototype mode) | developer → owner | T3, T4 | — |

`src/bootstrap.js`: no change planned (comment only, if any).

## Open questions
Each has a recommended answer; the spec above assumes it.

1. **Panel beside the page (ADR-0013 A) or floating popup (B)?** *Recommended: A.* Documented
   API, never covers the text, clean on/off. B can be added later as an extra opener.
2. **Show it only in reader tabs, or also in the library item pane?** *Recommended: both.*
   Same code; handy when browsing. Reader-only = `setEnabled(tabType === "reader")`.
3. **Live update while visible?** *Recommended: yes*, via one Notifier observer on `item` and
   `item-tag` that refreshes visible Tabellify sections (no parsing of event ids, which are
   unverified for `item-tag`). Codebook edits in the workspace show up on the next render
   (switching item/tab), not instantly. Instant codebook updates would need a cross-document
   signal; defer.
4. **Collection totals** ("collection: 9/15")? *Recommended: out of scope.* A paper can be in
   several collections and the reader doesn't know which one the user came from; F005's
   workspace monitor covers collections.
5. **What if there is no codebook?** *Recommended:* show "No codebook yet. Create one in Tools
   → Tabellify…" and summary "—" (AC7). Unreadable/newer codebook: "Could not read the
   codebook." Never offer to fix or overwrite it from here.
6. **Non-PDF items, notes, standalone attachments?** *Recommended:* EPUB and web snapshots
   count like PDFs (all are file attachments with annotations); standalone file attachments
   count their own tags and annotations; notes, annotations and linked-URL attachments: section
   hidden.
7. **Tags on child notes count?** *Recommended: no*, PRD Q2 names item and annotation tags;
   follow F005 if it decides otherwise.
8. **Separate reader windows** (reader opened in its own window): whether they have this pane
   at all is **UNVERIFIED**. If they do, `tabellify.ftl` is not linked there and labels would be
   missing. *Recommended:* the owner opens one PDF in a separate window during the smoke test
   and reports what they see; fix in a follow-up if needed.
9. **Clickable tags** (e.g. click a remaining tag to add it to the selected annotation)?
   *Recommended: later*; it is a library write and needs its own spec.
