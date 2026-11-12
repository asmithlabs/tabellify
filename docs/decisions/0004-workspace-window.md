# ADR-0004: Workspace as a separate window opened from a menu

- **Status:** Superseded by ADR-0009 (2026-11-11)
- **Date:** 2026-11-11
- **Deciders:** Antonio Smith (owner), Claude (drafted)

## Context
Feature 001 needs a place for the Tabellify workspace. Zotero documents chrome
registration (for `chrome://` XHTML files), preference panes, item-pane sections, and
menus. It does **not** document an API for adding custom tabs to the main window; doing so
would rely on Zotero internals.

The owner's sketches place the Table Planner inside Zotero Settings and a tag monitor
beside the reader. Those surfaces are revisited in later features (see PRD Q3).

## Decision
For Feature 001, the workspace is a separate chrome window
(`chrome://tabellify/content/workspace.xhtml`) opened from a "Tabellify…" menu item
registered with `Zotero.MenuManager`. The exact window-opening call and menu target ID are
verified in Feature 001 T1 before implementation.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Main-window tab | Feels most integrated | Undocumented internal API; breakage risk each release |
| Settings pane (as sketched) | Documented API; matches sketch | Settings is for configuration; cramped for large tables |
| Item-pane section | Documented | Far too small for a table |

## Consequences
Low-risk, documented path. Later features may add a Settings pane (codebook) and an item
pane section (tag monitor) alongside the window; a main-window tab can be reconsidered via a
new ADR if Zotero documents a tab API.
