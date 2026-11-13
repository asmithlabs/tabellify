# Feature 006b: Tag script autocomplete and codebook-only "Create tag"

- **Status:** Approved (owner, 2026-11-13, all recommendations Q1–Q9)
- **Branch:** `feat/006b-script-autocomplete` (start after 006a is merged; it is: `5e21535`)
- **Related ADRs:** 0016 (codebook schema 2, Accepted), 0015 (design system, Accepted),
  0012 (data storage), 0011 (security), 0009 (workspace tab), 0003 (no bundler).
  Outline: `docs/features/006a-workspace-restructure.md`, "Later phases → 006b".
  PRD §3, §6 (library safety).
- **Process:** prototype mode (CLAUDE.md). Developer builds; `npm test` + `npm run build`
  pass; owner runs one smoke test (the `[manual]` ACs) with Debug Output in `build/debug-N.txt`.
- **ADR needed?** **No.** No new storage, no new file, no new UI surface (the list is inside
  the existing workspace document), no dependency, and no new `Zotero.*` call (the library
  tag list comes from the `Zotero.Tags.getAll` call 006a already makes).

## Problem / objective
006a replaced the F004 "Pick from library" list with the one-line tag script box, so today
every tag name must be typed exactly, by memory. A typo silently creates a codebook tag that
no highlight will ever match (its column stays empty). 006b adds **suggestions while typing**,
taken from the tags that already exist in the Zotero library (item tags and highlight tags),
plus the codebook's group names, and an explicit **`Create tag "xyz"`** choice for names that
are not in the library yet. "Create" adds the name to Tabellify's codebook only, never to
Zotero. Nothing is written to the library.

## Scope
**In scope:**
1. Pure suggestion logic (no Zotero, no DOM): the token at the cursor, filtering and ranking,
   the "Create" rule, and the text edit that accepting a suggestion makes.
2. A suggestion list under the script box, built as a WAI-ARIA combobox + listbox inside
   `workspace.xhtml`.
3. Keyboard: ↓/↑ move, Tab or Enter accept, Esc closes, Enter with the list closed commits
   the entry (006a behaviour). Mouse click on an option accepts it.
4. Group-name suggestions at the top level (accepting inserts `Name(`).
5. Keeping the library tag list fresh: reload on Refresh, and after Zotero reports a tag
   change (existing Notifier observer), the next time the script box is focused.
6. Fluent strings, CSS with design tokens, tests, a states-gallery sample.

**Out of scope (non-goals):**
- Writing anything to Zotero (tags, items, annotations). "Create tag" is codebook-only.
- Group libraries (the collection dropdown lists My Library only, F003/F004 Q7).
- Highlighting the matched letters inside an option; fuzzy (typo-tolerant) matching.
- Suggestions while editing a group name in place (cursor directly before `(`), or after
  a `)` before the next comma.
- Any change to the parser's syntax, `applyScript`, the codebook file or `layout.json`.
- Showing paper counts per suggestion.

## User stories
- As a researcher, I type `mor` and see `Mortality` (a tag I used on a highlight), and Tab
  puts the exact spelling into the box.
- As a researcher, I type `Out`, pick the group `Outcome`, and the box reads `Outcome(` so I
  can go on typing its tags.
- As a researcher, when I type a name that no Zotero tag has, I see `Create tag "xyz"`
  (codebook only), so I know it is new and not a typo of an existing tag.
- As a researcher, I am never shown tags that are already in my codebook.
- As a researcher, I trust that none of this changes my Zotero library.

## Design

### Background for a JavaScript learner
- **Token at the cursor:** the name the user is typing right now, i.e. the text between the
  last separator (`,` or `(`) before the cursor and the next separator after it. Only that
  part is replaced when a suggestion is accepted; the rest of the line stays as typed.
- **Combobox / listbox (WAI-ARIA):** a standard recipe for "text box + list of choices" that
  screen readers understand. Focus **stays in the text box**; the box's
  `aria-activedescendant` attribute names the option that is highlighted. No new widget
  library is needed; it is plain HTML elements plus attributes.
- **Folding:** to compare "Heat" with "heat" and "é" with "e", both are turned into a simple
  lower-case form without accents ("fold"). Folding is only for **finding** matches; the name
  inserted into the box is always the library's exact spelling.
- **Stale flag:** instead of re-reading the tag list on every library change, the workspace
  only notes "the list may be old" and re-reads it the next time it is needed.

### Which tags are suggested
| Question | Decision (recommended; open questions Q3–Q6) | Why |
|---|---|---|
| Library | **My Library** (`Zotero.Libraries.userLibraryID`), as 006a's `loadLibraryTags` already does. This is also the selected collection's library, because the dropdown lists only My Library collections. | No new API; if group libraries are added later, switch to the chosen collection's `libraryID`. |
| Item tags and highlight (annotation) tags | **Both.** `Zotero.Tags.getAll` reads every row of `itemTags` for items in the library, and highlights are items. | Verified (source) 10.0.9; **runtime RT-S1** (owner check below). |
| Automatic tags (type 1) | **Excluded**, unless the same name is also used as a manual tag somewhere. | Tabellify counts only manual tags (`TabellifyTagMonitor`, `(t.type ?? 0) === 0`). An automatic-only name would become a column that never gets a ✓. |
| Tags used only on trashed items | **Included** (no filter). | `getAll` has no trash filter; filtering would need a heavier, internal query. Consequence: such a tag's column stays empty until the item is restored. |
| Tags already in the codebook | **Excluded** (exact, case-sensitive name match, the codebook's identity rule). | Owner's request. `Heat index` in the codebook does not hide a library tag `heat index` (different Zotero tag, 006a AC6). |
| Names containing `"` | **Excluded** from suggestions (counted in Debug Output). | The script syntax cannot express them (006a Q6). |

The automatic-tag filter is done in pure code on the `{ tag, type }` objects `getAll` already
returns (testable in Node). Alternative, also verified: `Zotero.Tags.getAll(libID, [0])`
(SQL `AND type IN (?)`); not chosen so the Zotero call stays exactly as in 006a.

### Case and Unicode rules
- Library names arrive already cleaned by Zotero (`trim().normalize()`, NFC).
- The typed token is cleaned the same way (`TabellifyTagScript.clean`).
- **Matching** uses the fold `name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()`:
  case- and accent-insensitive. ("heat" finds "Heat index"; "etude" finds "Étude".)
- **Identity** (is this exactly a library tag? is it in the codebook?) stays exact and
  case-sensitive, as in Zotero and the codebook.
- Group names compare ignoring case (the codebook rule, ADR-0016 §2).

### Pure module 1: `TabellifyTagScript.tokenAt(text, cursor)` (in `src/content/tag-script-model.js`)
Returns the token being typed, or `null` when no list should open.
```
{ start, end, prefix, quoted, inGroup, groupName }
```
- `start`: index of the token's first non-space character (its opening `"` if quoted).
- `end`: end of the whole token, also past the cursor (up to the next `,` `(` `)` or end of
  text, trailing spaces trimmed; for a quoted token, after the closing `"` if there is one).
  Accepting replaces `[start, end)`.
- `prefix`: cleaned text from the token start (after a `"`) to the cursor.
- `inGroup` / `groupName`: true and the cleaned group name when the cursor is inside
  `Name( … )`.
- Separators inside quotes are ignored.
- `null` when: the cursor is right after a `)` with no comma since; the token is followed by
  `(` (a group name being edited); there is a second `(` before the cursor (nested, an error
  anyway); `cursor` is outside `0…text.length`.
- One left-to-right scan up to the cursor, then a scan to the token end: linear time.

### Pure module 2: `TabellifyScriptSuggest` (new `src/content/script-suggest-model.js`)
No Zotero, DOM, IOUtils or PathUtils globals. Loaded after `tag-script-model.js`.

- `prepare(tags)` → `LibraryIndex`: takes the raw `getAll` result `Array<{tag, type?}>`,
  keeps names that have at least one manual entry (`(type ?? 0) === 0`), drops blank names and
  names containing `"`, de-duplicates, sorts once with
  `new Intl.Collator(undefined, { sensitivity: "base", numeric: true }).compare` (same order as
  `availableTags`, but fast enough for tens of thousands of names), and stores
  `{ name, fold }` per entry plus a `Set` of exact names. Returns also
  `skippedQuote` (count) for Debug Output.
- `suggest(index, token, context, limit = 50)` → `Option[]`, where
  `context = { codebookTags: Set<string>, groupNames: string[] }` and
  `Option = { kind: "group" | "tag" | "create", name }`:
  1. `prefix` empty → `[]` (except Q7: ↓ on an empty token lists the first 50 tags).
  2. **Group options** (top level only, `!token.inGroup`): codebook group names whose fold
     starts with the folded prefix, codebook order. At most 5.
  3. **Tag options**: one pass over the index, skipping codebook tags; names whose fold
     **starts with** the folded prefix first, then names that **contain** it; alphabetical
     inside each tier; stop when `limit` is reached.
  4. **Create option**, last: when the cleaned token is non-empty, is **not** exactly a
     library name, and is **not** exactly a codebook tag (Q2).
- `accept(text, token, option)` → `{ text, cursor }`:
  - `tag`: replaces `[start, end)` with the name; if the name contains `,` `(` or `)`, it is
    written as `"name"`. Cursor after it. Nothing else is added (Q9).
  - `group`: replaces the token with `Name(`; cursor after `(` (the list then reopens for
    that group's tags).
  - `create`: replaces the token with the cleaned token (quoted if needed); closes the list.
    The name becomes a codebook tag only when the entry is committed with Enter.
  - The new text always parses the same way as typing it by hand (tested by round-trip
    through `TabellifyTagScript.parse`).

### The list in the workspace (`workspace.xhtml`, `workspace.js`, `workspace.css`)
Markup (inside `#tabellify-script-box`, which becomes `position: relative`):
- `#tabellify-script-input` gains `role="combobox"`, `aria-autocomplete="list"`,
  `aria-expanded="false"`, `aria-controls="tabellify-script-suggestions"`,
  `autocomplete="off"` (no browser form-history dropdown). Existing `aria-describedby` stays.
- `<html:ul id="tabellify-script-suggestions" role="listbox" hidden="hidden">` with an
  `aria-label` "Suggestions" (Fluent, set from JS like the pills label).
- Each option: `<html:li role="option" id="tabellify-script-option-<index>"
  aria-selected="true|false">`. IDs use the **index**, never the name. Text via
  `textContent` only:
  - tag: the name;
  - group: the name + a muted span "group" (Fluent);
  - create: "Create tag" (Fluent) + ` "xyz"` (plain text) + a muted span "codebook only"
    (Fluent).

Behaviour (`workspace.js`, using the existing delegated listeners on `#tabellify-codebook`):
- **On `input`** in the script box (existing handler, which already hides the error):
  `tokenAt(value, selectionStart)` (only when `selectionStart === selectionEnd`), then
  `suggest(...)`; render up to 50 options, or close the list if there are none.
- **Highlight:** no option is highlighted when the list opens (Q1). ↓ highlights the first /
  next, ↑ the previous (↑ on the first removes the highlight). The highlighted option gets
  `aria-selected="true"`, the input's `aria-activedescendant` points at it, and it is
  scrolled into view with `scrollIntoView({ block: "nearest" })`.
- **Tab** with the list open: accepts the highlighted option, or the first one if none is
  highlighted; `preventDefault` only then. Shift+Tab is never intercepted.
- **Enter** with an option highlighted: accepts it. Enter with the list open and nothing
  highlighted, or with the list closed: closes the list and commits the entry
  (`commitScript`, unchanged from 006a).
- **Esc** with the list open: closes it (`preventDefault` + `stopPropagation`, so Zotero
  does not also react). With the list closed, Esc is not handled.
- Keys are ignored while `event.isComposing` (input methods for e.g. Japanese).
- **Mouse:** `mousedown` on an option: `preventDefault` (keeps focus in the box), accept.
- **Close** on `focusout` of the input, after accepting `tag`/`create`, after a commit, and
  whenever the input is disabled (codebook not loaded, saving).
- Accepting sets the new value with `input.setRangeText(...)` / `setSelectionRange`, then
  re-runs the `input` logic (a `group` accept reopens the list).
- Debug Output: counts only (`suggestions: 12 options`), never typed text or tag names.

Styling (`workspace.css`, ADR-0015 tokens only): list = `surface` background,
`border-strong` 1px border, `radius-md`, no shadow (flat rule), `max-height` ≈ 10 rows with
scrolling, full input width; highlighted option = `selected-bg` / `selected-text` with a
`selected-bar` inset line (same as the focused table row); muted spans in `text-muted`; the
create option is separated by a top `border` line. Light and dark come from the tokens.

### Keeping the tag list fresh
- `libraryTagNames` (006a) is replaced by `libraryIndex` (the `prepare` result) and two
  fields: `libraryTagsStale` (boolean) and `libraryTagsLoading` (the running promise, so two
  loads never overlap).
- **Loaded:** when the workspace opens (as today), and when **Refresh** is clicked (also when
  no collection is chosen; added before Refresh's existing early return).
- **Marked stale:** in the existing `onNotify` observer, when `type === "item-tag"` (tags
  added to / removed from items or highlights, renamed, deleted from the library), **before**
  its "no collection chosen" early return. No new observer, no new timer.
- **Reloaded when stale:** on `focusin` of the script box. When the reload finishes and the
  box is still focused, suggestions are recomputed.
- **Cost:** one `SELECT DISTINCT` per load (milliseconds even for large libraries), one sort
  per load, and per keystroke one linear pass with `startsWith`/`includes` over pre-folded
  strings (well under 10 ms for 50 000 names in Node). Only ≤ 50 elements are rendered. No
  input debounce needed.
- Codebook changes need no reload: `suggest` reads the current codebook tags on each call.

### Fluent IDs (no arguments; names appended as plain text, as in 006a)
Proposed text, owner may change:
- New: `tabellify-script-suggestions-label` = Suggestions; `tabellify-script-create` =
  Create tag; `tabellify-script-create-hint` = codebook only; `tabellify-script-group-hint` =
  group.
- Changed: `tabellify-script-help` = Type a tag, several tags separated by commas, or
  Group(tag, tag), then press Enter. Suggestions come from your Zotero tags: ↓ to choose, Tab
  to accept. Your Zotero tags are never changed.

### Files
| File | Change |
|---|---|
| `src/content/tag-script-model.js` | Add `tokenAt` (pure) |
| `src/content/script-suggest-model.js` | **New.** `TabellifyScriptSuggest.prepare`, `suggest`, `accept`, `fold` (pure) |
| `src/content/workspace.xhtml` | Combobox attributes on the input; the listbox; script order adds `script-suggest-model.js` after `tag-script-model.js` |
| `src/content/workspace.js` | Index load/stale/reload; list render; keyboard and mouse; new delegated `focusin`, `focusout`, `mousedown` listeners on `#tabellify-codebook`, removed in `onUnload` |
| `src/content/workspace.css` | List and option styles (tokens only) |
| `src/locale/en-US/tabellify.ftl` | New and changed IDs above |
| tests | See Test plan |
| `docs/design-system-states.html`, `docs/design-system.md` | One suggestion-list sample (normal, highlighted, group, create); one §5a bullet |

### Lifecycle
New listeners only in the workspace document, all on `#tabellify-codebook` (event
delegation) and removed in `onUnload`. No new observer (the existing one gains one `if`), no
timer, no pref, no file. Nothing in `bootstrap.js`, `tabellify.js` or `reader-tags.js`.

## Zotero / Mozilla APIs used
**No new `Zotero.*` call.** Details and links in `docs/zotero-api-notes.md` ("Feature 006b
rows" and the 006a rows).

| API / mechanism | Status |
|---|---|
| `Zotero.Tags.getAll(Zotero.Libraries.userLibraryID)` (already called by 006a) | Verified (source) 10.0.9; **includes highlight tags: runtime RT-S1 (owner, not yet run)** |
| `Zotero.Tags.getAll(libraryID, types)` `types` filter | Verified (source) 10.0.9; **not used** (alternative) |
| `Zotero.Notifier` observer and `item-tag` events (existing F005 observer) | Verified (source) 10.0.9; runtime R11 |
| `setRangeText`, `setSelectionRange`, `selectionStart/End`, WAI-ARIA combobox/listbox | Verified (docs), existing 006a row |
| `aria-autocomplete`, `autocomplete="off"`, `Element.scrollIntoView({ block: "nearest" })`, `KeyboardEvent.isComposing`, `mousedown` + `preventDefault` keeps focus | Verified (docs), new row |
| `Intl.Collator`, `String.prototype.normalize("NFD")`, regex `\p{M}` with the `u` flag | Verified (docs), new row (standard ECMAScript; also in Node) |
| Screen-reader announcement of the combobox inside our chrome XUL document | **UNVERIFIED (runtime)**; optional VoiceOver check, not part of the smoke test |

### Owner check RT-S1 (run before the smoke test; read-only)
Already written in `docs/zotero-api-notes.md` ("F006a–008 runtime checks", RT-S1). Needs at
least one highlight with a manual tag in the dev library. Pass = `missingFromGetAll` is `[]`.
If it fails, 006b stops and comes back to the architect (highlight tags would need another
source).

## Data safety
- **Read from the library:** the tag names of My Library (`Zotero.Tags.getAll`, a read-only
  `SELECT`), exactly as 006a. Codebook group names and tags from `codebooks.json`.
- **Written to the library:** **nothing.** No item, tag, annotation, collection or database
  change. "Create tag" only puts text in the script box; on Enter the name goes into
  `codebooks.json` through the existing `applyCodebookEdit` path (revision check, atomic
  write, `.bak`). The tag appears in Zotero only if the owner later tags something with that
  name in Zotero's own UI.
- **Write guard:** no new allow-list entry. New identifiers avoid the guarded names
  (`addTag`, `removeTag`, `Zotero.Tags.<write>`); option kind `"create"` and function
  `accept` are not matched.
- **Written to disk:** nothing new.
- **Untrusted text:** library tag names and typed text are shown with `textContent` only
  (`no-html-sinks`); they never go into element IDs or CSS selectors; Debug Output logs
  counts, not names.
- Development and testing use only the dev profile.

## Acceptance criteria
`[manual]` = owner smoke test in the dev profile (Zotero 10.0.9), F005/006a test setup
(codebook `Exposure(Heat index, Temperature), Outcome(Hospitalization, Mortality)`,
collection "F005 test"). The ACs use `Mortality` as a library tag that is a highlight tag in
the dev library; **if RT-S1 lists different highlight tags, the orchestrator substitutes one
of them at smoke-test time.** `[auto]` = `npm test`.

- [ ] AC1 `[manual]` **Suggestions from highlight tags, codebook excluded.** In "Edit groups
  and tags", remove `Mortality` with ×. In the script box type `Outcome(mor`: a list opens
  under the box showing `Mortality`. Type instead `Outcome(hosp`: `Hospitalization` is **not**
  listed (it is in the codebook); only `Create tag "hosp"` (codebook only) may appear.
- [ ] AC2 `[manual]` **Keyboard.** With `Outcome(mor` and the list open: ↓ highlights the
  first option, ↑ removes the highlight; Tab puts `Outcome(Mortality` into the box and closes
  the list; typing `)` and pressing Enter commits: pill "Outcome · 2", "Codebook saved.".
  Esc closes an open list without changing the text. Enter with the list open and nothing
  highlighted commits the entry.
- [ ] AC3 `[manual]` **Group names.** In an empty box type `Exp`: the list shows `Exposure`
  marked "group" first. Accepting it makes the box read `Exposure(` and the list reopens for
  tags as soon as a letter is typed.
- [ ] AC4 `[manual]` **Create tag.** Type `zz tabellify test`: the only option is
  `Create tag "zz tabellify test"` with "codebook only". Accept it and press Enter: pill
  "Ungrouped · 1", a column `zz tabellify test`. Typing `Mort` shows `Mortality` (if not in
  the codebook) **and** `Create tag "Mort"` last. Afterwards remove `zz tabellify test` with ×.
- [ ] AC5 `[manual]` **Mouse and focus.** Clicking an option accepts it and the cursor stays
  in the box; clicking elsewhere on the page closes the list. The list is readable in Light
  and in Dark (Zotero Settings → General → Color Scheme).
- [ ] AC6 `[manual]` **Fresh list.** In the dev Zotero library, the owner adds the tag
  `zz-tabellify-fresh` to any item by hand, returns to the Tabellify tab, clicks into the
  script box and types `zz-tab`: `zz-tabellify-fresh` is listed without reopening the tab.
  (Afterwards the owner deletes that tag in Zotero's tag selector.)
- [ ] AC7 `[manual]` **Library unchanged.** The dev Zotero tag selector does not show
  `zz tabellify test`. Debug Output has no Tabellify errors and no typed text. Closing the tab
  with the list open, and disabling Tabellify with the tab open, produce no errors.
- [ ] AC8 `[auto]` **`tokenAt`** (`tests/unit/tag-script-model.test.mjs`): top level; inside a
  group (with `groupName`); right after `(` and after `,` (empty prefix); leading spaces
  skipped; cursor in the middle of a name (`end` = end of the name); quoted token, with and
  without its closing quote; separators inside quotes ignored; `null` after `)`, before `(`,
  in a nested group, and for an out-of-range cursor; NFC-cleaned prefix; 10 000-character line.
- [ ] AC9 `[auto]` **`prepare` and `suggest`** (`tests/unit/script-suggest-model.test.mjs`,
  new): automatic-only names dropped, a name both manual and automatic kept; duplicates and
  blanks dropped; names with `"` dropped and counted; case- and accent-insensitive match;
  starts-with before contains, alphabetical within each; codebook tags excluded exactly
  (`heat index` still suggested when the codebook has `Heat index`); limit 50; group options
  only at the top level, first, matched ignoring case; Create present when the token is not
  exactly a library name or codebook tag, absent otherwise, always last; empty prefix gives
  `[]`; names like `<b>x</b>` returned as plain strings; 50 000 names: `suggest` returns ≤ 50
  options (and runs in under 250 ms in Node).
- [ ] AC10 `[auto]` **`accept`**: replaces only `[start, end)` and keeps the rest; quotes
  names with `,` `(` `)`; group inserts `Name(`; create inserts the cleaned token; correct
  cursor; the result parses with `TabellifyTagScript.parse` to the expected items.
- [ ] AC11 `[auto]` **Workspace list** (`tests/unit/workspace-table.test.mjs`, fake DOM):
  the input has `role="combobox"`, `aria-autocomplete="list"`, `aria-controls`; typing opens
  the list and sets `aria-expanded="true"`; ↓/↑ move `aria-activedescendant` and
  `aria-selected`; Tab accepts the first option when none is highlighted; Enter accepts a
  highlighted option and otherwise calls the commit; Esc closes; `isComposing` keys are
  ignored; option text set with `textContent`; option IDs never contain tag names; an
  `item-tag` notify sets the stale flag even with no collection chosen; focus with a stale
  list reloads it once.
- [ ] AC12 `[auto]` **Static checks:** `script-suggest-model.js` uses no Zotero / DOM /
  IOUtils / PathUtils globals; script order (`codebook-model.js`, `codebook-store.js`,
  `tag-script-model.js`, `script-suggest-model.js`, `tag-monitor-model.js`, …,
  `workspace.js`); the Zotero allow-list in `workspace-script.test.mjs` gains **no** entry;
  `write-guard` passes with **no** new allow-list entry; `no-html-sinks` passes; every new
  `addEventListener` has a matching `removeEventListener` in `onUnload`; new Fluent IDs exist
  and start with `tabellify-`; the ADR-0015 colour rule passes for the new CSS.

## How to verify in the dev profile (owner)
The orchestrator turns this into numbered steps with exact windows at smoke-test time.
1. Run RT-S1 (Tools → Developer → Run JavaScript) and report its output.
2. Start the dev profile with Debug Output captured, install the `.xpi`, open the Tabellify
   tab, choose "F005 test".
3. Run AC1–AC7 in order; report "yes" or "no" plus anything that looked wrong.

## Test plan
| AC | How |
|---|---|
| AC1–AC7 | Owner smoke test (manual), Debug Output in `build/debug-N.txt`; RT-S1 before |
| AC8 | `tests/unit/tag-script-model.test.mjs` (extended) |
| AC9, AC10 | `tests/unit/script-suggest-model.test.mjs` (new; Node `vm` sandbox like the other model tests) |
| AC11 | `tests/unit/workspace-table.test.mjs` (fake DOM extended for `setRangeText`, `scrollIntoView`, key events as needed) |
| AC12 | `tests/static/workspace-script.test.mjs`, `write-guard`, `no-html-sinks`, `l10n-and-window`, `design-tokens`, `symmetry` |

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Owner approves this spec and Q1–Q9; owner runs RT-S1 (any time before T3) | owner / orchestrator | — | — |
| T1 | Pure logic: `tokenAt`; new `TabellifyScriptSuggest` (`prepare`, `suggest`, `accept`, `fold`) (AC8–AC10) | developer | T0 | `src/content/tag-script-model.js`, `src/content/script-suggest-model.js`, `tests/unit/tag-script-model.test.mjs`, `tests/unit/script-suggest-model.test.mjs` |
| T2 | Workspace integration: markup, listbox, keyboard/mouse, stale/reload, CSS, Fluent, static checks, gallery sample (AC11, AC12) | developer | T1 | `src/content/workspace.xhtml`, `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/unit/workspace-table.test.mjs`, `tests/static/workspace-script.test.mjs`, `tests/static/l10n-and-window.test.mjs`, `tests/static/symmetry.test.mjs` (only if its file list needs the new module), `docs/design-system-states.html`, `docs/design-system.md` |
| T3 | `npm test`, `npm run build`; owner smoke test AC1–AC7 | developer → owner | T2, RT-S1 passed | — |

T1 and T2 run one after the other (T2 uses T1's functions). Note for T2: the 006a static test
asserts that `workspace.js` does not mention `availableTags`; 006b keeps that true (the new
module does its own exclusion), so that assertion stays unchanged.

## Open questions (each with the recommendation this spec assumes)
1. **Q1 Enter while the list is open.** Your words: "Tab or Enter accepts; Enter with the
   list closed commits." *Recommended:* nothing is highlighted until ↓ is pressed; **Enter
   accepts only a highlighted option, otherwise it commits**; Tab accepts the highlighted or
   the first option. This keeps "type a name, press Enter" a single key press.
   Alternative: the first option is always highlighted, so Enter always accepts first and a
   second Enter commits (literal reading, two presses per entry).
2. **Q2 When to show `Create tag "xyz"`.** *Recommended:* whenever the typed name is not
   exactly a library tag (or codebook tag), as the last option, so `heat` can be created even
   though `Heat index` exists. Alternative (your exact words): only when no library tag
   matches at all.
3. **Q3 Automatic tags.** *Recommended:* excluded (Tabellify never counts them, so their
   column would stay empty), unless the name is also used as a manual tag. Alternative:
   include them, marked "automatic".
4. **Q4 Tags used only on items in the trash.** *Recommended:* included (no extra query; it
   is still a Zotero tag). Alternative: exclude, which needs a heavier query using Zotero
   internals (not proposed).
5. **Q5 Library.** *Recommended:* My Library only (the same library as the collection
   dropdown). Group libraries are a later decision.
6. **Q6 Matching.** *Recommended:* ignoring case and accents; names that start with the typed
   text first, then names that contain it; at most 50 shown. Alternative: starts-with only.
7. **Q7 Browsing without typing.** *Recommended:* ↓ in an empty token (e.g. right after `(`)
   opens the first 50 library tags alphabetically, replacing the old "Pick from library"
   list; typing filters. Alternative: the list opens only after one letter.
8. **Q8 Codebook tags inside a group.** Your rule hides tags already in the codebook. That
   also hides them when you want to **move** one into a group (`Outcome(age`).
   *Recommended:* keep your rule; moving still works by typing the full name. Alternative:
   show codebook tags inside a group, marked "move here".
9. **Q9 After accepting a tag.** *Recommended:* insert only the name (you type `,` or `)`
   yourself). Alternative: also insert `, ` so the next name can be typed at once.
