/* Tabellify — selection-model.js (Feature 011: collection selections, pure logic; ADR-0027)
 *
 * A SELECTION says which collections of ONE library go into a table. It is stored as two
 * short lists of RULES (ADR-0027 §1):
 *
 *   { include: ["1/PHEN0001"], exclude: ["1/ARCH0002"] }
 *
 * - "include X" means "X and everything below it"; "exclude Y" means "not Y and nothing
 *   below it".
 * - NEAREST RULE WINS: to decide one collection, walk up from it towards the top of the tree;
 *   the first rule met decides. No rule on the way up means "not included".
 * - CANONICAL FORM: the shortest rule lists that give the same ticks (fromTicks below), with
 *   each list sorted by plain code-unit order (`a < b`, not the locale's order, so the text
 *   is the same on every computer). Two people who tick the same boxes get the same rules, and
 *   so the same text key for their manual order (selectionKey).
 *
 * Every key is "<libraryID>/<collectionKey>", the form layout.json and tables.json already
 * use (e.g. "1/ABCD2345").
 *
 * PURE: no Zotero, DOM, IOUtils or PathUtils globals, so tests/unit/selection-model.test.mjs
 * can run it in Node. workspace.js turns Zotero's collection tree into plain objects first:
 *
 *   collections: Array<{ id: number, parentID?: number | null | false, name: string,
 *                        key: string }>   (key = "<libraryID>/<collectionKey>")
 *
 * in Zotero's tree order (Zotero.Collections.getByLibrary(libraryID, true) returns each
 * collection followed by its subcollections, names A→Z per level). The functions below keep
 * that order: siblings stay in input order.
 *
 * IMMUTABLE STYLE (as in the other models): nothing here changes its inputs.
 *
 * Collection names are UNTRUSTED text (group members type them). This file returns them
 * unchanged; the workspace puts them on the page only as plain text (textContent).
 *
 * Why src/content/ and not src/modules/: only src/content/ has a chrome:// URL the
 * workspace document can load a script from (see the top of workspace.js).
 */
"use strict";

/**
 * One global object (a property of the window, or of the Node test's sandbox, because it is
 * declared with `var`). workspace.xhtml loads this file after tag-monitor-model.js and
 * before saved-tables-model.js and workspace.js.
 */
var TabellifySelection = {
  /** The most rules (include + exclude) one selection may have (ADR-0027 §1). */
  MAX_RULES: 1000,

  /** One rule's key: "<libraryID>/<collectionKey>" (same pattern as saved tables use). */
  KEY_PATTERN: /^[0-9]+\/[A-Za-z0-9]+$/,

  /** Start of a manual-order key for anything but a single collection (ADR-0027 §3). */
  SEL_PREFIX: "sel:",

  /** Separator between the parts of a Subcollection path (U+203A; names may contain "/"). */
  PATH_SEPARATOR: " › ",

  // ---------------------------------------------------------------------------------------
  // Shape
  // ---------------------------------------------------------------------------------------

  /**
   * The numeric library ID of a key, or null.
   * @param {unknown} key
   * @returns {number | null}
   */
  libraryOf(key) {
    const match = /^(\d+)\//.exec(typeof key === "string" ? key : "");
    return match ? Number(match[1]) : null;
  },

  /**
   * Strict check of a selection (ADR-0027 §1 and §2). `reason` is English for Debug Output:
   * it names the problem, never a key.
   * @param {unknown} selection
   * @returns {{ ok: true } | { ok: false, reason: string }}
   */
  validate(selection) {
    const fail = (reason) => ({ ok: false, reason });
    if (typeof selection !== "object" || selection === null || Array.isArray(selection)) return fail("is not an object");
    if (!Object.keys(selection).every((k) => k === "include" || k === "exclude")) return fail("has an unknown key");
    const { include, exclude } = selection;
    if (!Array.isArray(include) || !Array.isArray(exclude)) return fail("include or exclude is not an array");
    if (include.length < 1) return fail("include is empty");
    if (include.length + exclude.length > this.MAX_RULES) return fail(`more than ${this.MAX_RULES} rules`);
    const seen = new Set();
    let library = null;
    for (const key of [...include, ...exclude]) {
      if (typeof key !== "string" || !this.KEY_PATTERN.test(key)) return fail("a key is not <library>/<key>");
      // One Set for both lists: a repeat inside a list and a key in both lists are refused.
      if (seen.has(key)) return fail("a key is repeated or in both lists");
      seen.add(key);
      const id = this.libraryOf(key);
      if (library === null) library = id;
      else if (id !== library) return fail("keys from more than one library");
    }
    return { ok: true };
  },

  /** The selection of exactly one collection (and its subcollections): today's dropdown. */
  single(key) {
    return { include: [String(key)], exclude: [] };
  },

  /** True for one include and no exclude (shown and keyed like a plain collection). */
  isSingle(selection) {
    return Array.isArray(selection?.include) && selection.include.length === 1
      && Array.isArray(selection?.exclude) && selection.exclude.length === 0;
  },

  /** The library of a selection (from its first include), or null. */
  libraryOfSelection(selection) {
    return this.libraryOf(selection?.include?.[0]);
  },

  /** Plain code-unit order (the same on every computer; not localeCompare). */
  codeUnitSort(list) {
    return [...list].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  },

  /** Two selections with the same rules (lists compared after sorting)? */
  equals(a, b) {
    const key = (s) => this.selectionKey(s);
    const ka = key(a);
    return ka !== null && ka === key(b);
  },

  // ---------------------------------------------------------------------------------------
  // The tree
  // ---------------------------------------------------------------------------------------

  /**
   * The tree as lookups: children per parent (input order) and the top-level collections.
   * A collection whose parent is not in the list counts as top level. A collection that is
   * only reachable through a cycle (impossible in Zotero, possible in bad input) is never
   * reached from a top-level one, so walk() never visits it and nothing loops.
   * @param {Array<{ id: number, parentID?: number | null | false }>} collections
   */
  tree(collections) {
    const list = Array.isArray(collections) ? collections : [];
    const byId = new Map(list.map((c) => [c.id, c]));
    const children = new Map();
    const roots = [];
    for (const c of list) {
      if (c.parentID && byId.has(c.parentID) && c.parentID !== c.id) {
        if (!children.has(c.parentID)) children.set(c.parentID, []);
        children.get(c.parentID).push(c);
      } else {
        roots.push(c);
      }
    }
    return { byId, children, roots };
  },

  /**
   * The collections reachable from `starts`, depth-first, each with the ID of the collection
   * it was reached from (null for a start). `visited` guards against cycles.
   *
   * ITERATIVE ON PURPOSE (SEC-026): a recursive function uses one JavaScript stack frame per
   * level, and a collection chain thousands of levels deep (possible in a group library)
   * would throw "RangeError: too much recursion". An explicit stack (an array we push to and
   * pop from) has no such limit.
   * - `mirrored` false: pre-order (a collection, then its children's subtrees in input
   *   order), the order the recursive version had.
   * - `mirrored` true: a collection, then its children's subtrees in REVERSE order; read
   *   backwards, that list is the post-order (children first, in input order) that
   *   tickStates needs.
   * @param {Map<number, object[]>} children  From tree()
   * @param {object[]} starts
   * @param {boolean} [mirrored]
   * @returns {Array<[object, number | null]>}
   */
  depthFirst(children, starts, mirrored = false) {
    const order = [];
    const visited = new Set();
    const stack = [];
    // The last one pushed comes off the stack first, so push in reverse for input order.
    const push = (list, parentId) => {
      if (mirrored) for (const c of list) stack.push([c, parentId]);
      else for (let i = list.length - 1; i >= 0; i--) stack.push([list[i], parentId]);
    };
    push(starts, null);
    while (stack.length > 0) {
      const [c, parentId] = stack.pop();
      if (visited.has(c.id)) continue;
      visited.add(c.id);
      order.push([c, parentId]);
      push(children.get(c.id) ?? [], c.id);
    }
    return order;
  },

  /**
   * Visit every reachable collection depth-first (tree order), top down. `visit(c, inherited)`
   * returns the value its children inherit. Iterative (see depthFirst).
   * @template V
   * @param {Array<object>} collections
   * @param {V} rootValue  What a top-level collection inherits
   * @param {(c: object, inherited: V) => V} visit
   */
  walk(collections, rootValue, visit) {
    const { children, roots } = this.tree(collections);
    const values = new Map();
    // Pre-order: a parent's value is always known before its children are visited.
    for (const [c, parentId] of this.depthFirst(children, roots)) {
      values.set(c.id, visit(c, parentId === null ? rootValue : values.get(parentId)));
    }
  },

  /**
   * The collection IDs a selection covers, in tree order (ADR-0027 §1: nearest rule wins).
   * Rules whose keys are not in `collections` are ignored.
   * @param {Array<{ id: number, parentID?: number | null | false, key: string }>} collections
   * @param {{ include?: string[], exclude?: string[] } | null} selection
   * @returns {number[]}
   */
  scope(collections, selection) {
    const include = new Set(Array.isArray(selection?.include) ? selection.include : []);
    const exclude = new Set(Array.isArray(selection?.exclude) ? selection.exclude : []);
    const out = [];
    this.walk(collections, false, (c, inherited) => {
      // The nearest rule: this collection's own rule, else what its parent decided.
      const state = include.has(c.key) ? true : exclude.has(c.key) ? false : inherited;
      if (state) out.push(c.id);
      return state;
    });
    return out;
  },

  /**
   * The canonical rules for a set of ticked collections (ADR-0027 §1): walking from the top,
   * a collection gets a rule only when its tick differs from what it inherits (top level
   * inherits "not included"). Both lists sorted by code-unit order. `include` may be empty
   * (nothing ticked): the caller must not use such a selection (validate refuses it).
   * @param {Array<{ id: number, parentID?: number | null | false, key: string }>} collections
   * @param {Iterable<number>} tickedIds
   * @returns {{ include: string[], exclude: string[] }}
   */
  fromTicks(collections, tickedIds) {
    const ticked = new Set(tickedIds ?? []);
    const include = [];
    const exclude = [];
    this.walk(collections, false, (c, inherited) => {
      const on = ticked.has(c.id);
      if (on !== inherited) (on ? include : exclude).push(c.key);
      return on;
    });
    return { include: this.codeUnitSort(include), exclude: this.codeUnitSort(exclude) };
  },

  /**
   * Each collection's checkbox look: "checked" when it and all its descendants are ticked,
   * "unchecked" when none of them are, "indeterminate" (mixed) otherwise.
   * @param {Array<{ id: number, parentID?: number | null | false }>} collections
   * @param {Iterable<number>} tickedIds
   * @returns {Map<number, "checked" | "unchecked" | "indeterminate">}
   */
  tickStates(collections, tickedIds) {
    const ticked = new Set(tickedIds ?? []);
    const { children, roots } = this.tree(collections);
    const states = new Map();
    // Post-order (children first), iteratively (see depthFirst): [any ticked, all ticked] of
    // each subtree, folded into the collection it was reached from.
    const order = this.depthFirst(children, roots, true);
    const any = new Map();
    const all = new Map();
    for (const [c] of order) {
      any.set(c.id, ticked.has(c.id));
      all.set(c.id, ticked.has(c.id));
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const [c, parentId] = order[i];
      states.set(c.id, all.get(c.id) ? "checked" : any.get(c.id) ? "indeterminate" : "unchecked");
      if (parentId === null) continue;
      if (any.get(c.id)) any.set(parentId, true);
      if (!all.get(c.id)) all.set(parentId, false);
    }
    return states;
  },

  /**
   * The IDs of a collection and all its descendants (tree order). Empty when unknown.
   * @param {Array<{ id: number, parentID?: number | null | false }>} collections
   * @param {number} id
   * @returns {number[]}
   */
  subtree(collections, id) {
    const { byId, children } = this.tree(collections);
    if (!byId.has(id)) return [];
    // Iterative (see depthFirst): pre-order from this one collection.
    return this.depthFirst(children, [byId.get(id)]).map(([c]) => c.id);
  },

  /**
   * One click on a checkbox: a ticked box (it and everything below ticked) unticks itself
   * and every descendant; an empty or mixed box ticks itself and every descendant. Nothing
   * else changes. Returns a NEW Set.
   * @param {Array<{ id: number, parentID?: number | null | false }>} collections
   * @param {Iterable<number>} tickedIds
   * @param {number} id
   * @returns {Set<number>}
   */
  applyTick(collections, tickedIds, id) {
    const next = new Set(tickedIds ?? []);
    const ids = this.subtree(collections, id);
    if (ids.length === 0) return next;
    const on = this.tickStates(collections, next).get(id) !== "checked";
    for (const x of ids) {
      if (on) next.add(x);
      else next.delete(x);
    }
    return next;
  },

  // ---------------------------------------------------------------------------------------
  // Keys (manual orders, saved-table filter): ADR-0027 §3
  // ---------------------------------------------------------------------------------------

  /**
   * The text key of a selection: the plain collection key for a single collection (so every
   * 0.2.0 manual order still applies), else "sel:" + include joined with "," and, when
   * there are excludes, "|" + exclude joined with ",". Lists sorted by code-unit order.
   * null for an invalid selection.
   * @param {unknown} selection
   * @returns {string | null}
   */
  selectionKey(selection) {
    if (!this.validate(selection).ok) return null;
    if (this.isSingle(selection)) return selection.include[0];
    const include = this.codeUnitSort(selection.include).join(",");
    const exclude = this.codeUnitSort(selection.exclude).join(",");
    return this.SEL_PREFIX + include + (exclude ? `|${exclude}` : "");
  },

  /**
   * Read a key made by selectionKey back into a selection (lists sorted), or null when the
   * text is not a valid key (bad pattern, two libraries, too many rules, repeats, a key in
   * both lists).
   * @param {unknown} text
   * @returns {{ include: string[], exclude: string[] } | null}
   */
  parseSelectionKey(text) {
    if (typeof text !== "string") return null;
    let selection;
    if (text.startsWith(this.SEL_PREFIX)) {
      const body = text.slice(this.SEL_PREFIX.length);
      const parts = body.split("|");
      if (parts.length > 2) return null;
      const list = (s) => (s === undefined || s === "" ? [] : s.split(","));
      selection = { include: list(parts[0]), exclude: list(parts[1]) };
      // A "|" with nothing after it is not a key selectionKey makes.
      if (parts.length === 2 && parts[1] === "") return null;
    } else {
      selection = this.single(text);
    }
    if (!this.validate(selection).ok) return null;
    return { include: this.codeUnitSort(selection.include), exclude: this.codeUnitSort(selection.exclude) };
  },

  // ---------------------------------------------------------------------------------------
  // Names: the Subcollection column, the summary line, saved-table labels
  // ---------------------------------------------------------------------------------------

  /**
   * The Subcollection text of every in-scope collection (spec F011 "Subcollection column").
   * An ANCHOR is an in-scope collection whose parent is not in scope (the top of a ticked
   * branch).
   * - One anchor: the path from just below the anchor down to the collection, joined with
   *   " › "; the anchor itself shows its own name.
   * - Several anchors: an anchor without in-scope children shows its name; otherwise the
   *   full path from the anchor ("Phenotypes › Asthma"), so equal names under different
   *   anchors cannot be confused.
   * @param {Array<{ id: number, parentID?: number | null | false, name: string }>} collections
   * @param {number[]} scopeIds  From scope() (tree order)
   * @returns {Map<number, string>}
   */
  labelMap(collections, scopeIds) {
    const { byId, children } = this.tree(collections);
    const inScope = new Set(scopeIds ?? []);
    const name = (id) => String(byId.get(id)?.name ?? "");
    const parentInScope = (id) => {
      const p = byId.get(id)?.parentID;
      return Boolean(p) && p !== id && inScope.has(p);
    };
    const anchors = [...inScope].filter((id) => byId.has(id) && !parentInScope(id));
    const several = anchors.length > 1;
    const hasScopedChild = (id) => (children.get(id) ?? []).some((c) => inScope.has(c.id));
    const out = new Map();
    for (const id of inScope) {
      if (!byId.has(id)) continue;
      // Walk up to the anchor, collecting names (guarded against cycles).
      const path = [];
      const seen = new Set();
      let at = id;
      while (!seen.has(at)) {
        seen.add(at);
        path.unshift(name(at));
        if (!parentInScope(at)) break;
        at = byId.get(at).parentID;
      }
      const anchor = at;
      let text;
      if (!several) {
        // The anchor's own papers show its name; below it, the path without the anchor.
        text = id === anchor ? name(anchor) : path.slice(1).join(this.PATH_SEPARATOR);
      } else {
        text = hasScopedChild(anchor) ? path.join(this.PATH_SEPARATOR) : name(anchor);
      }
      out.set(id, text);
    }
    return out;
  },

  /**
   * The Subcollection texts of one paper: one per in-scope collection it is a direct member
   * of (its "places"), in tree order, each once.
   * @param {Array<{ id: number, parentID?: number | null | false, name: string }>} collections
   * @param {number[]} scopeIds
   * @param {Iterable<number>} paperCollectionIds
   * @param {Map<number, string>} [labels]  labelMap(collections, scopeIds), when the caller
   *   has it already (one map for all papers)
   * @returns {string[]}
   */
  placeLabels(collections, scopeIds, paperCollectionIds, labels = null) {
    const map = labels ?? this.labelMap(collections, scopeIds);
    const member = new Set(paperCollectionIds ?? []);
    return (scopeIds ?? []).filter((id) => member.has(id) && map.has(id)).map((id) => map.get(id));
  },

  /**
   * The names of a selection's INCLUDED collections that still exist, in tree order (for the
   * summary line, the dropdown and a saved table's collectionName).
   * @param {Array<{ id: number, parentID?: number | null | false, name: string, key: string }>} collections
   * @param {{ include?: string[] } | null} selection
   * @returns {string[]}
   */
  includedNames(collections, selection) {
    const include = new Set(Array.isArray(selection?.include) ? selection.include : []);
    const out = [];
    this.walk(collections, null, (c) => {
      if (include.has(c.key)) out.push(String(c.name ?? ""));
      return null;
    });
    return out;
  },

  /**
   * The included keys that are not in `collections` (gone: erased, trashed, or their library
   * removed). Order of the selection.
   * @param {Array<{ key: string }>} collections
   * @param {{ include?: string[] } | null} selection
   * @returns {string[]}
   */
  goneIncludes(collections, selection) {
    const known = new Set((collections ?? []).map((c) => c.key));
    return (Array.isArray(selection?.include) ? selection.include : []).filter((k) => !known.has(k));
  },

  /**
   * A short list of names: the first `max`, and how many more there are.
   * @param {string[]} names
   * @param {number} max
   * @returns {{ shown: string[], more: number }}
   */
  shortList(names, max) {
    const list = Array.isArray(names) ? names : [];
    const n = Math.max(0, Math.trunc(Number(max) || 0));
    return { shown: list.slice(0, n), more: Math.max(0, list.length - n) };
  },
};
