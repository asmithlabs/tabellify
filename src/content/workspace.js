/* Tabellify — workspace.js (Feature 003 collection browser + Feature 004 codebook)
 *
 * Runs inside chrome://tabellify/content/workspace.xhtml, both when that document is shown
 * in the main-window tab (inside an <iframe>) and in the F001 fallback window.
 * workspace.xhtml loads Zotero's include.js first, which gives this document the global
 * `Zotero` object (docs/zotero-api-notes.md, include.js row).
 *
 * What it does:
 * - F003: fills a dropdown with every collection in My Library; when the user picks one,
 *   lists that collection's regular items (title + tags).
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
 * Lifecycle: everything here lives exactly as long as this document. The only listeners
 * are on this document's own window and elements, and they are removed on "unload".
 * No timers.
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

      const ids = [...this.CODEBOOK_STRINGS, ...this.codebookErrorIds()];
      const values = await Promise.all(ids.map((id) => document.l10n?.formatValue(id)));
      ids.forEach((id, i) => {
        if (values[i] != null) this.strings[id] = values[i];
      });
      this.el("tabellify-codebook-group-input").placeholder = this.text("tabellify-codebook-group-placeholder");

      this.codebookFs = TabellifyCodebookStore.platformFs();
      this.codebookDir = TabellifyCodebookStore.dataDir();
      await this.loadLibraryTags();
      await this.loadCodebook();
    } catch (e) {
      this.codebook = null;
      this.codebookEditable = false;
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

  /** Remove our listeners when the document goes away (lifecycle symmetry). */
  onUnload: () => {
    TabellifyWorkspace.el("tabellify-collection-select")
      ?.removeEventListener("change", TabellifyWorkspace.onCollectionChange);
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
