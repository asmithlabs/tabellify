# Tabellify — Product Requirements

Status: Draft v0.1 (2026-11-11) · Owner: Antonio Smith
Source: owner's sketches (`docs/product/sketches/`) and project brief. Working title in the
sketches was "TableMate".

## 1. Problem

A researcher reviewing literature must extract comparable information from many papers
and synthesize it into a table. **Motivating case:** finding out how previous studies built
*computational phenotypes* when examining how heat waves affect health outcomes in U.S.
populations (e.g. "Assessing summertime extreme heat & hospitalization").

Today this means reading papers in Zotero, keeping notes elsewhere, and building a
spreadsheet by hand — slow, inconsistent, and hard to audit back to the source.

## 2. Vision

Tabellify turns **curated tags** into **structured literature tables** inside Zotero:

> take tags and turn them into tables; help take data from studies and synthesize it into a table.

## 3. Core user workflow (from the sketches)

1. **Read** papers in a collection.
2. **Tag** them using a **preplanned (curated) tag list** — a codebook.
3. **Be informed when all curated tags have been used** (tag monitor: "Tags used 4/15, remaining …").
4. **Construct a table** with tags and collection names as columns, with **sub-columns**
   (super-tag → tag hierarchy).
5. **Visualize** the table.
6. **Export** to CSV (Excel also sketched).

## 4. UI concepts in the sketches

| Sketch element | What it shows | Notes / open questions |
|---|---|---|
| **Table Planner** | Pick a collection (dropdown); pick tags (chips with +); Table Builder preview with grouped headers (SuperTag1 → Tag1, Tag2; SuperTag2 → Tag3–5); horizontal/vertical scroll; **Generate Table** and **Save Table** buttons | Drawn as a pane inside Zotero **Settings** (beside General, Sync, Export, Cite, Advanced). Q3. |
| **Generate → note-like modal** | Name + Description form → rendered table → `NAME.csv` saved to Downloads | "Save results & visualize table in a note-like modal; file created and exported for use in the app of your choice." |
| **Save → Saved Tables list** | Persistent list of tables, each with delete, XL, CSV actions; "+" opens the save modal without a table | "Can save tables to a persistent list. Export & edit/delete tables." |
| **Tag monitor** | Panel beside the reader: "Tags used 4/15", list of remaining curated tags | "To facilitate consistency w/ inline visual." |
| **Tag modal in reader** | Zotero's annotation popup (comment + tags) | Existing Zotero UI — suggests tags may be applied to **annotations**, not only items. Q2. |

## 5. Capabilities (roadmap, incremental)

| # | Capability | Milestone |
|---|---|---|
| F001 | Plugin shell: installs, opens a workspace window with placeholder (interim surface; proves install, startup, menu, cleanup) | Done (PR #1) |
| F002 | Workspace as a main-window tab (replaces the F001 window; see requirement REQ-1 in §7) | Done (v0.1.0) |
| F003 | Read-only data access: list collections, items, and tags of a chosen collection | Done (v0.1.0) |
| 003b | Group libraries: choose a collection in My Library or any group library (read-only); spec `docs/features/003b-group-libraries.md` | Done (v0.2.0) |
| F004 | Curated tag list (codebook) with super-tag groups, stored by Tabellify | Done (v0.1.0) |
| F005 | Tag monitor: used / remaining curated tags for a collection; 005b "Tabellify tags" item pane / reader section, 005c table layout, 005d design system | Done (v0.1.0) |
| F006 | Table builder: rows = papers, columns = (super-)tags, preview grid; 006a workspace restructure, 006b tag autocomplete, 006c drag regrouping | Done (v0.1.0) for 006a–006c |
| 006d | Highlight text in table cells (the original F006 addition) | Planned |
| F007 | Save / list / edit / delete table configurations (persistent); 007a "View table" modal, 007b saved tables | Done (v0.1.0) |
| F008 | CSV export (then optional XLSX) | Done (v0.1.0) for CSV; XLSX Planned |
| F009 | Column customization: user-created columns, drag-and-drop reorder, column types | Planned |
| F010+ | AI-assisted extraction and classification. Owner's v2 idea: the user picks Claude or ChatGPT and enters their own API key, and the AI fills highlights from the table (exact behaviour to be specified; any library write needs a spec) | Planned (v2) |

**Proposed split (2026-11-13, approved by the owner).** The owner's workspace
restructure request is planned as 006a (layout, tag script box, optional groups; ADR-0016),
006b (library tag autocomplete, codebook-only "Create tag"), 006c (regroup by drag), F008
(CSV export; ADR-0017), 007a ("View table" modal) and 007b (saved tables; ADR-0018). The
original F006 addition (highlight text in cells) becomes 006d. Details:
`docs/features/006a-workspace-restructure.md`, "Phases". The table above reflects this split
(updated for v0.1.0, 2026-11-15).

**Renumbering (2026-11-11).** The new F002 was inserted ahead of data access, so every later
feature moved up by one. Accepted ADRs keep the old numbers as historical records; read them
with this mapping:

| Old | New | Capability |
|---|---|---|
| — | F002 | Workspace as a main-window tab (new) |
| F002 | F003 | Read-only data access |
| F003 | F004 | Curated tag list (codebook) |
| F004 | F005 | Tag monitor |
| F005 | F006 | Table builder |
| F006 | F007 | Save / list / edit / delete tables |
| F007 | F008 | CSV export |
| F008 | F009 | Column customization |
| F009+ | F010+ | AI-assisted extraction |

## 6. Principles

- **Library safety first.** Tabellify reads the Zotero library; its own data (codebooks,
  table configurations) is stored separately. It never modifies items, tags, or annotations
  unless a later spec explicitly authorizes it and the owner approves.
- **Traceable synthesis.** Every table cell should be traceable to its source paper (and,
  where relevant, annotation).
- **Native behaviour, Tabellify look.** Follow Zotero's interaction conventions (menus,
  tabs, item pane sections, keyboard use, Fluent strings, the Color Scheme setting) and use
  documented plugin APIs. Inside its own workspace, Tabellify uses its brand palette and
  design tokens (ADR-0015). Anything shown inside Zotero's own panes stays Zotero-native.
- **Open and community-friendly.** AGPL-3.0-or-later, clear contribution guide.

## 7. Product decisions (2026-11-11)

- **Q1 — Cell content: DECIDED.** Default = text of highlights carrying that tag. The user
  can change it **per table in the Table Builder** ("Cell content": Highlights ·
  Highlights + comments · ✓ presence). A per-column override may come later (F009).
- **Q2 — Tag source: DECIDED.** Both item tags and annotation tags; the Table Builder lets
  the user choose the source(s) per table.
- **Q3 — Planner location: DECIDED.** Inside the Tabellify workspace window (not Zotero
  Settings). Consistent with ADR-0004. *(From F002 the workspace becomes a main-window tab;
  see REQ-1. The planner stays inside the workspace.)*
- **Q4 — Super-tag groups: DECIDED (option A).** Groups are stored in
  Tabellify's own codebook; Zotero tags stay unchanged. Optional later: import groups from
  tag names that use a prefix convention (e.g. `Exposure: Heat index`).

- **REQ-1 — Workspace inside the main Zotero window: REQUIRED (2026-11-11, high priority).**
  The Tabellify workspace must open as a **tab inside the main Zotero window**, like Better
  Notes' workspace tab, so it works when Zotero is maximized or full screen. A separate
  window that gets left behind in full-screen mode is not acceptable for the real product.
  F001's separate window is an interim surface that proves install, startup, menu and
  cleanup; F002 delivers the tab. How (and which Zotero internals it relies on) is decided by
  an ADR superseding ADR-0004, approved by the owner before implementation.

## 8. v2 roadmap (Planned, 2026-11-18)

Tabellify 0.2.0 is the first public release. The items below are **Planned**: nothing here is
a commitment beyond what the owner asked for, and each item needs its own approved spec (and
ADRs where CLAUDE.md rule 7 applies) before it is built. Order is not decided.

| Item | What | Status | Spec / ADRs |
|---|---|---|---|
| **F010 AI fill** | The owner's v2 idea: the user picks Claude or ChatGPT with their own API key; the AI takes a collection, fills the table, and the table's cells become highlights in the PDFs ("build backwards") | Planned (spec Draft) | `docs/features/010-ai-fill.md`; ADR-0021 … ADR-0026 (Proposed) |
| 010a AI settings | Provider, model, API key (stored encrypted), Test key, Forget key | Planned | F010 spec |
| 010b AI suggestions | Read-only: per-run consent and cost estimate, suggestions checked against the paper text, review queue, "AI" marker in the table, optional in CSV. No library writes | Planned (proposed MVP) | F010 spec; ADR-0023, 0024, 0026 |
| 010c Assisted highlighting | Open the PDF at an accepted suggestion; the user highlights and tags with Zotero's tools; Tabellify links it. No Tabellify library writes | Planned | F010 spec; ADR-0025 §1 |
| 010d AI highlights | Tabellify creates tagged highlights for accepted suggestions, with a marker tag and per-run removal. **First library write**; only after a read-only spike and owner approval | Planned | F010 spec; ADR-0025 |
| 010e AI-proposed columns | Idea only: the AI proposes codebook columns for a collection | Not planned (owner question F010 Q18) | — |
| 006d | Highlight text in table cells (the original F006 addition) | Planned | — |
| F008b | XLSX export (F008 delivered CSV) | Planned | — |
| F009 | Column customization: user-created columns, drag-and-drop reorder, column types | Planned | — |

## 9. Open product questions
- **Q5 — Rows.** One row per paper (item) always, or optionally one row per annotation?
- **Q6 — Collection names as columns.** Meaning: a column showing which (sub)collection
  each paper belongs to, or tables spanning several collections?
