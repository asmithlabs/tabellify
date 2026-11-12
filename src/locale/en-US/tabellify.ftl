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
tabellify-no-items = No items in this collection.
tabellify-load-error = Could not load this collection. See Help → Debug Output Logging for details.
tabellify-column-title = Title
tabellify-column-tags = Tags
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
