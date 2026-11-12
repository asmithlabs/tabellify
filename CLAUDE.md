# Tabellify — project instructions

Tabellify is a Zotero plugin that turns curated tags into structured literature tables
(synthesis matrices) for organizing, comparing, and exporting research findings.

The human owner is the **technical lead and product owner**. Agents augment the owner's
work; they do not make product-scope or architecture decisions. The owner is learning
JavaScript and Zotero plugin development — explain non-obvious concepts briefly.

## Ground truth (read before working)
- Product scope and vision: `docs/product-requirements.md` (sketches in `docs/product/sketches/`)
- Architecture: `docs/architecture.md`
- Decisions: `docs/decisions/` — ADRs with `Status: Accepted` are binding
- Current work: the feature spec in `docs/features/` named in the task
- Verified Zotero APIs: `docs/zotero-api-notes.md` (every entry has a source link)
- Contribution standards (branches, commits, PRs): `CONTRIBUTING.md`

## Non-negotiable rules
1. **Never invent Zotero APIs.** Before using any `Zotero.*`, `Services.*`, `ChromeUtils.*`,
   or window/XUL API, confirm it in official docs (zotero.org/support/dev/…) or Zotero source,
   and record it in `docs/zotero-api-notes.md` with the link and Zotero versions checked.
   If you cannot verify it, stop and say so.
2. **Never modify files outside the task's stated scope.**
3. **No new dependency without written justification** (what, why, size, license, alternatives),
   and owner approval. Prefer the platform and Node built-ins.
4. **Small, independently testable changes.** One concern per commit.
5. **Never claim tests passed unless you ran them in this session.** Paste the command and output.
6. **Never push, merge, tag, release, or publish** without explicit owner approval.
7. **Architectural changes need an ADR** (`Status: Proposed`) and owner approval before
   implementation: new subsystems, storage formats, dependencies, public interfaces, UI surfaces.
8. **Protect Zotero library data.** Plugin code must not create, modify, or delete items,
   collections, attachments, annotations, tags, or database rows unless a feature spec
   explicitly authorizes it. Reading is fine. Never access `~/Zotero` or the owner's real
   Zotero profile; development and testing use the dedicated dev profile only.
9. **Lifecycle symmetry.** Everything added in `startup()` / `onMainWindowLoad()` must be
   removed in `shutdown()` / `onMainWindowUnload()`.
10. **Document uncertainty.** Record open questions in the spec, ADR, or PR — don't guess.

## Technical baseline (see ADRs 0002–0004, 0008)
- Zotero compatibility: `strict_min_version` 10.0, `strict_max_version` 10.0.* (raised per release after testing).
  Owner runs Zotero 10.0.9. Use Zotero 10 APIs (e.g. plural selection getters
  `getSelectedCollections()`); older-version examples online may be wrong for 10.
- Plugin ID: `tabellify@asmithlabs.com` (permanent). Preference prefix: `extensions.tabellify.`
- Plain modern JavaScript (ES2022+), strict mode, no bundler. JSDoc for types.
- Zotero 8+ platform: ESM modules, standard Promises (no Bluebird methods, no `Zotero.spawn`).
- `src/` is the plugin root and is zipped as-is into the `.xpi`.
- Pure logic lives in `src/modules/` and must not reference Zotero globals (so Node can test it).
- All user-visible strings go through Fluent (`src/locale/en-US/tabellify.ftl`), IDs prefixed `tabellify-`.
- Workspace UI for Feature 001 is a separate chrome window opened from a menu item.

## Commands (available once Feature 001 T2 lands)
- `npm test` — unit (`node:test`) + static checks
- `npm run build` — produce `build/tabellify-<version>.xpi`
- Manual verification: `docs/testing/manual/<feature>.md`, performed by the owner in the Zotero dev profile

## Agent workflow
- The main session runs as `orchestrator` (`claude --agent orchestrator`). Specialists:
  `architect`, `developer`, `tester`, `reviewer` (see `.claude/agents/`).
- Flow per feature (from Feature 002 on): spec + ADRs (architect) → owner approval →
  task plan (orchestrator, part of the spec) → developer → tester → reviewer, run **back to
  back without stopping** → **one combined owner manual test** at the end of the feature →
  PR (owner approves push) → owner merges.
- Stop for the owner only for decisions that need the owner (see "Always escalate" in
  `.claude/agents/orchestrator.md`) and for the combined manual test. Review findings that
  stay within the approved spec are fixed (developer → tester → reviewer again) without
  stopping.
- Zotero Debug Output for manual tests is captured from launch into `build/debug-N.txt`
  (gitignored), e.g. `zotero -P tabellify-dev -ZoteroDebugText > build/debug-1.txt`; the
  orchestrator reads the file itself instead of asking the owner to copy log lines.
- Parallelize only tasks with non-overlapping file scopes; use worktree isolation for them.
  Worktrees branch from `main`, so a task cannot build on unmerged work.
- **Owner instructions (standing rule):** When the owner must do something, give numbered
  steps. Each step names the exact app and window (e.g. "the dev Zotero window", "the Claude
  Code session in Terminal"), the exact menu path or button label, and the exact text to
  paste in a code block. Say what the owner should see when the step works. Never use "it"
  or "this" for a file, window, app, or check — name the thing every time. Explain any term
  the owner hasn't seen before in one sentence.
