// A test harness small enough that nobody has to learn it.
//
// There is deliberately no framework here. The app has fifteen modules and had
// one test file between them; the thing standing between that and coverage was
// never the runner, so the runner stays four functions and a counter and the
// effort goes into the assertions.
//
// Importing this module installs the browser globals the app modules expect —
// `localStorage` and `indexedDB` — so a test file only has to import it before
// the module under test. ES modules evaluate their imports in order, so putting
// this import first is enough.

import "fake-indexeddb/auto";
import { EditorState } from "@codemirror/state";

// ---------------------------------------------------------------- globals

/**
 * A localStorage that behaves like the real one, including the part that
 * matters: throwing `QuotaExceededError` when it is full.
 *
 * The quota is settable per test because the bug this suite exists to prevent
 * is what happens *at* the quota, and waiting for a real 4.5 MB to fill up is
 * not a test, it is a delay.
 */
class MemoryStorage {
  #map = new Map();
  quota = Infinity;

  get length() {
    return this.#map.size;
  }
  key(i) {
    return [...this.#map.keys()][i] ?? null;
  }
  getItem(k) {
    return this.#map.has(String(k)) ? this.#map.get(String(k)) : null;
  }
  setItem(k, v) {
    const key = String(k);
    const value = String(v);
    let used = 0;
    for (const [ek, ev] of this.#map) if (ek !== key) used += ek.length + ev.length;
    if (used + key.length + value.length > this.quota) {
      const e = new Error("quota exceeded");
      e.name = "QuotaExceededError";
      throw e;
    }
    this.#map.set(key, value);
  }
  removeItem(k) {
    this.#map.delete(String(k));
  }
  clear() {
    this.#map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

/**
 * The smallest DOM that `drawPages` can be held to.
 *
 * Not a browser and not trying to be one: an element here is a node with a class,
 * an `innerHTML`, and children in order — which is exactly the surface the page
 * diff touches. What the test needs to see is *which nodes were written to*, and
 * a real DOM would hide that behind a parser. `writes` counts assignments, so a
 * test can assert that an unchanged page was left alone rather than rewritten
 * with the same string.
 */
class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.className = "";
    this.children = [];
    this.writes = 0;
    this._html = "";
    this.dataset = {};
    this.style = {};
  }
  replaceChildren(...nodes) {
    this.children = nodes;
    this._html = nodes.length ? "…" : "";
  }
  get innerHTML() {
    return this._html;
  }
  set innerHTML(v) {
    this._html = String(v);
    this.writes++;
    // Assigning markup replaces the children, as it does in a browser. The
    // fake parses only what `drawPages` emits: a flat run of `<div class="page">`.
    this.children = [...String(v).matchAll(/<div class="page">([\s\S]*?)<\/div>/g)].map((m) => {
      const child = new FakeElement("div");
      child.className = "page";
      child._html = m[1];
      return child;
    });
  }
  get lastElementChild() {
    return this.children[this.children.length - 1] ?? null;
  }
  /** Only `beforeend`, which is all the page diff uses. */
  insertAdjacentHTML(where, html) {
    if (where !== "beforeend") throw new Error(`unsupported: ${where}`);
    const child = new FakeElement("div");
    const m = String(html).match(/class="([^"]*)"/);
    if (m) child.className = m[1];
    child.parent = this;
    this.children.push(child);
  }
  remove() {
    const i = this.parent?.children.indexOf(this) ?? -1;
    if (i >= 0) this.parent.children.splice(i, 1);
  }
}

// Deliberately *not* installed as `globalThis.document`. A `document` existing at
// all is enough to convince `@codemirror/view` it is in a browser, and it then
// reads half a DOM off it at import time — which is why nothing under test may
// reach for the global one. `drawPages` builds its nodes through the host
// element instead, and this is the host.
globalThis.FakeElement = FakeElement;

/**
 * An `IntersectionObserver` the test drives by hand.
 *
 * The preview keeps only the pages near the viewport drawn, so "what is on
 * screen" is an *input* to the code under test. Faking the observer is what lets
 * a test say "now the reader scrolls to page 40" and check what the pane did —
 * which is the only way to catch the failure that matters here, a page that is
 * on screen and empty.
 */
class FakeIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.watching = new Set();
    FakeIntersectionObserver.live.push(this);
  }
  observe(node) {
    this.watching.add(node);
  }
  unobserve(node) {
    this.watching.delete(node);
  }
  disconnect() {
    this.watching.clear();
  }
  /** Report every watched node, intersecting when `isVisible(node)` says so. */
  report(isVisible) {
    this.callback([...this.watching].map((t) => ({ target: t, isIntersecting: !!isVisible(t) })));
  }
}
FakeIntersectionObserver.live = [];
globalThis.IntersectionObserver = FakeIntersectionObserver;

/**
 * Wipe both stores so tests cannot leak state into each other.
 *
 * The buckets are emptied rather than the database deleted. `deleteDatabase`
 * blocks for as long as any connection is open, and `store.ts` deliberately
 * keeps one — so deleting would either hang or leave the modules under test
 * holding a handle to a database that is on its way out.
 */
export async function resetStorage() {
  localStorage.clear();
  localStorage.quota = Infinity;
  // The schema comes from `store.ts`, not from a copy of it here. This used to
  // name version 2 and three stores; adding one to the module turned every
  // storage test red with a `VersionError` about the *harness*.
  const { SCHEMA } = await import("../.tmp-test/store.mjs");
  const db = await new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open("ksav-files", SCHEMA.version);
    // So a reset before the first import still produces the schema the modules
    // expect.
    req.onupgradeneeded = () => {
      for (const name of SCHEMA.stores) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction([...SCHEMA.stores], "readwrite");
    for (const name of SCHEMA.stores) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
  db.close();
}

// ---------------------------------------------------------------- the chrome

/**
 * The smallest `document` the status bar can be read off, installed for the
 * duration of one test file.
 *
 * Almost everything a writer does ends in a sentence in the status bar, and for
 * the whole family of bugs this repository is named for that sentence *is* the
 * bug — a note moved and nothing said so, a Word export that produced no file
 * and announced page images. So a test that cannot read the status bar cannot
 * assert the thing that was wrong.
 *
 * Installed and removed rather than left in place, for the reason at the top of
 * this file: a `document` on `globalThis` convinces `@codemirror/view` it is in
 * a browser, and the next test file is imported *after* this one has run.
 * `extra` is merged in for the few tests that need more of a DOM than this.
 */
export function installChrome(extra = {}) {
  const names = ["document", "window", "URL", "navigator", "ClipboardItem"];
  const saved = Object.fromEntries(
    names.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  const set = (k, v) =>
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });

  const nodes = {
    status: { textContent: "", className: "", title: "", removeAttribute() { this.title = ""; } },
    diagnostics: { textContent: "", title: "", className: "" },
  };

  set("document", {
    getElementById: (id) => nodes[id] ?? null,
    // `closeMenus` sweeps the header dropdowns on the way out of most actions.
    querySelectorAll: () => [],
    // Listeners are *recorded*, not discarded.
    //
    // They used to be dropped on the floor, which was fine while nothing built
    // a control and then used it. `panelviews.test.mjs` does: it is the first
    // test in this product that asserts what a panel contains, and half of what
    // a panel contains is buttons — a *Push* that asks for the wrong remote is
    // exactly the kind of fault that had no way of being caught, and it cannot
    // be caught by looking at the tree alone.
    //
    // `click()` fires them, so a test presses a control the way a writer does
    // rather than reaching for the handler it happens to know is there.
    createElement: (tag) => ({
      tagName: String(tag).toUpperCase(),
      className: "",
      children: [],
      listeners: {},
      // A form control has a value and a checkedness whether or not anybody set
      // one, and a stub without them reads `undefined` where a browser reads
      // `""` and `false`. `dom.ts`'s `checkField` writes the *attribute*
      // `checked="checked"` and every caller reads the *property* `.checked`,
      // which the browser keeps in step and this has to as well — otherwise a
      // test of a panel with a checkbox in it asserts against `undefined` and
      // learns nothing.
      value: "",
      checked: false,
      setAttribute(k, v) { this[k] = k === "checked" ? v !== null && v !== "false" : v; },
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      append(...c) { this.children.push(...c); },
      click() { for (const fn of this.listeners.click ?? []) fn({ target: this }); },
    }),
    body: { append() {} },
    ...extra.document,
  });
  set("window", { setTimeout: (fn) => fn, addEventListener() {}, removeEventListener() {}, ...extra.window });

  return {
    /** What the writer would read, right now. */
    status: () => nodes.status.textContent,
    /** And which colour it is in: "", "ok", "warn" or "err". */
    statusClass: () => nodes.status.className,
    clear: () => {
      nodes.status.textContent = "";
      nodes.status.className = "";
    },
    nodes,
    set,
    restore() {
      for (const k of names) {
        if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
        else delete globalThis[k];
      }
    },
  };
}

// ---------------------------------------------------------------- the editor

/**
 * An editor made of a *real* `EditorState` and nothing else.
 *
 * Eleven modules take an `EditorView`, read `view.state`, and write through
 * `view.dispatch` — the lints and their one-click repairs, the deferred-note
 * key, the nikud bar, the error and change gutters. Every one of them was
 * untestable until now, and the reason was never CodeMirror: it was that none of
 * them was on `run.mjs`'s module list, so there was nothing to import.
 *
 * The state is genuine, so a `changes` spec is applied by the same code that
 * applies it in the browser and a wrong offset produces a wrong document here
 * exactly as it would there. What is faked is only what a view adds on top of a
 * state — a screen. `@codemirror/view` is deliberately not imported: it reads a
 * DOM at module scope, which is the note at the top of this file.
 */
export function fakeView(doc, pos = 0, extensions = []) {
  let state = EditorState.create({ doc, selection: { anchor: Math.min(pos, doc.length) }, extensions });
  return {
    get state() {
      return state;
    },
    dispatch(spec) {
      state = state.update(spec).state;
    },
    /** What the writer would be looking at. */
    text() {
      return state.doc.toString();
    },
    caret() {
      return state.selection.main.head;
    },
    focus() {},
    scrollDOM: { scrollTop: 0 },
  };
}

// ---------------------------------------------------------------- assertions

let pass = 0;
let fail = 0;
const failures = [];

function record(name, ok, detail) {
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push(`FAIL ${name}${detail ? `\n  ${detail}` : ""}`);
    console.log(failures[failures.length - 1]);
  }
}

/** Deep equality by JSON shape — enough for the plain data these modules pass. */
export function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  record(name, g === w, `got  ${g}\n  want ${w}`);
}

export function ok(name, value) {
  record(name, !!value, `got ${JSON.stringify(value)}, wanted something truthy`);
}

export function notOk(name, value) {
  record(name, !value, `got ${JSON.stringify(value)}, wanted something falsy`);
}

/** Assert that an async call rejects, and optionally with a particular name. */
export async function rejects(name, fn, errorName) {
  try {
    await fn();
    record(name, false, "it resolved; an error was expected");
  } catch (e) {
    record(
      name,
      !errorName || e?.name === errorName || e?.constructor?.name === errorName,
      `threw ${e?.name ?? e}, wanted ${errorName}`,
    );
  }
}

/**
 * The tally, in the one place that formats it.
 *
 * The 9 August report listed this among the finished duplicates and said
 * `delete`: it was exported, uncalled, and `run.mjs` printed the same sentence
 * itself with a different separator. Deleting an uncalled function is the right
 * instinct in general and the wrong one here — there is exactly one line in this
 * suite that says *how many assertions ran*, `run.mjs` was writing it by hand,
 * and the fix that leaves the tree with fewer ways to be wrong is the caller,
 * not the removal.
 *
 * `also` is what a run has to add beyond the two numbers — a module that threw
 * is not a failed assertion and must not be counted as one.
 */
export function summary(label, also = "") {
  console.log(`${label} · ${pass} passed, ${fail} failed${also ? `, ${also}` : ""}`);
  return fail;
}

export function counts() {
  return { pass, fail };
}
