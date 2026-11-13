/* Tabellify — tag-monitor-model.js (Feature 005: the tag monitor's pure logic)
 *
 * The tag monitor compares the codebook (the tags the researcher PLANS to use, F004) with
 * the MANUAL tags actually on the papers of a chosen collection and all its
 * subcollections, including tags on their highlights (annotations). See
 * docs/features/005-tag-monitor.md, "How 'used' is computed".
 *
 * PURE: this file uses no Zotero, DOM, IOUtils or PathUtils globals, so
 * tests/unit/tag-monitor-model.test.mjs can run it in Node. workspace.js reads the library
 * (read-only), turns what it found into plain objects and hands them to these functions:
 *
 *   collections: Array<{ id: number, parentID: number | null | false, name: string }>
 *   papers:      Array<{ id: number, title: string, collectionId: number,
 *                        itemTags: Array<{ tag, type? }>, annotationTags: Array<{ tag, type? }> }>
 *
 * `papers` has one entry per paper PER COLLECTION it was found in; summarize() merges them.
 *
 * Tag `type`: Zotero's item.getTags() leaves `type` out for manual tags (type 0) and sets
 * 1 for automatic tags (e.g. imported with the metadata). Only manual tags count, so a
 * missing `type` means manual.
 *
 * IMMUTABLE STYLE (as in codebook-model.js): nothing here changes its inputs; every
 * function returns new objects.
 *
 * Why src/content/ and not src/modules/: only src/content/ has a chrome:// URL the
 * workspace document can load a script from (see the top of workspace.js).
 */
"use strict";

/**
 * One global object (a property of the window, or of the Node test's sandbox, because it is
 * declared with `var`). workspace.xhtml loads this file after codebook-model.js and before
 * workspace.js.
 */
var TabellifyTagMonitor = {
  /** Columns of the per-paper table that sortPapers() can sort by. */
  SORT_KEYS: ["title", "count", "collections"],

  /** The order shown when a collection is chosen: fewest codebook tags first. */
  DEFAULT_SORT: { key: "count", direction: "asc" },

  /**
   * The chosen collection and all its descendants (children, grandchildren, …).
   * @param {Array<{ id: number, parentID?: number | null | false }>} collections
   *   Every collection of the library (any order)
   * @param {number} rootId
   * @returns {number[]}  Root first, then descendants (depth-first). Empty if rootId is unknown.
   */
  descendantIds(collections, rootId) {
    if (!collections.some((c) => c.id === rootId)) return [];
    // Children of each parent, in input order. Top-level collections have a falsy parentID.
    const children = new Map();
    for (const c of collections) {
      if (!c.parentID) continue;
      if (!children.has(c.parentID)) children.set(c.parentID, []);
      children.get(c.parentID).push(c.id);
    }
    // `visited` guards against a cycle (a collection tree never has one, but a bad snapshot
    // must not make this loop forever).
    const visited = new Set();
    const out = [];
    const walk = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      out.push(id);
      for (const child of children.get(id) ?? []) walk(child);
    };
    walk(rootId);
    return out;
  },

  /**
   * Names of the manual tags in a list of `{ tag, type? }`, trimmed, without empty names.
   * @param {Array<{ tag?: string, type?: number }>} tags
   * @returns {string[]}
   */
  manualTagNames(tags) {
    return (tags ?? [])
      .filter((t) => (t?.type ?? 0) === 0)
      .map((t) => String(t?.tag ?? "").trim())
      .filter((name) => name !== "");
  },

  /**
   * The codebook's groups as `{ id, name, tags }` (tags trimmed, empty ones dropped).
   * A missing or empty codebook gives [].
   * @param {object | null} codebookData  The codebooks.json data (F004), or null
   */
  codebookGroups(codebookData) {
    const groups = codebookData?.codebooks?.[0]?.groups ?? [];
    return groups.map((g) => ({
      id: String(g.id),
      name: String(g.name ?? ""),
      tags: (g.tags ?? []).map((t) => String(t).trim()).filter((t) => t !== ""),
    }));
  },

  /**
   * Compare the codebook with the manual tags on the papers of a collection and its
   * subcollections.
   * @param {object | null} codebookData
   * @param {Array<{ id: number, parentID?: number | null | false, name: string }>} collections
   * @param {number} rootId  The chosen collection
   * @param {Array<{ id: number, title: string, collectionId: number,
   *                 itemTags?: Array<{tag: string, type?: number}>,
   *                 annotationTags?: Array<{tag: string, type?: number}> }>} papers
   * @returns {{ total: number, used: number, allUsed: boolean, paperCount: number,
   *   groups: Array<{ id: string, name: string, total: number, used: number,
   *                   usedTags: Array<{ tag: string, papers: number }>, remainingTags: string[] }>,
   *   papers: Array<{ id: number, title: string, untitled: boolean, collectionNames: string[],
   *                   count: number, total: number,
   *                   groups: Array<{ id: string, name: string, present: string[], remaining: string[] }> }> }}
   */
  summarize(codebookData, collections, rootId, papers) {
    const groups = this.codebookGroups(codebookData);
    const scope = this.descendantIds(collections, rootId);
    const order = new Map(scope.map((id, i) => [id, i]));
    const names = new Map(collections.map((c) => [c.id, String(c.name ?? "")]));

    // 1. Merge the per-collection entries into one record per paper (by item ID).
    /** @type {Map<number, { id: number, title: string, collectionIds: Set<number>, tags: Set<string> }>} */
    const merged = new Map();
    for (const p of papers) {
      if (!order.has(p.collectionId)) continue; // not in the chosen collection's tree
      let record = merged.get(p.id);
      if (!record) {
        record = { id: p.id, title: String(p.title ?? "").trim(), collectionIds: new Set(), tags: new Set() };
        merged.set(p.id, record);
      }
      record.collectionIds.add(p.collectionId);
      // A Set: a tag on the item AND on three highlights still counts once for the paper.
      for (const name of this.manualTagNames(p.itemTags)) record.tags.add(name);
      for (const name of this.manualTagNames(p.annotationTags)) record.tags.add(name);
    }

    // 2. How many papers carry each codebook tag.
    const codebookTags = groups.flatMap((g) => g.tags);
    const total = codebookTags.length;
    const paperCounts = new Map(codebookTags.map((t) => [t, 0]));
    for (const record of merged.values()) {
      for (const tag of record.tags) {
        if (paperCounts.has(tag)) paperCounts.set(tag, paperCounts.get(tag) + 1);
      }
    }

    // 3. Per group (codebook order).
    const groupResults = groups.map((g) => {
      const usedTags = g.tags.filter((t) => paperCounts.get(t) > 0).map((t) => ({ tag: t, papers: paperCounts.get(t) }));
      const remainingTags = g.tags.filter((t) => !(paperCounts.get(t) > 0));
      return { id: g.id, name: g.name, total: g.tags.length, used: usedTags.length, usedTags, remainingTags };
    });
    const used = groupResults.reduce((sum, g) => sum + g.used, 0);

    // 4. Per paper.
    const paperResults = [...merged.values()].map((record) => {
      const paperGroups = groups.map((g) => ({
        id: g.id,
        name: g.name,
        present: g.tags.filter((t) => record.tags.has(t)),
        remaining: g.tags.filter((t) => !record.tags.has(t)),
      }));
      const collectionIds = [...record.collectionIds].sort((a, b) => order.get(a) - order.get(b));
      return {
        id: record.id,
        title: record.title,
        untitled: record.title === "",
        collectionNames: collectionIds.map((id) => names.get(id) ?? ""),
        count: paperGroups.reduce((sum, g) => sum + g.present.length, 0),
        total,
        groups: paperGroups,
      };
    });

    return {
      total,
      used,
      allUsed: total > 0 && used === total,
      paperCount: paperResults.length,
      groups: groupResults,
      papers: paperResults,
    };
  },

  /**
   * Feature 005b: compare the codebook with the tags of ONE paper (the reader's "Tabellify
   * tags" section). Same counting rule as summarize(): a codebook tag is "used" if one of
   * `tagNames` equals it exactly (case-sensitive) after trimming both sides.
   *
   * The caller passes names that are already MANUAL tags of the paper and its highlights
   * (reader-tags.js filters them with manualTagNames() above), so this function does not
   * see tag types.
   * @param {object | null} codebookData  The codebooks.json data (F004), or null
   * @param {string[]} tagNames  Manual tag names on the paper (item + annotations), any order
   * @returns {{ total: number, used: number, allUsed: boolean,
   *   remainingByGroup: Array<{ id: string, name: string, tags: string[] }> }}
   *   `remainingByGroup` is in codebook order and leaves out groups with nothing remaining.
   */
  paperSummary(codebookData, tagNames) {
    const groups = this.codebookGroups(codebookData);
    const present = new Set(
      (tagNames ?? []).map((name) => String(name ?? "").trim()).filter((name) => name !== ""),
    );
    let total = 0;
    let used = 0;
    const remainingByGroup = [];
    for (const g of groups) {
      const remaining = g.tags.filter((t) => !present.has(t));
      total += g.tags.length;
      used += g.tags.length - remaining.length;
      if (remaining.length > 0) remainingByGroup.push({ id: g.id, name: g.name, tags: remaining });
    }
    return { total, used, allUsed: total > 0 && used === total, remainingByGroup };
  },

  /**
   * Compare two strings the way people expect: ignore case and accents, and "Item 2"
   * before "Item 10" (`numeric`). Same rule as the F003 item list.
   * @param {string} a
   * @param {string} b
   */
  compareText(a, b) {
    return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  },

  /**
   * Sort the per-paper rows by one column. Returns a new array.
   * - "count": codebook tags on the paper (k), then title.
   * - "title": title. Untitled papers always come last (in both directions).
   * - "collections": the "In" column (collection names joined), then title.
   * `direction` "desc" reverses the chosen column; the title tie-break stays A→Z, untitled
   * last, so equal rows keep a stable, readable order.
   * @template {{ id: number, title: string, untitled: boolean, count: number, collectionNames: string[] }} P
   * @param {P[]} papers
   * @param {string} [key]        One of SORT_KEYS (unknown keys sort by "count")
   * @param {string} [direction]  "asc" (default) or "desc"
   * @returns {P[]}
   */
  sortPapers(papers, key = "count", direction = "asc") {
    const sign = direction === "desc" ? -1 : 1;
    const byTitle = (a, b) => (a.untitled - b.untitled) || this.compareText(a.title, b.title) || (a.id - b.id);
    let primary;
    if (key === "title") {
      primary = (a, b) => (a.untitled - b.untitled) || sign * this.compareText(a.title, b.title);
    } else if (key === "collections") {
      primary = (a, b) => sign * this.compareText(a.collectionNames.join(", "), b.collectionNames.join(", "));
    } else {
      primary = (a, b) => sign * (a.count - b.count);
    }
    return [...papers].sort((a, b) => primary(a, b) || byTitle(a, b));
  },
};
