# ADR-0023: What paper data leaves the device, and how the user agrees to it

- **Status:** Accepted (owner, 2026-11-18)
- **Date:** 2026-11-18
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** ADR-0021 (provider access), ADR-0022 (key storage), ADR-0024 (suggestions),
  ADR-0026 (cost estimate, prompt injection), ADR-0011 (security review), PRD §6 ("Library
  safety first", "Traceable synthesis"), Feature 010 spec `docs/features/010-ai-fill.md`.

## Context

Until now Tabellify never sent anything off the computer. F010 sends paper content to a
company the user chose (Anthropic or OpenAI). Users must know, before each run, exactly what
is sent, to whom, and roughly what it costs. Researchers may hold papers under licences,
unpublished manuscripts, or group libraries shared by colleagues.

Facts from the providers' current documentation (checked 2026-11-18; Tabellify links to
these pages rather than repeating them as promises):
- OpenAI: API data "is not used to train or improve OpenAI models" unless the customer opts
  in; abuse-monitoring logs are "retained for up to 30 days"; the Responses API keeps
  application state for 30 days "by default, or when the `store` parameter is set to `true`"
  ([Your data](https://developers.openai.com/api/docs/guides/your-data)).
- Anthropic: retention is described in its
  [API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)
  page and its commercial data retention policy linked there.
- Anthropic's token-counting endpoint is free but receives the full content to count
  ([Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)).
  So a "precise" cost estimate would itself send the paper. ADR-0026 therefore estimates
  locally.

### Background for a JavaScript learner
- **Off-device**: the data leaves the user's computer over the internet and is processed on
  the provider's servers. Tabellify cannot delete it there afterwards.
- **Consent dialog**: a modal (the same `html:dialog` pattern as F007a) that lists what will be
  sent and has a clear "Send" button and a "Cancel" button. Nothing happens until "Send".
- **Data minimisation**: send the smallest amount that still does the job.

## Decision

### 1. What is sent (per paper, one request per paper)
| Sent | Why |
|---|---|
| The **text of the paper's PDF**, split by page (from Zotero's own text extraction; source chosen in the spec after RT-AI3) | The model must read the paper to find passages |
| The paper's **title** | Helps the model and the user's review; already public for published papers |
| The **codebook tag names** of the chosen table, plus optional per-tag **hints** the user wrote (ADR-0024 §5) | The model must know what each column means |
| Fixed **instructions** (system prompt, ADR-0026 §5) | How to answer |

**Never sent:** the API key (it is a header, not content), notes, existing annotations and
their comments, other tags, authors, abstracts or other fields (unless a later spec adds
them), collection and library names, file paths, Zotero IDs or keys (Tabellify uses local
numbers like "paper 3" and maps them back itself), other papers in the same request, anything
from other collections. Sending the **PDF file itself** (images, figures) is a later option
(question 3 below; spec Q3), not phase 010b.

**Test key** (ADR-0022 §6) sends one tiny fixed request ("Reply with OK") and no library data.

### 2. When it is sent: only after a per-run confirmation
- **First use per provider:** a privacy notice (what is sent, to whom, links to the provider's
  data pages, "Tabellify cannot delete data from the provider"). The user ticks "I
  understand" once per provider; Tabellify remembers it in a pref
  (`extensions.tabellify.ai.noticeAccepted.<provider>` = the notice version). A new notice
  version (changed wording or data) asks again.
- **Every run:** a confirmation dialog before anything is sent. It shows: provider and model;
  the number of papers and their titles (scrollable); papers that will be **skipped** and why
  (no PDF, too many pages, no text); estimated pages and tokens, and an estimated cost range
  (ADR-0026 §3); "What is sent" and "What is not sent" (short lists from §1); a link to the
  provider's data page. Buttons: **Send N papers to <provider>** and **Cancel**. Keyboard focus
  starts on **Cancel**.
- **No "don't ask again"** in v2.0. **No background, scheduled or automatic runs.** Opening
  the workspace, choosing a collection, or opening the review queue never sends anything.
- **Group libraries:** the dialog adds one line: "Some papers are in the group library
  '<name>'. Other members may not expect their PDFs to be sent to an AI service."

### 3. Provider settings Tabellify always sets
- OpenAI: `store: false` on every Responses request (no stored application state).
- Anthropic: no Files API upload (text goes inline in the request), so nothing is kept as a
  file on Anthropic's side by Tabellify's choice.
- No `metadata.user_id` or any user identifier.

### 4. What Tabellify keeps locally
The run record and suggestions (quotes, page numbers, decisions) in `ai-runs.json`
(ADR-0024). Never the raw request, never the raw response, never the key. Debug Output gets
counts, status codes, durations and token totals only, never titles, quotes, prompts or
response text (same rule as F007b/F008).

### 5. Wording
The spec lists the proposed Fluent strings for the notice and the dialog (`tabellify-ai-*`).
The docs pass (ADR-0010) adds a "Data Safety and Privacy" section for AI. Wording must not
promise anything the provider's own pages do not say.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. Per-run confirmation + one-time notice per provider (recommended)** | The user sees exactly what goes out every time; matches "owner approves each change"; easy to audit | One extra click per run |
| B. One-time consent in settings, then runs start immediately | Faster | Easy to forget that a click sends 40 papers abroad; no per-run cost check |
| C. Per-paper confirmation | Maximum control | Tedious for a collection of 30 papers; users will click through without reading |
| D. Send the whole PDF file by default | Model sees figures and tables as images; Anthropic/OpenAI both accept PDFs | Sends more (images, embedded data, possibly hidden text and metadata); costs more (Anthropic: 1,500–3,000 text tokens per page plus up to 1,568 image tokens per page, [PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support)); later option |
| E. Precise cost estimate with the provider's token-count endpoint before consent | Exact numbers | Sends the paper before the user agreed. **Rejected** (ADR-0026 §3) |

## Consequences
- **Easier:** a clear, auditable rule: nothing leaves without the run dialog's Send click.
- **Harder:** the dialog needs a fair, local cost estimate (ADR-0026) and a skip list.
- **Riskier:** once sent, data is outside Tabellify's control; the notice says so. A user who
  sends a group's papers may break the group's expectations; the dialog warns.
- **Follow-up:** spec 010b ACs for the dialog; security-auditor checks that no code path calls
  `ai-client.js` without a confirmed run object; docs pass.
- **Revisit when:** the owner wants PDF-file mode, metadata (abstract, authors) in the prompt,
  or batch / background runs.

## Open questions for the owner
1. Approve per-run confirmation plus a one-time notice per provider, with no "don't ask
   again"? *Recommended: yes.*
2. Send the title with the text? *Recommended: yes* (helps review; low sensitivity).
3. Send extracted text only in 010b, and the PDF file later as an option? *Recommended: yes.*
