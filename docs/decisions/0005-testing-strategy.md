# ADR-0005: Testing strategy

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** Antonio Smith (owner), Claude (drafted)

## Context
Plugin code that calls `Zotero.*` runs only inside Zotero. Pure logic can run in Node.
Rule 8 (protect library data) needs a guard that doesn't depend on someone remembering.

## Decision
Three layers:
1. **Unit** — Node's built-in `node:test` for `src/modules/` (zero dependencies).
2. **Static** — Node scripts/tests: manifest validity and version consistency; XPI
   contains required files; every `register…` has a matching `unregister…`/cleanup;
   **library-write guard** fails if `src/` contains write calls (e.g. `.save(`, `.saveTx(`,
   `.erase(`, `.eraseTx(`, `Zotero.DB.query` writes) outside spec-authorized allowlist.
3. **In-Zotero** — manual checklists in `docs/testing/manual/`, run by the owner in the dev
   profile. Automating these (e.g. via an in-Zotero test runner) is a future ADR.

CI (GitHub Actions) runs layers 1–2 and builds the XPI on every PR.

## Consequences
Fast, dependency-free tests; manual effort for UI verification until automated.
The write guard is a heuristic — review remains the second line of defense.
