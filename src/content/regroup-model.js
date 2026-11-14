/* Tabellify — regroup-model.js (Feature 006c: drag regrouping in the table, pure logic)
 *
 * In the per-paper table a tag column can be dragged by its header grip (or moved with
 * Alt+arrow keys on that grip). Since Amendment 2 of docs/features/006c-drag-regroup.md
 * (owner, 2026-11-13) the EDGE of the cell under the pointer decides what happens
 * (TabellifyTableLayout.dropEdge gives the edge; this file applies the rules):
 * - Table 1, an ungrouped tag B: bottom = B becomes a group name and the dragged tag A goes
 *   under it; top ("flip") = A becomes a group name and B goes under it; left / right = A
 *   sits beside B as an ungrouped tag.
 * - Table 2, a group's super-header G: bottom = A joins G at its end; left / right = A
 *   sits beside G as an ungrouped top-level tag; top is not allowed.
 * - Table 3, a tag B inside a group G: left / right = A joins G beside B; top / bottom are
 *   not allowed (there is no third header level).
 * - Table 4, an "Ungrouped" run super-header R: left = A (ungrouped) before R's first tag;
 *   right / bottom = after R's last tag; top is not allowed.
 * FALLBACK: an edge that is not allowed on a cell acts as the pointer's half of the cell
 * (left / right), so what the indicator shows is always what the drop does. Body cells
 * below a tag act as that tag's header with the bottom edge (the workspace passes
 * `edge: "bottom"`).
 * NOTHING DISAPPEARS (owner, 2026-11-13): a drop that would leave a tag without a column,
 * or a group without a column (so its super-header would vanish), is refused (hiddenBy).
 * The only tag that may leave the table is the one a nest or flip turns into a group name.
 *
 * "Plan, then apply": this file only COMPUTES what a drop would do: a new codebook object
 * (through TabellifyCodebook's edit functions) and a new column layout (through
 * TabellifyTableLayout, layout.json schema 3, ADR-0019). workspace.js saves the codebook
 * with the normal save and, only if that worked, uses the new layout.
 *
 * View ID vs stored ID: the table calls ungrouped tags' block "ungrouped"
 * (TabellifyCodebook.UNGROUPED_ID, ADR-0016 §5); in codebooks.json those tags have
 * `group: null`. This file translates between the two.
 *
 * PURE: no Zotero, DOM, IOUtils or PathUtils globals; it never writes anything. It uses the
 * pure globals loaded before it in workspace.xhtml: TabellifyCodebook (codebook-model.js),
 * TabellifyTagMonitor (tag-monitor-model.js) and TabellifyTableLayout
 * (table-layout-model.js). IMMUTABLE STYLE: no function changes its inputs.
 *
 * Why src/content/ and not src/modules/: only src/content/ has a chrome:// URL the
 * workspace document can load a script from (see the top of workspace.js).
 */
"use strict";

/**
 * One global object (a property of the window, or of the Node test's sandbox, because it is
 * declared with `var`). workspace.xhtml loads this file after table-layout-model.js and
 * before layout-store.js and workspace.js.
 */
var TabellifyRegroup = {
  /** Edges each kind of cell allows (spec 006c Amendment 2, Tables 1–4). */
  ALLOWED_EDGES: {
    ungroupedTag: ["left", "right", "top", "bottom"],
    groupedTag: ["left", "right"],
    group: ["left", "right", "bottom"],
    run: ["left", "right", "bottom"],
  },

  /**
   * What a drop of tag column `drag` on `target` would do, as data to apply.
   * @param {object | null} codebook  Codebook data (schema 2)
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout  Shown now
   * @param {{ groupId: string, tag: string }} drag  The dragged tag and its block (view ID)
   * @param {RegroupTarget} target
   * @returns {{ kind: "none" }
   *   | { kind: "reorder", layout: ColumnLayout, edge: string }
   *   | { kind: "regroup", edit: { ok: true, data: object }, layout: ColumnLayout,
   *       effect: "joined" | "created" | "ungrouped", groupId: string,
   *       named: "below" | "above" | null, edge: string }
   *   | { kind: "refused", error: string }}
   * `groupId`: the view ID of the block the drop makes (A's new block; for a flip, the
   * group A became the name of). `named`: which tag became a group name ("below" = the
   * target B, bottom nest; "above" = the dragged A, flip), or null.
   */
  plan(codebook, columnLayout, drag, target) {
    const e = this.evaluate(codebook, columnLayout, drag, target);
    if (!e) return { kind: "none" };
    if (e.error) return { kind: "refused", error: e.error };
    const { r, layout } = e;
    // A codebook edit that changes nothing is only a reorder (never a codebook save).
    if (!this.changed(codebook, r.edit.data)) return { kind: "reorder", layout, edge: r.edge };
    return {
      kind: "regroup", edit: { ok: true, data: r.edit.data }, layout,
      effect: r.effect, groupId: r.blockId, named: r.named, edge: r.edge,
    };
  },

  /**
   * What a drop would do, for the drop indicator and hint shown while dragging.
   * `hint`: "reorder" | "join" | "to-ungrouped" | "new-group". `name`: the group joined
   * (stored spelling), or for "new-group" the group name the drop makes (the tag's own
   * spelling, or the stored spelling of an existing group with that name), as plain text;
   * "" otherwise. `edge`: the edge after the fallback (what the indicator draws). null when
   * nothing would happen or the codebook edit is refused.
   * @param {object | null} codebook
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {{ groupId: string, tag: string }} drag
   * @param {RegroupTarget} target
   * @returns {{ kind: "reorder" | "regroup", hint: string, effect: string | null, name: string,
   *   edge: string, named: "below" | "above" | null } | null}
   */
  describe(codebook, columnLayout, drag, target) {
    const e = this.evaluate(codebook, columnLayout, drag, target);
    if (!e || e.error) return null;
    const r = e.r;
    if (!this.changed(codebook, r.edit.data)) {
      return { kind: "reorder", hint: "reorder", effect: null, name: "", edge: r.edge, named: null };
    }
    return { kind: "regroup", hint: r.hint, effect: r.effect, name: r.name, edge: r.edge, named: r.named };
  },

  /**
   * The drop that an Alt+arrow key on a tag column's grip stands for (spec 006c
   * Amendment 2, A2.9), as a target for plan(), or null when the key does nothing.
   * - A in group G: Up = leave G, ungrouped beside G (before G when A is G's first shown
   *   tag, otherwise after it); Down = nothing.
   * - A ungrouped, with the top-level item directly to its left ("left neighbour"):
   *   an ungrouped tag B → Up = flip (A becomes a group name over B), Down = nest (B becomes
   *   a group name, A under it); a group G → Down = join G at its end, Up = nothing;
   *   no neighbour → nothing.
   * @param {object | null} codebook
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} columnLayout
   * @param {{ groupId: string, tag: string }} drag
   * @param {"up" | "down"} direction
   * @returns {RegroupTarget | null}
   */
  keyboardTarget(codebook, columnLayout, drag, direction) {
    const L = TabellifyTableLayout;
    const U = TabellifyCodebook.UNGROUPED_ID;
    if (!codebook || !drag) return null;
    const groups = TabellifyTagMonitor.codebookGroups(codebook);
    const from = groups.find((g) => g.id === drag.groupId);
    if (!from || !from.tags.includes(drag.tag)) return null;
    if (from.id !== U) {
      if (direction !== "up") return null;
      const shown = L.orderedGroups(groups, columnLayout).find((g) => !g.ungrouped && g.id === from.id);
      const edge = shown && shown.tags[0] === drag.tag ? "left" : "right";
      return { cell: "group", groupId: from.id, edge, side: edge };
    }
    const visible = L.visibleTopItems(groups, columnLayout);
    const index = visible.findIndex((e) => L.sameTopItem(e, { tag: drag.tag }));
    const left = index > 0 ? visible[index - 1] : null;
    if (!left) return null;
    if (Object.hasOwn(left, "tag")) {
      return { cell: "tag", groupId: U, tag: left.tag, edge: direction === "up" ? "top" : "bottom", side: "right" };
    }
    if (direction !== "down") return null;
    return { cell: "group", groupId: left.group, edge: "bottom", side: "right" };
  },

  // ---------------------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------------------

  /**
   * Classify a drop (resolve), compute the layout after it (layoutAfter) and check the
   * "nothing disappears" rule (hiddenBy). Returns null when nothing would happen,
   * `{ r, error }` when the drop is refused (the codebook edit was refused, or the drop
   * would make a tag or a group disappear from the table), otherwise `{ r, layout }`.
   * plan() and describe() both go through here, so the drop indicator is never shown for a
   * drop that plan() would refuse.
   */
  evaluate(codebook, columnLayout, drag, target) {
    const r = this.resolve(codebook, columnLayout, drag, target);
    if (!r) return null;
    if (!r.edit.ok) return { r, error: r.edit.error };
    const layout = this.layoutAfter(codebook, columnLayout, drag.tag, r);
    const nameTag = r.place.kind === "nest" ? r.place.nameTag : null;
    if (this.hiddenBy(codebook, columnLayout, r.edit.data, layout, nameTag).length > 0) {
      return { r, error: this.ERR_WOULD_HIDE };
    }
    return { r, layout };
  },

  /**
   * Fluent ID of the refusal shown when a drop or Alt+arrow key would make a tag or a
   * group disappear from the table (owner, 2026-11-13: "they should be groups, grouped tags
   * or ungrouped tags. they should never just disappear").
   */
  ERR_WOULD_HIDE: "tabellify-regroup-error-would-hide",

  /**
   * THE "NOTHING DISAPPEARS" RULE (owner, 2026-11-13). What a change from (codebookBefore,
   * layoutBefore) to (codebookAfter, layoutAfter) would make disappear from the table, as a
   * list of `{ tag }` / `{ group }` entries ([] = nothing disappears):
   * - every tag in the codebook before must still have a column after (inside a group or
   *   ungrouped). The one exception is `nameTag`, the tag a nest (bottom edge of an
   *   ungrouped tag) or a flip (top edge) turns into a group name: it may leave the
   *   codebook, but only if a group with that name (ignoring case) is shown after;
   * - every group shown before (a super-header) must still be shown after.
   * Why groups count: the table only shows a group that has at least one tag column
   * (TabellifyTableLayout.orderedGroups). A group whose LAST tag moves out disappears from
   * the table (only its "G · 0" pill stays). When that group's name came from a tag (a
   * nest or a flip), the user saw that tag vanish. The codebook does not record where a
   * group's name came from, so the rule protects every group.
   * @param {object | null} codebookBefore
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} layoutBefore
   * @param {object | null} codebookAfter
   * @param {{ topOrder?: unknown, tagOrder?: unknown } | null} layoutAfter
   * @param {string | null} [nameTag]  The tag the change turns into a group name, if any
   * @returns {Array<{ tag: string } | { group: string }>}
   */
  hiddenBy(codebookBefore, layoutBefore, codebookAfter, layoutAfter, nameTag = null) {
    const L = TabellifyTableLayout;
    const TM = TabellifyTagMonitor;
    const before = L.orderedGroups(TM.codebookGroups(codebookBefore), layoutBefore);
    const after = L.orderedGroups(TM.codebookGroups(codebookAfter), layoutAfter);
    const columns = new Set(after.flatMap((g) => g.tags));
    const groupsAfter = after.filter((g) => !g.ungrouped);
    const shownIds = new Set(groupsAfter.map((g) => g.id));
    const isGroupName = (tag) => !TabellifyCodebook.findTag(codebookAfter, tag)
      && groupsAfter.some((g) => g.name.toLowerCase() === tag.toLowerCase());
    const lost = [];
    for (const tag of TM.codebookGroups(codebookBefore).flatMap((g) => g.tags)) {
      if (columns.has(tag)) continue;
      if (nameTag !== null && tag === nameTag && isGroupName(tag)) continue;
      lost.push({ tag });
    }
    for (const g of before) if (!g.ungrouped && !shownIds.has(g.id)) lost.push({ group: g.id });
    return lost;
  },

  /** True when the codebook edit changed something. */
  changed(before, after) {
    return JSON.stringify(after) !== JSON.stringify(before);
  },

  /**
   * The edge to use on a cell: the target's edge when the cell allows it, otherwise the
   * pointer's half of the cell (the fallback, spec A2.3).
   * @param {{ edge?: string, side?: string }} target
   * @param {string[]} allowed
   * @returns {"left" | "right" | "top" | "bottom"}
   */
  resolveEdge(target, allowed) {
    const side = target.side === "right" ? "right" : "left";
    return allowed.includes(target.edge) ? target.edge : side;
  },

  /** "left" → "before", anything else → "after". */
  beforeAfter(edge) {
    return edge === "left" ? "before" : "after";
  },

  /**
   * Classify a drop (Tables 1–4). Returns null for "nothing happens" (unknown cell, stale
   * target, A = B, a run that holds only A, …). Otherwise:
   * `{ edit, effect, hint, name, edge, named, blockId, place }` where `place` says where A
   * (or the new group) lands:
   * - `{ kind: "top", ref, side }`: A as an ungrouped top-level tag before / after `ref`
   *   (a `{ tag }` or `{ group }` entry);
   * - `{ kind: "group", groupId, ref, side }`: A inside group `groupId`, before / after tag
   *   `ref`, or at the end (`ref` null);
   * - `{ kind: "nest", at, groupId, child, nameTag }`: group `groupId` takes tag `at`'s
   *   top-level place (unless it already has one); `child` goes to its end; `nameTag`
   *   left the codebook.
   */
  resolve(codebook, columnLayout, drag, target) {
    const C = TabellifyCodebook;
    const L = TabellifyTableLayout;
    const U = C.UNGROUPED_ID;
    if (!codebook || !drag || !target) return null;
    const blocks = TabellifyTagMonitor.codebookGroups(codebook);
    const A = drag.tag;
    const from = blocks.find((g) => g.id === drag.groupId);
    if (!from || !from.tags.includes(A)) return null;
    const aGrouped = from.id !== U;
    const unchanged = { ok: true, data: codebook };
    // A becomes (or stays) an ungrouped top-level tag beside `ref`.
    const toTop = (ref, edge) => ({
      edit: aGrouped ? C.setTagGroup(codebook, A, null) : unchanged,
      effect: "ungrouped", hint: aGrouped ? "to-ungrouped" : "reorder", name: "", edge, named: null,
      blockId: U, place: { kind: "top", ref, side: this.beforeAfter(edge) },
    });
    // A joins (or moves inside) group G, before / after `ref` or at the end.
    const toGroup = (G, ref, edge) => ({
      edit: from.id === G.id ? unchanged : C.setTagGroup(codebook, A, G.id),
      effect: "joined", hint: from.id === G.id ? "reorder" : "join", name: G.name, edge, named: null,
      blockId: G.id, place: { kind: "group", groupId: G.id, ref, side: this.beforeAfter(edge) },
    });

    if (target.cell === "tag") {
      const B = target.tag;
      const block = blocks.find((g) => g.tags.includes(B));
      if (!block || block.id !== target.groupId || B === A) return null;
      if (block.id !== U) {
        // Table 3: inside a group only left / right (no third header level).
        const edge = this.resolveEdge(target, this.ALLOWED_EDGES.groupedTag);
        return toGroup(block, B, edge);
      }
      // Table 1: an ungrouped tag B.
      const edge = this.resolveEdge(target, this.ALLOWED_EDGES.ungroupedTag);
      if (edge === "left" || edge === "right") return toTop({ tag: B }, edge);
      // Bottom: B becomes the group name, A goes under it. Top (flip): the other way round.
      const below = edge === "bottom";
      const result = below ? C.groupUnderTag(codebook, A, B) : C.tagToGroupName(codebook, A, B);
      if (!result.ok) return { edit: result, edge };
      return {
        edit: { ok: true, data: result.data }, effect: result.created ? "created" : "joined",
        hint: "new-group", name: C.findGroup(result.data, result.groupId)?.name ?? (below ? B : A),
        edge, named: below ? "below" : "above", blockId: result.groupId,
        place: { kind: "nest", at: B, groupId: result.groupId, child: below ? A : B, nameTag: below ? B : A },
      };
    }

    const shown = L.orderedGroups(blocks, columnLayout);
    if (target.cell === "group") {
      // Table 2: a group's super-header.
      const G = shown.find((g) => !g.ungrouped && g.id === target.groupId);
      if (!G) return null;
      const edge = this.resolveEdge(target, this.ALLOWED_EDGES.group);
      if (edge === "bottom") return toGroup(G, null, edge);
      return toTop({ group: G.id }, edge);
    }

    if (target.cell === "run") {
      // Table 4: an "Ungrouped" run super-header.
      const run = shown.find((g) => g.ungrouped && g.run === Number(target.run));
      if (!run) return null;
      const rest = run.tags.filter((t) => t !== A);
      if (rest.length === 0) return null; // the run holds only A
      const edge = this.resolveEdge(target, this.ALLOWED_EDGES.run);
      const ref = edge === "left" ? { tag: rest[0] } : { tag: rest[rest.length - 1] };
      return toTop(ref, edge); // bottom lands like right: after the run's last tag
    }
    return null;
  },

  /**
   * The full, explicit column layout after the drop (spec 006c Amendment 2, A2.5), computed
   * from what is shown NOW (so a stale saved entry can never win): `topOrder` lists every
   * shown top-level item (the home marker copied through), `tagOrder` is updated for the
   * group A (or the nested tag) went into, and the moved tags are pruned elsewhere.
   */
  layoutAfter(codebook, columnLayout, A, r) {
    const L = TabellifyTableLayout;
    const groupsBefore = TabellifyTagMonitor.codebookGroups(codebook);
    const groupsAfter = TabellifyTagMonitor.codebookGroups(r.edit.data);
    const shown = L.orderedGroups(groupsBefore, columnLayout);
    const shownTags = (id) => shown.find((g) => !g.ungrouped && g.id === id)?.tags ?? [];
    const isTag = (e, t) => Object.hasOwn(e, "tag") && e.tag === t;
    const isGroup = (e, id) => Object.hasOwn(e, "group") && e.group === id;
    const place = r.place;
    let top = L.topItems(groupsBefore, columnLayout);
    let setGroup = null;
    let setTags = null;
    const moved = new Set([A]);

    if (place.kind === "top") {
      top = top.filter((e) => !isTag(e, A));
      const at = top.findIndex((e) => L.sameTopItem(e, place.ref));
      const index = at < 0 ? top.length : at + (place.side === "after" ? 1 : 0);
      top.splice(index, 0, { tag: A });
    } else if (place.kind === "group") {
      top = top.filter((e) => !isTag(e, A));
      const list = shownTags(place.groupId).filter((t) => t !== A);
      const index = place.ref !== null && list.includes(place.ref)
        ? list.indexOf(place.ref) + (place.side === "after" ? 1 : 0)
        : list.length;
      list.splice(index, 0, A);
      setGroup = place.groupId;
      setTags = list;
    } else {
      // Nest or flip: the group takes B's top-level place, unless it is already shown
      // (a reused group stays where it is). A's own top-level entry goes.
      moved.add(place.at).add(place.nameTag);
      const hasPlace = top.some((e) => isGroup(e, place.groupId));
      top = top.flatMap((e) => (isTag(e, place.at) ? (hasPlace ? [] : [{ group: place.groupId }]) : [e]))
        .filter((e) => !isTag(e, A));
      setGroup = place.groupId;
      setTags = [...shownTags(place.groupId).filter((t) => !moved.has(t)), place.child];
    }

    // tagOrder: the target group's list (only tags it really has after the edit), and the
    // moved tags pruned from every other group. Object.fromEntries keeps every key an
    // ordinary own property ("__proto__"-safe).
    const blockAfter = groupsAfter.find((g) => g.id === setGroup);
    const tagOrder = Object.fromEntries(
      Object.entries(L.copyTagOrder(columnLayout))
        .filter(([id]) => id !== setGroup)
        .map(([id, tags]) => [id, tags.filter((t) => !moved.has(t))])
        .filter(([, tags]) => tags.length > 0),
    );
    let layout = { topOrder: top, tagOrder };
    if (setGroup !== null && blockAfter) {
      layout = L.withTagOrder(layout, setGroup, L.mergeOrder(blockAfter.tags, setTags));
    }
    // topItems against the codebook AFTER the edit drops the entries the drop made stale
    // (an emptied group, a tag that became a group name) and keeps the home marker.
    return L.withTopOrder(layout, L.topItems(groupsAfter, layout));
  },
};

/**
 * @typedef {{ cell: "tag", groupId: string, tag: string, edge: string, side: "left" | "right" }
 *   | { cell: "group", groupId: string, edge: string, side: "left" | "right" }
 *   | { cell: "run", groupId: "ungrouped", run: number, edge: string, side: "left" | "right" }} RegroupTarget
 * `edge` is "left" | "right" | "top" | "bottom" (TabellifyTableLayout.dropEdge); `side` the
 * pointer's half of the cell, used when the edge is not allowed there.
 * @typedef {{ topOrder: Array<{ group: string } | { tag: string }>, tagOrder: Record<string, string[]> }} ColumnLayout
 */
