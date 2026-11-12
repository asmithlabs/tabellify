/* Tabellify — workspace.js (Feature 003 prototype: read-only collection browser)
 *
 * Runs inside chrome://tabellify/content/workspace.xhtml, both when that document is shown
 * in the main-window tab (inside an <iframe>) and in the F001 fallback window.
 * workspace.xhtml loads Zotero's include.js first, which gives this document the global
 * `Zotero` object (docs/zotero-api-notes.md, include.js row).
 *
 * What it does: fills a dropdown with every collection in My Library; when the user picks
 * one, lists that collection's regular items (title + tags).
 *
 * READ-ONLY. Every Zotero call here only reads (see the "Read-only guarantee" row in
 * docs/zotero-api-notes.md). Nothing is saved, changed or deleted in the library.
 *
 * SECURITY. Collection names, titles and tags come from the user's library and from
 * synced/imported data, so treat them as untrusted text. This document has full (chrome)
 * privileges, so library text parsed as markup could run code with those privileges.
 * Therefore library text is only ever put on the page as TEXT: `element.textContent = …`
 * or `new Option(text, value)`. The browser never parses those as HTML.
 * (tests/static/no-html-sinks.test.mjs fails if a markup-parsing API appears in src/.)
 *
 * Lifecycle: everything here lives exactly as long as this document. The only listeners
 * are on this document's own window and elements, and they are removed on "unload".
 * Nothing is added to Zotero or to the main window, so bootstrap.js has nothing to undo.
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
   * Rows for the items table, sorted by title. Empty titles get `untitledText` and sort last.
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
    try {
      // Normally already resolved (the workspace opens from a menu, after Zotero started),
      // so this returns at once. It guarantees all collections are loaded.
      await Zotero.initializationPromise;

      // "(untitled)" is needed as plain text in table cells, so ask Fluent for the string.
      this.untitledText = (await document.l10n?.formatValue("tabellify-untitled")) ?? "";

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
    TabellifyWorkspace.showCollection(event.target.value);
  },

  /**
   * Load and show the regular items of one collection.
   * @param {string} value  The chosen option's value (collection ID), "" for the placeholder
   */
  async showCollection(value) {
    const request = ++this.requestCounter;
    const table = this.el("tabellify-items-table");
    const body = this.el("tabellify-items-body");
    table.hidden = true;
    body.replaceChildren(); // remove the previous rows (no markup involved)

    if (value === "") {
      this.showStatus(null);
      return;
    }
    this.showStatus("tabellify-loading-items");
    try {
      const collection = Zotero.Collections.get(Number(value));
      if (!collection) throw new Error(`collection ${value} not found`);

      // Why waitForDataLoad: at start-up Zotero loads collections but NOT item data
      // (titles, tags, creators). Item data is loaded the first time a library is used.
      // Reading an item before that throws "… not loaded for item …". This call loads the
      // library's items into memory once (it only reads the database), and returns at once
      // if they are already loaded, e.g. because the main pane has shown My Library.
      await Zotero.Libraries.get(collection.libraryID).waitForDataLoad("item");
      if (request !== this.requestCounter) return; // the user picked another collection

      // Direct members only; trashed items are left out. Notes and attachments can be
      // direct members too, so keep only regular items.
      const items = collection.getChildItems().filter((i) => i.isRegularItem());
      this.log(`collection ${collection.id}: ${items.length} regular item(s)`);
      if (items.length === 0) {
        this.showStatus("tabellify-no-items");
        return;
      }

      const rows = this.itemRows(
        items.map((i) => ({ title: i.getDisplayTitle(), tags: i.getTags() })),
        this.untitledText,
      );
      for (const row of rows) {
        const tr = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");
        const titleCell = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
        const tagsCell = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
        // `textContent` puts the string in as text, never as markup (see SECURITY above).
        titleCell.textContent = row.title;
        if (row.untitled) titleCell.classList.add("tabellify-untitled");
        tagsCell.textContent = row.tags;
        tr.append(titleCell, tagsCell);
        body.append(tr);
      }
      this.showStatus(null);
      table.hidden = false;
    } catch (e) {
      if (request !== this.requestCounter) return;
      this.showStatus("tabellify-load-error");
      Zotero.logError(e);
    }
  },

  /** Remove our listeners when the document goes away (lifecycle symmetry). */
  onUnload: () => {
    TabellifyWorkspace.el("tabellify-collection-select")
      ?.removeEventListener("change", TabellifyWorkspace.onCollectionChange);
    window.removeEventListener("load", TabellifyWorkspace.onLoad);
    window.removeEventListener("unload", TabellifyWorkspace.onUnload);
  },

  onLoad: () => {
    TabellifyWorkspace.init();
  },
};

// Start once the whole document (including the elements below the <script> tags) exists.
// Skipped when the file is loaded in Node for the unit tests (there is no `window` there).
if (typeof window !== "undefined") {
  window.addEventListener("load", TabellifyWorkspace.onLoad, { once: true });
  window.addEventListener("unload", TabellifyWorkspace.onUnload, { once: true });
}
