# ADR-0003: Plain JavaScript, no bundler

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** Antonio Smith (owner), Claude (drafted)

## Context
The owner is learning JavaScript and Zotero plugin development. The official sample
(`zotero/make-it-red`) uses plain JS with no build step. The community template
(`windingwind/zotero-plugin-template`) offers TypeScript, hot reload, and a toolkit, but
adds substantial machinery and is reported to be AGPL-3.0 licensed.

## Decision
Write the plugin in plain modern JavaScript (ES2022+, strict mode) with JSDoc type
comments. `src/` is the plugin root and ships as-is. Build = zip `src/` into an `.xpi`
via a small Node script. Development dependencies are kept to a minimum; none are needed
for Feature 001.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| TypeScript + windingwind template / zotero-plugin-scaffold | Types, hot reload, in-Zotero test runner, helpers | Hidden build complexity for a learner; many dependencies; template code licensing |
| TypeScript + esbuild, hand-rolled | Types, small toolchain | Build step from day one; compile errors before fundamentals are learned |

## Consequences
What you see is what Zotero runs — easier to learn and debug. No compile-time type
checking (JSDoc gives editor hints). Revisit when the UI grows (F005/F008) — e.g. adopt
`// @ts-check` with `tsc --noEmit`, or TypeScript, via a new ADR.
