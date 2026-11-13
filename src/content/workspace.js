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
 *   Counting rule (owner decision 2026-11-13): only highlight tags count, unless the
 *   "Also count tags on the paper itself" checkbox is ticked. The checkbox is stored in the
 *   Zotero pref extensions.tabellify.countItemTags (a setting, not library data); this is
 *   the only place in Tabellify that writes it.
 * - F005c: formats the per-paper table and lets the user rearrange it: drag a column's grip
 *   (or Alt+Left/Right on it) to move the column, drag a paper's grip (or Alt+Up/Down) to
 *   put the papers in a hand-made "manual order" per collection. The rules are pure logic
 *   in table-layout-model.js (TabellifyTableLayout). Only Tabellify's own arrays change:
 *   nothing is written to the library. The layout is saved in Tabellify's own
 *   layout.json (ADR-0014) by layout-store.js (TabellifyLayoutStore), one second after the
 *   last move; a file that cannot be read means "default layout" and is never overwritten.
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
 * F005c adds at most one pending layout-save timer of this window (cleared in onUnload).
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
    const table = this.el("tabellify-items-table");
    table.addEventListener("click", this.onTableClick);
    // F005c: drag-and-drop and Alt+arrow moves, delegated on the table like the clicks, and
    // one click listener on the table toolbar. All removed in onUnload.
    table.addEventListener("dragstart", this.onTableDragStart);
    table.addEventListener("dragover", this.onTableDragOver);
    table.addEventListener("dragleave", this.onTableDragLeave);
    table.addEventListener("drop", this.onTableDrop);
    table.addEventListener("dragend", this.onTableDragEnd);
    table.addEventListener("keydown", this.onTableKeydown);
    this.el("tabellify-table-toolbar").addEventListener("click", this.onToolbarClick);
    this.columnOrder = [...TabellifyTableLayout.COLUMN_IDS];
    // Owner decision 2026-11-13: the "count item tags" checkbox (removed in onUnload).
    const countBox = this.el("tabellify-monitor-count-item-tags");
    this.countItemTags = this.readCountItemTags();
    countBox.checked = this.countItemTags;
    countBox.addEventListener("change", this.onCountItemTagsChange);
    try {
      // Normally already resolved (the workspace opens from a menu, after Zotero started),
      // so this returns at once. It guarantees all collections are loaded.
      await Zotero.initializationPromise;

      // "(untitled)" is needed as plain text in table cells, so ask Fluent for the string.
      this.untitledText = (await document.l10n?.formatValue("tabellify-untitled")) ?? "";
      // F005: the tag monitor's texts, formatted once (see MONITOR_STRINGS).
      await this.formatStrings(this.MONITOR_STRINGS);
      // F005c: the saved layout (and its strings) must be ready before the first table is
      // shown. initLayout never throws (it has its own try/catch).
      await this.layoutLoading;
      this.monitorReady = true;
      this.renderMonitor();

      const libraryID = Zotero.Libraries.userLibraryID;
      // Synchronous: collections are kept in memory from start-up. `true` = include
      // subcollections, flattened depth-first, each with a `level` for indentation.
      const collections = Zotero.Collections.getByLibrary(libraryID, true);
      this.collectionKeys = this.collectionKeyMap(collections);
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
    // A newly chosen collection starts with every paper collapsed, in its manual order if
    // it has one (F005c, spec Q2), otherwise in the default order.
    const key = W.collectionKeys.get(Number(event.target.value));
    if (key && W.manualOrders.has(key)) {
      W.sortKey = TabellifyTableLayout.MANUAL;
      W.sortDirection = "asc";
    } else {
      W.sortKey = TabellifyTagMonitor.DEFAULT_SORT.key;
      W.sortDirection = TabellifyTagMonitor.DEFAULT_SORT.direction;
    }
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
      this.setTableHidden(true);
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
      this.collectionKeys = data.collectionKeys;
      const result = this.renderMonitor();
      this.log(
        `tag monitor: recomputed for collection ${data.rootId} (${reason}): ` +
        `${result?.used ?? 0}/${result?.total ?? 0} codebook tag(s) used, ` +
        `${result?.paperCount ?? 0} paper(s) in ${data.scopeSize} collection(s), ` +
        `${this.countItemTags ? "highlight and item tags" : "highlight tags only"}` +
        (data.annotationErrors > 0 ? `, highlights unreadable for ${data.annotationErrors} paper(s)` : ""),
      );
    } catch (e) {
      if (request !== this.requestCounter) return;
      this.monitorData = null;
      this.setTableHidden(true);
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

  /**
   * The checkbox "Also count tags on the paper itself" (false: highlight tags only).
   * Read from the pref in init(), changed by onCountItemTagsChange.
   */
  countItemTags: false,

  /**
   * Read the switch from Zotero's prefs. `Zotero.Prefs.get(name, true)`: `true` means
   * `name` is the FULL pref name (without it Zotero would put "extensions.zotero." in
   * front). A pref that was never set reads as `undefined`, hence `=== true` (default off).
   * @returns {boolean}
   */
  readCountItemTags() {
    try {
      return Zotero.Prefs.get(TabellifyTagMonitor.COUNT_ITEM_TAGS_PREF, true) === true;
    } catch (e) {
      Zotero.logError(e);
      return false;
    }
  },

  /**
   * The checkbox changed: remember the choice in the pref (so the reader section and the
   * next workspace use it too) and recount at once from the data already read. No library
   * read is needed: monitorData keeps item tags and highlight tags apart.
   */
  onCountItemTagsChange: (event) => {
    const W = TabellifyWorkspace;
    W.countItemTags = event.target.checked === true;
    try {
      // `true` (third argument): full pref name, as in readCountItemTags. A pref is a
      // Tabellify setting, not library data.
      Zotero.Prefs.set(TabellifyTagMonitor.COUNT_ITEM_TAGS_PREF, W.countItemTags, true);
    } catch (e) {
      Zotero.logError(e);
    }
    const result = W.renderMonitor();
    W.log(
      `tag monitor: count item tags = ${W.countItemTags}` +
      (result ? ` (recounted: ${result.used}/${result.total} codebook tag(s) used)` : ""),
    );
  },

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
    const snapshot = Zotero.Collections.getByLibrary(root.libraryID, true);
    const collections = snapshot.map((c) => ({ id: c.id, parentID: c.parentID, name: c.name }));
    // F005c: stable collection keys, for the manual orders (they survive a restart).
    const collectionKeys = this.collectionKeyMap(snapshot);
    const scope = TabellifyTagMonitor.descendantIds(collections, rootId);

    const papers = [];
    const read = new Map(); // item ID → what we read, so a paper in two collections is read once
    const allTags = new Map(); // item ID → "All tags" column text (F003)
    const keys = new Map(); // item ID → item key (F005c: manual orders are kept by key)
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
          // `key`: read-only getter, 8 characters, the same on every computer and after
          // sync (docs/zotero-api-notes.md, F005c `item.key` row).
          keys.set(item.id, item.key);
        }
        papers.push({ id: item.id, title: entry.title, collectionId, itemTags: entry.itemTags, annotationTags: entry.annotationTags });
      }
    }
    return { rootId, collections, collectionKeys, papers, allTags, keys, annotationErrors, scopeSize: scope.length };
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

    // The counting rule (highlights only, unless the checkbox is ticked) is in the model.
    const result = TabellifyTagMonitor.summarize(this.codebook, data.collections, data.rootId, data.papers, {
      countItemTags: this.countItemTags,
    });
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
      this.setTableHidden(true);
      this.showStatus("tabellify-no-items");
    } else {
      this.setTableHidden(false);
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
    this.applyColumnOrder();
    this.updateTableToolbar();
    // aria-sort tells screen readers (and our CSS arrow) which column sorts the table.
    for (const button of this.el("tabellify-items-table").querySelectorAll("button[data-sort]")) {
      const th = button.closest("th");
      if (button.dataset.sort === this.sortKey) {
        th.setAttribute("aria-sort", this.sortDirection === "desc" ? "descending" : "ascending");
      } else {
        th.removeAttribute("aria-sort");
      }
    }

    const columns = 1 + this.columnOrder.length; // row grip + data columns
    const shown = this.displayedPapers(result.papers);
    this.displayedPaperIds = shown.map((p) => p.id);
    for (const paper of shown) {
      const tr = this.html("tr");
      tr.dataset.paperId = String(paper.id);
      // F005c: each cell carries its column class (tabellify-col-<id>), which sets its
      // width and wrapping in workspace.css.
      const title = this.html("td", "tabellify-col-title");
      // `textContent` puts the string in as text, never as markup (see SECURITY above).
      title.textContent = paper.untitled ? this.untitledText : paper.title;
      if (paper.untitled) title.classList.add("tabellify-untitled");
      const count = this.html("td", "tabellify-col-count tabellify-monitor-count");
      count.textContent = counting ? `${paper.count}/${paper.total}` : "–";
      const inCell = this.html("td", "tabellify-col-collections");
      inCell.textContent = paper.collectionNames.join(", ");
      const tags = this.html("td", "tabellify-col-tags");
      tags.textContent = this.monitorData.allTags.get(paper.id) ?? "";
      const toggleCell = this.html("td", "tabellify-col-details");
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
      // F005c: the row grip first, then the data cells in the current column order.
      const cells = { title, count, collections: inCell, tags, details: toggleCell };
      tr.append(this.rowGripCell(paper), ...this.columnOrder.map((id) => cells[id]));
      body.append(tr);

      if (expanded) {
        const detail = this.html("tr", "tabellify-monitor-detail");
        detail.id = detailId;
        // Same data-paper-id as its paper: a drop on the detail row counts as on the paper.
        detail.dataset.paperId = String(paper.id);
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

    // F005c: shade every other paper row; a detail row copies its paper (pure rule in
    // TabellifyTableLayout.stripeFlags, so detail rows do not break the alternation).
    const rows = [...body.children];
    const flags = TabellifyTableLayout.stripeFlags(
      rows.map((row) => (row.classList.contains("tabellify-monitor-detail") ? "detail" : "paper")),
    );
    rows.forEach((row, i) => row.classList.toggle("tabellify-row-alt", flags[i]));
  },

  // ---------------------------------------------------------------------------------------
  // Feature 005c: table layout (column order, manual paper order, drag-and-drop, keyboard).
  // The rules are in table-layout-model.js (TabellifyTableLayout, unit-tested). Everything
  // here only rearranges Tabellify's own arrays and the table on screen: no library write.
  //
  // How HTML drag-and-drop works (built into Gecko, the engine Zotero runs on): an element
  // with draggable="true" (our grips) fires "dragstart" when the user starts dragging it;
  // then "dragover" fires again and again on whatever is under the pointer, "drop" where
  // the mouse is released, and "dragend" on the dragged element (also when the drag was
  // cancelled, e.g. with Escape). A drop is only allowed where a dragover handler calls
  // event.preventDefault(). Each event carries event.dataTransfer, a small "clipboard"
  // for the drag. All handlers are delegated on the table (one listener for every row).
  // ---------------------------------------------------------------------------------------

  /**
   * Private drag data types. Firefox starts a drag only if dragstart calls setData
   * (docs/zotero-api-notes.md, DataTransfer row), so we set one of these. No Zotero drop
   * target accepts them, so dropping our drag elsewhere does nothing.
   * SAFETY: the drop handler NEVER reads the drag data back. It uses `dragging` (set by our
   * own dragstart); the type only decides whether a drop is allowed. Text, files or items
   * dragged in from elsewhere are refused and never parsed or shown.
   */
  ROW_DRAG_TYPE: "application/x-tabellify-row",
  COLUMN_DRAG_TYPE: "application/x-tabellify-column",

  /** Fluent IDs used from JavaScript by the layout code (formatted once in initLayout()). */
  LAYOUT_STRINGS: [
    "tabellify-table-move-paper",
    "tabellify-table-moved-to",
    "tabellify-table-of",
    "tabellify-table-layout-load-error",
    "tabellify-table-layout-newer",
    "tabellify-table-layout-save-error",
    "tabellify-table-layout-conflict",
  ],

  /** Order of the five data columns: one order for the whole tab (not per collection). */
  columnOrder: [],

  /**
   * Hand-made paper orders: collection key ("<libraryID>/<collectionKey>") → item keys.
   * Keys, not numeric IDs, so a saved order stays valid on another computer (ADR-0014).
   * @type {Map<string, string[]>}
   */
  manualOrders: new Map(),

  /** Collection ID → collection key, from the latest read of the collection tree. */
  collectionKeys: new Map(),

  /** IDs of the papers in the order they are shown now (the seed of a manual order). */
  displayedPaperIds: [],

  /** The drag that started in this table: `{ kind: "column" | "row", id }`, or null. */
  dragging: null,

  /**
   * Collection ID → "<libraryID>/<key>" (the shape of Zotero's own `libraryKey`). `key` and
   * `libraryID` are read-only getters (docs/zotero-api-notes.md, F003 and F005c rows).
   * @param {Array<{ id: number, libraryID: number, key: string }>} collections
   * @returns {Map<number, string>}
   */
  collectionKeyMap(collections) {
    return new Map(collections.map((c) => [c.id, `${c.libraryID}/${c.key}`]));
  },

  /** @returns {string | null} key of the chosen collection */
  currentCollectionKey() {
    return this.collectionKeys.get(Number(this.currentCollection)) ?? null;
  },

  /** @returns {string[] | null} the chosen collection's manual order, if it has one */
  currentManualOrder() {
    const key = this.currentCollectionKey();
    return key ? this.manualOrders.get(key) ?? null : null;
  },

  /**
   * The papers in the order to show: the manual order (new papers after it, in default
   * order), or sorted by the chosen column.
   * @template {{ id: number }} P
   * @param {P[]} papers
   * @returns {P[]}
   */
  displayedPapers(papers) {
    const manual = this.currentManualOrder();
    if (this.sortKey === TabellifyTableLayout.MANUAL) {
      const { key, direction } = TabellifyTagMonitor.DEFAULT_SORT;
      const fallback = TabellifyTagMonitor.sortPapers(papers, key, direction);
      if (!manual) return fallback;
      const keys = this.monitorData.keys;
      return TabellifyTableLayout.applyManualOrder(papers, manual, fallback, (p) => keys.get(p.id));
    }
    return TabellifyTagMonitor.sortPapers(papers, this.sortKey, this.sortDirection);
  },

  /** Show or hide the per-paper table and its toolbar together. */
  setTableHidden(hidden) {
    this.el("tabellify-items-table").hidden = hidden;
    this.el("tabellify-table-toolbar").hidden = hidden;
  },

  /**
   * Put the header cells in `columnOrder`. Moving an existing <th> keeps its Fluent text.
   * Only touches the DOM when the order differs (moving a focused element drops focus).
   */
  applyColumnOrder() {
    const headRow = this.el("tabellify-items-table").querySelector("thead tr");
    if (!headRow) return;
    const current = [...headRow.querySelectorAll("th[data-column]")].map((th) => th.dataset.column);
    if (current.join(",") === this.columnOrder.join(",")) return;
    for (const id of this.columnOrder) {
      // `id` is one of the fixed COLUMN_IDS (normalized), never library text.
      const th = headRow.querySelector(`th[data-column="${id}"]`);
      if (th) headRow.append(th);
    }
  },

  /** "Manual order" / "Clear manual order" exist only when there is a manual order. */
  updateTableToolbar() {
    const hasManual = Boolean(this.currentManualOrder());
    const manualButton = this.el("tabellify-table-manual-order");
    manualButton.hidden = !hasManual;
    manualButton.setAttribute("aria-pressed", String(hasManual && this.sortKey === TabellifyTableLayout.MANUAL));
    this.el("tabellify-table-clear-manual").hidden = !hasManual;
  },

  /**
   * The first cell of a paper row: its grip. A <span>, not a <button> (Firefox does not
   * start a drag from a draggable button). The row itself is not draggable, so text in
   * the other cells can still be selected with the mouse.
   * @param {{ id: number, title: string, untitled: boolean }} paper
   */
  rowGripCell(paper) {
    const cell = this.html("td", "tabellify-col-grip");
    const grip = this.html("span", "tabellify-grip");
    grip.dataset.grip = "row";
    grip.dataset.paperId = String(paper.id);
    grip.setAttribute("draggable", "true");
    grip.setAttribute("tabindex", "0");
    grip.setAttribute("role", "button");
    grip.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
    // An attribute value is plain text, never parsed as markup (see SECURITY above).
    const title = paper.untitled ? this.untitledText : paper.title;
    grip.setAttribute("aria-label", `${this.text("tabellify-table-move-paper")} ${title}`);
    cell.append(grip);
    return cell;
  },

  /**
   * Use a new column order (if it differs) and re-render.
   * @param {string[]} order
   * @param {string} movedId
   * @param {string} how  "drag" or "keyboard", for Debug Output
   * @returns {boolean} true if the order changed
   */
  setColumnOrder(order, movedId, how) {
    if (order.join(",") === this.columnOrder.join(",")) return false;
    this.columnOrder = order;
    this.renderMonitor();
    this.log(`layout: column ${movedId} moved to position ${order.indexOf(movedId) + 1} of ${order.length} (${how})`);
    this.layoutChanged();
    return true;
  },

  /**
   * Move one paper in the chosen collection's manual order and show that order. The order
   * shown NOW is the starting point (spec Q5: a move while sorted by a column starts from
   * what the user sees); this also drops papers that have gone and adds new ones.
   * @param {number} paperId
   * @param {(seed: string[], key: string) => string[]} computeOrder  e.g. a moveRow call
   * @param {string} how  "drag" or "keyboard", for Debug Output
   * @returns {boolean} true if something changed
   */
  movePaper(paperId, computeOrder, how) {
    const collectionKey = this.currentCollectionKey();
    const keys = this.monitorData?.keys;
    const key = keys?.get(paperId);
    if (!collectionKey || !key) return false;
    const seed = this.displayedPaperIds.map((id) => keys.get(id)).filter(Boolean);
    const next = computeOrder(seed, key);
    if (next.join(",") === seed.join(",")) return false; // e.g. Alt+Up on the first paper
    this.manualOrders.set(collectionKey, next);
    this.sortKey = TabellifyTableLayout.MANUAL;
    this.sortDirection = "asc";
    this.renderMonitor();
    this.log(
      `layout: paper ${paperId} moved to position ${next.indexOf(key) + 1} of ${next.length} ` +
      `in collection ${this.currentCollection} (${how}); showing manual order`,
    );
    this.layoutChanged();
    return true;
  },

  /**
   * Where a drag over the table would land, or null when it may not drop there (not our
   * drag, wrong kind, or no target under the pointer).
   * @param {DragEvent} event
   */
  dropTarget(event) {
    const drag = this.dragging;
    if (!drag) return null;
    // `types` lists the data types of the drag (here only to check it is ours).
    const types = Array.from(event.dataTransfer?.types ?? []);
    if (drag.kind === "column") {
      if (!types.includes(this.COLUMN_DRAG_TYPE)) return null;
      const th = event.target.closest?.("th[data-column]");
      if (!th) return null;
      const rect = th.getBoundingClientRect();
      const side = TabellifyTableLayout.dropSide(event.clientX, rect.left, rect.width);
      return { kind: "column", id: th.dataset.column, side, first: th, last: th };
    }
    if (!types.includes(this.ROW_DRAG_TYPE)) return null;
    const row = event.target.closest?.("tbody tr[data-paper-id]");
    if (!row) return null;
    const id = Number(row.dataset.paperId);
    // The paper row and, if open, its detail row count as one block.
    const rows = [...this.el("tabellify-items-body").querySelectorAll(`tr[data-paper-id="${id}"]`)];
    const top = rows[0].getBoundingClientRect().top;
    const bottom = rows[rows.length - 1].getBoundingClientRect().bottom;
    const side = TabellifyTableLayout.dropSide(event.clientY, top, bottom - top);
    return { kind: "row", id, side, first: rows[0], last: rows[rows.length - 1] };
  },

  /** Remove every drop line. */
  clearDropIndicator() {
    for (const node of this.el("tabellify-items-table").querySelectorAll(".tabellify-drop-before, .tabellify-drop-after")) {
      node.classList.remove("tabellify-drop-before", "tabellify-drop-after");
    }
  },

  /** Show the line where the dragged column or paper would land. */
  showDropIndicator(target) {
    this.clearDropIndicator();
    if (target.side === "before") target.first.classList.add("tabellify-drop-before");
    else target.last.classList.add("tabellify-drop-after");
  },

  /** Forget the drag and remove its marks (after a drop, or when it was cancelled). */
  endDrag() {
    this.dragging = null;
    this.clearDropIndicator();
    for (const node of this.el("tabellify-items-table").querySelectorAll(".tabellify-dragging")) {
      node.classList.remove("tabellify-dragging");
    }
  },

  /**
   * While dragging near the top or bottom edge of the scrolling area, scroll it a little
   * on each dragover (as Zotero's own tables do). No timer is needed.
   * @param {number} clientY
   */
  autoScroll(clientY) {
    const main = this.el("tabellify-workspace-main");
    const rect = main.getBoundingClientRect();
    const delta = TabellifyTableLayout.autoScrollDelta(clientY, rect.top, rect.bottom);
    if (delta !== 0) main.scrollBy(0, delta);
  },

  /**
   * Tell screen-reader users what a keyboard move did ("Title moved to position 2 of 5").
   * The status element is visually hidden; role="status" makes it read out. Plain text.
   * @param {string} name  Column name or paper title
   * @param {number} position  1-based
   * @param {number} total
   */
  announce(name, position, total) {
    this.el("tabellify-table-announce").textContent =
      `${name} ${this.text("tabellify-table-moved-to")} ${position} ${this.text("tabellify-table-of")} ${total}`;
  },

  /** Put the keyboard focus on a column's grip (after the header was rearranged). */
  focusColumnGrip(id) {
    this.el("tabellify-items-table").querySelector(`th[data-column="${id}"] .tabellify-grip`)?.focus();
  },

  /** Put the keyboard focus on a paper's grip (after the body was rebuilt). */
  focusRowGrip(paperId) {
    this.el("tabellify-items-body").querySelector(`.tabellify-grip[data-paper-id="${Number(paperId)}"]`)?.focus();
  },

  /** A grip in this table started a drag: remember what is dragged. */
  onTableDragStart: (event) => {
    const W = TabellifyWorkspace;
    W.dragging = null;
    const grip = event.target.closest?.(".tabellify-grip");
    // Not one of our grips (e.g. dragging selected text): leave the browser's default.
    if (!grip || !W.monitorData || !event.dataTransfer) return;
    const dt = event.dataTransfer;
    if (grip.dataset.grip === "column") {
      const th = grip.closest("th[data-column]");
      if (!th) return;
      W.dragging = { kind: "column", id: th.dataset.column };
      dt.setData(W.COLUMN_DRAG_TYPE, th.dataset.column);
      th.classList.add("tabellify-dragging");
    } else if (grip.dataset.grip === "row") {
      const tr = grip.closest("tr");
      W.dragging = { kind: "row", id: Number(grip.dataset.paperId) };
      dt.setData(W.ROW_DRAG_TYPE, grip.dataset.paperId);
      // Show the whole row under the pointer while dragging, held where it was grabbed.
      const rect = tr.getBoundingClientRect();
      dt.setDragImage(tr, event.clientX - rect.left, event.clientY - rect.top);
      tr.classList.add("tabellify-dragging");
    } else {
      return;
    }
    dt.effectAllowed = "move";
  },

  /** Allow the drop (preventDefault) only for our own drag over a valid target. */
  onTableDragOver: (event) => {
    const W = TabellifyWorkspace;
    if (!W.dragging) return; // not our drag: no preventDefault, so the drop is refused
    W.autoScroll(event.clientY);
    const target = W.dropTarget(event);
    if (!target) {
      W.clearDropIndicator();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    W.showDropIndicator(target);
  },

  /** The pointer left the table during a drag: hide the drop line. */
  onTableDragLeave: (event) => {
    const W = TabellifyWorkspace;
    if (!W.dragging) return;
    const table = W.el("tabellify-items-table");
    if (!event.relatedTarget || !table.contains(event.relatedTarget)) W.clearDropIndicator();
  },

  /** Our drag was dropped on a column header or a paper row: apply the move. */
  onTableDrop: (event) => {
    const W = TabellifyWorkspace;
    const target = W.dropTarget(event);
    if (!target) return;
    event.preventDefault(); // handled here; no default drop action
    const drag = W.dragging;
    W.endDrag();
    if (drag.id === target.id) return; // dropped onto itself
    if (target.kind === "column") {
      const rest = W.columnOrder.filter((c) => c !== drag.id);
      const index = rest.indexOf(target.id) + (target.side === "after" ? 1 : 0);
      W.setColumnOrder(TabellifyTableLayout.moveColumn(W.columnOrder, drag.id, index), drag.id, "drag");
    } else {
      const keys = W.monitorData.keys;
      let beforeId = target.id;
      if (target.side === "after") {
        const rest = W.displayedPaperIds.filter((id) => id !== drag.id);
        beforeId = rest[rest.indexOf(target.id) + 1] ?? null;
      }
      const beforeKey = beforeId === null ? null : keys.get(beforeId) ?? null;
      W.movePaper(drag.id, (seed, key) => TabellifyTableLayout.moveRow(seed, key, beforeKey), "drag");
    }
  },

  /** The drag ended (dropped anywhere, or cancelled): clean up. */
  onTableDragEnd: () => {
    TabellifyWorkspace.endDrag();
  },

  /**
   * Alt+arrow on a focused grip (Option+arrow on macOS): Left/Right moves a column, Up/Down
   * moves a paper. The focus stays on the moved item's grip, and the new position is
   * announced. Other keys are left alone.
   */
  onTableKeydown: (event) => {
    const W = TabellifyWorkspace;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const grip = event.target.closest?.(".tabellify-grip");
    if (!grip || !W.monitorData) return;
    if (grip.dataset.grip === "column") {
      const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      const th = grip.closest("th[data-column]");
      if (!delta || !th) return;
      event.preventDefault();
      const id = th.dataset.column;
      if (W.setColumnOrder(TabellifyTableLayout.moveColumnBy(W.columnOrder, id, delta), id, "keyboard")) {
        const name = th.querySelector(".tabellify-sort, .tabellify-column-label")?.textContent ?? id;
        W.announce(name, W.columnOrder.indexOf(id) + 1, W.columnOrder.length);
      }
      W.focusColumnGrip(id);
    } else if (grip.dataset.grip === "row") {
      const delta = { ArrowUp: -1, ArrowDown: 1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      const id = Number(grip.dataset.paperId);
      if (W.movePaper(id, (seed, key) => TabellifyTableLayout.moveRowBy(seed, key, delta), "keyboard")) {
        const title = W.el("tabellify-items-body")
          .querySelector(`tr[data-paper-id="${id}"] td.tabellify-col-title`)?.textContent ?? "";
        W.announce(title, W.displayedPaperIds.indexOf(id) + 1, W.displayedPaperIds.length);
      }
      W.focusRowGrip(id);
    }
  },

  /** Toolbar buttons: "Manual order", "Clear manual order", "Reset columns". */
  onToolbarClick: (event) => {
    const W = TabellifyWorkspace;
    const button = event.target.closest?.("button[data-action]");
    if (!button) return;
    switch (button.dataset.action) {
      case "manual-order":
        if (!W.currentManualOrder()) return;
        W.sortKey = TabellifyTableLayout.MANUAL;
        W.sortDirection = "asc";
        W.renderMonitor();
        W.log(`layout: manual order shown for collection ${W.currentCollection}`);
        break;
      case "clear-manual": {
        const key = W.currentCollectionKey();
        if (!key || !W.manualOrders.delete(key)) return;
        W.sortKey = TabellifyTagMonitor.DEFAULT_SORT.key;
        W.sortDirection = TabellifyTagMonitor.DEFAULT_SORT.direction;
        W.renderMonitor();
        // The two manual-order buttons are now hidden: keep the focus in the toolbar.
        W.el("tabellify-table-reset-columns").focus();
        W.log(`layout: manual order cleared for collection ${W.currentCollection}`);
        W.layoutChanged();
        break;
      }
      case "reset-columns":
        if (W.columnOrder.join(",") === TabellifyTableLayout.COLUMN_IDS.join(",")) return;
        W.columnOrder = [...TabellifyTableLayout.COLUMN_IDS];
        W.renderMonitor();
        W.log("layout: columns reset to the default order");
        W.layoutChanged();
        break;
    }
  },

  // ---------------------------------------------------------------------------------------
  // Feature 005c (ADR-0014): saving the layout in Tabellify's own layout.json.
  // File work: TabellifyLayoutStore. Checks: TabellifyTableLayout.validateLayout/migrateLayout.
  // Written only after a user action (a move, "Reset columns", "Clear manual order"),
  // LAYOUT_SAVE_DELAY_MS after the last one; never on load, never because the library
  // changed. Never the Zotero library.
  // ---------------------------------------------------------------------------------------

  /** Several quick keyboard moves give one write (ADR-0014 §4). */
  LAYOUT_SAVE_DELAY_MS: 1000,

  /** Resolves when initLayout() has finished (set in onLoad; init() waits for it). */
  layoutLoading: null,

  /** File functions and folder, set in initLayout(). */
  layoutFs: null,
  layoutDir: "",

  /** `revision` of layout.json as last loaded or saved (0 = no file yet). */
  layoutRevision: 0,

  /** False when layout.json could not be loaded: it must never be overwritten. */
  layoutEditable: false,

  /** The pending save timer's ID, or null. */
  layoutSaveTimer: null,

  /** True while a save runs; a change meanwhile sets layoutSaveAgain. */
  layoutSaving: false,
  layoutSaveAgain: false,

  /**
   * Start-up of the saved layout, called on "load". Own try/catch: a layout problem only
   * means the default layout; the table keeps working.
   */
  async initLayout() {
    try {
      await Zotero.initializationPromise;
      await this.formatStrings(this.LAYOUT_STRINGS);
      this.layoutFs = TabellifyLayoutStore.platformFs();
      // The same folder as codebooks.json (ADR-0012/0014). Asking the codebook store keeps
      // the internal data-directory property in one place.
      this.layoutDir = TabellifyCodebookStore.dataDir();
      await this.loadLayout();
    } catch (e) {
      this.layoutEditable = false;
      this.log("layout: could not load the saved layout; using the default layout, saving disabled");
      this.showLayoutStatus("tabellify-table-layout-load-error", this.layoutDir || null);
      Zotero.logError(e);
    }
  },

  /**
   * Read layout.json and use it. Never writes: a missing file means the default layout.
   * A damaged or newer file also gives the default layout, and saving is turned off so the
   * file stays as it is (the .bak next to it allows a manual recovery).
   * @returns {Promise<boolean>} true if layout changes can be saved
   */
  async loadLayout() {
    const result = await TabellifyLayoutStore.load(this.layoutFs, this.layoutDir);
    if (result.status === "ok") {
      this.applyLayout(result.data);
      this.layoutRevision = result.data.revision;
      this.layoutEditable = true;
      if (result.existed) {
        this.log(`layout: loaded ${result.path} (revision ${this.layoutRevision}, ${this.manualOrders.size} manual order(s))`);
      } else {
        this.log(`layout: no file yet at ${result.path}; using the default layout (nothing written)`);
      }
      this.showLayoutStatus(null);
    } else {
      this.applyLayout(TabellifyTableLayout.emptyLayout());
      this.layoutEditable = false;
      this.log(`layout: could not load ${result.path} (${result.status}): ${result.reason}; using the default layout, saving disabled`);
      const id = result.status === "newer" ? "tabellify-table-layout-newer" : "tabellify-table-layout-load-error";
      this.showLayoutStatus(id, result.path);
    }
    this.renderMonitor();
    return this.layoutEditable;
  },

  /**
   * Use loaded layout data (already cleaned by migrateLayout). If the chosen collection is
   * in manual order but no longer has one, fall back to the default sort.
   * @param {{ perPaperTable: { columnOrder: string[], manualOrders: Record<string, string[]> } }} data
   */
  applyLayout(data) {
    this.columnOrder = TabellifyTableLayout.normalizeColumnOrder(data.perPaperTable.columnOrder);
    this.manualOrders = new Map(Object.entries(data.perPaperTable.manualOrders));
    if (this.sortKey === TabellifyTableLayout.MANUAL && !this.currentManualOrder()) {
      this.sortKey = TabellifyTagMonitor.DEFAULT_SORT.key;
      this.sortDirection = TabellifyTagMonitor.DEFAULT_SORT.direction;
    }
  },

  /**
   * The user changed the layout: save it LAYOUT_SAVE_DELAY_MS after the last change
   * ("debouncing"). Does nothing when the file could not be loaded.
   */
  layoutChanged() {
    if (!this.layoutEditable) return;
    if (this.layoutSaveTimer !== null) window.clearTimeout(this.layoutSaveTimer);
    // A function (never a string) is passed to setTimeout.
    this.layoutSaveTimer = window.setTimeout(this.onLayoutSaveTimer, this.LAYOUT_SAVE_DELAY_MS);
  },

  /** The save timer fired. */
  onLayoutSaveTimer: () => {
    const W = TabellifyWorkspace;
    W.layoutSaveTimer = null;
    W.saveLayout();
  },

  /**
   * Write the current layout. Collections that no longer exist are left out (pruned);
   * the chosen collection's missing papers were already dropped by the move itself.
   */
  async saveLayout() {
    if (!this.layoutEditable) return;
    if (this.layoutSaving) {
      this.layoutSaveAgain = true; // save once more when the running save is done
      return;
    }
    this.layoutSaving = true;
    try {
      const known = this.collectionKeys.size > 0 ? new Set(this.collectionKeys.values()) : null;
      const data = TabellifyTableLayout.layoutData(this.columnOrder, this.manualOrders, known);
      const result = await TabellifyLayoutStore.saveData(this.layoutFs, this.layoutDir, data, this.layoutRevision);
      if (result.status === "saved") {
        this.layoutRevision = result.data.revision;
        this.log(`layout: saved revision ${this.layoutRevision} to ${result.path}`);
        this.showLayoutStatus(null);
      } else if (result.status === "conflict") {
        // Another Tabellify tab saved first (or the file changed or broke on disk): do not
        // overwrite; reload what is on disk and re-apply nothing (ADR-0014 §5).
        this.log(`layout: not saved, file changed elsewhere (${result.reason}); reloading`);
        this.layoutSaveAgain = false;
        if (await this.loadLayout()) this.showLayoutStatus("tabellify-table-layout-conflict");
      } else {
        // Write failed: the file on disk is unchanged (atomic write). The layout stays on
        // screen; the next change tries again.
        this.log(`layout: could not save ${result.path}`);
        Zotero.logError(result.error);
        this.showLayoutStatus("tabellify-table-layout-save-error");
      }
    } catch (e) {
      this.log("layout: save failed unexpectedly");
      Zotero.logError(e);
      this.showLayoutStatus("tabellify-table-layout-save-error");
    } finally {
      this.layoutSaving = false;
      if (this.layoutSaveAgain) {
        this.layoutSaveAgain = false;
        this.saveLayout();
      }
    }
  },

  /**
   * Show one layout-file message (or hide it with `null`), plain text, with the file path.
   * @param {string | null} id  Fluent ID (one of LAYOUT_STRINGS)
   * @param {string | null} [path]
   */
  showLayoutStatus(id, path = null) {
    this.el("tabellify-layout-status").hidden = id === null;
    this.el("tabellify-layout-status-text").textContent = id === null ? "" : this.text(id);
    const pathEl = this.el("tabellify-layout-status-path");
    pathEl.textContent = path ?? "";
    pathEl.hidden = !path;
  },

  /**
   * On close: stop the save timer. If a change was still waiting, start its save now. This
   * is best effort: the document is going away, so the save may not get to finish (the
   * file then simply keeps its previous, complete version, because writes are atomic).
   */
  stopLayoutSaveTimer() {
    if (this.layoutSaveTimer === null) return;
    try {
      window.clearTimeout(this.layoutSaveTimer);
    } catch (e) {
      // The window may already be gone; its timers went with it.
    }
    this.layoutSaveTimer = null;
    this.log("layout: workspace closing with an unsaved layout change; trying to save it now (may not complete)");
    this.saveLayout();
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
      // A new column sorts ascending, the active one reverses. A manual order is KEPT
      // (F005c): "Manual order" in the toolbar shows it again.
      const next = TabellifyTableLayout.nextSortState({ key: W.sortKey, direction: W.sortDirection }, key);
      W.sortKey = next.key;
      W.sortDirection = next.direction;
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
    TabellifyWorkspace.stopLayoutSaveTimer();
    TabellifyWorkspace.el("tabellify-collection-select")
      ?.removeEventListener("change", TabellifyWorkspace.onCollectionChange);
    TabellifyWorkspace.el("tabellify-monitor-refresh")
      ?.removeEventListener("click", TabellifyWorkspace.onRefreshClick);
    const table = TabellifyWorkspace.el("tabellify-items-table");
    table?.removeEventListener("click", TabellifyWorkspace.onTableClick);
    table?.removeEventListener("dragstart", TabellifyWorkspace.onTableDragStart);
    table?.removeEventListener("dragover", TabellifyWorkspace.onTableDragOver);
    table?.removeEventListener("dragleave", TabellifyWorkspace.onTableDragLeave);
    table?.removeEventListener("drop", TabellifyWorkspace.onTableDrop);
    table?.removeEventListener("dragend", TabellifyWorkspace.onTableDragEnd);
    table?.removeEventListener("keydown", TabellifyWorkspace.onTableKeydown);
    TabellifyWorkspace.el("tabellify-table-toolbar")
      ?.removeEventListener("click", TabellifyWorkspace.onToolbarClick);
    TabellifyWorkspace.el("tabellify-monitor-count-item-tags")
      ?.removeEventListener("change", TabellifyWorkspace.onCountItemTagsChange);
    const section = TabellifyWorkspace.el("tabellify-codebook");
    section?.removeEventListener("click", TabellifyWorkspace.onCodebookClick);
    section?.removeEventListener("keydown", TabellifyWorkspace.onCodebookKeydown);
    section?.removeEventListener("change", TabellifyWorkspace.onCodebookChange);
    window.removeEventListener("load", TabellifyWorkspace.onLoad);
    window.removeEventListener("unload", TabellifyWorkspace.onUnload);
  },

  onLoad: () => {
    // Independent start-ups: the saved table layout (F005c; init() waits for it before the
    // first table), the codebook and the F003 collection browser.
    TabellifyWorkspace.layoutLoading = TabellifyWorkspace.initLayout();
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
