# Tag Monitor

The tag monitor tells you how much of your [codebook](Codebooks) you have applied: for a
whole collection, for each paper, and for the paper you are reading. It only reads your
library; it never changes it.

## How Tabellify decides a tag is "used"

- A codebook tag counts as **used on a paper** when it is a **manual** tag on one of that
  paper's **highlights** (annotations in the PDF, EPUB or web snapshot attached to it).
- Tick **Also count tags on the paper itself** (next to **Refresh** in the Tabellify tab) to
  also count manual tags on the paper item itself. Untick it to go back to highlights only.
  The setting is kept after you close Zotero.
- **Automatic tags never count** (the tags Zotero imports with a paper's metadata, shown in
  a different colour in Zotero's tag selector).
- Highlights in the trash do not count.
- Names must match exactly, including capital letters: `Heat index` in the codebook does
  not match a Zotero tag `heat index`.
- Tags that are not in the codebook are ignored.

The workspace table and the **Tabellify tags** section always use the same rule.

## In the Tabellify tab

After you choose a collection (see [Workspace](Workspace)):

- **Summary line:** **Tags used N/M · Papers P**. M is the number of tags in the codebook;
  N is how many of them are used on at least one paper in the collection (including its
  subcollections); P is the number of papers. When N = M it adds **All codebook tags are
  used.**
- **k/M column** (last column of the [table](Table-Builder)): for each paper, **k** codebook
  tags used out of **M** in the codebook. Point at the header to see "Codebook tags used on
  the paper (k of M)". When a paper uses every codebook tag, its k/M cell is marked
  complete with a ✓. Clicking the **k/M** header sorts the papers by it.
- **✓ cells:** each tag column shows ✓ for the papers that use that tag. A column without
  any ✓ is a codebook tag no paper uses yet.

The counts update by themselves shortly after a tag changes. **Refresh** recounts at once.

Messages you may see:

| Message | Meaning |
|---|---|
| Choose a collection to see which codebook tags its papers use. | No collection is chosen yet |
| The codebook has no tags yet. Add tags to the codebook to see which ones are used. | Type tags into the **Tags and groups** box |
| Tag counts are unavailable because the codebook could not be loaded. | See [Troubleshooting](Troubleshooting#the-codebook-could-not-be-loaded) |
| Some highlights could not be read, so their tags are not counted. See Help → Debug Output Logging for details. | Some papers' highlights could not be read; the counts may be too low. See [Troubleshooting](Troubleshooting#some-highlights-could-not-be-read) |

When there is no codebook or it has no tags, the k/M column shows "–".

## While reading: the Tabellify tags section

When you open a paper in Zotero's reader, Zotero's right-hand pane (beside the page) has a
section called **Tabellify tags**, with a Tabellify icon in the narrow strip of section icons
on the right edge. The same section also appears in the right-hand pane of the library when
you select a paper.

- **Header:** "Tabellify tags" and a count such as **2 / 3**: 2 of the 3 codebook tags are
  used on this paper. The count stays visible when the section is collapsed.
- **Click the header** to collapse or expand the section. Zotero remembers your choice.
- **Body:** "2 of 3 codebook tags used on this paper", then every codebook tag as a
  checklist: **✓** used on this paper, **☐** not used yet. Ungrouped tags come first, then
  each group under its name.

The section updates by itself shortly after you add or remove a tag on a highlight. A change
to the **Also count tags on the paper itself** checkbox or to the codebook shows up the next
time the section is drawn (for example when you switch to another paper or tab and back).

Other things the section can show:

| Text | Meaning |
|---|---|
| No codebook yet. Create one in Tools → Tabellify… | The codebook is missing or has no tags (header shows "—") |
| Could not read the codebook. | The codebook file is damaged or from a newer Tabellify (header shows "—") |
| Counting… | Tabellify is reading the paper's highlights |

The section is shown for papers and for stand-alone files (PDF, EPUB, snapshot) that can have
highlights. It is hidden for notes. It never adds tags; tag highlights with Zotero's own
annotation tools.

## Planned

- Clicking a tag in the **Tabellify tags** section to add it to the selected highlight:
  **Planned** (no feature number yet; it would change the library, so it needs its own
  approved spec).
- Showing which highlight carries a tag, or the highlight text in the table: **Planned,
  Feature 006d** (see [Table Builder](Table-Builder#planned)).
