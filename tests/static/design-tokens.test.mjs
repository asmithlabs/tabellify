// Feature 005d (ADR-0015): checks on the design-token file src/content/tokens.css.
//   AC10: token file shape (primitives are 6-digit hex, colour literals only there, every
//         semantic colour token defined in light AND dark, brand hex values, reduced motion)
//   AC12: WCAG 2.2 contrast of the listed semantic pairs in both modes
//
// tokens.css follows a simple "parsing contract" (stated at its top), so plain regular
// expressions are enough here. No dependency: the WCAG formula is a few lines below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const tokensCss = readFileSync(join(srcDir, "content", "tokens.css"), "utf8");

/**
 * Split tokens.css into its parts.
 * @param {string} cssText
 */
function parseTokens(cssText) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  // The dark block: `@media (prefers-color-scheme: dark) { :root { … } }`.
  const darkRe = /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([^{}]*)\}\s*\}/g;
  const darkBlocks = [...css.matchAll(darkRe)].map((m) => m[1]);
  const motionRe = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{\s*:root\s*\{([^{}]*)\}\s*\}/g;
  const motionBlocks = [...css.matchAll(motionRe)].map((m) => m[1]);
  // Top-level :root blocks (the @media blocks removed first).
  const top = css.replace(darkRe, "").replace(motionRe, "");
  const rootBlocks = [...top.matchAll(/:root\s*\{([^{}]*)\}/g)].map((m) => m[1]);
  /** @param {string} block */
  const decls = (block) => {
    const map = new Map();
    for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]*);/g)) map.set(m[1], m[2].trim());
    return map;
  };
  const primitives = new Map();
  const light = new Map();
  const other = new Map();
  for (const block of rootBlocks) {
    for (const [name, value] of decls(block)) {
      if (name.startsWith("--tabellify-palette-")) primitives.set(name, value);
      else if (name.startsWith("--tabellify-color-")) light.set(name, value);
      else other.set(name, value);
    }
  }
  return {
    css,
    rootBlocks,
    primitives,
    light,
    other,
    darkBlocks,
    dark: decls(darkBlocks[0] ?? ""),
    motion: motionBlocks.map(decls),
  };
}

const tokens = parseTokens(tokensCss);

/**
 * Resolve a semantic token (short name, e.g. "surface") to its hex value in a mode.
 * @param {"light"|"dark"} mode
 * @param {string} short
 */
function resolve(mode, short) {
  const value = tokens[mode].get(`--tabellify-color-${short}`);
  assert.ok(value, `--tabellify-color-${short} not defined in ${mode} mode`);
  const prim = /^var\(\s*(--tabellify-palette-[\w-]+)\s*\)$/.exec(value)?.[1];
  assert.ok(prim, `--tabellify-color-${short} (${mode}) is not var(--tabellify-palette-…): ${value}`);
  const hex = tokens.primitives.get(prim);
  assert.ok(hex, `${prim} (used by --tabellify-color-${short}, ${mode}) is not defined`);
  return hex;
}

// ---------------------------------------------------------------------------------------
// WCAG 2.2 contrast ratio (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio)
// ---------------------------------------------------------------------------------------

/** Relative luminance of a #rrggbb colour. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    // sRGB → linear light (threshold 0.04045, WCAG 2.2 note on the older 0.03928 value).
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two #rrggbb colours, 1 to 21. */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every pair marked "pass" in ADR-0015's light and dark tables. min 4.5 = text,
// 3 = non-text (borders, focus rings, the selection bar, the header rule).
const LIGHT_PAIRS = [
  ["text", "page", 4.5], ["text", "surface", 4.5], ["text", "surface-alt", 4.5],
  ["text", "surface-hover", 4.5], ["text", "header", 4.5],
  ["text-muted", "surface", 4.5], ["text-muted", "page", 4.5], ["text-muted", "header", 4.5],
  ["heading-accent", "surface", 4.5], ["heading-accent", "page", 4.5], ["heading-accent", "header", 4.5],
  ["action", "header", 4.5], ["action", "surface", 4.5],
  ["status-info", "surface", 4.5], ["status-info", "surface-alt", 4.5],
  ["status-info", "surface-hover", 4.5], ["status-info", "selected-bg", 4.5],
  ["status-positive", "surface", 4.5], ["status-positive", "page", 4.5],
  ["status-caution", "surface", 4.5], ["status-caution", "page", 4.5],
  ["status-error", "surface", 4.5], ["status-error", "page", 4.5],
  ["selected-text", "selected-bg", 4.5],
  ["selected-bar", "selected-bg", 3],
  ["focus-ring", "surface", 3], ["focus-ring", "page", 3], ["focus-ring", "header", 3], ["focus-ring", "selected-bg", 3],
  ["header-rule", "header", 3],
  ["border-strong", "surface", 3],
];

const DARK_PAIRS = [
  ["text", "page", 4.5], ["text", "header", 4.5], ["text", "surface", 4.5],
  ["text", "surface-alt", 4.5], ["text", "surface-hover", 4.5],
  ["text-muted", "page", 4.5], ["text-muted", "surface", 4.5],
  ["text-muted", "surface-alt", 4.5], ["text-muted", "surface-hover", 4.5],
  ["heading-accent", "header", 4.5], ["heading-accent", "surface", 4.5],
  ["action", "header", 4.5], ["action", "surface", 4.5],
  ["status-info", "surface", 4.5], ["status-info", "surface-alt", 4.5],
  ["status-info", "surface-hover", 4.5], ["status-info", "selected-bg", 4.5],
  ["status-positive", "surface", 4.5], ["status-positive", "surface-alt", 4.5],
  ["status-caution", "surface", 4.5], ["status-caution", "page", 4.5],
  ["status-error", "surface", 4.5], ["status-error", "surface-alt", 4.5], ["status-error", "page", 4.5],
  ["selected-text", "selected-bg", 4.5],
  ["selected-bar", "surface", 3], ["selected-bar", "selected-bg", 3],
  ["focus-ring", "page", 3], ["focus-ring", "surface", 3], ["focus-ring", "surface-alt", 3], ["focus-ring", "selected-bg", 3],
  ["header-rule", "surface", 3],
  ["border-strong", "surface", 3],
];

// KNOWN EXCEPTIONS (ADR-0015, "Flagged"): dark-mode gold caution text on striped or
// hovered rows passes only 3:1, not 4.5:1. Rule: caution TEXT is never used inside table
// rows. If a feature needs it there, add a lighter gold-300 shade instead of lowering this.
const DARK_KNOWN_EXCEPTIONS = [
  ["status-caution", "surface-alt", 3],
  ["status-caution", "surface-hover", 3],
];

// ---------------------------------------------------------------------------------------
// AC10: the token file
// ---------------------------------------------------------------------------------------

test("AC10: every primitive is a lower-case 6-digit hex colour, all in the first :root block", () => {
  assert.ok(tokens.primitives.size >= 8, "primitives not found (check is vacuous)");
  for (const [name, value] of tokens.primitives) assert.match(value, /^#[0-9a-f]{6}$/, `${name}: ${value}`);
  const first = tokens.rootBlocks[0] ?? "";
  for (const name of tokens.primitives.keys()) assert.ok(first.includes(`${name}:`), `${name} is not in the first :root block`);
  for (const block of tokens.rootBlocks.slice(1)) assert.doesNotMatch(block, /--tabellify-palette-[\w-]+\s*:/, "primitive outside the first :root block");
  assert.doesNotMatch(tokens.darkBlocks.join(""), /--tabellify-palette-[\w-]+\s*:/, "primitive in the dark block");
});

test("AC10: the eight brand colours exist with the owner's hex values", () => {
  const brand = {
    dark: "#243036", gold: "#bfa76f", sage: "#6e9075", white: "#ffffff",
    bg: "#f5f7fa", teal: "#004d43", cyan: "#00eaff", lime: "#00e676",
  };
  for (const [name, hex] of Object.entries(brand)) {
    assert.equal(tokens.primitives.get(`--tabellify-palette-${name}`), hex, name);
  }
});

test("AC10: no colour literal outside --tabellify-palette-* declarations", () => {
  const lines = tokens.css.split("\n").filter((l) => !/^\s*--tabellify-palette-[\w-]+\s*:/.test(l));
  const rest = lines.join("\n");
  assert.doesNotMatch(rest, /#[0-9a-fA-F]{3,8}\b/, "hex colour outside a primitive");
  assert.doesNotMatch(rest, /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i, "colour function in tokens.css");
  assert.doesNotMatch(tokens.css, /@import/, "no @import (parsing contract)");
  // Named colours (red, white, …) are caught by shape: a non-colour token holds only a
  // number with a unit, so a word there fails.
  for (const [name, value] of tokens.other) {
    assert.match(value, /^-?\d+(?:\.\d+)?(?:px|em|rem|ms|s|%)?$/, `${name}: ${value} is not a plain length/number`);
  }
});

test("AC10: light and dark define the same semantic colour tokens, each pointing at a primitive", () => {
  assert.equal(tokens.darkBlocks.length, 1, "exactly one @media (prefers-color-scheme: dark) { :root { … } } block");
  const light = [...tokens.light.keys()].sort();
  const dark = [...tokens.dark.keys()].sort();
  assert.ok(light.length >= 20, "semantic tokens not found (check is vacuous)");
  assert.deepEqual(dark, light, "light and dark blocks must define the same --tabellify-color-* names");
  for (const name of light) {
    const short = name.replace("--tabellify-color-", "");
    assert.match(resolve("light", short), /^#[0-9a-f]{6}$/);
    assert.match(resolve("dark", short), /^#[0-9a-f]{6}$/);
  }
  // Only semantic colour tokens in the dark block.
  for (const name of tokens.dark.keys()) assert.match(name, /^--tabellify-color-/);
});

test("AC10: prefers-reduced-motion: reduce sets --tabellify-duration-fast to 0ms", () => {
  assert.ok(tokens.other.has("--tabellify-duration-fast"), "--tabellify-duration-fast missing");
  assert.ok(tokens.motion.some((m) => m.get("--tabellify-duration-fast") === "0ms"), "no reduced-motion override");
});

// ---------------------------------------------------------------------------------------
// AC12: contrast
// ---------------------------------------------------------------------------------------

test("AC12: self-check of the contrast formula", () => {
  assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 1e-9, "black on white must be 21:1");
  assert.ok(contrast("#bfa76f", "#ffffff") < 3, "brand gold on white must be below 3:1");
  assert.ok(Math.abs(contrast("#243036", "#ffffff") - 13.54) < 0.05, "dark on white ≈ 13.54 (ADR-0015)");
});

for (const [mode, pairs] of [["light", LIGHT_PAIRS], ["dark", DARK_PAIRS], ["dark", DARK_KNOWN_EXCEPTIONS]]) {
  test(`AC12: ${mode} mode contrast pairs${pairs === DARK_KNOWN_EXCEPTIONS ? " (known exceptions, 3:1 only)" : ""}`, () => {
    const failures = [];
    for (const [fg, bg, min] of pairs) {
      const ratio = contrast(resolve(mode, fg), resolve(mode, bg));
      if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
    }
    assert.deepEqual(failures, []);
  });
}
