# ADR-0008: Target Zotero 10.0 (supersedes ADR-0002's version range)

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** Antonio Smith (owner), Claude (drafted)
- **Supersedes:** the compatibility range in ADR-0002 (plugin ID and prefixes remain in force)

## Context
ADR-0002 set `strict_min_version` 8.0 / `strict_max_version` 9.*. The owner runs
**Zotero 10.0.8**; Zotero 10.0 was released 2026-08-17. With a 9.* maximum, Tabellify
would be disabled on the owner's machine.

Zotero 10 for Developers (https://www.zotero.org/support/dev/zotero_10_for_developers):
- Same Firefox 140 ESR base as Zotero 9 — no Mozilla platform changes.
- Recommended `strict_max_version`: `10.0.*` after confirming compatibility.
- Breaking changes relevant to Tabellify's roadmap: singular selection getters now throw
  (`getSelectedCollection()` → `getSelectedCollections()`, `getSelectedLibraryID()` →
  `getSelectedLibraryIDs()`, `getCollectionTreeRow()` → `getCollectionTreeRows()`);
  `ItemTree` refactor; MenuManager context changes (`collectionTreeRows`); new search
  conditions for annotation properties and tag counts; plugin Fluent strings
  consolidated, registered via `Zotero.ftl.addResourceIds()`; database WAL mode.

Zotero 11 (Firefox 153) is in developer test builds.

## Decision
- `strict_min_version`: **10.0**. `strict_max_version`: **10.0.\***.
- Develop and test on Zotero 10 release builds. Track Zotero 11 betas once Tabellify has
  working features, and bump `strict_max_version` only after testing.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| 8.0 – 10.0.* | Reaches users who haven't updated | Selection APIs differ between 9 and 10 → version branches in F002+; untestable without extra installs |
| 9.0 – 10.0.* | Slightly wider reach | Same branching problem for collection selection |

## Consequences
One API generation to learn and test. Users on Zotero 8/9 are not supported (Zotero
auto-updates, so this group shrinks). Every Zotero major release requires a compatibility
check — a good candidate for a Claude Code skill.
