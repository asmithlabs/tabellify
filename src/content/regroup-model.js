/* Tabellify — regroup-model.js (Feature 006c: drag regrouping in the table, pure logic)
 *
 * In the per-paper table a tag column can be dragged by its header grip (or moved with
 * Alt+Up / Alt+Down on that grip). Where it is dropped decides what happens
 * (docs/features/006c-drag-regroup.md, "What each drop does"):
 * - on a tag header of its own block: reorder inside the block (F005c, layout.json only);
 * - on a tag header of another block: the tag joins that group, or becomes ungrouped;
 * - on a body cell below tag B: the tag joins B's group, or (B ungrouped) a group named B
 *   is created or reused and the tag joins it; B then becomes ONLY that group's name: the
 *   tag B leaves the codebook (owner amendment 2026-11-13; ADR-0016 §7);
 * - on the super-header row: the tag becomes ungrouped.
 *
 * "Plan, then apply": this file only COMPUTES what a drop would do: a new codebook object
 * (through TabellifyCodebook's edit functions) and a new column layout (through
 * TabellifyTableLayout). workspace.js saves the codebook with the normal save and, only if
 * that worked, uses the new layout. Splitting it this way lets Node test every case.
 *
 * View ID vs stored ID: the table calls the block of ungrouped tags "ungrouped"
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
  /**
   * What a drop of tag column `drag` on `target` would do, as data to apply.
   * @param {object | null} codebook  Codebook data (schema 2)
   * @param {{ groupOrder?: unknown, tagOrder?: unknown } | null} columnLayout  Shown now
   * @param {{ groupId: string, tag: string }} drag  The dragged tag and its block (view ID)
   * @param {RegroupTarget} target
   * @returns {{ kind: "none" }
   *   | { kind: "reorder", layout: ColumnLayout }
   *   | { kind: "regroup", edit: { ok: true, data: object }, layout: ColumnLayout,
   *       effect: "joined" | "created" | "ungrouped", groupId: string, nest: boolean }
   * `nest: true` when B (ungrouped) became a group name: a new group (`created`) or an
   * existing one with that name (`joined`); in both cases the tag B left the codebook.
   *   | { kind: "refused", error: string }}
   */
  plan(codebook, columnLayout, drag, target) {
    const L = TabellifyTableLayout;
    const r = this.resolve(codebook, drag, target);
    if (!r) return { kind: "none" };
    if (!r.edit.ok) return { kind: "refused", error: r.edit.error };

    const groupsBefore = TabellifyTagMonitor.codebookGroups(codebook);
    const shown = L.orderedGroups(groupsBefore, columnLayout);
    const A = drag.tag;

    if (r.kind === "reorder") {
      const block = shown.find((g) => g.id === r.blockId);
      const index = this.placeIndex(block.tags.filter((t) => t !== A), r.place);
      return { kind: "reorder", layout: L.moveTag(columnLayout, groupsBefore, r.blockId, A, index) };
    }

    // A regroup. 1. The new block's tag order, computed from what is shown NOW, so A lands
    // exactly where it was dropped (a stale saved entry for A can never win).
    const groupsAfter = TabellifyTagMonitor.codebookGroups(r.edit.data);
    const blockAfter = groupsAfter.find((g) => g.id === r.blockId);
    // A nest removes the tag B from the codebook: it is pruned from every saved order too.
    const moved = r.place.nest ? [r.place.nest, A] : [A];
    const base = (shown.find((g) => g.id === r.blockId)?.tags ?? []).filter((t) => !moved.includes(t));
    let list;
    if (r.place.nest || r.place.end) {
      list = [...base, A];
    } else {
      const index = this.placeIndex(base, r.place);
      list = [...base.slice(0, index), A, ...base.slice(index)];
    }
    let layout = L.withTagOrder(columnLayout, r.blockId, L.mergeOrder(blockAfter?.tags ?? [], list));

    // 2. Prune the moved tags from every other block's saved order (keeps layout.json tidy).
    // Object.fromEntries keeps every key an ordinary own property ("__proto__"-safe).
    layout = {
      groupOrder: layout.groupOrder,
      tagOrder: Object.fromEntries(
        Object.entries(layout.tagOrder)
          .map(([id, tags]) => [id, id === r.blockId ? tags : tags.filter((t) => !moved.includes(t))])
          .filter(([, tags]) => tags.length > 0),
      ),
    };

    // 3. Where the block goes among the groups.
    const shownIds = shown.map((g) => g.id);
    if (r.effect === "created") {
      // A group made by a nest sits right after the block B was in (spec Q5), not at the
      // far right where a group the layout does not know would be appended.
      const at = shownIds.indexOf(r.fromBlockOfAnchor) + 1;
      layout = L.withGroupOrder(layout, [...shownIds.slice(0, at), r.blockId, ...shownIds.slice(at)]);
    } else if (r.blockId === TabellifyCodebook.UNGROUPED_ID && !shownIds.includes(r.blockId)) {
      // The ungrouped block appears: its default place is first (ADR-0016 §6), unless the
      // saved order already has a place for it.
      if (!layout.groupOrder.includes(r.blockId)) {
        layout = L.withGroupOrder(layout, [r.blockId, ...layout.groupOrder]);
      }
    }

    // 4. A codebook edit that changes nothing is only a reorder (never a codebook save).
    if (JSON.stringify(r.edit.data) === JSON.stringify(codebook)) return { kind: "reorder", layout };
    return { kind: "regroup", edit: r.edit, layout, effect: r.effect, groupId: r.blockId, nest: Boolean(r.place.nest) };
  },

  /**
   * What a drop would do, for the drop hint shown while dragging.
   * `hint`: "reorder" | "join" | "to-ungrouped" | "new-group" | "ungroup".
   * `name`: the group joined (stored spelling), or for "new-group" the group name tag B
   * becomes (B itself, or the stored spelling of an existing group with that name), as
   * plain text; "" for the other hints. null when the drop is refused.
   * @param {object | null} codebook
   * @param {{ groupId: string, tag: string }} drag
   * @param {RegroupTarget} target
   * @returns {{ kind: "reorder" | "regroup", hint: string, effect: string | null, name: string } | null}
   */
  describe(codebook, drag, target) {
    const r = this.resolve(codebook, drag, target);
    if (!r || !r.edit.ok) return null;
    if (r.kind === "regroup" && JSON.stringify(r.edit.data) === JSON.stringify(codebook)) {
      return { kind: "reorder", hint: "reorder", effect: null, name: "" };
    }
    return { kind: r.kind, hint: r.hint, effect: r.kind === "regroup" ? r.effect : null, name: r.name };
  },

  // ---------------------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------------------

  /**
   * Classify a drop (no layout needed: which block a tag is in does not depend on it).
   * Returns null for "nothing happens" (not ours, A = B, ungroup of an ungrouped tag, …).
   * `place`: `{ ref, side }` (before/after tag `ref`), `{ end: true }` or `{ nest: B }`.
   * @returns {null | { kind: "reorder" | "regroup", edit: any, effect?: string, hint: string,
   *   name: string, blockId: string, place: any, fromBlockOfAnchor?: string }}
   */
  resolve(codebook, drag, target) {
    const C = TabellifyCodebook;
    const U = C.UNGROUPED_ID;
    if (!codebook || !drag || !target) return null;
    const blocks = TabellifyTagMonitor.codebookGroups(codebook);
    const blockOf = (id) => blocks.find((g) => g.id === id);
    const A = drag.tag;
    const from = blockOf(drag.groupId);
    if (!from || !from.tags.includes(A)) return null;
    const unchanged = { ok: true, data: codebook };
    const stored = (id) => (id === U ? null : id);

    if (target.zone === "super") {
      if (from.id === U) return null; // already ungrouped
      return {
        kind: "regroup", edit: C.setTagGroup(codebook, A, null), effect: "ungrouped",
        hint: "ungroup", name: "", blockId: U, place: { end: true },
      };
    }

    const block = blockOf(target.groupId);
    if (!block || !block.tags.includes(target.tag) || target.tag === A) return null;

    if (target.zone === "header") {
      const place = { ref: target.tag, side: target.side === "after" ? "after" : "before" };
      if (block.id === from.id) {
        return { kind: "reorder", edit: unchanged, hint: "reorder", name: "", blockId: block.id, place };
      }
      const toUngrouped = block.id === U;
      return {
        kind: "regroup", edit: C.setTagGroup(codebook, A, stored(block.id)),
        effect: toUngrouped ? "ungrouped" : "joined", hint: toUngrouped ? "to-ungrouped" : "join",
        name: toUngrouped ? "" : block.name, blockId: block.id, place,
      };
    }

    if (target.zone === "body") {
      const B = target.tag;
      if (block.id !== U) {
        const place = { ref: B, side: "after" };
        // Already in B's group (spec Q7): just move A right after B.
        if (block.id === from.id) {
          return { kind: "reorder", edit: unchanged, hint: "reorder", name: "", blockId: block.id, place };
        }
        return {
          kind: "regroup", edit: C.setTagGroup(codebook, A, block.id), effect: "joined",
          hint: "join", name: block.name, blockId: block.id, place,
        };
      }
      // B is ungrouped: nest. B becomes only a group name (a new group named B, or the
      // existing group of that name); the tag B leaves the codebook and A joins the group.
      const edit = C.groupUnderTag(codebook, A, B);
      if (!edit.ok) return { kind: "regroup", edit, hint: "", name: "", blockId: U, place: null };
      return {
        kind: "regroup", edit: { ok: true, data: edit.data },
        effect: edit.created ? "created" : "joined", hint: "new-group",
        name: C.findGroup(edit.data, edit.groupId)?.name ?? B, blockId: edit.groupId, place: { nest: B },
        fromBlockOfAnchor: U,
      };
    }
    return null;
  },

  /**
   * Index in `rest` (a block's tags without the dragged one) for a `{ ref, side }` place.
   * @param {string[]} rest
   * @param {{ ref?: string, side?: string, end?: boolean }} place
   */
  placeIndex(rest, place) {
    if (place.end || !rest.includes(place.ref)) return rest.length;
    return rest.indexOf(place.ref) + (place.side === "after" ? 1 : 0);
  },
};

/**
 * @typedef {{ zone: "header", groupId: string, tag: string, side: "before" | "after" }
 *   | { zone: "body", groupId: string, tag: string }
 *   | { zone: "super" }} RegroupTarget
 * @typedef {{ groupOrder: string[], tagOrder: Record<string, string[]> }} ColumnLayout
 */
