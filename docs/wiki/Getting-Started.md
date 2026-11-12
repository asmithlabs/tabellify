# Getting Started

This page shows how to install Tabellify in Zotero and open its workspace.

> Tabellify is in early development. Version 0.1.0 only opens a placeholder workspace; it
> does not read your library or build tables yet.

## What you need

- **Zotero 10.0.x** (for example 10.0.8 or 10.0.9). To check your version on macOS, choose
  **Zotero → About Zotero** in the menu bar. Tabellify cannot be installed on Zotero 9 or
  earlier, or on Zotero 10.1 and later, until it has been tested there.
- The Tabellify `.xpi` file. An `.xpi` is the file format Zotero uses for plugins.

## 1. Download Tabellify

Download the `.xpi` file from
[GitHub Releases](https://github.com/asmithlabs/tabellify/releases).

> No release has been published yet. Releases will appear on that page.

If your browser offers to open the file, save it instead. Remember where you saved it (for
example your Downloads folder).

## 2. Install the plugin in Zotero

1. Open Zotero.
2. In the menu bar, choose **Tools → Plugins**. The Plugins window opens.
3. In the Manage Your Plugins window, click the gear icon (⚙) in the top-right corner and choose
   **Install Plugin From File…**.
4. Pick the Tabellify `.xpi` file you downloaded and confirm.

You can also drag the `.xpi` file from Finder onto the Plugins window.

**What you should see:** Tabellify appears in the Plugins window, enabled, with its version
number (0.1.0). No error message appears.

If Zotero says the plugin "could not be installed. It may be incompatible with this version
of Zotero.", see [Troubleshooting](Troubleshooting#could-not-be-installed).

## 3. Open the workspace

1. Go back to the main Zotero window.
2. In the menu bar, choose **Tools → Tabellify…**.

**What you should see:** a new window titled **Tabellify Workspace** opens. It shows the
heading **Tabellify Workspace** and the sentence **Your literature tables will appear here.**

See [Workspace](Workspace) for more about this window.

## Turning Tabellify off and on

1. Choose **Tools → Plugins**.
2. Find the Tabellify row and click the toggle switch on the right of that row.

When Tabellify is off, the row title reads **Tabellify (disabled)**, the **Tabellify…** item
disappears from the Tools menu, and an open Tabellify Workspace window closes by itself.
Click the toggle again to turn Tabellify back on. You do not need to restart Zotero.

## Updating to a new version

Install the new `.xpi` the same way (step 2). Installing over an enabled Tabellify replaces
the older version.

## Removing Tabellify

Choose **Tools → Plugins**. Click the ⋯ menu next to Tabellify, then click Remove.

To turn Tabellify off without uninstalling it, use the toggle switch on the Tabellify row
instead; when it is off, the row reads "Tabellify (disabled)".

> **Restart Zotero after removing Tabellify, before installing it again.** Because of a bug
> in Zotero 10, removing and reinstalling in the same session can leave a second copy of
> Tabellify running. See [Troubleshooting](Troubleshooting#two-copies-after-remove-and-reinstall).

Removing Tabellify does not change your Zotero library. Version 0.1.0 stores no data of its
own.
