/* Tabellify — table-layout-model.js (Feature 005c: per-paper table layout, pure logic)
 *
 * The per-paper table in the Tabellify tab can be rearranged by the user: its codebook tag
 * columns can be put in another order (a tag inside its group; a whole group or an
 * ungrouped tag anywhere at the top level: owner decisions 2026-11-13, spec 006c
 * Amendment 2, ADR-0019), and its papers (rows) can be put in a
 * hand-made "manual order" per collection. Both are done by mouse (drag-and-drop) and by
 * keyboard (Alt+arrow keys). The column order is the user's own: it never changes the
 * codebook. See docs/features/005c-table-layout.md.
 *
 * This file holds only the RULES (which order results from a move, where a drop lands,
 * how far to auto-scroll, which rows are shaded) and the checks for the saved layout file
 * layout.json (ADR-0014, ADR-0019 schema 3). workspace.js does the DOM work; layout-store.js does the file
 * work.
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
 * layout-store.js and workspace.js.
 */
var TabellifyTableLayout = {
  /** Sort-state key that means "the hand-made order" instead of a column sort. */
  MANUAL: "manual",

  /**
   * Version of the layout.json format this code writes (ADR-0014 §2 and its 2026-11-13
   * amendment; ADR-0019). 1 = the old five summary columns; 2 = codebook tag columns
   * grouped by super-tag (groupOrder + tagOrder); 3 = one mixed top-level order of groups
   * and ungrouped tags (topOrder + tagOrder). migrateLayout() turns 1 and 2 into 3.
   */
  SCHEMA_VERSION: 3,

  // ---------------------------------------------------------------------------------------
  // Generic list moves (used for tag columns inside a group and the tests' own lists)
  // ---------------------------------------------------------------------------------------

  /**
   * Move `id` so that it ends up at `toIndex` in the result (clamped to the edges).
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
   * Move `id` by `delta` places (-1 = one to the left). No change at the edges or for
   * unknown IDs (keyboard moves: Alt+Left / Alt+Right).
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
  // Codebook tag columns (owner decisions 2026-11-13; ADR-0019: layout.json schema 3)
  //
  // The table's columns are: grip, Title, the codebook tag columns, then k/M. Title and k/M
  // never move. The header is a two-level tree: the TOP LEVEL is a left-to-right list of
  // whole groups (each with its tags below it) and single UNGROUPED tags. Ungrouped tags that
  // sit next to each other form a "run"; each run gets its own "Ungrouped" super-header. A
  // run is never stored: it appears whenever ungrouped tags are neighbours.
  //
  // The user's order is a `columnLayout` = {
  //   topOrder: [{ group: "g2" } | { tag: "age" } | { group: "ungrouped" }, …],
  //   tagOrder: { groupId: tag names }   // order of the tags inside each real group
  // }, kept apart from the codebook: the CODEBOOK decides which groups and tags exist and
  // which group each tag is in; the layout only decides the ORDER (ADR-0019 §6).
  //
  // Why `{ group }` / `{ tag }` objects and not plain strings ("discriminated entries"): a
  // group ID looks like "g2", but a tag name is free text, and a tag may literally be named
  // "g2". The single key says what the entry is, so the two can never be confused.
  //
  // `{ group: "ungrouped" }` is the HOME MARKER (ADR-0019 §1): ungrouped tags that topOrder
  // does not list (e.g. new tags from the script box) are shown there. It has no column.
  //
  // `groups` below is what TabellifyTagMonitor.codebookGroups() returns:
  // [{ id, name, tags: string[], ungrouped? }] in codebook order, where the block with
  // `ungrouped: true` (id "ungrouped") holds every tag without a group. Tag names are unique
  // in a codebook.
  // ---------------------------------------------------------------------------------------

  /** The reserved view ID of the ungrouped tags (ADR-0016 §6), and the home marker's ID. */
  UNGROUPED_ID: "ungrouped",

  /** A column layout that means "codebook order" (nothing moved yet). */
  emptyColumnLayout() {
    return { topOrder: [], tagOrder: {} };
  },

  /** True for the codebookGroups() block that holds the ungrouped tags. */
  isUngroupedBlock(group) {
    return Boolean(group?.ungrouped) || group?.id === this.UNGROUPED_ID;
  },

  /** True for a `{ group: "ungrouped" }` entry (the home marker). */
  isMarker(entry) {
    return Object.hasOwn(entry, "group") && entry.group === this.UNGROUPED_ID;
  },

  /** True when two top-level entries name the same thing (same key, same value). */
  sameTopItem(a, b) {
    if (!a || !b) return false;
    if (Object.hasOwn(a, "group")) return Object.hasOwn(b, "group") && a.group === b.group;
    return Object.hasOwn(a, "tag") && Object.hasOwn(b, "tag") && a.tag === b.tag;
  },

  /**
   * The saved tag order of one group, or [] (own properties only: the object comes from a
   * hand-editable file, so a key such as "__proto__" must not reach the prototype).
   * @param {{ tagOrder?: Record<string, unknown> } | null | undefined} columnLayout
   * @param {string} groupId
   * @returns {unknown}
   */
  savedTagOrder(columnLayout, groupId) {
    const tagOrder = columnLayout?.tagOrder;
    if (typeof tagOrder !== "object" || tagOrder === null) return [];
    return Object.hasOwn(tagOrder, groupId) ? tagOrder[groupId] : [];
  },

  /**
   * Put `items` in the order of `saved` (IDs it does not know are ignored), then append the
   * items `saved` does not mention, in their own order. Each item appears once.
   * @param {string[]} items  e.g. the codebook's tag names of one group
   * @param {unknown} saved   e.g. the user's tag order of that group
   * @returns {string[]}
   */
  mergeOrder(items, saved) {
    const known = new Set(items);
    const out = [];
    for (const id of Array.isArray(saved) ? saved : []) {
      if (known.has(id) && !out.includes(id)) out.push(id);
    }
    for (const id of items) if (!out.includes(id)) out.push(id);
    return out;
  },

  /**
   * The top-level order to show (ADR-0019 §2), as fresh `{ group }` / `{ tag }` entries,
   * INCLUDING the home marker `{ group: "ungrouped" }` at its place:
   * 1. walk topOrder: keep a group that exists and has tags, a tag that exists and is
   *    ungrouped now, and the first marker; skip everything else (stale) and repeats;
   * 2. no marker listed: it goes first (ADR-0016 §6: the default place is the far left);
   * 3. ungrouped tags topOrder does not list go right BEFORE the marker, in codebook order
   *    (so tags added later line up after the earlier ones, as in schema 2);
   * 4. groups with tags that topOrder does not list are appended, in codebook order.
   * @param {Array<{ id: string, name: string, tags: string[], ungrouped?: boolean }>} groups
   * @param {{ topOrder?: unknown } | null} [columnLayout]
   * @returns {Array<{ group: string } | { tag: string }>}
   */
  topItems(groups, columnLayout) {
    const all = groups ?? [];
    const realGroups = all.filter((g) => !this.isUngroupedBlock(g) && g.tags.length > 0);
    const groupIds = new Set(realGroups.map((g) => g.id));
    const ungroupedTags = all.filter((g) => this.isUngroupedBlock(g)).flatMap((g) => g.tags);
    const ungroupedSet = new Set(ungroupedTags);
    const out = [];
    const seenGroups = new Set();
    const seenTags = new Set();
    let marker = false;
    for (const entry of this.cleanTopOrder(columnLayout?.topOrder)) {
      if (this.isMarker(entry)) {
        if (!marker) out.push({ group: this.UNGROUPED_ID });
        marker = true;
      } else if (Object.hasOwn(entry, "group")) {
        if (groupIds.has(entry.group) && !seenGroups.has(entry.group)) {
          seenGroups.add(entry.group);
          out.push({ group: entry.group });
        }
      } else if (ungroupedSet.has(entry.tag) && !seenTags.has(entry.tag)) {
        seenTags.add(entry.tag);
        out.push({ tag: entry.tag });
      }
    }
    if (!marker) out.unshift({ group: this.UNGROUPED_ID });
    const home = out.findIndex((e) => this.isMarker(e));
    const unlisted = ungroupedTags.filter((t) => !seenTags.has(t)).map((tag) => ({ tag }));
    out.splice(home, 0, ...unlisted);
    for (const g of realGroups) if (!seenGroups.has(g.id)) out.push({ group: g.id });
    return out;
  },

  /** The top-level entries that have a column (topItems without the home marker). */
  visibleTopItems(groups, columnLayout) {
    return this.topItems(groups, columnLayout).filter((e) => !this.isMarker(e));
  },

  /**
   * The blocks to show, left to right, in the shape the header code uses (ADR-0019 §2):
   * groups `{ id, name, tags }` (tags in tagOrder[id] order, new tags at the end), and runs
   * of neighbouring ungrouped tags `{ id: "ungrouped", run: k, name: "", tags,
   * ungrouped: true }` with k = 0, 1, … from the left. Groups without tags have no column
   * and are left out; so is the home marker (it does not split a run).
   * @param {Array<{ id: string, name: string, tags: string[], ungrouped?: boolean }>} groups
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} [columnLayout]
   * @returns {Array<{ id: string, name: string, tags: string[], run?: number, ungrouped?: true }>}
   */
  orderedGroups(groups, columnLayout) {
    const byId = new Map((groups ?? []).filter((g) => !this.isUngroupedBlock(g)).map((g) => [g.id, g]));
    const out = [];
    let run = null;
    let runCount = 0;
    for (const entry of this.visibleTopItems(groups, columnLayout)) {
      if (Object.hasOwn(entry, "tag")) {
        if (!run) {
          run = { id: this.UNGROUPED_ID, run: runCount++, name: "", tags: [], ungrouped: true };
          out.push(run);
        }
        run.tags.push(entry.tag);
        continue;
      }
      run = null;
      const g = byId.get(entry.group);
      out.push({ id: g.id, name: g.name, tags: this.mergeOrder(g.tags, this.savedTagOrder(columnLayout, g.id)) });
    }
    return out;
  },

  /**
   * True when the columns would show in codebook order (so "Reset columns" has nothing
   * to do).
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @returns {boolean}
   */
  isCodebookOrder(groups, columnLayout) {
    const key = (list) => JSON.stringify(list.map((g) => [g.id, g.run ?? null, g.tags]));
    return key(this.orderedGroups(groups, columnLayout)) === key(this.orderedGroups(groups, null));
  },

  /**
   * Move one top-level item (a whole group `{ group: id }` or an ungrouped tag
   * `{ tag: name }`) so it ends up at `toIndex` among the top-level items that have a
   * column (clamped). Starts from the order shown now, so the result lists every shown
   * item explicitly; the home marker keeps its place. Unknown items: no change.
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {{ group: string } | { tag: string }} item
   * @param {number} toIndex
   * @returns {{ topOrder: Array<object>, tagOrder: Record<string, string[]> }}
   */
  moveTopItem(columnLayout, groups, item, toIndex) {
    const seed = this.topItems(groups, columnLayout);
    if (!item || this.isMarker(item) || !seed.some((e) => this.sameTopItem(e, item))) {
      return this.withTopOrder(columnLayout, seed);
    }
    const rest = seed.filter((e) => !this.sameTopItem(e, item));
    const visible = rest.filter((e) => !this.isMarker(e));
    const index = Math.max(0, Math.min(visible.length, Math.trunc(Number(toIndex) || 0)));
    const moved = Object.hasOwn(item, "group") ? { group: item.group } : { tag: item.tag };
    let at;
    if (index < visible.length) at = rest.indexOf(visible[index]);
    else at = visible.length > 0 ? rest.indexOf(visible[visible.length - 1]) + 1 : rest.length;
    return this.withTopOrder(columnLayout, [...rest.slice(0, at), moved, ...rest.slice(at)]);
  },

  /**
   * Move a top-level item by `delta` places among the shown top-level items (Alt+Left /
   * Alt+Right on a group grip or an ungrouped tag's grip): past one ungrouped tag or past
   * one whole group per step. No change at the edges or for unknown items.
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {{ group: string } | { tag: string }} item
   * @param {number} delta
   */
  moveTopItemBy(columnLayout, groups, item, delta) {
    const visible = this.visibleTopItems(groups, columnLayout);
    const from = visible.findIndex((e) => this.sameTopItem(e, item));
    const to = from + delta;
    if (from < 0 || to < 0 || to >= visible.length) return this.withTopOrder(columnLayout, this.topItems(groups, columnLayout));
    return this.moveTopItem(columnLayout, groups, item, to);
  },

  /**
   * Move a top-level item right before / after another one (`ref`), e.g. a whole group
   * dropped on the left or right part of an ungrouped tag's header. `ref` equal to `item`
   * or unknown: no change.
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {{ group: string } | { tag: string }} item
   * @param {{ group: string } | { tag: string }} ref
   * @param {"before" | "after"} side
   */
  placeTopItem(columnLayout, groups, item, ref, side) {
    const visible = this.visibleTopItems(groups, columnLayout);
    const rest = visible.filter((e) => !this.sameTopItem(e, item));
    const at = rest.findIndex((e) => this.sameTopItem(e, ref));
    if (at < 0 || this.sameTopItem(item, ref)) return this.withTopOrder(columnLayout, this.topItems(groups, columnLayout));
    return this.moveTopItem(columnLayout, groups, item, at + (side === "after" ? 1 : 0));
  },

  /**
   * Move one tag column so it ends up at `toIndex` INSIDE its group. Only for real groups:
   * ungrouped tags move among the top level (moveTopItem). A tag that is not in that
   * group, or an unknown group: no change.
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {string} groupId
   * @param {string} tag
   * @param {number} toIndex
   */
  moveTag(columnLayout, groups, groupId, tag, toIndex) {
    const group = this.shownGroup(groups, columnLayout, groupId);
    if (!group) return this.withTagOrder(columnLayout, null, null);
    return this.withTagOrder(columnLayout, groupId, this.moveColumn(group.tags, tag, toIndex));
  },

  /**
   * Move one tag column by `delta` places inside its group (Alt+Left / Alt+Right). No change
   * at the group's edges: a tag never jumps into the next group.
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {string} groupId
   * @param {string} tag
   * @param {number} delta
   */
  moveTagBy(columnLayout, groups, groupId, tag, delta) {
    const group = this.shownGroup(groups, columnLayout, groupId);
    if (!group) return this.withTagOrder(columnLayout, null, null);
    return this.withTagOrder(columnLayout, groupId, this.moveColumnBy(group.tags, tag, delta));
  },

  /** A real group as shown now (orderedGroups), or undefined (runs never match). */
  shownGroup(groups, columnLayout, groupId) {
    if (groupId === this.UNGROUPED_ID) return undefined;
    return this.orderedGroups(groups, columnLayout).find((g) => !g.ungrouped && g.id === groupId);
  },

  /**
   * Clean a topOrder list (ADR-0019 §3): keep an entry only if it is a plain object with
   * exactly one own key, `group` or `tag`, whose value is a non-empty string; drop repeats
   * (same key and value, first kept) and every marker after the first. Entries are rebuilt
   * as fresh literals, so a hand-edited "__proto__" stays an ordinary value.
   * @param {unknown} list
   * @returns {Array<{ group: string } | { tag: string }>}
   */
  cleanTopOrder(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const entry of list) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
      const keys = Object.keys(entry);
      if (keys.length !== 1 || (keys[0] !== "group" && keys[0] !== "tag")) continue;
      const value = entry[keys[0]];
      if (typeof value !== "string" || value === "") continue;
      // JSON.stringify of a [key, value] pair is an unambiguous Set key for both kinds.
      const id = JSON.stringify([keys[0], value]);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(keys[0] === "group" ? { group: value } : { tag: value });
    }
    return out;
  },

  /**
   * A copy of the layout's tag orders (own, non-empty string keys; cleaned lists). The key
   * "ungrouped" is dropped: since schema 3 ungrouped tags are ordered by topOrder.
   */
  copyTagOrder(columnLayout) {
    const tagOrder = columnLayout?.tagOrder;
    if (typeof tagOrder !== "object" || tagOrder === null || Array.isArray(tagOrder)) return {};
    // Object.fromEntries defines plain own properties, so even a key "__proto__" from a
    // hand-edited file stays an ordinary key and never changes the object's prototype.
    return Object.fromEntries(
      Object.entries(tagOrder)
        .filter(([groupId]) => groupId !== "" && groupId !== this.UNGROUPED_ID)
        .map(([groupId, tags]) => [groupId, this.cleanKeys(tags)])
        .filter(([, tags]) => tags.length > 0),
    );
  },

  /** New layout with `topOrder` replaced (cleaned). */
  withTopOrder(columnLayout, topOrder) {
    return { topOrder: this.cleanTopOrder(topOrder), tagOrder: this.copyTagOrder(columnLayout) };
  },

  /** New layout with one group's tag order replaced (`groupId` null: plain copy). */
  withTagOrder(columnLayout, groupId, tags) {
    const tagOrder = this.copyTagOrder(columnLayout);
    const out = { topOrder: this.cleanTopOrder(columnLayout?.topOrder), tagOrder };
    if (groupId !== null && groupId !== this.UNGROUPED_ID) {
      // A computed key in an object literal is an own data property ("__proto__"-safe).
      out.tagOrder = { ...tagOrder, [groupId]: this.cleanKeys(tags) };
    }
    return out;
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
   * Share of a cell's width that counts as its "left" and its "right" edge (spec 006c
   * Amendment 2, A2.3; owner answer A2-Q1: proportional bands).
   */
  EDGE_BAND: 0.25,

  /**
   * Which part of a cell the pointer is in, while a tag column is dragged over it (spec 006c
   * Amendment 2, A2.3). `x` / `y` are the pointer's position (MouseEvent clientX / clientY)
   * and `rect` the cell's rectangle (getBoundingClientRect()); both are in CSS pixels from
   * the window's top-left corner, so they can be compared directly.
   * - The outer quarter on each side (full height) is "left" / "right".
   * - The middle half is split into an upper half "top" and a lower half "bottom".
   * Proportional bands, not raw pixel distance: header cells are wide and short, so a raw
   * nearest border would make left / right (the common, harmless sideways move) a thin
   * strip and top / bottom (which can take a tag out of the codebook) easy to hit.
   * `side` is the pointer's half of the cell ("left" / "right"), used when an edge is not
   * allowed on a cell (the fallback). A pointer outside the rect is clamped to its border;
   * a cell with no width or height (hidden) gives `edge` = `side`.
   * @param {number} x
   * @param {number} y
   * @param {{ left: number, top: number, width: number, height: number }} rect
   * @returns {{ edge: "left" | "right" | "top" | "bottom", side: "left" | "right" }}
   */
  dropEdge(x, y, rect) {
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const width = Number(rect?.width) || 0;
    const height = Number(rect?.height) || 0;
    const left = Number(rect?.left) || 0;
    const top = Number(rect?.top) || 0;
    if (!(width > 0)) {
      const side = Number(x) < left ? "left" : "right";
      return { edge: side, side };
    }
    const fx = clamp((Number(x) - left) / width);
    const side = fx < 0.5 ? "left" : "right";
    if (!(height > 0)) return { edge: side, side };
    const fy = clamp((Number(y) - top) / height);
    let edge;
    if (fx < this.EDGE_BAND) edge = "left";
    else if (fx > 1 - this.EDGE_BAND) edge = "right";
    else edge = fy < 0.5 ? "top" : "bottom";
    return { edge, side };
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
   * any other kind of row (the old "Show remaining" detail rows, removed on 2026-11-13)
   * copies the flag of the paper before it. Done in code, not with CSS :nth-child, so an
   * extra row kind never breaks the alternation.
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

  // ---------------------------------------------------------------------------------------
  // layout.json (ADR-0014, ADR-0019): validation, migration, building the data to save
  // ---------------------------------------------------------------------------------------

  /** A new, empty layout (what is used when there is no file yet). Nothing is written. */
  emptyLayout() {
    return {
      schemaVersion: this.SCHEMA_VERSION,
      revision: 0,
      perPaperTable: { ...this.emptyColumnLayout(), manualOrders: {} },
    };
  },

  /**
   * Top-level checks of a layout.json value. Only the frame is checked strictly; the
   * contents (entries, group IDs, tag names, keys) are cleaned up by migrateLayout(),
   * because a bad entry there only costs part of the layout (ADR-0014 §3, ADR-0019 §3).
   * Version 1 frame: perPaperTable { columnOrder: [], manualOrders: {} }.
   * Version 2 frame: perPaperTable { groupOrder: [], tagOrder: {}, manualOrders: {} }.
   * Version 3 frame: perPaperTable { topOrder: [], tagOrder: {}, manualOrders: {} }.
   * - `{ ok: true }`
   * - `{ ok: false, newer: true, reason }`: made by a newer Tabellify; never overwrite.
   * - `{ ok: false, reason }`: not a layout file; never overwrite.
   * `reason` is English for Debug Output only.
   * @param {unknown} data
   * @returns {{ ok: boolean, newer?: boolean, reason?: string }}
   */
  validateLayout(data) {
    const fail = (reason) => ({ ok: false, reason });
    const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
    if (!isObject(data)) return fail("top level is not an object");
    if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) {
      return fail("schemaVersion is not a positive integer");
    }
    if (data.schemaVersion > this.SCHEMA_VERSION) {
      return { ok: false, newer: true, reason: `schemaVersion ${data.schemaVersion} is newer than ${this.SCHEMA_VERSION}` };
    }
    if (!Number.isInteger(data.revision) || data.revision < 0) return fail("revision is not a non-negative integer");
    const table = data.perPaperTable;
    if (!isObject(table)) return fail("perPaperTable is not an object");
    if (data.schemaVersion === 1) {
      if (!Array.isArray(table.columnOrder)) return fail("perPaperTable.columnOrder is not an array");
    } else {
      const orderKey = data.schemaVersion === 2 ? "groupOrder" : "topOrder";
      if (!Array.isArray(table[orderKey])) return fail(`perPaperTable.${orderKey} is not an array`);
      if (!isObject(table.tagOrder)) return fail("perPaperTable.tagOrder is not an object");
    }
    if (!isObject(table.manualOrders)) return fail("perPaperTable.manualOrders is not an object");
    return { ok: true };
  },

  /**
   * Bring VALID data (validateLayout first) up to SCHEMA_VERSION and clean its contents.
   * The steps chain: 1 → 2 → 3.
   * - Version 1 → 2: the old `columnOrder` was for the five summary columns, which no
   *   longer exist, so it is dropped (columns start in codebook order); the hand-made
   *   paper orders are kept unchanged.
   * - Version 2 → 3 (ADR-0019 §4): `groupOrder` becomes `topOrder`, built so the table
   *   looks exactly as schema 2 showed it (see migrateTopOrder).
   * - Cleaning: topOrder as cleanTopOrder; each tag order keeps non-empty strings without
   *   duplicates, entries with an empty group ID, the key "ungrouped" or an empty list are
   *   dropped; each manual order keeps non-empty string keys without duplicates, empty ones
   *   are dropped.
   * Pure: the input is not changed, and loading never writes. The file on disk is only
   * rewritten (as version 3) by the next save after a user action; the previous file is
   * then kept as layout.json.bak.
   * @param {any} data
   * @returns {{ schemaVersion: number, revision: number,
   *   perPaperTable: { topOrder: Array<{ group: string } | { tag: string }>,
   *     tagOrder: Record<string, string[]>, manualOrders: Record<string, string[]> } }}
   */
  migrateLayout(data) {
    let version = data.schemaVersion;
    let table = data.perPaperTable;
    if (version === 1) {
      table = { groupOrder: [], tagOrder: {}, manualOrders: table.manualOrders };
      version = 2;
    }
    if (version === 2) {
      table = { topOrder: this.migrateTopOrder(table), tagOrder: table.tagOrder, manualOrders: table.manualOrders };
      version = 3;
    }
    if (version !== this.SCHEMA_VERSION) {
      throw new Error(`no migration from schemaVersion ${data.schemaVersion}`);
    }
    return {
      schemaVersion: this.SCHEMA_VERSION,
      revision: data.revision,
      perPaperTable: {
        topOrder: this.cleanTopOrder(table.topOrder),
        tagOrder: this.copyTagOrder(table),
        manualOrders: this.cleanManualOrders(Object.entries(table.manualOrders)),
      },
    };
  },

  /**
   * Schema 2 → 3 top-level order (ADR-0019 §4). Schema 2 listed BLOCKS in `groupOrder`,
   * with all ungrouped tags in one block "ungrouped" ordered by `tagOrder.ungrouped`.
   * - Each ID in groupOrder, in order: "ungrouped" becomes one `{ tag }` per name in
   *   tagOrder.ungrouped followed by the home marker; any other ID becomes `{ group: id }`.
   * - groupOrder not empty but without "ungrouped": schema 2 showed the ungrouped block at
   *   the far right (after the listed groups), so the `{ tag }` entries and the marker are
   *   appended.
   * - groupOrder empty: schema 2 showed the ungrouped block first, so topOrder is those
   *   `{ tag }` entries plus the marker, or empty when there are none (the marker then
   *   defaults to the far left anyway).
   * @param {{ groupOrder?: unknown, tagOrder?: unknown }} table  A version 2 perPaperTable
   * @returns {Array<{ group: string } | { tag: string }>}
   */
  migrateTopOrder(table) {
    const groupOrder = this.cleanKeys(table.groupOrder);
    const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
    const saved = isObject(table.tagOrder) && Object.hasOwn(table.tagOrder, this.UNGROUPED_ID)
      ? this.cleanKeys(table.tagOrder[this.UNGROUPED_ID])
      : [];
    const home = [...saved.map((tag) => ({ tag })), { group: this.UNGROUPED_ID }];
    if (groupOrder.length === 0) return saved.length > 0 ? home : [];
    const out = groupOrder.flatMap((id) => (id === this.UNGROUPED_ID ? home : [{ group: id }]));
    if (!groupOrder.includes(this.UNGROUPED_ID)) out.push(...home);
    return out;
  },

  /**
   * Non-empty strings only, first occurrence kept.
   * @param {unknown} list
   * @returns {string[]}
   */
  cleanKeys(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.filter((k) => typeof k === "string" && k !== ""))];
  },

  /**
   * Manual orders as a plain object: collection key → cleaned item keys. Empty keys and
   * empty orders are dropped; with `knownCollectionKeys`, so are other collections.
   * Object.fromEntries keeps every key an ordinary own property ("__proto__"-safe).
   * @param {Iterable<[unknown, unknown]>} entries
   * @param {Set<string> | null} [knownCollectionKeys]
   * @returns {Record<string, string[]>}
   */
  cleanManualOrders(entries, knownCollectionKeys = null) {
    const out = [];
    for (const [collectionKey, order] of entries) {
      if (typeof collectionKey !== "string" || collectionKey === "") continue;
      if (knownCollectionKeys && !knownCollectionKeys.has(collectionKey)) continue;
      const keys = this.cleanKeys(order);
      if (keys.length > 0) out.push([collectionKey, keys]);
    }
    return Object.fromEntries(out);
  },

  /**
   * The `perPaperTable` object to save. Collections that no longer exist are pruned here:
   * when `knownCollectionKeys` is given (a fresh snapshot of the library's collections),
   * orders of other collections are left out. Empty orders are left out too. Entries of the
   * column layout are only cleaned, not pruned: groups and tags the codebook no longer has
   * are ignored when shown (topItems) and drop out with the next move that rewrites
   * topOrder (ADR-0019 §3).
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Iterable<[string, unknown]>} manualOrders  e.g. a Map of collection key → item keys
   * @param {Set<string> | null} [knownCollectionKeys]
   * @returns {{ topOrder: Array<{ group: string } | { tag: string }>,
   *   tagOrder: Record<string, string[]>, manualOrders: Record<string, string[]> }}
   */
  layoutData(columnLayout, manualOrders, knownCollectionKeys = null) {
    return {
      topOrder: this.cleanTopOrder(columnLayout?.topOrder),
      tagOrder: this.copyTagOrder(columnLayout),
      manualOrders: this.cleanManualOrders(manualOrders, knownCollectionKeys),
    };
  },
};
