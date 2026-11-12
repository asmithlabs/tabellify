# Troubleshooting

## "Could not be installed"

Zotero shows a message like: **"… could not be installed. It may be incompatible with this
version of Zotero."**

Common causes and fixes:

1. **Your Zotero version is not 10.0.x.** Tabellify 0.1.0 only installs on Zotero 10.0.x.
   Check your version (macOS: **Zotero → About Zotero**).
   - On Zotero 9 or earlier: update Zotero to 10.0.x.
   - On Zotero 10.1 or later: Tabellify has not been tested there yet, so Zotero refuses it.
     Wait for a Tabellify release that supports your version.
2. **The download is incomplete or damaged.** Delete the `.xpi` file, download it again from
   [GitHub Releases](https://github.com/asmithlabs/tabellify/releases), and install the new
   copy. Make sure you saved the `.xpi` file itself (not a web page) and that the download
   finished.

If neither helps, [collect Debug Output](#collecting-debug-output) while you try to install,
and [report a bug](#reporting-a-bug).

## The Tabellify… menu item is missing

1. Choose **Tools → Plugins** and check that Tabellify is listed and enabled (the row title
   does not end in "(disabled)"). If it is disabled, click the toggle switch on the right of
   the Tabellify row.
2. If you recently removed and reinstalled Tabellify, see the next section.

## Two copies after remove and reinstall

**Symptom:** after you removed Tabellify and installed it again without restarting Zotero,
the menu item misbehaves, or Debug Output shows `MenuAPI: 'menuID' must be unique` and
`Tabellify: menu registration failed`.

**Cause:** a bug in Zotero 10 (not in Tabellify). Zotero finishes a removal later without
fully shutting the old copy down, so a reinstall in the same session can start a second copy.

**Fix:** quit Zotero completely and start it again. In future, **restart Zotero between
Remove and Install**. Installing a new version over an enabled Tabellify (without removing
it first) is fine.

## Errors you can ignore

Debug Output may show these messages. They come from Zotero itself, not from Tabellify:

- A failed request (HTTP 404) for
  `https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json`. Zotero checks
  this address for Tabellify updates; the file does not exist yet.
- A `TypeError` about `getTabForBrowser` in `browser-custom-element.mjs`.
- A focus `TypeError` in `basicViewer.xhtml`.

A Tabellify problem is an error line that mentions `tabellify` (for example `tabellify.js`,
`bootstrap.js` from Tabellify, or a `chrome://tabellify/` address).

## Collecting Debug Output

Debug Output is Zotero's internal log. Tabellify writes its own lines there, all starting
with `Tabellify: `. Sending these lines with a bug report helps a lot.

Zotero's own instructions: <https://www.zotero.org/support/debug_output>.

1. In the main Zotero window, open the **Help → Debug Output Logging** submenu.
2. Turn logging on. Zotero's documentation names the items in this submenu **Enable**,
   **Restart with Logging Enabled…**, **View Output** and **Submit Output** (names from
   Zotero's docs; not yet checked in Tabellify's own tests). Use **Restart with Logging
   Enabled…** if the problem happens while Zotero starts or while installing; otherwise use
   **Enable**.
3. Do the thing that goes wrong (for example, install Tabellify or choose
   **Tools → Tabellify…**).
4. Choose **Help → Debug Output Logging → View Output**. A window with the log opens.
5. Copy the lines that start with `Tabellify:` and any error lines near them, and paste them
   into your bug report. Do not include anything you consider private; the log can contain
   titles from your library.

**Submit Output** sends the log to Zotero's servers (see Zotero's page). For Tabellify
problems, paste the relevant lines into a GitHub issue instead.

## Reporting a bug

Open an issue at <https://github.com/asmithlabs/tabellify/issues> using the **Bug report**
template. Include your Tabellify version, Zotero version, operating system, steps to
reproduce, and the Debug Output lines.

Security problems: do **not** open a public issue; follow
[SECURITY.md](https://github.com/asmithlabs/tabellify/blob/main/SECURITY.md).
