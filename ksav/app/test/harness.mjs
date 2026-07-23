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
