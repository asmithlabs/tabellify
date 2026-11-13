/* Tabellify — table-layout-model.js (Feature 005c: per-paper table layout, pure logic)
 *
 * The per-paper table in the Tabellify tab can be rearranged by the user: its codebook tag
 * columns can be put in another order (a tag inside its super-tag group, or a whole group
 * among the groups; owner decision 2026-11-13), and its papers (rows) can be put in a
 * hand-made "manual order" per collection. Both are done by mouse (drag-and-drop) and by
 * keyboard (Alt+arrow keys). The column order is the user's own: it never changes the
 * codebook. See docs/features/005c-table-layout.md.
 *
 * This file holds only the RULES (which order results from a move, where a drop lands,
 * how far to auto-scroll, which rows are shaded) and the checks for the saved layout file
 * layout.json (ADR-0014). workspace.js does the DOM work; layout-store.js does the file
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
   * amendment). 1 = the old five summary columns; 2 = codebook tag columns grouped by
   * super-tag (groupOrder + tagOrder). migrateLayout() turns 1 into 2.
   */
  SCHEMA_VERSION: 2,

  // ---------------------------------------------------------------------------------------
  // Generic list moves (used for groups, tag columns and the tests' own lists)
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
  // Codebook tag columns (owner decision 2026-11-13)
  //
  // The table's columns are: grip, Title, then one column per codebook tag grouped under
  // its super-tag (group), then k/M. Title and k/M never move. A tag column moves only
  // inside its own group; a whole group moves among the groups. The user's order is a
  // `columnLayout` = { groupOrder: group IDs, tagOrder: { groupId: tag names } }, kept
  // apart from the codebook: moving a column NEVER changes the codebook.
  //
  // `groups` below is what TabellifyTagMonitor.codebookGroups() returns:
  // [{ id, name, tags: string[] }] in codebook order. Tag names are unique in a codebook.
  // ---------------------------------------------------------------------------------------

  /** A column layout that means "codebook order" (nothing moved yet). */
  emptyColumnLayout() {
    return { groupOrder: [], tagOrder: {} };
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
   * The groups and tag columns in the order to show. Groups and tags the layout does not
   * know (new in the codebook) are appended in codebook order; IDs and names in the layout
   * that the codebook no longer has are ignored. Groups without tags have no column and
   * are left out.
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups  Codebook order
   * @param {{ groupOrder?: unknown, tagOrder?: unknown } | null} [columnLayout]
   * @returns {Array<{ id: string, name: string, tags: string[] }>}
   */
  orderedGroups(groups, columnLayout) {
    const withTags = (groups ?? []).filter((g) => g.tags.length > 0);
    const byId = new Map(withTags.map((g) => [g.id, g]));
    const ids = this.mergeOrder(withTags.map((g) => g.id), columnLayout?.groupOrder);
    return ids.map((id) => {
      const g = byId.get(id);
      return { id: g.id, name: g.name, tags: this.mergeOrder(g.tags, this.savedTagOrder(columnLayout, id)) };
    });
  },

  /**
   * True when the columns would show in codebook order (so "Reset columns" has nothing
   * to do).
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {{ groupOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @returns {boolean}
   */
  isCodebookOrder(groups, columnLayout) {
    const key = (list) => JSON.stringify(list.map((g) => [g.id, g.tags]));
    return key(this.orderedGroups(groups, columnLayout)) === key(this.orderedGroups(groups, null));
  },

  /**
   * Move a whole group (with its tag columns) so it ends up at `toIndex` among the shown
   * groups. Starts from the order shown now, so the result only lists current groups.
   * Unknown groups: no change.
   * @param {{ groupOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {string} groupId
   * @param {number} toIndex
   * @returns {{ groupOrder: string[], tagOrder: Record<string, string[]> }}
   */
  moveGroup(columnLayout, groups, groupId, toIndex) {
    const seed = this.orderedGroups(groups, columnLayout).map((g) => g.id);
    return this.withGroupOrder(columnLayout, this.moveColumn(seed, groupId, toIndex));
  },

  /**
   * Move a group by `delta` places among the groups (Alt+Left / Alt+Right on its header).
   * @param {{ groupOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {string} groupId
   * @param {number} delta
   */
  moveGroupBy(columnLayout, groups, groupId, delta) {
    const seed = this.orderedGroups(groups, columnLayout).map((g) => g.id);
    return this.withGroupOrder(columnLayout, this.moveColumnBy(seed, groupId, delta));
  },

  /**
   * Move one tag column so it ends up at `toIndex` INSIDE its group. A tag never leaves its
   * group (its super-tag); a tag that is not in that group: no change.
   * @param {{ groupOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {string} groupId
   * @param {string} tag
   * @param {number} toIndex
   */
  moveTag(columnLayout, groups, groupId, tag, toIndex) {
    const group = this.orderedGroups(groups, columnLayout).find((g) => g.id === groupId);
    if (!group) return this.withTagOrder(columnLayout, null, null);
    return this.withTagOrder(columnLayout, groupId, this.moveColumn(group.tags, tag, toIndex));
  },

  /**
   * Move one tag column by `delta` places inside its group (Alt+Left / Alt+Right). No change
   * at the group's edges: a tag never jumps into the next group.
   * @param {{ groupOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Array<{ id: string, name: string, tags: string[] }>} groups
   * @param {string} groupId
   * @param {string} tag
   * @param {number} delta
   */
  moveTagBy(columnLayout, groups, groupId, tag, delta) {
    const group = this.orderedGroups(groups, columnLayout).find((g) => g.id === groupId);
    if (!group) return this.withTagOrder(columnLayout, null, null);
    return this.withTagOrder(columnLayout, groupId, this.moveColumnBy(group.tags, tag, delta));
  },

  /** A copy of the layout's tag orders (own, non-empty string keys; cleaned lists). */
  copyTagOrder(columnLayout) {
    const tagOrder = columnLayout?.tagOrder;
    if (typeof tagOrder !== "object" || tagOrder === null || Array.isArray(tagOrder)) return {};
    // Object.fromEntries defines plain own properties, so even a key "__proto__" from a
    // hand-edited file stays an ordinary key and never changes the object's prototype.
    return Object.fromEntries(
      Object.entries(tagOrder)
        .filter(([groupId]) => groupId !== "")
        .map(([groupId, tags]) => [groupId, this.cleanKeys(tags)])
        .filter(([, tags]) => tags.length > 0),
    );
  },

  /** New layout with `groupOrder` replaced. */
  withGroupOrder(columnLayout, groupOrder) {
    return { groupOrder: this.cleanKeys(groupOrder), tagOrder: this.copyTagOrder(columnLayout) };
  },

  /** New layout with one group's tag order replaced (`groupId` null: plain copy). */
  withTagOrder(columnLayout, groupId, tags) {
    const tagOrder = this.copyTagOrder(columnLayout);
    const out = { groupOrder: this.cleanKeys(columnLayout?.groupOrder), tagOrder };
    if (groupId !== null) {
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
  // layout.json (ADR-0014): validation, migration, building the data to save
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
   * contents (group IDs, tag names, keys) are cleaned up by migrateLayout(), because a bad
   * entry there only costs part of the layout (ADR-0014 §3).
   * Version 1 frame: perPaperTable { columnOrder: [], manualOrders: {} }.
   * Version 2 frame: perPaperTable { groupOrder: [], tagOrder: {}, manualOrders: {} }.
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
      if (!Array.isArray(table.groupOrder)) return fail("perPaperTable.groupOrder is not an array");
      if (!isObject(table.tagOrder)) return fail("perPaperTable.tagOrder is not an object");
    }
    if (!isObject(table.manualOrders)) return fail("perPaperTable.manualOrders is not an object");
    return { ok: true };
  },

  /**
   * Bring VALID data (validateLayout first) up to SCHEMA_VERSION and clean its contents.
   * - Version 1 → 2: the old `columnOrder` was for the five summary columns, which no
   *   longer exist, so it is dropped (columns start in codebook order); the hand-made
   *   paper orders are kept unchanged.
   * - Cleaning: groupOrder keeps non-empty strings without duplicates; each tag order the
   *   same, entries with an empty group ID or an empty list are dropped; each manual order
   *   keeps non-empty string keys without duplicates, empty ones are dropped.
   * Pure: the input is not changed. The file on disk is only rewritten (as version 2) by the
   * next save after a user action; the previous file is then kept as layout.json.bak.
   * @param {any} data
   * @returns {{ schemaVersion: number, revision: number,
   *   perPaperTable: { groupOrder: string[], tagOrder: Record<string, string[]>,
   *                    manualOrders: Record<string, string[]> } }}
   */
  migrateLayout(data) {
    let version = data.schemaVersion;
    let table = data.perPaperTable;
    if (version === 1) {
      table = { ...this.emptyColumnLayout(), manualOrders: table.manualOrders };
      version = 2;
    }
    if (version !== this.SCHEMA_VERSION) {
      throw new Error(`no migration from schemaVersion ${data.schemaVersion}`);
    }
    return {
      schemaVersion: this.SCHEMA_VERSION,
      revision: data.revision,
      perPaperTable: {
        groupOrder: this.cleanKeys(table.groupOrder),
        tagOrder: this.copyTagOrder(table),
        manualOrders: this.cleanManualOrders(Object.entries(table.manualOrders)),
      },
    };
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
   * orders of other collections are left out. Empty orders are left out too. Group IDs and
   * tag names of the column layout are only cleaned, not pruned: ones the codebook no
   * longer has are ignored when shown (orderedGroups) and drop out with the next move of
   * their group.
   * @param {{ groupOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {Iterable<[string, unknown]>} manualOrders  e.g. a Map of collection key → item keys
   * @param {Set<string> | null} [knownCollectionKeys]
   * @returns {{ groupOrder: string[], tagOrder: Record<string, string[]>,
   *   manualOrders: Record<string, string[]> }}
   */
  layoutData(columnLayout, manualOrders, knownCollectionKeys = null) {
    return {
      groupOrder: this.cleanKeys(columnLayout?.groupOrder),
      tagOrder: this.copyTagOrder(columnLayout),
      manualOrders: this.cleanManualOrders(manualOrders, knownCollectionKeys),
    };
  },
};
