# Tabellify design system (contributor guide)

Decision: [ADR-0015](decisions/0015-brand-design-system.md). Feature:
[005d](features/005d-design-system.md). Token file: `src/content/tokens.css`.
States gallery: `docs/design-system-states.html` (open it in any web browser).

## 1. Tokens: primitive vs semantic
A **design token** is a named value stored as a CSS custom property (a CSS variable).
A **primitive** names a raw colour, for example `--tabellify-palette-teal: #004d43;`. A
**semantic** token names a job and points at a primitive, for example
`--tabellify-color-selected-bar: var(--tabellify-palette-teal);` in light mode and
`var(--tabellify-palette-teal-300)` in dark mode. Components only use semantic tokens, so
they never need to know which mode is on.

## 2. Rules
- **Colour literals live only in `tokens.css`**, only as lower-case 6-digit hex, and only
  on `--tabellify-palette-*` lines. 6-digit hex means every colour is opaque.
- **Components use `var(--tabellify-color-*)` only** for colours, plus `transparent`,
  `currentColor`, `inherit` and `none`. Never a primitive, never a hex value, `rgb()`,
  `hsl()`, a named colour (`red`) or a system colour (`Canvas`).
- **Every semantic token exists in both modes** (the light `:root` block and the one
  `@media (prefers-color-scheme: dark)` block).
- **No background on `:root` or `window`.** `global.css` paints the window; our page colour
  is on `#tabellify-workspace-main`.
- **Flat:** no shadows and no gradients. The only `box-shadow`s are inset lines (drop
  indicator, selected-row bar).
- **Status never by colour alone.** ✓ is a glyph with Fluent text, the "Ungrouped" pill
  and editor box are dashed, errors (including the tag script box's inline error) have a
  "!" and bold text, a complete k/M has a "✓".
- Dark-mode gold (`status-caution`) is **not** used as text inside table rows: it fails
  4.5:1 on stripes and hover (ADR-0015, "Flagged").

`npm test` enforces these rules (`tests/static/design-tokens.test.mjs` and
`tests/static/l10n-and-window.test.mjs`).

## 3. How to add a colour
1. Add a primitive in the first `:root` block of `tokens.css`:
   `--tabellify-palette-<name>: #rrggbb;`
2. Add the semantic token in the light `:root` block **and** in the dark block:
   `--tabellify-color-<job>: var(--tabellify-palette-<name>);`
3. Add its contrast pairs to `LIGHT_PAIRS` / `DARK_PAIRS` in
   `tests/static/design-tokens.test.mjs`: 4.5 for text, 3 for borders, rings and icons.
4. Run `npm test`. A failing pair prints its ratio; pick a darker or lighter shade.

## 4. How to add spacing or size tokens
Add a line to the non-colour `:root` block of `tokens.css`, for example
`--tabellify-space-7: 32px;`. Values are a number with a unit (`px`, `em`, `ms`); the test
rejects anything else there. Existing scales: space 1–6 (2, 4, 8, 12, 16, 24 px), radius
sm/md/pill (4, 6, 12 px), font size sm/md/lg (em, relative to Zotero's UI font; no brand
font), row padding (4 px / 8 px), border widths, focus ring width/offset, and
`--tabellify-duration-fast` (120 ms, 0 ms under reduced motion).

## 5. The table class `.tabellify-grid`
Any `<table class="tabellify-grid">` gets the shared table style. Rules that fit only the
per-paper table (column widths per `<col>`, the two sticky header rows) stay on
`#tabellify-items-table`. States it styles:
- header (`header` background, 2px `header-rule`, group names in `heading-accent`)
- flat sort buttons; the sorted column (`th[aria-sort]`) in `action` with ▲/▼
- stripes (`tr.tabellify-row-alt`), hover (with a short fade), focused row
  (`tr:focus-within`: `selected-bg` and a 3px `selected-bar`)
- focus ring on every focusable element (`:focus-visible`)
- ✓ cells (`td.tabellify-tag-used`) in `status-info`
- numbers right-aligned with tabular figures; `td.tabellify-count-complete` in
  `status-positive` with a "✓"
- group start lines (`.tabellify-group-start`), grips, `.tabellify-dragging`, drop lines
- regroup drop marks while a tag column is dragged (Feature 006c, Amendment 2: the edge of
  the cell under the pointer decides), all in `action` and told apart by shape:
  `th.tabellify-drop-into` (a 2px line under the name of the group joined),
  `th.tabellify-drop-above` / `th.tabellify-drop-below` (a 2px line along the top / bottom of
  the header of the tag that becomes a group name), `.tabellify-drop-nest` (2px lines on both
  sides of that tag's cells), and the drop lines `tabellify-drop-before` / `-after` (on a
  group's or run's super-header and its first / last tag header together for "beside the
  group"); the toolbar's `#tabellify-drop-hint` names the action in `text-muted` italics.
  The dashed `tabellify-drop-ungroup` outline is retired (no zone ungroups a whole row)
- the "Ungrouped" super-header over each run of tags without a group
  (`th.tabellify-col-group-ungrouped`, `data-run`, Feature 006c Amendment 2): the text
  "Ungrouped" in `text-muted`, no grip

## 5a. Workspace page components (Features 006a, 006b, 007a, 007b)
The per-group summary cards and the Remaining/Used chip lists of Feature 005/005d were
removed in Feature 006a. The page now uses:
- the **summary line** in the collection row ("Tags used 4/6 · Papers 12"; the "·" is CSS)
- the **tag script box** (`#tabellify-script-input`) with a muted help line and an inline
  error line (`#tabellify-script-error`: `status-error`, bold, "!"); the box itself gets a
  `status-error` outline while `aria-invalid="true"`
- **group pills** (`.tabellify-pill`: surface, `border-strong` outline, pill radius; name in
  bold, count in tabular figures after a CSS "·"; the ungrouped pill is dashed)
- the **"Edit groups and tags"** disclosure (`<details>`), whose groups are flat cards with
  tag chips and a × button
- (Feature 006b) the **suggestion list** under the script box (`#tabellify-script-suggestions`,
  options `.tabellify-suggest-option`): `surface` background, `border-strong` 1px border,
  `radius-md`, no shadow, about 10 rows high with scrolling; the highlighted option
  (`aria-selected="true"`) uses `selected-bg` / `selected-text` with the `selected-bar` inset
  line, like the focused table row; "group" and "codebook only" are muted notes
  (`.tabellify-suggest-hint`, `text-muted`); "Create tag" is set apart by a `border` line
- (Feature 007a) the **"View table" modal** (`#tabellify-view-dialog`, an HTML `<dialog>`
  opened with `showModal()`): `surface` background and `text` colour (replacing the
  browser's system colours), `border-strong` 1px border, `radius-md`, `space-5` padding, no
  shadow; as wide and tall as the tab minus `space-6` on each side. The layout rule is
  `#tabellify-view-dialog[open]` (flex column), never the plain ID, or the closed dialog
  would show. The page behind is dimmed by the browser's own backdrop: there is **no**
  `::backdrop` rule (it inherits nothing, so tokens may not resolve there). Inside: a muted
  "not saved" note, Name and Description fields, the table area `#tabellify-view-scroll`
  (the only part that scrolls, both ways; focus ring from the shared rule), the read-only
  copy `#tabellify-view-grid` (`.tabellify-grid` look, content-sized columns, no grips or
  sort buttons, no sticky header), and "Export CSV" / "Close" with the export status card
- (Feature 007b) the **"Saved tables" list** (`#tabellify-saved`, a closed `<details>` under
  the collection row): the summary in `action` bold like "Edit groups and tags", the count
  after a CSS "·" in tabular figures; a filter select; one flat card per saved table
  (`.tabellify-saved-item`: `surface`, `border`, `radius-md`) with the Name in bold, a muted
  `font-size-sm` meta line ("F005 test · 12 papers · 7 columns · Saved …", the dots are CSS)
  and native Open / Export CSV / Delete buttons. The **confirm state**
  (`.tabellify-saved-confirm`) turns the card border and the question
  (`.tabellify-saved-question`, bold, "!") to `status-error`, so it is not colour alone.
  Messages (`#tabellify-saved-message`, error look `.tabellify-saved-error`) and the status
  line (`#tabellify-saved-status`) reuse the state-panel and export-status rules. In the
  modal's saved mode the muted `#tabellify-view-meta` line ("Snapshot from … · F005 test")
  replaces the "not saved" note, and "Save table" / "Save changes" comes first in the actions
All of them are in the states gallery.

## 6. Light and dark
`tokens.css` switches with `@media (prefers-color-scheme: dark)`. In Zotero this follows
**Zotero Settings → General → Color Scheme:** (Automatic / Light / Dark). No JavaScript
reads the setting. To check it in the dev profile, run the read-only RT-D1 snippet in
`docs/zotero-api-notes.md` ("F005d runtime checks"). The states gallery follows the
**operating system's** setting instead, because it runs in a normal browser.

## 7. Where the brand does not apply
The "Tabellify tags" item pane section beside a PDF (`src/reader-tags.js`, ADR-0013)
stays Zotero-native: it sits inside Zotero's own pane (ADR-0015, option S-A). Native form
controls (buttons, the collection dropdown, text inputs, the checkbox) also keep their
system look in phase 1 (spec Q4).
