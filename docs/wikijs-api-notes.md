# Wiki.js API notes

Verified facts about the Wiki.js API used to publish `docs/wiki/` to
https://wiki.asmithlabs.com/tabellify (ADR-0010, amendment 1). This file is for Wiki.js only;
Zotero APIs stay in `docs/zotero-api-notes.md`.

Every entry has a source link. "Verified for" names the Wiki.js source tag that was read.
Entries marked **UNVERIFIED** must be checked before the publish script relies on them.

Checked on 2026-11-16 by the architect agent. Source tag: `v2.5.315` (latest 2.x tag on
github.com/requarks/wiki at that date). Wiki.js 2.x source lives only in the `v2.5.*` tags;
the repository's default branch `scarlett` is now Wiki.js 3.x.

---

## 0. Which Wiki.js is wiki.asmithlabs.com?

**Finding: Wiki.js 2.x (exact patch version unknown).**

Evidence (unauthenticated, public pages only):
- `GET https://wiki.asmithlabs.com/graphql` serves **GraphQL Playground** (embedded config:
  Playground "1.7.42", endpoint `/graphql`, subscription endpoint `/graphql-subscriptions`).
- Wiki.js 2.x mounts Apollo at the default `/graphql` and sets the subscriptions path to
  `/graphql-subscriptions`: `path: '/graphql-subscriptions'` in
  [server/core/servers.js (v2.5.315)](https://github.com/requarks/wiki/blob/v2.5.315/server/core/servers.js).
  The official docs: "The **GraphQL endpoint** is located at `/graphql` on your wiki.js site."
  ([dev/api.md, wiki-docs](https://github.com/Requarks/wiki-docs/blob/master/dev/api.md),
  rendered at https://docs.requarks.io/dev/api).
- Wiki.js 3.x (first stable release 3.0.1 on 2026-11-01, latest 3.4.0 on 2026-11-15,
  [releases](https://github.com/requarks/wiki/releases)) uses a REST-style API built on
  Fastify in `backend/api/` (for example `app.register(import('./apiKeys.ts'), { prefix: '/api-keys' })`
  in [backend/api/index.ts (scarlett)](https://github.com/requarks/wiki/blob/scarlett/backend/api/index.ts));
  no GraphQL endpoint appears there.
- The page HTML exposes no generator tag or version string.

**UNVERIFIED: the exact 2.x patch version.** How to verify: the owner opens
**Administration → System Info** in the wiki (logged in as admin) and reads the
"Current Version" line. The API facts below were read from `v2.5.315`; the page schema has
been stable through 2.5.x, but if the owner's version is older than 2.5.0, re-check them.

**Maintenance risk:** Wiki.js 3.x is now stable and drops the 2.x GraphQL API. If the owner
upgrades wiki.asmithlabs.com to 3.x, the publish script's API layer must be rewritten (keep
it in one small function per call so the rewrite is contained).

---

## 1. Authentication header

| | |
|---|---|
| **Fact** | Send the API key as `Authorization: Bearer <key>` on `POST /graphql`. |
| **Source (docs)** | [dev/api.md](https://github.com/Requarks/wiki-docs/blob/master/dev/api.md): "Access to resources requires a **valid API token**, which can be generated from the **Administration Area**"; "The API Access feature is available from version **2.2 and up**."; example header `"Authorization": "Bearer eyJhbGc...aXczt18H6437W"`. |
| **Source (code)** | [server/helpers/security.js (v2.5.315)](https://github.com/requarks/wiki/blob/v2.5.315/server/helpers/security.js): `extractJWT` tries `passportJWT.ExtractJwt.fromAuthHeaderAsBearerToken()` first, then the `jwt` cookie. |
| **Verified for** | Wiki.js 2.2+ (docs); code read at v2.5.315. |

How API keys behave ([server/core/auth.js](https://github.com/requarks/wiki/blob/v2.5.315/server/core/auth.js),
[server/models/apiKeys.js](https://github.com/requarks/wiki/blob/v2.5.315/server/models/apiKeys.js), v2.5.315):
- A key is a signed JWT (`algorithm: 'RS256'`, `issuer: 'urn:wiki.js'`). It is accepted only
  if it is in the server's list of unrevoked, unexpired keys
  (`_.includes(WIKI.auth.validApiKeys, user.api)`).
- The key carries one group: `grp: fullAccess ? 1 : group`. Group 1 is Administrators, so
  **"Full Access" means administrator rights over the whole wiki**.
- The request runs as a synthetic user with `id: 1`, `email: 'api@localhost'`,
  `permissions` = the group's permissions and `groups: [user.grp]`. Pages created by the
  script will therefore show the admin user (id 1) as author.

## 2. Permission checks (how least privilege works)

| | |
|---|---|
| **Fact** | Every schema field has an `@auth(requires: [...])` list; the caller needs **any one** of them. Then most page operations also call `checkAccess`, which needs the permission **both** in the group's global permissions **and** in a matching page rule. |
| **Source (code)** | [server/graph/directives/auth.js](https://github.com/requarks/wiki/blob/v2.5.315/server/graph/directives/auth.js): `if (!_.some(context.req.user.permissions, pm => _.includes(requiredScopes, pm))) {` … `throw new Error('Forbidden')`. [server/core/auth.js](https://github.com/requarks/wiki/blob/v2.5.315/server/core/auth.js) `checkAccess`: `manage:system` short-circuits to allowed; otherwise the global permission is required first, then page rules are evaluated; final result `return (checkState.match && !checkState.deny)`. |
| **Source (docs)** | [groups.md](https://github.com/Requarks/wiki-docs/blob/master/groups.md): "Rules are applied in order of path specificity." "A more precise path will always override a less defined path." "When 2 rules have the same path specificity AND the same match type, `Deny` will always override an `Allow` rule." |
| **Verified for** | v2.5.315 |

Page-rule matching (`checkAccess`, v2.5.315), quoted:
- START: `_.startsWith(\`/${page.path}\`, \`/${rule.path}\`)` — so a rule path is entered
  **without** a leading slash (`tabellify`), and it also matches any path that begins with
  those letters (e.g. `tabellify-old`).
- EXACT: `` `/${page.path}` === `/${rule.path}` ``
- REGEX: `new RegExp(rule.path)` tested against `page.path`
- Locales: `if (!rule.locales.includes(page.locale)) { return }` when the rule lists locales.

New groups start with these defaults ([server/app/data.yml](https://github.com/requarks/wiki/blob/v2.5.315/server/app/data.yml)):
permissions `read:pages`, `read:assets`, `read:comments`, `write:comments`, and one page rule
`match: START`, `path: ''`, `deny: false`, the same four roles, `locales: []` — i.e. **read
access to every page**. Remove or narrow that default rule for a least-privilege group.

## 3. Finding a page by path and locale

| Call | Schema (v2.5.315, [page.graphql](https://github.com/requarks/wiki/blob/v2.5.315/server/graph/schemas/page.graphql)) | Usable with a least-privilege key? |
|---|---|---|
| `pages.list` | `list(limit: Int, orderBy: PageOrderBy, orderByDirection: PageOrderByDirection, tags: [String!], locale: String, creatorId: Int, authorId: Int): [PageListItem!]! @auth(requires: ["manage:system", "read:pages"])` | **Yes.** Needs `read:pages`. Results are filtered per page by `checkAccess(user, ['read:pages'], { path, locale })`, so the key only sees pages its rules allow. |
| `pages.singleByPath` | `singleByPath(path: String!, locale: String!): Page @auth(requires: ["read:pages", "manage:system"])` | **No** (see below). |
| `pages.single` | `single(id: Int!): Page @auth(requires: ["read:pages", "manage:system"])` | **No** (see below). |

`PageListItem` fields: `id, path, locale, title, description, contentType, isPublished,
isPrivate, privateNS, createdAt, updatedAt, tags`. No `content`.

`PageOrderBy` values: `CREATED, ID, PATH, TITLE, UPDATED`.

**Important limitation (verified in code and a long-standing upstream report):** the
`single` and `singleByPath` resolvers check
`WIKI.auth.checkAccess(context.req.user, ['manage:pages', 'delete:pages'], { path, locale })`
and otherwise throw `PageViewForbidden`
([server/graph/resolvers/page.js, v2.5.315](https://github.com/requarks/wiki/blob/v2.5.315/server/graph/resolvers/page.js)).
A key that has only read/write permission therefore **cannot read a page's content**.
Upstream report: [requarks/wiki discussion #6216](https://github.com/requarks/wiki/discussions/6216)
("API with group permission does not work", 2.5.297; error "You are not authorized to view
this page.", `PageViewForbidden 6013`; no maintainer fix as of 2026-08).

Design consequence: the publish script uses `pages.list` (filtered client-side to
`locale === <locale>` and `path === 'tabellify' || path.startsWith('tabellify/')`) to get each
page's `id` and `updatedAt`, and does **not** download remote content. Granting
`manage:pages` + `delete:pages` just to read content would let the key move and delete pages,
which the owner did not ask for.

Example query (shape follows [dev/api.md](https://github.com/Requarks/wiki-docs/blob/master/dev/api.md) "list all pages"):

```graphql
query ($locale: String) {
  pages {
    list(locale: $locale, orderBy: PATH) { id path locale title updatedAt }
  }
}
```

## 4. Creating a page

| | |
|---|---|
| **Schema** | `create(content: String!, description: String!, editor: String!, isPublished: Boolean!, isPrivate: Boolean!, locale: String!, path: String!, publishEndDate: Date, publishStartDate: Date, scriptCss: String, scriptJs: String, tags: [String]!, title: String!): PageResponse @auth(requires: ["write:pages", "manage:pages", "manage:system"])` |
| **Resolver / model** | [page.js](https://github.com/requarks/wiki/blob/v2.5.315/server/graph/resolvers/page.js) calls `WIKI.models.pages.createPage(...)`; success → `responseResult: graphHelper.generateSuccess('Page created successfully.')` plus `page`; failure → `graphHelper.generateError(err)`. [server/models/pages.js](https://github.com/requarks/wiki/blob/v2.5.315/server/models/pages.js) `createPage`: `checkAccess(opts.user, ['write:pages'], { locale, path })` (throws `PageDeleteForbidden` — the upstream code uses the "delete" error name here); rejects an existing `localeCode`+`path` with `PageDuplicateCreate`; rejects paths containing `.`, a space, `\` or `//` with `PageIllegalPath`; strips a leading/trailing slash; ignores `scriptCss`/`scriptJs` unless the user has `write:styles`/`write:scripts`. |
| **Verified for** | v2.5.315 |

Values the script sends: `editor: "markdown"`, `isPublished: true`, `isPrivate: false`,
`locale: "en"` (see open question in ADR-0010 amendment), `path: "tabellify/<slug>"`,
`tags: ["tabellify"]`, `title` from the page's first `# ` heading, `description` (see ADR).
**UNVERIFIED:** that omitting `publishStartDate`/`publishEndDate` is accepted by every
2.5.x patch (both are optional in the schema at v2.5.315). Verify with the first `--publish`
of a single page.

## 5. Updating a page

| | |
|---|---|
| **Schema** | `update(id: Int!, content: String, description: String, editor: String, isPrivate: Boolean, isPublished: Boolean, locale: String, path: String, publishEndDate: Date, publishStartDate: Date, scriptCss: String, scriptJs: String, tags: [String], title: String): PageResponse @auth(requires: ["write:pages", "manage:pages", "manage:system"])` |
| **Model** | `updatePage`: loads the page by id (`Invalid Page Id` if missing); requires `write:pages` on the page's current path+locale (`PageUpdateForbidden`); if `path` or `locale` differ it calls `movePage` (needs `manage:pages`). Success message `'Page has been updated.'` |
| **Verified for** | v2.5.315 |

The script sends `id`, `content`, `title`, `description`, `tags`, `editor: "markdown"`,
`isPublished: true`, and **never** a different `path` or `locale` (no moves).

`pages.delete(id: Int!): DefaultResponse @auth(requires: ["delete:pages", "manage:system"])`
exists; the script never calls it and the key is not given `delete:pages`.

## 6. Response shape

```graphql
type PageResponse   { responseResult: ResponseStatus!, page: Page }
type ResponseStatus { succeeded: Boolean!, errorCode: Int!, slug: String!, message: String }
```
Source: [page.graphql](https://github.com/requarks/wiki/blob/v2.5.315/server/graph/schemas/page.graphql),
[common.graphql](https://github.com/requarks/wiki/blob/v2.5.315/server/graph/schemas/common.graphql) (v2.5.315).
Docs example: `"succeeded": true, "errorCode": 0, "slug": "success", "message": "The operation completed successfully"`
([dev/api.md](https://github.com/Requarks/wiki-docs/blob/master/dev/api.md)); page error
codes are in the 6xxx range.

Two kinds of failure, both returned with **HTTP 200**:
1. `@auth` rejection or resolver throw → top-level `errors: [{ message: "Forbidden" | ... }]`.
2. Mutation failure → `data.pages.create.responseResult.succeeded === false` with
   `errorCode` and `message`.
The script must check both and stop on the first failure.

## 7. Internal links and heading anchors (affects link rewriting)

Source: [server/modules/rendering/html-core/renderer.js (v2.5.315)](https://github.com/requarks/wiki/blob/v2.5.315/server/modules/rendering/html-core/renderer.js).
- A link without a leading `/` is **relative to the current page**:
  `/${this.page.path}/${href}` (or `/${href}` when the page path is `home`), unless the
  `absoluteLinks` setting is on. So GitHub-wiki links like `(Workspace)` on page
  `tabellify/getting-started` would point at `/tabellify/getting-started/Workspace`.
  **The script must rewrite them to absolute `/tabellify/workspace`.**
- With multilingual namespacing on, a leading-slash link without a locale gets the page's
  locale prepended.
- A link containing a `.` is treated as an asset link.
- Heading ids: `uslug($(elm).text())`; ids that start with a digit get an `h-` prefix
  (`h-${headerSlug}`); duplicates get `-1`, `-2`.
  **UNVERIFIED:** that `uslug` produces the same anchors as GitHub for every heading used in
  `docs/wiki/` (e.g. headings with apostrophes such as "Tabellify's own files"). Verify after
  the first publish by clicking each `#anchor` link, or by comparing against the page's
  table of contents.

## 8. Creating the API key (admin UI)

Source for flow and fields: [client/components/admin/admin-api-create.vue (v2.5.315)](https://github.com/requarks/wiki/blob/v2.5.315/client/components/admin/admin-api-create.vue),
[admin-api.vue](https://github.com/requarks/wiki/blob/v2.5.315/client/components/admin/admin-api.vue),
mutation `createApiKey(name: String!, expiration: String!, fullAccess: Boolean!, group: Int)`
in [authentication.graphql](https://github.com/requarks/wiki/blob/v2.5.315/server/graph/schemas/authentication.graphql).
- Expiration choices: `30d`, `90d`, `180d`, `1y`, `3y`.
- The create dialog refuses the Guests group (`admin:api.newKeyGuestGroupError`).
- English labels: 2.x loads UI text from its localization service, so the 2.x repo has only
  i18n keys. The English values below come from `server/locales/en.json` on the `vega`
  branch, which uses the same keys
  ([en.json, vega](https://github.com/requarks/wiki/blob/vega/server/locales/en.json)):
  "API Access", "Manage keys to access the API", "Enable API", "New API Key", "Name",
  "Expiration", "30 days" … "3 years", "Permission Scopes", "Full Access",
  "or use group permissions...", "Group", "The API key will have the same permissions as the
  selected group.", "Copy the key shown below as **it will NOT be shown again.**",
  "Generate", "Administration".
  **UNVERIFIED for the owner's 2.x install** — confirm on screen while doing the steps.
- Group editor labels are hard-coded English in 2.x and are verified:
  [admin-groups.vue](https://github.com/requarks/wiki/blob/v2.5.315/client/components/admin/admin-groups.vue)
  ("New Group", "Group Name", "Create"),
  [admin-groups-edit.vue](https://github.com/requarks/wiki/blob/v2.5.315/client/components/admin/admin-groups-edit.vue)
  (tabs "Settings", "Permissions", "Page Rules", "Users"; button "Update Group"),
  [admin-groups-edit-permissions.vue](https://github.com/requarks/wiki/blob/v2.5.315/client/components/admin/admin-groups-edit-permissions.vue)
  (checkboxes named by permission, e.g. `read:pages` "Can view pages, as specified in the
  Page Rules", `write:pages` "Can create / edit pages, as specified in the Page Rules"),
  [admin-groups-edit-rules.vue](https://github.com/requarks/wiki/blob/v2.5.315/client/components/admin/admin-groups-edit-rules.vue)
  ("Add Rule"; allow/deny is an icon toggle, green check = allow; match "Path Starts
  With...", "Path is Exactly...", "Path Matches Regex..."; locale select "Any Locale";
  field "Path"; roles "Read Pages", "Create + Edit Pages", "Rename / Move Pages",
  "Delete Pages", "View Pages Source").

### Least-privilege setup (recommended)

A dedicated group **Tabellify Docs Publisher**:
- **Permissions** tab: only `read:pages` and `write:pages` (untick the default
  `read:assets`, `read:comments`, `write:comments`). Nothing under Users or Administration.
- **Page Rules** tab: delete the default rule; add one **Allow** rule,
  match "Path Starts With...", path `tabellify`, locale `en` (or "Any Locale"),
  roles "Read Pages" + "Create + Edit Pages".
- **Users** tab: no users.
- API key: **Group** = Tabellify Docs Publisher (not Full Access), expiration 90 days.

What this key can do: list and read metadata of pages under `tabellify…`, create pages there,
overwrite their content. It cannot read page content through the API (section 3), move,
rename or delete pages, touch other paths, change navigation, users or settings.
Residual risk: with `write:pages` it can **overwrite** any page under `tabellify…`, so a
leaked key could deface the Tabellify docs; Wiki.js page history keeps the earlier versions.
