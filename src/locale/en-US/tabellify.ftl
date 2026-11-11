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
