# ADR-0020: Release and update integrity (update_hash, immutable releases, manual reproducible build)

- **Status:** Proposed
- **Date:** 2026-11-15
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)

## Context
Tabellify runs as privileged code inside Zotero. The pre-release security audit (finding
SEC-001, high, release gate) points out that **Zotero does not check plugin signatures**:
Zotero 10.0.9 sets `xpinstall.signatures.required` to `false` and its build turns off
`MOZ_REQUIRE_SIGNING` (see `docs/zotero-api-notes.md`, release rows). So the only thing that
decides what code an installed copy of Tabellify runs after an update is:

1. the update manifest at `update_url`
   (`https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json`), and
2. the `.xpi` file that manifest points to (`update_link`).

Whoever can change either one can ship code to every user. Facts this ADR relies on (sources
in `docs/zotero-api-notes.md` and the links below):

- **`update_hash` is honoured.** Firefox ESR 140 (Zotero 10's platform) compares the SHA-256 of
  the downloaded file with `update_hash`; on a mismatch the download fails
  (`ERROR_INCORRECT_HASH`), the temporary file is deleted, and nothing is installed. Zotero's
  build does not change this code. The update must also have the same plugin ID and the exact
  `version` listed in the manifest.
- **`update_hash` is optional** in Firefox for `https:` links, so it only protects us if we
  always write it.
- **GitHub immutable releases** (generally available since 2025-10-28): once a release is
  published, "Release assets cannot be modified or deleted" and "Git tags cannot be moved";
  a deleted immutable release's tag name cannot be reused; publishing creates a release
  attestation that `gh release verify` / `gh release verify-asset` can check. It only applies
  to releases published **after** it is turned on. Title and notes stay editable.
  [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases),
  [Preventing changes to your releases](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes),
  [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository),
  [Verifying the integrity of a release](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verifying-the-integrity-of-a-release),
  [changelog](https://github.blog/changelog/2025-10-28-immutable-releases-are-now-generally-available/).
- **Tag rulesets** can restrict creating, updating (moving) and deleting tags matching an
  `fnmatch` pattern such as `v*`, and block force pushes.
  [Available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
  [Creating rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).
- **Release asset URLs contain the tag**:
  `https://github.com/OWNER/REPO/releases/download/TAG/FILE` (GitHub REST example
  `browser_download_url`: `https://github.com/octocat/Hello-World/releases/download/v1.0.0/example.zip`,
  [release assets API](https://docs.github.com/en/enterprise-server@3.22/rest/releases/assets)).
  The `releases/latest/download/…` form ([Linking to releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases))
  changes meaning with every release and must not be used in `updates.json`.
- Already in place (audit): `main` ruleset (PR + `test-and-build` required, no force push, no
  deletion, no bypass), organization 2FA, a single admin, CI token read-only.
- The build (`scripts/build-xpi.mjs`) is deterministic: same files + same Node/zlib → same
  bytes.

## Decision
1. **Every `updates.json` entry has `update_hash: "sha256:<lower-case hex>"`** of the exact
   published `.xpi`, and an `update_link` to a **versioned** release asset
   `https://github.com/asmithlabs/tabellify/releases/download/vX.Y.Z/tabellify-X.Y.Z.xpi`.
   Never `releases/latest/…`, never a branch URL. The `version` is copied from
   `src/manifest.json`.
2. **`updates.json` lives at the repository root on `main`** (the URL already in
   `src/manifest.json`) and changes only through a pull request, after the release is
   published and its hash checked.
3. **Immutable releases are enabled** for the repository before v0.1.0 is published.
   Releases are created as a **draft**, the `.xpi` is attached, then published (so the file
   is locked from the moment it is public).
4. **A tag ruleset protects `v*`**: restrict updates, restrict deletions, block force pushes,
   with **no bypass list**. Restrict creations stays off (the owner is the only person with
   write access, and turning it on would need a bypass entry for the owner). See
   alternatives.
5. **Tags are annotated** (`git tag -a vX.Y.Z`) on a commit on `main` that has passed CI.
6. **The release `.xpi` is built by hand from a clean checkout of the tag** (`npm test`,
   `npm run build`), and its SHA-256 must equal a second, independent build (CI's printed
   hash, or a second clean clone) before anything is published. The hash goes in the release
   notes and in `updates.json`.
7. **No release workflow in CI for now.** CI keeps `permissions: contents: read`; no CI job
   gets a token that can create releases or push.
8. The step-by-step procedure is `docs/release-checklist.md`; the wiki page
   `docs/wiki/Release-Process.md` summarizes it. Tagging, pushing the tag, publishing the
   release, merging `updates.json` and changing GitHub settings each need the owner's
   explicit approval (CLAUDE.md rule 6).

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| **Chosen:** manual build from clean tag + hash compare; immutable release; `update_hash` | No write token in CI; simple; two independent builds catch a tampered machine or wrong checkout | Manual steps; owner must follow the checklist carefully |
| CI release workflow (on tag push: build, create release, upload) | Fewer manual steps; build runs on a clean machine | Needs `contents: write` in CI, so a compromised action or workflow change could publish code; more YAML to secure (pinning, environments, approvals). Revisit when releases are frequent |
| Rely on `https:` only (no `update_hash`) | One less field | A replaced asset installs silently; Zotero has no signature check to catch it |
| Host the `.xpi` in the repository (`main`) | One place | Branch files change; history rewrites; large binaries in git |
| Tag ruleset with **Restrict creations** + owner (admin role) on the bypass list | Nobody else could create a `v*` tag | A bypass applies to every rule in that ruleset, so the admin could also move/delete tags (avoidable with a second ruleset for creations only, which is more to maintain); there is only one writer today |
| Tag ruleset with no rules, relying on immutable releases only | Fewer settings | Tags are unprotected until the release is published, and for tags without a release |
| Sign tags (`git tag -s`) | Proves who tagged | Needs GPG/SSH signing set up; Zotero never checks it. Optional later |

## Consequences
- A swapped or modified release file fails to install (hash mismatch) instead of running.
- A bad `updates.json` needs a reviewed PR to `main`; the `main` ruleset and CI apply. The
  remaining single point of trust is the owner's GitHub account (2FA already required).
- An immutable release cannot be fixed by replacing the file: a broken release means a new
  version number (for example 0.1.1). A deleted immutable release's tag name cannot be reused.
- A mistaken `v*` tag cannot be moved or deleted unless the owner temporarily disables the
  tag ruleset (a settings change, which needs owner action anyway).
- Determinism depends on the Node/zlib version; the checklist records `node --version` and
  builds with the same major version as CI (22).
- Follow-ups (developer tasks, need approval): print `sha256sum` of the XPI in CI (one
  `run:` line in `.github/workflows/ci.yml`); optional static test that validates
  `updates.json` (ID, versioned `update_link`, `sha256:` + 64 hex).
- Revisit when: releases become frequent (consider a CI release job with an approval
  environment), Zotero starts checking signatures, or a second maintainer joins (consider
  Restrict creations with a team bypass).
