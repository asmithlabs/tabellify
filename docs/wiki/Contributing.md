# Contributing

The full rules are in
[CONTRIBUTING.md](https://github.com/asmithlabs/tabellify/blob/main/CONTRIBUTING.md) and
[CLAUDE.md](https://github.com/asmithlabs/tabellify/blob/main/CLAUDE.md). They apply to human
and AI-agent contributors alike. Short version:

- **Start with an issue.** Features are specified in `docs/features/` before implementation;
  significant changes (dependencies, storage, UI surfaces, public interfaces) need an
  accepted ADR first.
- **Set up a dev profile.** Never develop against your real Zotero library:
  [docs/development.md](https://github.com/asmithlabs/tabellify/blob/main/docs/development.md).
- **Branches:** `<type>/<short-kebab-description>` from `main`, e.g. `feat/002-workspace-tab`.
- **Commits:** Conventional Commits, signed off for the DCO (`git commit -s`).
- **Pull requests:** one concern per PR; fill in the PR template (acceptance criteria, tests
  run with output, manual checks, risks). CI must pass. The maintainer squash-merges.
- **Never invent Zotero APIs:** record each one in `docs/zotero-api-notes.md` with a source
  link (see [Zotero APIs Used](Zotero-APIs-Used)).
- **Protect library data:** no code that writes to the library unless a spec authorizes it.
- **Lifecycle symmetry:** see [Plugin Lifecycle](Plugin-Lifecycle).
- **No new dependencies** without written justification and maintainer approval.
- **Docs:** update docs in the same PR as the code. Wiki pages are edited in `docs/wiki/`,
  not on the wiki itself (ADR-0010).
- **Security issues:** report privately, see
  [SECURITY.md](https://github.com/asmithlabs/tabellify/blob/main/SECURITY.md).

By contributing you agree your contributions are licensed under AGPL-3.0-or-later.
