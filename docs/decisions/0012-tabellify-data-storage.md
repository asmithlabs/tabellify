# ADR-0012: How Tabellify stores its own data (codebooks now, table configurations later)

- **Status:** Accepted (owner, 2026-11-12)
- **Date:** 2026-11-12
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** PRD §6 (library safety), §7 Q4 (super-tag groups live in Tabellify's codebook);
  `docs/architecture.md` §5 (storage format open for F004/F007); ADR-0003 (no bundler, no
  new dependency); ADR-0011 (security review); Feature 004 spec `docs/features/004-codebook.md`

## Context

Feature 004 (codebook) is the first feature where Tabellify keeps **its own data**: a curated
list of tags grouped under super-tags. Feature 007 will add saved table configurations. The
PRD says this data is stored **separately** from the Zotero library, and that Zotero tags stay
unchanged (Q4, option A). Until now Tabellify has stored nothing.

What the data looks like:
- Small: a codebook is tens to a few hundred short strings (a few KB). F007 table
  configurations are also small (which codebook, which collection, which options).
- Structured: codebook → groups → tags (a tree), later tables that point at codebooks.
- Written rarely, only when the user edits (not on every keystroke in a hot loop).
- Read when the workspace opens.

Constraints:
- **Library safety (CLAUDE.md rule 8, PRD §6):** never write to the Zotero library or its
  database (`zotero.sqlite`).
- **No new dependency** (ADR-0003, CLAUDE.md rule 3).
- **Verified APIs only** (rule 1). Every API below is in `docs/zotero-api-notes.md` (Feature
  004 rows).
- Zotero 10.0.x only (ADR-0008); Zotero 10 runs on Firefox 140 ESR.

### Background for a JavaScript learner
- **Zotero data directory**: the folder that holds `zotero.sqlite` (the library database) and
  `storage/` (PDFs etc.). Default `~/Zotero`; the owner's dev profile uses
  `~/Zotero tabellify-dev`. It is *not* the same as the **profile** folder (settings, plugins).
- **`IOUtils` / `PathUtils`**: Firefox's built-in, promise-based file and path helpers for
  privileged ("chrome") code. Zotero 7+ asks plugins to use them instead of the removed
  `OS.File` ([Z7 guide](https://www.zotero.org/support/dev/zotero_7_for_developers),
  "Firefox 102 → Firefox 115": "OS.File, OS.Path, and OS.Constants.Path have been removed in
  favor of IOUtils and PathUtils").
- **Atomic write**: write the new content to a temporary file first, then rename it over the
  real file in one step. If Zotero crashes mid-write, you have either the old file or the new
  one, never a half-written one.

## Decision

**Store Tabellify data as JSON files in a `tabellify` folder inside the Zotero data
directory, read and written with Firefox's `IOUtils` and `PathUtils`.**

### 1. Location
- Folder: `PathUtils.join(Zotero.DataDirectory.dir, "tabellify")`
  - Owner's dev profile: `~/Zotero tabellify-dev/tabellify/`
- One file per concern, each with its own schema version:
  - `codebooks.json` (F004)
  - `tables.json` (F007, later; separate so a problem in one file can't damage the other)
- Helper files Tabellify creates next to each data file: `<name>.json.tmp` (atomic-write
  temp file, normally gone after a write) and `<name>.json.bak` (the previous version).
- **Why the data directory, not the profile:** codebooks belong with the library they describe.
  When a user backs up or copies their whole Zotero data folder, the codebooks travel with it. The dev data directory also keeps the owner's real data out of
  development, automatically.
- `Zotero.DataDirectory.dir` is a getter that throws `"Data directory not initialized"` until
  Zotero has set it up. Zotero sets it (`await Zotero.DataDirectory.init()`, `zotero.js` L279)
  before opening the database and before `Zotero.initializationPromise` resolves (L415–435).
  The workspace already `await`s `Zotero.initializationPromise` (F003), so reading `dir` after
  that is safe.
- **Internal API note:** `Zotero.DataDirectory.dir` is not in any zotero.org developer guide
  or the JavaScript API page. It is Zotero's own core property (Zotero's code uses it to find
  its own database: `getDatabase` and `getSubdirectory` in `dataDirectory.js` both join paths
  onto `this.dir`), so a rename would break Zotero itself. Its history before 10.0.9 was not
  checked. **Maintenance risk: low–medium.** Recheck `dataDirectory.js` before each
  `strict_max_version` raise. We do **not** use `Zotero.DataDirectory.getSubdirectory()`: it
  uses the `OS.Path` shim and, with `createIfMissing`, calls a non-awaited create.

### 2. Read and write APIs (all verified in source; see api-notes)
- Create the folder: `await IOUtils.makeDirectory(dir)` (defaults: `createAncestors: true`,
  `ignoreExisting: true`, so it is safe to call every time).
- Read: `await IOUtils.readJSON(path)`. If the file does not exist, the promise rejects with an
  error whose `name === "NotFoundError"` (documented in the header comment of
  [`IOUtils.webidl`](https://searchfox.org/mozilla-esr140/source/dom/chrome-webidl/IOUtils.webidl)).
  Tabellify treats that as "no codebook yet" and starts empty **without** creating a file.
- Write: `await IOUtils.writeJSON(path, data, { tmpPath: path + ".tmp", backupFile: path + ".bak" })`.
  - `tmpPath` makes the write atomic ("write the data to a file at |tmpPath| instead of
    directly to the destination. Once the write is complete, the destination will be
    overwritten by a move").
  - `backupFile` keeps the previous version ("backup the destination file to this path before
    writing"). That gives the owner a one-step manual undo and a recovery copy.
  - `flush: true` is **not** used (slow, system-wide); the tmp + move already protects
    against a Zotero crash. A power cut can still lose the *latest* edit, not older data.
- Paths are built only with `PathUtils.join`, never by string concatenation with `/`, so
  Windows paths work.
- The I/O code lives in one small file, `src/content/codebook-store.js` (spec F004). The
  validation and migration logic is pure (no Zotero, no IOUtils) and unit-tested in Node.

### 3. Corruption and error handling
| Situation on load | What Tabellify does |
|---|---|
| File missing (`NotFoundError`) | Start with an empty codebook. Create the file on the first save. |
| File is not valid JSON, or fails validation | Show an error with the file path; **editing is disabled** so nothing overwrites the damaged file. Log details to Debug Output. The owner can repair or delete the file, or copy `codebooks.json.bak` over it. Automatic recovery from `.bak` is deferred. |
| `schemaVersion` newer than this Tabellify knows | Show "made by a newer Tabellify"; editing disabled (never downgrade-overwrite). |
| `schemaVersion` older | Migrate in memory with a pure function; the next save writes the new version (the old one is kept as `.bak`). |
| Any other read error (permissions, disk) | Same as invalid: error message, editing disabled. |
| Write fails | Show "could not save"; keep the in-memory edit; log the error. The file on disk is unchanged (atomic write). |

### 4. Schema versioning
Every data file is a JSON object with a top-level integer `schemaVersion` (starts at `1`) and a
`revision` counter (see §5). Changes to the shape bump `schemaVersion` and add a migration
step `vN → vN+1` in the pure module, with a unit test per step. The F004 shape is defined in
the feature spec.

### 5. Two open workspaces (two main windows)
Each main window can have its own Tabellify tab (ADR-0009), so two documents could edit the
same file. Each file carries `revision` (an integer, +1 on every save). Before saving,
Tabellify re-reads the file; if its `revision` differs from the one this workspace loaded,
it does **not** overwrite. It reloads and shows "The codebook was changed in another
Tabellify tab and has been reloaded; repeat your last change." Rare in practice; cheap to do.
(Not a lock: two saves in the same instant could still race. Acceptable for this data.)

### 6. Never the Zotero database
Tabellify never writes to `zotero.sqlite`, never calls `Zotero.DB.*`, never stores data in
item fields, notes, tags, relations or saved searches. Its files sit *next to* the library in
its own folder. The existing write-guard test (`tests/static/write-guard.test.mjs`) keeps
flagging `IOUtils` writes everywhere in `src/`; F004 adds **one narrow allow-list entry** for
`src/content/codebook-store.js` (pattern "IOUtils write"), citing the F004 spec.

### 7. Sync
**Tabellify data is not synced by Zotero sync.** Zotero's data sync covers "library items,
notes, links, tags, etc." stored in the database, and file sync covers attachment files
([Zotero sync docs](https://www.zotero.org/support/sync)). A folder Tabellify creates in the
data directory is neither. A user with two computers has separate codebooks on each. Export /
import of codebooks (deferred, see spec) is the planned way to move one. Zotero's docs warn
against putting the data directory in Dropbox-like folders; Tabellify does not change that
advice.

### 8. Uninstall (owner decision, see Open questions)
**Recommended: keep the data on uninstall.** Reasons:
- Zotero calls `uninstall()` not only when the user removes the plugin (reason
  `ADDON_UNINSTALL` = 6) but also when **upgrading or downgrading** (reasons 7 / 8)
  ([`plugins.js` @ 10.0.9](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/plugins.js),
  `onUninstalling` and `onInstalling`). Deleting there would require branching on `reason`; a
  bug would erase every user's codebooks on every update.
- A user who reinstalls gets their codebooks back.
- The docs (wiki "Data Safety and Privacy") tell users the folder path so they can delete it.

Alternative: delete `<data dir>/tabellify/` only when `reason === ADDON_UNINSTALL`. Possible
(`IOUtils` and `PathUtils` are in the bootstrap scope), but riskier and irreversible.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. JSON files in `<data dir>/tabellify/` via `IOUtils` (recommended)** | Human-readable; owner can inspect, back up and fix by hand. Travels with the library folder. Atomic writes and a `.bak` built in (`tmpPath`, `backupFile`). No dependency. Fits small, tree-shaped data. Easy to unit-test (pure JSON in/out) | Whole file rewritten on each save (fine at KB size). Not synced. No transactions across files. `Zotero.DataDirectory.dir` is an undocumented (internal) property |
| A2. Same, but in the **profile** folder (`PathUtils.profileDir`) | `PathUtils.profileDir` is a documented Firefox API (no Zotero internal) | Separated from the library it describes: moving/backing up the data folder loses codebooks. Profile folders are hidden and rarely backed up. The owner's real profile is off-limits during development; the dev profile is separate anyway, so no safety gain |
| A3. Same location, but `Zotero.File.putContentsAsync` / `getContentsAsync` | Listed on Zotero's [JavaScript API page](https://www.zotero.org/support/dev/client_coding/javascript_api); also atomic (`tmpPath`) | Implemented on Zotero's `OS.File` compatibility shim (`OS.File.writeAtomic`), which the Z7 guide says not to rely on long-term. No `backupFile`; we'd parse JSON ourselves |
| B. **Zotero prefs** (`Zotero.Prefs.set("extensions.tabellify.codebooks", json, true)`) | One call; no files; prefs survive restarts | Prefs are for small settings. Firefox warns above 4 KB per string pref ("bad for general performance … should rather be written to an external file", `Preferences.cpp`, `MAX_ADVISABLE_PREF_LENGTH = 4 * 1024`); a codebook can exceed that. All prefs load into memory at startup and live in `prefs.js` in the **profile**, not with the library. No atomic multi-value update, no backup. Still fine later for tiny UI settings (e.g. "last collection") |
| C. **Separate SQLite file** (e.g. `<data dir>/tabellify/tabellify.sqlite` via Mozilla's `Sqlite.sys.mjs`, or `Zotero.DBConnection`) | Real transactions, queries, scales to large data | Heavy for a few KB of tree data. Needs schema DDL, migrations, connection open/close in `startup`/`shutdown` (lifecycle risk). `Zotero.DBConnection` is internal; neither it nor `Sqlite.sys.mjs` was verified for this ADR (both UNVERIFIED, not proposed). Not human-readable. Every `Zotero.DB`-style call trips the write guard. Revisit only if F010+ (AI extraction) stores large per-paper data |
| D. **Zotero's own database** (`zotero.sqlite`: extra tables, or settings rows via `Zotero.DB` / sync settings) | Would sync (if via synced settings) | **Rejected.** Violates PRD §6 and CLAUDE.md rule 8 (no database rows). Zotero's schema upgrades and integrity checks don't know our tables; a bug could corrupt the user's library; uninstall leaves rows behind |
| E. Store groups in the library (notes, tag prefixes, saved searches) | Syncs for free | **Rejected** by PRD Q4 (option A: Zotero tags stay unchanged) and rule 8 (library writes) |

## Consequences
- **Easier:** F004 and F007 share one small store pattern. Data is inspectable, backed up with
  the library folder, and testable in Node.
- **Harder:** Tabellify owns schema versions and migrations from day one; every shape change
  needs a migration and a test. Users with several computers must copy codebooks manually
  (until export/import exists).
- **Riskier:** one undocumented Zotero property (`Zotero.DataDirectory.dir`); mitigated by a
  single call site and a recheck before each version raise. Two-tab conflicts are detected,
  not prevented.
- **Follow-up:**
  - F004 spec: allow-list entry in the write guard; tests for validation and migration.
  - Docs pass (ADR-0010, at the end of prototype mode): wiki "Data Safety and Privacy" and
    "Codebooks" name the folder, say it is not synced, and say what uninstall does.
  - Security audit (ADR-0011): the data file is user-editable input to a privileged document;
    validate it and render names with `textContent` only.
  - F007 adds `tables.json` under this ADR (no new ADR needed unless the approach changes).
- **Revisit when:** data grows beyond a few MB or needs queries (→ option C); Zotero offers a
  documented plugin-storage API; the owner wants cross-computer sync.

## Open questions for the owner
1. **Uninstall:** keep `<data dir>/tabellify/` (recommended) or delete it when the user removes
   Tabellify?
2. **Location:** data directory (recommended) or profile folder (A2)?
