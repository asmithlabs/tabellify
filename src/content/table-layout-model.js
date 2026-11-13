/* Tabellify — table-layout-model.js (Feature 005c: per-paper table layout, pure logic)
 *
 * The per-paper table in the Tabellify tab can be rearranged by the user: its five data
 * columns can be put in another order, and its papers (rows) can be put in a hand-made
 * "manual order" per collection. Both are done by mouse (drag-and-drop) and by keyboard
 * (Alt+arrow keys). See docs/features/005c-table-layout.md.
 *
 * This file holds only the RULES (which order results from a move, where a drop lands,
 * how far to auto-scroll, which rows are shaded). workspace.js does the DOM work.
 *
 * PURE: no Zotero, DOM, IOUtils or PathUtils globals, so tests/unit/table-layout-model.test.mjs
 * can run it in Node. IMMUTABLE STYLE (as in tag-monitor-model.js): no function changes its
 * inputs; every function returns new arrays/objects.
 *
 * Why src/content/ and not src/modules/: only src/content/ has a chrome:// URL the
 * workspace document can load a script from (see the top of workspace.js).
 */
"use strict";

/**
 * One global object (a property of the window, or of the Node test's sandbox, because it is
 * declared with `var`). workspace.xhtml loads this file after tag-monitor-model.js and before
 * workspace.js.
 */
var TabellifyTableLayout = {
  /**
   * Stable IDs of the five movable data columns, in the default order. They are used in
   * code (data-column="…", CSS class tabellify-col-<id>) and saved in layout.json, so they
   * must never be renamed.
   */
  COLUMN_IDS: ["title", "count", "collections", "tags", "details"],

  /** Sort-state key that means "the hand-made order" instead of a column sort. */
  MANUAL: "manual",

  // ---------------------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------------------

  /**
   * Turn anything into a valid column order: a permutation of COLUMN_IDS. Unknown and
   * duplicate IDs are dropped; missing ones are appended in default order. Used for every
   * order that comes from outside (layout.json can be edited by hand).
   * @param {unknown} order
   * @returns {string[]}
   */
  normalizeColumnOrder(order) {
    const out = [];
    if (Array.isArray(order)) {
      for (const id of order) {
        if (this.COLUMN_IDS.includes(id) && !out.includes(id)) out.push(id);
      }
    }
    for (const id of this.COLUMN_IDS) if (!out.includes(id)) out.push(id);
    return out;
  },

  /**
   * Move column `id` so that it ends up at `toIndex` in the result (clamped to the edges).
   * Unknown IDs leave the order unchanged.
   * @param {string[]} order
   * @param {string} id
   * @param {number} toIndex
   * @returns {string[]}
   */
  moveColumn(order, id, toIndex) {
    if (!order.includes(id)) return [...order];
    const rest = order.filter((c) => c !== id);
    const index = Math.max(0, Math.min(rest.length, Math.trunc(Number(toIndex) || 0)));
    return [...rest.slice(0, index), id, ...rest.slice(index)];
  },

  /**
   * Move column `id` by `delta` places (-1 = one to the left). No change at the edges or
   * for unknown IDs (keyboard moves: Alt+Left / Alt+Right).
   * @param {string[]} order
   * @param {string} id
   * @param {number} delta
   * @returns {string[]}
   */
  moveColumnBy(order, id, delta) {
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return [...order];
    return this.moveColumn(order, id, to);
  },

  // ---------------------------------------------------------------------------------------
  // Rows (papers) and manual order
  // ---------------------------------------------------------------------------------------

  /**
   * Papers in the hand-made order. Papers the manual order does not know (new since it
   * was made) follow in `fallbackSorted` order; keys in the order whose paper is gone are
   * skipped. Each paper appears exactly once.
   * @template P
   * @param {P[]} papers                  The papers to show
   * @param {Array<string | number>} manualOrder  Paper keys in the hand-made order
   * @param {P[]} [fallbackSorted]        The same papers in the default sort (for new papers)
   * @param {(p: P) => string | number} [keyOf]  Key of a paper (default: `p.id`)
   * @returns {P[]}
   */
  applyManualOrder(papers, manualOrder, fallbackSorted = papers, keyOf = (p) => p.id) {
    const byKey = new Map(papers.map((p) => [keyOf(p), p]));
    const out = [];
    const placed = new Set();
    for (const key of Array.isArray(manualOrder) ? manualOrder : []) {
      if (byKey.has(key) && !placed.has(key)) {
        out.push(byKey.get(key));
        placed.add(key);
      }
    }
    for (const p of fallbackSorted) {
      const key = keyOf(p);
      if (byKey.has(key) && !placed.has(key)) {
        out.push(p);
        placed.add(key);
      }
    }
    return out;
  },

  /**
   * The keys of the papers in the order currently shown: the starting point of a manual
   * order (a move while sorted by a column starts from what the user sees).
   * @template P
   * @param {P[]} displayedPapers
   * @param {(p: P) => string | number} [keyOf]
   * @returns {Array<string | number>}
   */
  seedManualOrder(displayedPapers, keyOf = (p) => p.id) {
    return displayedPapers.map(keyOf);
  },

  /**
   * Move paper `key` so it comes right before `beforeKey` (`null` = to the end). No change
   * when `key` is unknown, when it is dropped onto itself, or when `beforeKey` is unknown.
   * @param {Array<string | number>} order
   * @param {string | number} key
   * @param {string | number | null} beforeKey
   * @returns {Array<string | number>}
   */
  moveRow(order, key, beforeKey) {
    if (!order.includes(key) || key === beforeKey) return [...order];
    const rest = order.filter((k) => k !== key);
    if (beforeKey === null || beforeKey === undefined) return [...rest, key];
    const index = rest.indexOf(beforeKey);
    if (index < 0) return [...order];
    return [...rest.slice(0, index), key, ...rest.slice(index)];
  },

  /**
   * Move paper `key` by `delta` places (-1 = one up). No change at the edges or for
   * unknown keys (keyboard moves: Alt+Up / Alt+Down).
   * @param {Array<string | number>} order
   * @param {string | number} key
   * @param {number} delta
   * @returns {Array<string | number>}
   */
  moveRowBy(order, key, delta) {
    const from = order.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return [...order];
    const rest = order.filter((k) => k !== key);
    return [...rest.slice(0, to), key, ...rest.slice(to)];
  },

  /**
   * The sort state after a click on a column header: a new column sorts ascending, the
   * active column reverses, and leaving the manual order starts ascending.
   * @param {{ key: string, direction: string }} state
   * @param {string} clickedKey
   * @returns {{ key: string, direction: "asc" | "desc" }}
   */
  nextSortState(state, clickedKey) {
    if (state && state.key === clickedKey && state.key !== this.MANUAL) {
      return { key: clickedKey, direction: state.direction === "asc" ? "desc" : "asc" };
    }
    return { key: clickedKey, direction: "asc" };
  },

  // ---------------------------------------------------------------------------------------
  // Drag-and-drop geometry and row shading
  // ---------------------------------------------------------------------------------------

  /**
   * Which side of a target the pointer is on: before its middle or after it.
   * @param {number} pointer  clientX (columns) or clientY (rows)
   * @param {number} start    left or top of the target
   * @param {number} size     width or height of the target
   * @returns {"before" | "after"}
   */
  dropSide(pointer, start, size) {
    return pointer < start + size / 2 ? "before" : "after";
  },

  /**
   * How far to scroll the table's scrolling area while dragging: negative near the top,
   * positive near the bottom, 0 in between. The closer to (or past) the edge, the faster,
   * up to `max` pixels per dragover event.
   * @param {number} pointerY
   * @param {number} top     Top of the scrolling area (client coordinates)
   * @param {number} bottom  Bottom of the scrolling area
   * @param {number} [edge]  Size of the sensitive band in pixels
   * @param {number} [max]   Largest step in pixels
   * @returns {number}
   */
  autoScrollDelta(pointerY, top, bottom, edge = 40, max = 20) {
    const fromTop = pointerY - top;
    const fromBottom = bottom - pointerY;
    const step = (distance) => Math.ceil(max * Math.min(1, (edge - distance) / edge));
    if (fromTop < edge && fromTop <= fromBottom) return -step(Math.max(0, fromTop));
    if (fromBottom < edge) return step(Math.max(0, fromBottom));
    return 0;
  },

  /**
   * Which table rows get the alternate shading: every other PAPER row (the 2nd, 4th, …);
   * a detail row ("Show remaining") copies the flag of the paper before it. Done in code,
   * not with CSS :nth-child, because detail rows would break the alternation.
   * @param {Array<"paper" | "detail">} rows
   * @returns {boolean[]}
   */
  stripeFlags(rows) {
    let paperIndex = -1;
    let current = false;
    return rows.map((kind) => {
      if (kind !== "detail") {
        paperIndex++;
        current = paperIndex % 2 === 1;
      }
      return current;
    });
  },
};
