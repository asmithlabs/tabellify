# Data Safety and Privacy

Your Zotero library is your research. Tabellify is built so that it never changes it.

## What Tabellify 0.1.0 does

- **Reads nothing from your library.** Version 0.1.0 (Features 001 and 002) only adds a menu
  item and opens a placeholder workspace tab. It does not look at your collections, items,
  tags, annotations or attachments.
- **Touches only its own tab.** To show the workspace, Tabellify adds a **Tabellify** tab to
  Zotero's in-memory list of open tabs, and later closes it. It checks only whether its own
  tab is still open. It never closes, moves or changes your other tabs, and it never reads
  or writes the file in which Zotero saves your open tabs between sessions.
- **Changes nothing in your library.** It does not create, edit or delete items,
  collections, tags, notes, annotations or attachments. An automated check (the "write
  guard") runs on every code change and fails if Tabellify's code contains library-write
  calls.
- **Stores no data of its own.** There are no Tabellify files or settings to clean up.
- **Sends nothing over the internet.** Tabellify's own code makes no network requests.

### One network request made by Zotero

Like every Zotero plugin, Tabellify tells Zotero where to look for updates. Zotero checks
`https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json` in the background.
That file does not exist yet, so the check currently fails harmlessly (you may see an HTTP 404
for it in Debug Output). The request goes to GitHub and contains no library data.

### Your open tabs after a restart

Zotero saves your open tabs and reopens them at the next start. Tabellify closes its tab
just before Zotero saves them at quit, so a Tabellify tab is never meant to be saved. If
Zotero crashes while the Tabellify tab is open, the next start may not reopen some of your
PDF or note tabs. Your library itself is not affected. See
[Troubleshooting](Troubleshooting#pdf-or-note-tabs-not-restored-after-a-restart).

## Rules for future versions

These principles come from the
[product requirements](https://github.com/asmithlabs/tabellify/blob/main/docs/product-requirements.md)
and the project rules:

- **Reading only.** Later features (**Planned, F003** onward) will read collections, items,
  tags and annotations to build tables. Tabellify will not modify them unless a future
  feature explicitly says so and the maintainer approves it; such a change would be
  documented here first.
- **Tabellify's own data stays separate.** Codebooks and saved tables (**Planned, F004 and
  F007**) will be stored by Tabellify, never in your items' fields. The storage format is not
  decided yet.
- **Exports go where you choose.** CSV export (**Planned, F008**) will write files only to a
  location you pick.
- **AI features** (**Planned, F010+**) may send paper content to an external service. Before
  any such feature ships, this page will explain exactly what is sent, where, and how to
  turn it off.

## Reporting a security problem

Please do not open a public issue. Follow [SECURITY.md](https://github.com/asmithlabs/tabellify/blob/main/SECURITY.md).
