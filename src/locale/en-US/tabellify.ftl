# Tabellify — user-visible strings (en-US).
#
# Fluent (.ftl) basics: each message has an ID and either a value (`id = text`), attributes
# (indented lines starting with `.name = text`), or both. Elements in the UI point at a
# message with `data-l10n-id="<id>"`; Fluent then fills in the text or attributes.
#
# All IDs start with `tabellify-`. Zotero 10 puts every plugin's .ftl into one shared
# Fluent source keyed by file name, so this file name must stay unique (`tabellify.ftl`).

## Main window: Tools menu item (registered with Zotero.MenuManager).
## MenuManager sets data-l10n-id on a <menuitem>, whose visible text is its `label`
## attribute, so this message must use `.label`.

tabellify-menu-open =
    .label = Tabellify…

## Workspace window (chrome://tabellify/content/workspace.xhtml)

# The page heading (Feature 006a, spec Q9). The tab title stays "Tabellify"
# (tabellify-tab-title below).
tabellify-workspace-title = Tabellify Codebook

# The root <window> takes its title-bar text from the `title` attribute.
tabellify-workspace-window =
    .title = { tabellify-workspace-title }

## Workspace tab in the main window (Feature 002).
## Tabellify reads this from JavaScript with document.l10n.formatValue() and passes the
## result to Zotero_Tabs.add() as the tab title, so it is a plain value (no attributes).

tabellify-tab-title = Tabellify

## Workspace: read-only collection browser (Feature 003, prototype).
## Elements in workspace.xhtml point at these with data-l10n-id. `tabellify-untitled` is
## read from JavaScript with document.l10n.formatValue() and used as plain text.

tabellify-collection-label = Collection
tabellify-collection-placeholder = Choose a collection
tabellify-no-collections = My Library has no collections yet.
tabellify-loading-items = Loading items…
tabellify-no-items = No papers in this collection.
tabellify-load-error = Could not load this collection. See Help → Debug Output Logging for details.
tabellify-column-title = Title
tabellify-untitled = (untitled)

## Workspace: tag script box and group pills (Feature 006a).
## The label, the help line and "Edit groups and tags" are set in workspace.xhtml with
## data-l10n-id. The other messages are read from JavaScript with
## document.l10n.formatValue() (no arguments) and put on the page as plain text; names and
## numbers are added by workspace.js ("Outcome" + " · 3", "Outcome: " + "3 " + "tags").

tabellify-script-label = Tags and groups
tabellify-script-placeholder = Exposure(heat index, temperature), age
tabellify-script-help = Type a tag, several tags separated by commas, or Group(tag, tag), then press Enter. Suggestions come from your Zotero tags: ↓ to choose, Tab to accept. Your Zotero tags are never changed.
tabellify-script-error-unbalanced = Check the brackets: every "(" needs a matching ")".
tabellify-script-error-empty-tag = A tag name is missing. Remove the extra comma or type a name.
tabellify-script-error-empty-group = Type a group name before "(".
tabellify-script-error-nested = A group cannot contain another group.
tabellify-script-error-missing-comma = Separate the entries with a comma.
tabellify-script-error-unclosed-quote = A quotation mark (") is not closed.
tabellify-script-error-duplicate = The same tag appears twice in this entry.
tabellify-script-nothing-new = These tags are already in the codebook.
# Feature 006b: the suggestion list under the script box. Names are added by workspace.js
# as plain text ("Create tag" + ' "xyz"').
# Screen-reader name of the suggestion list.
tabellify-script-suggestions-label = Suggestions
# First part of the last option, for a name that is not a Zotero tag yet.
tabellify-script-create = Create tag
# Muted note after "Create tag": the name goes into Tabellify's codebook, not into Zotero.
tabellify-script-create-hint = codebook only
# Muted note after a suggested group name.
tabellify-script-group-hint = group
# Follows "Codebook saved." when the entry moved tags that were already in the codebook.
tabellify-script-moved = Some tags were moved to another group.
# Screen-reader name of the list of group pills.
tabellify-pills-label = Groups
# Name of the pill (and of the editor box) for tags without a group.
tabellify-pill-ungrouped = Ungrouped
# Follows a number in a pill's screen-reader name: "Outcome: 3 tags".
tabellify-pill-tags = tags

## Workspace: codebook editor ("Edit groups and tags", Feature 004, reduced in 006a).
## All messages except the disclosure's summary are read from JavaScript with
## document.l10n.formatValue() and put on the page as plain text (buttons, the status
## line). Messages that end in "File:" are followed by the file's path, which workspace.js
## adds as separate text.

tabellify-codebook-edit = Edit groups and tags
tabellify-codebook-ungrouped = Ungrouped
tabellify-codebook-rename = Rename
tabellify-codebook-rename-save = Save
tabellify-codebook-rename-cancel = Cancel
# Deleting a group keeps its tags: they become ungrouped (spec F006a Q4).
tabellify-codebook-delete = Delete
tabellify-codebook-group-name-label = Group name
# Text of the small button next to each tag; the next message is its tooltip.
tabellify-codebook-remove-tag = ×
tabellify-codebook-remove-tag-tooltip = Remove this tag from the codebook (your Zotero tags are not changed)

## Codebook status line.

tabellify-codebook-saved = Codebook saved.
tabellify-codebook-load-error = Could not load the codebook file. Editing is turned off so that the file is not overwritten. Fix or delete the file, or copy codebooks.json.bak over it, then reopen Tabellify. File:
tabellify-codebook-newer = The codebook file was made by a newer version of Tabellify. Editing is turned off so that the file is not overwritten. File:
tabellify-codebook-save-error = Could not save the codebook. Your last change is shown but not saved. See Help → Debug Output Logging for details.
tabellify-codebook-conflict = The codebook was changed in another Tabellify tab and has been reloaded; repeat your last change.

## Codebook: reasons an edit is refused (IDs come from codebook-model.js).

tabellify-codebook-error-group-empty = Enter a group name.
tabellify-codebook-error-group-duplicate = A group with this name already exists.
tabellify-codebook-error-group-missing = This group no longer exists.
tabellify-codebook-error-tag-empty = Enter a tag name.
tabellify-codebook-error-tag-duplicate = This tag is already in the codebook.
tabellify-codebook-error-tag-missing = This tag is no longer in the codebook.

## Workspace: tag counting (Feature 005; one summary line since 006a, spec Q2).
## The "Refresh" button and the table headers are set in workspace.xhtml with
## data-l10n-id. All other messages are read from JavaScript with
## document.l10n.formatValue() (no arguments) and put on the page as plain text.
## Numbers are added by workspace.js after the text: "Tags used" + " 2/4", "Papers" + " 3".

tabellify-monitor-refresh = Refresh
# Checkbox next to "Refresh". Off (default): only tags on highlights count. On: tags on the
# paper item itself count too. The reader's "Tabellify tags" section follows the same setting.
tabellify-monitor-count-item-tags = Also count tags on the paper itself
tabellify-monitor-choose = Choose a collection to see which codebook tags its papers use.
tabellify-monitor-codebook-empty = The codebook has no tags yet. Add tags to the codebook to see which ones are used.
tabellify-monitor-unavailable = Tag counts are unavailable because the codebook could not be loaded.
tabellify-monitor-annotations-error = Some highlights could not be read, so their tags are not counted. See Help → Debug Output Logging for details.
tabellify-monitor-tags-used = Tags used
tabellify-monitor-all-used = All codebook tags are used.
tabellify-monitor-papers = Papers
# Last column of the per-paper table: k codebook tags used on the paper, of M in the
# codebook (owner decision 2026-11-13). The short header keeps the column narrow; the
# tooltip and the screen-reader name say what it means.
tabellify-column-count = k/M
    .title = Codebook tags used on the paper (k of M)
    .aria-label = Codebook tags used on the paper (k of M)

## Workspace: per-paper table layout (Feature 005c; codebook tag columns since the
## owner's 2026-11-13 change).
## `tabellify-column-move` only sets the screen-reader name (`.aria-label`) of the grip
## column header; the visible "⠿" of every grip comes from workspace.css. The toolbar
## buttons are set in workspace.xhtml with data-l10n-id. The other messages are read from
## JavaScript with document.l10n.formatValue() (no arguments) and put on the page as plain
## text, with the paper title, group or tag name and numbers added by workspace.js:
## "Move paper:" + " <title>", "Move group:" + " <group>", "Move column:" + " <tag>",
## "<title>" + " moved to position" + " 2 " + "of" + " 12", "<tag>: " + "Used".

tabellify-column-move =
    .aria-label = Move
tabellify-table-move-paper = Move paper:
tabellify-table-move-group = Move group:
tabellify-table-move-tag = Move column:
# Text of the super-header over each run of tags without a group (F006c Amendment 2).
tabellify-table-ungrouped-label = Ungrouped
# Tooltip and screen-reader text of a tag cell: ✓ (the paper has the tag) or empty.
tabellify-table-tag-used = Used
tabellify-table-tag-not-used = Not used
tabellify-table-manual-order = Manual order
tabellify-table-clear-manual = Clear manual order
tabellify-table-reset-columns = Reset columns
tabellify-table-moved-to = moved to position
tabellify-table-of = of
# Saved table layout (layout.json, ADR-0014). The load-error and newer messages are
# followed by the file's path.
tabellify-table-layout-load-error = The saved table layout could not be read, so the default layout is shown. Layout changes will not be saved, and the file is left unchanged:
tabellify-table-layout-newer = The saved table layout was made by a newer version of Tabellify, so the default layout is shown. Layout changes will not be saved, and the file is left unchanged:
tabellify-table-layout-save-error = The table layout could not be saved. See Help → Debug Output Logging for details.
tabellify-table-layout-conflict = The table layout was changed in another Tabellify tab and has been reloaded.

## Feature 006c: regrouping tag columns by dragging them in the table (or Alt+arrow keys
## on a column's grip). Shown from JavaScript as plain text, without arguments; workspace.js
## adds the tag or group name after the text:
## "Codebook saved." + " Tag moved to another group."; "<tag>" + " moved to group" + " <group>";
## "<tag>" + " is now a group name"; "Move into group:" + " <group>";
## "Turn into a group name:" + " <tag>".
## Dropping on the bottom of a tag without a group turns that tag into a group name; on its
## top, the dragged tag becomes the group name. That tag leaves the codebook (never Zotero).
tabellify-regroup-joined = Tag moved to another group.
tabellify-regroup-created = The tag is now a group name.
tabellify-regroup-ungrouped = Tag removed from its group.
tabellify-regroup-announce-moved = moved to group
tabellify-regroup-announce-ungrouped = is now ungrouped
tabellify-regroup-announce-group-name = is now a group name
# When a drop or Alt+arrow key takes the last tag out of a group, the group turns back into
# a tag with its name (the table never shows a group without columns). Status line, after
# "Codebook saved." and the other regroup text:
tabellify-regroup-group-to-tag = The group became a tag again.
# Drop hint in the table toolbar while a tag column is dragged.
tabellify-drop-hint-reorder = Move column here
tabellify-drop-hint-join = Move into group:
tabellify-drop-hint-to-ungrouped = Move to Ungrouped
tabellify-drop-hint-new-group = Turn into a group name:
# Added after the hint above when the drop empties a group; the group's name follows.
tabellify-drop-hint-group-to-tag = · Group becomes a tag:

## Feature 008: "Export CSV" under the per-paper table. The button is set in
## workspace.xhtml with data-l10n-id. The other messages are read from JavaScript with
## document.l10n.formatValue() (no arguments): the save dialog's title and filter name,
## the status line (workspace.js adds the saved file's path after "CSV saved:" and after
## the write error, as plain text), the fallback file name, and the two k/M column headers
## written into the CSV file. The Title header and "(untitled)" reuse the messages above.

tabellify-export-csv = Export CSV
tabellify-export-dialog-title = Export table as CSV
tabellify-export-filter = CSV files
tabellify-export-saved = CSV saved:
tabellify-export-picker-error = The save dialog could not be opened. Nothing was saved.
tabellify-export-write-error = The CSV file could not be saved. Check that you can write to this folder, then try again:
# Suggested file name when the collection name has no usable characters (the date follows).
tabellify-export-file-fallback = Tabellify table
tabellify-csv-header-k = Tags used (k)
tabellify-csv-header-m = Codebook tags (M)

## Feature 007a: "View table" modal. The button, heading, note, labels, help line, Close
## and the table area's screen-reader name are set in workspace.xhtml with data-l10n-id.
## `tabellify-view-table-region` only sets `.aria-label` (read when the scrolling table
## area gets keyboard focus). `tabellify-view-count-label` is read from JavaScript with
## document.l10n.formatValue() (no arguments): the tooltip and screen-reader name of the
## k/M header in the modal's table. "Export CSV" reuses `tabellify-export-csv`.

tabellify-view-table = View table
tabellify-view-heading = View table
tabellify-view-not-saved = Not saved yet. Save table keeps this table with its name and description.
tabellify-view-name-label = Name
tabellify-view-name-help = Used as the name of the exported CSV file.
tabellify-view-description-label = Description
tabellify-view-table-region =
    .aria-label = Table preview
tabellify-view-close = Close
tabellify-view-count-label = Codebook tags used on the paper (k of M)

## Feature 007b: saved tables. The section's heading, filter label and filter options are
## set in workspace.xhtml with data-l10n-id. Everything else is read from JavaScript with
## document.l10n.formatValue() (no arguments): workspace.js appends numbers, names, dates
## and file paths after these texts as plain text (for example "12 papers", "Saved
## 14 Nov 2026, 15:40", "File: /path/tables.json").

tabellify-saved-heading = Saved tables
tabellify-saved-filter-label = Show
tabellify-saved-filter-all = All collections
tabellify-saved-filter-collection = This collection
tabellify-saved-empty = No saved tables yet. Open "View table" and click "Save table".
tabellify-saved-empty-collection = No saved tables for this collection.
tabellify-saved-choose = Choose a collection to see its saved tables.
tabellify-saved-load-error = The saved tables file could not be read. Saving is turned off so the file is not overwritten. File:
tabellify-saved-newer = The saved tables file was made by a newer version of Tabellify. Saving is turned off. File:
# After a number: "12 papers", "7 columns".
tabellify-saved-papers = papers
tabellify-saved-columns = columns
# Before a date: "Saved 14 Nov 2026, 15:40".
tabellify-saved-on = Saved
# After the collection name saved with the table, when the collection was deleted.
tabellify-saved-collection-missing = (collection not found)
tabellify-saved-open = Open
tabellify-saved-delete = Delete
tabellify-saved-delete-question = Delete this saved table? This cannot be undone.
tabellify-saved-delete-confirm = Delete
tabellify-saved-delete-cancel = Cancel
tabellify-saved-deleted = Saved table deleted.
tabellify-saved-conflict = Saved tables were changed in another Tabellify tab and have been reloaded. Repeat your last change.
tabellify-saved-save-error = The saved tables could not be saved. Nothing was changed. File:
tabellify-saved-gone = This saved table was deleted in another Tabellify tab.
tabellify-saved-error-name-empty = Type a name before saving.
tabellify-saved-error-limit-tables = Tabellify keeps at most 100 saved tables. Delete one first.
tabellify-saved-error-limit-rows = This table has more than 5,000 papers and cannot be saved.
tabellify-saved-error-limit-columns = This table has more than 500 columns and cannot be saved.
tabellify-saved-error-limit-file = The saved tables file would become too large. Delete some saved tables first.
# "View table" modal, Feature 007b. The heading and the save button change with the mode.
tabellify-view-heading-saved = Saved table
tabellify-view-save = Save table
tabellify-view-save-changes = Save changes
# Before a date and the collection name: "Snapshot from 14 Nov 2026, 15:40 · F005 test".
tabellify-view-meta-snapshot = Snapshot from
tabellify-view-saved = Table saved.
tabellify-view-changes-saved = Changes saved.

## Item pane / reader section "Tabellify tags" (Feature 005b).
## Zotero sets data-l10n-id on the section header and on its side-nav icon, so those two
## messages use attributes: `.label` (header text) and `.tooltiptext` (icon tooltip), like
## Zotero's own sections. reader-tags.js reads `tabellify-reader-summary` with
## document.l10n.formatValue(); the other messages are set on <p> elements with
## data-l10n-id / data-l10n-args. `$used` and `$total` are numbers.

tabellify-reader-section-header =
    .label = Tabellify tags
tabellify-reader-section-sidenav =
    .tooltiptext = Tabellify tags
# Header summary, also shown when the section is collapsed: "2 / 3".
tabellify-reader-summary = { $used } / { $total }
tabellify-reader-used = { $used } of { $total } codebook tags used on this paper
# Checklist marks in front of each codebook tag (the tag name follows as plain text).
# `.title` is the tooltip shown when pointing at the mark.
tabellify-reader-mark-used = ✓
    .title = Used on this paper
tabellify-reader-mark-unused = ☐
    .title = Not used on this paper yet
tabellify-reader-no-codebook = No codebook yet. Create one in Tools → Tabellify…
tabellify-reader-codebook-error = Could not read the codebook.
tabellify-reader-counting = Counting…
