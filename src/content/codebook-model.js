/* Tabellify — codebook-model.js (Feature 004, schema 2 from Feature 006a / ADR-0016)
 *
 * A codebook is a planned list of tags. A tag may sit in a group ("super-tag"), e.g.
 *   Exposure → Heat index, Temperature
 * or stand on its own ("ungrouped", `group: null`), e.g. `age`.
 *
 * Stored shape, schema version 2 (ADR-0016 §1), in
 * <Zotero data directory>/tabellify/codebooks.json (written by codebook-store.js, ADR-0012):
 *   { schemaVersion: 2, revision, nextId,
 *     codebooks: [{ id: "c1", name, groups: [{ id: "g2", name }],
 *                   tags: [{ name: "Heat index", group: "g2" }, { name: "age", group: null }] }] }
 * `groups` is ordered (codebook order of the super-headers). `tags` is ordered: a group's tags
 * are the tags whose `group` is its ID, in list order; ungrouped tags have `group: null`.
 * Version 1 files (every tag inside `groups[i].tags`) are converted by migrate() on load.
 *
 * PURE: this file uses no Zotero, DOM, IOUtils or PathUtils globals, so
 * tests/unit/codebook-model.test.mjs can run it in Node. It never touches the disk or the
 * Zotero library; it only turns one plain data object into another. A tag here exists only
 * in Tabellify's codebook: nothing in this file (or anywhere in Tabellify) adds it to a
 * Zotero item.
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
  /** The file shape this Tabellify writes and understands (ADR-0012 §4, ADR-0016). */
  SCHEMA_VERSION: 2,

  /**
   * Reserved VIEW id of the "Ungrouped" block in the table, the pills and layout.json
   * (ADR-0016 §5–§6). Never stored in codebooks.json: stored group ids look like "g2", so
   * this can never clash with one.
   */
  UNGROUPED_ID: "ungrouped",

  // Fluent IDs for the reasons an edit is refused.
  ERR_GROUP_EMPTY: "tabellify-codebook-error-group-empty",
  ERR_GROUP_DUPLICATE: "tabellify-codebook-error-group-duplicate",
  ERR_GROUP_MISSING: "tabellify-codebook-error-group-missing",
  ERR_TAG_EMPTY: "tabellify-codebook-error-tag-empty",
  ERR_TAG_DUPLICATE: "tabellify-codebook-error-tag-duplicate",
  ERR_TAG_MISSING: "tabellify-codebook-error-tag-missing",

  /**
   * A new, never-saved file: one codebook with no groups and no tags.
   * `revision: 0` means "not on disk yet"; the store makes it 1 on the first save.
   * @returns {CodebookData}
   */
  emptyData() {
    return {
      schemaVersion: 2,
      revision: 0,
      nextId: 2,
      codebooks: [{ id: "c1", name: "Codebook", groups: [], tags: [] }],
    };
  },

  /**
   * Check that `data` is a well-formed codebooks file, version 1 or 2. Used on everything
   * read from disk: the file is user-editable, so it is untrusted input.
   *
   * - `{ ok: true }` — safe to use (pass it to migrate() before using it).
   * - `{ ok: false, newer: true, reason }` — made by a newer Tabellify (schemaVersion >
   *   SCHEMA_VERSION); must not be edited or overwritten (ADR-0012 §3).
   * - `{ ok: false, reason }` — damaged or not a codebooks file.
   * `reason` is English for Debug Output only (not shown as UI text).
   * @param {unknown} data
   * @returns {{ ok: boolean, reason?: string, newer?: boolean }}
   */
  validate(data) {
    const fail = (reason) => ({ ok: false, reason });
    const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
    const isCount = (v, min) => Number.isInteger(v) && v >= min;
    const isTrimmedName = (v) => typeof v === "string" && v.trim() !== "" && v.trim() === v;

    if (!isObject(data)) return fail("top level is not an object");
    if (!("schemaVersion" in data)) return fail("schemaVersion is missing");
    if (!isCount(data.schemaVersion, 1)) return fail("schemaVersion is not a positive integer");
    if (data.schemaVersion > this.SCHEMA_VERSION) {
      return { ok: false, newer: true, reason: `schemaVersion ${data.schemaVersion} is newer than ${this.SCHEMA_VERSION}` };
    }
    const v1 = data.schemaVersion === 1;
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
      const groupIds = new Set();
      const tags = new Set();
      /** @returns {string | null} a reason when `tag` is not a usable, unique tag name */
      const checkTag = (tag, tWhere) => {
        if (typeof tag !== "string") return `${tWhere} is not a string`;
        if (!isTrimmedName(tag)) return `${tWhere} is empty or not trimmed`;
        if (tags.has(tag)) return `${tWhere} is a duplicate tag in the codebook`;
        tags.add(tag);
        return null;
      };

      for (const [gi, group] of cb.groups.entries()) {
        const gWhere = `${where}.groups[${gi}]`;
        if (!isObject(group)) return fail(`${gWhere} is not an object`);
        const gIdError = checkId(group.id, "g", gWhere);
        if (gIdError) return fail(gIdError);
        groupIds.add(group.id);
        if (typeof group.name !== "string") return fail(`${gWhere}.name is not a string`);
        if (!isTrimmedName(group.name)) return fail(`${gWhere}.name is empty or not trimmed`);
        // Group names are unique ignoring case (as in version 1).
        if (groupNames.has(group.name.toLowerCase())) return fail(`${gWhere}.name is a duplicate`);
        groupNames.add(group.name.toLowerCase());
        if (v1) {
          // Version 1: the tags live inside the group.
          if (!Array.isArray(group.tags)) return fail(`${gWhere}.tags is not an array`);
          for (const [ti, tag] of group.tags.entries()) {
            const tagError = checkTag(tag, `${gWhere}.tags[${ti}]`);
            if (tagError) return fail(tagError);
          }
        }
      }

      if (!v1) {
        // Version 2: one ordered list of tag records `{ name, group }` (ADR-0016 §2).
        // Extra fields on a record are allowed (room to grow), but name and group are checked.
        if (!Array.isArray(cb.tags)) return fail(`${where}.tags is not an array`);
        for (const [ti, record] of cb.tags.entries()) {
          const tWhere = `${where}.tags[${ti}]`;
          if (!isObject(record)) return fail(`${tWhere} is not an object`);
          const tagError = checkTag(record.name, `${tWhere}.name`);
          if (tagError) return fail(tagError);
          if (!("group" in record)) return fail(`${tWhere}.group is missing`);
          if (record.group !== null) {
            if (typeof record.group !== "string") return fail(`${tWhere}.group is not a string or null`);
            if (!groupIds.has(record.group)) return fail(`${tWhere}.group ${record.group} is not a group of this codebook`);
          }
        }
      }
    }
    return { ok: true };
  },

  /**
   * Bring VALID data up to SCHEMA_VERSION (ADR-0016 §3). Call validate() first; data newer
   * than SCHEMA_VERSION must never get here.
   *
   * Version 1 → 2: for each group in order, `{ id, name }` goes to `groups`, then each of its
   * tags in order goes to `tags` as `{ name, group: id }`. revision, nextId, every id and
   * every order stay the same, so the table and layout.json look exactly as before. Names
   * are not re-normalized (that could merge two names into one).
   *
   * Version 2: an unchanged copy.
   * @param {CodebookData | CodebookDataV1} data
   * @returns {CodebookData}
   */
  migrate(data) {
    let v = data.schemaVersion;
    let next = this.clone(data);
    if (v === 1) {
      next = {
        ...next,
        schemaVersion: 2,
        codebooks: next.codebooks.map((cb) => ({
          ...cb,
          groups: cb.groups.map((g) => ({ id: g.id, name: g.name })),
          tags: cb.groups.flatMap((g) => g.tags.map((name) => ({ name, group: g.id }))),
        })),
      };
      v = 2;
    }
    if (v !== this.SCHEMA_VERSION) {
      throw new Error(`no migration from schemaVersion ${data.schemaVersion}`);
    }
    return next;
  },

  // ---------------------------------------------------------------------------------------
  // Reading. All work on the first codebook (Tabellify has exactly one; the file holds a
  // list so a later feature can add more without a migration).
  // ---------------------------------------------------------------------------------------

  /**
   * The groups of the current codebook, in codebook order, as new `{ id, name }` objects.
   * @param {CodebookData} data
   * @returns {Array<{ id: string, name: string }>}
   */
  groups(data) {
    return data.codebooks[0].groups.map((g) => ({ id: g.id, name: g.name }));
  },

  /**
   * The tags of one group in order, or the ungrouped tags when `groupId` is null.
   * @param {CodebookData} data
   * @param {string | null} groupId
   * @returns {string[]}
   */
  tagsIn(data, groupId) {
    return data.codebooks[0].tags.filter((t) => t.group === groupId).map((t) => t.name);
  },

  // ---------------------------------------------------------------------------------------
  // Edits.
  //
  // Naming: no edit is called addTag / removeTag. tests/static/write-guard.test.mjs flags
  // calls of methods with those short names anywhere in src/ (they are Zotero's item tag
  // writers), and these functions never touch Zotero.
  // ---------------------------------------------------------------------------------------

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
    this.pushGroup(next, clean);
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
   * Delete a group. Its tags are kept and become ungrouped (spec F006a Q4: nothing is lost,
   * so no confirmation is needed). They keep their place in the tag list.
   * @param {CodebookData} data
   * @param {string} groupId
   * @returns {EditResult}
   */
  deleteGroup(data, groupId) {
    if (!this.findGroup(data, groupId)) return this.refuse(this.ERR_GROUP_MISSING);
    const next = this.clone(data);
    const cb = next.codebooks[0];
    cb.groups = cb.groups.filter((g) => g.id !== groupId);
    for (const t of cb.tags) if (t.group === groupId) t.group = null;
    return { ok: true, data: next };
  },

  /**
   * Turn a group back into a tag (Feature 006c Amendment 3, owner 2026-11-13: an emptied
   * group must not vanish from the table, which only shows groups with columns). The group
   * is removed and its name is added as an UNGROUPED tag at the end of the tag list, unless
   * a tag with exactly that name is already in the codebook (then the group is only
   * removed and that tag stays where it is). Tags still in the group become ungrouped, as
   * with deleteGroup (normally the group is empty when this is called). Only the codebook
   * changes: nothing in Zotero.
   * @param {CodebookData} data
   * @param {string} groupId
   * @returns {{ ok: true, data: CodebookData, tag: string, added: boolean } | { ok: false, error: string }}
   */
  groupToTag(data, groupId) {
    const group = this.findGroup(data, groupId);
    if (!group) return this.refuse(this.ERR_GROUP_MISSING);
    const name = group.name;
    const deleted = this.deleteGroup(data, groupId);
    if (!deleted.ok) return deleted;
    const next = deleted.data;
    const added = !this.findTag(next, name);
    if (added) next.codebooks[0].tags.push({ name, group: null });
    return { ok: true, data: next, tag: name, added };
  },

  /**
   * Remove a tag from the codebook (its column disappears). Only the codebook changes.
   * @param {CodebookData} data
   * @param {string} tag  Exact tag string as stored
   * @returns {EditResult}
   */
  removeTagFromCodebook(data, tag) {
    if (!this.findTag(data, tag)) return this.refuse(this.ERR_TAG_MISSING);
    const next = this.clone(data);
    next.codebooks[0].tags = next.codebooks[0].tags.filter((t) => t.name !== tag);
    return { ok: true, data: next };
  },

  /**
   * Put an existing tag into a group, or make it ungrouped with `groupId` null. A tag that
   * changes group moves to the end of the tag list, so it is last in its new group. A tag
   * already in that group stays where it is.
   * @param {CodebookData} data
   * @param {string} tag  Exact tag string as stored
   * @param {string | null} groupId
   * @returns {EditResult}
   */
  setTagGroup(data, tag, groupId) {
    const record = this.findTag(data, tag);
    if (!record) return this.refuse(this.ERR_TAG_MISSING);
    if (groupId !== null && !this.findGroup(data, groupId)) return this.refuse(this.ERR_GROUP_MISSING);
    const next = this.clone(data);
    if (record.group !== groupId) this.moveTagRecord(next, tag, groupId);
    return { ok: true, data: next };
  },

  /**
   * Put `tag` under `anchor` (Feature 006c: a tag column dropped below another tag column,
   * ADR-0016 §7, amended by the owner on 2026-11-13). Both must already be in the codebook.
   * - `anchor` in group G: `tag` joins G (as setTagGroup; `created: false`). `anchor` stays.
   * - `anchor` ungrouped: `anchor` becomes ONLY a group name (owner's smoke-test choice: not
   *   a super-header and a column at once). The group named like `anchor` (ignoring case;
   *   its stored spelling wins) is used, or a new one named exactly `anchor` is created
   *   (`created: true`, id from nextId). The TAG `anchor` is removed from the codebook (only
   *   the codebook: nothing in Zotero changes), and `tag` moves into the group (end of list).
   * Refused (ERR_TAG_MISSING) when either tag is unknown or `tag === anchor`.
   * @param {CodebookData} data
   * @param {string} tag     The dragged tag
   * @param {string} anchor  The tag it was dropped below
   * @returns {{ ok: true, data: CodebookData, groupId: string, created: boolean, anchorRemoved: boolean }
   *   | { ok: false, error: string }}
   */
  groupUnderTag(data, tag, anchor) {
    const record = this.findTag(data, tag);
    const anchorRecord = this.findTag(data, anchor);
    if (!record || !anchorRecord || tag === anchor) return this.refuse(this.ERR_TAG_MISSING);
    if (anchorRecord.group !== null) {
      const result = this.setTagGroup(data, tag, anchorRecord.group);
      if (!result.ok) return result;
      return { ok: true, data: result.data, groupId: anchorRecord.group, created: false, anchorRemoved: false };
    }
    const result = this.tagToGroupName(data, anchor, tag);
    if (!result.ok) return result;
    return { ...result, anchorRemoved: true };
  },

  /**
   * Turn the TAG `nameTag` into a group NAME and put `childTag` in that group (Feature 006c
   * Amendment 2: the bottom nest calls it with the target tag as the name, the flipped
   * "top edge" drop with the dragged tag as the name). Both must already be in the codebook.
   * - The group named like `nameTag` (ignoring case; its stored spelling wins) is reused,
   *   even if it is `nameTag`'s own group; otherwise a new group named exactly `nameTag` is
   *   created (id from nextId, `created: true`).
   * - The tag `nameTag` is removed from the codebook, wherever it was (grouped or not). Only
   *   the codebook changes: the Zotero tag and its uses stay.
   * - `childTag` moves into the group (end of the tag list) unless it is already there.
   * Refused (ERR_TAG_MISSING) when either tag is unknown or they are the same tag.
   * Returns a new data object; the input is never changed.
   * @param {CodebookData} data
   * @param {string} nameTag   The tag that becomes the group's name
   * @param {string} childTag  The tag that goes into the group
   * @returns {{ ok: true, data: CodebookData, groupId: string, created: boolean }
   *   | { ok: false, error: string }}
   */
  tagToGroupName(data, nameTag, childTag) {
    if (!this.findTag(data, nameTag) || !this.findTag(data, childTag) || nameTag === childTag) {
      return this.refuse(this.ERR_TAG_MISSING);
    }
    const next = this.clone(data);
    const lower = nameTag.toLowerCase();
    const existing = next.codebooks[0].groups.find((g) => g.name.toLowerCase() === lower);
    const groupId = existing ? existing.id : this.pushGroup(next, nameTag);
    next.codebooks[0].tags = next.codebooks[0].tags.filter((t) => t.name !== nameTag);
    if (this.findTag(next, childTag).group !== groupId) this.moveTagRecord(next, childTag, groupId);
    return { ok: true, data: next, groupId, created: !existing };
  },

  /**
   * Apply one tag-script entry (Feature 006a), all or nothing. `items` is what
   * TabellifyTagScript.parse() returns: `{ kind: "tag", name }` or
   * `{ kind: "group", name, tags: string[] }`, in the order typed.
   *
   * For each item in order:
   * - group: use the codebook group with that name (ignoring case; its stored spelling wins)
   *   or create it (id from nextId). Each of its tags: new → added at the end; in another
   *   group or ungrouped → moved here (end of the list); already here → unchanged.
   * - tag: new → added ungrouped; in a group → moved to ungrouped (spec Q3); already
   *   ungrouped → unchanged.
   *
   * Returns `{ ok: true, data, report: { added, moved, unchanged, groupsCreated } }`, or a
   * refusal with a Fluent ID (empty name, or the same tag twice in one entry). When every
   * count except `unchanged` is 0, `data` equals the input and nothing needs saving.
   * @param {CodebookData} data
   * @param {Array<{ kind: "tag", name: string } | { kind: "group", name: string, tags: string[] }>} items
   * @returns {{ ok: true, data: CodebookData, report: ScriptReport } | { ok: false, error: string }}
   */
  applyScript(data, items) {
    // 1. Clean and check every name first, so a refusal changes nothing.
    /** @type {Array<{ group: string | null, tags: string[] }>} */
    const steps = [];
    const seen = new Set();
    const takeTag = (raw) => {
      const name = this.cleanName(raw);
      if (name === "") return { error: this.ERR_TAG_EMPTY };
      if (seen.has(name)) return { error: this.ERR_TAG_DUPLICATE };
      seen.add(name);
      return { name };
    };
    for (const item of Array.isArray(items) ? items : []) {
      if (item?.kind === "group") {
        const group = this.cleanName(item.name);
        if (group === "") return this.refuse(this.ERR_GROUP_EMPTY);
        const tags = [];
        for (const raw of Array.isArray(item.tags) ? item.tags : []) {
          const t = takeTag(raw);
          if (t.error) return this.refuse(t.error);
          tags.push(t.name);
        }
        steps.push({ group, tags });
      } else {
        const t = takeTag(item?.name);
        if (t.error) return this.refuse(t.error);
        steps.push({ group: null, tags: [t.name] });
      }
    }

    // 2. Apply them to one copy.
    const next = this.clone(data);
    const report = { added: 0, moved: 0, unchanged: 0, groupsCreated: 0 };
    for (const step of steps) {
      let groupId = null;
      if (step.group !== null) {
        const lower = step.group.toLowerCase();
        const existing = next.codebooks[0].groups.find((g) => g.name.toLowerCase() === lower);
        if (existing) {
          groupId = existing.id;
        } else {
          groupId = this.pushGroup(next, step.group);
          report.groupsCreated += 1;
        }
      }
      for (const name of step.tags) {
        const record = this.findTag(next, name);
        if (!record) {
          next.codebooks[0].tags.push({ name, group: groupId });
          report.added += 1;
        } else if (record.group !== groupId) {
          this.moveTagRecord(next, name, groupId);
          report.moved += 1;
        } else {
          report.unchanged += 1;
        }
      }
    }
    return { ok: true, data: next, report };
  },

  /**
   * Names for a "pick from library" list (kept for Feature 006b autocomplete): each library
   * tag name once, sorted, leaving out names already in the codebook and blank names.
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

  /**
   * Clean typed input the way Zotero cleans tag names: trim, then Unicode NFC
   * (`normalize()`), so a typed "é" matches the library's "é" stored in the other form.
   * Comparison stays case-sensitive, as in Zotero.
   * @param {unknown} name
   */
  cleanName(name) {
    return String(name ?? "").trim().normalize();
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
   * Append a new group with an id from the counter ("g2", "g3", …) and return the id. Later
   * features refer to a group by id even after it is renamed. Mutates `next` (a copy).
   * @param {CodebookData} next
   * @param {string} name  Already cleaned and checked
   * @returns {string}
   */
  pushGroup(next, name) {
    const id = `g${next.nextId}`;
    next.codebooks[0].groups.push({ id, name });
    next.nextId += 1;
    return id;
  },

  /**
   * Set a tag's group and move its record to the end of the list. Mutates `next` (a copy).
   * @param {CodebookData} next
   * @param {string} tag
   * @param {string | null} groupId
   */
  moveTagRecord(next, tag, groupId) {
    const cb = next.codebooks[0];
    const record = cb.tags.find((t) => t.name === tag);
    cb.tags = cb.tags.filter((t) => t !== record);
    cb.tags.push({ ...record, group: groupId });
  },

  /**
   * @param {CodebookData} data
   * @param {string} groupId
   * @returns {{ id: string, name: string } | undefined}
   */
  findGroup(data, groupId) {
    return data.codebooks[0].groups.find((g) => g.id === groupId);
  },

  /**
   * @param {CodebookData} data
   * @param {string} tag
   * @returns {CodebookTag | undefined}
   */
  findTag(data, tag) {
    return data.codebooks[0].tags.find((t) => t.name === tag);
  },

  /** Group names are unique ignoring case ("Exposure" and "exposure" would be confusing headers). */
  groupNameTaken(data, name, exceptGroupId) {
    const lower = name.toLowerCase();
    return data.codebooks[0].groups.some((g) => g.id !== exceptGroupId && g.name.toLowerCase() === lower);
  },

  /** @returns {Set<string>} every tag in the current codebook */
  allTags(data) {
    return new Set(data.codebooks[0].tags.map((t) => t.name));
  },
};

/**
 * @typedef {{ name: string, group: string | null }} CodebookTag
 * @typedef {{ id: string, name: string, groups: Array<{ id: string, name: string }>, tags: CodebookTag[] }} Codebook
 * @typedef {{ schemaVersion: number, revision: number, nextId: number, codebooks: Codebook[] }} CodebookData
 * @typedef {{ schemaVersion: 1, revision: number, nextId: number,
 *   codebooks: Array<{ id: string, name: string, groups: Array<{ id: string, name: string, tags: string[] }> }> }} CodebookDataV1
 * @typedef {{ ok: true, data: CodebookData } | { ok: false, error: string }} EditResult
 * @typedef {{ added: number, moved: number, unchanged: number, groupsCreated: number }} ScriptReport
 */
