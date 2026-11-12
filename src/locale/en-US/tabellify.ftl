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
