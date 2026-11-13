/* Tabellify — script-suggest-model.js (Feature 006b: suggestions for the tag script box)
 *
 * While the user types in the "Tags and groups" box, the workspace shows a list of
 * suggestions under it. This file decides WHAT the list contains and WHAT accepting an
 * option does to the text; workspace.js only draws the list and handles keys.
 *
 *   prepare(tags)                    → an index of the library's tag names (once per load)
 *   suggest(index, token, context)   → the options for the token being typed
 *   accept(text, token, option)      → the new text of the box and the new cursor position
 *   fold(name)                       → the lower-case, accent-free form used for matching
 *
 * FOLDING: to compare "Heat" with "heat" and "é" with "e", both are turned into a simple
 * form: `normalize("NFD")` splits "é" into "e" + a combining accent mark, the regular
 * expression /\p{M}/gu removes every such mark (\p{M} = Unicode "Mark"; the `u` flag turns
 * on Unicode mode), and toLowerCase() does the rest. Folding is only for FINDING matches;
 * the name put into the box is always the library's exact spelling.
 *
 * IDENTITY stays exact and case-sensitive (Zotero's and the codebook's rule): "Heat index"
 * in the codebook does not hide the different library tag "heat index".
 *
 * Nothing here reads or writes the Zotero library: `prepare` receives the plain array that
 * workspace.js got from Zotero.Tags.getAll (a read). "Create tag" only puts text into the
 * box; the name reaches the codebook (never Zotero) when the user presses Enter.
 *
 * PURE: no Zotero, DOM, IOUtils or PathUtils globals (tests/unit/script-suggest-model.test.mjs
 * runs it in Node). Loaded after tag-script-model.js, whose `clean` it uses.
 */
"use strict";

var TabellifyScriptSuggest = {
  /** At most this many options are shown. */
  LIMIT: 50,

  /** At most this many group options. */
  GROUP_LIMIT: 5,

  /**
   * The case- and accent-insensitive form of a name (for matching only).
   * @param {string} name
   */
  fold(name) {
    return String(name).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  },

  /**
   * Build the searchable index from `Zotero.Tags.getAll` output: `[{ tag, type }]`, where
   * type 0 = manual and 1 = automatic. Only names used at least once as a manual tag are
   * kept (Tabellify counts only manual tags). Names with `"` cannot be written in the
   * script, so they are left out and counted (for Debug Output). Sorted once, alphabetically.
   * @param {Array<{ tag?: unknown, type?: unknown }>} tags
   * @returns {LibraryIndex}
   */
  prepare(tags) {
    const manual = new Set();
    const quoted = new Set();
    for (const t of Array.isArray(tags) ? tags : []) {
      if (!t || typeof t.tag !== "string") continue;
      if ((t.type ?? 0) !== 0) continue; // automatic tag
      const name = TabellifyTagScript.clean(t.tag);
      if (name === "") continue;
      if (name.includes('"')) {
        quoted.add(name);
        continue;
      }
      manual.add(name);
    }
    // Intl.Collator: a reusable, language-aware string comparison. "base" sensitivity
    // ignores case and accents; numeric: true sorts "tag 2" before "tag 10".
    const compare = new Intl.Collator(undefined, { sensitivity: "base", numeric: true }).compare;
    const sorted = [...manual].sort((a, b) => compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
    return {
      entries: sorted.map((name) => ({ name, fold: this.fold(name) })),
      names: manual,
      skippedQuote: quoted.size,
    };
  },

  /**
   * The options for the token being typed: group names first (top level only), then
   * library tags that START with the typed text, then those that CONTAIN it (alphabetical
   * inside each part), then "Create tag" last when the typed name is new. Tags already in
   * the codebook are never offered.
   *
   * @param {LibraryIndex | null} index  From prepare(); null = not loaded (no tag options)
   * @param {import("./tag-script-model.js").ScriptToken | null} token  From tokenAt()
   * @param {{ codebookTags: Set<string>, groupNames: string[], browse?: boolean }} context
   *   `browse`: the user pressed ↓ in an empty token, so list the first tags alphabetically.
   * @param {number} [limit]
   * @returns {SuggestOption[]}
   */
  suggest(index, token, context, limit = this.LIMIT) {
    if (!token) return [];
    const entries = index?.entries ?? [];
    const names = index?.names ?? new Set();
    const codebookTags = context?.codebookTags ?? new Set();
    const groupNames = Array.isArray(context?.groupNames) ? context.groupNames : [];

    if (token.prefix === "") {
      if (!context?.browse) return [];
      /** @type {SuggestOption[]} */
      const first = [];
      for (const e of entries) {
        if (first.length >= limit) break;
        if (!codebookTags.has(e.name)) first.push({ kind: "tag", name: e.name });
      }
      return first;
    }

    const needle = this.fold(token.prefix);
    /** @type {SuggestOption[]} */
    const groups = [];
    if (!token.inGroup) {
      for (const g of groupNames) {
        if (groups.length >= this.GROUP_LIMIT) break;
        if (this.fold(g).startsWith(needle)) groups.push({ kind: "group", name: g });
      }
    }

    const value = token.value ?? token.prefix;
    const create = value !== "" && !names.has(value) && !codebookTags.has(value);
    const tagLimit = Math.max(0, limit - groups.length - (create ? 1 : 0));

    // One pass over the (already sorted) index: both lists come out alphabetical.
    const starts = [];
    const contains = [];
    for (const e of entries) {
      if (starts.length >= tagLimit) break;
      if (codebookTags.has(e.name)) continue;
      if (e.fold.startsWith(needle)) starts.push({ kind: "tag", name: e.name });
      else if (contains.length < tagLimit && e.fold.includes(needle)) contains.push({ kind: "tag", name: e.name });
    }
    const options = [...groups, ...[...starts, ...contains].slice(0, tagLimit)];
    if (create) options.push({ kind: "create", name: value });
    return options.slice(0, limit);
  },

  /**
   * Put an accepted option into the text: only `text.slice(token.start, token.end)` is
   * replaced. A name with `,` `(` or `)` is written in quotes, so the line parses the same
   * way as if it had been typed by hand. Nothing else is added (spec Q9).
   *   tag    → the name; cursor after it
   *   group  → `Name(`; cursor after the bracket (the list then reopens for its tags)
   *   create → the cleaned typed name; cursor after it
   * @param {string} text
   * @param {import("./tag-script-model.js").ScriptToken} token
   * @param {SuggestOption} option
   * @returns {{ text: string, cursor: number }}
   */
  accept(text, token, option) {
    const s = String(text ?? "");
    const name = String(option?.name ?? "");
    // A name with a quote cannot be written in the script (prepare() drops them already).
    if (name === "" || name.includes('"')) return { text: s, cursor: token.end };
    let insert = /[,()]/.test(name) ? `"${name}"` : name;
    if (option.kind === "group") insert += "(";
    return {
      text: s.slice(0, token.start) + insert + s.slice(token.end),
      cursor: token.start + insert.length,
    };
  },
};

/**
 * @typedef {{ entries: Array<{ name: string, fold: string }>, names: Set<string>,
 *   skippedQuote: number }} LibraryIndex
 * @typedef {{ kind: "group" | "tag" | "create", name: string }} SuggestOption
 */
