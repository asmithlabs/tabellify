# ADR-0014: Saving the per-paper table layout (`layout.json`)

- **Status:** Accepted (owner, 2026-11-13: F005c Q1 = C, layout saved in layout.json)
- **Date:** 2026-11-12
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** ADR-0012 (Accepted: how Tabellify stores its own data; this ADR extends its
  file list and reuses all its rules); Feature 005c spec `docs/features/005c-table-layout.md`
  (Q1); PRD §5 F007 (saved table configurations), F009 (column customization); ADR-0011
  (security review)

> **Only relevant if the owner answers F005c Q1 with option C ("save the layout").** If the
> owner picks option A (not saved, the spec's recommendation), this ADR should be marked
> Rejected or left Proposed until a later feature needs it.

## Context

F005c lets the user reorder the columns of the per-paper table and order papers by hand. By
default (spec option A) that layout lives only in memory and is lost when the Tabellify tab
closes or Zotero restarts. If the owner wants it to survive, Tabellify needs to save it:
that is a new storage format, which CLAUDE.md rule 7 says needs an ADR.

ADR-0012 already decides **where and how** Tabellify stores its own data: JSON files in
`<Zotero data directory>/tabellify/`, one file per concern, written atomically with
`IOUtils.writeJSON` (`tmpPath` + `backupFile`), with `schemaVersion` and `revision`, pure
validation/migration, and a fixed list of files (`codebooks.json`, later `tables.json`).
Agents may not edit an Accepted ADR, so this short ADR adds one file under the same rules.

What the data looks like:
- One column order (five IDs). Tiny.
- Per collection with a manual order: a list of paper identifiers. A 200-paper collection is
  ~2 KB; a library with a few dozen ordered collections stays well under 100 KB.
- Written when the user finishes a move (drop, or a keyboard move), not continuously.

### Background for a JavaScript learner
- **ID vs key in Zotero.** Every item and collection has a numeric `id` (local to this
  computer's database) and an 8-character `key` (the same on every computer and after sync).
  Both are read-only getters (`dataObject.js` @ 10.0.9; spec F005c appendix). Keys make saved
  orders survive a restore from backup or a move to another computer's data folder.

## Decision

**If the layout is saved, save it in a new file `layout.json` in Tabellify's data folder,
under every rule of ADR-0012.**

1. **Location:** `PathUtils.join(Zotero.DataDirectory.dir, "tabellify", "layout.json")`, with
   `layout.json.tmp` and `layout.json.bak` as in ADR-0012 §1–2. Separate from
   `codebooks.json`, so a damaged layout file can never block codebook editing (and the other
   way round).
2. **Shape (schemaVersion 1):**
   ```json
   {
     "schemaVersion": 1,
     "revision": 7,
     "perPaperTable": {
       "columnOrder": ["count", "title", "collections", "tags", "details"],
       "manualOrders": {
         "1/ABCD2345": ["EFGH6789", "JKLM2345"]
       }
     }
   }
   ```
   - `manualOrders` is keyed by the collection's `libraryKey` (`"<libraryID>/<collectionKey>"`)
     and lists **item keys**. `libraryID` is part of the key so a future group-library
     feature does not collide (F004 limits Tabellify to My Library today).
   - The top-level `perPaperTable` object leaves room for other tables without a schema bump.
   - Not saved: the column-sort state (the spec's Q2 decides what shows on return).
3. **Validation (pure, `table-layout-model.js`):** unknown column IDs are dropped and missing
   ones appended (`normalizeColumnOrder`); non-string keys dropped; duplicate keys collapsed;
   collections and papers that no longer exist are **ignored on load** and **pruned on the next
   save**. A file that is not JSON or fails the top-level checks is handled as ADR-0012 §3
   (message with the path, saving disabled so it is never overwritten, `.bak` for manual
   recovery). Unlike the codebook, a broken layout only means "default layout"; the table keeps
   working.
4. **When it is written:** after a completed move (drop / Alt+arrow), "Reset columns" or
   "Clear manual order", debounced by 1 s so several quick keyboard moves give one write.
   Never on load, never because of a library change (pruning waits for the next user action).
5. **Two open Tabellify tabs:** the `revision` check of ADR-0012 §5. On conflict: reload the
   file, re-apply nothing, show "The table layout was changed in another Tabellify tab and has
   been reloaded."
6. **Code:** a small `src/content/layout-store.js` modelled on `codebook-store.js` (same `fs`
   injection for Node tests). The write guard gets **one** new allow-list entry: `IOUtils
   write` in `src/content/layout-store.js`, citing the F005c spec. Alternative considered:
   generalize `codebook-store.js` into one store for every file; rejected for now because it
   would change tested F004 code for a feature that may not need it.
7. **Sync, uninstall:** as ADR-0012 §7–8 (not synced; kept on uninstall).
8. **Relation to F007:** when F007 introduces `tables.json` (saved synthesis tables), each saved
   table carries its own column order and row order. `layout.json` stays the store for the
   F005 per-paper (monitor) table only. If F007's design makes `layout.json` redundant, F007's
   spec migrates it.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. Not saved** (F005c recommendation) | Nothing to build; no storage, no write-guard change | Layout lost on tab close / restart |
| **B. Prefs** (`Zotero.Prefs.set("extensions.tabellify.tableLayout", json, true)`, verified F004 row) | One call; no file code | Prefs live in the **profile**, not with the library (ADR-0012 option B); row orders for many collections can pass Firefox's 4 KB pref warning; no backup, no revision check; a second storage place to document and audit |
| B2. Column order in a pref, rows not saved | Tiny, simple | Only half the request; still two storage places later |
| **C. `layout.json` under ADR-0012 (this ADR)** | Same proven pattern as codebooks (atomic, `.bak`, schema version, Node-testable); travels with the data folder; a damaged file can't affect codebooks | One more file, store module, validation, write-guard entry, ~6 more ACs |
| D. Put the layout into `codebooks.json` | No new file | Mixes concerns; a layout bug could block codebook editing; needs a codebook schema bump |
| E. Wait for F007 `tables.json` | No interim format | Hand orders lost until F007 ships; F007 is about synthesis tables, not the monitor table |
| F. Store order in the library (e.g. an "Extra" field, tags, a note) | Syncs | **Rejected:** library writes (CLAUDE.md rule 8, PRD §6) |

## Consequences
- **Easier:** hand-made orders survive restarts; keys make them survive a data-folder move.
- **Harder:** a second schema-versioned file to validate and migrate; one more write-guard
  allow-list entry for the security audit (ADR-0011) to review.
- **Riskier:** same internal `Zotero.DataDirectory.dir` dependency as ADR-0012 (no new
  internal API). A corrupt `layout.json` only resets the layout.
- **Follow-up if accepted:** F005c task T6 (store, tests, write-guard entry, ACs: order
  survives restart; corrupt file → default layout + message, file untouched; two-tab
  conflict; deleted paper pruned on next save; nothing written on load); docs pass (ADR-0010)
  adds `layout.json` to the wiki "Data Safety and Privacy" page.
- **Revisit when:** F007 designs `tables.json`; F009 adds column widths/visibility (they
  would go into `perPaperTable` with a schema bump).

## Open questions for the owner
1. Accept only if F005c Q1 = C. Otherwise: Rejected, or leave Proposed for later?
2. Item **keys** (portable, recommended) or numeric **IDs** (no new getter, but tied to one
   database)?
