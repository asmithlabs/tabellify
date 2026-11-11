# Contributing to Tabellify

Thanks for your interest! These standards apply to human and AI-agent contributors alike.

## Before you start
- Open or find an issue. For new features, discuss first — features are specified in
  `docs/features/` before implementation.
- Read `CLAUDE.md` (project rules) and `docs/architecture.md`.

## Branches
`<type>/<short-kebab-description>`, branched from `main`:
- `feat/001-plugin-shell` — features (prefix with the feature number)
- `fix/menu-not-removed-on-disable` — bug fixes
- `docs/…`, `test/…`, `chore/…`, `adr/0008-storage-format`

## Commits — [Conventional Commits](https://www.conventionalcommits.org/)
```
<type>(<scope>): <imperative summary, ≤ 72 chars>

<why the change was made; anything a reviewer should know>

Signed-off-by: Your Name <you@example.com>
```
Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`.
Scopes: `bootstrap`, `workspace`, `menu`, `l10n`, `build`, `tests`, `docs`, …

**Sign your commits** (`git commit -s`) to certify the
[Developer Certificate of Origin](https://developercertificate.org/): you wrote the
change or have the right to submit it under the project license.

## Pull requests
- One concern per PR; link the feature spec and issue.
- Fill in the PR template: acceptance criteria, tests run (with output), manual checks,
  risks and open questions.
- CI must pass. The maintainer squash-merges.

## Specs and decisions
- Feature specs: `docs/features/NNN-name.md` from `_template.md`.
- Architecture decisions: `docs/decisions/NNNN-title.md` from `_template.md`.
  Significant changes (dependencies, storage, UI surfaces, public interfaces) need an
  accepted ADR first.

## Testing
- `npm test` — unit (`node:test`) and static checks. Never claim tests passed without running them.
- Manual checks in a **separate Zotero dev profile** — never your real library.
  See `docs/testing/manual/`.

## Dependencies
New dependencies need a justification in the PR: purpose, size, license (AGPL-compatible),
maintenance health, alternatives considered. Prefer platform and Node built-ins.

## Documentation
Update docs in the same PR as the code they describe. Record verified Zotero APIs in
`docs/zotero-api-notes.md` with source links.

## License
By contributing, you agree your contributions are licensed under AGPL-3.0-or-later.
