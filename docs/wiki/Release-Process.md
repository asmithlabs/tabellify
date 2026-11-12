# Release Process

> **The release process is not defined yet.** No version of Tabellify has been released.
> This page lists only what exists today; everything else is marked **Planned**.

## What exists today

- **Version number** lives in `src/manifest.json` (`"version"`, currently `0.1.0`).
  `package.json` also carries `0.1.0`.
- **Build:** `npm run build` (`scripts/build-xpi.mjs`) zips `src/` into
  `build/tabellify-<version>.xpi`, using only Node built-ins. The build is deterministic
  (sorted entries, fixed timestamps).
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
- **CI** builds the XPI on every pull request but never publishes.

## Planned

- **Planned:** publishing `.xpi` files on
  [GitHub Releases](https://github.com/asmithlabs/tabellify/releases).
- **Planned:** creating and maintaining `updates.json` so Zotero can update Tabellify
  automatically.
- **Planned:** tagging scheme, versioning rules, and release checklist.
- **Planned:** publishing the wiki (`scripts/publish-wiki.sh` already exists; it commits to a
  local wiki clone and never pushes; pushing needs the maintainer's approval).
