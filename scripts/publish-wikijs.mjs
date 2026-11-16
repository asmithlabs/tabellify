#!/usr/bin/env node
// Publish docs/wiki/ to the Wiki.js site at <WIKIJS_URL>/tabellify (ADR-0010, amendment 1).
//
//   node scripts/publish-wikijs.mjs                       dry run: shows what would change
//   node scripts/publish-wikijs.mjs --only tabellify/faq  dry run for one page
//   node scripts/publish-wikijs.mjs --publish [--only <path>]   writes (owner's OK needed)
//   node scripts/publish-wikijs.mjs --env <file>          use another key file
//
// What it never does: delete, move or rename pages; read the token from the command line
// or environment; print the token; follow redirects; talk to anything but HTTPS.
//
// The pure logic (paths, titles, links, key-file checks, GraphQL shapes) lives in
// scripts/wikijs-model.mjs and is unit-tested; this file does the I/O around it.
// Node built-ins and the global fetch() only (no dependencies).

import { readFileSync, readdirSync, realpathSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  WIKI_ROOT,
  fileToWikiPath,
  extractTitle,
  extractDescription,
  rewriteLinks,
  compareSidebarAndHome,
  parseEnvFile,
  validateConfig,
  isPrivateMode,
  isInsideDir,
  scrubSecret,
  parseArgs,
  filterRemotePages,
  planPublish,
  readLastPublish,
  listPagesRequest,
  createPageRequest,
  updatePageRequest,
  checkResponse,
} from "./wikijs-model.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const WIKI_DIR = join(REPO, "docs", "wiki");
const RECORD_FILE = join(REPO, "build", "wikijs-last-publish.json");
const DEFAULT_ENV = join(homedir(), ".config", "tabellify", "wikijs.env");
const TIMEOUT_MS = 30_000;

// Set once the key file is read; every message printed goes through scrubSecret with it.
let TOKEN;
const out = (msg = "") => console.log(scrubSecret(msg, TOKEN));
const warn = (msg) => console.error(scrubSecret(`WARN ${msg}`, TOKEN));

const HELP = `Usage: node scripts/publish-wikijs.mjs [--only <wiki path>] [--env <key file>] [--publish]

Without --publish this is a dry run: it reads the wiki's page list and prints what would be
created or updated. Nothing is written.

  --only <path>   limit to one page, e.g. --only tabellify/getting-started
  --env <file>    key file (default ~/.config/tabellify/wikijs.env, mode 600, outside the repo)
  --publish       create/update pages. Only from a clean main that equals origin/main,
                  and only with the owner's OK for this publish.`;

/** Run git read-only and return trimmed stdout. execFileSync passes args without a shell. */
function git(...args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// ---- local pages --------------------------------------------------------------------

function loadLocalPages() {
  const files = readdirSync(WIKI_DIR).filter((f) => f.endsWith(".md")).sort();
  const mapped = files.map((f) => ({ file: f, map: fileToWikiPath(f) })).filter((x) => x.map);
  const names = mapped.map((x) => x.map.name);
  const errors = [];
  const pages = [];
  for (const { file, map } of mapped) {
    try {
      const raw = readFileSync(join(WIKI_DIR, file), "utf8").replace(/\r\n/g, "\n");
      const { title, body } = extractTitle(raw);
      const { content, errors: linkErrors } = rewriteLinks(body, names);
      for (const e of linkErrors) errors.push(`${file}: ${e}`);
      const description = extractDescription(body, `Tabellify documentation: ${title}.`);
      pages.push({ path: map.path, title, description, content, bytes: Buffer.byteLength(content, "utf8") });
    } catch (e) {
      errors.push(`${file}: ${e.message}`);
    }
  }
  return { pages, errors };
}

function sidebarCheck() {
  const sidebar = join(WIKI_DIR, "_Sidebar.md");
  const home = join(WIKI_DIR, "Home.md");
  if (!existsSync(sidebar) || !existsSync(home)) return;
  const { onlyInSidebar, onlyInHome } = compareSidebarAndHome(readFileSync(sidebar, "utf8"), readFileSync(home, "utf8"));
  for (const n of onlyInSidebar) warn(`_Sidebar.md lists ${n} but Home.md does not`);
  for (const n of onlyInHome) warn(`Home.md lists ${n} but _Sidebar.md does not`);
}

// ---- key file -----------------------------------------------------------------------

function loadConfig(envPath) {
  let real;
  try {
    real = realpathSync(envPath);
  } catch {
    throw new Error(`key file not found: ${envPath} (see docs/development.md, "Publishing the docs")`);
  }
  if (isInsideDir(real, realpathSync(REPO))) throw new Error("key file must be outside the repository");
  const st = statSync(real);
  if (!st.isFile()) throw new Error("key file is not a regular file");
  if (!isPrivateMode(st.mode)) throw new Error(`key file must be readable by you only; run: chmod 600 ${envPath}`);
  if (typeof process.getuid === "function" && st.uid !== process.getuid()) throw new Error("key file must be owned by you");
  const cfg = parseEnvFile(readFileSync(real, "utf8"));
  TOKEN = cfg.token;
  return { ...cfg, ...validateConfig(cfg) };
}

// ---- last publish record ------------------------------------------------------------

function loadRecord() {
  if (!existsSync(RECORD_FILE)) return null;
  try {
    return readLastPublish(JSON.parse(readFileSync(RECORD_FILE, "utf8")));
  } catch {
    warn("build/wikijs-last-publish.json is unreadable; ignoring it");
    return null;
  }
}

function printGitDiff(record) {
  const commits = [record?.commit, ...Object.values(record?.pages ?? {}).map((p) => p.commit)].filter(Boolean);
  if (!commits.length) {
    out("No earlier publish recorded, so there is no git diff to show.");
    return;
  }
  const since = record.commit ?? commits[0];
  try {
    const stat = git("diff", "--stat", `${since}..HEAD`, "--", "docs/wiki");
    out(`Changes in docs/wiki since the last publish (${since.slice(0, 12)}${record.publishedAt ? `, ${record.publishedAt}` : ""}):`);
    out(stat || "  (none)");
  } catch {
    warn(`could not run git diff since ${since.slice(0, 12)} (commit not in this clone?)`);
  }
}

// ---- Wiki.js API (one function per call; see the Wiki.js 3.x note in the model) --------

async function graphql(cfg, body, op, label) {
  out(`  -> pages.${op}${label ? ` ${label}` : ""}`);
  let res;
  try {
    res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(body),
      // A redirect could send the Authorization header to another host: refuse it.
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`pages.${op}: request failed: ${e.cause?.message ?? e.message}`);
  }
  if (!res.ok) throw new Error(`pages.${op}: HTTP ${res.status}`);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`pages.${op}: response is not JSON`);
  }
  return checkResponse(json, op);
}

const listPages = (cfg) => graphql(cfg, listPagesRequest(cfg.locale), "list");
const createPage = (cfg, page) => graphql(cfg, createPageRequest(page, cfg.locale), "create", page.path);
const updatePage = (cfg, page, remote) => graphql(cfg, updatePageRequest(page, remote), "update", `id=${remote.id} ${page.path}`);

// ---- publish preconditions ------------------------------------------------------------

function checkCleanMain() {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") throw new Error(`--publish runs only on branch main (current: ${branch})`);
  if (git("status", "--porcelain") !== "") throw new Error("--publish needs a clean working tree (commit or stash first)");
  git("fetch", "--quiet", "origin", "main"); // read-only: updates origin/main only
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) throw new Error("--publish needs HEAD to equal origin/main (pull or push first)");
}

// ---- main -----------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return 0;
  }

  const { pages, errors } = loadLocalPages();
  if (errors.length) {
    for (const e of errors) console.error(`ERROR ${e}`);
    console.error("Nothing published: fix docs/wiki first.");
    return 1;
  }
  sidebarCheck();

  let selected = pages;
  if (opts.only !== null) {
    selected = pages.filter((p) => p.path === opts.only);
    if (!selected.length) throw new Error(`--only: no docs/wiki page maps to ${opts.only} (example: ${WIKI_ROOT}/getting-started)`);
  }

  if (opts.publish) checkCleanMain();
  const cfg = loadConfig(opts.env ?? DEFAULT_ENV);
  const record = loadRecord();

  out(`Wiki: ${cfg.origin}/${WIKI_ROOT} (locale ${cfg.locale})`);
  out(opts.publish ? "Mode: PUBLISH" : "Mode: DRY RUN (nothing is written)");

  const remote = filterRemotePages(await listPages(cfg), cfg.locale);
  // Plan over every local page so LEFTOVER is right even with --only.
  const { actions, leftovers } = planPublish(pages, remote, record);
  const chosen = actions.filter((a) => selected.includes(a.page));

  out("");
  for (const a of chosen) {
    out(`${a.op.padEnd(6)}  ${a.page.path}  "${a.page.title}"  ${a.page.bytes} bytes${a.remote ? `  (id ${a.remote.id})` : ""}`);
    if (a.warning) warn(`${a.warning}: ${a.page.path}`);
  }
  for (const l of leftovers) out(`LEFTOVER (delete by hand)  ${l.path}  "${l.title ?? ""}"`);
  out("");
  printGitDiff(record);

  if (!opts.publish) {
    out("");
    out("Dry run only. Nothing was written to the wiki.");
    return 0;
  }

  out("");
  const head = git("rev-parse", "HEAD");
  const published = [];
  for (const a of chosen) {
    // Stop at the first failure: the error says which page; nothing after it is sent.
    if (a.op === "CREATE") await createPage(cfg, a.page);
    else await updatePage(cfg, a.page, a.remote);
    published.push(a.page.path);
  }

  // Record what we published. The remote updatedAt read back now is what the next run
  // compares with to warn EDITED IN WIKI (no dependence on this computer's clock).
  const prev = record ?? {};
  const now = new Date().toISOString();
  const next = { ...(opts.only === null ? { commit: head, publishedAt: now } : { commit: prev.commit, publishedAt: prev.publishedAt }), pages: { ...(prev.pages ?? {}) } };
  let after = [];
  try {
    after = filterRemotePages(await listPages(cfg), cfg.locale);
  } catch (e) {
    warn(`published, but could not re-read the page list: ${e.message}`);
  }
  for (const path of published) {
    const r = after.find((p) => p.path === path);
    next.pages[path] = { commit: head, remoteUpdatedAt: r?.updatedAt ?? now };
  }
  mkdirSync(dirname(RECORD_FILE), { recursive: true });
  writeFileSync(RECORD_FILE, `${JSON.stringify(next, null, 2)}\n`);
  out(`Published ${published.length} page(s). Recorded in build/wikijs-last-publish.json.`);
  return 0;
}

// process.exitCode (not process.exit) lets Node finish writing output to a pipe first.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(scrubSecret(`ERROR ${e?.message ?? e}`, TOKEN));
    process.exitCode = 1;
  },
);
