/* Tabellify — workspace.js (F003 collection browser, F004 codebook, F005 tag monitor,
 * F006a workspace restructure, F006b script box suggestions)
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
 *   them with the codebook: one summary line "Tags used N/M · Papers n" and a per-paper
 *   table (which replaced the F003 item list). Owner decision 2026-11-13: that table's
 *   columns are Title, one column per codebook tag grouped under its super-tag (a ✓ where
 *   the paper has the tag), and "k/M".
 *   The comparison itself is pure logic in tag-monitor-model.js (TabellifyTagMonitor).
 *   Counting rule (owner decision 2026-11-13): only highlight tags count, unless the
 *   "Also count tags on the paper itself" checkbox is ticked. The checkbox is stored in the
 *   Zotero pref extensions.tabellify.countItemTags (a setting, not library data); this is
 *   the only place in Tabellify that writes it.
 * - F005c: formats the per-paper table and lets the user rearrange it: drag a tag column's
 *   grip (or Alt+Left/Right on it) to move it inside its group, drag a group header's grip
 *   to move the whole group, drag a paper's grip (or Alt+Up/Down) to put the papers in a
 *   hand-made "manual order" per collection. Moving columns never changes the codebook. The rules are pure logic
 *   in table-layout-model.js (TabellifyTableLayout). Only Tabellify's own arrays change:
 *   nothing is written to the library. The layout is saved in Tabellify's own
 *   layout.json (ADR-0014) by layout-store.js (TabellifyLayoutStore), one second after the
 *   last move; a file that cannot be read means "default layout" and is never overwritten.
 * - F004: shows and edits the codebook (planned tags, optionally in groups). The rules
 *   live in codebook-model.js (TabellifyCodebook); the file is read and written by
 *   codebook-store.js (TabellifyCodebookStore): Tabellify's own codebooks.json in
 *   <Zotero data directory>/tabellify/ (ADR-0012). workspace.xhtml loads both first.
 * - F006a: the tag script box adds tags and groups from one typed line (parsed by
 *   tag-script-model.js, TabellifyTagScript; applied by TabellifyCodebook.applyScript);
 *   the group pills show each group's tag count; "Edit groups and tags" renames and
 *   deletes groups and removes tags. Tags without a group (ADR-0016) form one block in
 *   the table under a blank group header.
 * - F006b: while typing in the script box, a suggestion list under it offers the tag
 *   names of My Library (read once, re-read after Refresh or a Zotero tag change), the
 *   codebook's group names and "Create tag" (codebook only). What the list contains is
 *   pure logic in script-suggest-model.js (TabellifyScriptSuggest).
 * - F006c: a tag column dragged into another group's span joins that group, dropped on
 *   the cells below another tag nests under it (when that tag is ungrouped, it becomes
 *   ONLY the name of a new or same-named group and leaves the codebook; owner amendment
 *   2026-11-13), and dragged up onto the group-header row becomes ungrouped; Alt+Up /
 *   Alt+Down on its grip do the same. Each such regroup is a normal codebook edit (same
 *   save as the script box); what a drop does is pure logic in regroup-model.js
 *   (TabellifyRegroup). Reordering stays in layout.json.
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
 * F006b adds three delegated listeners on the codebook section (focusin, focusout,
 * mousedown), removed in onUnload; no observer, timer or pref.
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
    // F005: "Refresh" (in the collection row since F006a), and one delegated click listener
    // on the per-paper table (sort buttons in the header). Removed in onUnload.
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
    this.columnLayout = TabellifyTableLayout.emptyColumnLayout();
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
    // A newly chosen collection starts in its manual order if it has one (F005c, spec Q2),
    // otherwise in the default order.
    const key = W.collectionKeys.get(Number(event.target.value));
    if (key && W.manualOrders.has(key)) {
      W.sortKey = TabellifyTableLayout.MANUAL;
      W.sortDirection = "asc";
    } else {
      W.sortKey = TabellifyTagMonitor.DEFAULT_SORT.key;
      W.sortDirection = TabellifyTagMonitor.DEFAULT_SORT.direction;
    }
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

  /**
   * Per-paper table order: a TabellifyTagMonitor.SORT_KEYS value, a tag column's key
   * (TabellifyTagMonitor.tagSortKey), or TabellifyTableLayout.MANUAL; and "asc"/"desc".
   */
  sortKey: "count",
  sortDirection: "asc",

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
          // `key`: read-only getter, 8 characters, the same on every computer and after
          // sync (docs/zotero-api-notes.md, F005c `item.key` row).
          keys.set(item.id, item.key);
        }
        papers.push({ id: item.id, title: entry.title, collectionId, itemTags: entry.itemTags, annotationTags: entry.annotationTags });
      }
    }
    return { rootId, collections, collectionKeys, papers, keys, annotationErrors, scopeSize: scope.length };
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
   * Show the summary line, the group pills and the per-paper table from `monitorData`
   * and the current codebook. Synchronous and read-only: it never reads the library, so it
   * can run after every codebook edit, every column move and every sort click.
   * @returns {ReturnType<typeof TabellifyTagMonitor.summarize> | null}
   */
  renderMonitor() {
    if (!this.monitorReady) {
      this.renderPills();
      return null;
    }
    const message = this.el("tabellify-monitor-message");
    const summary = this.el("tabellify-monitor-summary");
    const warning = this.el("tabellify-monitor-warning");

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
      this.renderPills();
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
    // F006a (spec Q2): one plain line, "Tags used 2/4 · Papers 3" (the dot is drawn by
    // workspace.css), plus "All codebook tags are used." when true.
    this.el("tabellify-monitor-papers").textContent =
      `${this.text("tabellify-monitor-papers")} ${result.paperCount}`;
    const allUsed = this.el("tabellify-monitor-all-used");
    allUsed.hidden = !result.allUsed;
    allUsed.textContent = this.text("tabellify-monitor-all-used");
    warning.hidden = data.annotationErrors === 0;
    warning.textContent = this.text("tabellify-monitor-annotations-error");

    this.renderPaperTable(result, counting);
    this.renderPills();
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
   * Rebuild the per-paper table body (and the header's columns and sort state).
   *
   * Columns (owner decision 2026-11-13): row grip, Title, one column per codebook tag
   * grouped under its super-tag, then k/M. A tag cell shows ✓ (drawn by workspace.css)
   * when the paper has the tag under the current counting rule: summarize() already
   * applied it (TabellifyTagMonitor.countedTagNames) and lists the paper's tags per group
   * in `present`. The tag columns follow the user's column order (TabellifyTableLayout),
   * which never changes the codebook.
   * @param {ReturnType<typeof TabellifyTagMonitor.summarize>} result
   * @param {boolean} counting  False when there is no codebook (or it has no tags)
   */
  renderPaperTable(result, counting) {
    const body = this.el("tabellify-items-body");
    body.replaceChildren();
    const groups = counting ? TabellifyTableLayout.orderedGroups(this.codebookGroups(), this.columnLayout) : [];
    this.tableGroups = groups;
    // Sorted by a tag column whose tag has left the codebook: back to the default sort.
    const sortTag = TabellifyTagMonitor.sortKeyTag(this.sortKey);
    if (sortTag !== null && !groups.some((g) => g.tags.includes(sortTag))) {
      this.sortKey = TabellifyTagMonitor.DEFAULT_SORT.key;
      this.sortDirection = TabellifyTagMonitor.DEFAULT_SORT.direction;
    }
    this.renderTableHeader(groups);
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

    const shown = this.displayedPapers(result.papers);
    this.displayedPaperIds = shown.map((p) => p.id);
    // F005c: shade every other paper row (pure rule in TabellifyTableLayout.stripeFlags).
    const stripes = TabellifyTableLayout.stripeFlags(shown.map(() => "paper"));
    const usedText = this.text("tabellify-table-tag-used");
    const notUsedText = this.text("tabellify-table-tag-not-used");
    shown.forEach((paper, index) => {
      const tr = this.html("tr");
      tr.dataset.paperId = String(paper.id);
      tr.classList.toggle("tabellify-row-alt", stripes[index]);
      // F005c: each cell carries its column class (tabellify-col-<kind>), which sets its
      // wrapping and alignment in workspace.css.
      const title = this.html("td", "tabellify-col-title");
      // `textContent` puts the string in as text, never as markup (see SECURITY above).
      title.textContent = paper.untitled ? this.untitledText : paper.title;
      if (paper.untitled) title.classList.add("tabellify-untitled");
      const present = new Set(paper.groups.flatMap((g) => g.present));
      const tagCells = groups.flatMap((group) => group.tags.map((tag, i) => {
        const has = present.has(tag);
        const cell = this.html("td", "tabellify-col-tag");
        if (i === 0) cell.classList.add("tabellify-group-start");
        if (has) cell.classList.add("tabellify-tag-used"); // CSS draws the ✓
        // Tooltip and screen-reader text, e.g. "Heat index: Used". Attribute values are
        // plain text, never parsed as markup.
        const label = `${tag}: ${has ? usedText : notUsedText}`;
        cell.title = label;
        cell.setAttribute("aria-label", label);
        // F006c: the cell names its column, so a tag column dropped on it can nest under
        // that tag. dataset values are attributes: plain strings, never used in a selector.
        cell.dataset.groupId = group.id;
        cell.dataset.tag = tag;
        return cell;
      }));
      const count = this.html("td", "tabellify-col-count tabellify-monitor-count");
      count.textContent = counting ? `${paper.count}/${paper.total}` : "–";
      // F005d (spec Q6): a paper with every codebook tag gets the "complete" look (green
      // plus a CSS ✓ in workspace.css). Only a class: no text or data changes.
      count.classList.toggle("tabellify-count-complete", counting && paper.total > 0 && paper.count === paper.total);
      tr.append(this.rowGripCell(paper), title, ...tagCells, count);
      body.append(tr);
    });
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
    "tabellify-table-move-group",
    "tabellify-table-move-tag",
    "tabellify-table-tag-used",
    "tabellify-table-tag-not-used",
    "tabellify-table-moved-to",
    "tabellify-table-of",
    "tabellify-table-layout-load-error",
    "tabellify-table-layout-newer",
    "tabellify-table-layout-save-error",
    "tabellify-table-layout-conflict",
    // F006c: regroup status, announcements and the drop hint.
    "tabellify-regroup-joined",
    "tabellify-regroup-created",
    "tabellify-regroup-ungrouped",
    "tabellify-regroup-announce-moved",
    "tabellify-regroup-announce-ungrouped",
    "tabellify-drop-hint-reorder",
    "tabellify-drop-hint-join",
    "tabellify-drop-hint-to-ungrouped",
    "tabellify-drop-hint-new-group",
    // F006c Amendment 2: the "Ungrouped" run headers and the flip announcement.
    "tabellify-table-ungrouped-label",
    "tabellify-regroup-announce-group-name",
  ],

  /** F006c: TabellifyRegroup.describe() hint → Fluent ID of the drop-hint text. */
  DROP_HINT_IDS: {
    reorder: "tabellify-drop-hint-reorder",
    join: "tabellify-drop-hint-join",
    "to-ungrouped": "tabellify-drop-hint-to-ungrouped",
    "new-group": "tabellify-drop-hint-new-group",
  },

  /**
   * F006c: regroup effect → Fluent ID shown after "Codebook saved.". A nest or a flip (a
   * tag became a group name, owner amendments 2026-11-13) always uses `created`'s text,
   * also when an existing group with that name was reused.
   */
  REGROUP_STATUS_IDS: {
    joined: "tabellify-regroup-joined",
    created: "tabellify-regroup-created",
    ungrouped: "tabellify-regroup-ungrouped",
  },

  /**
   * The user's order of the tag columns: `{ topOrder, tagOrder }` (TabellifyTableLayout,
   * layout.json schema 3, ADR-0019): `topOrder` is the left-to-right order of whole groups
   * and single ungrouped tags; `tagOrder` the order inside each group. One order for the
   * whole tab (not per collection). Kept apart from the codebook: moving a column never
   * changes codebooks.json (only a regroup drop does, through the normal codebook save).
   */
  columnLayout: { topOrder: [], tagOrder: {} },

  /**
   * The blocks shown now (TabellifyTableLayout.orderedGroups): groups, and "runs" of
   * neighbouring ungrouped tags (`ungrouped: true`, `run` = 0, 1, … from the left).
   */
  tableGroups: [],

  /** What the header was last built from; the header is rebuilt only when it changes. */
  headerSignature: null,

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

  /**
   * The drag that started in this table, or null: `{ kind: "group", id }` (a group header),
   * `{ kind: "tag", groupId, id }` (a tag column; `id` is the tag) or `{ kind: "row", id }`.
   */
  dragging: null,

  /**
   * F006c: what the shown drop indicator is for (a short key), or null when none is shown.
   * dragover fires many times a second; the DOM is only touched when this key changes.
   */
  dropKey: null,

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

  /** The codebook's groups (`{ id, name, tags }`, codebook order), or [] without a codebook. */
  codebookGroups() {
    return TabellifyTagMonitor.codebookGroups(this.codebook);
  },

  /** True for a run of tags without a group (ADR-0016 §5, ADR-0019 §2). */
  isUngrouped(group) {
    return group.id === TabellifyTagMonitor.UNGROUPED_ID;
  },

  /**
   * Build the group and tag header cells and the <col> elements for `groups` (already in
   * the user's order). The fixed cells (grip column, Title, k/M) come from workspace.xhtml
   * and stay. Only rebuilt when the columns changed, because rebuilding drops the keyboard
   * focus (a sort click or a live update keeps the same header).
   *
   * F006c Amendment 2 (ADR-0019): ungrouped tags may sit anywhere at the top level. Each
   * run of neighbouring ungrouped tags gets its own super-header reading "Ungrouped"
   * (muted text), spanning the run, with `data-group-id="ungrouped"` and `data-run="<k>"`
   * and NO grip (runs are not things that move; their tags move one by one). When only
   * ungrouped tags have columns (one run), there are no group headers to show, so the
   * header is ONE row: the tag headers go into the first row (before k/M) and the second
   * row is hidden (as in F006a).
   * @param {Array<{ id: string, name: string, tags: string[], run?: number }>} groups
   */
  renderTableHeader(groups) {
    const signature = JSON.stringify(groups.map((g) => [g.id, g.run ?? null, g.name, g.tags]));
    if (signature === this.headerSignature) return;
    this.headerSignature = signature;
    const groupRow = this.el("tabellify-items-group-row");
    const tagRow = this.el("tabellify-items-tag-row");
    const countHeader = this.el("tabellify-items-count-header");
    for (const th of groupRow.querySelectorAll("th[data-group-id]")) th.remove();
    tagRow.replaceChildren();
    // One header row when no real group has columns (only ungrouped tags, one run).
    const oneRow = groups.length > 0 && groups.every((g) => this.isUngrouped(g));
    // <col> elements: with `table-layout: fixed` the column widths come from them
    // (workspace.css), because the first header row has cells that span several columns.
    const cols = [this.html("col", "tabellify-col-grip"), this.html("col", "tabellify-col-title")];
    let tagCount = 0;
    for (const group of groups) {
      const ungrouped = this.isUngrouped(group);
      if (!oneRow) {
        // First row: the group (super-tag) header spans its tags.
        const th = this.html("th", "tabellify-col-group tabellify-group-start");
        th.setAttribute("scope", "colgroup");
        th.colSpan = group.tags.length;
        th.dataset.groupId = group.id;
        const name = this.html("span", "tabellify-column-label");
        if (ungrouped) {
          // A run's header: the visible text "Ungrouped" names it (muted in workspace.css);
          // `data-run` is its index, a number made here. No grip, no tooltip.
          th.classList.add("tabellify-col-group-ungrouped");
          th.dataset.run = String(group.run ?? 0);
          name.textContent = this.text("tabellify-table-ungrouped-label");
          th.append(name);
        } else {
          th.title = group.name; // full name as a tooltip (long names are cut with "…")
          name.textContent = group.name; // codebook text: plain text only (see SECURITY)
          th.append(this.columnGrip("group", `${this.text("tabellify-table-move-group")} ${group.name}`), name);
        }
        groupRow.insertBefore(th, countHeader);
      }
      // Second row (first row when oneRow): one header per tag; its button sorts by it.
      group.tags.forEach((tag, i) => {
        const tagTh = this.html("th", "tabellify-col-tag");
        if (i === 0) tagTh.classList.add("tabellify-group-start");
        tagTh.setAttribute("scope", "col");
        tagTh.dataset.groupId = group.id;
        tagTh.dataset.tag = tag; // dataset values are attributes: plain strings
        const button = this.html("button", "tabellify-sort");
        button.dataset.sort = TabellifyTagMonitor.tagSortKey(tag);
        button.textContent = tag;
        tagTh.append(this.columnGrip("tag", `${this.text("tabellify-table-move-tag")} ${tag}`), button);
        if (oneRow) groupRow.insertBefore(tagTh, countHeader);
        else tagRow.append(tagTh);
        cols.push(this.html("col", "tabellify-col-tag"));
        tagCount++;
      });
    }
    cols.push(this.html("col", "tabellify-col-count"));
    this.el("tabellify-items-cols").replaceChildren(...cols);
    // Without a second header row the fixed cells span one row.
    const twoRows = tagCount > 0 && !oneRow;
    tagRow.hidden = !twoRows;
    for (const th of groupRow.querySelectorAll("th.tabellify-fixed-header")) th.rowSpan = twoRows ? 2 : 1;
    // A CSS custom property (variable): workspace.css makes the table at least wide enough
    // for this many tag columns; the page then scrolls sideways instead of squeezing them.
    this.el("tabellify-items-table").style.setProperty("--tabellify-tag-columns", String(tagCount));
  },

  /**
   * The group pills (F006a): one per block with columns, in the table's column order, then
   * the groups without tags in codebook order ("Planned · 0"). Not interactive. The
   * ungrouped tags get ONE pill "Ungrouped · N" (N = all ungrouped tags), at the place of
   * the first run, however many runs the table shows (spec 006c A2-Q9). Built with text only; the
   * "·" between name and count is drawn by workspace.css. Shown whenever a codebook is
   * loaded, with or without a chosen collection.
   */
  renderPills() {
    const list = this.el("tabellify-group-pills");
    list.replaceChildren();
    const all = this.codebookLoadDone && this.codebook ? this.codebookGroups() : [];
    const shown = TabellifyTableLayout.orderedGroups(all, this.columnLayout);
    const allUngrouped = shown.filter((g) => this.isUngrouped(g)).flatMap((g) => g.tags);
    const blocks = [
      ...shown
        .filter((g) => !this.isUngrouped(g) || g.run === 0)
        .map((g) => (this.isUngrouped(g) ? { ...g, tags: allUngrouped } : g)),
      ...all.filter((g) => g.tags.length === 0),
    ];
    list.setAttribute("aria-label", this.text("tabellify-pills-label"));
    for (const group of blocks) {
      const ungrouped = this.isUngrouped(group);
      const label = ungrouped ? this.text("tabellify-pill-ungrouped") : group.name;
      const count = group.tags.length;
      const li = this.html("li", ungrouped ? "tabellify-pill tabellify-pill-ungrouped" : "tabellify-pill");
      li.dataset.groupId = group.id;
      const name = this.html("span", "tabellify-pill-name");
      name.textContent = label; // codebook text: plain text only (see SECURITY)
      const number = this.html("span", "tabellify-pill-count");
      number.textContent = String(count);
      // Screen-reader name, e.g. "Outcome: 3 tags" (attribute values are plain text).
      li.setAttribute("aria-label", `${label}: ${count} ${this.text("tabellify-pill-tags")}`);
      li.append(name, number);
      list.append(li);
    }
    list.hidden = blocks.length === 0;
  },

  /**
   * A grip for a group or tag header: a <span>, not a <button> (Firefox does not start a
   * drag from a draggable button). Alt+Left / Alt+Right on it moves the column.
   * @param {"group" | "tag"} kind
   * @param {string} label  Screen-reader name, plain text ("Move column: Heat index")
   */
  columnGrip(kind, label) {
    const grip = this.html("span", "tabellify-grip");
    grip.dataset.grip = kind;
    grip.setAttribute("draggable", "true");
    grip.setAttribute("tabindex", "0");
    grip.setAttribute("role", "button");
    // F006c: a tag column's grip also has Alt+Up and Alt+Down (regroup, Amendment 2 A2.9).
    grip.setAttribute("aria-keyshortcuts", kind === "tag"
      ? "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
      : "Alt+ArrowLeft Alt+ArrowRight");
    grip.setAttribute("aria-label", label);
    return grip;
  },

  /**
   * The header cell of a group (`tag` null) or of one tag column. Found by comparing
   * attribute values, not by a CSS selector, because tag names can contain any character.
   * Run headers ("Ungrouped") are never returned for `tag` null: there can be several;
   * use runHeader(k).
   * @param {string} groupId
   * @param {string | null} [tag]
   * @returns {Element | null}
   */
  columnHeader(groupId, tag = null) {
    for (const th of this.el("tabellify-items-table").querySelectorAll("thead th[data-group-id]")) {
      if (th.dataset.groupId !== groupId) continue;
      if (tag === null ? !th.hasAttribute("data-tag") && !th.hasAttribute("data-run") : th.dataset.tag === tag) return th;
    }
    return null;
  },

  /**
   * The "Ungrouped" super-header of run `run` (0 = the leftmost run), or null.
   * @param {number} run
   * @returns {Element | null}
   */
  runHeader(run) {
    for (const th of this.el("tabellify-items-table").querySelectorAll("thead th[data-run]")) {
      if (Number(th.dataset.run) === Number(run)) return th;
    }
    return null;
  },

  /**
   * The header cells a top-level block spans: its super-header (when the header has two
   * rows) and its first and last tag headers.
   * @param {{ id: string, tags: string[], run?: number }} block  From tableGroups
   * @returns {{ head: Element | null, first: Element | null, last: Element | null }}
   */
  blockHeaders(block) {
    const head = this.isUngrouped(block) ? this.runHeader(block.run) : this.columnHeader(block.id);
    return {
      head,
      first: this.columnHeader(block.id, block.tags[0]),
      last: this.columnHeader(block.id, block.tags[block.tags.length - 1]),
    };
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
   * Use a new column layout (if it changes what is shown), re-render and log the move.
   * @param {{ topOrder: Array<object>, tagOrder: Record<string, string[]> }} next
   * @param {string} groupId  The moved group, or the block of the moved tag ("ungrouped")
   * @param {string | null} tag  The moved tag, or null when a whole group moved
   * @param {string} how  "drag" or "keyboard", for Debug Output
   * @returns {{ position: number, total: number } | null} the new place (1-based), or null
   */
  setColumnLayout(next, groupId, tag, how) {
    const L = TabellifyTableLayout;
    const shownKey = (layout) => JSON.stringify(
      L.orderedGroups(this.codebookGroups(), layout).map((g) => [g.id, g.run ?? null, g.tags]),
    );
    if (shownKey(next) === shownKey(this.columnLayout)) return null;
    this.columnLayout = next;
    this.renderMonitor();
    let moved;
    if (tag === null || this.isUngrouped({ id: groupId })) {
      // A whole group or an ungrouped tag: its place among the top-level items (ADR-0019).
      const item = tag === null ? { group: groupId } : { tag };
      const top = L.visibleTopItems(this.codebookGroups(), this.columnLayout);
      moved = { position: top.findIndex((e) => L.sameTopItem(e, item)) + 1, total: top.length };
      // IDs only: an ungrouped tag's name is library/codebook text.
      const what = tag === null ? `group ${groupId}` : "an ungrouped tag column";
      this.log(`layout: ${what} moved to top-level position ${moved.position} of ${moved.total} (${how})`);
    } else {
      const tags = this.tableGroups.find((g) => g.id === groupId)?.tags ?? [];
      moved = { position: tags.indexOf(tag) + 1, total: tags.length };
      // The tag's name is library/codebook text: Debug Output gets only its position.
      this.log(`layout: a tag column of group ${groupId} moved to position ${moved.position} of ${moved.total} in its group (${how})`);
    }
    this.layoutChanged();
    return moved;
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
    if (drag.kind === "tag") {
      if (!types.includes(this.COLUMN_DRAG_TYPE)) return null;
      return this.tagDropTarget(event, drag);
    }
    if (drag.kind === "group") {
      if (!types.includes(this.COLUMN_DRAG_TYPE)) return null;
      return this.groupDropTarget(event, drag);
    }
    if (!types.includes(this.ROW_DRAG_TYPE)) return null;
    const row = event.target.closest?.("tbody tr[data-paper-id]");
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    const side = TabellifyTableLayout.dropSide(event.clientY, rect.top, rect.height);
    return { kind: "row", id: Number(row.dataset.paperId), side, first: row, last: row };
  },

  /**
   * F006c Amendment 2: where a dragged whole GROUP would land. Groups only reorder the top
   * level (layout.json only, never the codebook; groups can't go into groups):
   * - over any header cell of another group → before / after that group;
   * - over an ungrouped tag's header → before / after that tag;
   * - over a run's "Ungrouped" header → before its first / after its last tag.
   * The pointer's half of the cell decides before / after. Over the group itself: refused.
   * @param {DragEvent} event
   * @param {{ kind: "group", id: string }} drag
   */
  groupDropTarget(event, drag) {
    const th = event.target.closest?.("thead th[data-group-id]");
    if (!th) return null;
    const groupId = th.dataset.groupId;
    const sideOf = (cell) => {
      const rect = cell.getBoundingClientRect();
      return TabellifyTableLayout.dropSide(event.clientX, rect.left, rect.width);
    };
    if (this.isUngrouped({ id: groupId }) && th.hasAttribute("data-tag")) {
      // Beside one ungrouped tag (a group can go between ungrouped tags).
      const ref = { tag: th.dataset.tag };
      return { kind: "group", id: JSON.stringify(ref), ref, side: sideOf(th), first: th, last: th };
    }
    if (this.isUngrouped({ id: groupId })) {
      // A run's header: before its first or after its last tag; one line through both rows.
      const run = this.tableGroups.find((g) => this.isUngrouped(g) && g.run === Number(th.dataset.run));
      if (!run) return null;
      const side = sideOf(th);
      const ref = { tag: side === "before" ? run.tags[0] : run.tags[run.tags.length - 1] };
      const h = this.blockHeaders(run);
      return { kind: "group", id: JSON.stringify(ref), ref, side, first: h.first, last: h.last, head: th };
    }
    if (groupId === drag.id) return null; // over the dragged group itself
    // Any header of another group: the drop line is drawn on that group's header (F005c).
    const head = this.columnHeader(groupId);
    if (!head) return null;
    const ref = { group: groupId };
    return { kind: "group", id: JSON.stringify(ref), ref, side: sideOf(head), first: head, last: head };
  },

  /**
   * F006c (Amendment 2): where a dragged TAG column would land. The cell under the pointer
   * (dragover fires at that element) and the EDGE of that cell the pointer is in
   * (TabellifyTableLayout.dropEdge: clientX / clientY against getBoundingClientRect())
   * make the target; TabellifyRegroup applies the rules and the fallback:
   * - a tag header → cell "tag" with its edge;
   * - a group's super-header → cell "group"; a run's "Ungrouped" header → cell "run";
   * - a body cell of a tag column → that tag's header with the bottom edge (alias, A2-Q8),
   *   keeping the pointer's half of the cell as the fallback side.
   * Title, k/M and the grip column carry no data-group-id, so they are refused. A drop
   * that would change the codebook is refused while it cannot be saved.
   * @param {DragEvent} event
   * @param {{ kind: "tag", groupId: string, id: string }} drag
   */
  tagDropTarget(event, drag) {
    let regroup;
    let cell;
    let body = false;
    const th = event.target.closest?.("thead th[data-group-id]");
    if (th) {
      cell = th;
      const { edge, side } = TabellifyTableLayout.dropEdge(event.clientX, event.clientY, th.getBoundingClientRect());
      if (th.hasAttribute("data-tag")) {
        regroup = { cell: "tag", groupId: th.dataset.groupId, tag: th.dataset.tag, edge, side };
      } else if (th.hasAttribute("data-run")) {
        regroup = { cell: "run", groupId: th.dataset.groupId, run: Number(th.dataset.run), edge, side };
      } else {
        regroup = { cell: "group", groupId: th.dataset.groupId, edge, side };
      }
    } else {
      cell = event.target.closest?.("tbody td.tabellify-col-tag");
      if (!cell || !cell.hasAttribute("data-tag")) return null;
      const { side } = TabellifyTableLayout.dropEdge(event.clientX, event.clientY, cell.getBoundingClientRect());
      regroup = { cell: "tag", groupId: cell.dataset.groupId, tag: cell.dataset.tag, edge: "bottom", side };
      body = true;
    }
    const info = TabellifyRegroup.describe(this.codebook, this.columnLayout, { groupId: drag.groupId, tag: drag.id }, regroup);
    if (!info) return null;
    if (info.kind === "regroup" && !this.canRegroup()) return null;
    return { kind: "tag", id: regroup.tag ?? null, side: info.edge, first: cell, last: cell, regroup, info, body };
  },

  /** F006c: true when a regroup (a codebook edit) could be saved right now. */
  canRegroup() {
    return Boolean(this.codebook) && this.codebookEditable && !this.codebookBusy;
  },

  /** Every class a drop indicator can add (F005c lines, F006c regroup marks). */
  DROP_CLASSES: [
    "tabellify-drop-before", "tabellify-drop-after", "tabellify-drop-into", "tabellify-drop-nest",
    "tabellify-drop-above", "tabellify-drop-below",
  ],

  /** Remove every drop line and mark, and hide the drop hint. */
  clearDropIndicator() {
    this.dropKey = null;
    const selector = this.DROP_CLASSES.map((c) => `.${c}`).join(", ");
    for (const node of this.el("tabellify-items-table").querySelectorAll(selector)) {
      node.classList.remove(...this.DROP_CLASSES);
    }
    const hint = this.el("tabellify-drop-hint");
    hint.hidden = true;
    hint.textContent = "";
  },

  /**
   * Show where the dragged column or paper would land. Only touches the DOM when the
   * target changed since the last dragover.
   */
  showDropIndicator(target) {
    const r = target.regroup;
    // The key includes the RESOLVED edge (after the fallback) and the run index, so the
    // DOM changes only when the result changes, not on every dragover.
    const key = JSON.stringify([target.kind, target.id, target.side, r?.cell ?? null, r?.groupId ?? null,
      r?.run ?? null, target.info?.hint ?? null, target.body ?? false]);
    if (key === this.dropKey) return;
    this.clearDropIndicator();
    this.dropKey = key;
    if (!r) {
      if (target.side === "before") target.first.classList.add("tabellify-drop-before");
      else target.last.classList.add("tabellify-drop-after");
      // A group dropped beside a run: one line through both header rows.
      target.head?.classList.add(target.side === "before" ? "tabellify-drop-before" : "tabellify-drop-after");
      return;
    }
    this.markTagDrop(r, target.info.edge, target.info);
    this.showDropHint(target.info);
  },

  /**
   * F006c Amendment 2 (A2.7): the marks for a tag-column drop, for the RESOLVED edge. They
   * differ by shape (the hint names the result), so meaning never depends on colour.
   * @param {object} r  The TabellifyRegroup target
   * @param {string} edge  The resolved edge
   * @param {{ kind: string }} info  From TabellifyRegroup.describe()
   */
  markTagDrop(r, edge, info) {
    const add = (el, cls) => el?.classList.add(cls);
    const sideClass = edge === "left" ? "tabellify-drop-before" : "tabellify-drop-after";
    if (r.cell === "tag") {
      const th = this.columnHeader(r.groupId, r.tag);
      if (edge === "top") {
        add(th, "tabellify-drop-above"); // flip: a line along the top of B's header
      } else if (edge === "bottom") {
        // Nest: a line along the bottom of B's header and lines beside B's cells.
        // cellIndex is the cell's position in its row, so row.cells[index] is the same
        // column in each row.
        add(th, "tabellify-drop-below");
        const index = this.columnIndex(r.groupId, r.tag);
        if (index >= 0) {
          for (const row of this.el("tabellify-items-body").children) add(row.cells[index], "tabellify-drop-nest");
        }
      } else {
        add(th, sideClass);
        // Joining a group: also a line under that group's name.
        if (info.kind === "regroup" && !this.isUngrouped({ id: r.groupId })) add(this.columnHeader(r.groupId), "tabellify-drop-into");
      }
      return;
    }
    const block = r.cell === "run"
      ? this.tableGroups.find((g) => this.isUngrouped(g) && g.run === r.run)
      : this.tableGroups.find((g) => !this.isUngrouped(g) && g.id === r.groupId);
    if (!block) return;
    const h = this.blockHeaders(block);
    if (r.cell === "group" && edge === "bottom") {
      // Join at the end: a line under the group's name and at its right end.
      add(h.head, "tabellify-drop-into");
      add(h.last, "tabellify-drop-after");
    } else if (edge === "left") {
      add(h.head, "tabellify-drop-before"); // one vertical line through both header rows
      add(h.first, "tabellify-drop-before");
    } else {
      add(h.head, "tabellify-drop-after");
      add(h.last, "tabellify-drop-after");
    }
  },

  /**
   * The body cell index of tag column `tag` (its header's place among all columns), or -1.
   * Counted from the shown blocks: grip and Title come first.
   */
  columnIndex(groupId, tag) {
    let index = 2;
    for (const g of this.tableGroups) {
      const i = g.tags.indexOf(tag);
      if (i >= 0 && g.id === groupId) return index + i;
      index += g.tags.length;
    }
    return -1;
  },

  /**
   * F006c (spec Q6): the toolbar hint saying what the drop will do, as plain text, e.g.
   * "Move into group: Outcome". aria-hidden: mouse feedback only (keyboard moves are
   * announced instead).
   * @param {{ hint: string, name: string }} info  From TabellifyRegroup.describe()
   */
  showDropHint(info) {
    const id = this.DROP_HINT_IDS[info.hint];
    if (!id) return;
    const hint = this.el("tabellify-drop-hint");
    // The name is codebook text: textContent only (see SECURITY at the top).
    hint.textContent = info.name ? `${this.text(id)} ${info.name}` : this.text(id);
    hint.hidden = false;
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

  /** Put the keyboard focus on a group's or tag column's grip (after the header was rebuilt). */
  focusColumnGrip(groupId, tag = null) {
    this.columnHeader(groupId, tag)?.querySelector(".tabellify-grip")?.focus();
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
    if (grip.dataset.grip === "group" || grip.dataset.grip === "tag") {
      const th = grip.closest("th[data-group-id]");
      if (!th) return;
      W.dragging = grip.dataset.grip === "group"
        ? { kind: "group", id: th.dataset.groupId }
        : { kind: "tag", groupId: th.dataset.groupId, id: th.dataset.tag };
      // The drag data is only the kind ("group" / "tag"), never a codebook name.
      dt.setData(W.COLUMN_DRAG_TYPE, grip.dataset.grip);
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
      if (W.dropKey !== null) W.clearDropIndicator();
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
    if (target.kind === "tag") {
      // F006c: a tag column. The pure model decides (reorder, regroup or nothing).
      const plan = TabellifyRegroup.plan(W.codebook, W.columnLayout, { groupId: drag.groupId, tag: drag.id }, target.regroup);
      W.applyTagPlan(plan, drag.groupId, drag.id, "drag");
      return;
    }
    if (target.kind === "group") {
      // A whole group moves among the top level (groups and ungrouped tags), layout only.
      const next = TabellifyTableLayout.placeTopItem(W.columnLayout, W.codebookGroups(), { group: drag.id }, target.ref, target.side);
      W.setColumnLayout(next, drag.id, null, "drag");
    } else {
      if (drag.id === target.id) return; // dropped onto itself
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
   * F006c: carry out a TabellifyRegroup plan for tag column `tag` of block `fromGroupId`.
   * - "reorder": layout.json only (the F005c path).
   * - "regroup": a codebook edit, saved without blocking the caller (applyRegroup).
   * - "refused": the model's reason in the codebook status line.
   * @param {ReturnType<typeof TabellifyRegroup.plan>} plan
   * @param {string} fromGroupId
   * @param {string} tag
   * @param {string} how  "drag" or "keyboard", for Debug Output
   * @returns {Promise<boolean>} resolves true once a regroup is shown (false otherwise)
   */
  applyTagPlan(plan, fromGroupId, tag, how) {
    if (plan.kind === "reorder") {
      this.setColumnLayout(plan.layout, fromGroupId, tag, how);
      return Promise.resolve(false);
    }
    if (plan.kind === "refused") {
      this.showCodebookStatus(plan.error, null, true);
      return Promise.resolve(false);
    }
    if (plan.kind !== "regroup") return Promise.resolve(false);
    // async/await: applyRegroup returns a Promise at its first `await` (the file save), so
    // the event handler that called us finishes at once; errors are caught here.
    return this.applyRegroup(plan, fromGroupId, tag, how).catch((e) => {
      this.log("regroup: could not apply the change");
      Zotero.logError(e);
      return false;
    });
  },

  /**
   * F006c: save a regroup like any other codebook edit (revision check, atomic write,
   * .bak) and, only if the edit is now shown, use the plan's column layout so the column
   * lands where it was dropped. On a conflict or a refusal the layout is NOT changed.
   * @param {{ edit: object, layout: object, effect: string, groupId: string }} plan
   * @param {string} fromGroupId
   * @param {string} tag
   * @param {string} how
   * @returns {Promise<boolean>}
   */
  async applyRegroup(plan, fromGroupId, tag, how) {
    const statusId = plan.named ? this.REGROUP_STATUS_IDS.created : this.REGROUP_STATUS_IDS[plan.effect];
    const shown = await this.applyCodebookEdit(plan.edit, statusId ?? null);
    if (!shown) return false;
    this.columnLayout = plan.layout;
    this.renderMonitor();
    this.layoutChanged();
    // IDs, edges and counts only: tag and group names are library/codebook text and never
    // go to Debug Output.
    this.log(`regroup: tag dropped on the ${plan.edge} edge (${how})`);
    if (plan.effect === "created") this.log(`regroup: group ${plan.groupId} created by a nest (${how})`);
    // A nest removes the target tag from the codebook, a flip the dragged tag: that tag
    // became the group's name.
    if (plan.named === "below") this.log(`regroup: the nest target tag became the name of group ${plan.groupId} and left the codebook (${how})`);
    if (plan.named === "above") {
      this.log(`regroup: the dragged tag from block ${fromGroupId} became the name of group ${plan.groupId} and left the codebook (${how})`);
    } else {
      this.log(`regroup: a tag moved from block ${fromGroupId} to block ${plan.groupId} (${how})`);
    }
    // Screen readers: "Temperature moved to group Outcome" / "Heat index is now ungrouped" /
    // "smoker is now a group name" (flip).
    const group = TabellifyCodebook.findGroup(this.codebook, plan.groupId);
    let text;
    if (plan.named === "above") text = `${tag} ${this.text("tabellify-regroup-announce-group-name")}`;
    else if (plan.groupId === TabellifyCodebook.UNGROUPED_ID || !group) text = `${tag} ${this.text("tabellify-regroup-announce-ungrouped")}`;
    else text = `${tag} ${this.text("tabellify-regroup-announce-moved")} ${group.name}`;
    this.el("tabellify-table-announce").textContent = text;
    return true;
  },

  /**
   * Alt+arrow on a focused grip (Option+arrow on macOS); each key equals one drop:
   * - tag column in a group: Left/Right move it inside the group (stops at its edges);
   * - ungrouped tag column, or a group's grip: Left/Right move it one TOP-LEVEL place
   *   (past one ungrouped tag or past a whole group, ADR-0019);
   * - tag column: Up/Down regroup it (spec 006c Amendment 2, A2.9, through
   *   TabellifyRegroup.keyboardTarget: Up leaves the group, or flips with the ungrouped
   *   tag to its left; Down nests under the ungrouped tag to its left, or joins the group
   *   to its left);
   * - paper row: Up/Down move the paper.
   * The focus stays on the moved item's grip (after a flip: the new group's grip), and the
   * move is announced. Other keys are left alone.
   */
  onTableKeydown: (event) => {
    const W = TabellifyWorkspace;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const grip = event.target.closest?.(".tabellify-grip");
    if (!grip || !W.monitorData) return;
    if (grip.dataset.grip === "tag" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      // F006c: Alt+Up / Alt+Down regroup the column (the same plans as the mouse drops).
      const th = grip.closest("th[data-group-id]");
      if (!th) return;
      event.preventDefault();
      const groupId = th.dataset.groupId;
      const tag = th.dataset.tag;
      const direction = event.key === "ArrowUp" ? "up" : "down";
      const target = TabellifyRegroup.keyboardTarget(W.codebook, W.columnLayout, { groupId, tag }, direction);
      if (!target) return;
      const plan = TabellifyRegroup.plan(W.codebook, W.columnLayout, { groupId, tag }, target);
      if (plan.kind === "regroup" && !W.canRegroup()) return;
      W.applyTagPlan(plan, groupId, tag, "keyboard").then((shown) => {
        // The header was rebuilt: put the focus back on the moved column's grip; after a
        // flip the tag is no column any more, so on the new group's grip.
        if (shown && plan.named === "above") W.focusColumnGrip(plan.groupId);
        else W.focusColumnGrip(shown ? plan.groupId : groupId, tag);
      });
      return;
    }
    if (grip.dataset.grip === "group" || grip.dataset.grip === "tag") {
      const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      const th = grip.closest("th[data-group-id]");
      if (!delta || !th) return;
      event.preventDefault();
      const groupId = th.dataset.groupId;
      const tag = grip.dataset.grip === "tag" ? th.dataset.tag : null;
      const L = TabellifyTableLayout;
      let next;
      if (tag === null) next = L.moveTopItemBy(W.columnLayout, W.codebookGroups(), { group: groupId }, delta);
      else if (W.isUngrouped({ id: groupId })) next = L.moveTopItemBy(W.columnLayout, W.codebookGroups(), { tag }, delta);
      else next = L.moveTagBy(W.columnLayout, W.codebookGroups(), groupId, tag, delta);
      const moved = W.setColumnLayout(next, groupId, tag, "keyboard");
      if (moved) {
        const group = W.tableGroups.find((g) => g.id === groupId);
        W.announce(tag ?? group?.name ?? "", moved.position, moved.total);
      }
      W.focusColumnGrip(groupId, tag);
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
      case "reset-columns": {
        // Back to the codebook's own order: all ungrouped tags in one run at the left, then
        // the groups (A2-Q12). Grouping is never undone. Nothing to do when nothing moved.
        const { topOrder, tagOrder } = W.columnLayout;
        if (topOrder.length === 0 && Object.keys(tagOrder).length === 0) return;
        W.columnLayout = TabellifyTableLayout.emptyColumnLayout();
        W.renderMonitor();
        W.log("layout: columns reset to the codebook order");
        W.layoutChanged();
        break;
      }
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
        // An older file is migrated in memory only (version 1: the old summary columns are
        // dropped; version 2: groupOrder becomes the top-level order, ADR-0019 §4). The next
        // save after a user action writes version 3 and keeps the old file as .bak.
        const migrated = result.fromVersion === 1
          ? `, migrated in memory from schemaVersion 1: old column order dropped`
          : result.fromVersion < TabellifyTableLayout.SCHEMA_VERSION
            ? `, migrated in memory from schemaVersion ${result.fromVersion}: group order turned into the top-level order`
            : "";
        this.log(
          `layout: loaded ${result.path} (revision ${this.layoutRevision}, ${this.manualOrders.size} manual order(s), ` +
          `column order for ${this.columnLayout.topOrder.length} top-level item(s)${migrated})`,
        );
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
   * @param {{ perPaperTable: { topOrder: Array<object>, tagOrder: Record<string, string[]>,
   *   manualOrders: Record<string, string[]> } }} data
   */
  applyLayout(data) {
    const { topOrder, tagOrder } = TabellifyTableLayout.layoutData(data.perPaperTable, []);
    this.columnLayout = { topOrder, tagOrder };
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
      const data = TabellifyTableLayout.layoutData(this.columnLayout, this.manualOrders, known);
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
    // F006b: a tag was added, removed or renamed somewhere in the library. Only note it;
    // the suggestion list is re-read the next time the script box gets focus. This comes
    // before the early return below, so it also works when no collection is chosen.
    if (type === "item-tag") W.libraryTagsStale = true;
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
    // F006b: Refresh also re-reads the tag list for the suggestions (not awaited: it
    // never rejects, and the table does not depend on it).
    W.loadLibraryTags();
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
   * column (Title, k/M or a tag column; clicking the active column again reverses the
   * order). It does not read the library.
   */
  onTableClick: (event) => {
    const W = TabellifyWorkspace;
    const button = event.target.closest?.("button[data-sort]");
    if (!button || !W.monitorData) return;
    const key = button.dataset.sort;
    // A new column sorts ascending (a tag column: papers with ✓ first), the active one
    // reverses. A manual order is KEPT (F005c): "Manual order" in the toolbar shows it again.
    const next = TabellifyTableLayout.nextSortState({ key: W.sortKey, direction: W.sortDirection }, key);
    W.sortKey = next.key;
    W.sortDirection = next.direction;
    W.renderMonitor();
    // Keep the focus on the clicked header (compared by value: tag names can contain any
    // character, so they are not put into a CSS selector).
    for (const b of W.el("tabellify-items-table").querySelectorAll("button[data-sort]")) {
      if (b.dataset.sort === key) b.focus();
    }
  },

  // ---------------------------------------------------------------------------------------
  // Feature 004 / 006a: Codebook section (uses Zotero, the DOM and the disk; checked by the
  // owner's smoke test). Rules: TabellifyCodebook. Script parser: TabellifyTagScript.
  // File: TabellifyCodebookStore. Nothing here writes to the Zotero library: a tag typed
  // into the script box exists only in codebooks.json.
  // ---------------------------------------------------------------------------------------

  /**
   * Fluent IDs the codebook code shows from JavaScript. They are formatted once in
   * initCodebook() (document.l10n.formatValue) and kept in `strings`, so showing a message
   * later is synchronous and two quick messages cannot arrive out of order.
   * tests/static/workspace-script.test.mjs checks that each exists in tabellify.ftl.
   */
  CODEBOOK_STRINGS: [
    "tabellify-script-placeholder",
    "tabellify-script-error-unbalanced",
    "tabellify-script-error-empty-tag",
    "tabellify-script-error-empty-group",
    "tabellify-script-error-nested",
    "tabellify-script-error-missing-comma",
    "tabellify-script-error-unclosed-quote",
    "tabellify-script-error-duplicate",
    "tabellify-script-nothing-new",
    "tabellify-script-moved",
    "tabellify-script-suggestions-label",
    "tabellify-script-create",
    "tabellify-script-create-hint",
    "tabellify-script-group-hint",
    "tabellify-pills-label",
    "tabellify-pill-ungrouped",
    "tabellify-pill-tags",
    "tabellify-codebook-ungrouped",
    "tabellify-codebook-rename",
    "tabellify-codebook-rename-save",
    "tabellify-codebook-rename-cancel",
    "tabellify-codebook-delete",
    "tabellify-codebook-group-name-label",
    "tabellify-codebook-remove-tag",
    "tabellify-codebook-remove-tag-tooltip",
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

  /**
   * F006b: the tag names of My Library, prepared for the suggestion list
   * (TabellifyScriptSuggest.prepare), or null before the first successful read.
   */
  libraryIndex: null,

  /**
   * F006b "stale flag": true after Zotero reported a tag change. Instead of re-reading the
   * tag list on every change, the list is re-read the next time the script box gets focus.
   */
  libraryTagsStale: false,

  /** The running read of the tag list (a Promise), so two reads never overlap; or null. */
  libraryTagsLoading: null,

  /** F006b: the options shown in the suggestion list, the token they are for, and the
   *  index of the highlighted option (-1 = none; spec Q1: none until ↓ is pressed). */
  suggestOptions: [],
  suggestToken: null,
  suggestActive: -1,

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
    // element's data-action to decide what to do. "input" fires on every edit of a text
    // box (F006a: it hides the script box's error). Removed in onUnload.
    section.addEventListener("click", this.onCodebookClick);
    section.addEventListener("keydown", this.onCodebookKeydown);
    section.addEventListener("input", this.onCodebookInput);
    // F006b: the suggestion list. "focusin"/"focusout" are the versions of focus/blur that
    // bubble up to the section (plain focus/blur do not bubble, so delegation would miss
    // them). "mousedown" picks an option before the box would lose focus. Removed in onUnload.
    section.addEventListener("focusin", this.onCodebookFocusin);
    section.addEventListener("focusout", this.onCodebookFocusout);
    section.addEventListener("mousedown", this.onCodebookMousedown);
    try {
      await Zotero.initializationPromise;

      await this.formatStrings([...this.CODEBOOK_STRINGS, ...this.codebookErrorIds()]);
      // A plain-text attribute value (never markup), set from Fluent text.
      this.el("tabellify-script-input").placeholder = this.text("tabellify-script-placeholder");
      this.el("tabellify-script-suggestions").setAttribute("aria-label", this.text("tabellify-script-suggestions-label"));

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
   * Read the tag names of My Library for the F006b suggestion list. Read-only: a SELECT
   * query in Zotero (docs/zotero-api-notes.md); it includes highlight tags (RT-S1). On
   * failure the previous list is kept (empty at first) and the rest of the codebook works.
   *
   * While a read is running, a second call gets the same Promise instead of starting
   * another read. The stale flag is cleared when a read STARTS, so a tag change reported
   * during the read marks the result stale again.
   * @returns {Promise<void>}  Never rejects
   */
  loadLibraryTags() {
    if (this.libraryTagsLoading) return this.libraryTagsLoading;
    this.libraryTagsStale = false;
    this.libraryTagsLoading = (async () => {
      try {
        const tags = await Zotero.Tags.getAll(Zotero.Libraries.userLibraryID);
        this.libraryIndex = TabellifyScriptSuggest.prepare(tags);
        // Counts only, never tag names.
        this.log(`codebook: ${this.libraryIndex.entries.length} tag name(s) in My Library for suggestions (${this.libraryIndex.skippedQuote} with a quotation mark left out)`);
      } catch (e) {
        this.log("codebook: could not list the tags in My Library");
        Zotero.logError(e);
      } finally {
        this.libraryTagsLoading = null;
      }
    })();
    return this.libraryTagsLoading;
  },

  /**
   * Read codebooks.json and show it. Never writes: a missing file just starts empty.
   * @returns {Promise<boolean>} true if the codebook can be edited
   */
  async loadCodebook() {
    const result = await TabellifyCodebookStore.load(this.codebookFs, this.codebookDir);
    this.renamingGroupId = null;
    if (result.status === "ok") {
      this.codebook = result.data;
      this.codebookRevision = result.data.revision;
      this.codebookEditable = true;
      if (result.existed) {
        const groups = TabellifyCodebook.groups(result.data).length;
        const tags = result.data.codebooks[0].tags.length;
        // ADR-0016 §3: a version 1 file is converted in memory only; the next save after
        // a user edit writes version 2 (and keeps the old data in codebooks.v1.json).
        const migrated = result.fromVersion < TabellifyCodebook.SCHEMA_VERSION
          ? `, migrated in memory from schemaVersion ${result.fromVersion}; the file is rewritten only by the next edit`
          : "";
        this.log(`codebook: loaded ${result.path} (revision ${this.codebookRevision}, ${groups} group(s), ${tags} tag(s)${migrated})`);
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
   * @param {string | null} [savedExtraId]  Fluent ID shown after "Codebook saved." (F006a)
   * @returns {Promise<boolean>} true if the edit is now shown (saved, or shown but not saved)
   */
  async applyCodebookEdit(edit, savedExtraId = null) {
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
      if (result.v1Copy) {
        // ADR-0016 §3: the one-time copy of the version 1 file. A failure (e.g. the copy
        // already exists) does not stop the save; the .bak file holds the old data too.
        if (result.v1Copy.ok) this.log(`codebook: kept the schemaVersion 1 data once in ${result.v1Copy.path}`);
        else {
          this.log(`codebook: could not write the one-time copy ${result.v1Copy.path}; continuing (codebooks.json.bak keeps the old data)`);
          Zotero.logError(result.v1Copy.error);
        }
      }
      if (result.status === "saved") {
        this.codebook = result.data;
        this.codebookRevision = result.data.revision;
        this.log(`codebook: saved revision ${this.codebookRevision} (schemaVersion ${result.data.schemaVersion}) to ${result.path}`);
        this.showCodebookStatus("tabellify-codebook-saved", null, false, savedExtraId);
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
   * @param {string | null} [extraId]  A second Fluent message shown after the first
   */
  showCodebookStatus(id, path = null, isError = false, extraId = null) {
    const status = this.el("tabellify-codebook-status");
    const pathEl = this.el("tabellify-codebook-status-path");
    status.hidden = id === null;
    status.classList.toggle("tabellify-codebook-error", isError);
    const text = id === null ? "" : this.text(id);
    this.el("tabellify-codebook-status-text").textContent = extraId ? `${text} ${this.text(extraId)}` : text;
    pathEl.textContent = path ?? "";
    pathEl.hidden = !path;
  },

  /** Enable the editing controls only when the file loaded and no save is running. */
  updateCodebookControls() {
    const disabled = !this.codebookEditable || this.codebookBusy;
    this.el("tabellify-codebook-controls").disabled = disabled;
    // F006b: no suggestion list while the box cannot be used.
    if (disabled) this.closeSuggestions();
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
   * @param {string | null} groupId
   */
  actionButton(action, labelId, groupId) {
    const button = this.html("button");
    button.textContent = this.text(labelId);
    button.dataset.action = action;
    if (groupId !== null) button.dataset.groupId = groupId;
    return button;
  },

  /**
   * Rebuild the "Edit groups and tags" list from `this.codebook` (and, through
   * renderMonitor, the pills and the table). Every name goes in as text only
   * (textContent), never as markup (see SECURITY at the top).
   */
  renderCodebook() {
    // F005: the table and the pills follow every codebook change (no library read needed).
    this.renderMonitor();
    this.updateCodebookControls();
    const container = this.el("tabellify-codebook-groups");
    container.replaceChildren();
    if (!this.codebook) return;

    // Ungrouped tags first, as in the table and the pills (only when there are some).
    const ungrouped = TabellifyCodebook.tagsIn(this.codebook, null);
    if (ungrouped.length > 0) {
      const box = this.html("div", "tabellify-codebook-group tabellify-codebook-ungrouped");
      const header = this.html("div", "tabellify-codebook-group-header");
      const name = this.html("h3", "tabellify-codebook-group-name");
      name.textContent = this.text("tabellify-codebook-ungrouped");
      header.append(name);
      box.append(header, this.editorTagList(ungrouped));
      container.append(box);
    }

    for (const group of TabellifyCodebook.groups(this.codebook)) {
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
        // Delete needs no confirmation (spec F006a Q4): the group's tags become ungrouped.
        header.append(
          name,
          this.actionButton("rename", "tabellify-codebook-rename", group.id),
          this.actionButton("delete", "tabellify-codebook-delete", group.id),
        );
      }
      box.append(header);
      const tags = TabellifyCodebook.tagsIn(this.codebook, group.id);
      if (tags.length > 0) box.append(this.editorTagList(tags));
      container.append(box);
    }
  },

  /**
   * The tags of one editor box, each with its × button (removes it from the codebook only).
   * @param {string[]} tags
   */
  editorTagList(tags) {
    const list = this.html("ul", "tabellify-codebook-tags");
    for (const tag of tags) {
      const item = this.html("li");
      const label = this.html("span");
      label.textContent = tag;
      const remove = this.actionButton("remove-tag", "tabellify-codebook-remove-tag", null);
      // dataset values are attributes (plain strings), never parsed as markup.
      remove.dataset.tag = tag;
      remove.title = this.text("tabellify-codebook-remove-tag-tooltip");
      remove.setAttribute("aria-label", `${this.text("tabellify-codebook-remove-tag-tooltip")}: ${tag}`);
      item.append(label, remove);
      list.append(item);
    }
    return list;
  },

  /**
   * The rename box of one group.
   * @param {string} groupId
   * @returns {HTMLInputElement | undefined}
   */
  renameInput(groupId) {
    return [...this.el("tabellify-codebook-groups").querySelectorAll("input")]
      .find((i) => i.dataset.action === "rename-input" && i.dataset.groupId === groupId);
  },

  /** @param {string} groupId */
  async renameFromInput(groupId) {
    const value = this.renameInput(groupId)?.value ?? "";
    const edit = TabellifyCodebook.renameGroup(this.codebook, groupId, value);
    if (edit.ok) this.renamingGroupId = null;
    await this.applyCodebookEdit(edit);
  },

  // ---- Feature 006a: the tag script box ------------------------------------------------

  /**
   * Show a script error under the box: the message (plain text), aria-invalid on the input,
   * and the problem selected inside the box so the user sees where it is. The typed text
   * stays as it is.
   * @param {string} id  Fluent ID
   * @param {number} start  Character offsets of the problem
   * @param {number} end
   */
  showScriptError(id, start, end) {
    const input = this.el("tabellify-script-input");
    const error = this.el("tabellify-script-error");
    error.textContent = this.text(id);
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.focus();
    // setSelectionRange(start, end): select those characters of the text box (standard DOM).
    input.setSelectionRange(start, end);
  },

  /** Hide the script error (the user edited the text, or an entry was added). */
  hideScriptError() {
    const error = this.el("tabellify-script-error");
    error.hidden = true;
    error.textContent = "";
    this.el("tabellify-script-input").removeAttribute("aria-invalid");
  },

  /**
   * Enter in the script box: parse the whole line and apply it to the codebook, all or
   * nothing. A parse error or a refused entry keeps the text and shows the reason; an
   * entry that changes nothing is not saved. After a successful save the box is cleared
   * and keeps the focus, so the next entry can be typed at once.
   */
  async commitScript() {
    this.closeSuggestions();
    const input = this.el("tabellify-script-input");
    const text = String(input.value ?? "");
    const parsed = TabellifyTagScript.parse(text);
    if (!parsed.ok) {
      // Only the error kind goes to Debug Output, never the typed text.
      this.log(`codebook: script entry not accepted (${parsed.error})`);
      this.showScriptError(parsed.error, parsed.start, parsed.end);
      return;
    }
    if (parsed.items.length === 0) return; // only spaces and commas: nothing to add
    const edit = TabellifyCodebook.applyScript(this.codebook, parsed.items);
    if (!edit.ok) {
      this.showScriptError(edit.error, 0, text.length);
      return;
    }
    this.hideScriptError();
    const { added, moved, unchanged, groupsCreated } = edit.report;
    this.log(`codebook: script entry: ${added} added, ${moved} moved, ${unchanged} unchanged, ${groupsCreated} group(s) created`);
    if (added + moved + groupsCreated === 0) {
      input.value = "";
      this.showCodebookStatus("tabellify-script-nothing-new");
      input.focus();
      return;
    }
    const saved = await this.applyCodebookEdit(edit, moved > 0 ? "tabellify-script-moved" : null);
    if (saved) input.value = "";
    input.focus();
  },

  // ---- Feature 006b: the suggestion list under the script box ------------------------

  /** True while the suggestion list is shown. */
  suggestionsOpen() {
    return this.suggestOptions.length > 0;
  },

  /**
   * Work out the token at the cursor and show its suggestions (or close the list).
   * Called after every edit of the box, after a group was accepted, and after a re-read
   * of the tag list.
   * @param {{ browse?: boolean }} [options]  browse: ↓ was pressed (spec Q7: an empty
   *   token then lists the first library tags alphabetically)
   */
  updateSuggestions({ browse = false } = {}) {
    const input = this.el("tabellify-script-input");
    if (!this.codebook || !this.codebookEditable || this.codebookBusy) {
      this.closeSuggestions();
      return;
    }
    // Only for a plain cursor, not when a range of text is selected.
    if (input.selectionStart !== input.selectionEnd) {
      this.closeSuggestions();
      return;
    }
    const token = TabellifyTagScript.tokenAt(String(input.value ?? ""), input.selectionStart);
    // Read from the current codebook on every call, so codebook edits need no reload.
    const groups = TabellifyCodebook.groups(this.codebook);
    const codebookTags = new Set([
      ...TabellifyCodebook.tagsIn(this.codebook, null),
      ...groups.flatMap((g) => TabellifyCodebook.tagsIn(this.codebook, g.id)),
    ]);
    const options = TabellifyScriptSuggest.suggest(this.libraryIndex, token, {
      codebookTags,
      groupNames: groups.map((g) => g.name),
      browse,
    });
    this.renderSuggestions(token, options);
  },

  /**
   * Draw the options as <li role="option"> elements. Every name goes in as text only
   * (textContent). Option IDs use the option's position, never its name (a tag name may
   * contain any character, so it is never put into an ID or a CSS selector).
   * @param {object | null} token
   * @param {Array<{ kind: string, name: string }>} options
   */
  renderSuggestions(token, options) {
    if (options.length === 0) {
      this.closeSuggestions();
      return;
    }
    const input = this.el("tabellify-script-input");
    const list = this.el("tabellify-script-suggestions");
    const items = options.map((option, i) => {
      const li = this.html("li", "tabellify-suggest-option");
      li.id = `tabellify-script-option-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.index = String(i);
      const name = this.html("span", "tabellify-suggest-name");
      li.append(name);
      if (option.kind === "create") {
        li.classList.add("tabellify-suggest-create");
        name.textContent = `${this.text("tabellify-script-create")} "${option.name}"`;
        li.append(this.suggestHint("tabellify-script-create-hint"));
      } else {
        name.textContent = option.name;
        if (option.kind === "group") li.append(this.suggestHint("tabellify-script-group-hint"));
      }
      return li;
    });
    this.suggestOptions = options;
    this.suggestToken = token;
    this.suggestActive = -1;
    list.replaceChildren(...items);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    input.removeAttribute("aria-activedescendant");
    this.log(`suggestions: ${options.length} options`); // a count, never typed text
  },

  /** A muted note after an option's name ("group", "codebook only"). */
  suggestHint(id) {
    const hint = this.html("span", "tabellify-suggest-hint");
    hint.textContent = this.text(id);
    return hint;
  },

  /** Hide the list and forget its options. Safe to call when it is already closed. */
  closeSuggestions() {
    const wasOpen = this.suggestionsOpen();
    this.suggestOptions = [];
    this.suggestToken = null;
    this.suggestActive = -1;
    if (!wasOpen) return;
    const list = this.el("tabellify-script-suggestions");
    list.hidden = true;
    list.replaceChildren();
    const input = this.el("tabellify-script-input");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  },

  /**
   * Highlight option `index` (-1 = none). The focus stays in the text box; the box's
   * aria-activedescendant tells a screen reader which option is highlighted.
   * @param {number} index
   */
  setActiveOption(index) {
    const list = this.el("tabellify-script-suggestions");
    const input = this.el("tabellify-script-input");
    const items = list.children;
    if (this.suggestActive >= 0) items[this.suggestActive]?.setAttribute("aria-selected", "false");
    this.suggestActive = index;
    const li = index >= 0 ? items[index] : null;
    if (!li) {
      this.suggestActive = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    li.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", li.id);
    // Scroll the list only as far as needed to show the option ("nearest").
    li.scrollIntoView?.({ block: "nearest" });
  },

  /**
   * Put option `index` into the box. Only the token at the cursor is replaced; the text
   * before and after it stays. Nothing is saved: the entry reaches the codebook (never
   * Zotero) only when the user presses Enter.
   * @param {number} index
   */
  acceptOption(index) {
    const option = this.suggestOptions[index];
    const token = this.suggestToken;
    const input = this.el("tabellify-script-input");
    const value = String(input.value ?? "");
    if (!option || !token || token.end > value.length) {
      this.closeSuggestions();
      return;
    }
    const result = TabellifyScriptSuggest.accept(value, token, option);
    // setRangeText(text, start, end, "end") replaces those characters of the box and puts
    // the cursor after the new text (standard DOM; it does not fire an "input" event).
    input.setRangeText(result.text.slice(token.start, result.cursor), token.start, token.end, "end");
    input.setSelectionRange(result.cursor, result.cursor);
    this.hideScriptError();
    this.log(`suggestions: accepted a ${option.kind} option`);
    // A group reopens the list for its tags (as soon as a letter is typed); the others close it.
    if (option.kind === "group") this.updateSuggestions();
    else this.closeSuggestions();
  },

  /**
   * Keys in the script box while suggestions are possible (spec "Behaviour", Q1).
   * @param {KeyboardEvent} event
   * @returns {boolean} true if the key was handled here (the caller does nothing more)
   */
  onScriptKeydown(event) {
    // While an input method (e.g. for Japanese) is composing text, its keys belong to it.
    if (event.isComposing) return true;
    const open = this.suggestionsOpen();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          this.updateSuggestions({ browse: true });
          if (this.suggestionsOpen()) this.setActiveOption(0);
        } else {
          this.setActiveOption(Math.min(this.suggestActive + 1, this.suggestOptions.length - 1));
        }
        return true;
      case "ArrowUp":
        if (!open) return false;
        event.preventDefault();
        // ↑ on the first option removes the highlight.
        this.setActiveOption(this.suggestActive - 1);
        return true;
      case "Tab":
        // Shift+Tab (and Tab with the list closed) keep their normal meaning: move focus.
        if (!open || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
        event.preventDefault();
        this.acceptOption(this.suggestActive >= 0 ? this.suggestActive : 0);
        return true;
      case "Enter":
        if (open && this.suggestActive >= 0) {
          event.preventDefault();
          this.acceptOption(this.suggestActive);
          return true;
        }
        return false; // the caller commits the entry (commitScript closes the list)
      case "Escape":
        if (!open) return false;
        // Handled here only: stopPropagation keeps Zotero from also reacting to Esc.
        event.preventDefault();
        event.stopPropagation();
        this.closeSuggestions();
        return true;
      default:
        return false;
    }
  },

  /** Focus enters the script box: re-read a stale tag list once, then refresh the list. */
  onCodebookFocusin: (event) => {
    const W = TabellifyWorkspace;
    if (event.target?.dataset?.action !== "script-input") return;
    if (!W.libraryTagsStale || W.libraryTagsLoading) return;
    const input = event.target;
    W.loadLibraryTags().then(() => {
      // Only if the box still has focus (and this document still exists).
      try {
        if (document.activeElement === input && input.value) W.updateSuggestions();
      } catch (e) {
        // The document is gone (tab closed while reading): nothing to update.
      }
    });
  },

  /** Focus leaves the script box (e.g. a click elsewhere on the page): close the list. */
  onCodebookFocusout: (event) => {
    const W = TabellifyWorkspace;
    if (event.target?.dataset?.action !== "script-input") return;
    W.closeSuggestions();
  },

  /**
   * A mouse press on an option accepts it. preventDefault() on "mousedown" stops the
   * browser from moving the focus away from the text box, so the cursor stays there.
   */
  onCodebookMousedown: (event) => {
    const W = TabellifyWorkspace;
    const li = event.target?.closest?.('li[role="option"]');
    if (!li || !W.suggestionsOpen()) return;
    event.preventDefault();
    const index = Number(li.dataset.index);
    if (Number.isInteger(index)) W.acceptOption(index);
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

    switch (action) {
      case "rename":
        W.renamingGroupId = groupId;
        W.renderCodebook();
        W.renameInput(groupId)?.select();
        break;
      case "rename-save":
        W.renameFromInput(groupId);
        break;
      case "rename-cancel":
        W.renamingGroupId = null;
        W.renderCodebook();
        break;
      case "delete":
        // Its tags become ungrouped (spec Q4): nothing is lost, so no confirmation.
        W.applyCodebookEdit(TabellifyCodebook.deleteGroup(W.codebook, groupId));
        break;
      case "remove-tag":
        W.applyCodebookEdit(TabellifyCodebook.removeTagFromCodebook(W.codebook, target.dataset.tag));
        break;
    }
  },

  /** Enter in the script box adds the entry; Enter / Escape in a rename box save / cancel. */
  onCodebookKeydown: (event) => {
    const W = TabellifyWorkspace;
    const { action, groupId } = event.target.dataset ?? {};
    if (!action || !W.codebook) return;
    // F006b: arrows, Tab, Enter on a highlighted option and Esc for the suggestion list.
    if (action === "script-input" && W.onScriptKeydown(event)) return;
    // Only the text boxes are handled; Enter on a button keeps its normal "click".
    if (event.key === "Enter" && action === "script-input") {
      event.preventDefault();
      W.commitScript();
    } else if (event.key === "Enter" && action === "rename-input") {
      event.preventDefault();
      W.renameFromInput(groupId);
    } else if (event.key === "Escape" && action === "rename-input") {
      W.renamingGroupId = null;
      W.renderCodebook();
    }
  },

  /**
   * Editing the script box hides its error (the text no longer matches the message) and
   * (F006b) updates the suggestion list for the token at the cursor.
   */
  onCodebookInput: (event) => {
    const W = TabellifyWorkspace;
    if (event.target?.dataset?.action !== "script-input") return;
    W.hideScriptError();
    W.updateSuggestions();
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
    section?.removeEventListener("input", TabellifyWorkspace.onCodebookInput);
    section?.removeEventListener("focusin", TabellifyWorkspace.onCodebookFocusin);
    section?.removeEventListener("focusout", TabellifyWorkspace.onCodebookFocusout);
    section?.removeEventListener("mousedown", TabellifyWorkspace.onCodebookMousedown);
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
