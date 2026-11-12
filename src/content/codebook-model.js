/* Tabellify — codebook-model.js (Feature 004: the codebook's pure data model)
 *
 * A codebook is a planned list of tags, grouped under "super-tags" (groups), e.g.
 *   Exposure → Heat index, Temperature
 * The data shape is defined in docs/features/004-codebook.md ("Data model") and is stored
 * by codebook-store.js in <Zotero data directory>/tabellify/codebooks.json (ADR-0012).
 *
 * PURE: this file uses no Zotero, DOM, IOUtils or PathUtils globals, so
 * tests/unit/codebook-model.test.mjs can run it in Node. It never touches the disk or the
 * Zotero library; it only turns one plain data object into another.
 *
 * IMMUTABLE STYLE: every edit function returns a NEW data object and leaves its input
 * unchanged. That lets the workspace keep the last saved data and simply drop an edit that
 * could not be saved, and makes the functions easy to test ("same input, same output").
 *
 * Results: an edit returns `{ ok: true, data }` or `{ ok: false, error }`, where `error` is
 * a Fluent message ID from tabellify.ftl. The workspace shows it with
 * document.l10n.formatValue(error), so no user-visible English lives in this file.
 *
 * Why this lives in src/content/ and not src/modules/: only src/content/ has a chrome://
 * URL the workspace document can load a script from (see the top of workspace.js).
 */
"use strict";

/**
 * One global object (a property of the window, or of the Node test's sandbox, because it is
 * declared with `var`). workspace.xhtml loads this file before workspace.js.
 */
var TabellifyCodebook = {
  /** The file shape this Tabellify writes and understands (ADR-0012 §4). */
  SCHEMA_VERSION: 1,

  // Fluent IDs for the reasons an edit is refused.
  ERR_GROUP_EMPTY: "tabellify-codebook-error-group-empty",
  ERR_GROUP_DUPLICATE: "tabellify-codebook-error-group-duplicate",
  ERR_GROUP_MISSING: "tabellify-codebook-error-group-missing",
  ERR_TAG_EMPTY: "tabellify-codebook-error-tag-empty",
  ERR_TAG_DUPLICATE: "tabellify-codebook-error-tag-duplicate",
  ERR_TAG_MISSING: "tabellify-codebook-error-tag-missing",

  /**
   * A new, never-saved file: one codebook with no groups.
   * `revision: 0` means "not on disk yet"; the store makes it 1 on the first save.
   * @returns {CodebookData}
   */
  emptyData() {
    return {
      schemaVersion: 1,
      revision: 0,
      nextId: 2,
      codebooks: [{ id: "c1", name: "Codebook", groups: [] }],
    };
  },

  /**
   * Check that `data` is a well-formed codebooks file. Used on everything read from disk:
   * the file is user-editable, so it is untrusted input.
   *
   * - `{ ok: true }` — safe to use.
   * - `{ ok: false, newer: true, reason }` — made by a newer Tabellify (schemaVersion > 1);
   *   must not be edited or overwritten (ADR-0012 §3).
   * - `{ ok: false, reason }` — damaged or not a codebooks file.
   * `reason` is English for Debug Output only (not shown as UI text).
   * @param {unknown} data
   * @returns {{ ok: boolean, reason?: string, newer?: boolean }}
   */
  validate(data) {
    const fail = (reason) => ({ ok: false, reason });
    const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
    const isCount = (v, min) => Number.isInteger(v) && v >= min;

    if (!isObject(data)) return fail("top level is not an object");
    if (!("schemaVersion" in data)) return fail("schemaVersion is missing");
    if (!isCount(data.schemaVersion, 1)) return fail("schemaVersion is not a positive integer");
    if (data.schemaVersion > this.SCHEMA_VERSION) {
      return { ok: false, newer: true, reason: `schemaVersion ${data.schemaVersion} is newer than ${this.SCHEMA_VERSION}` };
    }
    if (!isCount(data.revision, 0)) return fail("revision is not a non-negative integer");
    if (!isCount(data.nextId, 1)) return fail("nextId is not a positive integer");
    if (!Array.isArray(data.codebooks)) return fail("codebooks is not an array");
    if (data.codebooks.length === 0) return fail("codebooks is empty");

    // Ids look like "c1" / "g2"; the number must be below nextId so a new id never clashes.
    const ids = new Set();
    const checkId = (id, prefix, where) => {
      const m = typeof id === "string" ? /^([cg])([1-9]\d*)$/.exec(id) : null;
      if (!m || m[1] !== prefix) return `${where}: id is not a valid "${prefix}<number>" id`;
      if (Number(m[2]) >= data.nextId) return `${where}: id ${id} is not below nextId`;
      if (ids.has(id)) return `${where}: id ${id} is used twice`;
      ids.add(id);
      return null;
    };

    for (const [ci, cb] of data.codebooks.entries()) {
      const where = `codebooks[${ci}]`;
      if (!isObject(cb)) return fail(`${where} is not an object`);
      const idError = checkId(cb.id, "c", where);
      if (idError) return fail(idError);
      if (typeof cb.name !== "string") return fail(`${where}.name is not a string`);
      if (!Array.isArray(cb.groups)) return fail(`${where}.groups is not an array`);

      const groupNames = new Set();
      const tags = new Set();
      for (const [gi, group] of cb.groups.entries()) {
        const gWhere = `${where}.groups[${gi}]`;
        if (!isObject(group)) return fail(`${gWhere} is not an object`);
        const gIdError = checkId(group.id, "g", gWhere);
        if (gIdError) return fail(gIdError);
        if (typeof group.name !== "string") return fail(`${gWhere}.name is not a string`);
        const name = group.name.trim();
        if (name === "" || name !== group.name) return fail(`${gWhere}.name is empty or not trimmed`);
        if (groupNames.has(name.toLowerCase())) return fail(`${gWhere}.name is a duplicate`);
        groupNames.add(name.toLowerCase());
        if (!Array.isArray(group.tags)) return fail(`${gWhere}.tags is not an array`);
        for (const [ti, tag] of group.tags.entries()) {
          const tWhere = `${gWhere}.tags[${ti}]`;
          if (typeof tag !== "string") return fail(`${tWhere} is not a string`);
          if (tag.trim() === "" || tag.trim() !== tag) return fail(`${tWhere} is empty or not trimmed`);
          if (tags.has(tag)) return fail(`${tWhere} is a duplicate tag in the codebook`);
          tags.add(tag);
        }
      }
    }
    return { ok: true };
  },

  /**
   * Bring valid data up to SCHEMA_VERSION. Only version 1 exists, so today this just returns
   * a copy. A future version 2 adds a step here (`if (v === 1) { …; v = 2; }`) with a unit
   * test, and the next save writes the new version (the old file stays as .bak).
   * Call validate() first; data newer than SCHEMA_VERSION must never get here.
   * @param {CodebookData} data
   * @returns {CodebookData}
   */
  migrate(data) {
    if (data.schemaVersion !== this.SCHEMA_VERSION) {
      throw new Error(`no migration from schemaVersion ${data.schemaVersion}`);
    }
    return this.clone(data);
  },

  // ---------------------------------------------------------------------------------------
  // Edits. All work on the first codebook (Feature 004 has exactly one; the file holds a
  // list so a later feature can add more without a migration).
  //
  // Naming: the tag edits are called addTagToGroup / removeTagFromGroup, not the shorter
  // addTag / removeTag. tests/static/write-guard.test.mjs flags calls of methods with those
  // short names anywhere in src/ (they are Zotero's item tag writers), and these functions
  // never touch Zotero.
  // ---------------------------------------------------------------------------------------

  /**
   * The groups of the current codebook, for showing them. Do not change the result.
   * @param {CodebookData} data
   * @returns {Array<CodebookGroup>}
   */
  groups(data) {
    return data.codebooks[0].groups;
  },

  /**
   * @param {CodebookData} data
   * @param {string} name
   * @returns {EditResult}
   */
  addGroup(data, name) {
    const clean = this.cleanName(name);
    if (clean === "") return this.refuse(this.ERR_GROUP_EMPTY);
    if (this.groupNameTaken(data, clean, null)) return this.refuse(this.ERR_GROUP_DUPLICATE);
    const next = this.clone(data);
    // Short stable id from the counter ("g2", "g3", …). Later features (F007 tables) can
    // refer to a group by id even after it is renamed.
    next.codebooks[0].groups.push({ id: `g${next.nextId}`, name: clean, tags: [] });
    next.nextId += 1;
    return { ok: true, data: next };
  },

  /**
   * @param {CodebookData} data
   * @param {string} groupId
   * @param {string} name
   * @returns {EditResult}
   */
  renameGroup(data, groupId, name) {
    const clean = this.cleanName(name);
    if (!this.findGroup(data, groupId)) return this.refuse(this.ERR_GROUP_MISSING);
    if (clean === "") return this.refuse(this.ERR_GROUP_EMPTY);
    // The group itself is skipped, so "exposure" → "Exposure" (case change only) is allowed.
    if (this.groupNameTaken(data, clean, groupId)) return this.refuse(this.ERR_GROUP_DUPLICATE);
    const next = this.clone(data);
    this.findGroup(next, groupId).name = clean;
    return { ok: true, data: next };
  },

  /**
   * Delete a group and the tags in it (the workspace asks for confirmation first when the
   * group has tags).
   * @param {CodebookData} data
   * @param {string} groupId
   * @returns {EditResult}
   */
  deleteGroup(data, groupId) {
    if (!this.findGroup(data, groupId)) return this.refuse(this.ERR_GROUP_MISSING);
    const next = this.clone(data);
    next.codebooks[0].groups = next.codebooks[0].groups.filter((g) => g.id !== groupId);
    return { ok: true, data: next };
  },

  /**
   * Add a tag to the end of a group. A tag may appear only once in the whole codebook
   * (it maps to exactly one column). Matching is exact (case-sensitive) after trimming,
   * like Zotero tag names (owner decision 3).
   * @param {CodebookData} data
   * @param {string} groupId
   * @param {string} tag
   * @returns {EditResult}
   */
  addTagToGroup(data, groupId, tag) {
    const clean = this.cleanName(tag);
    if (!this.findGroup(data, groupId)) return this.refuse(this.ERR_GROUP_MISSING);
    if (clean === "") return this.refuse(this.ERR_TAG_EMPTY);
    if (this.allTags(data).has(clean)) return this.refuse(this.ERR_TAG_DUPLICATE);
    const next = this.clone(data);
    this.findGroup(next, groupId).tags.push(clean);
    return { ok: true, data: next };
  },

  /**
   * @param {CodebookData} data
   * @param {string} groupId
   * @param {string} tag  Exact tag string as stored
   * @returns {EditResult}
   */
  removeTagFromGroup(data, groupId, tag) {
    const group = this.findGroup(data, groupId);
    if (!group) return this.refuse(this.ERR_GROUP_MISSING);
    if (!group.tags.includes(tag)) return this.refuse(this.ERR_TAG_MISSING);
    const next = this.clone(data);
    const nextGroup = this.findGroup(next, groupId);
    nextGroup.tags = nextGroup.tags.filter((t) => t !== tag);
    return { ok: true, data: next };
  },

  /**
   * Names for the "pick from library" list: each library tag name once, sorted, leaving out
   * names already in the codebook and names that are blank.
   * @param {CodebookData} data
   * @param {Iterable<string>} libraryTagNames  Untrusted text from the library
   * @returns {string[]}
   */
  availableTags(data, libraryTagNames) {
    const used = this.allTags(data);
    const names = new Set();
    for (const raw of libraryTagNames) {
      const name = String(raw ?? "");
      if (name.trim() === "" || used.has(name.trim())) continue;
      names.add(name);
    }
    // Same order as TabellifyWorkspace.compareText (that file loads after this one, so the
    // comparison is repeated here): ignore case and accents, "Tag 2" before "Tag 10".
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
  },

  // ---------------------------------------------------------------------------------------
  // Small internal helpers
  // ---------------------------------------------------------------------------------------

  /** @param {unknown} name */
  cleanName(name) {
    return String(name ?? "").trim();
  },

  /** @param {string} error */
  refuse(error) {
    return { ok: false, error };
  },

  /**
   * Deep copy of plain JSON data. (JSON round-trip rather than structuredClone, which the
   * Node test sandbox does not provide; the data is plain JSON anyway.)
   * @template T
   * @param {T} data
   * @returns {T}
   */
  clone(data) {
    return JSON.parse(JSON.stringify(data));
  },

  /**
   * @param {CodebookData} data
   * @param {string} groupId
   * @returns {CodebookGroup | undefined}
   */
  findGroup(data, groupId) {
    return data.codebooks[0].groups.find((g) => g.id === groupId);
  },

  /** Group names are unique ignoring case ("Exposure" and "exposure" would be confusing headers). */
  groupNameTaken(data, name, exceptGroupId) {
    const lower = name.toLowerCase();
    return data.codebooks[0].groups.some((g) => g.id !== exceptGroupId && g.name.toLowerCase() === lower);
  },

  /** @returns {Set<string>} every tag in the current codebook */
  allTags(data) {
    return new Set(data.codebooks[0].groups.flatMap((g) => g.tags));
  },
};

/**
 * @typedef {{ id: string, name: string, tags: string[] }} CodebookGroup
 * @typedef {{ id: string, name: string, groups: CodebookGroup[] }} Codebook
 * @typedef {{ schemaVersion: number, revision: number, nextId: number, codebooks: Codebook[] }} CodebookData
 * @typedef {{ ok: true, data: CodebookData } | { ok: false, error: string }} EditResult
 */
