# Feature 010: AI fill ("build backwards": from the table to the highlights)

- **Status:** Approved (owner, 2026-11-18: "approve all" — every recommendation Q1–Q19 accepted, including Q1 full flow for every F010 phase)
- **Branch:** `docs/010-ai-fill-spec` (this spec and ADRs). Implementation branches, one per
  phase: `feat/010a-ai-settings`, `feat/010b-ai-suggestions`, `feat/010c-assisted-highlights`,
  `feat/010d-ai-highlights`.
- **Related ADRs:** **0021** (provider access), **0022** (API key storage), **0023** (data sent
  and consent), **0024** (suggestions, verification, review queue, `ai-runs.json`), **0025**
  (library writes: annotations and tags), **0026** (cost, limits, models, prompt injection), all
  **Proposed** and needed by this spec. Accepted ADRs this builds on: 0003 (no bundler), 0008
  (Zotero 10.0.x), 0009 (workspace tab), 0011 (security review), 0012 (Tabellify's JSON files),
  0015 (design tokens), 0016 (codebook schema 2), 0017 (CSV export), 0018 (saved tables).
- **Process:** see Q1 (prototype mode or the full flow). Each phase is its own PR and its own
  owner test.

## Owner's request (verbatim)
2026-11-18: "it would be claude or chatgpt whatever the person wants. but it should take a
collection, build the table and fill out the annotations/highlights from the table".

2026-11-14 (`build/v2-notes.md`): "user picks a collection; an AI model the user chooses
(Claude or ChatGPT, with the user's own API key) builds the table and fills it in by creating
highlights/annotations in each PDF that match the codebook columns ("build backwards": table
-> highlights). Needs before any build: ADRs for (1) provider choice + API key storage, (2) what
paper text is sent off-device and user consent, (3) library writes (creating annotations +
tags) — first feature that writes to the library; owner approves each change (review queue),
undo plan, (4) cost/rate limits."

## Problem / objective
Today the researcher reads every paper, highlights the passages, and tags each highlight with
a codebook tag. Tabellify then builds the table from those tags. For a collection of 30 papers
and 15 columns that is days of work.

F010 runs the process backwards. The user picks a collection and a codebook (the table's
columns). An AI model the user chooses reads each paper and proposes, for each column, the
sentences that answer it, with the page. The user reviews each proposal. Accepted proposals
fill the table, and, in later phases, become real tagged highlights in the PDFs.

Two rules shape everything:
1. **Nothing leaves the computer without a per-run confirmation** (ADR-0023).
2. **Nothing is written to the Zotero library before phase 010d**, and in 010d only after the
   user accepts each item (ADR-0025).

## Background for a JavaScript learner
- **API / API key / token**: see ADR-0021 and ADR-0026 "Background". The key is the user's
  secret; tokens are what the provider bills.
- **Prompt**: the text Tabellify sends to the model: instructions, column names, and the
  paper's text.
- **Structured output**: the provider forces the model to answer as JSON of a shape we give
  (here: a list of `{ tag, quote, page }`). It makes the answer easy to read in code.
- **Suggestion**: one proposed cell with its evidence (ADR-0024). It lives in Tabellify's own
  file `ai-runs.json`, not in Zotero.
- **Verified quote**: Tabellify finds the quoted sentence in the paper's own text. A model can
  invent quotes; unverified ones cannot be accepted.
- **Review queue**: the list where the user accepts or rejects each suggestion.
- **Prompt injection**: text inside a paper that tries to give the model orders. ADR-0026 §5
  lists the defences.
- **Annotation position**: where a highlight sits on the page (page number and rectangles).
  Computing it from a quote has no documented Zotero API (ADR-0025, the reason for the 010d
  spike).

## Phases (proposal)
| Phase | What the user gets | Writes to Zotero library | Sends data off-device | Depends on |
|---|---|---|---|---|
| **010a AI settings** | Choose Claude or OpenAI, a model, paste a key, **Test key**, **Forget key** | No | Only the tiny "Test key" request (no library data) | ADR-0021, 0022; RT-AI1, RT-AI2 |
| **010b AI suggestions (MVP, read-only)** | "AI fill" for the chosen collection and codebook: consent dialog with cost estimate, a run with progress and Cancel, suggestions checked against the paper text, a review queue (Accept / Reject), **Show in PDF**, accepted suggestions shown in the table with an "AI" marker, optional in CSV | **No** | Yes: per paper, its text and title, the column names and hints, after the per-run confirmation | ADR-0023, 0024, 0026; RT-AI3 |
| **010c Assisted highlighting** | From an accepted suggestion, open the PDF at the page with the quote beside it; the user highlights and tags with Zotero's own tools; Tabellify links the new highlight to the suggestion | **No** (the user writes, with Zotero's tools) | No | ADR-0025 §1; `Zotero.Reader.open` location check |
| **010d AI highlights** | "Create highlight" for accepted suggestions; marker tag; "Remove highlights made in this run" | **Yes**: annotation items and their tags, only after a click, only My Library at first | No | ADR-0025 accepted **and** amended after the read-only spike; RT-AI4, RT-AI6 |
| 010e (idea, not planned) | AI proposes codebook columns from a collection ("build the table" from nothing) | No | Yes | Owner decision (Q18) |

## Scope
**In scope (this spec; 010a and 010b in full, 010c and 010d as outlines to be finished in
their own amendments):**
1. 010a: provider and model settings, key storage, Test key, Forget key, uninstall cleanup.
2. 010b: run on one collection (and its subcollections, as the table does), one codebook;
   text extraction per paper; per-run consent dialog with skip list and estimate; sequential
   requests with retries, Cancel, and early stop; suggestion checking; `ai-runs.json`; review
   queue; Show in PDF; "AI" marker in the table; CSV option; per-tag hints.
3. 010c: Show in PDF with the quote panel; linking user-made highlights (Notifier, read-only).
4. 010d: read-only geometry spike; then (after owner decision) the annotation writer, marker
   tag, undo.
5. Fluent strings (`tabellify-ai-*`), CSS (tokens only), tests, static guards.

**Out of scope (non-goals):**
- Any library write before 010d; item (paper) tags written by AI (possible later option,
  ADR-0025 alternatives).
- Sending the PDF file itself (images, figures); sending notes, existing annotations, authors,
  abstracts (ADR-0023 §1; Q3).
- Background, scheduled or automatic runs; "don't ask again" for consent.
- Local models (Ollama etc.), other providers, provider SDKs (ADR-0021).
- Parallel requests (ADR-0026 §4).
- AI cells in saved-table snapshots (ADR-0024 §5; later snapshot schema).
- EPUB and HTML snapshot attachments (PDF only in F010).
- 010e (AI-proposed codebook), unless the owner asks (Q18).

## User stories
- As a researcher, I choose Claude or OpenAI, paste my own API key once, and click Test key to
  see that it works, without sending any of my papers.
- As a researcher, I choose a collection and my codebook, click "AI fill", and see exactly
  which papers would be sent, which are skipped and why, what is sent and not sent, and an
  estimated cost, before I click Send.
- As a researcher, I watch the run ("Paper 3 of 12") and can cancel it at any time.
- As a researcher, I review each suggestion with its quote and page, open the PDF at that
  page, and accept or reject it; I trust that invented quotes are marked and cannot be
  accepted.
- As a researcher, I see my accepted suggestions in the table, clearly marked "AI", without
  them changing my real tag counts, and I can include them in a CSV if I choose.
- As a researcher (010c), I turn an accepted suggestion into a real highlight myself in a few
  clicks, and Tabellify recognises it.
- As a researcher (010d), I let Tabellify create the highlight for me, see that every AI-made
  highlight carries a marker tag, and can remove a whole run's highlights again (except those I
  edited).
- As a researcher, I trust that my API key is never shown, logged or saved in plain text, and
  that no paper leaves my computer unless I clicked Send.

## Acceptance criteria
Each tagged `[auto]` (automated test, `npm test`) or `[manual]` (owner, dev profile, Debug
Output captured to `build/debug-N.txt`).

### 010a AI settings
- [ ] AC1 `[manual]` RT-AI1 passes (network from the Tabellify tab; no key, no data) and the
  result is recorded in `docs/zotero-api-notes.md` before development.
- [ ] AC2 `[manual]` RT-AI2 passes (OS key store + Login Manager round trip with a dummy
  value; entry removed afterwards) and is recorded before development.
- [ ] AC3 `[manual]` Given the Tabellify tab, when the owner opens **AI settings**, chooses a
  provider, pastes a key and clicks **Save key**, then the field empties and shows "Key saved";
  after quitting and restarting Zotero it still shows "Key saved".
- [ ] AC4 `[manual]` With a valid key, **Test key** shows "Key works" within 30 seconds; with a
  wrong key it shows "The provider rejected this key." The key is never shown on screen.
- [ ] AC5 `[manual]` **Forget key** shows "No key"; RT-AI2b returns `0` entries.
- [ ] AC6 `[manual]` `grep -c "sk-" build/debug-N.txt` (run by the orchestrator on the AC3–AC5
  log) returns `0` (both providers' keys start with `sk-`; **UNVERIFIED** for every key type,
  so the orchestrator also checks for the key-length run of characters described in T7).
- [ ] AC7 `[auto]` Network guard: only `content/ai-client.js` contains `fetch(` /
  `XMLHttpRequest` / `Zotero.HTTP.`; it contains no `https://` URL other than the two base URLs;
  requests use `redirect: "error"`.
- [ ] AC8 `[auto]` Write guard: a new pattern "Services.logins write" is denied everywhere
  except `content/ai-key-store.js` (and the uninstall cleanup named in T4); `removeAllLogins` is
  denied everywhere.
- [ ] AC9 `[auto]` Unit: the Test-key request bodies and headers match ADR-0021 §6 exactly
  (Anthropic `anthropic-version: 2026-10-21`, no `temperature` / `top_p` / `top_k`; OpenAI
  `store: false`), and contain no library data.
- [ ] AC10 `[auto]` Static: no `Zotero.debug(` / `Zotero.logError(` call in AI files passes a
  variable named `key`, `apiKey`, `prompt`, `quote`, `text` or `title`; the key input is
  `type="password"` with `autocomplete="off"`.
- [ ] AC11 `[auto]` Unit (fake fetch): closing the document (`unload`) aborts a pending
  request; no timer or listener is left (lifecycle symmetry).
- [ ] AC12 `[manual]` Disable and re-enable Tabellify in Tools → Plugins with the tab open: no
  errors in Debug Output; "Key saved" still shown after re-enable.

### 010b AI suggestions (read-only)
- [ ] AC13 `[manual]` RT-AI3 passes and the spec's text source (Q4) is recorded before
  development.
- [ ] AC14 `[manual]` **AI fill** is disabled, with the reason shown, when there is no key, no
  collection, or no codebook tag.
- [ ] AC15 `[manual]` First run per provider shows the privacy notice; after "I understand",
  the run dialog shows provider, model, the paper titles, the skipped papers with reasons, the
  "sent / not sent" lists, the token and cost estimate, and focus starts on **Cancel**.
- [ ] AC16 `[manual]` Clicking **Cancel** in the run dialog sends nothing: Debug Output has no
  "Tabellify: AI request" line after it.
- [ ] AC17 `[manual]` After **Send**, progress shows "Paper N of M"; **Cancel** stops after the
  current request is aborted; finished papers' suggestions are kept and the run shows
  "Cancelled".
- [ ] AC18 `[manual]` On a 3-paper test collection, each paper gets suggestions with quote and
  "p. N"; **Show in PDF** opens Zotero's reader at that page.
- [ ] AC19 `[auto]` Unit: `check()` drops unknown tags, verifies quotes with ligatures,
  hyphenation, soft hyphens, curly quotes and spacing differences, corrects a wrong page,
  marks a missing quote unverified, merges duplicates, refuses quotes over 1,000 characters,
  ignores `__proto__` and extra keys.
- [ ] AC20 `[manual]` An unverified suggestion is labelled "Quote not found in paper" and its
  **Accept** button is disabled.
- [ ] AC21 `[manual]` Accept / Reject / Undo decisions survive closing the tab and restarting
  Zotero.
- [ ] AC22 `[manual]` With "Show accepted AI suggestions" on, accepted cells without a real
  tag show the "AI" marker; k/M and "Tags used" numbers are the same as with the option off.
- [ ] AC23 `[auto]` Unit (`csv-model.js`): with "Include accepted AI suggestions" on, AI cells
  are written as `AI`; off (default), the CSV is byte-identical to today's.
- [ ] AC24 `[auto]` Unit: estimate, run limits (§2 of ADR-0026), retry policy (429 with and
  without `retry-after`, spend limit, 401, 529, timeout, cut-off output) and the 50% early
  stop.
- [ ] AC25 `[auto]` Unit: the request body for a paper contains only the allowed parts
  (ADR-0023 §1): no item keys, IDs, paths, authors, notes, or the key.
- [ ] AC26 `[auto]` Unit + static: `ai-runs.json` store follows ADR-0012/0024 (atomic write,
  `.bak`, revision check, strict validation, size limits; damaged or newer file never
  overwritten); write-guard entry 5 is `content/ai-runs-store.js` "IOUtils write".
- [ ] AC27 `[manual]` **No library writes:** RT-G2 (and its My Library variant RT-AI3b) give the
  same numbers before and after a full 010b test session.
- [ ] AC28 `[manual]` A collection in a read-only group library can be run (dialog shows the
  group warning) and reviewed.
- [ ] AC29 `[manual]` With a wrong key, the run stops at the first paper with "The provider
  rejected this key"; no further requests are sent.

### 010c Assisted highlighting (outline; refined in its own amendment)
- [ ] AC30 `[manual]` From an accepted suggestion, **Show in PDF** opens the PDF at the page and
  shows the quote and the codebook tag in Tabellify's panel.
- [ ] AC31 `[manual]` When the owner highlights the sentence in Zotero's reader and adds the
  codebook tag, the suggestion shows "Highlighted" within 2 seconds.
- [ ] AC32 `[auto]` Write guard unchanged (no new allow-list entry in 010c).

### 010d AI highlights (outline; only after ADR-0025 is amended and accepted)
- [ ] AC33 `[manual]` Spike report delivered (read-only), owner choice recorded in ADR-0025.
- [ ] AC34 `[manual]` RT-AI6 (one write on a throwaway PDF in the dev profile) passes.
- [ ] AC35 `[manual]` With "Let Tabellify create highlights" off (default), no write button
  exists.
- [ ] AC36 `[manual]` "Create highlight" makes one highlight on the right sentence and page,
  with the codebook tag and the marker tag; the table shows ✓ for that cell.
- [ ] AC37 `[manual]` "Remove highlights made in this run" erases unchanged highlights and keeps
  (and lists) one the owner edited.
- [ ] AC38 `[manual]` In a read-only group library, the write button is disabled with the
  reason.
- [ ] AC39 `[auto]` Write guard: `.saveTx(`, `.setTags(`, `.eraseTx(` allowed only in
  `content/ai-annotation-writer.js`; it creates only `new Zotero.Item("annotation")`.

## Design

### Where it lives (no new UI surface type)
Everything is inside the existing Tabellify workspace tab (ADR-0009):
- An **"AI fill"** disclosure section below the collection row (like "Saved tables"), with:
  provider and model, key status, **AI settings** (a nested disclosure), the **AI fill**
  button, the current or last run's progress, and the **review queue**.
- A second `html:dialog` in `workspace.xhtml` for the privacy notice and the run confirmation
  (same pattern and focus rules as F007a's "View table" modal; RT-S3/RT-S3b already passed).
- Proposed labels (final wording in `tabellify.ftl`, prefix `tabellify-ai-`): "AI fill", "AI
  settings", "Provider", "Model", "API key", "Save key", "Test key", "Forget key", "Key saved",
  "No key", "Send N papers to Claude", "Cancel", "Show in PDF", "Accept", "Reject", "Undo",
  "Quote not found in paper", "Show accepted AI suggestions", "Include accepted AI suggestions".

### Files (new unless noted)
| File | Kind | Uses | Purpose |
|---|---|---|---|
| `src/content/ai-provider-model.js` | pure | — | Request bodies, response parsing, error classes, retry policy, estimate, run limits, system prompt constant (ADR-0021, 0026) |
| `src/content/ai-suggestions-model.js` | pure | — | Quote normaliser, `check()`, duplicate merge, review-state changes (ADR-0024 §3–§4) |
| `src/content/ai-runs-model.js` | pure | — | `ai-runs.json` validate / migrate / limits / add run / set decision (ADR-0024 §1–§2) |
| `src/content/ai-runs-store.js` | store | `IOUtils`, `PathUtils` | Load / save `ai-runs.json` (write-guard entry 5) |
| `src/content/ai-key-store.js` | adapter | `Services.logins`, `ChromeUtils` (OSKeyStore) | Key save / read / forget (ADR-0022) |
| `src/content/ai-client.js` | adapter | `fetch`, `AbortController` | The only network file (ADR-0021 §3) |
| `src/content/ai-annotation-writer.js` | adapter (010d only) | `Zotero.Item`, `saveTx`, `setTags`, `eraseTx` | The only library-writing file (ADR-0025) |
| `src/content/workspace.js` (changed) | controller | `Zotero.*` reads | Reads papers, attachments and text; drives the run, dialog, queue, table marker |
| `src/content/csv-model.js` (changed) | pure | — | Optional `AI` cells |
| `workspace.xhtml`, `workspace.css`, `tabellify.ftl` (changed) | UI | — | Section, dialog, queue, strings |
| `src/tabellify.js` or `src/bootstrap.js` (changed, 010a) | lifecycle | `Services.logins` | Remove Tabellify's keys on `ADDON_UNINSTALL` only (ADR-0022 §7) |

**Layering change (needs owner approval with the ADRs).** Today only `workspace.js` and
`reader-tags.js` use Zotero globals, and stores use only `IOUtils`/`PathUtils`
(`docs/architecture.md` §3). F010 adds three **adapter** files, each allowed exactly one
family of privileged globals and pinned by a static test: `ai-key-store.js` (logins, OS key
store), `ai-client.js` (network), `ai-annotation-writer.js` (library writes, 010d). Reads of
the library stay in `workspace.js`.

### Data flow of one run (010b)
1. `workspace.js` collects the papers of the chosen collection (existing F005 reads), finds
   each paper's first PDF attachment (`getAttachments`, `isPDFAttachment`), and reads its text
   (source per Q4: `attachment.attachmentText` or `Zotero.PDFWorker.getFullText`; split into
   pages if the source has page breaks, RT-AI3).
2. Pure code applies the run limits and builds the skip list and the estimate (ADR-0026).
3. The dialog asks for consent (ADR-0023). Cancel ends here; nothing was sent.
4. For each paper, in order: pure code builds the request; `ai-client.js` sends it with the
   key from `ai-key-store.js`; pure code classifies the answer and decides retry / next /
   stop; pure `check()` verifies the suggestions against the text that was sent;
   `ai-runs-store.js` saves after each paper (so a crash loses at most one paper).
5. The review queue shows the run; decisions are saved immediately.
6. The table reads accepted suggestions for the shown collection when "Show accepted AI
   suggestions" is on.

### Text source and pages
- If the chosen text source keeps page breaks, pages are sent separately and quotes are
  checked per page.
- If not, the whole text is sent as one block; a quote is "verified" when found anywhere in the
  text; the page comes from the model and is shown as "p. N (not checked)".
- Papers with no extractable text (scanned PDFs without OCR) are skipped with reason
  `no-text`.

## Zotero APIs used
All rows are in `docs/zotero-api-notes.md`, section "Feature 010 rows (AI fill)", with status
and sources. Summary:

| API | Phase | Status |
|---|---|---|
| `fetch`, `AbortController` in the workspace document | 010a | Verified (docs) for the API; CORS behaviour **UNVERIFIED** (RT-AI1) |
| `fetch` in the bootstrap scope (fallback) | 010a | Verified (source) |
| `Services.logins.addLoginAsync` / `findLogins` / `modifyLogin` / `removeLogin`; `nsILoginInfo` via `Components.Constructor` | 010a | Verified (source); runtime RT-AI2 |
| `OSKeyStore.sys.mjs` `encrypt` / `decrypt` | 010a | Verified (source), Firefox-internal; runtime RT-AI2 |
| `Services` global inside the workspace document | 010a | **UNVERIFIED** (RT-AI1 checks `typeof`) |
| `Uint8Array.prototype.toBase64` | later (PDF-file mode) | Verified (docs); presence in ESR 140 checked by RT-AI1 |
| `item.getAttachments`, `Zotero.Items.get`, `isPDFAttachment`, `getFilePathAsync`, `IOUtils.read` | 010b | Verified (source / docs) |
| `attachment.attachmentText` | 010b | Verified (docs); page breaks **UNVERIFIED** (RT-AI3) |
| `Zotero.PDFWorker.getFullText` | 010b (option) | Verified (source), Internal; result shape **UNVERIFIED** (RT-AI3) |
| `Zotero.Reader.open(itemID, location)` | 010b, 010c | Verified (source); `location` keys **UNVERIFIED** |
| Notifier `item-tag` `add` (existing F005 observer) | 010c | Verified (source) |
| `Zotero.PDFWorker.getStructuredDocumentText`; reader internals for text geometry | 010d spike | Internal; output **UNVERIFIED** |
| `new Zotero.Item("annotation")`, annotation field setters, `setTags`, `saveTx`, `eraseTx`, `isEditable`, `library.editable`, `Zotero.Annotations` constants | 010d | Verified (source), Internal; runtime RT-AI4, RT-AI6 |
| `Zotero.Prefs.get/set` (new prefs `extensions.tabellify.ai.*`) | 010a–d | Verified (existing row) |

## Data safety
- **010a:** reads nothing from the library. Writes one Login Manager entry per provider in the
  Zotero **profile** (not the library, not the data directory), and prefs
  `extensions.tabellify.ai.provider`, `extensions.tabellify.ai.model.<provider>`. Sends only
  the fixed "Test key" request.
- **010b:** **reads** collections, items, attachments, attachment text (existing read paths,
  plus text). **Writes nothing to the Zotero library.** Writes `ai-runs.json` in
  `<data dir>/tabellify/` (ADR-0012 pattern), and the pref
  `extensions.tabellify.ai.noticeAccepted.<provider>`. **Sends** per paper its text, title,
  the column names and hints, only after the per-run Send click (ADR-0023). "Show in PDF"
  opens Zotero's reader exactly as a double-click would; Zotero itself may then remember the
  last page viewed, as it always does.
- **010c:** reads Notifier events and annotation text and tags. Writes nothing to the library;
  updates `ai-runs.json` only.
- **010d (only after ADR-0025 is amended and accepted):** **creates annotation items** (type
  `highlight`, or `note` if the owner picks G4) with two manual tags (codebook tag and
  `Tabellify AI`) under PDF attachments in **My Library**, only after a click on accepted,
  verified suggestions, and **erases** only annotations that Tabellify created and the user has
  not changed, after confirmation. These writes sync to zotero.org. Nothing else in the library
  is created, changed or deleted.
- The API key is never written to the library, Tabellify's files, prefs or logs (ADR-0022).

## Test plan
| AC | Unit (`tests/unit/`) | Static (`tests/static/`) | Manual |
|---|---|---|---|
| AC1, AC2, AC13 | — | — | RT-AI1, RT-AI2, RT-AI3 |
| AC3–AC6, AC12 | — | — | 010a smoke test |
| AC7 | — | `network-guard.test.mjs` (new) | — |
| AC8, AC26 (part), AC32, AC39 | — | `write-guard.test.mjs` (new patterns and entries) | — |
| AC9, AC24, AC25 | `ai-provider-model.test.mjs` | — | — |
| AC10 | — | `ai-secrets.test.mjs` (new) | — |
| AC11 | `ai-client.test.mjs` (fake `fetch`, fake `AbortController`) | `symmetry.test.mjs` (extended) | — |
| AC19 | `ai-suggestions-model.test.mjs` (fixtures with ligatures, two-column text) | — | — |
| AC23 | `csv-model.test.mjs` (extended) | — | — |
| AC26 | `ai-runs-model.test.mjs`, `ai-runs-store.test.mjs` (fake `fs`) | write guard | — |
| AC14–AC18, AC20–AC22, AC27–AC29 | — | — | 010b smoke test (3-paper test collection; RT-G2 / RT-AI3b before and after) |
| AC30–AC31 | — | — | 010c smoke test |
| AC33–AC38 | `ai-annotation-writer` pure parts (sort index, undo comparison) | — | spike report, RT-AI6, 010d smoke test |

## Task breakdown
Tasks touch `workspace.js` / `workspace.xhtml` often, so they run **in order**, not in
parallel (CLAUDE.md: parallel only for non-overlapping file scopes).

| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Approve or change this spec and ADR-0021 … ADR-0026; answer Q1–Q19 | owner | — | — |
| T1 | Run RT-AI1, RT-AI2 (+ RT-AI2b), RT-AI3 (+ RT-AI3b), RT-AI4 in the dev profile; paste results | owner | T0 | — |
| T2 | Record RT results in api-notes; pick CORS fallback (ADR-0021 §8) and text source (Q4); amend spec | architect | T1 | `docs/zotero-api-notes.md`, `docs/features/010-ai-fill.md` |
| **010a** | | | | |
| T3 | Pure provider model: Test-key requests, error classes, retry policy, constants + tests | developer | T2 | `src/content/ai-provider-model.js`, `tests/unit/ai-provider-model.test.mjs` |
| T4 | Key store + uninstall cleanup + write-guard pattern "Services.logins write" + tests (fake `Services`) | developer | T3 | `src/content/ai-key-store.js`, `src/tabellify.js` (uninstall hook only) or `src/bootstrap.js`, `tests/unit/ai-key-store.test.mjs`, `tests/static/write-guard.test.mjs` |
| T5 | Network client + network guard + secrets static test + tests (fake `fetch`) | developer | T3 | `src/content/ai-client.js`, `tests/unit/ai-client.test.mjs`, `tests/static/network-guard.test.mjs`, `tests/static/ai-secrets.test.mjs`, `tests/static/symmetry.test.mjs` |
| T6 | AI settings UI (section, provider, model list, key field, Save / Test / Forget) | developer | T4, T5 | `src/content/workspace.xhtml`, `workspace.js`, `workspace.css`, `src/locale/en-US/tabellify.ftl` |
| T7 | Owner smoke test 010a (AC3–AC6, AC12); orchestrator greps the debug log for `sk-` and for any run of 40+ key-like characters | owner, orchestrator | T6 | `build/debug-N.txt` |
| **010b** | | | | |
| T8 | Pure suggestions model: normaliser, `check()`, decisions + tests | developer | T7 | `src/content/ai-suggestions-model.js`, `tests/unit/ai-suggestions-model.test.mjs` |
| T9 | `ai-runs.json`: pure model + store + write-guard entry 5 + tests | developer | T8 | `src/content/ai-runs-model.js`, `src/content/ai-runs-store.js`, `tests/unit/ai-runs-model.test.mjs`, `tests/unit/ai-runs-store.test.mjs`, `tests/static/write-guard.test.mjs` |
| T10 | Provider model: paper requests, structured-output parsing, estimate, run limits, system prompt + tests; curated model list and dated price table | developer | T8 | `src/content/ai-provider-model.js`, `tests/unit/ai-provider-model.test.mjs` |
| T11 | Run controller in the workspace: paper/attachment/text reads, skip list, notice + run dialog, progress, Cancel, per-paper save | developer | T9, T10 | `src/content/workspace.js`, `workspace.xhtml`, `workspace.css`, `tabellify.ftl` |
| T12 | Review queue UI + Show in PDF + hints editor | developer | T11 | same as T11 |
| T13 | Table "AI" marker + CSV option + tests | developer | T12 | `src/content/workspace.js`, `src/content/csv-model.js`, `workspace.css`, `tabellify.ftl`, `tests/unit/csv-model.test.mjs` |
| T14 | Owner smoke test 010b (AC14–AC18, AC20–AC22, AC27–AC29) with a small test collection and a key with a low spend limit | owner | T13 | `build/debug-N.txt` |
| **010c** | | | | |
| T15 | Amend spec for 010c (`Zotero.Reader.open` location check, quote panel, linking rule) | architect | T14 | `docs/features/010-ai-fill.md`, `docs/zotero-api-notes.md` |
| T16 | Build 010c | developer | T15 | `src/content/workspace.js`, `workspace.xhtml`, `workspace.css`, `tabellify.ftl`, `src/content/ai-suggestions-model.js` (+ tests) |
| **010d** | | | | |
| T17 | Read-only geometry spike (G1 `getStructuredDocumentText`, G2 reader internals) in the dev profile; report findings, risks, code size | developer + architect | T16 | `build/spike-010d.md` (gitignored), then a summary in `docs/decisions/0025-ai-library-writes-annotations.md` (amendment) |
| T18 | Owner decision on geometry (G1 / G2 / G4 / stop) and acceptance of ADR-0025 | owner | T17 | — |
| T19 | RT-AI6 write test on a throwaway PDF (snippet written after T18) | owner | T18 | — |
| T20 | Annotation writer + undo + guards + tests | developer | T19 | `src/content/ai-annotation-writer.js`, `src/content/workspace.js`, `workspace.xhtml`, `workspace.css`, `tabellify.ftl`, `tests/unit/ai-annotation-writer.test.mjs`, `tests/static/write-guard.test.mjs` |
| Each phase | tester → reviewer → security-auditor (ADR-0026 §5 as threat list) → docs-writer, unless Q1 keeps prototype mode | per CLAUDE.md | phase build | per agent |

## Open questions
Each has options and a recommendation. The ADRs repeat the ones they decide.

1. **Process for F010.** (a) Prototype mode (developer + one smoke test), (b) the full flow
   (tester, reviewer, security-auditor, docs-writer) for every phase, (c) full flow only for
   010a, 010b and 010d. *Recommended: (b).* F010 is the first feature that sends data off the
   computer, stores a secret, and (010d) writes to the library.
2. **Providers.** (a) Claude and OpenAI from 010a, (b) Claude first, OpenAI in a later
   release. *Recommended: (a)*, as the owner asked ("whatever the person wants"); the adapters
   are small.
3. **What is sent.** (a) Extracted text per page (010b), PDF file as a later option, (b) the
   PDF file from the start. *Recommended: (a)*: less data leaves, lower cost, and quotes can be
   checked against the same text.
4. **Text source** (decided after RT-AI3). (a) `attachment.attachmentText` (documented, uses
   Zotero's full-text index), (b) `Zotero.PDFWorker.getFullText` (internal, reads the PDF
   directly). *Recommended: (a) if RT-AI3 shows usable page breaks or the owner accepts
   "not checked" pages; otherwise (b).*
5. **Key storage.** (a) Login Manager + OS key store, session-only fallback (ADR-0022 A),
   (b) Login Manager only, (c) never store. *Recommended: (a).*
6. **Remove keys on uninstall** (reason 6 only). (a) Yes, (b) no, keep like other data.
   *Recommended: (a).*
7. **Consent.** (a) One-time notice per provider + confirmation every run, no "don't ask
   again", (b) one-time consent only. *Recommended: (a).*
8. **Cost display.** (a) Tokens + money range from a built-in, dated price table, (b) tokens
   only. *Recommended: (a).*
9. **Run limits.** Defaults 25 papers, 60 pages per paper, 1,000,000 estimated input tokens per
   run (ADR-0026 §2). (a) Accept, (b) other numbers. *Recommended: (a).*
10. **Review queue.** Unverified quotes visible but not acceptable; bulk "Accept all verified in
    this paper". (a) Accept both, (b) no bulk actions. *Recommended: (a).*
11. **AI cells in the table and CSV.** (a) "AI" marker, never counted as real tags; CSV
    option off by default, cells written as `AI`, (b) treat accepted AI cells as ✓.
    *Recommended: (a).*
12. **Per-tag hints.** (a) Optional hints stored in `ai-runs.json`, (b) in the codebook (schema
    3), (c) no hints. *Recommended: (a).*
13. **Assisted highlighting (010c) before any automatic write.** (a) Yes, (b) skip to 010d.
    *Recommended: (a).*
14. **Automatic highlights (010d).** (a) Spike first, then decide (G1 structured text, G2 reader
    internals, G4 sticky notes, or stop at 010c), writer option A (`new Zotero.Item`),
    (b) commit now to reader internals. *Recommended: (a).*
15. **Marking AI-made annotations.** (a) Marker tag `Tabellify AI` + comment line + purple
    default colour, (b) comment only, (c) colour only. *Recommended: (a).*
16. **Undo.** (a) "Remove highlights made in this run" erases only unchanged ones, permanently,
    after confirmation, (b) also erase edited ones. *Recommended: (a).*
17. **Libraries for writes.** (a) My Library only in the first 010d release, (b) editable groups
    too. *Recommended: (a)*: group members would see AI highlights in their synced library.
18. **AI-proposed columns (010e).** (a) Not now; revisit after 010b, (b) add to v2.
    *Recommended: (a).* The owner's words "build the table" are read here as "fill the table's
    rows and cells"; please confirm.
19. **Model list.** (a) A curated short list per provider (checked each release) plus "Other
    model ID…", (b) free text only. *Recommended: (a).*
