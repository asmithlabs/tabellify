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

tabellify-workspace-title = Tabellify Workspace

# The root <window> takes its title-bar text from the `title` attribute.
tabellify-workspace-window =
    .title = { tabellify-workspace-title }

tabellify-workspace-description = Your literature tables will appear here.

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

## Workspace: codebook (Feature 004).
## The heading, intro, "Add group" button and empty message are set in workspace.xhtml with
## data-l10n-id. All other messages here are read from JavaScript with
## document.l10n.formatValue() and put on the page as plain text (buttons, placeholders,
## the status line). Messages that end in "File:" are followed by the file's path, which
## workspace.js adds as separate text.

tabellify-codebook-heading = Codebook
tabellify-codebook-intro = Plan your tags here, grouped under super-tags. Editing the codebook never changes the tags in your Zotero library.
tabellify-codebook-group-placeholder = New group (super-tag) name
tabellify-codebook-add-group = Add group
tabellify-codebook-empty = The codebook is empty. Add a group to start.
tabellify-codebook-rename = Rename
tabellify-codebook-rename-save = Save
tabellify-codebook-rename-cancel = Cancel
tabellify-codebook-delete = Delete
tabellify-codebook-delete-confirm = Confirm delete
tabellify-codebook-group-name-label = Group name
tabellify-codebook-tag-placeholder = New tag name
tabellify-codebook-add-tag = Add tag
# Text of the small button next to each tag; the next message is its tooltip.
tabellify-codebook-remove-tag = ×
tabellify-codebook-remove-tag-tooltip = Remove this tag from the codebook (your Zotero tags are not changed)
tabellify-codebook-pick-placeholder = Pick from library…
tabellify-codebook-no-tags = No tags in this group yet.

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
tabellify-codebook-error-tag-missing = This tag is no longer in the group.

## Workspace: tag monitor (Feature 005).
## The heading, the "Refresh" button and the new table headers are set in workspace.xhtml
## with data-l10n-id. All other messages are read from JavaScript with
## document.l10n.formatValue() (no arguments) and put on the page as plain text.
## Numbers are added by workspace.js after the text, e.g. "Tags used" + " 2/4",
## "Papers:" + " 3", "Heat index · 3" + " papers".

tabellify-monitor-heading = Tag monitor
tabellify-monitor-refresh = Refresh
# Checkbox next to "Refresh". Off (default): only tags on highlights count. On: tags on the
# paper item itself count too. The reader's "Tabellify tags" section follows the same setting.
tabellify-monitor-count-item-tags = Also count tags on the paper itself
tabellify-monitor-choose = Choose a collection to see which codebook tags its papers use.
tabellify-monitor-codebook-empty = The codebook has no tags yet. Add tags to the codebook to see which ones are used.
tabellify-monitor-unavailable = The tag monitor is unavailable because the codebook could not be loaded.
tabellify-monitor-annotations-error = Some highlights could not be read, so their tags are not counted. See Help → Debug Output Logging for details.
tabellify-monitor-tags-used = Tags used
tabellify-monitor-all-used = All codebook tags are used.
tabellify-monitor-papers = Papers:
tabellify-monitor-used = Used:
tabellify-monitor-remaining = Remaining:
tabellify-monitor-none = none
# Follows a number: "1 paper", "3 papers".
tabellify-monitor-paper-one = paper
tabellify-monitor-paper-other = papers
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
