# ADR-0002: Zotero compatibility range and plugin identity

- **Status:** Accepted — compatibility range superseded by ADR-0008 (plugin ID still in force)
- **Date:** 2026-11-11
- **Deciders:** Antonio Smith (owner), Claude (drafted)

## Context
Zotero 8 (Jan 2026) moved to Firefox 140 ESR and added `Zotero.MenuManager`, an official
menu API that auto-cleans on disable. Zotero 9 is the current stable line (Aug 2026), and
Zotero now releases every 6–10 weeks with frequent major-version bumps. A plugin is
disabled when the running Zotero exceeds its `strict_max_version`.

The plugin ID is permanent: changing it later breaks updates and stored preferences.

## Decision
- `strict_min_version`: **8.0**. `strict_max_version`: **9.\***.
- Raise `strict_max_version` only after testing against each new Zotero release
  (a recurring chore task; candidate for a Claude Code skill).
- Plugin ID: **`tabellify@asmithlabs.com`**. Preference prefix: `extensions.tabellify.`.
  Fluent ID prefix: `tabellify-`. Chrome package name: `tabellify`.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Support Zotero 7 too | Larger audience | No MenuManager → manual DOM menu injection; two platform generations (JSM vs ESM, Bluebird) |
| Open-ended max version | No release-day breakage | Zotero may disable or misbehave unpredictably; violates platform guidance |

## Consequences
Zotero 7 users are not supported. Each Zotero major release requires a compatibility
check and manifest bump. Owner to confirm installed Zotero version (open item).
