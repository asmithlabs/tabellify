# Release checklist (v0.1.0)

This is the step-by-step procedure for publishing Tabellify **v0.1.0**. It implements
ADR-0020 (**Proposed**; follow this checklist only after the owner accepts ADR-0020) and closes
pre-release security finding SEC-001. Later releases use the same steps with the new version
number (see "Later releases" at the end).

**Why these steps matter.** Zotero does not check plugin signatures. The only protections
for users' updates are: (1) `updates.json` on `main` can only change through a reviewed pull
request, (2) each entry in `updates.json` carries the SHA-256 hash of the exact `.xpi`, which
Zotero checks before installing (a wrong file fails to install), and (3) the `.xpi` is attached
to an **immutable** GitHub release, so the file and its tag can never be swapped. Sources:
`docs/zotero-api-notes.md` (release rows) and ADR-0020.

**Terms used below**
- **SHA-256 hash**: a 64-character fingerprint of a file. Any change to the file gives a
  completely different hash.
- **Annotated tag**: a named, permanent label on one commit (here `v0.1.0`), with a message
  and the tagger's name.
- **Immutable release**: a GitHub release whose files and tag cannot be changed or deleted
  once published.
- **Ruleset**: a GitHub repository rule that blocks certain actions on matching branches or
  tags.
- **`gh`**: GitHub's command-line tool. Every `gh` step also has a browser alternative.

**Approval markers.** Steps marked **[OWNER APPROVAL]** change something on GitHub or create a
permanent record. Agents never do them without the owner's explicit "yes" for that step
(CLAUDE.md rule 6). Steps marked **[OWNER]** are done by the owner personally (browser
settings, Zotero).

Write the values you collect here as you go (in your own notes, not in a commit):
- `H_LOCAL` = hash of the clean-checkout build (Part B)
- `H_CI` = hash printed by CI (Part B)
- `NODE` = output of `node --version` used for the build

---

## Part 0: Before release day

- [ ] **0.1 [OWNER]** ADR-0020 is marked Accepted by the owner.
- [ ] **0.2** The full pre-release security audit has no open critical or high finding other
  than SEC-001 (which this checklist closes). The owner's decision on SEC-003 is recorded.
- [ ] **0.3** Version numbers agree: `src/manifest.json` `"version"` is `0.1.0`,
  `package.json` `"version"` is `0.1.0`, and `CHANGELOG.md` has a `0.1.0` entry.
  `src/manifest.json` has `"strict_max_version": "10.0.*"` and
  `"update_url": "https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json"`.
- [ ] **0.4 (recommended)** CI prints the XPI's SHA-256. This is a one-line developer change
  to `.github/workflows/ci.yml` (a step after "Build XPI" that runs `sha256sum build/*.xpi`),
  done in its own PR. Without it, use the fallback in step B5.
- [ ] **0.5** All release-prep work is merged into `main`, and the CI check `test-and-build`
  is green on the newest `main` commit (GitHub → the repository → **Actions** tab → the run
  for that commit shows a green tick).

## Part A: GitHub settings (once, before the first release) [OWNER]

These are done in a web browser, signed in to GitHub as the repository admin.

1. **Turn on immutable releases [OWNER APPROVAL].**
   In the browser, open `https://github.com/asmithlabs/tabellify`. Click **Settings** (top
   bar; if hidden, open the **…** menu first). On the **General** page, scroll down to the
   **Releases** section and tick **Enable release immutability**.
   *What you should see:* the box stays ticked after a page reload.
   *Note:* this only protects releases published **after** it is turned on, so it must be
   done before Part C. Alternative for all repositories of the organization: open
   `https://github.com/asmithlabs` → **Settings** → in the left sidebar under "Code, planning,
   and automation" open **Repository** → **General** → **Releases** section → change the
   **No policy** dropdown to **All repositories**.
   ([GitHub docs](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes))

2. **Create a tag ruleset for `v*` [OWNER APPROVAL].**
   In the browser, open `https://github.com/asmithlabs/tabellify` → **Settings** → in the left
   sidebar under "Code, planning, and automation" open **Rules** → **Rulesets** → **New
   ruleset** → **New tag ruleset**. Then:
   - **Ruleset name:** `protect-release-tags`
   - **Enforcement status:** **Active**
   - **Bypass list:** leave empty.
   - **Target tags:** **Add a target** → include by pattern → type `v*`.
   - **Rules:** tick **Restrict updates**, **Restrict deletions**, **Block force pushes**.
     Leave **Restrict creations** unticked (with it on, nobody could create `v0.1.0`,
     because the bypass list is empty; see ADR-0020 alternatives).
   - Click **Create**.
   *What you should see:* `protect-release-tags` appears in the Rulesets list as Active.
   ([available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
   [creating rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository))
   *Labels note:* GitHub's docs describe the sidebar entry as "Rulesets" under "Code,
   planning, and automation"; if the sidebar shows it without a **Rules** group, click
   **Rulesets** directly.

3. **Check both settings from the Terminal (read-only).**
   In the Terminal window, run:
   ```sh
   gh api repos/asmithlabs/tabellify/immutable-releases
   gh api "repos/asmithlabs/tabellify/rulesets?targets=tag"
   ```
   *What you should see:* the first command prints `"enabled":true` (an HTTP 404 error means
   immutable releases are **not** on). The second lists `protect-release-tags` with
   `"target":"tag"` and `"enforcement":"active"`.
   ([immutable-releases API](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository),
   [rulesets API](https://docs.github.com/en/rest/repos/rules#get-all-repository-rulesets))

## Part B: Tag and reproducible build

All commands run in the Terminal window, starting in the tabellify project folder.

1. **Update `main` and check it is clean.**
   ```sh
   git switch main
   git pull --ff-only
   git status --short
   git log -1 --oneline
   ```
   *What you should see:* `git status --short` prints nothing. The commit shown by `git log`
   is the one with the green `test-and-build` run from step 0.5.

2. **Create the annotated tag (local only) [OWNER APPROVAL].**
   ```sh
   git tag -a v0.1.0 -m "Tabellify 0.1.0"
   git show --no-patch v0.1.0
   ```
   *What you should see:* `tag v0.1.0`, your name as Tagger, the message, then the same
   commit as in step B1. Nothing is on GitHub yet; a local tag can still be deleted with
   `git tag -d v0.1.0`.

3. **Build from a clean copy of the tag.** A clean copy contains only committed files, so a
   stray file in your working folder cannot change the result.
   ```sh
   RELDIR="$(mktemp -d)/tabellify"
   git clone --quiet --branch v0.1.0 . "$RELDIR"
   cd "$RELDIR"
   node --version
   npm test
   npm run build
   shasum -a 256 build/tabellify-0.1.0.xpi
   ```
   *What you should see:* `node --version` prints `v22.` something (CI uses Node 22; a
   different major version may compress differently and give a different hash). `npm test`
   reports `fail 0` in its summary at the end. The build prints `Built build/tabellify-0.1.0.xpi`. The last line is
   a 64-character hash followed by the file name: that hash is `H_LOCAL`. Note `NODE` too.
   Keep this Terminal window open: `$RELDIR` is used again in Part C.

4. **Compare with CI.** In the browser, open the repository → **Actions** → the
   `test-and-build` run for the tagged commit → the step that prints the SHA-256 (from
   step 0.4).
   *What you should see:* the hash in the CI log equals `H_LOCAL`, character for character.
   That value is `H_CI`.

5. **Fallback if CI does not print a hash yet:** build the working folder too and compare.
   ```sh
   cd -
   npm run build
   shasum -a 256 build/tabellify-0.1.0.xpi
   ```
   *What you should see:* the same hash as `H_LOCAL`. (This is weaker than the CI comparison:
   both builds ran on your Mac.)

   **If any two hashes differ: stop.** Do not push the tag. Check that both builds used the
   same commit (`git log -1`) and the same Node major version, and ask the orchestrator to
   investigate.

6. **Push the tag [OWNER APPROVAL].**
   ```sh
   git push origin v0.1.0
   ```
   *What you should see:* `* [new tag]         v0.1.0 -> v0.1.0`. From now on the tag ruleset
   (Part A step 2) stops anyone from moving or deleting `v0.1.0`.

## Part C: GitHub release (immutable)

1. **Create a draft release with the clean `.xpi` [OWNER APPROVAL].** In the Terminal window
   from step B3, run (replace `H_LOCAL` with the hash):
   ```sh
   cd "$RELDIR"
   gh release create v0.1.0 build/tabellify-0.1.0.xpi --draft --verify-tag --title "Tabellify 0.1.0" --notes "First public release. Requires Zotero 10.0. Install: download tabellify-0.1.0.xpi, then in Zotero choose Tools → Plugins and drag the file onto the Plugins window. SHA-256 of tabellify-0.1.0.xpi: H_LOCAL. See CHANGELOG.md for details."
   ```
   `--draft` keeps the release private until you publish it; `--verify-tag` makes `gh` stop
   if `v0.1.0` is not on GitHub (instead of creating a new tag from `main`).
   ([gh release create](https://cli.github.com/manual/gh_release_create))
   *What you should see:* a URL to the draft release.
   *Browser alternative:* repository → **Releases** → **Draft a new release** → **Choose a
   tag** → `v0.1.0` → title and notes as above → attach `tabellify-0.1.0.xpi` from the
   `$RELDIR/build` folder → **Save draft**.

2. **Check the draft [OWNER].** In the browser, open the draft from step C1.
   *What you should see:* tag `v0.1.0`, exactly one attached file `tabellify-0.1.0.xpi`, the
   hash in the notes equals `H_LOCAL`. Immutable releases lock the files at publish time, so
   anything wrong must be fixed **now** (edit the draft, or delete the draft and start C1
   again).

3. **Publish [OWNER APPROVAL].** On the draft page, click **Publish release**.
   *What you should see:* the release page shows a lock icon with the label **Immutable**
   just below the release author.

4. **Verify the published file (read-only).** In the Terminal window, run:
   ```sh
   gh release verify v0.1.0
   gh release verify-asset v0.1.0 "$RELDIR/build/tabellify-0.1.0.xpi"
   DL="$(mktemp -d)"
   curl -fsSL -o "$DL/tabellify-0.1.0.xpi" https://github.com/asmithlabs/tabellify/releases/download/v0.1.0/tabellify-0.1.0.xpi
   shasum -a 256 "$DL/tabellify-0.1.0.xpi"
   echo "$DL"
   ```
   *What you should see:* both `gh release verify` commands report success; the downloaded
   file's hash equals `H_LOCAL`. Keep the folder printed by `echo "$DL"`: Part E installs that
   downloaded file.
   ([verifying a release](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verifying-the-integrity-of-a-release))

## Part D: `updates.json` via pull request

1. **Write `updates.json`** (developer or orchestrator, on a new branch from `main`, e.g.
   `release/updates-json-v0.1.0`). The file sits at the repository root. Replace `H_LOCAL`
   with the hash (64 lower-case hex characters, no spaces):
   ```json
   {
     "addons": {
       "tabellify@asmithlabs.com": {
         "updates": [
           {
             "version": "0.1.0",
             "update_link": "https://github.com/asmithlabs/tabellify/releases/download/v0.1.0/tabellify-0.1.0.xpi",
             "update_hash": "sha256:H_LOCAL",
             "applications": {
               "zotero": {
                 "strict_min_version": "10.0",
                 "strict_max_version": "10.0.*"
               }
             }
           }
         ]
       }
     }
   }
   ```
   Rules (ADR-0020): `version` copied exactly from `src/manifest.json` (Zotero refuses an
   update whose file has a different version); `update_link` uses `releases/download/v…/`,
   never `releases/latest/`; `update_hash` always present.
   Check that the file is valid JSON:
   ```sh
   node -e 'JSON.parse(require("node:fs").readFileSync("updates.json", "utf8")); console.log("valid JSON")'
   ```
   *What you should see:* `valid JSON`.

2. **Push, open the PR, merge [OWNER APPROVAL for push and for merge].** The `main`
   ruleset requires the PR and a green `test-and-build`. Before merging, the owner compares
   the `update_hash` in the PR diff with `H_LOCAL`.

3. **Check what Zotero will download (read-only).** A few minutes after the merge, in the
   Terminal window, run:
   ```sh
   curl -fsSL https://raw.githubusercontent.com/asmithlabs/tabellify/main/updates.json
   ```
   *What you should see:* the JSON from step D1 with `H_LOCAL`. (If it shows an older
   version or a 404, wait a few minutes: raw.githubusercontent.com caches files.)

## Part E: Install and update check in the dev profile [OWNER]

Use the **dev profile only**, never your real Zotero profile.

1. **Start the dev Zotero with Debug Output captured.** Quit Zotero if it is running. In
   the Terminal window, in the tabellify project folder, run (use the next free number for
   `N`):
   ```sh
   /Applications/Zotero.app/Contents/MacOS/zotero -P tabellify-dev -ZoteroDebugText > build/debug-N.txt
   ```
   *What you should see:* the dev Zotero window opens.

2. **Install the released file.** In the dev Zotero window choose **Tools → Plugins**. In
   the Plugins window click the gear button (tooltip "Tools for all plugins") → **Install
   Plugin From File…** and pick `tabellify-0.1.0.xpi` in the folder printed in step C4 (the
   file downloaded from GitHub, **not** `build/`).
   *What you should see:* Tabellify 0.1.0 is listed and enabled; no error dialog.

3. **Run the update check.** In the same Plugins window click the gear button → **Check for
   Updates**.
   *What you should see:* the message **No updates found** (the manifest lists only 0.1.0,
   which is installed). A different message or an error means the manifest could not be read
   or parsed: tell the orchestrator.

4. **Smoke test.** Open the Tabellify workspace from its menu item in the dev Zotero window.
   *What you should see:* the workspace tab opens as in earlier smoke tests.

5. **Quit the dev Zotero** and tell the orchestrator the `build/debug-N.txt` file name. The
   orchestrator reads that file for errors mentioning the update check or Tabellify.

## Part F: Close out

- [ ] Orchestrator records SEC-001 as fixed in `build/security/` and summarizes the fix in
  `CHANGELOG.md` (ADR-0011).
- [ ] The full end-to-end update test (an installed 0.1.0 actually updating, and a wrong hash
  being refused) happens with the first later release; see below.

## Later releases (0.1.1 and up)

Same Parts B–E with the new version, plus:
- **Add** a new object to the `updates` array; keep the old entries (each with its own hash).
- Before merging the new `updates.json`, keep Tabellify 0.1.0 installed in the dev profile.
  After the merge, **Check for Updates** must offer the new version and install it; the
  Plugins window then shows the new version number.
- Raising Zotero compatibility without a new release: change only
  `applications.zotero.strict_max_version` of the existing entry in `updates.json`, after
  testing, via PR (the Zotero 7 developer guide allows this:
  "You can later update compatibility via your update manifest without distributing a new
  version").

## If something goes wrong

- **Wrong file published in an immutable release:** it cannot be replaced or deleted from
  the release. Do **not** merge an `updates.json` pointing to it. Fix the problem and release
  a new version (for example 0.1.1). Deleting an immutable release frees nothing: its tag name
  can never be reused.
- **Wrong hash or version in `updates.json` on `main`:** Zotero refuses to install the update
  (the download fails safely). Fix `updates.json` through a new PR.
- **Tag pushed on the wrong commit before the release was published:** the tag ruleset blocks
  moving or deleting it. The owner can temporarily set the ruleset to **Disabled**, delete
  the tag, and set it back to **Active** — or skip to the next version number (simpler and
  leaves no gap in the protection).
