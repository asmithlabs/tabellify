/* Tabellify — saved-tables-model.js (Feature 007b: saved tables, pure logic; ADR-0018)
 *
 * A SAVED TABLE keeps two things (ADR-0018 §1):
 * - its DEFINITION, the "recipe": which collection, which codebook, the column order, the
 *   paper order (sort or hand-made order) and the "count tags on the paper itself" switch;
 * - a SNAPSHOT of its contents, the "photo": the tag columns (grouped as shown), and the
 *   papers in the shown order with their title and which columns showed ✓.
 * Opening a saved table shows the snapshot exactly as it was saved. "Show live" runs the
 * recipe again on today's library (liveView below). All saved tables live in one file,
 * tables.json, read and written by tables-store.js; this file only holds the RULES:
 * checking a loaded file (validate), building and reading snapshots, ordering papers, and
 * the edits (add, update, delete) that return a NEW data object for the store to save.
 *
 * PURE: no Zotero, page (DOM), file or clock globals, so tests/unit/saved-tables-model.test.mjs
 * can run it in Node. The caller passes the current time (`now`, an ISO string such as
 * "2026-11-14T15:40:03.000Z") into every edit.
 *
 * IMMUTABLE STYLE (as in the other models): no function changes its inputs. Every object
 * is rebuilt from literals or Object.fromEntries, and keys are checked with Object.hasOwn.
 * tables.json can be edited by hand, so a key such as "__proto__" must stay an ordinary key
 * and never reach an object's prototype.
 *
 * Uses TabellifyTagMonitor and TabellifyTableLayout (pure models loaded before this file in
 * workspace.xhtml).
 *
 * Why src/content/ and not src/modules/: only src/content/ has a chrome:// URL the
 * workspace document can load a script from (see the top of workspace.js).
 */
"use strict";

/**
 * One global object (a property of the window, or of the Node test's sandbox, because it is
 * declared with `var`). workspace.xhtml loads this file after layout-store.js and before
 * tables-store.js and workspace.js.
 */
var TabellifySavedTables = {
  /** Version of the tables.json format this code reads and writes (ADR-0018 §1). */
  SCHEMA_VERSION: 1,

  /** Size limits (ADR-0018 §4). Lengths are counted in UTF-16 units, as `maxlength` does. */
  LIMITS: { tables: 100, rows: 5000, columns: 500, name: 200, description: 2000, title: 2000, fileChars: 20000000 },

  /** View id of a run of ungrouped tags (same value as TabellifyTableLayout.UNGROUPED_ID). */
  UNGROUPED_ID: "ungrouped",

  /** Refusal reasons: Fluent IDs the workspace shows (no arguments). */
  ERR_NAME_EMPTY: "tabellify-saved-error-name-empty",
  ERR_LIMIT_TABLES: "tabellify-saved-error-limit-tables",
  ERR_LIMIT_ROWS: "tabellify-saved-error-limit-rows",
  ERR_LIMIT_COLUMNS: "tabellify-saved-error-limit-columns",
  ERR_LIMIT_FILE: "tabellify-saved-error-limit-file",
  ERR_UNKNOWN_TABLE: "tabellify-saved-gone",

  /** Table IDs: "t" and a positive whole number without leading zeros ("t1", "t12"). */
  ID_PATTERN: /^t[1-9][0-9]*$/,

  /** Collection keys: "<libraryID>/<collection key>", the shape layout.json uses. */
  COLLECTION_KEY_PATTERN: /^[0-9]+\/[A-Za-z0-9]+$/,

  /** Longest item key in a snapshot row (Zotero's keys have 8 characters). */
  ITEM_KEY_MAX: 32,

  // ---------------------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------------------

  /** A plain object (not null, not an array). */
  isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  },

  /** True when `obj` has no own keys other than `allowed` (strict shape check). */
  onlyKeys(obj, allowed) {
    return Object.keys(obj).every((k) => allowed.includes(k));
  },

  /**
   * The shape Date.prototype.toISOString() writes: "2026-11-14T15:40:03.000Z" (UTC).
   * Checked as well as Date.parse, because Date.parse alone also reads loose text such as
   * "Note-123" (engines guess a date from it).
   */
  ISO_DATE_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,

  /** An ISO date string that Date.parse reads as a real time. */
  isDate(value) {
    return typeof value === "string" && this.ISO_DATE_PATTERN.test(value) && Number.isFinite(Date.parse(value));
  },

  /**
   * Cut `text` to at most `max` UTF-16 units. When cut, the end is "…" (so the result is at
   * most `max` long) and a character made of two UTF-16 units (a "surrogate pair", e.g. an
   * emoji) is never split in half.
   * @param {string} text
   * @param {number} max
   * @param {boolean} [ellipsis]
   * @returns {string}
   */
  cut(text, max, ellipsis = true) {
    const s = String(text ?? "");
    if (s.length <= max) return s;
    let end = ellipsis ? max - 1 : max;
    // A high surrogate (0xD800–0xDBFF) at the cut point would lose its partner: cut before it.
    const code = s.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    return s.slice(0, end) + (ellipsis ? "…" : "");
  },

  /** The trimmed Name as it is stored (at most LIMITS.name, never ending in a space). */
  cleanName(name) {
    return this.cut(String(name ?? "").trim(), this.LIMITS.name, false).trim();
  },

  /** True for a view block of ungrouped tags (TabellifyTableLayout.orderedGroups runs). */
  isUngroupedBlock(group) {
    return group?.ungrouped === true || group?.id === this.UNGROUPED_ID;
  },

  /** The column names of a snapshot, left to right over all blocks. */
  snapshotColumns(snapshot) {
    return (snapshot?.blocks ?? []).flatMap((b) => b.tags ?? []);
  },

  // ---------------------------------------------------------------------------------------
  // The file: empty data, validation, migration (ADR-0018 §3)
  // ---------------------------------------------------------------------------------------

  /** The data used when there is no file yet. Nothing is written for it. */
  emptyData() {
    return { schemaVersion: this.SCHEMA_VERSION, revision: 0, nextId: 1, tables: [] };
  },

  /**
   * Strict check of a tables.json value. One bad table makes the whole file invalid (saving
   * the others would delete it from disk, ADR-0018 §3).
   * - `{ ok: true }`
   * - `{ ok: false, newer: true, reason }`: made by a newer Tabellify; never overwrite.
   * - `{ ok: false, reason }`: not a valid file; never overwrite.
   * `reason` is English for Debug Output. It names the FIELD, never its value, so no title,
   * name or description can reach the log.
   * @param {unknown} data
   * @returns {{ ok: boolean, newer?: boolean, reason?: string }}
   */
  validate(data) {
    const fail = (reason) => ({ ok: false, reason });
    if (!this.isObject(data)) return fail("top level is not an object");
    if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) return fail("schemaVersion is not a positive integer");
    if (data.schemaVersion > this.SCHEMA_VERSION) {
      return { ok: false, newer: true, reason: `schemaVersion ${data.schemaVersion} is newer than ${this.SCHEMA_VERSION}` };
    }
    if (!this.onlyKeys(data, ["schemaVersion", "revision", "nextId", "tables"])) return fail("unknown top-level key");
    if (!Number.isInteger(data.revision) || data.revision < 0) return fail("revision is not a non-negative integer");
    if (!Number.isInteger(data.nextId) || data.nextId < 1) return fail("nextId is not a positive integer");
    if (!Array.isArray(data.tables)) return fail("tables is not an array");
    if (data.tables.length > this.LIMITS.tables) return fail(`more than ${this.LIMITS.tables} tables`);
    const ids = new Set();
    for (let i = 0; i < data.tables.length; i++) {
      const reason = this.tableProblem(data.tables[i], data.nextId);
      if (reason) return fail(`tables[${i}]: ${reason}`);
      if (ids.has(data.tables[i].id)) return fail(`tables[${i}]: duplicate id`);
      ids.add(data.tables[i].id);
    }
    return { ok: true };
  },

  /**
   * What is wrong with one saved table, or "" when it is valid.
   * @param {unknown} t
   * @param {number} nextId
   * @returns {string}
   */
  tableProblem(t, nextId) {
    if (!this.isObject(t)) return "not an object";
    if (!this.onlyKeys(t, ["id", "name", "description", "createdAt", "updatedAt", "definition", "snapshot"])) return "unknown key";
    if (typeof t.id !== "string" || !this.ID_PATTERN.test(t.id)) return "id is not t<number>";
    if (Number(t.id.slice(1)) >= nextId) return "id is not below nextId";
    if (typeof t.name !== "string" || t.name.trim() !== t.name || t.name.length < 1 || t.name.length > this.LIMITS.name) {
      return `name is not a trimmed text of 1-${this.LIMITS.name} characters`;
    }
    if (typeof t.description !== "string" || t.description.length > this.LIMITS.description) {
      return `description is not a text of at most ${this.LIMITS.description} characters`;
    }
    if (!this.isDate(t.createdAt)) return "createdAt is not a date";
    if (!this.isDate(t.updatedAt)) return "updatedAt is not a date";
    const def = this.definitionProblem(t.definition);
    if (def) return `definition.${def}`;
    const snap = this.snapshotProblem(t.snapshot);
    if (snap) return `snapshot.${snap}`;
    return "";
  },

  /** What is wrong with a definition, or "". */
  definitionProblem(d) {
    if (!this.isObject(d)) return "is not an object";
    if (!this.onlyKeys(d, ["collectionKey", "codebookId", "columnLayout", "sort", "manualOrder", "countItemTags"])) return "unknown key";
    if (typeof d.collectionKey !== "string" || !this.COLLECTION_KEY_PATTERN.test(d.collectionKey)) return "collectionKey is not <library>/<key>";
    if (typeof d.codebookId !== "string" || d.codebookId === "") return "codebookId is not a non-empty text";
    const layout = d.columnLayout;
    if (!this.isObject(layout) || !this.onlyKeys(layout, ["topOrder", "tagOrder"])) return "columnLayout is not an object";
    if (!Array.isArray(layout.topOrder)) return "columnLayout.topOrder is not an array";
    if (!this.isObject(layout.tagOrder)) return "columnLayout.tagOrder is not an object";
    if (!this.isObject(d.sort) || !this.onlyKeys(d.sort, ["key", "direction"])) return "sort is not an object";
    if (typeof d.sort.key !== "string" || d.sort.key === "") return "sort.key is not a non-empty text";
    if (d.sort.direction !== "asc" && d.sort.direction !== "desc") return "sort.direction is not asc or desc";
    if (d.manualOrder !== null) {
      if (!Array.isArray(d.manualOrder)) return "manualOrder is not null or an array";
      if (!d.manualOrder.every((k) => typeof k === "string" && k !== "")) return "manualOrder has an empty or non-text key";
    }
    if (typeof d.countItemTags !== "boolean") return "countItemTags is not true or false";
    return "";
  },

  /** What is wrong with a snapshot, or "". */
  snapshotProblem(s) {
    if (!this.isObject(s)) return "is not an object";
    if (!this.onlyKeys(s, ["takenAt", "collectionName", "blocks", "rows"])) return "unknown key";
    if (!this.isDate(s.takenAt)) return "takenAt is not a date";
    if (typeof s.collectionName !== "string") return "collectionName is not a text";
    if (!Array.isArray(s.blocks)) return "blocks is not an array";
    const tags = new Set();
    let previousUngrouped = false;
    for (let i = 0; i < s.blocks.length; i++) {
      const b = s.blocks[i];
      if (!this.isObject(b) || !this.onlyKeys(b, ["group", "tags"])) return `blocks[${i}] is not an object`;
      if (b.group !== null && typeof b.group !== "string") return `blocks[${i}].group is not null or a text`;
      if (b.group === null && previousUngrouped) return `blocks[${i}] is a second ungrouped block in a row`;
      previousUngrouped = b.group === null;
      if (!Array.isArray(b.tags) || b.tags.length === 0) return `blocks[${i}].tags is not a non-empty array`;
      for (const tag of b.tags) {
        if (typeof tag !== "string" || tag === "") return `blocks[${i}].tags has an empty or non-text name`;
        if (tags.has(tag)) return `blocks[${i}].tags repeats a column`;
        tags.add(tag);
      }
      if (tags.size > this.LIMITS.columns) return `more than ${this.LIMITS.columns} columns`;
    }
    const columns = tags.size;
    if (!Array.isArray(s.rows)) return "rows is not an array";
    if (s.rows.length > this.LIMITS.rows) return `more than ${this.LIMITS.rows} rows`;
    for (let i = 0; i < s.rows.length; i++) {
      const r = s.rows[i];
      if (!this.isObject(r) || !this.onlyKeys(r, ["itemKey", "title", "untitled", "present"])) return `rows[${i}] is not an object`;
      if (typeof r.itemKey !== "string" || r.itemKey === "" || r.itemKey.length > this.ITEM_KEY_MAX) return `rows[${i}].itemKey is not a key`;
      if (typeof r.title !== "string" || r.title.length > this.LIMITS.title) return `rows[${i}].title is not a text of at most ${this.LIMITS.title} characters`;
      if (typeof r.untitled !== "boolean") return `rows[${i}].untitled is not true or false`;
      if (!Array.isArray(r.present)) return `rows[${i}].present is not an array`;
      for (let j = 0; j < r.present.length; j++) {
        const n = r.present[j];
        if (!Number.isInteger(n) || n < 0 || n >= columns) return `rows[${i}].present has an index out of range`;
        if (j > 0 && n <= r.present[j - 1]) return `rows[${i}].present is not strictly increasing`;
      }
    }
    return "";
  },

  /**
   * Bring VALID data (validate first) up to SCHEMA_VERSION as a clean, separate copy.
   * Version 1 is the first version, so this is a copy; later versions add steps here.
   * The column layout's entries are cleaned as in layout.json (ADR-0019 §3).
   * @param {any} data
   * @returns {{ schemaVersion: number, revision: number, nextId: number, tables: object[] }}
   */
  migrate(data) {
    if (data.schemaVersion !== this.SCHEMA_VERSION) throw new Error(`no migration from schemaVersion ${data.schemaVersion}`);
    return {
      schemaVersion: this.SCHEMA_VERSION,
      revision: data.revision,
      nextId: data.nextId,
      tables: data.tables.map((t) => this.copyTable(t)),
    };
  },

  /** A clean copy of one (valid) table. */
  copyTable(t) {
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      definition: this.copyDefinition(t.definition),
      snapshot: this.copySnapshot(t.snapshot),
    };
  },

  /** A clean copy of a (valid) definition. */
  copyDefinition(d) {
    return {
      collectionKey: d.collectionKey,
      codebookId: d.codebookId,
      columnLayout: {
        topOrder: TabellifyTableLayout.cleanTopOrder(d.columnLayout?.topOrder),
        tagOrder: TabellifyTableLayout.copyTagOrder(d.columnLayout),
      },
      sort: { key: d.sort.key, direction: d.sort.direction },
      manualOrder: Array.isArray(d.manualOrder) ? [...d.manualOrder] : null,
      countItemTags: d.countItemTags,
    };
  },

  /** A clean copy of a (valid) snapshot. */
  copySnapshot(s) {
    return {
      takenAt: s.takenAt,
      collectionName: s.collectionName,
      blocks: s.blocks.map((b) => ({ group: b.group, tags: [...b.tags] })),
      rows: s.rows.map((r) => ({ itemKey: r.itemKey, title: r.title, untitled: r.untitled, present: [...r.present] })),
    };
  },

  // ---------------------------------------------------------------------------------------
  // Building a saved table: definition and snapshot
  // ---------------------------------------------------------------------------------------

  /**
   * The definition (recipe) of a table, from the workspace's current settings. The column
   * layout is COPIED and cleaned, so later moves in the workspace do not change it.
   * @param {{ collectionKey: string, codebookId: string,
   *   columnLayout: { topOrder?: unknown, tagOrder?: unknown } | null,
   *   sort: { key: string, direction: string }, manualOrder: string[] | null,
   *   countItemTags: boolean }} input
   */
  buildDefinition({ collectionKey, codebookId, columnLayout, sort, manualOrder, countItemTags }) {
    const key = typeof sort?.key === "string" && sort.key !== "" ? sort.key : TabellifyTagMonitor.DEFAULT_SORT.key;
    return {
      collectionKey: String(collectionKey ?? ""),
      codebookId: String(codebookId ?? ""),
      columnLayout: {
        topOrder: TabellifyTableLayout.cleanTopOrder(columnLayout?.topOrder),
        tagOrder: TabellifyTableLayout.copyTagOrder(columnLayout),
      },
      sort: { key, direction: sort?.direction === "desc" ? "desc" : "asc" },
      manualOrder: key === TabellifyTableLayout.MANUAL && Array.isArray(manualOrder)
        ? TabellifyTableLayout.cleanKeys(manualOrder)
        : null,
      countItemTags: countItemTags === true,
    };
  },

  /**
   * The snapshot (photo) of the table as shown.
   * - blocks: the tag columns left to right; `group` = the group's name, or null for a run
   *   of ungrouped tags (neighbouring runs merged).
   * - rows: the papers in the shown order: item key, title as shown ("" when untitled, cut
   *   to LIMITS.title), and `present` = indexes of the columns with ✓.
   * k, M and "counting" are not stored: snapshotView derives them (ADR-0018 §1).
   * @param {{ groups?: Array<{ id: string, name?: string, tags?: string[], ungrouped?: boolean }>,
   *   papers?: Array<{ title?: string, untitled?: boolean, groups?: Array<{ present?: string[] }> }>,
   *   counting?: boolean }} view  The workspace's tableGroups / tableRows / tableCounting
   * @param {{ keyOf: (paper: object) => string, collectionName: string, takenAt: string }} options
   * @returns {{ ok: true, snapshot: object } | { ok: false, error: string, limit: "rows" | "columns" }}
   */
  buildSnapshot(view, { keyOf, collectionName, takenAt }) {
    const blocks = [];
    for (const g of view?.groups ?? []) {
      const tags = (g.tags ?? []).map((t) => String(t));
      if (tags.length === 0) continue;
      const last = blocks[blocks.length - 1];
      if (this.isUngroupedBlock(g)) {
        if (last && last.group === null) last.tags.push(...tags);
        else blocks.push({ group: null, tags });
      } else {
        blocks.push({ group: String(g.name ?? ""), tags });
      }
    }
    const columns = blocks.flatMap((b) => b.tags);
    if (columns.length > this.LIMITS.columns) return { ok: false, error: this.ERR_LIMIT_COLUMNS, limit: "columns" };
    const papers = view?.papers ?? [];
    if (papers.length > this.LIMITS.rows) return { ok: false, error: this.ERR_LIMIT_ROWS, limit: "rows" };
    // Column name → index (a Map, so any tag name is safe as a key).
    const index = new Map();
    columns.forEach((tag, i) => { if (!index.has(tag)) index.set(tag, i); });
    const rows = papers.map((paper) => {
      const present = new Set();
      for (const g of paper.groups ?? []) {
        for (const tag of g.present ?? []) if (index.has(tag)) present.add(index.get(tag));
      }
      const untitled = paper.untitled === true;
      return {
        itemKey: String(keyOf(paper) ?? ""),
        title: untitled ? "" : this.cut(paper.title, this.LIMITS.title),
        untitled,
        present: [...present].sort((a, b) => a - b),
      };
    });
    return {
      ok: true,
      snapshot: { takenAt: String(takenAt ?? ""), collectionName: String(collectionName ?? ""), blocks, rows },
    };
  },

  /**
   * ADAPTER: a stored snapshot → the `{ groups, papers, counting }` shape that the
   * workspace's modal table (viewTableRows) and TabellifyCsv.build already take.
   * - Ungrouped blocks get id "ungrouped" and run 0, 1, … (as orderedGroups makes them);
   *   real groups get ids "s0", "s1", … (never looked up in the codebook).
   * - Per paper: count = number of ✓, total = number of columns (M), and `groups` lists
   *   the ✓ tags per block.
   * - counting = at least one column (as F005: without tag columns k/M shows "–").
   * @param {object} snapshot
   * @returns {{ groups: object[], papers: object[], counting: boolean }}
   */
  snapshotView(snapshot) {
    let run = 0;
    let real = 0;
    const groups = (snapshot?.blocks ?? []).map((b) => (b.group === null
      ? { id: this.UNGROUPED_ID, run: run++, name: "", tags: [...b.tags], ungrouped: true }
      : { id: `s${real++}`, name: b.group, tags: [...b.tags] }));
    const columns = groups.flatMap((g) => g.tags);
    const total = columns.length;
    const papers = (snapshot?.rows ?? []).map((r, i) => {
      const present = new Set(r.present.map((n) => columns[n]));
      return {
        id: i,
        itemKey: r.itemKey,
        title: r.title,
        untitled: r.untitled,
        count: r.present.length,
        total,
        groups: groups.map((g) => ({ id: g.id, name: g.name, present: g.tags.filter((t) => present.has(t)) })),
      };
    });
    return { groups, papers, counting: total > 0 };
  },

  // ---------------------------------------------------------------------------------------
  // Paper order and the live view
  // ---------------------------------------------------------------------------------------

  /**
   * The papers in a saved (or the workspace's) order. Same rules as the page table:
   * - "manual": the hand-made order by item key; papers it does not know follow in the
   *   default order; without a manual order, the default order;
   * - a tag column's key whose tag is not among the papers' codebook tags (it left the
   *   codebook): the default sort (TabellifyTagMonitor.DEFAULT_SORT);
   * - otherwise TabellifyTagMonitor.sortPapers with the key and direction.
   * @template P
   * @param {P[]} papers  TabellifyTagMonitor.summarize papers
   * @param {{ key: string, direction: string } | null} sort
   * @param {string[] | null} manualOrder
   * @param {(paper: P) => string | undefined} keyOf
   * @returns {P[]}
   */
  orderPapers(papers, sort, manualOrder, keyOf) {
    const { key: defaultKey, direction: defaultDirection } = TabellifyTagMonitor.DEFAULT_SORT;
    const key = sort?.key ?? defaultKey;
    const direction = sort?.direction ?? defaultDirection;
    if (key === TabellifyTableLayout.MANUAL) {
      const fallback = TabellifyTagMonitor.sortPapers(papers, defaultKey, defaultDirection);
      if (!Array.isArray(manualOrder)) return fallback;
      return TabellifyTableLayout.applyManualOrder(papers, manualOrder, fallback, keyOf);
    }
    const tag = TabellifyTagMonitor.sortKeyTag(key);
    if (tag !== null) {
      // The codebook tags known to these papers: summarize lists each one as present or
      // remaining for every paper.
      const known = papers.some((p) => (p.groups ?? []).some((g) => (g.present ?? []).includes(tag) || (g.remaining ?? []).includes(tag)));
      if (!known) return TabellifyTagMonitor.sortPapers(papers, defaultKey, defaultDirection);
    }
    return TabellifyTagMonitor.sortPapers(papers, key, direction);
  },

  /**
   * The table a saved definition gives TODAY (ADR-0018 §2): the CURRENT codebook decides
   * which columns exist; the SAVED column layout decides their order (new tags go where
   * ADR-0019 puts unlisted tags); the saved sort or manual order and counting switch decide
   * the rest. Never changes the workspace.
   * @param {{ codebook: object | null, monitorData: { collections: object[], rootId: number,
   *   papers: object[], keys: Map<number, string> }, definition: object, snapshot?: object }} input
   * @returns {{ view: { groups: object[], papers: object[], counting: boolean }, missing: string[] }}
   */
  liveView({ codebook, monitorData, definition, snapshot }) {
    const result = TabellifyTagMonitor.summarize(codebook, monitorData.collections, monitorData.rootId, monitorData.papers, {
      countItemTags: definition.countItemTags === true,
    });
    const counting = Boolean(codebook) && result.total > 0;
    const groups = counting
      ? TabellifyTableLayout.orderedGroups(TabellifyTagMonitor.codebookGroups(codebook), definition.columnLayout)
      : [];
    const keys = monitorData.keys;
    const papers = this.orderPapers(result.papers, definition.sort, definition.manualOrder, (p) => keys?.get(p.id));
    return { view: { groups, papers, counting }, missing: this.missingColumns(snapshot, groups) };
  },

  /**
   * The snapshot's column names that the given groups no longer have (snapshot order).
   * @param {object | null | undefined} snapshot
   * @param {Array<{ tags: string[] }>} groups
   * @returns {string[]}
   */
  missingColumns(snapshot, groups) {
    const live = new Set((groups ?? []).flatMap((g) => g.tags ?? []));
    return this.snapshotColumns(snapshot).filter((t) => !live.has(t));
  },

  // ---------------------------------------------------------------------------------------
  // Edits: each returns NEW data for the store to save (or a refusal with a Fluent ID)
  // ---------------------------------------------------------------------------------------

  /** A refusal when a snapshot breaks the row or column limit, else null. */
  snapshotLimitError(snapshot) {
    if (this.snapshotColumns(snapshot).length > this.LIMITS.columns) return { ok: false, error: this.ERR_LIMIT_COLUMNS };
    if ((snapshot?.rows ?? []).length > this.LIMITS.rows) return { ok: false, error: this.ERR_LIMIT_ROWS };
    return null;
  },

  /** The frame of `data` with another table list (a new object). */
  withTables(data, tables, nextId = data.nextId) {
    return { schemaVersion: this.SCHEMA_VERSION, revision: data.revision, nextId, tables };
  },

  /**
   * Add a saved table with the next free ID ("t" + nextId; IDs are never reused).
   * @param {object} data
   * @param {{ name: string, description: string, definition: object, snapshot: object }} input
   * @param {string} now  ISO date: createdAt and updatedAt
   * @returns {{ ok: true, data: object, id: string } | { ok: false, error: string }}
   */
  addTable(data, { name, description, definition, snapshot }, now) {
    const clean = this.cleanName(name);
    if (clean === "") return { ok: false, error: this.ERR_NAME_EMPTY };
    if (data.tables.length >= this.LIMITS.tables) return { ok: false, error: this.ERR_LIMIT_TABLES };
    const limit = this.snapshotLimitError(snapshot);
    if (limit) return limit;
    const id = `t${data.nextId}`;
    const table = {
      id,
      name: clean,
      description: this.cut(description, this.LIMITS.description, false),
      createdAt: String(now),
      updatedAt: String(now),
      definition: this.copyDefinition(definition),
      snapshot: this.copySnapshot(snapshot),
    };
    const next = this.withTables(data, [...data.tables.map((t) => this.copyTable(t)), table], data.nextId + 1);
    const size = this.checkFileSize(next);
    if (!size.ok) return size;
    return { ok: true, data: next, id };
  },

  /**
   * Change a saved table's Name, Description and/or snapshot (only the given fields), and
   * set updatedAt. createdAt and the definition stay.
   * @param {object} data
   * @param {string} id
   * @param {{ name?: string, description?: string, snapshot?: object }} changes
   * @param {string} now
   * @returns {{ ok: true, data: object } | { ok: false, error: string }}
   */
  updateTable(data, id, changes, now) {
    const at = data.tables.findIndex((t) => t.id === id);
    if (at < 0) return { ok: false, error: this.ERR_UNKNOWN_TABLE };
    const table = this.copyTable(data.tables[at]);
    if (changes && Object.hasOwn(changes, "name")) {
      const clean = this.cleanName(changes.name);
      if (clean === "") return { ok: false, error: this.ERR_NAME_EMPTY };
      table.name = clean;
    }
    if (changes && Object.hasOwn(changes, "description")) {
      table.description = this.cut(changes.description, this.LIMITS.description, false);
    }
    if (changes && Object.hasOwn(changes, "snapshot")) {
      const limit = this.snapshotLimitError(changes.snapshot);
      if (limit) return limit;
      table.snapshot = this.copySnapshot(changes.snapshot);
    }
    table.updatedAt = String(now);
    const tables = data.tables.map((t, i) => (i === at ? table : this.copyTable(t)));
    const next = this.withTables(data, tables);
    const size = this.checkFileSize(next);
    if (!size.ok) return size;
    return { ok: true, data: next };
  },

  /**
   * Remove one saved table. nextId stays, so its ID is never given to another table.
   * @param {object} data
   * @param {string} id
   * @returns {{ ok: true, data: object } | { ok: false, error: string }}
   */
  deleteTable(data, id) {
    if (!data.tables.some((t) => t.id === id)) return { ok: false, error: this.ERR_UNKNOWN_TABLE };
    return { ok: true, data: this.withTables(data, data.tables.filter((t) => t.id !== id).map((t) => this.copyTable(t))) };
  },

  /** Find a table by ID (or undefined). */
  findTable(data, id) {
    return (data?.tables ?? []).find((t) => t.id === id);
  },

  /**
   * The entries of the "Saved tables" list: newest `updatedAt` first, then by name.
   * @param {object} data
   * @param {string | null} collectionKey  Only this collection's tables; null = all
   * @returns {Array<{ id: string, name: string, collectionKey: string, collectionName: string,
   *   papers: number, columns: number, updatedAt: string }>}
   */
  listTables(data, collectionKey) {
    const time = (iso) => {
      const n = Date.parse(iso);
      return Number.isFinite(n) ? n : 0;
    };
    return (data?.tables ?? [])
      .filter((t) => collectionKey === null || t.definition.collectionKey === collectionKey)
      .map((t) => ({
        id: t.id,
        name: t.name,
        collectionKey: t.definition.collectionKey,
        collectionName: t.snapshot.collectionName,
        papers: t.snapshot.rows.length,
        columns: this.snapshotColumns(t.snapshot).length,
        updatedAt: t.updatedAt,
      }))
      .sort((a, b) => (time(b.updatedAt) - time(a.updatedAt))
        || TabellifyTagMonitor.compareText(a.name, b.name)
        || (Number(a.id.slice(1)) - Number(b.id.slice(1))));
  },

  /**
   * Refuse data whose JSON text would be longer than `limit` characters (the whole file is
   * read at every workspace start, ADR-0018 §4).
   * @param {object} data
   * @param {number} [limit]
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  checkFileSize(data, limit = this.LIMITS.fileChars) {
    return JSON.stringify(data).length <= limit ? { ok: true } : { ok: false, error: this.ERR_LIMIT_FILE };
  },
};
