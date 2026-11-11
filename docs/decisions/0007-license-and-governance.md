# ADR-0007: License and community governance

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** Antonio Smith (owner), Claude (drafted)

## Context
The owner wants to keep control of the code and grow a community around it. Zotero itself
is AGPL-3.0, as is much of its plugin ecosystem.

## Decision
- License: **AGPL-3.0-or-later**. Anyone may use, modify, and share Tabellify, but
  modified versions that are distributed (or offered over a network) must also be open
  source under the same license. This keeps forks and derivatives open.
- Contributions: **Developer Certificate of Origin** (`git commit -s`), contributions
  licensed inbound = outbound (AGPL-3.0-or-later). No CLA for now.
- Repository: **public** on GitHub; `main` protected (PR + passing CI required);
  squash-merge; the owner is the sole maintainer who merges and releases.
- Community files: CONTRIBUTING.md, issue templates, PR template; code of conduct to add
  (Contributor Covenant) before announcing publicly.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| MIT | Maximum adoption | Others can build closed derivatives; least control |
| GPL-3.0 | Copyleft | Weaker for network/hosted derivatives than AGPL |
| AGPL + CLA | Owner could relicense later (e.g. dual license) | CLAs deter contributors; extra admin |

## Consequences
Strong guarantee that improvements stay open; matches Zotero. Without a CLA, relicensing
later requires all contributors' agreement — revisit before accepting large outside
contributions if dual-licensing might ever matter. (Not legal advice.)
