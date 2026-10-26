// ------------------------------------------------------------ the scan memo
//
// One shared scan, asked for by lints, preview and export warnings.
//
// The memo used to live beside the contract it serves (`api.ts`); it is its own
// file because it is its own concern: a bounded async cache keyed on the
// backend, with the interesting half being that the shared request belongs to
// the memo and never to its first consumer — a cancelled preview must not abort
// the lints awaiting the same facts.
//
// This file refuses to answer for: the `Backend` contract (api.ts) or what any
// transport does (transports.ts).

import { assertScanText, scan as scanLocal, type Scan } from "./spans";
import type { Backend } from "./api";

/** Shared bounded async scan memo for lints, preview and export warnings. */
const SERVICE_SCAN_CACHE = new WeakMap<object, { text: string; pending: Promise<Scan>; }[]>();
export function scanForBackend(backend: Backend | undefined, text: string, signal?: AbortSignal): Promise<Scan> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  if (!backend || typeof backend.scan !== "function") return Promise.resolve(scanLocal(text));
  let entries = SERVICE_SCAN_CACHE.get(backend);
  if (!entries) { entries = []; SERVICE_SCAN_CACHE.set(backend, entries); }
  const at = entries.findIndex((e) => e.text === text);
  let entry = at < 0 ? undefined : entries.splice(at, 1)[0];
  if (!entry) {
    // The shared request belongs to the memo, never to its first consumer.
    // A cancelled preview must not abort the lints awaiting the same facts.
    const pending = Promise.resolve().then(() => backend.scan(text))
      .then((result) => assertScanText(text, result.scan))
      .catch(() => scanLocal(text));
    entry = { text, pending };
  }
  entries.push(entry);
  if (entries.length > 4) entries.shift();
  if (!signal) return entry.pending;
  const pending = entry.pending;
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}
