# Workspace

The workspace is where Tabellify's tools (codebooks, tag monitor, table builder, saved
tables) will live. In version 0.1.0 it is a placeholder.

## Today (version 0.1.0, Feature 001)

**Open it:** in the main Zotero window, choose **Tools → Tabellify…**.

**What you see:** a separate window titled **Tabellify Workspace**, with the heading
**Tabellify Workspace** and the sentence **Your literature tables will appear here.** Nothing
else is in the window yet.

- **Only one workspace window.** If the Tabellify Workspace window is already open, choosing
  **Tools → Tabellify…** again brings that window to the front instead of opening a second
  one.
- **Close it** like any other window (for example Cmd+W on macOS while it is in front).
- **Turning Tabellify off** (Tools → Plugins, toggle switch on the Tabellify row) closes the
  workspace window automatically.

## Planned: workspace as a tab (Feature 002)

**Planned (F002, approved, not released).** The workspace will open as a **tab in the main
Zotero window**, next to your library and PDF tabs, instead of a separate window. This keeps
it reachable when Zotero is maximized or in full screen. As specified:

- **Tools → Tabellify…** opens a tab titled **Tabellify** in the window you chose it from,
  showing the same placeholder content.
- Choosing **Tools → Tabellify…** again selects the existing Tabellify tab instead of opening
  a second one.
- You close the Tabellify tab like any other tab.
- The Tabellify tab is not restored after you quit and restart Zotero; your other tabs (PDFs,
  notes) are restored as usual. Reopen Tabellify from the Tools menu.

Background: [ADR-0009](Decision-Log) and the
[product requirements](https://github.com/asmithlabs/tabellify/blob/main/docs/product-requirements.md).
This page will be updated when Feature 002 ships.

## Planned: workspace contents

Choosing a collection, the codebook, tag monitor and table builder are later features; see
[Codebooks](Codebooks), [Tag Monitor](Tag-Monitor), [Table Builder](Table-Builder),
[Saved Tables](Saved-Tables) and [Export](Export).
