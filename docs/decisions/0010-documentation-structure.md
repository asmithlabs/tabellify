# ADR-0010: Documentation structure (README, wiki source, docs-writer)

- **Status:** Accepted (owner, 2026-11-12)
- **Date:** 2026-11-12
- **Deciders:** Antonio Smith (owner), Claude (orchestrator, drafted)

## Context
Tabellify needs documentation for two audiences: researchers who use the plugin (mostly not
programmers) and contributors. Until now there was only a scaffold README, `CONTRIBUTING.md`
and `docs/development.md`. GitHub wikis are easy to read but are a separate git repository
with no pull-request review, so edits there bypass the project's review process.

## Decision
- `README.md` stays short: what Tabellify is, compatibility, end-user installation, link to
  the wiki. Developer setup stays in `CONTRIBUTING.md` and `docs/development.md`.
- The full reference lives in `docs/wiki/` in this repository, written as GitHub wiki pages
  (`Home.md`, `_Sidebar.md`, hyphenated page names), with a user section and a developer
  section. `docs/wiki/` is the source of truth and is reviewed in PRs.
- `scripts/publish-wiki.sh` copies `docs/wiki/` into a local clone of
  `https://github.com/asmithlabs/tabellify.wiki.git` (in `build/wiki`) and commits there.
  Pushing the wiki always needs the owner's approval.
- A `docs-writer` agent (`.claude/agents/docs-writer.md`) writes only `README.md` and
  `docs/wiki/`, documents only behavior in code or approved specs (everything else is
  labeled "Planned"), and never invents UI labels.
- Workflow: docs-writer runs at the end of each feature, after reviewer and
  security-auditor, before the owner's combined manual test and the PR.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Edit the GitHub wiki directly | No sync step | No PR review; drifts from code; agents would push to a public site |
| All docs in README | One file | Too long for users; mixes user and developer content |
| Docs site generator (e.g. MkDocs) | Nicer site | New dependency and hosting; not needed yet |

## Consequences
- Docs changes are reviewed with the code that motivates them.
- The wiki repository only exists after the first wiki page is created on GitHub; the publish
  script fails until then.
- Publishing is a manual, owner-approved step; the wiki can lag the repo until published.
- Revisit if a docs site generator becomes worthwhile.
