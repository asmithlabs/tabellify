# ADR-0021: AI provider access (Claude and OpenAI, user's own API key, plain `fetch`)

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** Feature 010 spec `docs/features/010-ai-fill.md`; ADR-0022 (API key storage),
  ADR-0023 (data sent and consent), ADR-0024 (suggestions and review queue), ADR-0025 (library
  writes), ADR-0026 (cost, rate limits, model choice, prompt injection); ADR-0003 (no bundler,
  no new dependency); ADR-0011 (security review); ADR-0008 (Zotero 10.0.x, Firefox ESR 140).

## Context

The owner's v2 idea (2026-11-14, `build/v2-notes.md`, and the 2026-11-18 note quoted in the
spec): "it would be claude or chatgpt whatever the person wants." The user picks a provider and
pastes their own API key. Tabellify then asks the model to find, in each paper of a
collection, the passages that match each codebook column.

This is the first time Tabellify talks to the internet. Three things must be decided:
1. Which providers and which of their APIs.
2. Where in the plugin the request is made, and with which browser API.
3. Whether to use a provider's SDK (an npm package) or plain HTTP.

### Background for a JavaScript learner
- **API** (here): a web address that a program sends a request to, and that answers with
  data (JSON). The provider runs the AI model behind it.
- **API key**: a secret string that proves who pays for the request. Anyone who has it can
  spend the owner's money. ADR-0022 decides how Tabellify keeps it.
- **`fetch(url, options)`**: the standard JavaScript function that sends an HTTP request and
  returns a Promise of the response. It is built into Firefox (and so into Zotero).
- **SDK**: a library a company publishes so you do not write HTTP calls by hand. It is an
  npm package; Tabellify has no bundler (ADR-0003), so using one would mean copying a large
  library into `src/`.
- **CORS**: a web-page safety rule. A normal web page may only read a response from another
  site if that site allows it. Tabellify's workspace is a privileged ("chrome") document, which
  may not be bound by this rule. That is not proven yet (RT-AI1).

### Verified facts this ADR relies on
Zotero/Mozilla rows are in `docs/zotero-api-notes.md` ("Feature 010 rows").
- **`fetch` exists in the plugin's bootstrap scope.** Zotero 10.0.9 creates that scope with
  `wantGlobalProperties` that include `"fetch"`, `"XMLHttpRequest"`, `"crypto"`,
  `"TextEncoder"`, `"TextDecoder"`, `"atob"`, `"btoa"`
  ([`plugins.js` @ 10.0.9](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/plugins.js),
  `_loadScope`). In a chrome window (our workspace document) `fetch` is the normal window
  function ([MDN `fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch)).
- **Zotero itself now uses `fetch`.** Z10 guide: "`Zotero.HTTP.download()` was rewritten to
  stream via `fetch()`" ([Zotero 10 for developers](https://www.zotero.org/support/dev/zotero_10_for_developers)).
- **Anthropic Messages API** (checked 2026-11-18):
  `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `content-type:
  application/json`, and a required `anthropic-version` header ("you must send an
  `anthropic-version` request header. For example, `anthropic-version: 2026-10-21`"); body
  fields `model`, `max_tokens`, `messages`
  ([Messages API](https://platform.claude.com/docs/en/api/messages),
  [API versions](https://platform.claude.com/docs/en/api/versioning)). Version `2026-10-21`
  removes `temperature`, `top_p`, `top_k` (a request with them returns 400). JSON-schema output:
  "The request carries the schema in `output_config.format` with `type: "json_schema"`"
  ([Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)).
  Browser (CORS) access needs the request header `anthropic-dangerous-direct-browser-access:
  true` (third-party sources only:
  [Simon Willison, 2024-08-23](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access);
  not found in Anthropic's current docs, so **UNVERIFIED**).
- **OpenAI Responses API** (checked 2026-11-18): `POST https://api.openai.com/v1/responses`
  with `Authorization: Bearer <key>`; PDF input as `input_file` with `file_data` (a data URL);
  files under 50 MB ([PDF files guide](https://developers.openai.com/api/docs/guides/pdf-files)).
  JSON-schema output: `text: { format: { type: "json_schema", "strict": true, "schema": … } }`
  ([Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)).
  Whether OpenAI's API answers browser CORS requests from a chrome document: **UNVERIFIED**
  (RT-AI1).

## Decision

1. **Two providers: Anthropic (Claude) and OpenAI (ChatGPT models).** The user picks one in
   Tabellify's AI settings. Each provider has a small **adapter**: one pure function that
   builds the request body and one that reads the response. Adding a third provider later
   means a third adapter, not a new design.
2. **Plain `fetch`, no SDK, no new dependency.** Requests are built by hand from the
   documented JSON shapes. This keeps ADR-0003 (no bundler) and CLAUDE.md rule 3 (no new
   dependency) intact.
3. **One network file.** Only `src/content/ai-client.js` may call `fetch`. It runs in the
   workspace document (the Tabellify tab), next to the UI that shows progress and the Cancel
   button. It knows exactly two base URLs, written as constants:
   `https://api.anthropic.com/` and `https://api.openai.com/`. No other host. No redirects
   followed to other hosts (`redirect: "error"`).
4. **Pure logic stays pure.** A new `src/content/ai-provider-model.js` (global
   `TabellifyAiProvider`, no Zotero / DOM / network globals, tested in Node) builds request
   bodies, parses responses, classifies errors (auth, rate limit, spend limit, overloaded,
   bad output) and decides retries (ADR-0026).
5. **Structured output for both providers.** Each request asks for one JSON object of a fixed
   shape (`{ "suggestions": [ { "tag", "quote", "page" } ] }`, ADR-0024). Tabellify still checks
   every answer itself (ADR-0024 §3); the schema only makes parsing reliable.
6. **Pinned API versions.** Anthropic: `anthropic-version: 2026-10-21` (the version in the
   docs on 2026-11-18). OpenAI: the `/v1/responses` endpoint with `store: false` (ADR-0023).
   A provider version change is a reviewed code change, never automatic.
7. **Cancel and cleanup.** Every request gets an `AbortController` signal. Cancel aborts the
   running request and stops the run. Closing the Tabellify tab (document `unload`) aborts it
   too (lifecycle symmetry, CLAUDE.md rule 9).
8. **CORS fallback, only if RT-AI1 fails.** If a request from the workspace document is
   blocked as a CORS error: for Anthropic, add `anthropic-dangerous-direct-browser-access:
   true`; for OpenAI (or if that still fails), move `ai-client.js`'s one `fetch` call into the
   bootstrap scope (where `fetch` is verified) and call it from the workspace through the
   existing `Tabellify` object. The fallback is chosen by the developer after RT-AI1 and
   recorded in the spec; it does not change any other part of this ADR.
9. **Static guard.** A new static test fails if `fetch(`, `XMLHttpRequest` or `Zotero.HTTP.`
   appears in any `src/` file other than `content/ai-client.js`, and if `ai-client.js`
   contains an `https://` URL other than the two base URLs.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. `fetch` in the workspace document, hand-written requests (recommended)** | Standard, documented API; no dependency; progress, Cancel and errors live next to the UI; easy to guard with a static test | Request shapes are maintained by us; CORS behaviour of a chrome document must be checked (RT-AI1) |
| B. `fetch` in the bootstrap scope (`tabellify.js`) | `fetch` there is verified in Zotero source; independent of CORS questions if the sandbox's system principal is exempt | Needs a message path between the tab and the bootstrap scope; long requests outlive a closed tab unless cancelled explicitly; more lifecycle code. Kept as the fallback (§8) |
| C. `Zotero.HTTP.request()` | Zotero's own HTTP helper; used by translators | Internal (not in a dev guide for this use); XHR-based; not verified in our notes; adds nothing over `fetch` for JSON calls |
| D. Official SDKs (`@anthropic-ai/sdk`, `openai`) | Less code; maintained by the providers | npm packages need bundling (ADR-0003); large; new dependencies with supply-chain risk (ADR-0011); Anthropic's SDK needs `dangerouslyAllowBrowser` in a browser anyway |
| E. A Tabellify proxy server | Could hide the provider choice; central key | We would run a server, see users' paper text and keys, and pay for hosting. Rejected: against "user's own key" and privacy |
| F. Only one provider (Claude) | Half the adapter code and tests | Owner asked for "claude or chatgpt whatever the person wants" |
| G. Local models (Ollama, LM Studio) | Nothing leaves the device | Not asked for; users must install and run a model server. Possible later as a third adapter (localhost host would be a new ADR) |

## Consequences
- **Easier:** no build tooling; the network surface is one file with two hosts, easy for the
  security-auditor to check.
- **Harder:** Tabellify maintains two request/response shapes. When a provider changes its API
  version, a Tabellify release is needed.
- **Riskier:** first network feature. Errors, timeouts and partial runs must be handled (spec
  010b ACs). The CORS question (RT-AI1) must be answered before coding 010a.
- **Follow-up:** RT-AI1 before 010a; new static test (network guard); security-auditor adds
  "network calls" to the threat model; docs pass explains that only the chosen provider is
  contacted, and only when the user starts a run or a key test.
- **Revisit when:** a provider deprecates the endpoint or version; the owner wants local models
  or a third provider; Zotero offers a documented plugin HTTP API.

## Open questions for the owner
1. Approve two providers with hand-written `fetch` calls and no SDK? *Recommended: yes.*
2. Approve the CORS fallback order in §8? *Recommended: yes* (the developer picks after RT-AI1).
