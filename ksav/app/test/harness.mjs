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
  const db = await new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open("ksav-files", 2);
    // Mirrors store.ts, so a reset before the first import still produces the
    // schema the modules expect.
    req.onupgradeneeded = () => {
      for (const name of ["docs", "history", "handles"]) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["docs", "history", "handles"], "readwrite");
    for (const name of ["docs", "history", "handles"]) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
  db.close();
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

export function summary(label) {
  console.log(`${label}: ${pass} passed, ${fail} failed`);
  return fail;
}

export function counts() {
  return { pass, fail };
}
