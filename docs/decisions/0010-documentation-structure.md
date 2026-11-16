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

---

## Amendment 1: Publish to Wiki.js at wiki.asmithlabs.com/tabellify

- **Status of amendment:** Accepted (owner approved 2026-11-16; create and update only, no move or delete)
- **Date:** 2026-11-16
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)

The original decision above stays Accepted. This amendment changes only *where* the wiki is
published and *how*. It does not take effect until the owner accepts it.

### Context
On 2026-11-16 the owner decided:
- The documentation lives on the owner's self-hosted Wiki.js, "A Smith Labs Wiki", at
  `https://wiki.asmithlabs.com/tabellify` (pages such as `/tabellify/getting-started`),
  instead of the GitHub wiki.
- "The wiki should include the start up etc and the documentation should be on the wiki":
  installation and getting started are on the wiki; `README.md` stays short and links there.
- Pages are published from `docs/wiki/` through the Wiki.js API, using an API key that the
  owner creates and stores in a local file. The key is never printed, committed or sent
  anywhere except the wiki. Every publish needs the owner's OK.

The wiki runs **Wiki.js 2.x** (it serves GraphQL Playground at `/graphql` with subscriptions
at `/graphql-subscriptions`, which is the 2.x layout). Verified API facts, source links and
the remaining UNVERIFIED items are in [`docs/wikijs-api-notes.md`](../wikijs-api-notes.md).

### Decision (proposed)
1. **Host.** Published docs live at `https://wiki.asmithlabs.com/tabellify`. The GitHub wiki
   is not used. `docs/wiki/` stays the reviewed source of truth in the repository; edits are
   made in PRs, never in the Wiki.js editor.
2. **Publish script.** A new Node script `scripts/publish-wikijs.mjs` replaces
   `scripts/publish-wiki.sh` (which is retired: removed, with its references in `CLAUDE.md`,
   `.claude/agents/docs-writer.md`, `.claude/agents/orchestrator.md`, `docs/wiki/Architecture.md`
   and `docs/wiki/Release-Process.md` updated). The script:
   - uses only Node built-ins (`node:fs`, `node:path`, `node:os`, `node:child_process` for
     `git`, global `fetch`); **no new dependency**;
   - talks to the Wiki.js 2.x GraphQL endpoint `POST <WIKIJS_URL>/graphql` with
     `Authorization: Bearer <token>`;
   - is **dry-run by default**: it prints the list of pages it would create and update and
     writes nothing. It writes only when run with `--publish`, which the owner (or an agent
     with the owner's explicit OK for that publish) runs;
   - **never deletes** pages, never moves or renames them (it never sends a changed `path`
     or `locale` on update), and never calls `pages.delete`.
3. **Key file outside the repository.** The script reads `~/.config/tabellify/wikijs.env`
   (override with `--env <file>`), containing exactly:
   ```
   WIKIJS_URL=https://wiki.asmithlabs.com
   WIKIJS_TOKEN=<the API key>
   WIKIJS_LOCALE=en
   ```
   The file must be mode `600` (owner read/write only); the script refuses to run if the
   file is readable by group or others, or if the file lies inside the repository. The token
   is not read from command-line arguments (they show up in shell history and `ps`).
4. **File name to wiki path.** Lower-case the file name without `.md`:
   | File | Wiki path |
   |---|---|
   | `Home.md` | `tabellify` |
   | `Getting-Started.md` | `tabellify/getting-started` |
   | `Data-Safety-and-Privacy.md` | `tabellify/data-safety-and-privacy` |
   | any other `Name-With-Hyphens.md` | `tabellify/name-with-hyphens` |
   | `_Sidebar.md` | **not published** (recommended; see below) |
   Files whose name starts with `_` are never published. The script refuses a slug that
   contains `.`, spaces, `\` or `//` (Wiki.js rejects those paths).
5. **Sidebar (recommendation).** Do not publish `_Sidebar.md`. Wiki.js 2.x navigation is
   site-wide (it would affect the whole A Smith Labs Wiki), and changing it through the API
   needs extra permissions the key should not have. `Home.md` already lists every page, so
   it serves as the Tabellify table of contents. Optionally the owner adds one "Tabellify"
   link to the wiki navigation by hand, once. `_Sidebar.md` stays in the repo as the
   reviewed page order, and the script warns if a page is listed in `_Sidebar.md` but not
   in `Home.md`, or the other way round.
6. **Page content transformation** (applied in memory, files in `docs/wiki/` are not changed):
   - **Title:** the first `# ` heading becomes the Wiki.js page title and is removed from
     the body (Wiki.js shows the title itself, so it would appear twice).
   - **Description:** the first plain paragraph, trimmed to one sentence (Wiki.js requires a
     description; it is shown under the title).
   - **Links:** GitHub-wiki links `](Page-Name)` and `](Page-Name#anchor)` become
     `](/tabellify/page-name)` and `](/tabellify/page-name#anchor)`; `](Home)` becomes
     `](/tabellify)`. Same-page links `](#anchor)`, full `https://` links and `mailto:` are
     left alone. This is required: Wiki.js resolves a link without a leading `/` relative to
     the current page, so `(Workspace)` on `tabellify/getting-started` would point to
     `/tabellify/getting-started/Workspace`.
   - The script fails (no publish) if a rewritten link targets a page that does not exist
     in `docs/wiki/`.
   - Pages get `editor: "markdown"`, `isPublished: true`, `isPrivate: false`,
     `tags: ["tabellify"]`, locale from `WIKIJS_LOCALE`.
7. **Dry run output.** With the least-privilege key the API cannot return page content
   (Wiki.js 2.x requires `manage:pages`/`delete:pages` for `pages.single`/`singleByPath`;
   see the notes file, section 3). So the dry run shows, per page: `CREATE` or `UPDATE`,
   the wiki path, the title, and the size; plus `git diff --stat <last-published>..HEAD --
   docs/wiki` when a last-published commit is recorded. The script records the published
   commit SHA and time in `build/wikijs-last-publish.json` (gitignored) after a successful
   publish. It warns `EDITED IN WIKI` when a remote page's `updatedAt` is later than the
   recorded publish time (someone edited in the Wiki.js editor; publishing would overwrite
   that edit; Wiki.js keeps page history).
8. **Publish only from a clean `main`.** With `--publish`, the script refuses to run unless
   the current branch is `main`, `git status --porcelain` is empty, and `HEAD` equals
   `origin/main` after `git fetch` (read-only). Dry runs work on any branch.
9. **Security.**
   - **Least privilege:** the key belongs to a dedicated Wiki.js group with only
     `read:pages` + `write:pages`, and one page rule allowing those on paths starting with
     `tabellify`. Not "Full Access" (Full Access = administrator of the whole wiki).
     Expiration 90 days; the owner revokes and recreates it when it expires or leaks.
   - **HTTPS only:** the script refuses a `WIKIJS_URL` that does not start with `https://`,
     and calls `fetch` with `redirect: "error"` so the token is never sent to another host.
   - **Token never logged:** the token is never printed, never written to `build/` files,
     and is removed from any error text before it is shown. Debug output prints request
     names (for example `pages.update id=12`), never headers.
   - The key file and its location are documented in `docs/development.md` (developer task),
     never in the public wiki pages.
10. **Workflow change.** docs-writer still writes `docs/wiki/` and `README.md` only. After a
    release PR is merged, the orchestrator runs the dry run, shows the owner the list, and
    runs `--publish` only after the owner says yes for that publish.

### Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Keep the GitHub wiki (original ADR) | Already scripted; no API key | Owner wants docs on own site; GitHub wiki has no review either |
| Wiki.js Git storage module (Wiki.js syncs pages from a Git repo) | No API key; Wiki.js pulls itself | Syncs a whole repo/branch into the whole wiki; file layout and paths must match Wiki.js's format; the wiki server needs repo credentials; harder for a learner to reason about |
| Copy-paste pages by hand in the Wiki.js editor | No script, no key | 20 pages per release; error-prone; links must be fixed by hand |
| Key with "Full Access" | Simplest; can read content for a true diff | Administrator of the entire wiki if leaked |
| Group key plus `manage:pages` + `delete:pages` on `tabellify` (to read content for a diff) | Real content diff in dry run | Key could move/rename/delete Tabellify pages; more than needed |
| Bash script with `curl` | Matches old script | JSON escaping of Markdown in Bash is fragile; token can leak via `ps` |

### Consequences
- One source (`docs/wiki/`, reviewed in PRs), one public site, and README links to it.
- New secret to manage (the API key file); expiry means the owner recreates the key every
  90 days.
- The dry run cannot show a line-by-line diff of remote content; it relies on the git diff
  since the last publish.
- **Maintenance risk:** Wiki.js 3.x (stable since 2026-11-01) replaces the GraphQL API. If
  wiki.asmithlabs.com is upgraded, the script's small API layer (list, create, update) must
  be rewritten and this amendment revisited.
- Pages created by the API show the wiki's admin user (id 1) as author (Wiki.js 2.x runs API
  calls as user id 1).
- Follow-up tasks (developer): write `scripts/publish-wikijs.mjs` with unit tests for the
  pure parts (file-to-path mapping, link rewriting, title/description extraction) in
  `node:test`; remove `scripts/publish-wiki.sh`; update `README.md`, `CLAUDE.md`, agent files,
  `.github/ISSUE_TEMPLATE/bug_report.md` and the `docs/wiki/` pages that mention the GitHub
  wiki.
