# Feature 005d: Brand design system, phase 1 (tokens + workspace restyle)

- **Status:** Approved (owner, 2026-11-13, all recommendations)
- **Branch:** `feat/005d-design-system`
- **Related ADRs:** **0015 (Proposed: brand palette and design tokens; this spec depends on
  it)**, 0009 (workspace tab), 0013 (reader section, stays native), 0003 (no bundler, no
  dependency), 0011 (security). Builds on F004 (codebook), F005 (tag monitor), F005c (table
  layout).
- **Process:** prototype mode (CLAUDE.md). Developer builds; `npm test` + `npm run build`
  pass; owner runs one smoke test (the `[manual]` ACs) with Debug Output captured to
  `build/debug-N.txt`.
- **Numbering:** "005d" because F006 is the table builder in the PRD roadmap. This is a
  styling pass on the existing workspace, not a new capability.

## Problem / objective
The owner supplied a brand design-system brief (summarised in ADR-0015, "Context"). Today
the workspace uses only system colours and `currentColor` tints. It is readable but plain.
Phase 1 introduces the **token system** (colours, spacing, type, motion) in one file and
**restyles everything the workspace already shows** with it, in light and dark mode, with
checked contrast. No new behaviour, no new data, no library access beyond what F003–F005c
already read.

Everything else in the brief is mapped to the roadmap below ("Roadmap mapping") instead of
being built now.

## Scope
**In scope (phase 1):**
1. `src/content/tokens.css`: primitives, semantic colour tokens (light + dark), spacing,
   radii, font sizes, row density, motion (ADR-0015 §3 and its token tables).
2. Restyle `src/content/workspace.css` to use only semantic tokens:
   - **Page:** `#tabellify-workspace-main` on `--tabellify-color-page`. Headings in
     `--tabellify-color-text`. Section headings (h2) get a short accent rule or accent colour
     (`--tabellify-color-heading-accent`). The `:root`/`window` background stays from `global.css`.
   - **Codebook section:** groups as flat cards (`surface`, 1px `border`, `radius-md`, no
     shadow). Tag chips with `border-strong` outline and `radius-pill`. Error line in
     `status-error`, bold, with a "!" mark.
   - **Tag monitor:** the existing summary (`#tabellify-monitor-used`, `-all-used`, `-papers`)
     becomes a row of **summary cards** (see "Representative dashboard"). Group boxes as
     cards. **Remaining** chips dashed in `status-caution`; **used** chips solid in
     `border-strong` (the shape already differs, so colour is not the only cue). The warning
     line in `status-caution` with a "!" mark.
   - **Grid table** (`#tabellify-items-table`):
     - header on `--tabellify-color-header`: in dark mode dark slate with gold group names
       (`heading-accent`) and a 2px gold `header-rule`; in light mode light neutral with slate
       text and a teal rule. Stays sticky (F005c).
     - sort buttons in the header become **flat** (transparent background, inherit colour,
       full-cell hit area). The active sorted column's button is in `--tabellify-color-action`
       and keeps the ▲/▼ glyph and `aria-sort`, so the indicator does not rely on colour.
     - body on `surface`; stripes `surface-alt`; hover `surface-hover` with a
       `--tabellify-duration-fast` background transition (0 ms under reduced motion).
     - **keyboard focus:** every focusable element in the workspace gets a 2px
       `--tabellify-color-focus-ring` outline with a 2px offset on `:focus-visible`. A table row
       containing focus (`tr:focus-within`) gets the **selected/current-row look**:
       `selected-bg` plus a 3px inline-start `selected-bar`. That is the "selected" state in
       phase 1. Real multi-row selection is a later feature.
     - ✓ cells in `--tabellify-color-status-info` (teal in light, sage-300 in dark). The ✓
       glyph and the Fluent "Used"/"Not used" text are the non-colour cue (already there).
     - **k/M column right-aligned**, `font-variant-numeric: tabular-nums` (aligned digits).
       Title and tag names left-aligned. A paper with every codebook tag used gets class
       `tabellify-count-complete`, shown in `status-positive` with a CSS "✓" suffix (Q6).
     - separators: 1px `border`. Group starts: 2px `border-strong`. Header bottom: 2px
       `header-rule`. No gradients, no shadows (the drop-indicator inset line stays, now in
       `action`).
     - compact rows: `--tabellify-row-pad-block` 4px / `--tabellify-row-pad-inline` 8px
       (today's values become tokens).
     - grips, drag and drop marks, `.tabellify-dragging`: tokens instead of `currentColor`.
       Same shapes.
   - **States:** the four status paragraphs (`#tabellify-no-collections`,
     `#tabellify-loading-items`, `#tabellify-no-items`, `#tabellify-load-error`), the codebook
     and layout status lines, and the monitor message are styled as **state panels**: muted
     text on `surface`, `radius-md`, 1px `border`, `space-4` padding. Each kind gets a
     decorative CSS glyph: empty "○", loading "…" with a subtle opacity pulse (disabled under
     `prefers-reduced-motion`), error "!" in `status-error` plus bold text. The text still
     comes from Fluent. Glyphs are CSS `::before` content, like the existing ▲/▼ and ✓.
3. **Reusable table class (Q7):** add `class="tabellify-grid"` to the `<table>` in
   `workspace.xhtml`. Write the new table rules against `.tabellify-grid`, so F006's second
   table can reuse them without copying CSS. Keep `#tabellify-items-table` only where the
   rule is specific to this table (column widths per `<col>` class, the two sticky header rows).
4. Static and unit tests (see ACs). The F005c background rule in
   `tests/static/l10n-and-window.test.mjs` is replaced as in ADR-0015 §7.
5. `docs/design-system.md`: short, for contributors (outline in "Design").
6. **States gallery (Q8, recommended):** `docs/design-system-states.html`, a static page,
   not shipped in the `.xpi`. It links `../src/content/tokens.css` and
   `../src/content/workspace.css` and shows a small sample table and panels in every state:
   default, hover (use `:hover` live), current/selected row, keyboard focus, sorted header,
   ✓ cells, complete k/M, empty, loading, error, and an "editing" sample (an input inside a
   cell, with a validation-error example). It is the place to review states the real data
   can't easily produce, such as errors and editing. Open it in any browser. It follows the
   **operating system's** light/dark setting, not Zotero's.

**Out of scope (non-goals):** see "Roadmap mapping". In particular: no new interactions
(filtering, search, row selection, bulk actions, inline editing, column resizing, expandable
rows, pagination), no change to the reader item pane section (ADR-0015 S-A), no branded native
form controls (Q4), no new Fluent strings unless Q5 adds the "Remaining" card, no new font.

## Roadmap mapping (brief items not built in phase 1)
| Brief item | Where it goes | Note |
|---|---|---|
| Token system (colour, spacing, type), table light/dark, header/stripes/hover/padding, tabular numerals, numbers right / text left, separators, sticky header, sort indicators, compact rows, focus rings, subtle animation, empty/loading/error states | **005d (this spec)** | Sticky header and horizontal scroll already exist (F005c) and are only restyled |
| Consistent wrap/truncation with tooltips | 005d (tokens only) | Behaviour already exists: titles wrap, group names truncate with a tooltip, tag cells have tooltips (F005c) |
| Column reordering | **Done (F005c)** | Restyled only |
| Configurable widths / column resizing | **F009** (column customization) | As F005c Q3: needs pointer tracking and saving (`layout.json` schema bump) |
| Sorting | **Done (F005, F005c)** | Restyled only |
| Filtering and search | **New roadmap item, recommended right after F006** ("Filter and search rows") | Filtering is most useful once the table builder (F006) has highlight text in cells. Needs its own spec (filter UI, Fluent strings, what "match" means for tags vs text) |
| Row selection and bulk actions (bulk selection, selected rows) | **New roadmap item, with or after F008 (CSV export)** | The first useful bulk action is "export selected rows". Selection-state tokens and the gallery sample exist from 005d. A spec must define the actions; none may write to the library without explicit authorisation (rule 8) |
| Inline editing + validation feedback | **Needs its own spec; not planned yet** | Today every cell is derived from Zotero tags. Editing a ✓ would mean adding or removing a Zotero tag, which is a **library write** (CLAUDE.md rule 8, PRD §6), needing a spec that authorises it and owner approval. Editing Tabellify-owned cells (user-created columns) belongs to **F009**. Validation-feedback tokens (`status-error`) apply now to the codebook inputs' existing error line |
| Expandable rows | **F006** (consider) | Long highlight text in cells (F006) may need expand/collapse. F005c removed the old detail rows on purpose |
| Pagination / virtualization | **Only if needed**: add a performance check to F006 | Trigger: a real collection (for example 500+ papers) renders or scrolls slowly. Zotero's own `virtualized-table.jsx` shows the approach. Not before a measured need |
| Keyboard navigation | Partly done (Tab, Alt+arrows, F005c). Arrow-key cell navigation is **F006** | 005d adds visible focus rings and the focused-row highlight |
| Representative dashboard | **005d: minimal summary cards** (below); more needs an owner decision (Q5) | |
| Reusable table component | **005d: shared CSS class `.tabellify-grid`. JS renderer extracted when F006 builds its second table** | Extracting now would be a speculative abstraction with one user. F006 will show what really needs to be shared |

## Representative dashboard (phase 1, minimal)
The brief asks for a "representative dashboard". Phase 1 recommends a **summary header of
cards** at the top of the Tag monitor, using only numbers the monitor already computes:

| Card | Content (existing element) | Accent |
|---|---|---|
| Tags used | "Tags used k/M" (`#tabellify-monitor-used`) | `heading-accent` label; tabular numerals |
| Papers | "Papers n" (`#tabellify-monitor-papers`) | none |
| All used (only when true) | "All codebook tags used" (`#tabellify-monitor-all-used`) | `status-positive` with "✓" |
| *Remaining (only if Q5 = yes)* | "Remaining r" (new Fluent ID `tabellify-monitor-remaining-count`, r = M − k) | `status-caution` |

Cards are flat (`surface`, 1px `border`, `radius-md`, no shadow), laid out with flex wrap.
The markup does not change for the first three (CSS only on the existing spans).

## User stories
- As a researcher, I see a calm, consistent, professional workspace in Zotero's light and
  dark modes, and the text is always easy to read.
- As a researcher, I can tell at a glance which tags a paper has (✓), which papers are
  complete, and which column the table is sorted by, even without relying on colour.
- As a keyboard user, I always see where the focus is.
- As a contributor, I can add a colour or spacing value in one place and know the contrast
  test will catch a bad choice.

## Design

### Files
| File | Change |
|---|---|
| `src/content/tokens.css` | **New.** Primitives (`--tabellify-palette-*`, the only colour literals in `src/`), semantic `--tabellify-color-*` in `:root` and in `@media (prefers-color-scheme: dark) { :root { … } }`, non-colour tokens, a `@media (prefers-reduced-motion: reduce)` block setting `--tabellify-duration-fast: 0ms` |
| `src/content/workspace.xhtml` | Add `<html:link rel="stylesheet" href="chrome://tabellify/content/tokens.css"/>` **before** the `workspace.css` link in `<linkset>`. Add `class="tabellify-grid"` to `#tabellify-items-table`. Update the header comment ("Why global.css") to mention tokens |
| `src/content/workspace.css` | Restyle per "Scope". Remove all `color-mix(… currentColor …)` and `-moz-Dialog`. Update the header comments |
| `src/content/workspace.js` | One change: `tabellify-count-complete` on the k/M cell when `counting && paper.total > 0 && paper.count === paper.total`. If Q5 = yes: fill the Remaining card |
| `src/locale/en-US/tabellify.ftl` | Only if Q5 = yes: `tabellify-monitor-remaining-count` ("Remaining") |
| `tests/static/design-tokens.test.mjs` | **New.** Token-file checks + contrast test (AC10, AC12) |
| `tests/static/l10n-and-window.test.mjs` | Replace `backgroundViolations` and its self-check with the ADR-0015 §7 rule (AC11) |
| `tests/unit/workspace-table.test.mjs` | Add the `tabellify-count-complete` cases (AC14) |
| `docs/design-system.md` | **New.** Contributor guide (outline below) |
| `docs/design-system-states.html` | **New** (Q8). States gallery, not shipped |

`src/reader-tags.js`, `src/tabellify.js` and `src/bootstrap.js` are **not touched**.

### Light/dark detection
`@media (prefers-color-scheme: dark)` only (ADR-0015 M-1). In a chrome document it follows
Zotero Settings → General → **Color Scheme:** (Automatic / Light / Dark). This is verified
from source, with the runtime part in RT-D1/RT-D2 (`docs/zotero-api-notes.md`). No JavaScript
reads the colour scheme.

### Token parsing contract (for the tests)
So that a small Node test can parse `tokens.css` with regular expressions, the file follows
these rules (stated at its top in a comment):
- one declaration per line: `--name: value;`
- primitives: `--tabellify-palette-<name>: #rrggbb;` (lower-case 6-digit hex), only in the
  first `:root` block
- semantic light: `--tabellify-color-<name>: var(--tabellify-palette-<name>);` in a second
  `:root` block. Semantic dark: the same names inside exactly one
  `@media (prefers-color-scheme: dark) { :root { … } }` block
- non-colour tokens anywhere in `:root`. No nesting, no `@import`.

### Contrast pairs checked by the test
The test holds a list `{ fg, bg, min }` of semantic token names, checked in both modes. It
recomputes the WCAG 2.2 ratio (sRGB linearisation with threshold 0.04045, luminance
`0.2126 R + 0.7152 G + 0.0722 B`, ratio `(L1 + 0.05) / (L2 + 0.05)`). The list is every pair
marked "pass" in ADR-0015's light and dark tables, for example
`{ fg: "text", bg: "surface", min: 4.5 }`,
`{ fg: "status-info", bg: "surface-hover", min: 4.5 }`,
`{ fg: "focus-ring", bg: "selected-bg", min: 3 }`. The two flagged pairs (dark caution on
stripe/hover) are listed as **known exceptions** with `min: 3` and a comment pointing to
ADR-0015, so the rule "no caution text in rows" stays visible.

### `docs/design-system.md` outline (short)
1. What a token is: primitive vs semantic (three sentences, with one example).
2. Rules: literals only in `tokens.css`; components use `--tabellify-color-*` only; every
   semantic token in both modes; no shadows or gradients; status never by colour alone.
3. How to add a colour: add a primitive → add the semantic token in light and dark → add
   its contrast pairs to `tests/static/design-tokens.test.mjs` → `npm test`.
4. How to add spacing/size tokens.
5. The table class `.tabellify-grid`, and which states it styles.
6. Light/dark: follows Zotero's Color Scheme setting; how to check (RT-D1).
7. Where the brand does **not** apply (the reader item pane section, ADR-0015 S-A).

### Lifecycle
No new listeners, observers, timers, prefs or files. CSS loads and unloads with the
workspace document. The opacity pulse is a CSS animation with no JavaScript. Lifecycle tests
are unchanged.

### Does this need an ADR?
Yes: ADR-0015 (Proposed). It covers the product-principle change, the new shared stylesheet
and the test rule. This spec must not be built before ADR-0015 is accepted.

## Zotero / Mozilla APIs used
No new `Zotero.*` call. No new Mozilla API in `src/`. All are in `docs/zotero-api-notes.md`
("F005d" rows).

| API / mechanism | Status |
|---|---|
| `@media (prefers-color-scheme: dark)` in our chrome document follows Zotero's Color Scheme setting | Verified (source, by composition; one link, `Document::PreferredColorScheme`, not read). **UNVERIFIED (runtime): RT-D1** |
| The media query updates while the tab is open after the setting changes | **UNVERIFIED (runtime): RT-D2** (also R7 part 2) |
| CSS custom properties / `var()`, `:focus-visible`, `:focus-within`, `font-variant-numeric`, `@media (prefers-reduced-motion)`, `transition`, `@keyframes` | Verified (docs, MDN). Standard CSS in Firefox ESR 140 |
| `<html:link rel="stylesheet">` in `<linkset>` | Already verified (existing row; `workspace.css` loads this way) |
| `Services.prefs.getIntPref(name, default)`, `window.matchMedia(q).matches` | **Runtime checks only (RT-D1)**, never in `src/`. Verified (source / docs) |

## Data safety
- **Read from the library:** nothing new. The restyle shows what F003–F005c already read.
- **Written to the library:** nothing. No item, tag, collection, annotation or database
  change.
- **Written to disk:** nothing new. The write guard and its allow-list are unchanged
  (`codebooks.json`, `layout.json` only, as before).
- **Untrusted text:** no new text rendering. Status glyphs come from CSS `content`, not from
  data. `no-html-sinks` still applies. The only JS change toggles a class.
- **CSS from data:** tag names and titles are never put into CSS (F005c rule unchanged).
- Development and testing use only the dev profile and `~/Zotero tabellify-dev`.

## Acceptance criteria
`[manual]` = owner smoke test in the dev profile (Zotero 10.0.9), with the F005 test
collection "F005 test" and its codebook. Switch the mode in **Zotero Settings → General →
Color Scheme:** → **Light** / **Dark**. `[auto]` = `npm test`.

- [ ] AC1 `[manual]` **Light mode.** With Color Scheme **Light**, the Tabellify tab shows a
  light-gray page. The codebook groups, tag monitor groups and summary cards are white cards
  with thin gray borders and no shadows. The table has a light-gray header with dark slate
  text, a teal line under the header, and white rows with very light stripes. Group (super-tag)
  names are dark gold. All text is easy to read.
- [ ] AC2 `[manual]` **Dark mode.** With Color Scheme **Dark** (reopen the Tabellify tab if
  AC3 fails), the page is dark slate. Cards and table rows are a slightly lighter slate. The
  header is dark slate with gold group names and a gold line under it. Text is near-white.
  No white or black blocks, no light-on-light or dark-on-dark text. Buttons, the collection
  dropdown, inputs and the checkbox are readable on the dark page.
- [ ] AC3 `[manual]` **Live switch (= RT-D2).** With the Tabellify tab open, switching Light
  ↔ Dark changes the tab's colours within a second, without reopening it. If it doesn't,
  record that (AC2 still passes after reopening; the API notes row stays UNVERIFIED).
- [ ] AC4 `[manual]` **Table states, both modes.** Moving the mouse over a row tints it.
  Pressing Tab to a row's grip shows a clearly visible cyan focus ring (darker cyan in light
  mode), and that row gets the selected look (tinted background, a coloured bar at its start
  edge). Clicking "Title" shows ▲ and colours that header button. Clicking again shows ▼. ✓
  cells are teal (light) or sage (dark). The k/M numbers are right-aligned with digits lined
  up, and a paper that has every codebook tag shows its k/M in green with a ✓.
- [ ] AC5 `[manual]` **Empty and loading states.** Choosing a collection with no papers shows
  the "no items" message as a bordered panel with a small "○" mark. While a collection loads,
  the loading panel appears (it may flash briefly). With macOS System Settings →
  Accessibility → Display → **Reduce motion** on, the loading mark does not pulse.
- [ ] AC6 `[manual]` **Nothing else changed.** Column and row drag, Alt+arrow moves, sorting,
  "Reset columns", "Manual order", codebook editing and the "Also count tags on the paper
  itself" checkbox work as before. The **"Tabellify tags" section beside a PDF looks the same
  as before** (Zotero-native) in both modes. Debug Output shows no Tabellify errors. Closing
  the tab and disabling Tabellify with the tab open produce no errors.
- [ ] AC7 `[manual]` **States gallery (only if Q8 = yes).** Opening
  `docs/design-system-states.html` in a web browser shows the sample table and panels in every
  listed state (default, hover, selected, focus, sorted, ✓, complete k/M, empty, loading,
  error, editing with a validation error), in the operating system's light and dark mode.
- [ ] AC8 `[manual]` **RT-D1** (read-only Run JavaScript check, `docs/zotero-api-notes.md`)
  gives the expected values for Light, Dark and Automatic.
- [ ] AC9 `[auto]` **Load order and scope** (`tests/static/l10n-and-window.test.mjs`):
  `global.css` processing instruction still before `<window>`; `tokens.css` linked before
  `workspace.css`; the `<table>` has class `tabellify-grid`; `reader-tags.js` contains no
  `tokens.css` and no `--tabellify-palette-` / `--tabellify-color-` text.
- [ ] AC10 `[auto]` **Token file** (`tests/static/design-tokens.test.mjs`): every primitive is
  lower-case 6-digit hex; no colour literal outside `--tabellify-palette-*` declarations; every
  `--tabellify-color-*` is defined in both the light block and the single dark block, with the
  same set of names, and resolves to a primitive; all eight brand colours exist with the
  owner's hex values; a `prefers-reduced-motion: reduce` block sets
  `--tabellify-duration-fast: 0ms`.
- [ ] AC11 `[auto]` **Colour rule for components** (`l10n-and-window.test.mjs`, replacing the
  F005c rule): no colour literal (hex, `rgb(`/`rgba(`, `hsl(`/`hsla(`, `hwb(`, `lab(`,
  `lch(`, `oklab(`, `oklch(`, `color(`, CSS named colours) and no `--tabellify-palette-`
  reference in `workspace.css`; colour-bearing properties use only
  `var(--tabellify-color-*)`, `transparent`, `currentColor`, `inherit`, `none`; no
  background on `:root` or `window`; every token used as a background is opaque in both modes;
  every `var(--tabellify-color-*)` used is defined. A **self-check** shows the rule rejects
  `background: #fff`, `color: red`, `border-color: rgb(0 0 0)`,
  `background: var(--tabellify-palette-teal)`, `:root { background: var(--tabellify-color-page) }`,
  and an undefined token, and accepts `background-color: var(--tabellify-color-surface)`.
- [ ] AC12 `[auto]` **Contrast** (`design-tokens.test.mjs`): every listed pair meets its
  minimum in both modes. The known exceptions are listed explicitly. A self-check computes
  brand gold `#bfa76f` on white as below 3:1 and `#000000` on `#ffffff` as 21:1, so the
  formula itself is tested.
- [ ] AC13 `[auto]` **Unchanged guards:** `write-guard` passes with no new allow-list entries;
  `no-html-sinks` passes; the Zotero allow-list in `workspace-script.test.mjs` gains no
  entries; lifecycle-symmetry tests pass unchanged; every Fluent ID used exists (including
  `tabellify-monitor-remaining-count` if Q5 = yes).
- [ ] AC14 `[auto]` **Complete count** (`tests/unit/workspace-table.test.mjs`): the k/M cell
  has `tabellify-count-complete` exactly when the codebook has tags and the paper's count
  equals the total, under both counting rules. Never when there is no codebook (cell "–").

## Test plan
| AC | How |
|---|---|
| AC1–AC7 | Owner smoke test, Debug Output in `build/debug-N.txt` |
| AC8 | Owner runs RT-D1 (can be done before the build) |
| AC9, AC11 | `tests/static/l10n-and-window.test.mjs` |
| AC10, AC12 | `tests/static/design-tokens.test.mjs` (new; Node `node:test`, no dependency) |
| AC13 | existing `write-guard`, `no-html-sinks`, `workspace-script`, lifecycle tests |
| AC14 | `tests/unit/workspace-table.test.mjs` |

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | After ADR-0015 is accepted: apply the PRD §6 wording; update `docs/architecture.md` §3 (`tokens.css`) and §4 (workspace branded, item pane section native) | architect / orchestrator | ADR-0015 accepted | `docs/product-requirements.md`, `docs/architecture.md` |
| T1 | `tokens.css` + link in `workspace.xhtml` (before `workspace.css`) + `tabellify-grid` class + `design-tokens.test.mjs` (AC10, AC12) | developer | spec approved | `src/content/tokens.css`, `src/content/workspace.xhtml`, `tests/static/design-tokens.test.mjs` |
| T2 | Restyle `workspace.css` with tokens: page, codebook, tag monitor + summary cards, grid table (header, sort buttons, stripes, hover, focus ring, focus-within row, ✓, k/M right/tabular, separators, grips/drag marks), state panels, reduced motion | developer | T1 | `src/content/workspace.css` |
| T3 | Replace the background rule with the ADR-0015 §7 colour rule + self-check; load-order and scope checks (AC9, AC11) | developer | T2 (the old CSS would fail the new rule) | `tests/static/l10n-and-window.test.mjs` |
| T4 | `tabellify-count-complete` class + unit test (AC14); if Q5 = yes: Remaining card + Fluent string | developer | T2 | `src/content/workspace.js`, `tests/unit/workspace-table.test.mjs`, (`src/locale/en-US/tabellify.ftl`, `src/content/workspace.xhtml` if Q5) |
| T5 | `docs/design-system.md` (outline above); if Q8 = yes `docs/design-system-states.html` | developer | T2 | `docs/design-system.md`, `docs/design-system-states.html` |
| T6 | `npm test`, `npm run build`; owner smoke test AC1–AC8 | developer → owner | T3, T4, T5 | — |

T1–T4 touch overlapping files (`workspace.xhtml`, `workspace.css`), so they run one after
another (no parallel worktrees). T5 can run in parallel with T3/T4 (docs only).

## Open questions (each with the recommendation the spec assumes)
1. **Q1: Brand scope.** Workspace only, reader section native (ADR-0015 S-A)? *Recommended:
   yes.*
2. **Q2: Derived shades** (ADR-0015 primitives table)? *Recommended: accept as a start.* Hex
   values can be tuned later; the contrast test guards them.
3. **Q3: Light-mode focus ring.** Darker cyan `#00788a` or a two-tone ring? *Recommended:
   darker cyan* (simpler, 4.4–5.2:1).
4. **Q4: Native form controls** (buttons, dropdown, text inputs, checkbox) stay native in
   phase 1? *Recommended: yes.* They keep the OS look, accessibility and focus behaviour, and
   follow light/dark by themselves. Only the table's header sort buttons are flattened.
   Branded buttons (teal primary) could come in a later phase with their own contrast pairs
   (dark mode: `teal-300` background with dark text, 5.53:1).
5. **Q5: Dashboard content.** Is the minimal summary-card header enough for now, and should it
   include a **"Remaining r"** card (one new Fluent string)? *Recommended: yes to cards; yes to
   Remaining* (it is the number the PRD's tag monitor is about). Anything bigger (charts,
   per-group progress bars, cross-collection overview) needs the owner to say what it should
   show, in a later spec.
6. **Q6: "Complete" mark on k/M** (green + ✓ when a paper has every codebook tag)?
   *Recommended: yes.* It uses lime "selectively" as the brief asks. Alternative: no mark.
7. **Q7: `.tabellify-grid` class now** (CSS reusable by F006), JS renderer extracted later?
   *Recommended: yes.*
8. **Q8: States gallery** `docs/design-system-states.html` (not shipped)? *Recommended: yes.*
   It is the only way to review error and editing states without breaking data on purpose.
9. **Q9: Font.** Keep Zotero's system UI font (no brand font)? *Recommended: yes* (native,
   no font files, no licence question).
10. **Q10: Windows high-contrast mode.** A `prefers-contrast: more` fallback to system
    colours? *Recommended: later* (owner is on macOS; note in ADR-0015 Consequences).
