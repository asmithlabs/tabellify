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
- the blank group header of tags without a group (`th.tabellify-col-group-ungrouped`,
  Feature 006a): no text, only its grip; its name is for screen readers

## 5a. Workspace page components (Features 006a, 006b)
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
