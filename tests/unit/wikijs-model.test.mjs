// Unit tests for scripts/wikijs-model.mjs, the pure part of the Wiki.js publish script
// (ADR-0010, amendment 1). No network, no key file, no git: every input is a string or
// plain object made here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../../scripts/wikijs-model.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NAMES = ["Home", "Getting-Started", "Workspace", "Troubleshooting", "Data-Safety-and-Privacy"];

// ---- file name → path ---------------------------------------------------------------

test("fileToWikiPath maps file names to lower-case wiki paths", () => {
  assert.deepEqual(M.fileToWikiPath("Home.md"), { name: "Home", slug: "", path: "tabellify" });
  assert.equal(M.fileToWikiPath("Getting-Started.md").path, "tabellify/getting-started");
  assert.equal(M.fileToWikiPath("Data-Safety-and-Privacy.md").path, "tabellify/data-safety-and-privacy");
  assert.equal(M.fileToWikiPath("FAQ.md").path, "tabellify/faq");
});

test("fileToWikiPath skips _ files and non-Markdown files", () => {
  assert.equal(M.fileToWikiPath("_Sidebar.md"), null);
  assert.equal(M.fileToWikiPath("_Footer.md"), null);
  assert.equal(M.fileToWikiPath("notes.txt"), null);
});

test("fileToWikiPath refuses names Wiki.js rejects (dot, space, backslash)", () => {
  assert.throws(() => M.fileToWikiPath("v1.0-Notes.md"), /illegal/);
  assert.throws(() => M.fileToWikiPath("Two Words.md"), /illegal/);
  assert.throws(() => M.fileToWikiPath("a\\b.md"), /illegal/);
});

// ---- title / description ------------------------------------------------------------

test("extractTitle takes the first H1 and removes it from the body", () => {
  const { title, body } = M.extractTitle("# Getting Started\n\nIntro text.\n\n## Install\n");
  assert.equal(title, "Getting Started");
  assert.equal(body, "Intro text.\n\n## Install\n");
});

test("extractTitle ignores '#' lines inside code fences and fails without a title", () => {
  const { title } = M.extractTitle("```sh\n# not a title\n```\n\n# Real\n");
  assert.equal(title, "Real");
  assert.throws(() => M.extractTitle("## Only H2\n"), /no '# ' title/);
});

test("extractDescription uses the first sentence of the intro paragraph, without Markdown", () => {
  const body = "> a note\n\nTabellify is a **Zotero** plugin; see [Workspace](Workspace). More text.\n\n## Later\n";
  assert.equal(M.extractDescription(body, "fb"), "Tabellify is a Zotero plugin; see Workspace.");
});

test("extractDescription does not cut at e.g. and joins wrapped lines", () => {
  assert.equal(M.extractDescription("Tags, e.g. heat, are\nused here. Second.", "fb"), "Tags, e.g. heat, are used here.");
});

test("extractDescription falls back when the page starts with a heading", () => {
  assert.equal(M.extractDescription("## Installing\n\nZotero shows a message.\n", "Fallback."), "Fallback.");
  assert.equal(M.extractDescription("> only a quote\n", "Fallback."), "Fallback.");
});

test("extractDescription caps very long sentences", () => {
  const d = M.extractDescription(`${"word ".repeat(100)}end.`, "fb");
  assert.ok(d.length <= M.MAX_DESCRIPTION, `length ${d.length}`);
  assert.ok(d.endsWith("…"));
});

// ---- link rewriting -----------------------------------------------------------------

test("rewriteLinks turns wiki links into absolute /tabellify paths, keeping anchors", () => {
  const md = "See [Workspace](Workspace), [fix](Troubleshooting#could-not-be-installed) and [home](Home).";
  const { content, errors } = M.rewriteLinks(md, NAMES);
  assert.deepEqual(errors, []);
  assert.equal(
    content,
    "See [Workspace](/tabellify/workspace), [fix](/tabellify/troubleshooting#could-not-be-installed) and [home](/tabellify).",
  );
});

test("rewriteLinks leaves full URLs, mailto, same-page anchors and absolute paths alone", () => {
  const md = "[a](https://example.com/X) [b](mailto:x@example.com) [c](#section) [d](/other/page)";
  const { content, errors } = M.rewriteLinks(md, NAMES);
  assert.deepEqual(errors, []);
  assert.equal(content, md);
});

test("rewriteLinks keeps a link title and handles reference definitions", () => {
  const { content } = M.rewriteLinks('[w](Workspace "The tab")\n\n[ref]: Getting-Started#install\n', NAMES);
  assert.equal(content, '[w](/tabellify/workspace "The tab")\n\n[ref]: /tabellify/getting-started#install\n');
});

test("rewriteLinks does not touch code blocks or inline code", () => {
  const md = "```md\n[x](Workspace)\n```\nUse `[x](Workspace)` like [x](Workspace).";
  const { content } = M.rewriteLinks(md, NAMES);
  assert.equal(content, "```md\n[x](Workspace)\n```\nUse `[x](Workspace)` like [x](/tabellify/workspace).");
});

test("rewriteLinks reports links to missing pages and relative file links", () => {
  const { errors } = M.rewriteLinks("[a](Nope)\n[b](../src/x.js)\n[c](image.png)", NAMES);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /line 1: link to missing page "Nope"/);
  assert.match(errors[1], /line 2: relative link/);
  assert.match(errors[2], /line 3: relative link/);
});

test("every link in docs/wiki resolves (the real pages publish without errors)", () => {
  const dir = join(repo, "docs", "wiki");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const names = files.map((f) => M.fileToWikiPath(f)).filter(Boolean).map((x) => x.name);
  for (const f of files) {
    if (!M.fileToWikiPath(f)) continue;
    const { body } = M.extractTitle(readFileSync(join(dir, f), "utf8"));
    assert.deepEqual(M.rewriteLinks(body, names).errors, [], f);
  }
});

test("compareSidebarAndHome lists pages linked from only one of the two", () => {
  const side = "**[Home](Home)**\n- [A](Page-A)\n- [B](Page-B)\n";
  const home = "- [A](Page-A#x)\n- [C](Page-C)\n";
  assert.deepEqual(M.compareSidebarAndHome(side, home), { onlyInSidebar: ["Page-B"], onlyInHome: ["Page-C"] });
});

// ---- key file -----------------------------------------------------------------------

const GOOD_ENV = "# comment\nWIKIJS_URL=https://wiki.example.com\nWIKIJS_TOKEN=abc.def.ghi\nWIKIJS_LOCALE=en\n";

test("parseEnvFile reads exactly the three settings", () => {
  assert.deepEqual(M.parseEnvFile(GOOD_ENV), { url: "https://wiki.example.com", token: "abc.def.ghi", locale: "en" });
  assert.equal(M.parseEnvFile('WIKIJS_URL="https://w.example"\nWIKIJS_TOKEN=t\nWIKIJS_LOCALE=en').url, "https://w.example");
});

test("parseEnvFile rejects unknown, duplicate and missing settings without echoing values", () => {
  assert.throws(() => M.parseEnvFile(`${GOOD_ENV}OTHER=1\n`), /line 5: unknown setting/);
  assert.throws(() => M.parseEnvFile(`${GOOD_ENV}WIKIJS_LOCALE=de\n`), /set twice/);
  assert.throws(() => M.parseEnvFile("WIKIJS_URL=https://w.example\nWIKIJS_LOCALE=en"), /WIKIJS_TOKEN is missing/);
  try {
    M.parseEnvFile("secret-token-on-its-own-line\n");
    assert.fail("should throw");
  } catch (e) {
    assert.match(e.message, /line 1: expected NAME=value/);
    assert.doesNotMatch(e.message, /secret-token/);
  }
});

test("validateConfig accepts an https origin and builds the GraphQL endpoint", () => {
  assert.deepEqual(M.validateConfig({ url: "https://wiki.example.com/", token: "t", locale: "en" }), {
    endpoint: "https://wiki.example.com/graphql",
    origin: "https://wiki.example.com",
  });
});

test("validateConfig refuses http, credentials in the URL, paths, bad tokens and locales", () => {
  const base = { url: "https://wiki.example.com", token: "t", locale: "en" };
  assert.throws(() => M.validateConfig({ ...base, url: "http://wiki.example.com" }), /https/);
  assert.throws(() => M.validateConfig({ ...base, url: "https://u:p@wiki.example.com" }), /user name/);
  assert.throws(() => M.validateConfig({ ...base, url: "https://wiki.example.com/tabellify" }), /site address only/);
  assert.throws(() => M.validateConfig({ ...base, url: "not a url" }), /valid URL/);
  assert.throws(() => M.validateConfig({ ...base, token: "a b" }), /spaces/);
  assert.throws(() => M.validateConfig({ ...base, locale: "../x" }), /locale/);
});

test("isPrivateMode allows only owner permissions", () => {
  assert.equal(M.isPrivateMode(0o100600), true);
  assert.equal(M.isPrivateMode(0o100400), true);
  assert.equal(M.isPrivateMode(0o100640), false);
  assert.equal(M.isPrivateMode(0o100604), false);
  assert.equal(M.isPrivateMode(0o100644), false);
});

test("isInsideDir detects files inside the repository", () => {
  assert.equal(M.isInsideDir("/repo/build/wikijs.env", "/repo"), true);
  assert.equal(M.isInsideDir("/repo/.env", "/repo"), true);
  assert.equal(M.isInsideDir("/home/me/.config/tabellify/wikijs.env", "/repo"), false);
  assert.equal(M.isInsideDir("/repo-other/wikijs.env", "/repo"), false);
});

test("scrubSecret removes the token, bearer headers and JWT-shaped strings", () => {
  const token = "s3cr3t-token-value";
  const text = `failed with ${token}; header Authorization: Bearer abc123; jwt eyJhbGc.eyJzdWIi.sig-part`;
  const out = M.scrubSecret(text, token);
  assert.doesNotMatch(out, /s3cr3t|abc123|eyJ/);
  assert.match(out, /\[REDACTED\]/);
  assert.equal(M.scrubSecret("nothing here", undefined), "nothing here");
});

// ---- command line -------------------------------------------------------------------

test("parseArgs: dry run by default, --publish, --only and --env", () => {
  assert.deepEqual(M.parseArgs([]), { publish: false, only: null, env: null, help: false });
  assert.deepEqual(M.parseArgs(["--publish", "--only", "/tabellify/faq/", "--env", "/x/k.env"]), {
    publish: true,
    only: "tabellify/faq",
    env: "/x/k.env",
    help: false,
  });
});

test("parseArgs rejects unknown arguments without echoing them (could be a token)", () => {
  assert.throws(() => M.parseArgs(["--token", "eyJsecret"]), (e) => /unknown argument #1/.test(e.message) && !/eyJ/.test(e.message));
  assert.throws(() => M.parseArgs(["--only"]), /needs a value/);
  assert.throws(() => M.parseArgs(["--only", "--publish"]), /needs a value/);
});

// ---- plan ---------------------------------------------------------------------------

const page = (path) => ({ path, title: path, description: "d", content: "c", bytes: 1 });

test("filterRemotePages keeps only tabellify pages in the chosen locale", () => {
  const list = [
    { id: 1, path: "tabellify", locale: "en" },
    { id: 2, path: "tabellify/faq", locale: "en" },
    { id: 3, path: "tabellify-old", locale: "en" },
    { id: 4, path: "tabellify/faq", locale: "de" },
    { id: 5, path: "home", locale: "en" },
  ];
  assert.deepEqual(M.filterRemotePages(list, "en").map((p) => p.id), [1, 2]);
});

test("planPublish sorts pages into CREATE, UPDATE and LEFTOVER", () => {
  const remote = [
    { id: 1, path: "tabellify", locale: "en", updatedAt: "2026-01-01T00:00:00Z" },
    { id: 9, path: "tabellify/gone", locale: "en", title: "Gone", updatedAt: "2026-01-01T00:00:00Z" },
  ];
  const last = { publishedAt: "2026-02-01T00:00:00Z" };
  const { actions, leftovers } = M.planPublish([page("tabellify"), page("tabellify/new")], remote, last);
  assert.deepEqual(actions.map((a) => [a.op, a.page.path, a.warning]), [
    ["UPDATE", "tabellify", null],
    ["CREATE", "tabellify/new", null],
  ]);
  assert.deepEqual(leftovers.map((l) => l.path), ["tabellify/gone"]);
});

test("editWarning flags pages edited in the wiki after the last publish", () => {
  const r = { id: 1, path: "tabellify", locale: "en", updatedAt: "2026-03-01T00:00:00Z" };
  assert.match(M.editWarning(r, { publishedAt: "2026-02-01T00:00:00Z" }), /^EDITED IN WIKI/);
  assert.equal(M.editWarning(r, { publishedAt: "2026-04-01T00:00:00Z" }), null);
  // The per-page remote time recorded after our own publish wins over the publish time.
  assert.equal(M.editWarning(r, { publishedAt: "2026-01-01T00:00:00Z", pages: { tabellify: { remoteUpdatedAt: "2026-03-01T00:00:00Z" } } }), null);
  assert.match(M.editWarning(r, null), /^EXISTS IN WIKI/);
});

test("readLastPublish keeps only well-formed fields", () => {
  assert.equal(M.readLastPublish(null), null);
  assert.deepEqual(M.readLastPublish({ commit: "--evil", publishedAt: "nope", pages: { a: { remoteUpdatedAt: "2026-01-01T00:00:00Z", commit: "abc1234" }, b: 5 } }), {
    pages: { a: { remoteUpdatedAt: "2026-01-01T00:00:00Z", commit: "abc1234" } },
  });
  assert.deepEqual(M.readLastPublish({ commit: "abc1234", publishedAt: "2026-01-01T00:00:00Z" }), { commit: "abc1234", publishedAt: "2026-01-01T00:00:00Z" });
});

// ---- GraphQL ------------------------------------------------------------------------

test("createPageRequest sends the agreed page settings", () => {
  const { query, variables } = M.createPageRequest(page("tabellify/faq"), "en");
  assert.match(query, /pages \{ create\(/);
  assert.deepEqual(variables, {
    content: "c",
    description: "d",
    editor: "markdown",
    isPublished: true,
    isPrivate: false,
    locale: "en",
    path: "tabellify/faq",
    tags: ["tabellify"],
    title: "tabellify/faq",
  });
});

test("updatePageRequest updates by id and never changes path or locale", () => {
  const remote = { id: 7, path: "tabellify/faq", locale: "en" };
  const { query, variables } = M.updatePageRequest(page("tabellify/faq"), remote);
  assert.match(query, /pages \{ update\(id: \$id/);
  assert.equal(variables.id, 7);
  assert.equal(variables.path, "tabellify/faq");
  assert.equal(variables.locale, "en");
  assert.throws(() => M.updatePageRequest(page("tabellify/other"), remote), /refusing to move/);
});

test("no request ever deletes or moves a page", () => {
  const all = [M.listPagesRequest("en"), M.createPageRequest(page("tabellify"), "en"), M.updatePageRequest(page("tabellify"), { id: 1, path: "tabellify", locale: "en" })];
  for (const r of all) assert.doesNotMatch(r.query, /delete|move|render/i);
});

test("checkResponse fails on top-level errors and on succeeded: false", () => {
  assert.throws(() => M.checkResponse({ errors: [{ message: "Forbidden" }] }, "create"), /pages.create: Forbidden/);
  assert.throws(
    () => M.checkResponse({ data: { pages: { update: { responseResult: { succeeded: false, errorCode: 6010, slug: "PageUpdateForbidden", message: "no" } } } } }, "update"),
    /errorCode 6010, PageUpdateForbidden/,
  );
  assert.throws(() => M.checkResponse({ data: { pages: { create: null } } }, "create"), /no responseResult/);
  assert.throws(() => M.checkResponse({ data: { pages: { list: null } } }, "list"), /unexpected response shape/);
  assert.throws(() => M.checkResponse("nope", "list"), /not JSON/);
});

test("checkResponse returns the result on success", () => {
  const list = [{ id: 1, path: "tabellify", locale: "en" }];
  assert.deepEqual(M.checkResponse({ data: { pages: { list } } }, "list"), list);
  const ok = { responseResult: { succeeded: true, errorCode: 0, slug: "success", message: "ok" }, page: { id: 3 } };
  assert.deepEqual(M.checkResponse({ data: { pages: { create: ok } } }, "create"), ok);
});
