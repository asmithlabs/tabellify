# Codebooks

A **codebook** is your planned list of tags: the tags you intend to apply while reading the
papers of a review. Each codebook tag becomes a column in the [table](Table-Builder). Tags can
be put into **groups** (for example *Exposure* → `Heat index`, `Temperature`); the group name
becomes a header above its tags. Groups are optional.

The codebook is stored by Tabellify in its own file. **Your Zotero tags are never changed**:
adding a tag to the codebook does not create it in Zotero, and removing it from the codebook
does not remove it from any paper.

Tabellify has **one codebook**, used for every collection.

## Adding tags: the Tags and groups box

In the [Tabellify tab](Workspace), click in the **Tags and groups** box, type one line and
press **Enter**. The placeholder shows an example: `Exposure(heat index, temperature), age`.

**What you should see:** the box empties, "Codebook saved." appears under it, the group
pills update and the table gets the new columns.

### How to write a line

Examples of what you can type:

- `age`: one tag, `age`, without a group (it appears under **Ungrouped**).
- `age, sex, region`: three tags without a group.
- `Exposure(Heat index, Temperature)`: a group **Exposure** with two tags.
- `Exposure(Heat index), Outcome(Hospitalization), age`: two groups and one ungrouped tag,
  in one line.
- `Later()`: an empty group **Later** (pill "Later · 0"; it gets no column until it has
  tags).
- `"Smith, J.", Methods("pre/post (adjusted)")`: names that contain a comma or a bracket,
  written in double quotes.

Rules:

- Separate entries with commas. One extra comma at the very end is ignored.
- Spaces at the start and end of a name are removed; spaces inside a name are kept.
- **Capital letters matter**, as in Zotero: `Heat index` and `heat index` are two different
  tags.
- A group cannot contain another group.
- A name that contains a double quote (`"`) cannot be typed.
- A group name may be written in any capitalization: `exposure(rh)` adds `rh` to an existing
  group **Exposure** (the existing spelling is kept).

### Moving a tag with the box

A tag can be in only one place in the codebook. If you type a tag that is already there:

- inside a group, for example `Outcome(age)`: the tag **moves** into that group (at its end);
- on its own, for example `age`: the tag **moves out of its group** to Ungrouped;
- where it already is: nothing changes.

When something moved, the message reads "Codebook saved. Some tags were moved to another
group." If nothing at all changed, you see "These tags are already in the codebook." and
nothing is saved.

### When the line has a mistake

Nothing is saved, the text stays in the box, the problem is highlighted in the box, and a
message appears under it. The message goes away as soon as you edit the text.

The messages, each with an example line that causes it:

- "Check the brackets: every "(" needs a matching ")"." For example `Exposure(Heat index`.
- "A tag name is missing. Remove the extra comma or type a name." For example `a,,b`.
- "Type a group name before "("." For example `(a, b)`.
- "A group cannot contain another group." For example `A(B(c))`.
- "Separate the entries with a comma." For example `A(b) c`.
- "A quotation mark (") is not closed." For example `"Smith, J.`.
- "The same tag appears twice in this entry." For example `x, x`.

## Suggestions while you type

While you type a name, a list opens under the box with matching names:

- **Tags from your library**: manual tags used anywhere in My Library, on papers or on
  highlights. Tags that exist only as automatic tags are not suggested. Tags already in the
  codebook are not suggested.
- **Group names** of your codebook (marked "group"), when you are not inside brackets.
  Accepting one writes `Name(` so you can go on typing its tags.
- **Create tag "…"** (marked "codebook only"), last in the list, when what you typed is not
  exactly a tag in your library. Accepting it keeps your text; when you press Enter the name
  goes into the codebook. It is **not** created in Zotero. It appears in Zotero only when you
  add a tag with that name to a highlight yourself.

Matching ignores capitals and accents ("heat" finds "Heat index", "etude" finds "Étude");
names that start with your text come first. At most 50 are shown.

Keys:

- **↓ / ↑**: move through the list.
- **Tab**: accept the highlighted suggestion (or the first one).
- **Enter**: accept the highlighted suggestion; with nothing highlighted, save the whole
  line.
- **Esc**: close the list.

You can also click a suggestion. The list of library tags is refreshed when you click
**Refresh**, and after you change tags in Zotero (the next time you click in the box).

## Group pills

Under the box, one pill per group shows its name and number of tags, in the same order as
the table, for example **Exposure · 2**. **Ungrouped · N** counts the tags without a group and
is hidden when there are none. Groups without tags come last with "· 0".

## Edit groups and tags

Click **Edit groups and tags** under the pills to open it. You see each group with its tags,
and an **Ungrouped** box with the tags that have no group.

- **Rename** a group: click **Rename**, type the new name in the **Group name** field, then
  click **Save** (or **Cancel**).
- **Delete** a group: click **Delete**. The group goes away; **its tags are kept** and become
  ungrouped. There is no confirmation, because nothing is lost.
- **Remove a tag** from the codebook: click the **×** next to it (tooltip: "Remove this tag
  from the codebook (your Zotero tags are not changed)").

Possible messages: "Enter a group name.", "A group with this name already exists." (group
names are compared ignoring capitals), "This group no longer exists.", "This tag is no
longer in the codebook."

You can also change groups by dragging columns in the table; see
[Table Builder](Table-Builder#moving-a-tag-between-groups-by-dragging).

## Saving and safety

- The codebook is saved automatically after every change, to `codebooks.json` in the
  `tabellify` folder of your Zotero data folder. The previous version is kept as
  `codebooks.json.bak`. See [Data Safety and Privacy](Data-Safety-and-Privacy).
- **"Could not load the codebook file. Editing is turned off so that the file is not
  overwritten…"**: the file is damaged. Tabellify shows the file's location and does not
  touch it. Fix or delete the file, or copy `codebooks.json.bak` over it, then reopen
  Tabellify. See [Troubleshooting](Troubleshooting#the-codebook-could-not-be-loaded).
- **"The codebook file was made by a newer version of Tabellify…"**: you went back to an
  older Tabellify. Editing is off so the newer file is not damaged; update Tabellify.
- **"The codebook was changed in another Tabellify tab and has been reloaded; repeat your
  last change."**: you had Tabellify open in two Zotero windows. Do the last change again.
- **"Could not save the codebook…"**: the change is shown but not saved. See
  [Troubleshooting](Troubleshooting#could-not-save).

## Planned

These are not available yet:

- Several codebooks, and importing or exporting a codebook.
- Group libraries.
