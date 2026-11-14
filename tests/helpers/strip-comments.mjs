// Shared by the static guards (tests/static/*.test.mjs): remove comments before scanning
// source text, so teaching comments may name the APIs or patterns a guard forbids.
// Kept in a helper (not imported from another .test.mjs file) because importing a test
// file would also run its tests a second time.

/**
 * Remove comments: JS `//` and `/* *\/`, XML `<!-- -->`, Fluent `#` lines.
 * @param {string} text
 * @param {string} ext  File extension, e.g. ".js"
 */
export function stripComments(text, ext) {
  if (ext === ".ftl") return text.replace(/^\s*#.*$/gm, "");
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // `//` line comments, but not the `//` inside URLs such as chrome://
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}
