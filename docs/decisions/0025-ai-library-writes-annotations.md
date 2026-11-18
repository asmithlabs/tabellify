# ADR-0025: First library writes: creating highlight annotations and tags from accepted AI suggestions

- **Status:** Accepted (owner, 2026-11-18)
- **Date:** 2026-11-18
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** CLAUDE.md rule 8 (no library writes unless a spec authorizes it), PRD §6
  ("never modifies items, tags, or annotations unless a later spec explicitly authorizes it and
  the owner approves"), ADR-0024 (suggestions, review queue, `annotationKey`), ADR-0011
  (security review; "library writes and Zotero internals" is in the threat model), ADR-0013
  (reader section), Feature 010 spec `docs/features/010-ai-fill.md` (phases 010c and 010d).

## Context

The owner's idea ends with the PDFs: "fill out the annotations/highlights from the table". So
an accepted suggestion (ADR-0024) should become a real Zotero **highlight** on the right
sentence of the PDF, tagged with the codebook column. Then Tabellify's existing table (which
reads highlight tags, PRD Q2) shows it like any hand-made highlight. This would be the
**first time Tabellify writes to the Zotero library**.

What a PDF highlight is in Zotero 10.0.9 (all in `docs/zotero-api-notes.md`, "Feature 010
rows"; source `chrome/content/zotero/xpcom/data/item.js` and `xpcom/annotations.js` at tag
10.0.9):
- An annotation is a `Zotero.Item` of type `annotation`, child of a **file attachment**
  (PDF, EPUB or HTML snapshot): "Annotation parent must be a file attachment".
- `annotationType` must be set first ("annotationType must be set before other annotation
  properties") and must be one of `highlight`, `underline`, `note`, `text`, `image`, `ink`.
- `annotationText` (highlight/underline only), `annotationComment`, `annotationColor` (a hex
  colour; default `Zotero.Annotations.DEFAULT_COLOR` = `#ffd400`), `annotationPageLabel`.
- `annotationSortIndex` must match `^\d{5}\|\d{6}\|\d{5}$` for a PDF (5-digit page index,
  6-digit offset, 5-digit position).
- `annotationPosition` must be a **string** (JSON), at most
  `Zotero.Annotations.ANNOTATION_POSITION_MAX_SIZE` = 65,000 characters. For a PDF highlight it
  holds the page index and one rectangle per line of highlighted text (`{ "pageIndex": 3,
  "rects": [[x1, y1, x2, y2], …] }`; the coordinate system is **UNVERIFIED**, RT-AI4).
- Saving needs an **editable library**: `_initSave` throws "Cannot edit … in library …" when
  `isEditable()` is false; in group libraries, "annotations created by other users aren't
  editable".
- **Undo:** "creating or permanently deleting an object isn't undoable" in Zotero 10's
  Edit → Undo (Z10 guide, "Undo/redo"). Zotero's reader deletes annotations with
  `annotation.eraseTx()` (permanent, no trash).

**The hard part is the rectangles.** The model returns a quote and a page. Turning a quote
into rectangles needs the position of every character on that page. Zotero has no documented
API for that:
- `attachment.attachmentText` (documented) and `Zotero.PDFWorker.getFullText` (internal)
  return text, not positions (return shape of the latter: RT-AI3).
- `Zotero.PDFWorker.getStructuredDocumentText` (internal, new in Zotero 10's document-worker)
  returns a packed "Structured Document Text" file. Its README says it stores "page mappings,
  source anchors and text ranges"; whether that includes rectangles, and how to unpack it from
  a plugin, is **UNVERIFIED**.
- A third-party plugin (SkimRead, AGPL) reads character rectangles from an **open reader tab**
  through reader internals (`reader._internalReader._primaryView._iframeWindow
  .PDFViewerApplication.pdfDocument.getPageData(…)`, Zotero's pdf.js fork). Deeply internal;
  needs the PDF open in a tab. **UNVERIFIED** in our notes.

### Background for a JavaScript learner
- **Annotation item**: Zotero stores each highlight as a small item under the PDF's attachment
  item. It syncs to zotero.org like any item.
- **Rects**: rectangles `[left, bottom, right, top]` on the page that the yellow highlight
  colour fills. A highlight that spans 3 lines has 3 rects.
- **Erase vs trash**: erase deletes for good; trash can be restored. Zotero erases annotations.
- **Marker tag**: an extra tag on every Tabellify-made annotation, so the user (and Tabellify)
  can find them all later with Zotero's tag selector.

## Decision

### 1. Phasing: assisted first, automatic only after a spike and owner approval
- **010c, assisted highlighting (no Tabellify write).** "Show in PDF" opens Zotero's reader at
  the suggestion's page (`Zotero.Reader.open(itemID, location)`; the exact `location` shape is
  UNVERIFIED and checked in 010c) and shows the quote beside it. The **user** makes the
  highlight and adds the tag with Zotero's own tools. Tabellify notices it (Notifier
  `item-tag` `add`, verified) and links it to the suggestion (ADR-0024 §6). Tabellify writes
  nothing to the library in 010c.
- **010d, automatic highlights (first Tabellify write).** Starts with a **time-boxed spike**
  (read-only, dev profile, report to the owner) that tries the two geometry paths:
  G1 `getStructuredDocumentText` and G2 reader internals. The owner then chooses, in an
  amendment to this ADR, one of: G1, G2, **G4 sticky notes** (below), or "stop at 010c".
  No 010d writing code is merged before that choice.

### 2. How Tabellify creates an annotation (010d)
Option **A (recommended): build the item directly**, in one file
`src/content/ai-annotation-writer.js`:
```js
// Sketch only; not final code.
const ann = new Zotero.Item("annotation");
ann.libraryID = attachment.libraryID;
ann.parentID = attachment.id;
ann.annotationType = "highlight";          // must be first
ann.annotationText = quoteAsInPdf;         // the verified quote
ann.annotationComment = commentText;       // §4
ann.annotationColor = colour;              // §4
ann.annotationPageLabel = pageLabel;
ann.annotationSortIndex = sortIndex;       // "PPPPP|OOOOOO|TTTTT"
ann.annotationPosition = JSON.stringify({ pageIndex, rects });
ann.setTags([{ tag: codebookTag }, { tag: markerTag }]);
await ann.saveTx();
```
Why A: the setters validate (type, colour, sort index, position type) and throw on bad
values; no key handling. Option B, `Zotero.Annotations.saveFromJSON(attachment, json)`, is the
path Zotero's reader uses, but it **looks up `json.key` first and updates that item if it
exists**, sets fields without its own checks, and needs a key we generate
(`Zotero.DataObjectUtilities.generateKey()`, internal). A key mistake could overwrite an
existing annotation. Both are internal (no dev guide documents annotation creation).

**G4 sticky notes (fallback geometry).** If no reliable rectangles exist, create a `note`
annotation (the yellow sticky note) at a fixed spot near the top of the page, with the quote
in its comment and the same tags. Only a tiny square position is needed, so no text geometry.
It is still a library write under this ADR. Less useful than a highlight, but reliable.

### 3. Rules every write follows
1. **Only accepted, verified suggestions** (ADR-0024 §3) are written, only after a click
   ("Create highlight", or "Create highlights for N accepted suggestions in this paper", each
   with an inline confirmation naming the count and the paper).
2. **Setting off by default:** "Let Tabellify create highlights in my library" (pref
   `extensions.tabellify.ai.allowWrites`, default `false`). With it off, no write button is
   shown.
3. **Editable libraries only:** before each write, `Zotero.Libraries.get(libraryID).editable`
   must be `true` and the attachment must be a PDF file attachment (`isPDFAttachment()`).
   Otherwise the button is disabled with the reason ("This group library is read-only").
   **First release of 010d: My Library only** (spec Q17).
4. **No duplicates:** skip if the attachment already has a highlight with the same codebook
   tag on the same page whose text contains the normalised quote (read with the existing F005
   calls).
5. **One annotation per `saveTx()`**, sequential, at most 200 per click. A failure stops the
   batch; what was created stays and is listed; nothing is retried automatically.
6. **Run log:** after each save, `ai-runs.json` (ADR-0024) stores `annotationKey` and the
   exact values written (text, comment, colour, tags). Saved through the existing store; if
   that save fails, the user is told which annotations exist without a log entry.

### 4. Marking AI-made annotations (spec Q15)
- **Marker tag** (manual tag) on every Tabellify-made annotation. Proposed name:
  `Tabellify AI`. It shows in Zotero's tag selector, so the user can find, review or delete
  them all with Zotero's own tools.
- **Comment** first line: "Suggested by <provider model> via Tabellify, accepted <date>".
  The comment never contains the prompt or hints.
- **Colour:** user choice from Zotero's palette (`Zotero.Annotations.COLORS`), default
  purple `#a28ae5` so AI highlights stand apart from the user's yellow ones (value
  **UNVERIFIED**: read the `COLORS` list in `annotations.js` at 10.0.9 before use).
- The marker tag is not a codebook tag, so the table and tag monitor ignore it (they count
  codebook tags only). The codebook editor refuses the marker name, so it cannot become a
  column by accident.

### 5. Undo: "Remove highlights made in this run"
Zotero's Undo cannot undo creation, so Tabellify provides its own:
- For each `annotationKey` in the run log: if the annotation still exists, still belongs to the
  same attachment, still has the marker tag, and its text, comment, colour and tags are
  **unchanged** from the log, and `isEditable()` is true → `eraseTx()`.
- Anything changed by the user (new comment, other tags, other colour) is **kept** and listed:
  the user's edits are never deleted.
- An inline confirmation names the counts ("Remove 12 highlights. 2 you changed will be
  kept."). Erase is permanent (as in Zotero's reader); the dialog says so.
- After erasing, the suggestion goes back to "Accepted" (no `annotationKey`), so it can be
  written again.

### 6. Guards
- Write guard: one new allow-list entry per pattern, all for
  `content/ai-annotation-writer.js`: `.saveTx(`, `.setTags(`, `.eraseTx(`. No other file may
  write to the library. `Zotero.Annotations write` (incl. `saveFromJSON`) stays denied unless
  the owner picks option B.
- A static test pins that `ai-annotation-writer.js` creates only `new Zotero.Item("annotation")`
  (no other item type) and never calls `Zotero.Items` / `Zotero.Tags` / `Zotero.DB` writes.
- Debug Output: counts and outcomes only.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **Phasing: assisted (010c), then automatic (010d) after a spike (recommended)** | Real value with zero writes first; writes only when a geometry path is proven; owner decides with facts | Two steps instead of one |
| Automatic highlights directly in the first AI release | Matches the full idea quickly | Depends on an unproven, internal geometry path; first library write without experience; not undoable in Zotero |
| Write **paper (item) tags** instead of highlights | One `addTag` + `saveTx` on an existing item; Zotero 10 Undo works for changes to existing objects (`undoAction`, Z10 guide); no geometry | Loses the evidence (which sentence); owner asked for highlights. Possible extra option later |
| Writer option A: `new Zotero.Item("annotation")` + setters + `saveTx()` (recommended) | Field setters validate; no key collisions | Internal annotation fields (not in a dev guide) |
| Writer option B: `Zotero.Annotations.saveFromJSON` | Exactly the reader's path; handles tags | Looks up and **updates** an existing item by key; no field checks of its own; needs our own key generation |
| Geometry G1: `PDFWorker.getStructuredDocumentText` | No open tab needed; Zotero's own extraction | Internal; packed binary format; unknown if it has rects; may change any release |
| Geometry G2: reader internals (pdf.js fork in an open reader tab) | Proven by a third-party plugin; exact character rects | Deepest internals (`_internalReader`, `_primaryView`, `_iframeWindow`); must open each PDF in a tab; breaks easily |
| Geometry G4: sticky-note annotations | Trivial, robust geometry | Not a highlight; text not marked in the PDF |
| Erase vs trash for undo | Erase matches Zotero's reader | Permanent; mitigated by "unchanged only" and a confirmation |

## Consequences
- **Easier (after 010d):** accepted suggestions become real, synced highlights that Tabellify's
  existing table and Zotero's annotation tools already understand.
- **Harder:** the first write path needs full review, security audit and a careful manual test
  in the dev profile; lifecycle and error handling around partial batches.
- **Riskier:** writes sync to zotero.org (and to group members if groups are allowed later);
  internal APIs for annotation fields and possibly geometry (re-check `item.js`,
  `annotations.js`, and the chosen geometry path before every `strict_max_version` raise).
- **Follow-up:** 010c spec tasks; 010d spike report; RT-AI4 (read existing highlight fields) and
  RT-AI6 (one write test on a throwaway PDF, dev profile, after this ADR is accepted);
  security-auditor; docs pass ("what Tabellify writes and how to remove it").
- **Revisit when:** Zotero documents an annotation-creation or text-geometry API; the owner
  wants group libraries or item tags.

## Open questions for the owner
1. Approve the phasing (010c assisted, then 010d only after a spike and an amendment)?
   *Recommended: yes.*
2. Writer option A (`new Zotero.Item("annotation")`) over B (`saveFromJSON`)? *Recommended: A.*
3. Marker tag `Tabellify AI`, comment line, purple default colour? *Recommended: yes.*
4. Undo erases only unchanged annotations, permanently, after confirmation? *Recommended: yes.*
5. 010d in My Library only at first? *Recommended: yes.*
