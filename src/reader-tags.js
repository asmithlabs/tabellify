/* Tabellify — reader-tags.js (Feature 005b: "Tabellify tags" section beside the reader)
 *
 * Adds one collapsible section to Zotero's item pane with the documented
 * `Zotero.ItemPaneManager.registerSection` API (ADR-0013, option A). Zotero shows item pane
 * sections in the library's right-hand pane AND in the right-hand "context pane" of every
 * reader tab (for the paper the open PDF/EPUB/snapshot belongs to). The section says how
 * many codebook tags this paper already has ("2 / 3", also shown when collapsed) and, when
 * expanded, a CHECKLIST of every codebook tag grouped by super-tag: ✓ used, ☐ not yet
 * (owner change 2026-11-13).
 *
 * COUNTING RULE (owner decision 2026-11-13, same as the workspace's tag monitor because
 * both use TabellifyTagMonitor.countedTagNames): only tags on the paper's highlights count,
 * unless the pref `extensions.tabellify.countItemTags` is true ("Also count tags on the
 * paper itself" in the Tabellify tab). This section only READS that pref, on every render;
 * a change made in the Tabellify tab shows up on the section's next render (switching
 * item or tab, or any tag change). There is no pref observer.
 *
 * WHERE THIS CODE RUNS: tabellify.js loads this file with
 * `Services.scriptloader.loadSubScript`, so it runs in the plugin's bootstrap scope (like
 * tabellify.js), not in any document. Zotero calls the section hooks below from the main
 * window whenever it draws the section; `body` and `doc` are that window's elements.
 *
 * Needs these globals, loaded first by tabellify.js:
 *   TabellifyCodebook (content/codebook-model.js), TabellifyCodebookStore
 *   (content/codebook-store.js), TabellifyTagMonitor (content/tag-monitor-model.js).
 *
 * READ-ONLY: reads the shown item, its attachments, their annotations, the tags of all of
 * these, codebooks.json (through TabellifyCodebookStore.load only) and one Tabellify pref
 * (Zotero.Prefs.get). Writes nothing.
 * Library text (tag and group names) reaches the page only through `textContent`.
 *
 * Lifecycle (CLAUDE.md rule 9): `register()` (from Tabellify.init) adds the section and one
 * Notifier observer and keeps both returned ids; `unregister()` (from Tabellify.shutdown)
 * removes both with those ids. Nothing is added per window: Zotero puts the section into
 * every item pane itself, and removes it from all of them on unregister.
 *
 * Verified APIs: docs/zotero-api-notes.md (Feature 005b rows, ADR-0013 appendix).
 */
"use strict";

var TabellifyReaderTags = {
  /** Our pane id. Zotero namespaces it with the plugin ID and returns the result. */
  PANE_ID: "reader-tags",
  HTML_NS: "http://www.w3.org/1999/xhtml",
  /**
   * Header icon 16×16, side-nav icon 20×20 (sizes from Zotero's JSDoc). chrome:// URLs work
   * while bootstrap's chrome registration lives; shutdown removes the section before
   * that registration is destroyed. That the icon loads from here is UNVERIFIED at runtime
   * (smoke test AC1).
   */
  HEADER_ICON: "chrome://tabellify/content/icons/reader-tags-16.svg",
  SIDENAV_ICON: "chrome://tabellify/content/icons/reader-tags-20.svg",
  /** Notifier types that can change a paper's tags: items (annotations, trash) and item tags. */
  NOTIFIER_TYPES: ["item", "item-tag"],
  /** Shown as the header summary when there is nothing to count. */
  NO_SUMMARY: "—",

  /**
   * Id returned by `registerSection` (namespaced, NOT "reader-tags"), or null.
   * @type {string | null}
   */
  sectionID: null,
  /**
   * Key returned by `Zotero.Notifier.registerObserver`, or null.
   * @type {string | null}
   */
  observerID: null,
  /** True between `register` and `unregister`; async renders check it after each `await`. */
  active: false,
  /**
   * The `refresh` function of every live section, keyed by the section's `body` element.
   * A Map rather than a Set because Zotero passes `refresh` only to `onInit`; `onDestroy`
   * gets just `body`, which is how we find the entry to delete.
   * @type {Map<any, () => Promise<void>>}
   */
  refreshers: new Map(),
  /**
   * Render counter per section body. An async render that finishes after a newer render
   * has started (e.g. the user switched papers) must not overwrite the newer result.
   * A WeakMap forgets bodies that Zotero has thrown away, so it needs no cleanup.
   * @type {WeakMap<any, number>}
   */
  renderSeq: new WeakMap(),
  /** @type {(message: string) => void} */
  log: (message) => Zotero.debug(`Tabellify: ${message}`),

  /**
   * Register the section and the Notifier observer. Called once from Tabellify.init.
   * @param {{ pluginID: string, log?: (message: string) => void }} params
   */
  register({ pluginID, log }) {
    if (this.active) return;
    if (log) this.log = log;
    this.active = true;
    try {
      // registerSection validates the options and returns the namespaced id, or false.
      // Arrow functions keep `this` pointing at TabellifyReaderTags when Zotero calls them.
      const id = Zotero.ItemPaneManager.registerSection({
        paneID: this.PANE_ID,
        pluginID,
        // header: the section title (Fluent `.label`); sidenav: the icon strip (`.tooltiptext`).
        header: { l10nID: "tabellify-reader-section-header", icon: this.HEADER_ICON },
        sidenav: { l10nID: "tabellify-reader-section-sidenav", icon: this.SIDENAV_ICON },
        onInit: ({ body, refresh }) => this.onInit({ body, refresh }),
        onDestroy: ({ body }) => this.onDestroy({ body }),
        onItemChange: ({ item, setEnabled }) => this.onItemChange({ item, setEnabled }),
        onRender: ({ body, doc, setSectionSummary }) => this.onRender({ body, doc, setSectionSummary }),
        // `async` hook: Zotero calls it after onRender and does not block the pane on it.
        onAsyncRender: ({ body, doc, item, setSectionSummary }) =>
          this.onAsyncRender({ body, doc, item, setSectionSummary }),
      });
      if (id) {
        this.sectionID = id;
        this.log(`reader section registered (${id})`);
      }
      else {
        this.log("reader section registration failed");
      }
    }
    catch (err) {
      Zotero.logError(err);
    }
    if (!this.sectionID) return; // no section: nothing for an observer to refresh

    try {
      // Any object with a `notify(event, type, ids, extraData)` method can observe. We do
      // not read `ids` (their format for item-tag events is not relied on): any change of
      // these types simply asks every live section to render again.
      this.observerID = Zotero.Notifier.registerObserver(
        { notify: () => this.onNotify() },
        this.NOTIFIER_TYPES,
        "tabellify",
      );
      this.log(`notifier observer added (${this.observerID})`);
    }
    catch (err) {
      Zotero.logError(err);
    }
  },

  /**
   * Undo `register`, in reverse order. Each step has its own try/catch, so a failure in one
   * still lets the other run. Called from Tabellify.shutdown.
   */
  unregister() {
    this.active = false;
    if (this.observerID) {
      try {
        Zotero.Notifier.unregisterObserver(this.observerID);
        this.log(`notifier observer removed (${this.observerID})`);
      }
      catch (err) {
        Zotero.logError(err);
      }
      this.observerID = null;
    }
    if (this.sectionID) {
      try {
        // Must be the id registerSection RETURNED. Zotero then removes the section from
        // every open item pane (library and reader tabs), which runs our onDestroy.
        const removed = Zotero.ItemPaneManager.unregisterSection(this.sectionID);
        this.log(`reader section unregistered: ${removed}`);
      }
      catch (err) {
        Zotero.logError(err);
      }
      this.sectionID = null;
    }
    // Safety net in case Zotero did not call onDestroy for some section.
    this.refreshers.clear();
  },

  // ---- Section hooks (Zotero calls these) -----------------------------------------------

  /** A section element was created: remember how to ask it to render again. */
  onInit({ body, refresh }) {
    if (typeof refresh === "function") this.refreshers.set(body, refresh);
  },

  /** A section element was removed (pane closed, tab closed, or our unregister). */
  onDestroy({ body }) {
    this.refreshers.delete(body);
  },

  /** Show the section only for items it can count (hidden for notes, annotations, links). */
  onItemChange({ item, setEnabled }) {
    setEnabled(this.isApplicable(item));
  },

  /**
   * Synchronous first draw: "Counting…" until onAsyncRender has the numbers.
   * @param {{ body: any, doc: any, setSectionSummary: (s: string) => void }} props
   */
  onRender({ body, doc, setSectionSummary }) {
    this.renderSeq.set(body, (this.renderSeq.get(body) ?? 0) + 1);
    body.replaceChildren(this.para(doc, "tabellify-reader-counting"));
    setSectionSummary("");
  },

  /**
   * Read the paper's tags and the codebook, then fill the section.
   * `async`/`await`: reading waits for Zotero's cache and the disk without freezing the
   * window. Anything that fails is logged and shown as "Could not read the codebook."
   * @param {{ body: any, doc: any, item: any, setSectionSummary: (s: string) => void }} props
   */
  async onAsyncRender({ body, doc, item, setSectionSummary }) {
    const seq = this.renderSeq.get(body);
    // True if this render is outdated (newer render started, or plugin disabled meanwhile).
    const stale = () => !this.active || this.renderSeq.get(body) !== seq;
    try {
      if (!this.isApplicable(item)) return;
      // Fills Zotero's in-memory cache (tags, child items, annotations); reads only.
      await Zotero.Libraries.get(item.libraryID).waitForDataLoad("item");
      if (stale()) return;
      const paper = this.collectPaperTags(item);
      if (!paper.applicable) return;
      const countItemTags = this.readCountItemTags();

      const loaded = await this.loadCodebook();
      if (stale()) return;
      if (loaded.status !== "ok") {
        this.log(`reader section: codebook not usable (${loaded.status}): ${loaded.reason ?? ""}`);
        body.replaceChildren(this.para(doc, "tabellify-reader-codebook-error"));
        setSectionSummary(this.NO_SUMMARY);
        return;
      }

      // The pure model applies the counting rule (highlights only, unless the switch is on).
      const summary = TabellifyTagMonitor.paperChecklist(loaded.data, paper, { countItemTags });
      if (summary.total === 0) {
        body.replaceChildren(this.para(doc, "tabellify-reader-no-codebook"));
        setSectionSummary(this.NO_SUMMARY);
        return;
      }
      const text = await this.formatSummary(doc, summary.used, summary.total);
      if (stale()) return;
      body.replaceChildren(...this.checklistNodes(doc, summary));
      setSectionSummary(text);
    }
    catch (err) {
      Zotero.logError(err);
      if (stale()) return;
      body.replaceChildren(this.para(doc, "tabellify-reader-codebook-error"));
      setSectionSummary(this.NO_SUMMARY);
    }
  },

  /** Notifier callback: ask every live section to render again. */
  onNotify() {
    if (!this.active) return;
    for (const refresh of [...this.refreshers.values()]) {
      try {
        // refresh() returns a Promise; a rejected one is logged, never left unhandled.
        Promise.resolve(refresh()).catch((err) => Zotero.logError(err));
      }
      catch (err) {
        Zotero.logError(err);
      }
    }
  },

  // ---- Reading (read-only) -------------------------------------------------------------

  /**
   * Can the section count this item? Regular items and file attachments (PDF, EPUB,
   * snapshot) yes; notes, annotations and linked-URL attachments no.
   * @param {any} item
   */
  isApplicable(item) {
    if (!item) return false;
    if (item.isNote() || item.isAnnotation()) return false;
    if (item.isAttachment()) return item.isFileAttachment();
    return true;
  },

  /**
   * The paper's tags, kept apart by where they sit: `itemTags` on the item itself (for a
   * standalone file attachment: its own tags) and `annotationTags` on every non-trashed
   * annotation of its non-trashed file attachments. Copied as plain `{ tag, type }`
   * objects; which of them COUNT (manual only, item tags only with the switch on) is
   * decided by TabellifyTagMonitor.countedTagNames, the same rule as F005's tag monitor.
   * Call after `waitForDataLoad("item")`.
   * @param {any} item  The item the pane shows
   * @returns {{ applicable: boolean, itemTags: Array<{ tag: string, type?: number }>,
   *             annotationTags: Array<{ tag: string, type?: number }> }}
   */
  collectPaperTags(item) {
    if (!this.isApplicable(item)) return { applicable: false, itemTags: [], annotationTags: [] };
    // getAttachments() only works on regular items (it throws on attachments) and returns
    // IDs; trashed attachments are left out. A standalone attachment is its own "file".
    const files = item.isAttachment() ? [item] : Zotero.Items.get(item.getAttachments());
    // getTags() gives `{ tag, type? }` objects; copy only those two fields.
    const copy = (t) => ({ tag: t.tag, type: t.type });
    const itemTags = item.getTags().map(copy);
    const annotationTags = [];
    for (const file of files) {
      // Only file attachments have annotations; getAnnotations() throws on linked URLs.
      if (!file.isFileAttachment()) continue;
      // getAnnotations() leaves trashed annotations out by default.
      for (const annotation of file.getAnnotations()) annotationTags.push(...annotation.getTags().map(copy));
    }
    return { applicable: true, itemTags, annotationTags };
  },

  /**
   * The owner's switch "Also count tags on the paper itself" (a boolean Zotero pref, set
   * only from the Tabellify tab). `Zotero.Prefs.get(name, true)`: `true` = `name` is the
   * full pref name (without it Zotero would put its own "extensions.zotero." in front). A
   * pref that was never set reads as `undefined`, hence `=== true` (default: off). Any
   * error also means "off": the section then counts highlight tags only.
   * @returns {boolean}
   */
  readCountItemTags() {
    try {
      return Zotero.Prefs.get(TabellifyTagMonitor.COUNT_ITEM_TAGS_PREF, true) === true;
    }
    catch (err) {
      Zotero.logError(err);
      return false;
    }
  },

  /**
   * Load codebooks.json. Only `readJSON` and `join` are passed on, so the store cannot
   * write from here even by mistake (`load` needs nothing else).
   * @returns {Promise<any>}  TabellifyCodebookStore's LoadResult
   */
  loadCodebook() {
    const { readJSON, join } = TabellifyCodebookStore.platformFs();
    return TabellifyCodebookStore.load({ readJSON, join }, TabellifyCodebookStore.dataDir());
  },

  // ---- Drawing (textContent and Fluent only) -------------------------------------------

  /**
   * "2 / 3" from Fluent (`tabellify-reader-summary`), or plain digits if Fluent fails.
   * @returns {Promise<string>}
   */
  async formatSummary(doc, used, total) {
    try {
      const text = await doc.l10n.formatValue("tabellify-reader-summary", { used, total });
      if (text) return text;
    }
    catch (err) {
      Zotero.logError(err);
    }
    return `${used} / ${total}`;
  },

  /**
   * The expanded body: "k of M codebook tags used on this paper", then the checklist: every
   * codebook tag, grouped by super-tag in codebook order (ungrouped tags first, without a
   * heading), each line "✓ Tag" (used) or "☐ Tag" (not yet). The mark is a Fluent message
   * (character + tooltip), the tag name is plain text; nothing here is parsed as markup.
   * @param {any} doc
   * @param {{ total: number, used: number,
   *   groups: Array<{ name: string, ungrouped?: boolean,
   *                   tags: Array<{ tag: string, used: boolean }> }> }} summary
   *   From TabellifyTagMonitor.paperChecklist
   * @returns {any[]}  Elements to put into the body
   */
  checklistNodes(doc, summary) {
    const { used, total } = summary;
    const nodes = [this.para(doc, "tabellify-reader-used", { used, total })];
    for (const group of summary.groups) {
      // The ungrouped tags (ADR-0016 §8, spec F006a Q11) come first WITHOUT a heading,
      // mirroring the blank super-header in the table.
      if (!group.ungrouped) {
        const heading = this.el(doc, "p");
        const name = this.el(doc, "strong");
        name.textContent = group.name; // library/codebook text: textContent only, never markup
        heading.append(name);
        nodes.push(heading);
      }
      const list = this.el(doc, "ul");
      for (const { tag, used: isUsed } of group.tags) {
        const li = this.el(doc, "li");
        const mark = this.l10nEl(doc, "span", isUsed ? "tabellify-reader-mark-used" : "tabellify-reader-mark-unused");
        const label = this.el(doc, "span");
        label.textContent = tag;
        // A text node is plain text by definition: the space between mark and name.
        li.append(mark, doc.createTextNode(" "), label);
        list.append(li);
      }
      nodes.push(list);
    }
    return nodes;
  },

  /**
   * A <p> whose text Fluent fills in. Setting `data-l10n-id` (and `data-l10n-args`, a JSON
   * object of numbers) is enough: the main window's Fluent translates elements as they are
   * added. tabellify.ftl is linked into each main window by Tabellify.onMainWindowLoad.
   * @param {any} doc
   * @param {string} l10nID
   * @param {Record<string, number>} [args]
   */
  para(doc, l10nID, args) {
    return this.l10nEl(doc, "p", l10nID, args);
  },

  /**
   * Any element whose text (and allowed attributes such as `title`) Fluent fills in.
   * @param {any} doc
   * @param {string} tag
   * @param {string} l10nID
   * @param {Record<string, number>} [args]  Numbers only, never library text
   */
  l10nEl(doc, tag, l10nID, args) {
    const el = this.el(doc, tag);
    el.setAttribute("data-l10n-id", l10nID);
    if (args) el.setAttribute("data-l10n-args", JSON.stringify(args));
    return el;
  },

  /** An HTML element in `doc` (the main window is a XUL document, so the namespace matters). */
  el(doc, tag) {
    return doc.createElementNS(this.HTML_NS, tag);
  },
};
