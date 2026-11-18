# Getting Started

This page shows how to install Tabellify, open its workspace and build your first table.

## What you need

- **Zotero 10.0.x** (for example 10.0.9). To check your version on macOS, choose
  **Zotero → About Zotero** in the menu bar. Tabellify cannot be installed on Zotero 9 or
  earlier, or on Zotero 10.1 and later, until it has been tested there.
- The Tabellify `.xpi` file. An `.xpi` is the file format Zotero uses for plugins.
- A collection with a few papers that have PDFs, in **My Library** or in one of your
  **group libraries** (libraries shared with a group on zotero.org).

## 1. Download Tabellify

Download the `.xpi` file from
[GitHub Releases](https://github.com/asmithlabs/tabellify/releases). If your browser offers
to open the file, save it instead. Remember where you saved it (for example your Downloads
folder).

## 2. Install the plugin in Zotero

1. Open Zotero.
2. In the menu bar, choose **Tools → Plugins**. The Plugins window opens.
3. In the Plugins window, click the gear icon (⚙) and choose **Install Plugin From File…**.
4. Pick the Tabellify `.xpi` file you downloaded and confirm.

**What you should see:** Tabellify appears in the Plugins window, enabled, with its version
number (for example 0.2.0). No error message appears.

If Zotero says the plugin "could not be installed. It may be incompatible with this version
of Zotero.", see [Troubleshooting](Troubleshooting#could-not-be-installed).

## 3. Open the workspace

1. Go back to the main Zotero window.
2. In the menu bar, choose **Tools → Tabellify…**.

**What you should see:** a new tab titled **Tabellify** appears in the tab bar of the main
Zotero window and is selected. It shows the heading **Tabellify Codebook**, a **Collection**
list, a **Refresh** button and the **Tags and groups** box.

See [Workspace](Workspace) for everything on this page.

## 4. Build your first table

1. In the Tabellify tab, open the **Collection** list and choose a collection.
   **What you should see:** the text "Choose a collection to see which codebook tags its
   papers use." goes away. If the codebook is still empty you see "The codebook has no tags
   yet. Add tags to the codebook to see which ones are used."
2. Click in the **Tags and groups** box and type your planned tags, for example
   `Exposure(Heat index, Temperature), Outcome(Hospitalization), age`. Press Enter.
   **What you should see:** "Codebook saved." under the box, the pills **Exposure · 2**,
   **Outcome · 1** and **Ungrouped · 1**, and a table with one row per paper and one column
   per tag.
3. Open a paper's PDF and add one of the codebook tags (for example `Heat index`) to a
   highlight, using Zotero's own annotation tags.
4. Switch back to the Tabellify tab.
   **What you should see:** that paper's row has a ✓ under **Heat index**, and its **k/M**
   column reads `1/4`.

Next steps: [Codebooks](Codebooks) (the full typing rules), [Table Builder](Table-Builder)
(sorting and dragging), [Saved Tables](Saved-Tables) and [Export](Export).

## Turning Tabellify off and on

1. Choose **Tools → Plugins**.
2. Find the Tabellify row and click the toggle switch on the right of that row.

When Tabellify is off, the row title reads **Tabellify (disabled)**, the **Tabellify…** item
disappears from the Tools menu, an open Tabellify tab closes by itself, and the
**Tabellify tags** section disappears from Zotero's right-hand pane. Click the toggle again to
turn Tabellify back on. You do not need to restart Zotero. Your codebook and saved tables
are kept.

## Updating to a new version

Install the new `.xpi` the same way (step 2). Installing over an enabled Tabellify replaces
the older version and keeps your codebook and saved tables.

## Removing Tabellify

Choose **Tools → Plugins**. Click the ⋯ menu next to Tabellify, then click Remove (label
not yet verified).

> **Restart Zotero after removing Tabellify, before installing it again.** Because of a bug
> in Zotero 10, removing and reinstalling in the same session can leave a second copy of
> Tabellify running. See [Troubleshooting](Troubleshooting#two-copies-after-remove-and-reinstall).

Removing Tabellify does not change your Zotero library. It also does **not** delete
Tabellify's own files (your codebook, table layout and saved tables) or its one setting; see
[Data Safety and Privacy](Data-Safety-and-Privacy#removing-tabellifys-files-and-setting) to
remove them by hand.
