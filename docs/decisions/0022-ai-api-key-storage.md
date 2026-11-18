# ADR-0022: Storing the user's AI API key (Login Manager + OS key store encryption)

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** ADR-0021 (provider access), ADR-0011 (security review: "API keys" is in the
  threat model), ADR-0012 (Tabellify's JSON files; a key must never go there), Feature 010
  spec `docs/features/010-ai-fill.md` (phase 010a).

## Context

Each user pastes their own Anthropic or OpenAI API key (ADR-0021). The key is a secret that
spends the user's money. Tabellify must keep it between Zotero sessions (or decide not to),
and must never leak it into files, logs, prompts or error messages.

Zotero already solves the same problem for its own sync API key. In Zotero 10.0.9
(`chrome/content/zotero/xpcom/sync/syncLocal.js`) it:
1. encrypts the key with `Zotero.OSKeyStore.encrypt(...)`, a thin wrapper around Firefox's
   `OSKeyStore.sys.mjs`, which uses a secret kept in the operating system's key store
   (macOS Keychain, Windows DPAPI, Linux libsecret);
2. stores the encrypted text as the "password" of a Firefox **Login Manager** entry
   (`Services.logins.addLoginAsync`, origin `chrome://zotero`, realm `Zotero Web API
   (encrypted)`, username `API Key`);
3. reads it back with `Services.logins.findLogins(origin, null, realm)` and decrypts it;
4. asks before falling back to an unencrypted copy if the OS key store fails
   (`confirmUnencryptedFallback`).

All of these are recorded in `docs/zotero-api-notes.md` ("Feature 010 rows") with sources.

### Background for a JavaScript learner
- **Firefox Login Manager** (`Services.logins`): the store Firefox uses for saved website
  passwords. Entries live in the profile folder (`logins.json`, encrypted with `key4.db`).
  Without a Primary Password, anyone who copies both files can decrypt them. That is why
  Zotero adds a second layer.
- **OS key store**: a safe the operating system keeps for each user (Keychain on macOS). A
  key there is protected by the user's computer login, not just by files in the profile.
- **Profile vs data directory**: prefs and logins live in the Zotero **profile**; Tabellify's
  JSON files live in the **data directory** (ADR-0012). A key in the data directory would be
  copied by every backup of the library folder. That is a reason to keep it out.

## Decision

1. **Store the key in the Firefox Login Manager, encrypted with the OS key store first.**
   - Encrypt: `OSKeyStore.encrypt(key)` from `resource://gre/modules/OSKeyStore.sys.mjs`
     (imported with `ChromeUtils.importESModule`).
   - Save: one Login Manager entry per provider: origin `chrome://tabellify`, form action
     `null`, realm `Tabellify AI: anthropic` or `Tabellify AI: openai`, username `API Key`,
     password = the encrypted text. Create with `Services.logins.addLoginAsync(info)`;
     replace with `Services.logins.modifyLogin(old, info)`; `info` is an `nsILoginInfo` built
     exactly as Zotero builds it
     (`Components.Constructor("@mozilla.org/login-manager/loginInfo;1",
     Components.interfaces.nsILoginInfo, "init")`, 7 arguments).
   - Read: `Services.logins.findLogins("chrome://tabellify", null, realm)`, then
     `OSKeyStore.decrypt(...)`, only when a request is about to be sent. The plain key is kept
     in memory for the open workspace document only; it is dropped on `unload`.
2. **If the OS key store is not available** (encrypt throws, e.g. Linux without libsecret):
   the key is kept **for this session only** (memory) and the settings say so. Tabellify never
   stores a plain key. (Zotero offers an unencrypted fallback for sync; Tabellify does not.)
3. **One file touches keys:** `src/content/ai-key-store.js` (global `TabellifyAiKeyStore`):
   `hasKey(provider)`, `getKey(provider)`, `setKey(provider, key)`, `forgetKey(provider)`. A new
   write-guard deny pattern "Services.logins write" (`addLogin`, `addLoginAsync`,
   `modifyLogin`, `removeLogin`, `removeAllLogins`) is allowed only in that file.
   `removeAllLogins` is never allowed anywhere.
4. **Where keys must never appear:** prefs, Tabellify JSON files, Debug Output, error
   messages, the prompt sent to the model, saved suggestions, CSV exports, the DOM after the
   field is saved (the input is cleared and shows "Key saved" instead). Static test: no
   `Zotero.debug(` call in `ai-key-store.js` or `ai-client.js` takes a variable named `key` or
   `apiKey`; the key input is `type="password"` with `autocomplete="off"`.
5. **The key is only sent to its own provider's host** (`x-api-key` header to
   `api.anthropic.com`, `Authorization: Bearer` to `api.openai.com`; ADR-0021 §3).
6. **User controls.** Settings show, per provider: "Key saved" / "No key", **Test key** (one
   tiny request with no paper data, ADR-0023 §1), **Forget key** (removes the Login Manager
   entry). The settings advise creating a separate key for Tabellify and setting a monthly
   spend limit at the provider.
7. **Uninstall.** When the user removes Tabellify (`uninstall` with reason
   `ADDON_UNINSTALL` = 6 only; not on upgrade or downgrade, reasons 7 and 8, see ADR-0012 §8),
   remove Tabellify's own Login Manager entries. Losing a key by mistake only means pasting it
   again; leaving a secret behind is worse. (Question 2 below; spec Q6.)

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. Login Manager + OS key store encryption (recommended)** | Same pattern Zotero 10.0.9 uses for its own sync key; protected by the OS user login; not in the data folder, not in backups of it; Mozilla APIs, no dependency | `OSKeyStore.sys.mjs` is a Firefox-internal module (no add-on API docs); macOS may show a Keychain prompt the first time; behaviour must be checked (RT-AI2) |
| A2. Same, but through `Zotero.OSKeyStore` (Zotero's wrapper) | Adds Zotero's prefix (`oskv1:`), availability check and error logging | Zotero-internal (in 10.0.9; history not checked); one more layer that can change |
| B. Login Manager only (no OS key store) | Simple; documented Mozilla interface (`nsILoginManager.idl`) | Without a Primary Password the key is recoverable from the profile files |
| C. Zotero prefs (`extensions.tabellify.ai.key`) | One call | Plain text in `prefs.js`; visible in the Config Editor; copied with the profile. **Rejected** |
| D. A Tabellify JSON file (ADR-0012) | Same pattern as our other data | Plain text in the data directory, copied with every library backup. **Rejected** |
| E. Never store: ask once per Zotero session | Nothing on disk | Friction every session; users paste keys from notes apps (worse in practice). Kept as the automatic fallback (§2) |

## Consequences
- **Easier:** users paste the key once; the key is as safe as Zotero's own sync key.
- **Harder:** one more privileged API family (`Services.logins`, `OSKeyStore`) to keep checked
  before each `strict_max_version` raise.
- **Riskier:** any other installed Zotero plugin runs with the same privileges and could read
  the key. Tabellify cannot prevent that; the docs say so and recommend a separate key with a
  spend limit. `OSKeyStore.sys.mjs` is Firefox-internal: a future Firefox ESR could change it
  (Zotero would have to adapt its own sync code too, which lowers the risk).
- **Follow-up:** RT-AI2 (owner, dev profile) before 010a; write-guard pattern; security-auditor
  checks every code path that touches the key; docs pass ("Data Safety and Privacy": where the
  key is kept, how to remove it).
- **Revisit when:** Zotero offers a documented secret-storage API for plugins, or RT-AI2 fails
  on the owner's macOS.

## Open questions for the owner
1. Approve option A (Login Manager + OS key store), with session-only memory as the fallback
   and never a plain-text copy? *Recommended: yes.*
2. Remove Tabellify's keys when the user uninstalls Tabellify (reason 6 only)?
   *Recommended: yes.*
