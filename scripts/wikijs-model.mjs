// Pure helpers for scripts/publish-wikijs.mjs (ADR-0010, amendment 1).
//
// Everything here is plain data in, plain data out: no network, no file system, no git,
// no process globals. That is what lets tests/unit/wikijs-model.test.mjs run it in Node
// with no Wiki.js server and no key file. The publish script does all I/O and calls these.
//
// Wiki.js facts used here (paths, GraphQL shapes, link resolution) come from
// docs/wikijs-api-notes.md; section numbers in comments point there.

import { isAbsolute, relative } from "node:path";

/** Root path of the Tabellify docs on the wiki (no leading slash, as Wiki.js stores it). */
export const WIKI_ROOT = "tabellify";

/** Tag sent with every page (ADR-0010 amendment 1, decision 6). */
export const PAGE_TAGS = Object.freeze(["tabellify"]);

/**
 * Wiki.js 2.x stores the description in a short text column. The limit is not recorded in
 * docs/wikijs-api-notes.md (UNVERIFIED), so we stay well under the common 255 limit.
 */
export const MAX_DESCRIPTION = 250;

// ---------------------------------------------------------------------------------------
// File name → wiki path (ADR decision 4)
// ---------------------------------------------------------------------------------------

/**
 * Map a docs/wiki file name to its Wiki.js path.
 * Returns null for files that are never published (not .md, or name starts with "_").
 * Throws when the slug would be a path Wiki.js rejects (notes section 4: ".", space,
 * "\" and "//" are illegal).
 * @param {string} fileName e.g. "Getting-Started.md"
 * @param {string} [root]
 * @returns {{ name: string, slug: string, path: string } | null}
 */
export function fileToWikiPath(fileName, root = WIKI_ROOT) {
  if (!fileName.endsWith(".md") || fileName.startsWith("_")) return null;
  const name = fileName.slice(0, -".md".length);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
    throw new Error(`illegal wiki page file name: ${fileName} (use letters, digits and hyphens)`);
  }
  const slug = name.toLowerCase();
  if (slug === "home") return { name, slug: "", path: root };
  return { name, slug, path: `${root}/${slug}` };
}

/**
 * The wiki path a GitHub-wiki style link target ("Page-Name") points to.
 * @param {string} pageName
 * @param {string} [root]
 */
export function pageNameToPath(pageName, root = WIKI_ROOT) {
  const slug = pageName.toLowerCase();
  return slug === "home" ? root : `${root}/${slug}`;
}

// ---------------------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------------------

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Call `fn(line, index)` for every line outside fenced code blocks; fenced lines are
 * passed through unchanged. Returns the new text.
 * @param {string} text
 * @param {(line: string, index: number) => string} fn
 */
function mapProseLines(text, fn) {
  let fence = null; // the opening fence marker while inside a code block
  return text
    .split("\n")
    .map((line, i) => {
      const m = FENCE.exec(line);
      if (fence) {
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
        return line;
      }
      if (m) {
        fence = m[1];
        return line;
      }
      return fn(line, i);
    })
    .join("\n");
}

/**
 * Apply `fn` to the parts of a line that are not inline code (`like this`).
 * @param {string} line
 * @param {(prose: string) => string} fn
 */
function mapOutsideInlineCode(line, fn) {
  let out = "";
  let last = 0;
  // A code span starts with a run of backticks and ends at the same-length run.
  for (const m of line.matchAll(/(`+)[\s\S]*?\1/g)) {
    out += fn(line.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(line.slice(last));
}

/** Remove simple inline Markdown so text reads cleanly as a title or description. */
export function plainText(md) {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Take the first `# ` heading (outside code blocks) as the page title and remove it from
 * the body: Wiki.js shows the title above the page itself, so it would appear twice.
 * @param {string} markdown
 * @returns {{ title: string, body: string }}
 */
export function extractTitle(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      continue;
    }
    if (m) {
      fence = m[1];
      continue;
    }
    const h = /^#\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (h) {
      const title = plainText(h[1]);
      if (!title) break;
      const rest = [...lines.slice(0, i), ...lines.slice(i + 1)];
      // Drop blank lines left at the top so the body starts with content.
      while (rest.length && rest[0].trim() === "") rest.shift();
      return { title, body: rest.join("\n") };
    }
  }
  throw new Error("no '# ' title heading found");
}

// Abbreviations that end in a period but do not end a sentence.
const ABBREVIATIONS = ["e.g.", "i.e.", "etc.", "vs.", "cf.", "approx."];

/**
 * The first sentence of a paragraph of plain text.
 * @param {string} text
 */
export function firstSentence(text) {
  const re = /[.!?](?=\s|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const upTo = text.slice(0, m.index + 1);
    if (ABBREVIATIONS.some((a) => upTo.toLowerCase().endsWith(a))) continue;
    return upTo.trim();
  }
  return text.trim();
}

/**
 * Description = the first plain paragraph of the page's intro (before any heading; not a
 * list, table, quote, code or HTML), trimmed to one sentence and to MAX_DESCRIPTION
 * characters. Without such a paragraph, `fallback` is used.
 * Wiki.js requires a description (notes section 4: `description: String!`).
 * @param {string} body markdown without the title
 * @param {string} fallback used when the page has no plain paragraph
 */
export function extractDescription(body, fallback) {
  const lines = body.split("\n");
  let fence = null;
  /** @type {string[]} */
  let para = [];
  for (const line of lines) {
    const m = FENCE.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      continue;
    }
    if (m) {
      if (para.length) break;
      fence = m[1];
      continue;
    }
    const t = line.trim();
    // Only the page's intro counts: past the first heading the text describes one section,
    // not the page (e.g. Troubleshooting starts straight with "## Installing and opening").
    if (/^#{1,6}\s/.test(t)) break;
    const notProse = t === "" || /^([-*+]\s|\d+[.)]\s|>|\||<|!\[)/.test(t);
    if (notProse) {
      if (para.length) break;
      continue;
    }
    para.push(t);
  }
  let text = firstSentence(plainText(para.join(" "))) || fallback;
  if (text.length > MAX_DESCRIPTION) {
    const cut = text.slice(0, MAX_DESCRIPTION - 1);
    text = `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length)}…`;
  }
  return text;
}

// ---------------------------------------------------------------------------------------
// Link rewriting (ADR decision 6; notes section 7)
// ---------------------------------------------------------------------------------------

/**
 * Classify one link target.
 * @returns {"keep" | "page" | "unsupported"}
 */
function classifyTarget(target) {
  if (target === "" || target.startsWith("#") || target.startsWith("/")) return "keep";
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return "keep"; // https:, mailto:, zotero: …
  if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(target)) return "page";
  return "unsupported"; // relative file paths such as ../src/x.js or image.png
}

/**
 * Rewrite GitHub-wiki links to absolute Wiki.js paths.
 *
 * Why: Wiki.js resolves a link without a leading "/" relative to the current page, so
 * "(Workspace)" on tabellify/getting-started would point to
 * /tabellify/getting-started/Workspace (notes section 7). We turn it into /tabellify/workspace.
 *
 * Handles inline links `[text](Page)`, `[text](Page#anchor)`, `[text](Page "title")` and
 * reference definitions `[id]: Page`. Code blocks and inline code are left alone.
 *
 * @param {string} markdown
 * @param {Iterable<string>} pageNames file names without .md, e.g. "Getting-Started"
 * @param {string} [root]
 * @returns {{ content: string, errors: string[] }}
 */
export function rewriteLinks(markdown, pageNames, root = WIKI_ROOT) {
  const known = new Set([...pageNames].map((n) => n.toLowerCase()));
  /** @type {string[]} */
  const errors = [];

  const rewriteTarget = (target, anchor, lineNo) => {
    const kind = classifyTarget(target);
    if (kind === "keep") return null;
    if (kind === "unsupported") {
      errors.push(`line ${lineNo}: relative link "${target}" is not a wiki page; use a full https:// link`);
      return null;
    }
    if (!known.has(target.toLowerCase())) {
      errors.push(`line ${lineNo}: link to missing page "${target}" (no docs/wiki/${target}.md)`);
      return null;
    }
    return `/${pageNameToPath(target, root)}${anchor ?? ""}`;
  };

  const content = mapProseLines(markdown, (line, i) => {
    const lineNo = i + 1;
    // Reference definition: [id]: Target "optional title"
    const def = /^(\s{0,3}\[[^\]]+\]:\s*)([^\s#]*)(#\S*)?(.*)$/.exec(line);
    if (def && !line.trimStart().startsWith("[!")) {
      const next = rewriteTarget(def[2], def[3], lineNo);
      return next ? `${def[1]}${next}${def[4]}` : line;
    }
    return mapOutsideInlineCode(line, (prose) =>
      prose.replace(/\]\(([^)\s#]*)(#[^)\s]*)?(\s+"[^"]*")?\)/g, (whole, target, anchor, title) => {
        const next = rewriteTarget(target, anchor, lineNo);
        return next ? `](${next}${title ?? ""})` : whole;
      }),
    );
  });
  return { content, errors };
}

/**
 * Page names (link targets without anchors) linked from a Markdown page, for the
 * _Sidebar.md vs Home.md comparison. "Home" itself is ignored.
 * @param {string} markdown
 * @returns {Set<string>}
 */
export function linkedPageNames(markdown) {
  const names = new Set();
  mapProseLines(markdown, (line) =>
    mapOutsideInlineCode(line, (prose) => {
      for (const m of prose.matchAll(/\]\(([^)\s#]*)(#[^)\s]*)?(\s+"[^"]*")?\)/g)) {
        if (classifyTarget(m[1]) === "page" && m[1].toLowerCase() !== "home") names.add(m[1]);
      }
      return prose;
    }),
  );
  return names;
}

/**
 * Pages listed in one of _Sidebar.md / Home.md but not the other.
 * @returns {{ onlyInSidebar: string[], onlyInHome: string[] }}
 */
export function compareSidebarAndHome(sidebarMd, homeMd) {
  const side = linkedPageNames(sidebarMd);
  const home = linkedPageNames(homeMd);
  return {
    onlyInSidebar: [...side].filter((n) => !home.has(n)).sort(),
    onlyInHome: [...home].filter((n) => !side.has(n)).sort(),
  };
}

// ---------------------------------------------------------------------------------------
// Key file (ADR decisions 3 and 9)
// ---------------------------------------------------------------------------------------

const ENV_KEYS = ["WIKIJS_URL", "WIKIJS_TOKEN", "WIKIJS_LOCALE"];

/**
 * Parse the key file. Accepts exactly WIKIJS_URL, WIKIJS_TOKEN and WIKIJS_LOCALE, plus
 * blank lines and "#" comments. Error messages name the line number only, never the line
 * text, because that text could be the token.
 * @param {string} text
 * @returns {{ url: string, token: string, locale: string }}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const values = {};
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const m = /^([A-Z_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) throw new Error(`key file line ${i + 1}: expected NAME=value`);
    const [, key, rawValue] = m;
    if (!ENV_KEYS.includes(key)) throw new Error(`key file line ${i + 1}: unknown setting (allowed: ${ENV_KEYS.join(", ")})`);
    if (key in values) throw new Error(`key file line ${i + 1}: ${key} is set twice`);
    let value = rawValue.trim();
    const q = /^(["'])(.*)\1$/.exec(value);
    if (q) value = q[2];
    values[key] = value;
  });
  for (const key of ENV_KEYS) {
    if (!values[key]) throw new Error(`key file: ${key} is missing or empty`);
  }
  return { url: values.WIKIJS_URL, token: values.WIKIJS_TOKEN, locale: values.WIKIJS_LOCALE };
}

/**
 * Check the parsed settings. Returns the GraphQL endpoint URL.
 * - HTTPS only, and only a bare origin (no user:password, path, query or fragment), so the
 *   token can only go to that one host.
 * - Token: no whitespace (a pasted line break would otherwise end up in the header).
 * - Locale: a short code such as "en" or "pt-br".
 * @param {{ url: string, token: string, locale: string }} cfg
 * @returns {{ endpoint: string, origin: string }}
 */
export function validateConfig(cfg) {
  let u;
  try {
    u = new URL(cfg.url);
  } catch {
    throw new Error("WIKIJS_URL is not a valid URL");
  }
  if (u.protocol !== "https:") throw new Error("WIKIJS_URL must start with https://");
  if (u.username || u.password) throw new Error("WIKIJS_URL must not contain a user name or password");
  if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) {
    throw new Error("WIKIJS_URL must be the site address only, e.g. https://wiki.example.com");
  }
  if (/\s/.test(cfg.token)) throw new Error("WIKIJS_TOKEN must not contain spaces or line breaks");
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(cfg.locale)) throw new Error("WIKIJS_LOCALE must be a locale code such as en");
  return { endpoint: new URL("/graphql", u.origin).href, origin: u.origin };
}

/**
 * True when the permission bits give nothing to group or others (e.g. 0600 or 0400).
 * @param {number} mode stat mode
 */
export function isPrivateMode(mode) {
  return (mode & 0o077) === 0;
}

/**
 * True when `file` is `dir` or lies somewhere below it. Both should be real paths
 * (symlinks resolved) so a link cannot hide a key file inside the repository.
 */
export function isInsideDir(file, dir) {
  const rel = relative(dir, file);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Remove the token (and anything that looks like a bearer token or JWT) from text before
 * it is printed. Used on every error message the script shows.
 * @param {string} text
 * @param {string | undefined} secret
 */
export function scrubSecret(text, secret) {
  let out = String(text);
  if (secret) out = out.split(secret).join("[REDACTED]");
  return out
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED]");
}

// ---------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------

/**
 * Parse argv. The token is never accepted here: arguments show up in shell history and
 * `ps`. Unknown arguments are reported by position, not echoed (in case one is a token).
 * @param {string[]} argv
 * @returns {{ publish: boolean, only: string | null, env: string | null, help: boolean }}
 */
export function parseArgs(argv) {
  const opts = { publish: false, only: null, env: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--publish") opts.publish = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--only" || a === "--env") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} needs a value`);
      if (a === "--only") opts.only = v.replace(/^\/+|\/+$/g, "");
      else opts.env = v;
    } else throw new Error(`unknown argument #${i + 1} (see --help)`);
  }
  return opts;
}

// ---------------------------------------------------------------------------------------
// Plan (dry run)
// ---------------------------------------------------------------------------------------

/**
 * Keep only the remote pages that belong to the Tabellify docs in this locale.
 * The key's page rule "starts with tabellify" also matches e.g. "tabellify-old"
 * (notes section 2), so filter on the exact root or "root/".
 * @param {Array<{ id: number, path: string, locale: string, title?: string, updatedAt?: string }>} list
 */
export function filterRemotePages(list, locale, root = WIKI_ROOT) {
  return list.filter((p) => p && p.locale === locale && (p.path === root || String(p.path).startsWith(`${root}/`)));
}

/**
 * @typedef {{ path: string, title: string, description: string, content: string, bytes: number }} LocalPage
 * @typedef {{ id: number, path: string, locale: string, title?: string, updatedAt?: string }} RemotePage
 * @typedef {{ commit?: string, publishedAt?: string, pages?: Record<string, { remoteUpdatedAt?: string }> }} LastPublish
 */

/**
 * Decide CREATE or UPDATE per local page, find leftovers and edits made in the wiki.
 * @param {LocalPage[]} local
 * @param {RemotePage[]} remote already filtered with filterRemotePages
 * @param {LastPublish | null} last
 */
export function planPublish(local, remote, last) {
  const byPath = new Map(remote.map((p) => [p.path, p]));
  const localPaths = new Set(local.map((p) => p.path));
  const actions = local.map((page) => {
    const r = byPath.get(page.path);
    if (!r) return { op: "CREATE", page, remote: null, warning: null };
    return { op: "UPDATE", page, remote: r, warning: editWarning(r, last) };
  });
  const leftovers = remote.filter((p) => !localPaths.has(p.path)).sort((a, b) => a.path.localeCompare(b.path));
  return { actions, leftovers };
}

/**
 * "EDITED IN WIKI" when the remote page changed after we last published it.
 * Compares against the remote updatedAt we recorded right after our own publish (immune to
 * clock differences between this computer and the server), else the recorded publish time.
 * @param {RemotePage} r
 * @param {LastPublish | null} last
 * @returns {string | null}
 */
export function editWarning(r, last) {
  const remoteTime = Date.parse(r.updatedAt ?? "");
  if (Number.isNaN(remoteTime)) return null;
  const recorded = last?.pages?.[r.path]?.remoteUpdatedAt ?? last?.publishedAt;
  if (!recorded) return "EXISTS IN WIKI (no earlier publish recorded; publishing overwrites it)";
  const recordedTime = Date.parse(recorded);
  if (Number.isNaN(recordedTime)) return null;
  return remoteTime > recordedTime ? `EDITED IN WIKI (remote updated ${r.updatedAt}; publishing overwrites that edit)` : null;
}

/**
 * Validate the contents of build/wikijs-last-publish.json; returns null when unusable.
 * @param {unknown} data
 * @returns {LastPublish | null}
 */
export function readLastPublish(data) {
  if (!data || typeof data !== "object") return null;
  const d = /** @type {any} */ (data);
  const out = {};
  if (typeof d.commit === "string" && /^[0-9a-f]{7,40}$/.test(d.commit)) out.commit = d.commit;
  if (typeof d.publishedAt === "string" && !Number.isNaN(Date.parse(d.publishedAt))) out.publishedAt = d.publishedAt;
  if (d.pages && typeof d.pages === "object") {
    out.pages = {};
    for (const [path, v] of Object.entries(d.pages)) {
      if (v && typeof v === "object" && typeof v.remoteUpdatedAt === "string") {
        out.pages[path] = { remoteUpdatedAt: v.remoteUpdatedAt, ...(typeof v.commit === "string" && /^[0-9a-f]{7,40}$/.test(v.commit) ? { commit: v.commit } : {}) };
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// GraphQL requests and responses (notes sections 3–6)
//
// The Wiki.js 2.x API layer is just these three request builders and checkResponse. If the
// wiki is upgraded to Wiki.js 3.x (no GraphQL), this is the part to rewrite.
// ---------------------------------------------------------------------------------------

export function listPagesRequest(locale) {
  return {
    query: "query ($locale: String) { pages { list(locale: $locale, orderBy: PATH) { id path locale title updatedAt } } }",
    variables: { locale },
  };
}

/** @param {LocalPage} page */
export function createPageRequest(page, locale) {
  return {
    query:
      "mutation ($content: String!, $description: String!, $editor: String!, $isPublished: Boolean!, $isPrivate: Boolean!, $locale: String!, $path: String!, $tags: [String]!, $title: String!) " +
      "{ pages { create(content: $content, description: $description, editor: $editor, isPublished: $isPublished, isPrivate: $isPrivate, locale: $locale, path: $path, tags: $tags, title: $title) " +
      "{ responseResult { succeeded errorCode slug message } page { id } } } }",
    variables: {
      content: page.content,
      description: page.description,
      editor: "markdown",
      isPublished: true,
      isPrivate: false,
      locale,
      path: page.path,
      tags: [...PAGE_TAGS],
      title: page.title,
    },
  };
}

/**
 * Update an existing page by id. The path and locale sent are the remote page's own, so
 * they never differ and Wiki.js never treats the update as a move (notes section 5).
 * @param {LocalPage} page
 * @param {RemotePage} remote
 */
export function updatePageRequest(page, remote) {
  if (remote.path !== page.path) throw new Error(`refusing to move ${remote.path} to ${page.path}`);
  return {
    query:
      "mutation ($id: Int!, $content: String, $description: String, $editor: String, $isPublished: Boolean, $isPrivate: Boolean, $locale: String, $path: String, $tags: [String], $title: String) " +
      "{ pages { update(id: $id, content: $content, description: $description, editor: $editor, isPublished: $isPublished, isPrivate: $isPrivate, locale: $locale, path: $path, tags: $tags, title: $title) " +
      "{ responseResult { succeeded errorCode slug message } } } }",
    variables: {
      id: remote.id,
      content: page.content,
      description: page.description,
      editor: "markdown",
      isPublished: true,
      isPrivate: false,
      locale: remote.locale,
      path: remote.path,
      tags: [...PAGE_TAGS],
      title: page.title,
    },
  };
}

/**
 * Check a GraphQL response body. Wiki.js returns HTTP 200 for both failure kinds
 * (notes section 6): top-level `errors`, and responseResult.succeeded === false.
 * Returns the operation's result object; throws on any failure.
 * @param {any} json parsed response body
 * @param {"list" | "create" | "update"} op
 */
export function checkResponse(json, op) {
  if (!json || typeof json !== "object") throw new Error(`pages.${op}: response is not JSON`);
  if (Array.isArray(json.errors) && json.errors.length) {
    const msg = json.errors.map((e) => (e && typeof e.message === "string" ? e.message : "unknown error")).join("; ");
    throw new Error(`pages.${op}: ${msg}`);
  }
  const result = json.data?.pages?.[op];
  if (op === "list") {
    if (!Array.isArray(result)) throw new Error("pages.list: unexpected response shape");
    return result;
  }
  const rr = result?.responseResult;
  if (!rr || typeof rr !== "object") throw new Error(`pages.${op}: response has no responseResult`);
  if (rr.succeeded !== true) {
    throw new Error(`pages.${op}: failed (errorCode ${rr.errorCode ?? "?"}, ${rr.slug ?? "?"}): ${rr.message ?? "no message"}`);
  }
  return result;
}
