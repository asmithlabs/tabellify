# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** Antonio Smith (owner), Claude (drafted)

## Context
Tabellify is built with AI agents that start each session without memory of earlier
reasoning. Decisions must be written down so agents and contributors follow them
consistently and the owner can see why the system looks the way it does.

## Decision
Record significant decisions as short Architecture Decision Records in `docs/decisions/`,
numbered sequentially, using `_template.md`. Agents may draft ADRs only with
`Status: Proposed`; the owner accepts or rejects them. Accepted ADRs are not rewritten —
a new ADR supersedes an old one.

"Significant" includes: new dependencies, storage formats, UI surfaces, public interfaces,
compatibility ranges, licensing, and anything touching library data.

## Consequences
Small overhead per decision; durable shared context for agents and contributors.
