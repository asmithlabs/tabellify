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
| F001 | Plugin shell: installs, opens a workspace window with placeholder | **Now** |
| F002 | Read-only data access: list collections, items, and tags of a chosen collection | Next |
| F003 | Curated tag list (codebook) with super-tag groups, stored by Tabellify | |
| F004 | Tag monitor: used / remaining curated tags for a collection | |
| F005 | Table builder: rows = papers, columns = (super-)tags, preview grid | |
| F006 | Save / list / edit / delete table configurations (persistent) | |
| F007 | CSV export (then optional XLSX) | |
| F008 | Column customization: user-created columns, drag-and-drop reorder, column types | |
| F009+ | AI-assisted extraction and classification | Future |

## 6. Principles

- **Library safety first.** Tabellify reads the Zotero library; its own data (codebooks,
  table configurations) is stored separately. It never modifies items, tags, or annotations
  unless a later spec explicitly authorizes it and the owner approves.
- **Traceable synthesis.** Every table cell should be traceable to its source paper (and,
  where relevant, annotation).
- **Native feel.** Follow Zotero UI conventions; use documented plugin APIs.
- **Open and community-friendly.** AGPL-3.0-or-later, clear contribution guide.

## 7. Product decisions (2026-11-11)

- **Q1 — Cell content: DECIDED.** Default = text of highlights carrying that tag. The user
  can change it **per table in the Table Builder** ("Cell content": Highlights ·
  Highlights + comments · ✓ presence). A per-column override may come later (F008).
- **Q2 — Tag source: DECIDED.** Both item tags and annotation tags; the Table Builder lets
  the user choose the source(s) per table.
- **Q3 — Planner location: DECIDED.** Inside the Tabellify workspace window (not Zotero
  Settings). Consistent with ADR-0004.
- **Q4 — Super-tag groups: DECIDED (option A).** Groups are stored in
  Tabellify's own codebook; Zotero tags stay unchanged. Optional later: import groups from
  tag names that use a prefix convention (e.g. `Exposure: Heat index`).

## 8. Open product questions
- **Q5 — Rows.** One row per paper (item) always, or optionally one row per annotation?
- **Q6 — Collection names as columns.** Meaning: a column showing which (sub)collection
  each paper belongs to, or tables spanning several collections?
