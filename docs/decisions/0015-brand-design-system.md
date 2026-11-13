# ADR-0015: Tabellify brand palette and design tokens

- **Status:** Accepted (owner approved 2026-11-13, all recommendations)
- **Date:** 2026-11-12
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** PRD §6 "Native feel" (this ADR proposes to change it); ADR-0009 (workspace tab:
  the workspace is our own document in an `<iframe>`); ADR-0013 (reader item pane section);
  ADR-0003 (no bundler, no dependency); Feature 005c (table formatting, the narrowed
  background test, its Q4); Feature 005d spec `docs/features/005d-design-system.md`;
  `docs/zotero-api-notes.md` (rows "F005d" and runtime checks RT-D1/RT-D2)

## Context

### What the owner asked for
The owner supplied a brand design-system brief. In summary: Tabellify should look like a
"polished professional analytics application, not a generic admin dashboard", built on eight
brand colours, with semantic design tokens, light and dark modes, WCAG contrast, and a
reusable table style.

| Brand token (owner) | Hex | Intended role (brief) |
|---|---|---|
| `--dark` | `#243036` | Dark slate foundation; text in light mode |
| `--gold` | `#bfa76f` | Muted gold for hierarchy, caution/review |
| `--sage` | `#6e9075` | Restrained secondary accent, informational status |
| `--white` | `#ffffff` | Reading/table surfaces (light) |
| `--bg` | `#f5f7fa` | Light-gray page background |
| `--teal` | `#004d43` | Navigation, actions, selected |
| `--cyan` | `#00eaff` | Data viz, focus indicators, meaningful status only |
| `--lime` | `#00e676` | Positive status (used selectively) |

### Why this needs an ADR
- **It changes a product principle.** PRD §6 says "Native feel. Follow Zotero UI conventions".
  So far every Tabellify colour is a Zotero/system colour: `global.css` gives the window
  `-moz-Dialog`, and `workspace.css` uses only `currentColor` tints. A brand palette replaces
  that look inside Tabellify.
- **It changes an owner-approved test.** `tests/static/l10n-and-window.test.mjs` allows a
  background only on `#tabellify-items-table` cells, and only `color-mix(currentColor)` or
  system colours (F005c Q4). Brand surfaces need real colours.
- **It adds a new shared stylesheet, `tokens.css`.** Every later UI feature will build on
  it. That is a public interface inside the codebase (CLAUDE.md rule 7).

### Background for a JavaScript learner
- **Design token.** A named value (a colour, a spacing step, a font size) stored as a **CSS
  custom property** such as `--tabellify-color-surface: #ffffff;`. Components then write
  `background-color: var(--tabellify-color-surface)` instead of the hex value. To change the
  look you change the token in one place.
- **Primitive vs semantic token.** A *primitive* names a raw colour (`--tabellify-palette-teal`).
  A *semantic* token names a job (`--tabellify-color-selected-bar`) and points at a primitive.
  Dark mode then means "point the semantic tokens at other primitives". Components never need
  to know which mode is on.
- **Contrast ratio.** WCAG 2.2 compares the relative luminance (perceived brightness) of two
  colours. The ratio runs from 1:1 (same colour) to 21:1 (black on white). Normal text needs
  **4.5:1** (SC 1.4.3, [WCAG 2.2](https://www.w3.org/TR/WCAG22/#contrast-minimum)). Large or
  bold text, icons, focus rings and component borders need **3:1** (SC 1.4.11,
  [non-text contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast)).
- **Chrome document.** A privileged Mozilla UI page such as Zotero's windows and our
  `workspace.xhtml` (system principal, RT2 in `docs/zotero-api-notes.md`). Gecko gives chrome
  documents different colour rules than web pages, which matters for dark mode below.

### Where could the brand apply?
Tabellify has two visible surfaces (`docs/architecture.md` §4):
1. **The Tabellify tab / workspace document** (`workspace.xhtml`, our own document in an
   `<iframe>`; also the F001 fallback window). Our stylesheets load only there. Nothing we
   style there can leak into Zotero.
2. **The "Tabellify tags" item pane section** (`src/reader-tags.js`, ADR-0013). It sits
   *inside Zotero's own item pane / reader context pane*, between Zotero's Info, Tags and
   Notes sections. It has no stylesheet of its own today. It inherits Zotero's pane styles.

### How light/dark mode is decided in a chrome document (Zotero 10.0.9)
Verified from source. Details and line numbers are in `docs/zotero-api-notes.md` ("F005d" rows).
1. Zotero Settings → General → **Color Scheme:** (Automatic / Light / Dark) is a radiogroup
   bound to the Mozilla pref `browser.theme.toolbar-theme`, with values 2 / 1 / 0
   ([`preferences_general.xhtml` L40–44 @ 10.0.9](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/preferences/preferences_general.xhtml#L40-L44);
   labels in [`preferences.ftl`](https://github.com/zotero/zotero/blob/10.0.9/chrome/locale/en-US/zotero/preferences.ftl)).
2. Gecko (Firefox ESR 140) reads that pref for **chrome** documents.
   `PreferenceSheet::ColorSchemeSettingForChrome()` maps 0 → Dark, 1 → Light, anything else
   → System. `PreferenceSheet::Prefs::Load` sets `mColorScheme` from it when `aIsChrome`, and
   falls back to `LookAndFeel::SystemColorScheme()` for System
   ([`layout/style/PreferenceSheet.cpp`](https://searchfox.org/mozilla-esr140/source/layout/style/PreferenceSheet.cpp)).
   A document gets the chrome prefs when `aDoc.IsInChromeDocShell()` (`PrefsKindFor`, same
   file; `PrefsFor` in [`PreferenceSheet.h`](https://searchfox.org/mozilla-esr140/source/layout/style/PreferenceSheet.h)).
3. The CSS media feature `prefers-color-scheme` is answered by
   `Gecko_MediaFeatures_PrefersColorScheme`, which returns `aDocument->PreferredColorScheme()`
   ([`layout/style/nsMediaFeatures.cpp`](https://searchfox.org/mozilla-esr140/source/layout/style/nsMediaFeatures.cpp)).
   **One link not read:** the body of `Document::PreferredColorScheme()` in
   `dom/base/Document.cpp` (the file was too large for the fetch tool). Gecko's design implies
   it returns `PreferenceSheet::PrefsFor(*this).mColorScheme`, but that is not verified here.
4. **Zotero itself relies on exactly this.** Its dark theme is wrapped in
   `@media (prefers-color-scheme: dark) { :root { … } }`
   ([`scss/themes/_dark.scss` ~L55–59 @ 10.0.9](https://github.com/zotero/zotero/blob/10.0.9/scss/themes/_dark.scss)),
   and its `light-dark` / `color-scheme` mixins use `prefers-color-scheme: light|dark`
   ([`scss/abstracts/_mixins.scss` ~L95–112](https://github.com/zotero/zotero/blob/10.0.9/scss/abstracts/_mixins.scss)).
   The Color Scheme setting works in Zotero's own windows, so the media query follows the
   setting in Zotero's chrome documents.
5. **Our document.** The workspace is a `chrome://` page in an HTML `<iframe>` (no
   `type="content"`) inside the main window, and it runs with the system principal (RT2). By
   construction it is in a chrome docshell, so it should behave like Zotero's windows. This
   is **UNVERIFIED (runtime)**, and so is whether the switch applies while the tab is open.
   Checks: **RT-D1** (read-only Run JavaScript snippet; works with today's build, so the owner
   can run it before deciding) and **RT-D2** (after the 005d build; same as the open part 2 of R7).

## Decision

**Tabellify adopts its own brand palette through semantic design tokens, applied only inside
Tabellify's own workspace document. Light/dark is chosen with
`@media (prefers-color-scheme: dark)`, the same mechanism Zotero uses.** Concretely:

1. **Scope (option S-A).** Brand tokens apply in `workspace.xhtml` only: the Tabellify tab
   and the F001 fallback window. The **"Tabellify tags" item pane section stays
   Zotero-native.** It lives inside Zotero's own UI, so a branded block there would look
   foreign next to Zotero's Info, Tags and Notes sections. It would also need a stylesheet
   injected into the main window, which is a new lifecycle item. `reader-tags.js` is not touched.
2. **PRD §6 wording (owner to approve; applied after this ADR is accepted).** Replace
   "**Native feel.** Follow Zotero UI conventions; use documented plugin APIs." with:
   > **Native behaviour, Tabellify look.** Follow Zotero's interaction conventions (menus,
   > tabs, item pane sections, keyboard use, Fluent strings, the Color Scheme setting) and use
   > documented plugin APIs. Inside its own workspace, Tabellify uses its brand palette and
   > design tokens (ADR-0015). Anything shown inside Zotero's own panes stays Zotero-native.
3. **One token file, `src/content/tokens.css`**, loaded by `workspace.xhtml` before
   `workspace.css` (same `<linkset>` `<html:link rel="stylesheet">` form already used and
   verified for `workspace.css`). It has three layers:
   - **Primitives** (`--tabellify-palette-*`): the eight brand colours under their brand names,
     plus the derived shades this ADR proposes (table below). **Literal colours appear only
     here**, and only as 6-digit hex, so every colour is opaque.
   - **Semantic colour tokens** (`--tabellify-color-*`): defined in `:root` for light mode and
     redefined inside `@media (prefers-color-scheme: dark) { :root { … } }` for dark. Each one
     points to a primitive with `var(--tabellify-palette-…)`. Both blocks define the same names.
   - **Non-colour tokens** (no mode switch): spacing `--tabellify-space-1…6` (2, 4, 8, 12, 16,
     24 px), radii `--tabellify-radius-sm|md|pill` (4, 6, 12 px), font sizes
     `--tabellify-font-size-sm|md|lg` (em-based, relative to Zotero's UI font), row padding
     `--tabellify-row-pad-block|inline` (compact by default), border widths, motion
     `--tabellify-duration-fast` (120 ms, set to 0 ms under `prefers-reduced-motion: reduce`).
     The **font family is not branded**. Tabellify keeps the system UI font from `global.css`
     (native).
4. **Components use semantic tokens only.** `workspace.css` (and any later stylesheet)
   references `var(--tabellify-color-*)`, `transparent`, `currentColor` or `inherit` for every
   colour. It never uses a primitive and never a literal colour. To add a colour, add a
   primitive, then add a semantic token in both modes (see `docs/design-system.md`, written in
   005d).
5. **Page background on `#tabellify-workspace-main`, not on `:root`.** `global.css` keeps
   giving the root `<window>` its opaque native background. That avoids the see-through
   window (api-notes `global.css` row) and the macOS `appearance` of the fallback window. Our
   page surface paints on the main element, which already fills the tab.
6. **Dark/light mechanism: `@media (prefers-color-scheme: dark)`** (option M-1 below). No
   JavaScript, no pref reading, no listener, so nothing new to clean up (lifecycle rule 9).
7. **Static test changes** (replacing the F005c Q4 rule; details in the 005d spec):
   - Colour literals (`#…`, `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`,
     `color()`, CSS named colours) are **allowed only in `tokens.css`**, and there only as
     6-digit hex on `--tabellify-palette-*` declarations.
   - In `workspace.css`, every colour-bearing property (`color`, `background*`, `border*`,
     `outline*`, `box-shadow`, `text-decoration-color`, `caret-color`, `accent-color`, `fill`,
     `stroke`) may use only `var(--tabellify-color-*)`, `transparent`, `currentColor`,
     `inherit`, `none` and non-colour words and lengths. `--tabellify-palette-*` is forbidden there.
   - A background is still **forbidden on `:root` and `window`**. It is allowed elsewhere only
     as `var(--tabellify-color-*)` or `transparent`. Every token used as a background must
     resolve to an opaque hex in **both** modes.
   - Every semantic colour token is defined in both the light and the dark block. Every token
     used in `workspace.css` exists in `tokens.css`.
   - **Automated contrast test:** a pure Node test parses `tokens.css`, resolves each semantic
     token per mode, and checks the listed text/surface/accent pairs against 4.5:1 (text) or
     3:1 (non-text). No dependency: the WCAG formula is about 15 lines of JavaScript.
   - `global.css` still loads first, as the existing test already checks.
8. **No new dependency** (no CSS framework, preprocessor or design-token tool). Plain CSS
   custom properties, which Firefox has supported since version 31.

### Proposed primitives (brand + derived shades)
Derived shades exist because several brand colours fail contrast in one of the modes (next
section). The owner may change any hex. The contrast test then says whether the change still
passes.

| Primitive | Hex | Brand / derived | Used for |
|---|---|---|---|
| `--tabellify-palette-dark` | `#243036` | brand `--dark` | light: text; dark: page, header |
| `--tabellify-palette-gold` | `#bfa76f` | brand `--gold` | dark: group headers, header rule, caution |
| `--tabellify-palette-sage` | `#6e9075` | brand `--sage` | dark: chip borders (non-text only) |
| `--tabellify-palette-white` | `#ffffff` | brand `--white` | light: table and card surfaces |
| `--tabellify-palette-bg` | `#f5f7fa` | brand `--bg` | light: page, stripes; dark: text |
| `--tabellify-palette-teal` | `#004d43` | brand `--teal` | light: actions, ✓, header rule, selected bar; dark: selected row background |
| `--tabellify-palette-cyan` | `#00eaff` | brand `--cyan` | dark: focus ring |
| `--tabellify-palette-lime` | `#00e676` | brand `--lime` | dark: positive status |
| `--tabellify-palette-slate-800` | `#2d3b42` | derived (lighter slate) | dark: table/card surface |
| `--tabellify-palette-slate-700` | `#33424a` | derived | dark: alternate row |
| `--tabellify-palette-slate-600` | `#3a4a52` | derived | dark: row hover |
| `--tabellify-palette-slate-500` | `#3f4f57` | derived | dark: separators (decorative) |
| `--tabellify-palette-slate-200` | `#b8c4ca` | derived | dark: muted text |
| `--tabellify-palette-gray-100` | `#edf1f4` | derived | light: row hover |
| `--tabellify-palette-gray-200` | `#e9edf1` | derived | light: table header |
| `--tabellify-palette-gray-300` | `#d5dce2` | derived | light: separators (decorative) |
| `--tabellify-palette-gray-600` | `#56646c` | derived | light: muted text |
| `--tabellify-palette-gold-700` | `#7a6630` | derived (darker gold, same hue) | light: group headers, caution |
| `--tabellify-palette-sage-700` | `#4f6b55` | derived (darker sage) | light: chip borders, informational text |
| `--tabellify-palette-sage-300` | `#a8c4ae` | derived (lighter sage) | dark: ✓ cells (informational) |
| `--tabellify-palette-teal-300` | `#4db6a8` | derived (lighter teal) | dark: actions, active sort, selected bar |
| `--tabellify-palette-teal-50` | `#e3f0ee` | derived (teal tint) | light: selected row background |
| `--tabellify-palette-cyan-700` | `#00788a` | derived (darker cyan) | light: focus ring |
| `--tabellify-palette-lime-800` | `#00703a` | derived (darker green) | light: positive status |
| `--tabellify-palette-red-700` | `#b3261e` | conventional error | light: error |
| `--tabellify-palette-red-200` | `#ff8a80` | conventional error | dark: error |

### Proposed semantic tokens

| Semantic token | Light → primitive | Dark → primitive |
|---|---|---|
| `--tabellify-color-page` | `bg` | `dark` |
| `--tabellify-color-surface` (table body, cards) | `white` | `slate-800` |
| `--tabellify-color-surface-alt` (stripes) | `bg` | `slate-700` |
| `--tabellify-color-surface-hover` | `gray-100` | `slate-600` |
| `--tabellify-color-header` (table header) | `gray-200` | `dark` |
| `--tabellify-color-text` | `dark` | `bg` |
| `--tabellify-color-text-muted` | `gray-600` | `slate-200` |
| `--tabellify-color-heading-accent` (group headers, section headings) | `gold-700` | `gold` |
| `--tabellify-color-header-rule` (line under the header) | `teal` | `gold` |
| `--tabellify-color-border` (separators) | `gray-300` | `slate-500` |
| `--tabellify-color-border-strong` (group start, chip outline) | `sage-700` | `sage` |
| `--tabellify-color-action` (active sort, pressed toggle) | `teal` | `teal-300` |
| `--tabellify-color-selected-bg` | `teal-50` | `teal` |
| `--tabellify-color-selected-text` | `dark` | `bg` |
| `--tabellify-color-selected-bar` | `teal` | `teal-300` |
| `--tabellify-color-focus-ring` | `cyan-700` | `cyan` |
| `--tabellify-color-status-info` (✓ "Used") | `teal` | `sage-300` |
| `--tabellify-color-status-positive` | `lime-800` | `lime` |
| `--tabellify-color-status-caution` (remaining / review) | `gold-700` | `gold` |
| `--tabellify-color-status-error` | `red-700` | `red-200` |

Status colours never stand alone. ✓ is a glyph and has Fluent text ("Used" / "Not used").
"Remaining" chips are dashed (already). Errors get a "!" mark and bold text. Positive
k/M gets a "✓" suffix (spec Q6).

### WCAG contrast check
Ratios computed by hand with the WCAG 2.2 relative-luminance formula (sRGB). Rounding is
about ±0.02. The automated test (005d AC12) recomputes them. Thresholds: **text 4.5:1**,
**non-text/large bold 3:1** (borders, focus rings, the ✓ glyph, selection bar).

**Raw brand pairs (why derived shades are needed):**

| Pair | Ratio | Text 4.5 | Non-text 3 |
|---|---|---|---|
| dark `#243036` on white | 13.54 | pass | pass |
| dark on bg `#f5f7fa` | 12.62 | pass | pass |
| teal `#004d43` on white | 9.80 | pass | pass |
| teal on bg | 9.13 | pass | pass |
| **gold `#bfa76f` on white** | **2.34** | **FAIL** | **FAIL** |
| **gold on bg** | **2.18** | **FAIL** | **FAIL** |
| **sage `#6e9075` on white** | **3.55** | **FAIL** | pass |
| sage on bg | 3.31 | FAIL | pass |
| **cyan `#00eaff` on white** | **1.48** | **FAIL** | **FAIL** |
| **lime `#00e676` on white** | **1.67** | **FAIL** | **FAIL** |
| white / bg on dark | 13.54 / 12.62 | pass | pass |
| gold on dark | 5.78 | pass | pass |
| cyan on dark | 9.16 | pass | pass |
| lime on dark | 8.11 | pass | pass |
| **sage on dark** | **3.81** | **FAIL** | pass |
| **teal on dark** | **1.38** | **FAIL** | **FAIL** |
| teal on slate-800 `#2d3b42` | 1.18 | FAIL | FAIL |

Consequences: in **light mode**, gold, cyan and lime cannot be used as text or rings on light
surfaces, so they get darker shades (`gold-700`, `cyan-700`, `lime-800`). Sage text gets
`sage-700`. In **dark mode**, teal cannot be text or a ring on slate, so actions use
`teal-300`. Teal stays as a *background* (selected row) with light text on it. Sage text
uses `sage-300`.

**Light mode, proposed semantic pairs:**

| Foreground → background | Ratio | Needs | Result |
|---|---|---|---|
| text `dark` → page `bg` | 12.62 | 4.5 | pass |
| text → surface `white` | 13.54 | 4.5 | pass |
| text → stripe `bg` | 12.62 | 4.5 | pass |
| text → hover `gray-100` | 11.92 | 4.5 | pass |
| text → header `gray-200` | 11.51 | 4.5 | pass |
| text-muted `gray-600` → white / bg / header | 6.11 / 5.70 / 5.20 | 4.5 | pass |
| heading-accent `gold-700` → white / bg / header | 5.57 / 5.19 / 4.73 | 4.5 | pass |
| action `teal` → header / white | 8.33 / 9.80 | 4.5 | pass |
| status-info `teal` (✓) → white / stripe / hover / selected | 9.80 / 9.13 / 8.63 / 8.38 | 4.5 | pass |
| status-positive `lime-800` → white / bg | 6.22 / 5.79 | 4.5 | pass |
| status-caution `gold-700` → white / bg | 5.57 / 5.19 | 4.5 | pass |
| status-error `red-700` → white / bg | 6.54 / 6.09 | 4.5 | pass |
| selected-text `dark` → selected-bg `teal-50` | 11.58 | 4.5 | pass |
| selected-bar `teal` → `teal-50` | 8.38 | 3 | pass |
| focus-ring `cyan-700` → white / bg / header / selected | 5.18 / 4.83 / 4.40 / 4.43 | 3 | pass |
| header-rule `teal` → header | 8.33 | 3 | pass |
| border-strong `sage-700` → white | 5.89 | 3 | pass |

**Dark mode, proposed semantic pairs:**

| Foreground → background | Ratio | Needs | Result |
|---|---|---|---|
| text `bg` → page `dark` / header `dark` | 12.62 | 4.5 | pass |
| text → surface `slate-800` | 10.78 | 4.5 | pass |
| text → stripe `slate-700` | 9.69 | 4.5 | pass |
| text → hover `slate-600` | 8.58 | 4.5 | pass |
| text-muted `slate-200` → page / surface / stripe / hover | 7.60 / 6.49 / 5.84 / 5.17 | 4.5 | pass |
| heading-accent `gold` → header `dark` | 5.78 | 4.5 | pass |
| heading-accent `gold` → surface (cards) | 4.94 | 4.5 | pass |
| action `teal-300` → header / surface | 5.53 / 4.72 | 4.5 | pass |
| status-info `sage-300` (✓) → surface / stripe / hover / selected `teal` | 6.15 / 5.53 / 4.90 / 5.21 | 4.5 | pass |
| status-positive `lime` → surface / stripe | 6.93 / 6.23 | 4.5 | pass |
| status-caution `gold` → surface / page | 4.94 / 5.78 | 4.5 | pass |
| **status-caution `gold` → stripe / hover** | **4.44 / 3.93** | 4.5 | **FAIL (text)**, pass 3:1 |
| status-error `red-200` → surface / stripe / page | 5.07 / 4.56 / 5.93 | 4.5 | pass |
| selected-text `bg` → selected-bg `teal` | 9.13 | 4.5 | pass |
| selected-bar `teal-300` → surface / `teal` | 4.72 / 4.00 | 3 | pass |
| focus-ring `cyan` → page / surface / stripe / selected `teal` | 9.16 / 7.83 / 7.04 / 6.63 | 3 | pass |
| header-rule `gold` → surface | 4.94 | 3 | pass |
| border-strong `sage` → surface | 3.25 | 3 | pass (narrow margin) |

**Flagged:** dark-mode gold text on striped or hovered rows fails 4.5:1. Rule: caution text
is not used inside table rows. In phase 1 it appears only in the tag monitor and status lines,
on `surface` or `page`. If a later feature needs caution text in rows, add a lighter
`gold-300` shade. Separators (`gray-300`, `slate-500`) are decorative. WCAG does not require
3:1 for lines that aren't needed to identify a control. Cells stay readable without them.

## Alternatives considered

**Where the brand applies**

| Option | Pros | Cons |
|---|---|---|
| **S-A. Workspace document only; reader section stays native (recommended)** | Our CSS never leaves our own document, so no clash with Zotero and no new lifecycle item. The reader section matches the Zotero panes around it | Two looks: branded tab, native section. The owner's brand is not visible while reading |
| S-B. Workspace + reader item-pane section | One look everywhere | The section is Zotero DOM. It needs a stylesheet injected into every main window (add in `onMainWindowLoad`, remove in unload/shutdown) or inline styles. Brand surfaces inside Zotero's pane look foreign. Zotero's item pane CSS is internal and changed in Z7, so the risk is higher |
| S-C. Stay fully native (status quo) | Zero work. Always matches Zotero | Does not meet the owner's brief |
| S-D. Native surfaces + brand accents only (system `-moz-Dialog`/`Canvas` surfaces; gold/teal/cyan only for headers, selection, focus) | Small change. Surfaces always match Zotero | No "dark slate foundation". Brand accents on system greys must pass contrast against colours we don't control (system colours differ per OS), so the contrast test can't prove them |

**How light/dark is detected**

| Option | Pros | Cons |
|---|---|---|
| **M-1. `@media (prefers-color-scheme: dark)` in `tokens.css` (recommended)** | Same mechanism as Zotero's own theme (source-verified). Follows Zotero's Color Scheme setting (Automatic/Light/Dark). Pure CSS: no JS, no listener, nothing to clean up. Easy to test statically | Depends on our iframe being a chrome docshell (by construction; RT-D1). Whether a live switch updates an open tab is RT-D2 |
| M-2. CSS `light-dark(light, dark)` per token + `color-scheme: light dark` | One line per token | Resolves against the element's *used* `color-scheme`. What `color-scheme` our chrome document ends up with is UNVERIFIED. Firefox's `global-shared.css` uses it in chrome, but with its own `--toolbar-color-scheme` handling. Harder to parse in the static test |
| M-3. JS reads `browser.theme.toolbar-theme` and sets `data-theme` on the root | Explicit | Needs a pref observer (lifecycle), and "Automatic" still needs `matchMedia`. Duplicates what Gecko already does. Reads a Mozilla pref Zotero owns |
| M-4. Tabellify's own theme setting, independent of Zotero | User choice | Surprising (Zotero dark, Tabellify light). Needs a pref, UI and Fluent strings. Not asked for |

**How tokens are organised**

| Option | Pros | Cons |
|---|---|---|
| **T-1. One `tokens.css`: primitives + semantic light/dark + non-colour tokens (recommended)** | One place to read and change. The static test has one file to parse. Matches the brief ("centralized tokens") | The file grows with each feature (fine at this size) |
| T-2. Tokens at the top of `workspace.css` | No new file | Every future stylesheet (F006 table builder, saved tables) would need to import `workspace.css` or copy the tokens |
| T-3. Tokens in JSON, generated into CSS by a build step | Tool-friendly | Needs a build step or dependency (ADR-0003). Over-engineered for about 50 tokens |

## Consequences
- **Easier:** consistent look across features. New UI uses `var(--tabellify-color-…)` and
  gets both modes for free. Contrast is checked by a test, not by eye.
- **Harder:** colours are now ours to maintain. If Zotero changes its own look, the tab won't
  follow automatically, except for light/dark, which still follows the setting. The
  workspace looks different from Zotero's native panes, as the owner intends.
- **Riskier:**
  - If RT-D1 shows that `prefers-color-scheme` in our iframe does **not** follow Zotero's
    setting (for example, it follows the OS while Zotero is forced to Light), the tab could
    show dark brand surfaces inside a light Zotero. Fallback: M-3 (JS + pref observer), via a
    new ADR revision.
  - **Windows high-contrast mode:** Gecko does not force colours in chrome documents
    (`PreferenceSheet.cpp` comment "Chrome documents always use system colors, not stand-ins,
    not forced"), so brand colours stay in high-contrast mode, as Zotero's own colours do.
    Possible later: a `@media (prefers-contrast: more)` block mapping semantic tokens to
    system colours (`Canvas`, `CanvasText`).
  - Native form controls (buttons, `<select>`, inputs, checkbox) keep their system look on
    brand surfaces in phase 1 (spec Q4). They follow light/dark through the chrome colour
    scheme, so they should look right on both page colours. The owner checks this in the
    smoke test.
- **Superseded guidance:** `docs/zotero-api-notes.md` "System colours" row says "The plugin
  should not set `background-color` itself". If this ADR is accepted, that applies only to
  `:root`/`window`. Elsewhere, token backgrounds are the rule. The F005c Q4 test rule is replaced.
- **Follow-up if accepted:** apply the PRD §6 wording. Update `docs/architecture.md` §3 (add
  `tokens.css`) and §4 (note: workspace branded, item pane section native). Build Feature
  005d. Write `docs/design-system.md` (in 005d).
- **Revisit when:** RT-D1 or RT-D2 fail; the owner wants the brand in the reader section
  (S-B); Zotero ships an official theming API for plugins; a second table (F006) needs the
  shared table style (extract a reusable renderer then).

## Open questions for the owner
1. **Scope: S-A (workspace only, recommended) or S-B (also the reader item pane section)?**
2. **PRD §6 wording** above: OK as written?
3. **Derived shades** (`gold-700`, `cyan-700`, `lime-800`, `teal-300`, `sage-300`/`-700`,
   slates and grays): OK as a start? Each can be changed later. The contrast test keeps every
   change honest.
4. **Light-mode focus ring:** darker cyan `#00788a` (recommended, 4.4–5.2:1), or a two-tone
   ring (brand cyan outside, slate inside), which shows the brand cyan but is visually heavier?
5. **Run RT-D1 before deciding?** It is read-only and works with the current build
   (`docs/zotero-api-notes.md`, "F005d runtime checks"). *Recommended:* yes. A pass removes the
   main risk of M-1.
