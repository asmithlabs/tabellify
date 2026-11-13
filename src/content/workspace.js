/* Tabellify — workspace.js (F003 collection browser + F004 codebook + F005 tag monitor)
 *
 * Runs inside chrome://tabellify/content/workspace.xhtml, both when that document is shown
 * in the main-window tab (inside an <iframe>) and in the F001 fallback window.
 * workspace.xhtml loads Zotero's include.js first, which gives this document the global
 * `Zotero` object (docs/zotero-api-notes.md, include.js row).
 *
 * What it does:
 * - F003: fills a dropdown with every collection in My Library.
 * - F005: when the user picks a collection, reads its papers AND those of all its
 *   subcollections, with their manual tags and the tags on their highlights, and compares
 *   them with the codebook: "Tags used N/M", used/remaining tags per group, and a per-paper
 *   table (which replaced the F003 item list) with "k/M" and a "Show remaining" toggle.
 *   The comparison itself is pure logic in tag-monitor-model.js (TabellifyTagMonitor).
 * - F004: shows and edits the codebook (super-tag groups and their planned tags). The rules
 *   live in codebook-model.js (TabellifyCodebook); the file is read and written by
 *   codebook-store.js (TabellifyCodebookStore): Tabellify's own codebooks.json in
 *   <Zotero data directory>/tabellify/ (ADR-0012). workspace.xhtml loads both first.
 *
 * THE LIBRARY IS READ-ONLY. Every Zotero call here only reads (see the "Read-only
 * guarantee" row in docs/zotero-api-notes.md). Nothing is saved, changed or deleted in the
 * library: adding a tag to the codebook does NOT create a Zotero tag.
 *
 * SECURITY. Collection names, titles and tags come from the user's library and from
 * synced/imported data, and codebooks.json can be edited by hand, so treat them all as
 * untrusted text. This document has full (chrome)
 * privileges, so library text parsed as markup could run code with those privileges.
 * Therefore library text is only ever put on the page as TEXT: `element.textContent = …`
 * or `new Option(text, value)`. The browser never parses those as HTML.
 * (tests/static/no-html-sinks.test.mjs fails if a markup-parsing API appears in src/.)
 *
 * Lifecycle: everything here lives exactly as long as this document. The DOM listeners
 * are on this document's own window and elements, and they are removed on "unload".
 * F005 adds two things with a life of their own, both ended in onUnload:
 * - one Zotero.Notifier observer (Zotero keeps it in a global list, so it would outlive
 *   this document if we did not unregister it; it also unregisters itself if it is ever
 *   called after this document is gone);
 * - at most one pending debounce timer of this window (cleared).
 * Nothing is added to the main window, so bootstrap.js has nothing to undo. When the
 * plugin shuts down, tabellify.js closes this tab/window, which runs onUnload.
 *
 * Why the pure helpers live in this file and not in src/modules/: bootstrap.js registers
 * only src/content/ as chrome://tabellify/content/, so a file in src/modules/ has no URL
 * this document could load it from. Making one would need a bootstrap.js change (outside
 * this task). The helpers below use no Zotero or DOM globals, and
 * tests/unit/workspace-helpers.test.mjs runs them in Node.
 */
"use strict";

/**
 * One global object, so our names cannot clash with the globals include.js defines
 * (`Zotero`, `require`). `var` makes it a property of the window (and of the Node test's
 * sandbox), which the unit test relies on.
 */
var TabellifyWorkspace = {
  // ---------------------------------------------------------------------------------------
  // Pure helpers (no Zotero, no DOM): unit-tested in tests/unit/workspace-helpers.test.mjs
  // ---------------------------------------------------------------------------------------

  /**
   * Dropdown label for a collection, indented by its depth in the tree.
   * Uses NO-BREAK SPACEs (U+00A0): the dropdown would collapse ordinary leading spaces.
   * @param {string} name   Collection name (untrusted; returned as plain text)
   * @param {number | undefined | null} level  0 = top level, 1 = child, …
   * @returns {string}
   */
  indentLabel(name, level) {
    const depth = Number.isInteger(level) && level > 0 ? level : 0;
    return "   ".repeat(depth) + String(name ?? "");
  },

  /**
   * Turn collections into dropdown entries, keeping their order (Zotero already returns
   * them depth-first, each parent followed by its children, sorted by name).
   * @param {Array<{ id: number, name: string, level?: number }>} collections
   * @returns {Array<{ value: string, label: string }>}
   */
  collectionOptions(collections) {
    // `level ?? 0`: `level` is an undocumented property Zotero adds; fall back to top level.
    return collections.map((c) => ({
      value: String(c.id),
      label: TabellifyWorkspace.indentLabel(c.name, c.level ?? 0),
    }));
  },

  /**
   * Comma-separated tag names, de-duplicated (a manual and an automatic tag can share a
   * name) and sorted alphabetically, ignoring case.
   * @param {Array<{ tag: string, type?: number }>} tags  Shape returned by item.getTags()
   * @returns {string}
   */
  joinTags(tags) {
    const names = [...new Set(tags.map((t) => String(t.tag ?? "")).filter((n) => n !== ""))];
    names.sort(TabellifyWorkspace.compareText);
    return names.join(", ");
  },

  /**
   * Compare two strings for sorting the way people expect: ignore case and accents,
   * and "Item 2" before "Item 10" (`numeric`).
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  compareText(a, b) {
    return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  },

  /**
   * Rows for the F003 items table, sorted by title. Empty titles get `untitledText` and sort
   * last. Since F005 the per-paper table is built from TabellifyTagMonitor instead; this
   * helper is kept (unused) because tests/unit/workspace-helpers.test.mjs still covers it.
   * @param {Array<{ title: string, tags: Array<{ tag: string, type?: number }> }>} items
   * @param {string} untitledText  Localized "(untitled)"
   * @returns {Array<{ title: string, tags: string, untitled: boolean }>}
   */
  itemRows(items, untitledText) {
    const rows = items.map((i) => {
      const title = String(i.title ?? "").trim();
      return {
        title: title || untitledText,
        tags: TabellifyWorkspace.joinTags(i.tags ?? []),
        untitled: title === "",
      };
    });
    rows.sort((a, b) => (a.untitled - b.untitled) || TabellifyWorkspace.compareText(a.title, b.title));
    return rows;
  },

  // ---------------------------------------------------------------------------------------
  // Document code (uses Zotero and the DOM; checked by the owner's smoke test)
  // ---------------------------------------------------------------------------------------

  /**
   * Counts collection choices. Loading items is async, so if the user picks collection A
   * and then quickly B, A's result could arrive after B's. Each load remembers the number
   * it started with and drops its result if a newer choice was made meanwhile.
   */
  requestCounter: 0,

  /** Localized "(untitled)", read once in init(). */
  untitledText: "",

  /** @param {string} message */
  log(message) {
    Zotero.debug(`Tabellify: workspace: ${message}`);
  },

  /** @param {string} id */
  el(id) {
    return document.getElementById(id);
  },

  /**
   * Show exactly one status message (or none, with `null`) and hide the others.
   * @param {string | null} id
   */
  showStatus(id) {
    for (const p of document.querySelectorAll(".tabellify-status")) {
      p.hidden = p.id !== id;
    }
  },

  /**
   * Start-up, called on the window's "load" event.
   *
   * `async` + `await`: some Zotero calls return a Promise (a value that arrives later).
   * `await` pauses THIS function until the value is ready, without freezing Zotero's UI;
   * other code keeps running meanwhile. If the Promise fails, `await` throws, and the
   * `catch` below handles it like any other error.
   */
  async init() {
    const select = this.el("tabellify-collection-select");
    select.addEventListener("change", this.onCollectionChange);
    // F005: "Refresh", and one delegated click listener on the per-paper table (sort
    // buttons in the header, "Show remaining" toggles in the rows). Removed in onUnload.
    this.el("tabellify-monitor-refresh").addEventListener("click", this.onRefreshClick);
    this.el("tabellify-items-table").addEventListener("click", this.onTableClick);
    try {
      // Normally already resolved (the workspace opens from a menu, after Zotero started),
      // so this returns at once. It guarantees all collections are loaded.
      await Zotero.initializationPromise;

      // "(untitled)" is needed as plain text in table cells, so ask Fluent for the string.
      this.untitledText = (await document.l10n?.formatValue("tabellify-untitled")) ?? "";
      // F005: the tag monitor's texts, formatted once (see MONITOR_STRINGS).
      await this.formatStrings(this.MONITOR_STRINGS);
      this.monitorReady = true;
      this.renderMonitor();

      const libraryID = Zotero.Libraries.userLibraryID;
      // Synchronous: collections are kept in memory from start-up. `true` = include
      // subcollections, flattened depth-first, each with a `level` for indentation.
      const collections = Zotero.Collections.getByLibrary(libraryID, true);
      this.log(`listing ${collections.length} collection(s) in My Library`);

      if (collections.length === 0) {
        this.showStatus("tabellify-no-collections");
        return;
      }
      for (const { value, label } of this.collectionOptions(collections)) {
        // `new Option(text, value)` sets the text as plain text: a collection named
        // "<img onerror=…>" shows exactly those characters and is never run as markup.
        select.append(new Option(label, value));
      }
      select.disabled = false;
      // F005: from now on, library changes re-count the chosen collection (live updates).
      this.registerMonitorObserver();
    } catch (e) {
      this.showStatus("tabellify-load-error");
      Zotero.logError(e);
    }
  },

  /**
   * "change" handler of the dropdown. A DOM listener is called with `this` set to the
   * element, so the handler names `TabellifyWorkspace` directly instead of using `this`.
   * Being one fixed function object also lets onUnload remove exactly this listener.
   */
  onCollectionChange: (event) => {
    const W = TabellifyWorkspace;
    // A newly chosen collection starts in the default order, with every paper collapsed.
    W.sortKey = TabellifyTagMonitor.DEFAULT_SORT.key;
    W.sortDirection = TabellifyTagMonitor.DEFAULT_SORT.direction;
    W.expandedPaperIds.clear();
    W.showCollection(event.target.value, "collection chosen");
  },

  /**
   * Read the chosen collection (and its subcollections) from the library and show the tag
   * monitor and the per-paper table.
   *
   * `reason` is "collection chosen" when the user picks a collection: the old view is
   * cleared and "Loading items…" is shown. Any other reason ("refresh", "library change")
   * is a RECOMPUTE of the same collection: the current view stays on screen until the new
   * result replaces it, so it does not flicker.
   * @param {string} value  The chosen option's value (collection ID), "" for the placeholder
   * @param {string} reason  For Debug Output
   */
  async showCollection(value, reason) {
    const request = ++this.requestCounter;
    const recompute = reason !== "collection chosen";
    this.currentCollection = value;
    if (!recompute || value === "") {
      this.monitorData = null;
      this.el("tabellify-items-table").hidden = true;
      this.el("tabellify-items-body").replaceChildren(); // remove old rows (no markup involved)
      this.renderMonitor();
    }
    if (value === "") {
      this.showStatus(null);
      return;
    }
    if (!recompute) this.showStatus("tabellify-loading-items");
    try {
      const data = await this.gatherMonitorData(Number(value));
      if (request !== this.requestCounter) return; // a newer choice or recompute started
      this.monitorData = data;
      const result = this.renderMonitor();
      this.log(
        `tag monitor: recomputed for collection ${data.rootId} (${reason}): ` +
        `${result?.used ?? 0}/${result?.total ?? 0} codebook tag(s) used, ` +
        `${result?.paperCount ?? 0} paper(s) in ${data.scopeSize} collection(s)` +
        (data.annotationErrors > 0 ? `, highlights unreadable for ${data.annotationErrors} paper(s)` : ""),
      );
    } catch (e) {
      if (request !== this.requestCounter) return;
      this.monitorData = null;
      this.el("tabellify-items-table").hidden = true;
      this.el("tabellify-items-body").replaceChildren();
      this.renderMonitor();
      this.showStatus("tabellify-load-error");
      this.log(`tag monitor: could not read collection ${value} (${reason})`);
      Zotero.logError(e);
    }
  },

  // ---------------------------------------------------------------------------------------
  // Feature 005: Tag monitor (uses Zotero and the DOM; checked by the owner's smoke test).
  // The comparison rules are in tag-monitor-model.js (TabellifyTagMonitor, unit-tested).
  // ---------------------------------------------------------------------------------------

  /**
   * Fluent IDs the tag monitor shows from JavaScript, formatted once in init() into
   * `strings` (like CODEBOOK_STRINGS). They are plain values without Fluent variables:
   * numbers are added after the text in JavaScript ("Tags used" + " 2/4").
   * tests/static/workspace-script.test.mjs checks that each exists in tabellify.ftl.
   */
  MONITOR_STRINGS: [
    "tabellify-monitor-choose",
    "tabellify-monitor-codebook-empty",
    "tabellify-monitor-unavailable",
    "tabellify-monitor-annotations-error",
    "tabellify-monitor-tags-used",
    "tabellify-monitor-all-used",
    "tabellify-monitor-papers",
    "tabellify-monitor-used",
    "tabellify-monitor-remaining",
    "tabellify-monitor-present",
    "tabellify-monitor-none",
    "tabellify-monitor-paper-one",
    "tabellify-monitor-paper-other",
    "tabellify-monitor-show-remaining",
    "tabellify-monitor-hide-remaining",
  ],

  /** True once MONITOR_STRINGS are formatted; renderMonitor() waits for it. */
  monitorReady: false,

  /** The dropdown's current value (collection ID as text), "" when none is chosen. */
  currentCollection: "",

  /**
   * What gatherMonitorData() read for the current collection (plain objects), or null.
   * Kept so a codebook edit or a click on a sort button can re-render without reading the
   * library again.
   */
  monitorData: null,

  /** Per-paper table order (a TabellifyTagMonitor.SORT_KEYS value and "asc"/"desc"). */
  sortKey: "count",
  sortDirection: "asc",

  /** Item IDs of the papers whose "Show remaining" detail row is open. */
  expandedPaperIds: new Set(),

  /**
   * Format Fluent messages into `strings`. `await Promise.all(...)`: start every lookup at
   * once and wait until all have finished.
   * @param {string[]} ids
   */
  async formatStrings(ids) {
    const values = await Promise.all(ids.map((id) => document.l10n?.formatValue(id)));
    ids.forEach((id, i) => {
      if (values[i] != null) this.strings[id] = values[i];
    });
  },

  /**
   * Read, without changing anything, what the tag monitor needs for one collection:
   * the library's collection tree, and every regular item ("paper") in the chosen
   * collection and its subcollections with its item tags and the tags of its highlights.
   * Returns plain objects only (the shape TabellifyTagMonitor.summarize expects).
   * @param {number} rootId
   */
  async gatherMonitorData(rootId) {
    const root = Zotero.Collections.get(rootId);
    if (!root) throw new Error(`collection ${rootId} not found`);

    // Why waitForDataLoad: at start-up Zotero loads collections but NOT item data
    // (titles, tags, creators, attachments, annotations). Reading an item before that
    // throws "… not loaded for item …". This call loads the library's items into memory
    // once (it only reads the database), and returns at once if they are already loaded.
    // Annotations are items too, so this also covers highlights and their tags.
    await Zotero.Libraries.get(root.libraryID).waitForDataLoad("item");

    // A fresh snapshot of the collection tree (synchronous, in memory, no trashed
    // collections), so subcollections created since the last read are included.
    const collections = Zotero.Collections.getByLibrary(root.libraryID, true)
      .map((c) => ({ id: c.id, parentID: c.parentID, name: c.name }));
    const scope = TabellifyTagMonitor.descendantIds(collections, rootId);

    const papers = [];
    const read = new Map(); // item ID → what we read, so a paper in two collections is read once
    const allTags = new Map(); // item ID → "All tags" column text (F003)
    let annotationErrors = 0;
    for (const collectionId of scope) {
      const collection = Zotero.Collections.get(collectionId);
      if (!collection) continue;
      // Direct members only (subcollections are walked by this loop); trashed items are
      // left out. Notes and attachments can be members too, so keep only regular items.
      for (const item of collection.getChildItems()) {
        if (!item.isRegularItem()) continue;
        let entry = read.get(item.id);
        if (!entry) {
          const itemTags = item.getTags();
          let annotationTags = [];
          try {
            annotationTags = this.annotationTags(item);
          } catch (e) {
            // Show the paper with its item tags only, and say so above the table.
            annotationErrors++;
            this.log(`tag monitor: could not read the highlights of item ${item.id}; using its item tags only`);
            Zotero.logError(e);
          }
          entry = { title: item.getDisplayTitle(), itemTags, annotationTags };
          read.set(item.id, entry);
          allTags.set(item.id, this.joinTags(itemTags));
        }
        papers.push({ id: item.id, title: entry.title, collectionId, itemTags: entry.itemTags, annotationTags: entry.annotationTags });
      }
    }
    return { rootId, collections, papers, allTags, annotationErrors, scopeSize: scope.length };
  },

  /**
   * Tags on the highlights (and other annotations) of a paper's file attachments.
   * All read-only getters (docs/zotero-api-notes.md, F005 rows).
   * @param {object} item  A regular Zotero item
   * @returns {Array<{ tag: string, type?: number }>}
   */
  annotationTags(item) {
    const ids = item.getAttachments(); // IDs, not items; trashed attachments left out
    if (ids.length === 0) return [];
    const tags = [];
    for (const attachment of Zotero.Items.get(ids)) {
      // Only file attachments (PDF, EPUB, snapshot) have annotations; getAnnotations()
      // throws on link-only attachments.
      if (!attachment.isFileAttachment()) continue;
      for (const annotation of attachment.getAnnotations()) tags.push(...annotation.getTags());
    }
    return tags;
  },

  /**
   * "Heat index · 3 papers". The count and the word follow the tag as plain text.
   * @param {{ tag: string, papers: number }} used
   */
  usedTagLabel(used) {
    const word = this.text(used.papers === 1 ? "tabellify-monitor-paper-one" : "tabellify-monitor-paper-other");
    return `${used.tag} · ${used.papers} ${word}`;
  },

  /**
   * A labelled list of tags ("Remaining: Temperature, …"), built as elements with text only.
   * @param {string} labelId  Fluent ID of the label
   * @param {string[]} names
   * @param {string} className
   */
  tagList(labelId, names, className) {
    const box = this.html("div", `tabellify-monitor-list ${className}`);
    const label = this.html("span", "tabellify-monitor-list-label");
    label.textContent = this.text(labelId);
    const list = this.html("ul");
    if (names.length === 0) {
      const none = this.html("li", "tabellify-monitor-none");
      none.textContent = this.text("tabellify-monitor-none");
      list.append(none);
    }
    for (const name of names) {
      const li = this.html("li");
      li.textContent = name; // library/codebook text: plain text only (see SECURITY)
      list.append(li);
    }
    box.append(label, list);
    return box;
  },

  /**
   * Show the tag monitor and the per-paper table from `monitorData` and the current
   * codebook. Synchronous and read-only: it never reads the library, so it can run after
   * every codebook edit and every sort/toggle click.
   * @returns {ReturnType<typeof TabellifyTagMonitor.summarize> | null}
   */
  renderMonitor() {
    if (!this.monitorReady) return null;
    const message = this.el("tabellify-monitor-message");
    const summary = this.el("tabellify-monitor-summary");
    const warning = this.el("tabellify-monitor-warning");
    const groupsEl = this.el("tabellify-monitor-groups");
    const table = this.el("tabellify-items-table");
    groupsEl.replaceChildren();

    const setMessage = (id) => {
      message.hidden = id === null;
      message.textContent = id === null ? "" : this.text(id);
    };
    const data = this.monitorData;
    if (this.currentCollection === "") setMessage("tabellify-monitor-choose");
    else if (this.codebookLoadDone && !this.codebook) setMessage("tabellify-monitor-unavailable");
    else setMessage(null);
    if (!data) {
      summary.hidden = true;
      warning.hidden = true;
      return null;
    }

    const result = TabellifyTagMonitor.summarize(this.codebook, data.collections, data.rootId, data.papers);
    // Counts make sense only with a loaded codebook that has tags.
    const counting = Boolean(this.codebook) && result.total > 0;
    if (this.codebook && result.total === 0) setMessage("tabellify-monitor-codebook-empty");

    summary.hidden = !counting;
    this.el("tabellify-monitor-used").textContent =
      `${this.text("tabellify-monitor-tags-used")} ${result.used}/${result.total}`;
    const allUsed = this.el("tabellify-monitor-all-used");
    allUsed.hidden = !result.allUsed;
    allUsed.textContent = this.text("tabellify-monitor-all-used");
    this.el("tabellify-monitor-papers").textContent =
      `${this.text("tabellify-monitor-papers")} ${result.paperCount}`;
    warning.hidden = data.annotationErrors === 0;
    warning.textContent = this.text("tabellify-monitor-annotations-error");

    if (counting) {
      for (const group of result.groups) {
        const box = this.html("div", "tabellify-monitor-group");
        const heading = this.html("h3", "tabellify-monitor-group-name");
        const name = this.html("span");
        name.textContent = group.name;
        const count = this.html("span", "tabellify-monitor-count");
        count.textContent = `${group.used}/${group.total}`;
        heading.append(name, count);
        box.append(
          heading,
          this.tagList("tabellify-monitor-remaining", group.remainingTags, "tabellify-monitor-remaining"),
          this.tagList("tabellify-monitor-used", group.usedTags.map((u) => this.usedTagLabel(u)), "tabellify-monitor-used"),
        );
        groupsEl.append(box);
      }
    }

    this.renderPaperTable(result, counting);
    if (result.paperCount === 0) {
      table.hidden = true;
      this.showStatus("tabellify-no-items");
    } else {
      table.hidden = false;
      this.showStatus(null);
    }
    return result;
  },

  /**
   * Rebuild the per-paper table body (and the header's sort state).
   * @param {ReturnType<typeof TabellifyTagMonitor.summarize>} result
   * @param {boolean} counting  False when there is no codebook (or it has no tags)
   */
  renderPaperTable(result, counting) {
    const body = this.el("tabellify-items-body");
    body.replaceChildren();
    // aria-sort tells screen readers (and our CSS arrow) which column sorts the table.
    for (const button of this.el("tabellify-items-table").querySelectorAll("button[data-sort]")) {
      const th = button.closest("th");
      if (button.dataset.sort === this.sortKey) {
        th.setAttribute("aria-sort", this.sortDirection === "desc" ? "descending" : "ascending");
      } else {
        th.removeAttribute("aria-sort");
      }
    }

    const columns = 5;
    for (const paper of TabellifyTagMonitor.sortPapers(result.papers, this.sortKey, this.sortDirection)) {
      const tr = this.html("tr");
      const title = this.html("td");
      // `textContent` puts the string in as text, never as markup (see SECURITY above).
      title.textContent = paper.untitled ? this.untitledText : paper.title;
      if (paper.untitled) title.classList.add("tabellify-untitled");
      const count = this.html("td", "tabellify-monitor-count");
      count.textContent = counting ? `${paper.count}/${paper.total}` : "–";
      const inCell = this.html("td");
      inCell.textContent = paper.collectionNames.join(", ");
      const tags = this.html("td");
      tags.textContent = this.monitorData.allTags.get(paper.id) ?? "";
      const toggleCell = this.html("td");
      const expanded = counting && this.expandedPaperIds.has(paper.id);
      const detailId = `tabellify-paper-detail-${paper.id}`;
      if (counting) {
        const toggle = this.html("button");
        toggle.dataset.action = "toggle-paper";
        toggle.dataset.paperId = String(paper.id);
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.setAttribute("aria-controls", detailId);
        toggle.textContent = this.text(expanded ? "tabellify-monitor-hide-remaining" : "tabellify-monitor-show-remaining");
        toggleCell.append(toggle);
      }
      tr.append(title, count, inCell, tags, toggleCell);
      body.append(tr);

      if (expanded) {
        const detail = this.html("tr", "tabellify-monitor-detail");
        detail.id = detailId;
        const cell = this.html("td");
        cell.colSpan = columns;
        for (const group of paper.groups) {
          const box = this.html("div", "tabellify-monitor-detail-group");
          const name = this.html("strong");
          name.textContent = group.name;
          box.append(
            name,
            this.tagList("tabellify-monitor-remaining", group.remaining, "tabellify-monitor-remaining"),
            this.tagList("tabellify-monitor-present", group.present, "tabellify-monitor-used"),
          );
          cell.append(box);
        }
        detail.append(cell);
        body.append(detail);
      }
    }
  },

  // ---------------------------------------------------------------------------------------
  // Feature 005: live updates (Zotero.Notifier observer + debounce). See the spec's
  // "Live updates" section for which library changes fire which events.
  // ---------------------------------------------------------------------------------------

  /** Wait this long after the LAST library change before re-reading (spec Q-new-4). */
  RECOMPUTE_DELAY_MS: 500,

  /** The key Zotero.Notifier.registerObserver returned (needed to unregister), or null. */
  notifierKey: null,

  /** The pending debounce timer's ID, or null. */
  recomputeTimer: null,

  /**
   * Ask Zotero to tell us about library changes that can change the counts: tags added to /
   * removed from items or highlights ("item-tag"), papers added to / removed from
   * collections ("collection-item"), papers trashed ("item"), and subcollection changes
   * ("collection"). An observer only listens; it cannot change the library.
   * Paired with unregisterMonitorObserver() in onUnload (lifecycle symmetry).
   */
  registerMonitorObserver() {
    if (this.notifierKey !== null) return;
    this.notifierKey = Zotero.Notifier.registerObserver(
      { notify: this.onNotify },
      ["item-tag", "collection-item", "item", "collection"],
      "tabellify-tag-monitor", // only a label in Zotero's debug output
    );
    this.log("tag monitor: notifier observer registered");
  },

  /**
   * Stop listening and drop a pending recompute. Safe to call more than once.
   * @param {string} reason  For Debug Output
   */
  unregisterMonitorObserver(reason) {
    if (this.recomputeTimer !== null) {
      try {
        window.clearTimeout(this.recomputeTimer);
      } catch (e) {
        // The window may already be gone; its timers went with it.
      }
      this.recomputeTimer = null;
    }
    if (this.notifierKey === null) return;
    const key = this.notifierKey;
    this.notifierKey = null;
    Zotero.Notifier.unregisterObserver(key);
    this.log(`tag monitor: notifier observer unregistered (${reason})`);
  },

  /**
   * Called by Zotero after library changes (signature from notifier.js:
   * notify(event, type, ids, extraData)). It does not re-read at once: a single user action
   * can fire several events in a row (e.g. a sync), so it (re)starts a short timer and
   * re-reads once, RECOMPUTE_DELAY_MS after the last event ("debouncing"). No filtering by
   * ID: one re-read of the chosen collection is cheap and always correct.
   */
  onNotify: (event, type, ids, extraData) => {
    const W = TabellifyWorkspace;
    // Belt and braces: if this document is gone (closed without our unload handler
    // running), unregister instead of touching a dead page. `defaultView` is the window
    // showing this document; it is null once the document is unloaded. Accessing a
    // closed window's objects can also throw ("dead object"), hence the try.
    let alive = false;
    try {
      alive = document.defaultView != null;
    } catch (e) {
      alive = false;
    }
    if (!alive) {
      try {
        W.unregisterMonitorObserver("workspace document is gone");
      } catch (e) {
        // Nothing more we can do; Zotero logs errors thrown by observers.
      }
      return;
    }
    if (W.currentCollection === "") return; // nothing to count yet
    if (W.recomputeTimer !== null) window.clearTimeout(W.recomputeTimer);
    // A function (never a string) is passed to setTimeout.
    W.recomputeTimer = window.setTimeout(W.onRecomputeTimer, W.RECOMPUTE_DELAY_MS);
  },

  /** The debounce timer fired: re-read the chosen collection. */
  onRecomputeTimer: () => {
    const W = TabellifyWorkspace;
    W.recomputeTimer = null;
    if (W.currentCollection === "") return;
    W.showCollection(W.currentCollection, "library change");
  },

  /** "Refresh": read the library again now, for the chosen collection. */
  onRefreshClick: () => {
    const W = TabellifyWorkspace;
    if (W.currentCollection === "") return;
    // A pending live update would only repeat this read.
    if (W.recomputeTimer !== null) {
      window.clearTimeout(W.recomputeTimer);
      W.recomputeTimer = null;
    }
    W.showCollection(W.currentCollection, "refresh");
  },

  /**
   * Clicks in the per-paper table (one delegated listener): a header button sorts by its
   * column (clicking the active column again reverses the order); a "Show remaining"
   * button opens or closes that paper's detail row. Neither reads the library.
   */
  onTableClick: (event) => {
    const W = TabellifyWorkspace;
    const button = event.target.closest?.("button");
    if (!button || !W.monitorData) return;
    if (button.dataset.sort) {
      const key = button.dataset.sort;
      if (key === W.sortKey) {
        W.sortDirection = W.sortDirection === "asc" ? "desc" : "asc";
      } else {
        W.sortKey = key;
        W.sortDirection = "asc";
      }
      W.renderMonitor();
      W.el("tabellify-items-table").querySelector(`button[data-sort="${key}"]`)?.focus();
    } else if (button.dataset.action === "toggle-paper") {
      const id = Number(button.dataset.paperId);
      if (W.expandedPaperIds.has(id)) W.expandedPaperIds.delete(id);
      else W.expandedPaperIds.add(id);
      W.renderMonitor();
      // The table was rebuilt: put the keyboard focus back on this paper's toggle.
      for (const toggle of W.el("tabellify-items-body").querySelectorAll("button[data-action='toggle-paper']")) {
        if (toggle.dataset.paperId === String(id)) toggle.focus();
      }
    }
  },

  // ---------------------------------------------------------------------------------------
  // Feature 004: Codebook section (uses Zotero, the DOM and the disk; checked by the owner's
  // smoke test). Rules: TabellifyCodebook. File: TabellifyCodebookStore.
  // ---------------------------------------------------------------------------------------

  /**
   * Fluent IDs the codebook code shows from JavaScript. They are formatted once in
   * initCodebook() (document.l10n.formatValue) and kept in `strings`, so showing a message
   * later is synchronous and two quick messages cannot arrive out of order.
   * tests/static/workspace-script.test.mjs checks that each exists in tabellify.ftl.
   */
  CODEBOOK_STRINGS: [
    "tabellify-codebook-group-placeholder",
    "tabellify-codebook-rename",
    "tabellify-codebook-rename-save",
    "tabellify-codebook-rename-cancel",
    "tabellify-codebook-delete",
    "tabellify-codebook-delete-confirm",
    "tabellify-codebook-group-name-label",
    "tabellify-codebook-tag-placeholder",
    "tabellify-codebook-add-tag",
    "tabellify-codebook-remove-tag",
    "tabellify-codebook-remove-tag-tooltip",
    "tabellify-codebook-pick-placeholder",
    "tabellify-codebook-no-tags",
    "tabellify-codebook-saved",
    "tabellify-codebook-load-error",
    "tabellify-codebook-newer",
    "tabellify-codebook-save-error",
    "tabellify-codebook-conflict",
  ],

  /** @type {Record<string, string>} Fluent ID → localized text */
  strings: {},

  /** The current codebook data, or null when the file could not be loaded. */
  codebook: null,

  /** `revision` of the file as last loaded or saved (0 = no file yet). */
  codebookRevision: 0,

  /** False when the file could not be loaded: nothing may overwrite it. */
  codebookEditable: false,

  /** True once the first load attempt finished (F005: until then the monitor waits). */
  codebookLoadDone: false,

  /** True while a save is running (controls are disabled meanwhile). */
  codebookBusy: false,

  /** Group whose name is being edited, or null. */
  renamingGroupId: null,

  /** Group whose "Delete" was clicked once and now shows "Confirm delete", or null. */
  confirmDeleteGroupId: null,

  /** Tag names used in My Library (read once when the workspace opens). */
  libraryTagNames: [],

  /** File functions and folder, set in initCodebook(). */
  codebookFs: null,
  codebookDir: "",

  /** @param {string} id  Fluent ID */
  text(id) {
    return this.strings[id] ?? id;
  },

  /**
   * Start-up of the Codebook section, called on "load" next to init(). It has its own
   * try/catch, so a codebook problem never stops the F003 collection browser (or the
   * other way round).
   */
  async initCodebook() {
    const section = this.el("tabellify-codebook");
    // One listener of each kind on the whole section ("event delegation"): clicks on any
    // button inside it, now or after a re-render, reach these handlers, which look at the
    // element's data-action to decide what to do. Removed in onUnload.
    section.addEventListener("click", this.onCodebookClick);
    section.addEventListener("keydown", this.onCodebookKeydown);
    section.addEventListener("change", this.onCodebookChange);
    try {
      await Zotero.initializationPromise;

      await this.formatStrings([...this.CODEBOOK_STRINGS, ...this.codebookErrorIds()]);
      this.el("tabellify-codebook-group-input").placeholder = this.text("tabellify-codebook-group-placeholder");

      this.codebookFs = TabellifyCodebookStore.platformFs();
      this.codebookDir = TabellifyCodebookStore.dataDir();
      await this.loadLibraryTags();
      await this.loadCodebook();
    } catch (e) {
      this.codebook = null;
      this.codebookEditable = false;
      this.codebookLoadDone = true;
      this.showCodebookStatus("tabellify-codebook-load-error", this.codebookDir, true);
      this.renderCodebook();
      Zotero.logError(e);
    }
  },

  /** The model's Fluent IDs for refused edits (TabellifyCodebook.ERR_*). */
  codebookErrorIds() {
    return Object.keys(TabellifyCodebook)
      .filter((k) => k.startsWith("ERR_"))
      .map((k) => TabellifyCodebook[k]);
  },

  /**
   * Tag names used in My Library, for the "Pick from library" lists. Read-only: a SELECT
   * query in Zotero (docs/zotero-api-notes.md). On failure the lists stay empty and the
   * rest of the codebook works.
   */
  async loadLibraryTags() {
    try {
      const tags = await Zotero.Tags.getAll(Zotero.Libraries.userLibraryID);
      this.libraryTagNames = tags.map((t) => String(t.tag ?? ""));
      this.log(`codebook: ${this.libraryTagNames.length} tag name(s) in My Library`);
    } catch (e) {
      this.libraryTagNames = [];
      this.log("codebook: could not list the tags in My Library");
      Zotero.logError(e);
    }
  },

  /**
   * Read codebooks.json and show it. Never writes: a missing file just starts empty.
   * @returns {Promise<boolean>} true if the codebook can be edited
   */
  async loadCodebook() {
    const result = await TabellifyCodebookStore.load(this.codebookFs, this.codebookDir);
    this.renamingGroupId = null;
    this.confirmDeleteGroupId = null;
    if (result.status === "ok") {
      this.codebook = result.data;
      this.codebookRevision = result.data.revision;
      this.codebookEditable = true;
      if (result.existed) {
        const count = TabellifyCodebook.groups(result.data).length;
        this.log(`codebook: loaded ${result.path} (revision ${this.codebookRevision}, ${count} group(s))`);
      } else {
        this.log(`codebook: no file yet at ${result.path}; starting empty (nothing written)`);
      }
      this.showCodebookStatus(null);
    } else {
      // Damaged, unreadable or newer file: show it, and turn editing off so that nothing
      // can overwrite the file (ADR-0012 §3).
      this.codebook = null;
      this.codebookEditable = false;
      this.log(`codebook: could not load ${result.path} (${result.status}): ${result.reason}; editing disabled`);
      const id = result.status === "newer" ? "tabellify-codebook-newer" : "tabellify-codebook-load-error";
      this.showCodebookStatus(id, result.path, true);
    }
    this.codebookLoadDone = true;
    this.renderCodebook();
    return this.codebookEditable;
  },

  /**
   * Save the result of a model edit, then show the outcome.
   * @param {{ ok: boolean, data?: object, error?: string }} edit  From a TabellifyCodebook edit
   * @returns {Promise<boolean>} true if the edit is now shown (saved, or shown but not saved)
   */
  async applyCodebookEdit(edit) {
    if (!edit.ok) {
      this.showCodebookStatus(edit.error, null, true);
      return false;
    }
    if (!this.codebookEditable || this.codebookBusy) return false;
    this.codebookBusy = true;
    this.updateCodebookControls();
    try {
      const result = await TabellifyCodebookStore.saveData(
        this.codebookFs, this.codebookDir, edit.data, this.codebookRevision,
      );
      if (result.status === "saved") {
        this.codebook = result.data;
        this.codebookRevision = result.data.revision;
        this.log(`codebook: saved revision ${this.codebookRevision} to ${result.path}`);
        this.showCodebookStatus("tabellify-codebook-saved");
        return true;
      }
      if (result.status === "conflict") {
        // Another Tabellify tab saved first (or the file changed on disk): do not
        // overwrite; reload what is on disk instead (ADR-0012 §5).
        this.log(`codebook: not saved, file changed elsewhere (${result.reason}); reloading`);
        this.codebookBusy = false;
        if (await this.loadCodebook()) this.showCodebookStatus("tabellify-codebook-conflict", null, true);
        return false;
      }
      // Write failed: the file on disk is unchanged (atomic write). Keep the edit on screen
      // with the OLD revision, so the next successful save includes it.
      this.codebook = edit.data;
      this.log(`codebook: could not save ${result.path}`);
      Zotero.logError(result.error);
      this.showCodebookStatus("tabellify-codebook-save-error", null, true);
      return true;
    } catch (e) {
      this.log("codebook: save failed unexpectedly");
      Zotero.logError(e);
      this.showCodebookStatus("tabellify-codebook-save-error", null, true);
      return false;
    } finally {
      this.codebookBusy = false;
      this.renderCodebook();
    }
  },

  /**
   * Show one message in the codebook status line (or hide it with `null`).
   * @param {string | null} id  Fluent ID
   * @param {string | null} [path]  File path shown after the message (as plain text)
   * @param {boolean} [isError]
   */
  showCodebookStatus(id, path = null, isError = false) {
    const status = this.el("tabellify-codebook-status");
    const pathEl = this.el("tabellify-codebook-status-path");
    status.hidden = id === null;
    status.classList.toggle("tabellify-codebook-error", isError);
    this.el("tabellify-codebook-status-text").textContent = id === null ? "" : this.text(id);
    pathEl.textContent = path ?? "";
    pathEl.hidden = !path;
  },

  /** Enable the editing controls only when the file loaded and no save is running. */
  updateCodebookControls() {
    this.el("tabellify-codebook-controls").disabled = !this.codebookEditable || this.codebookBusy;
  },

  /**
   * Create an HTML element in this (XUL) document. The `html` namespace is needed because
   * the document's default namespace is XUL.
   * @param {string} tag
   * @param {string} [className]
   */
  html(tag, className) {
    const node = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (className) node.className = className;
    return node;
  },

  /**
   * A button that the click handler recognizes by its data-action.
   * @param {string} action
   * @param {string} labelId  Fluent ID of its text
   * @param {string} groupId
   */
  actionButton(action, labelId, groupId) {
    const button = this.html("button");
    button.textContent = this.text(labelId);
    button.dataset.action = action;
    button.dataset.groupId = groupId;
    return button;
  },

  /**
   * Rebuild the list of groups from `this.codebook`. Every name goes in as text only
   * (textContent / new Option), never as markup (see SECURITY at the top).
   */
  renderCodebook() {
    // F005: the tag monitor follows every codebook change (no library read needed).
    this.renderMonitor();
    this.updateCodebookControls();
    const container = this.el("tabellify-codebook-groups");
    container.replaceChildren();
    const groups = this.codebook ? TabellifyCodebook.groups(this.codebook) : [];
    this.el("tabellify-codebook-empty").hidden = !this.codebook || groups.length > 0;
    if (!this.codebook) return;

    const available = TabellifyCodebook.availableTags(this.codebook, this.libraryTagNames);
    for (const group of groups) {
      const box = this.html("div", "tabellify-codebook-group");
      const header = this.html("div", "tabellify-codebook-group-header");

      if (group.id === this.renamingGroupId) {
        const input = this.html("input", "tabellify-codebook-rename-input");
        input.type = "text";
        input.value = group.name;
        input.dataset.action = "rename-input";
        input.dataset.groupId = group.id;
        input.setAttribute("aria-label", this.text("tabellify-codebook-group-name-label"));
        header.append(
          input,
          this.actionButton("rename-save", "tabellify-codebook-rename-save", group.id),
          this.actionButton("rename-cancel", "tabellify-codebook-rename-cancel", group.id),
        );
      } else {
        const name = this.html("h3", "tabellify-codebook-group-name");
        name.textContent = group.name;
        header.append(name, this.actionButton("rename", "tabellify-codebook-rename", group.id));
        if (group.id === this.confirmDeleteGroupId) {
          header.append(
            this.actionButton("delete-confirm", "tabellify-codebook-delete-confirm", group.id),
            this.actionButton("delete-cancel", "tabellify-codebook-rename-cancel", group.id),
          );
        } else {
          header.append(this.actionButton("delete", "tabellify-codebook-delete", group.id));
        }
      }
      box.append(header);

      if (group.tags.length === 0) {
        const none = this.html("p", "tabellify-codebook-no-tags");
        none.textContent = this.text("tabellify-codebook-no-tags");
        box.append(none);
      } else {
        const list = this.html("ul", "tabellify-codebook-tags");
        for (const tag of group.tags) {
          const item = this.html("li");
          const label = this.html("span");
          label.textContent = tag;
          const remove = this.actionButton("remove-tag", "tabellify-codebook-remove-tag", group.id);
          // dataset values are attributes (plain strings), never parsed as markup.
          remove.dataset.tag = tag;
          remove.title = this.text("tabellify-codebook-remove-tag-tooltip");
          remove.setAttribute("aria-label", `${this.text("tabellify-codebook-remove-tag-tooltip")}: ${tag}`);
          item.append(label, remove);
          list.append(item);
        }
        box.append(list);
      }

      const row = this.html("div", "tabellify-codebook-tag-row");
      const tagInput = this.html("input");
      tagInput.type = "text";
      tagInput.placeholder = this.text("tabellify-codebook-tag-placeholder");
      tagInput.setAttribute("aria-label", this.text("tabellify-codebook-tag-placeholder"));
      tagInput.dataset.action = "tag-input";
      tagInput.dataset.groupId = group.id;
      const picker = this.html("select");
      picker.dataset.action = "pick-tag";
      picker.dataset.groupId = group.id;
      picker.setAttribute("aria-label", this.text("tabellify-codebook-pick-placeholder"));
      picker.append(new Option(this.text("tabellify-codebook-pick-placeholder"), ""));
      // `new Option(text, value)`: library tag names are shown as plain text.
      for (const name of available) picker.append(new Option(name, name));
      picker.disabled = available.length === 0;
      row.append(tagInput, this.actionButton("add-tag", "tabellify-codebook-add-tag", group.id), picker);
      box.append(row);

      container.append(box);
    }
  },

  /**
   * The text box of one group ("tag-input") or the rename box ("rename-input").
   * @param {string} action
   * @param {string} groupId
   * @returns {HTMLInputElement | undefined}
   */
  groupInput(action, groupId) {
    return [...this.el("tabellify-codebook-groups").querySelectorAll("input")]
      .find((i) => i.dataset.action === action && i.dataset.groupId === groupId);
  },

  async addGroupFromInput() {
    const input = this.el("tabellify-codebook-group-input");
    const name = input.value;
    if (await this.applyCodebookEdit(TabellifyCodebook.addGroup(this.codebook, name))) {
      input.value = "";
    }
    input.focus();
  },

  /** @param {string} groupId */
  async addTagFromInput(groupId) {
    const value = this.groupInput("tag-input", groupId)?.value ?? "";
    const shown = await this.applyCodebookEdit(TabellifyCodebook.addTagToGroup(this.codebook, groupId, value));
    // The list was re-rendered: put the typed text back if the tag was refused, and keep
    // the cursor in this group's box so several tags can be typed in a row.
    const input = this.groupInput("tag-input", groupId);
    if (input) {
      if (!shown) input.value = value;
      input.focus();
    }
  },

  /** @param {string} groupId */
  async renameFromInput(groupId) {
    const value = this.groupInput("rename-input", groupId)?.value ?? "";
    const edit = TabellifyCodebook.renameGroup(this.codebook, groupId, value);
    if (edit.ok) this.renamingGroupId = null;
    await this.applyCodebookEdit(edit);
  },

  /**
   * Click handler for every button in the Codebook section (see initCodebook).
   * Arrow functions as properties: one fixed function object, so onUnload can remove it.
   */
  onCodebookClick: (event) => {
    const W = TabellifyWorkspace;
    const target = event.target.closest?.("button[data-action]");
    if (!target || !W.codebook || target.disabled) return;
    const { action, groupId } = target.dataset;
    // Any other action cancels a pending "Confirm delete".
    if (action !== "delete-confirm") W.confirmDeleteGroupId = null;

    switch (action) {
      case "add-group":
        W.addGroupFromInput();
        break;
      case "rename":
        W.renamingGroupId = groupId;
        W.renderCodebook();
        W.groupInput("rename-input", groupId)?.select();
        break;
      case "rename-save":
        W.renameFromInput(groupId);
        break;
      case "rename-cancel":
        W.renamingGroupId = null;
        W.renderCodebook();
        break;
      case "delete": {
        const group = TabellifyCodebook.groups(W.codebook).find((g) => g.id === groupId);
        if (group && group.tags.length > 0) {
          // A group with tags needs a second click ("Confirm delete"). Plain buttons
          // instead of window.confirm(), which is not verified in the tab's iframe.
          W.confirmDeleteGroupId = groupId;
          W.renderCodebook();
        } else {
          W.applyCodebookEdit(TabellifyCodebook.deleteGroup(W.codebook, groupId));
        }
        break;
      }
      case "delete-confirm":
        W.confirmDeleteGroupId = null;
        W.applyCodebookEdit(TabellifyCodebook.deleteGroup(W.codebook, groupId));
        break;
      case "delete-cancel":
        W.renderCodebook();
        break;
      case "add-tag":
        W.addTagFromInput(groupId);
        break;
      case "remove-tag":
        W.applyCodebookEdit(TabellifyCodebook.removeTagFromGroup(W.codebook, groupId, target.dataset.tag));
        break;
    }
  },

  /** Enter in a text box does the same as its button; Escape cancels a rename. */
  onCodebookKeydown: (event) => {
    const W = TabellifyWorkspace;
    const { action, groupId } = event.target.dataset ?? {};
    if (!action || !W.codebook) return;
    // Only the text boxes are handled; Enter on a button keeps its normal "click".
    if (event.key === "Enter" && action.endsWith("-input")) {
      event.preventDefault();
      W.confirmDeleteGroupId = null;
      if (action === "add-group-input") W.addGroupFromInput();
      else if (action === "tag-input") W.addTagFromInput(groupId);
      else if (action === "rename-input") W.renameFromInput(groupId);
    } else if (event.key === "Escape" && action === "rename-input") {
      W.renamingGroupId = null;
      W.renderCodebook();
    }
  },

  /** Choosing a name in a "Pick from library" list adds it to that group. */
  onCodebookChange: (event) => {
    const W = TabellifyWorkspace;
    const { action, groupId } = event.target.dataset ?? {};
    if (action !== "pick-tag" || !W.codebook || event.target.value === "") return;
    W.confirmDeleteGroupId = null;
    W.applyCodebookEdit(TabellifyCodebook.addTagToGroup(W.codebook, groupId, event.target.value));
  },

  /**
   * Remove our listeners and the Notifier observer when the document goes away
   * (lifecycle symmetry).
   */
  onUnload: () => {
    TabellifyWorkspace.unregisterMonitorObserver("workspace closed");
    TabellifyWorkspace.el("tabellify-collection-select")
      ?.removeEventListener("change", TabellifyWorkspace.onCollectionChange);
    TabellifyWorkspace.el("tabellify-monitor-refresh")
      ?.removeEventListener("click", TabellifyWorkspace.onRefreshClick);
    TabellifyWorkspace.el("tabellify-items-table")
      ?.removeEventListener("click", TabellifyWorkspace.onTableClick);
    const section = TabellifyWorkspace.el("tabellify-codebook");
    section?.removeEventListener("click", TabellifyWorkspace.onCodebookClick);
    section?.removeEventListener("keydown", TabellifyWorkspace.onCodebookKeydown);
    section?.removeEventListener("change", TabellifyWorkspace.onCodebookChange);
    window.removeEventListener("load", TabellifyWorkspace.onLoad);
    window.removeEventListener("unload", TabellifyWorkspace.onUnload);
  },

  onLoad: () => {
    // Two independent start-ups: the codebook and the F003 collection browser.
    TabellifyWorkspace.initCodebook();
    TabellifyWorkspace.init();
  },
};

// Start once the whole document (including the elements below the <script> tags) exists.
// Skipped when the file is loaded in Node for the unit tests (there is no `window` there).
if (typeof window !== "undefined") {
  window.addEventListener("load", TabellifyWorkspace.onLoad, { once: true });
  window.addEventListener("unload", TabellifyWorkspace.onUnload, { once: true });
}
