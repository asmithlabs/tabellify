# Release Process

> **No version of Tabellify has been released yet.** The release procedure below is
> **Accepted** in ADR-0020 (2026-11-16). The step-by-step
> list is [`docs/release-checklist.md`](https://github.com/asmithlabs/tabellify/blob/main/docs/release-checklist.md).

## What exists today

- **Version number** lives in `src/manifest.json` (`"version"`, currently `0.1.0`).
  `package.json` also carries `0.1.0`.
- **Build:** `npm run build` (`scripts/build-xpi.mjs`) zips the git-tracked files in `src/`
  into `build/tabellify-<version>.xpi`, using only Node built-ins. The build is deterministic
  (sorted entries, fixed timestamps): the same commit built with the same Node version gives a
  byte-identical file, so two builds can be compared by their SHA-256 hash.
- **Update URL:** `src/manifest.json` sets
  `update_url` to `https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json`.
  Zotero requires this field. The `updates.json` file does not exist yet, so Zotero's update
  check currently gets an HTTP 404.
- **Compatibility:** `strict_max_version` is `10.0.*` and is raised only after testing against
  each new Zotero release (ADR-0008).
- **Approval:** pushing, merging, tagging, releasing and publishing always need the
  maintainer's explicit approval (CLAUDE.md rule 6). Only the maintainer releases (ADR-0007).
- **Security:** a full security audit runs before every release (ADR-0011). Fixed security
  issues are summarized in the [Changelog](Changelog).
- **CI** runs the tests and builds the XPI on every pull request and on `main`, with a
  read-only token. CI never publishes.

## Why the update path needs protecting

Zotero does not check plugin signatures. An installed Tabellify updates itself from whatever
`updates.json` on `main` points to. So the release process protects two things: who can
change `updates.json`, and whether the downloaded file is exactly the one that was released.
Zotero (through its Firefox platform) checks the `update_hash` written in `updates.json`
against the downloaded file and refuses to install it if they differ. Sources:
`docs/zotero-api-notes.md` (release rows).

## Release process (ADR-0020, accepted 2026-11-16)

- GitHub **immutable releases** turned on for the repository, so a published
  release's files and tag can never be changed or deleted.
- a GitHub **tag ruleset** for `v*` tags: they cannot be moved, deleted or
  force-pushed.
- each release gets an annotated tag `vX.Y.Z` on a `main` commit that passed CI.
- the release `.xpi` is built by hand from a clean copy of the tag, and its
  SHA-256 must match a second independent build (CI) before anything is published.
- the `.xpi` is attached to a draft GitHub release, checked, then published
  (published = locked).
- `updates.json` (repository root, on `main`, changed only through a pull request)
  lists each version with `update_link` pointing to the versioned release file
  (`https://github.com/asmithlabs/tabellify/releases/download/vX.Y.Z/tabellify-X.Y.Z.xpi`)
  and `update_hash` (`sha256:` + the file's hash).
- no release workflow in CI for now, so no CI job holds a token that can
  publish.
- after each release, the maintainer installs the published file in the dev
  profile and runs **Tools → Plugins → gear → Check for Updates**.

## Planned

- **Planned:** publishing the wiki (`scripts/publish-wiki.sh` already exists; it commits to a
  local wiki clone and never pushes; pushing needs the maintainer's approval).
