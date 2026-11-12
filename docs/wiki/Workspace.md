# Workspace

The workspace is where Tabellify's tools (codebooks, tag monitor, table builder, saved
tables) will live. In version 0.1.0 it is a placeholder.

## Today (version 0.1.0, Features 001 and 002)

From Feature 002 on, the workspace opens as a **tab in the main Zotero window**, next to your
library tab and your PDF and note tabs. Because it is part of the main window, it stays
reachable when Zotero is maximized or in full screen.

> Feature 002 is implemented but not released yet (no GitHub Release). Earlier development
> builds of 0.1.0 opened the workspace as a separate window instead.

### Open it

1. In the main Zotero window, choose **Tools → Tabellify…** in the menu bar.

**What you should see:** a new tab titled **Tabellify** appears in the tab bar at the top of
the main Zotero window and is selected. It shows the heading **Tabellify Workspace** and the
sentence **Your literature tables will appear here.** Nothing else is in the tab yet. No
separate window opens.

This also works while the main Zotero window is in full screen: the Tabellify tab opens
inside the full-screen window.

### Only one Tabellify tab

If the Tabellify tab is already open and you are looking at another tab (for example your
library or a PDF), choosing **Tools → Tabellify…** again switches to the existing Tabellify
tab. It does not open a second one.

If you have more than one main Zotero window, each one can have its own Tabellify tab. The
tab opens in the window whose Tools menu you used.

### Close it

Click the **×** on the Tabellify tab, like any other tab. To get it back, choose
**Tools → Tabellify…** again; a fresh tab opens.

Tabellify also closes its tab by itself:

- **When you turn Tabellify off** (Tools → Plugins, toggle switch on the Tabellify row) or
  remove it.
- **When you quit Zotero.** The Tabellify tab is closed just before Zotero saves your open
  tabs, so it is **not reopened after a restart**. Your other tabs (PDFs, notes) are
  restored as usual. Reopen Tabellify from **Tools → Tabellify…** when you need it.
- **When you close the main Zotero window** that contains it.

Tabellify only ever closes its own tab. It never closes, moves or changes your other tabs.

### Fallback: a separate window

If a future Zotero update changes the internal tab system Tabellify relies on, Tabellify
cannot open a tab. It then automatically opens the workspace as a separate window titled
**Tabellify Workspace** instead, with the same content. You do not need to do anything. In
that case choosing **Tools → Tabellify…** again brings the open window to the front, and the
window closes by itself when you turn Tabellify off. Please
[report it](Troubleshooting#reporting-a-bug) if you see this window, because it means
Tabellify needs an update.

Background: [ADR-0009](Decision-Log) and
[Feature 002](https://github.com/asmithlabs/tabellify/blob/main/docs/features/002-workspace-tab.md).

## Planned: workspace contents

Choosing a collection (**Planned, F003**), the codebook (**Planned, F004**), tag monitor
(**Planned, F005**), table builder (**Planned, F006**), saved tables (**Planned, F007**) and
export (**Planned, F008**) are later features; see [Codebooks](Codebooks),
[Tag Monitor](Tag-Monitor), [Table Builder](Table-Builder), [Saved Tables](Saved-Tables) and
[Export](Export).
