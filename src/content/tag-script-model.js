/* Tabellify — tag-script-model.js (Feature 006a: the tag script parser)
 *
 * The workspace's "Tags and groups" box takes one line such as
 *   Exposure(heat index, temperature), age, Outcomes(hospitalization)
 * and this file turns it into a list of items for TabellifyCodebook.applyScript():
 *   [{ kind: "group", name: "Exposure", tags: ["heat index", "temperature"] },
 *    { kind: "tag", name: "age" },
 *    { kind: "group", name: "Outcomes", tags: ["hospitalization"] }]
 *
 * A PARSER is a function that reads text and turns it into structured data, or reports the
 * first mistake with its position. This one is hand-written: it walks the text once, from
 * left to right, with an index `i` (so even a 10 000-character line is fast). It never
 * evaluates anything; it only splits text. Every name stays plain text.
 *
 * Syntax (spec F006a, "Tag script syntax"):
 *   entry  := item ( "," item )* [ "," ]          one trailing comma at the very end is ignored
 *   item   := name                                one tag, ungrouped
 *           | name "(" [ name ( "," name )* ] ")" a group and its tags; "G()" = empty group
 *   name   := bare | quoted
 *   bare   := characters other than , ( ) "      trimmed at both ends; inner spaces kept
 *   quoted := '"' characters other than " '"'    for names with , or ( ) in them
 * Every name is cleaned like a Zotero tag name: `.trim().normalize()` (Unicode NFC), and
 * stays case-sensitive. The same group named twice (ignoring case) merges into the first.
 * Input made only of spaces and commas is an "empty entry": `{ ok: true, items: [] }`, and
 * the workspace simply does nothing.
 *
 * Result: `{ ok: true, items }` or `{ ok: false, error, start, end }`, where `error` is a
 * Fluent ID (tabellify.ftl) and start/end are character offsets of the problem, so the
 * workspace can select that part of the box with input.setSelectionRange(start, end).
 *
 * PURE: no Zotero, DOM, IOUtils or PathUtils globals (tests/unit/tag-script-model.test.mjs
 * runs it in Node).
 */
"use strict";

var TabellifyTagScript = {
  // Fluent IDs of the parse errors.
  ERR_UNBALANCED: "tabellify-script-error-unbalanced",
  ERR_EMPTY_TAG: "tabellify-script-error-empty-tag",
  ERR_EMPTY_GROUP: "tabellify-script-error-empty-group",
  ERR_NESTED: "tabellify-script-error-nested",
  ERR_MISSING_COMMA: "tabellify-script-error-missing-comma",
  ERR_UNCLOSED_QUOTE: "tabellify-script-error-unclosed-quote",
  ERR_DUPLICATE: "tabellify-script-error-duplicate",

  /**
   * @param {string} text  What the user typed (untrusted)
   * @returns {{ ok: true, items: ScriptItem[] }
   *   | { ok: false, error: string, start: number, end: number }}
   */
  parse(text) {
    const s = String(text ?? "");
    const n = s.length;
    // Only spaces and commas: nothing to add.
    if (/^[\s,]*$/.test(s)) return { ok: true, items: [] };

    let i = 0;
    const isSpace = (c) => c !== undefined && /\s/.test(c);
    const skipSpace = () => {
      while (i < n && isSpace(s[i])) i++;
    };
    const fail = (error, start, end) => ({ ok: false, error, start, end: Math.max(end, start) });

    /** The rest of an unexpected token, for highlighting: up to the next , ( ) or the end. */
    const tokenEnd = (from) => {
      let j = from;
      while (j < n && !",()".includes(s[j])) j++;
      while (j > from + 1 && isSpace(s[j - 1])) j--;
      return Math.max(j, from + 1);
    };

    /**
     * Read one name at `i`. Leaves `i` just after it (before any following spaces).
     * @returns {{ value: string, start: number, end: number, slotStart: number } | { error: object }}
     */
    const readName = () => {
      const slotStart = i;
      skipSpace();
      if (s[i] === '"') {
        const close = s.indexOf('"', i + 1);
        if (close === -1) return { error: fail(this.ERR_UNCLOSED_QUOTE, i, n) };
        const start = i;
        i = close + 1;
        return { value: this.clean(s.slice(start + 1, close)), start, end: i, slotStart };
      }
      const rawStart = i;
      while (i < n && !',()"'.includes(s[i])) i++;
      // Trimmed positions, so a duplicate or error selects just the name.
      let start = rawStart;
      let end = i;
      while (end > start && isSpace(s[end - 1])) end--;
      return { value: this.clean(s.slice(start, end)), start, end, slotStart };
    };

    /**
     * Where to point for an empty name: the spaces it consists of, or else the separator
     * just before it (`,` or `(`), or else the one just after it.
     */
    const emptyRange = (slotStart) => {
      if (i > slotStart) return [slotStart, i];
      if (slotStart > 0) return [slotStart - 1, slotStart];
      return [slotStart, Math.min(slotStart + 1, n)];
    };

    /** @type {ScriptItem[]} */
    const items = [];
    const groupsByName = new Map(); // lower-case name → the group item (merging)
    const seenTags = new Set();
    const takeTag = (name) => {
      if (seenTags.has(name.value)) return fail(this.ERR_DUPLICATE, name.start, name.end);
      seenTags.add(name.value);
      return null;
    };

    for (;;) {
      const name = readName();
      if (name.error) return name.error;
      const afterName = i;
      skipSpace();

      if (s[i] === ")") return fail(this.ERR_UNBALANCED, i, i + 1);

      if (s[i] === "(") {
        // A group.
        const open = i;
        if (name.value === "") return fail(this.ERR_EMPTY_GROUP, open, open + 1);
        i++;
        let group = groupsByName.get(name.value.toLowerCase());
        if (!group) {
          group = { kind: "group", name: name.value, tags: [] };
          groupsByName.set(name.value.toLowerCase(), group);
          items.push(group);
        }
        skipSpace();
        if (s[i] === ")") {
          i++; // "G()": an empty group
        } else {
          for (;;) {
            const tag = readName();
            if (tag.error) return tag.error;
            const tagEnd = i;
            skipSpace();
            if (i >= n) return fail(this.ERR_UNBALANCED, open, n);
            if (s[i] === "(") return fail(this.ERR_NESTED, tag.value === "" ? i : tag.start, i + 1);
            if (tag.value === "") {
              i = tagEnd;
              const [a, b] = emptyRange(tag.slotStart);
              return fail(this.ERR_EMPTY_TAG, a, b);
            }
            const dup = takeTag(tag);
            if (dup) return dup;
            group.tags.push(tag.value);
            if (s[i] === ",") {
              i++;
              continue;
            }
            if (s[i] === ")") {
              i++;
              break;
            }
            // Something else after a name: a quote right after a name, or text after a quote.
            return fail(this.ERR_MISSING_COMMA, i, tokenEnd(i));
          }
        }
      } else {
        // One ungrouped tag.
        if (name.value === "") {
          i = afterName;
          const [a, b] = emptyRange(name.slotStart);
          return fail(this.ERR_EMPTY_TAG, a, b);
        }
        const dup = takeTag(name);
        if (dup) return dup;
        items.push({ kind: "tag", name: name.value });
      }

      // Between items: a comma, the end, or a mistake.
      skipSpace();
      if (i >= n) break;
      if (s[i] === ",") {
        i++;
        skipSpace();
        if (i >= n) break; // one trailing comma at the very end is ignored
        continue;
      }
      if (s[i] === ")") return fail(this.ERR_UNBALANCED, i, i + 1);
      return fail(this.ERR_MISSING_COMMA, i, tokenEnd(i));
    }
    return { ok: true, items };
  },

  /**
   * Feature 006b: the name being typed at the cursor ("the token"), for the suggestion list.
   *
   * The token is the text between the last separator (`,` or `(`) before the cursor and the
   * next separator (`,` `(` `)`) after it. Accepting a suggestion replaces only
   * `text.slice(start, end)`; the rest of the line stays as typed.
   *
   * One left-to-right scan up to the cursor (tracking quotes and brackets), then one scan
   * forward to the end of the token: linear time, so a 10 000-character line is fine.
   *
   * Returns null when no list should open: the cursor is right after a `)` (no comma since),
   * the token is followed by `(` (a group name being edited), the cursor is inside a nested
   * group (`A(B(c`), the token has a stray quote, or `cursor` is outside 0…text.length.
   *
   * @param {string} text  The script box's value (untrusted)
   * @param {number} cursor  The caret position (input.selectionStart)
   * @returns {ScriptToken | null}
   */
  tokenAt(text, cursor) {
    const s = String(text ?? "");
    const n = s.length;
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > n) return null;
    const isSpace = (c) => c !== undefined && /\s/.test(c);

    let segStart = 0; // index just after the last , ( or ) before the cursor
    let depth = 0; // bracket depth at the cursor (1 = inside a group)
    let afterClose = false; // a ")" since the last comma
    let inQuote = false; // inside "…" at the cursor
    let groupNameRaw = "";
    for (let i = 0; i < cursor; i++) {
      const c = s[i];
      if (inQuote) {
        if (c === '"') inQuote = false;
        continue;
      }
      if (c === '"') {
        inQuote = true;
      } else if (c === ",") {
        segStart = i + 1;
        afterClose = false;
      } else if (c === "(") {
        groupNameRaw = s.slice(segStart, i);
        depth++;
        segStart = i + 1;
        afterClose = false;
      } else if (c === ")") {
        depth = Math.max(0, depth - 1);
        segStart = i + 1;
        afterClose = true;
      }
    }
    if (afterClose || depth > 1) return null;

    // The token's first non-space character (never past the cursor).
    let start = segStart;
    while (start < cursor && isSpace(s[start])) start++;
    const quoted = s[start] === '"' && start < cursor;
    const typed = s.slice(start, cursor);
    // A quote anywhere else in the token (`ab"c`, or after a closed `"ab"`) is a mistake the
    // parser reports on Enter; no suggestions for it.
    if (quoted ? !inQuote : typed.includes('"')) return null;

    let end;
    let valueRaw;
    const close = quoted ? s.indexOf('"', cursor) : -1;
    if (quoted && close !== -1) {
      end = close + 1;
      valueRaw = s.slice(start + 1, close);
    } else {
      // Bare token (or a quote not closed yet): up to the next separator, spaces trimmed.
      let j = cursor;
      while (j < n && !',()"'.includes(s[j])) j++;
      end = j;
      while (end > cursor && isSpace(s[end - 1])) end--;
      valueRaw = s.slice(quoted ? start + 1 : start, end);
    }
    // Followed by "(": the user is editing a group name, not typing a tag (spec non-goal).
    let k = end;
    while (k < n && isSpace(s[k])) k++;
    if (s[k] === "(") return null;

    const inGroup = depth === 1;
    let groupName = "";
    if (inGroup) {
      groupName = groupNameRaw.trim();
      if (groupName.length >= 2 && groupName.startsWith('"') && groupName.endsWith('"')) {
        groupName = groupName.slice(1, -1);
      }
      groupName = this.clean(groupName);
    }
    return {
      start,
      end,
      prefix: this.clean(quoted ? typed.slice(1) : typed),
      value: this.clean(valueRaw),
      quoted,
      inGroup,
      groupName,
    };
  },

  /**
   * Zotero's tag-name cleaning: trim, then Unicode NFC (two spellings of "é" become one).
   * @param {string} name
   */
  clean(name) {
    return String(name).trim().normalize();
  },
};

/**
 * @typedef {{ kind: "tag", name: string } | { kind: "group", name: string, tags: string[] }} ScriptItem
 */

/**
 * The token at the cursor (Feature 006b). `prefix` is the cleaned text from the token start
 * (after an opening quote) to the cursor; `value` is the cleaned whole token, also past the
 * cursor (what "Create tag" inserts).
 * @typedef {{ start: number, end: number, prefix: string, value: string, quoted: boolean,
 *   inGroup: boolean, groupName: string }} ScriptToken
 */
