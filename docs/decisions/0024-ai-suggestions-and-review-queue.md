# ADR-0024: AI suggestions, their verification, and the review queue (`ai-runs.json`)

- **Status:** Accepted (owner, 2026-11-18)
- **Date:** 2026-11-18
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** ADR-0012 (Accepted: Tabellify's JSON files, write pattern, validation, limits),
  ADR-0018 (Accepted: saved tables; the same store pattern), ADR-0016 (codebook schema 2; not
  changed here), ADR-0021 (providers), ADR-0023 (what is sent), ADR-0025 (library writes, a
  later phase), ADR-0026 (prompt injection), Feature 010 spec `docs/features/010-ai-fill.md`
  (phase 010b).

## Context

The owner's goal is "build backwards": the AI fills the table, and the table's cells become
highlights in the papers. Writing to the Zotero library is risky and is a later phase
(ADR-0025). The owner's v2 note asks for a **review queue** where the owner approves each
change. So phase 010b keeps AI results **outside the library**: as suggestions the user
accepts or rejects inside Tabellify.

A model can be wrong in three ways that matter here:
1. It names a column that is not in the codebook.
2. It "quotes" a sentence that is not in the paper (a hallucination), or puts it on the wrong
   page.
3. A paper contains hidden text that tells the model to do something else (prompt injection,
   ADR-0026 §4).

This ADR decides a **new storage format** (CLAUDE.md rule 7) and the rules every suggestion
must pass before the user sees it.

### Background for a JavaScript learner
- **Suggestion**: one proposed table cell with evidence: "paper 3, column *Heat index*, page 4,
  quote '…'". It is data in Tabellify's file, not a Zotero item.
- **Review queue**: a list of suggestions with Accept and Reject buttons.
- **Verified quote**: Tabellify searches the paper's own text for the quote (after tidying
  spaces, hyphenation and ligatures) and only marks it verified if it is found on the page the
  model named (or on a neighbouring page; the page is then corrected).

## Decision

### 1. File `ai-runs.json` (schema version 1) under ADR-0012
Path `<data dir>/tabellify/ai-runs.json`, with `.tmp` and `.bak`, written only by a new
`src/content/ai-runs-store.js` (write-guard entry, "IOUtils write"), with the ADR-0012 rules:
atomic write, `revision` check against other tabs, strict validation, a damaged or newer file is
never overwritten, size check with `IOUtils.stat` before parsing (ADR-0012 amendment).

```json
{
  "schemaVersion": 1,
  "revision": 3,
  "nextId": 41,
  "hints": { "Heat index": "Any heat metric that combines temperature and humidity." },
  "runs": [
    {
      "id": "r1",
      "createdAt": "2026-12-01T10:02:00.000Z",
      "provider": "anthropic",
      "model": "<model id as sent>",
      "collectionKey": "1/ABCD2345",
      "codebookId": "c1",
      "tags": ["Heat index", "Temperature", "Hospitalization"],
      "status": "complete",
      "usage": { "inputTokens": 182000, "outputTokens": 9100 },
      "papers": [
        {
          "itemKey": "EFGH6789",
          "attachmentKey": "PDFK2345",
          "status": "done",
          "suggestions": [
            {
              "id": "s7",
              "tag": "Heat index",
              "quote": "Heat index was computed from daily maximum temperature and relative humidity.",
              "pageIndex": 3,
              "verified": true,
              "decision": "accepted",
              "decidedAt": "2026-12-01T10:20:00.000Z",
              "annotationKey": null
            }
          ]
        },
        { "itemKey": "JKLM2345", "attachmentKey": null, "status": "skipped", "reason": "no-pdf", "suggestions": [] }
      ]
    }
  ]
}
```
- `status` of a run: `complete`, `partial` (some papers failed), `cancelled`, `failed`.
- `status` of a paper: `done`, `skipped` (with `reason`: `no-pdf`, `no-text`, `too-many-pages`,
  `too-large`), `error` (with `reason`: `auth`, `rate-limit`, `spend-limit`, `network`,
  `bad-output`, `cancelled`).
- `pageIndex` is 0-based (Zotero's annotation positions use `pageIndex`); the UI shows
  `pageIndex + 1` as "p. 4" (the PDF's printed page label may differ; shown as is when known).
- `decision`: `pending`, `accepted`, `rejected`.
- `annotationKey`: always `null` in 010b; filled only by ADR-0025's writer (010d) or by 010c's
  match (§6).
- `hints` (question 4 below; spec Q12): optional text per tag name, sent with the tag list (ADR-0023 §1).
  Stored here, **not** in `codebooks.json`, so the Accepted codebook schema (ADR-0016) is not
  changed.
- **Not stored:** the API key, prompts, raw responses, paper text beyond the quotes.

### 2. Limits (pure, checked before every write; refused with a message naming the limit)
| Limit | Value |
|---|---|
| Runs kept | 50 (the user deletes old runs; no automatic deletion) |
| Papers per run | 100 (the run limit itself is ADR-0026 §2; this is the file limit) |
| Suggestions per paper | 200 |
| Quote length | 1,000 characters (longer quotes are refused, not cut) |
| Hint length | 500 characters per tag; 300 hints |
| Whole file | 20,000,000 characters of JSON (as ADR-0018); `IOUtils.stat` cap 60,000,000 bytes |

### 3. Every suggestion is checked before it is stored
Pure function `TabellifyAiSuggestions.check(response, context)` in
`src/content/ai-suggestions-model.js` (no Zotero globals, tested in Node):
1. The response must parse as JSON of the agreed shape (ADR-0021 §5), under 1 MB of text.
   Anything else → paper `error` / `bad-output`, nothing stored for that paper.
2. `tag` must be exactly one of the run's tag names (same identity rule as Zotero: trim + NFC,
   case-sensitive). Unknown tags are dropped and counted ("2 suggestions named columns that are
   not in the codebook").
3. `quote` must be 1–1,000 characters and must be found in the text that was sent for that
   paper, after normalising both sides (whitespace runs → one space, soft hyphens and
   end-of-line hyphenation removed, ligatures `ﬁ ﬂ ﬀ ﬃ ﬄ` expanded, curly quotes and dashes
   folded, Unicode NFKC). Found on the named page → `verified: true`. Found on another page →
   `verified: true` and `pageIndex` corrected. Not found → `verified: false`.
4. `page` must be an integer within the paper's page count; otherwise it is ignored and the
   quote search decides the page.
5. Exact duplicates (same tag, same normalised quote) are merged.
**Unverified suggestions are shown, marked "Quote not found in paper", and cannot be
accepted.** (They show the user what the model claimed; they are never written anywhere in
the library.)

### 4. Review queue behaviour
- The queue lists, per paper, its suggestions grouped by column, with the quote, "p. N",
  **Show in PDF** (opens Zotero's reader at that page, read-only, spec 010b), **Accept**,
  **Reject**, and **Undo** for a decision. Keyboard: every button is a real `button`.
- Bulk actions (spec Q10): "Accept all verified in this paper" and "Reject all
  remaining in this paper", each with an inline confirmation.
- **All text from the model or the paper is rendered with `textContent` only**, never
  `innerHTML` (ADR-0026 §4); long quotes are clamped visually with a "More" toggle.

### 5. How accepted suggestions show in the table (spec Q11)
- The per-paper table (F005c/F006) gains a **view option** "Show accepted AI suggestions".
  When on, a cell with no real Zotero tag but an accepted suggestion shows a distinct "AI"
  marker (design token colour, plus text for screen readers), never the normal ✓.
- Real tags always win: a cell with a real tag shows ✓ as today.
- k/M counts and the tag monitor count **real tags only**. AI cells never change the codebook
  progress ("Tags used 4/15").
- CSV export (F008) gets an option "Include accepted AI suggestions" (off by default); when
  on, those cells are written as `AI` (not `✓`) so a reader of the CSV can tell them apart.
  Saved tables (ADR-0018) snapshot what is shown, including `AI` cells, only if the option was
  on when saving (snapshot schema change: deferred; until then, saved tables ignore AI cells).

### 6. Link to the library in later phases
- **010c (assisted highlighting):** when Zotero's Notifier reports a new manual tag on an
  annotation (`add` `item-tag`, verified row) whose tag equals an accepted suggestion's tag and
  whose highlight text contains the normalised quote, Tabellify stores that annotation's key in
  `annotationKey` and marks the suggestion "Highlighted". Tabellify writes nothing to the
  library in 010c.
- **010d (AI highlights):** ADR-0025 decides how Tabellify itself creates the annotation and
  fills `annotationKey`.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. Suggestions in Tabellify's own file, user reviews, no library writes (recommended for 010b)** | Library untouched; every AI claim is checked and reviewable; works in read-only group libraries; easy to throw away (delete a run) | Accepted cells are not in Zotero (not synced, not visible in the reader) until 010c/010d |
| B. Write tags/annotations straight away, review afterwards in Zotero | One step | First library write with no review; mistakes land in synced data; creating annotations is not undoable in Zotero 10 (Z10 guide). Rejected for 010b |
| C. Keep suggestions only in memory | No new file | A 30-paper run costs money; losing results on tab close is unacceptable |
| D. Store suggestions inside `tables.json` | One file fewer | Runs are not tables; a run can serve several tables; mixing concerns (ADR-0014/0018 rejected the same idea) |
| E. Hints in `codebooks.json` (schema 3) | Hints sit with the tags they explain | Changes an Accepted schema for an AI-only feature; can be moved later with a migration |
| F. Trust the model's quotes (no local check) | Simpler | Hallucinated quotes would reach the table and later the PDF. Rejected |

## Consequences
- **Easier:** the owner can try AI fill on real collections with zero library risk; every claim
  carries its evidence; results survive restarts.
- **Harder:** a fourth schema-versioned file, a fifth write-guard entry, and a normaliser that
  must be good enough for real PDFs (unit tests with ligatures, hyphenation, two-column text).
- **Riskier:** the file holds quotes from papers (a second copy of text already in the library;
  privacy note as ADR-0018 §7). The normaliser can miss real quotes (false "not found"): the
  user then highlights by hand (010c).
- **Follow-up:** spec 010b tasks; security-auditor reviews the validator (model output is
  untrusted input to a privileged document) and the renderer; docs pass.
- **Revisit when:** saved tables should keep AI cells (snapshot schema 2); hints should move to
  the codebook; runs grow past the limits.

## Open questions for the owner
1. Approve `ai-runs.json` (schema 1) as above? *Recommended: yes.*
2. Unverified quotes visible but not acceptable? *Recommended: yes.*
3. AI cells shown with an "AI" marker, never counted as real tags? *Recommended: yes.*
4. Hints stored in `ai-runs.json`, not in the codebook? *Recommended: yes.*
