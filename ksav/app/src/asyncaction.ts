// The one way this app starts an async action it will not wait for.
//
// # The problem this exists for
//
// Ninety-three `void someAsyncCall()` sites, 59 distinct callees, and at the time
// of writing **30 of those callees had no `try`, no `catch` and no `.catch` in
// their bodies at all** — measured, not estimated. A `void p()` on a promise that
// rejects is an unhandled rejection: the browser logs it, the writer sees nothing,
// and whatever the handler was in the middle of changing stays changed. A
// half-entered document, a toolbar that believes a save is done, a status line
// reading "saving…" for ever.
//
// The dangerous part is not that these are wrong. `watch.ts` is the model of the
// right thing — `try`, a `catch` that says in a comment why a stat that throws is
// not a conflict, and `busy = false` in a `finally`. The dangerous part is that
// there was no *rule*, so which call sites are safe depended on whoever wrote
// them that day.
//
// # What the rule is
//
// A user-triggered action is one of three things, and the difference matters
// because they fail differently:
//
// - **awaited** — the handler returns the promise and the caller waits. The
//   ordinary case; nothing to do here.
// - **deliberately not awaited** — the action continues in the background and the
//   writer is not blocked. `voidAction` says so, and reports a failure.
// - **cancellable** — the action was superseded or abandoned. **Not a failure**,
//   and saying so is most of the value here: a cancelled linkification run or an
//   abandoned compile is the app working, and reporting it would teach writers to
//   ignore the status line.
//
// So one function, and the distinction it draws is cancellation from failure. A
// failure goes through `troubleSaid`, which is this repository's existing answer
// for a caught error — the sentence is the reader's and the machine's string goes
// behind the details affordance — so nothing new is invented here and nothing
// existing is bypassed.
//
// # The fence
//
// `test/asyncaction.test.mjs` reads every `void f(` in `src/` and requires it to
// be inside the inventory that test file carries, with a reason. A new bare
// `void` fails the build until somebody writes down which of the three it is.
// That is the whole point: the list is meant to be short, and a new entry has to
// argue for itself.

import { troubleSaid, type Doing } from "./diagnostics";
import { setStatus } from "./runtime";

/**
 * The marker an action throws to say *I was superseded*, as opposed to *I broke*.
 *
 * An object rather than a string, so nothing that merely happens to say
 * "cancelled" is mistaken for one.
 */
export const CANCELLED = { ksavCancelled: true } as const;

/** The error an action throws when a newer one has replaced it. */
export function cancelled(): Error {
  return Object.assign(new Error("cancelled"), { ksavCancelled: true });
}

/**
 * Whether this is a cancellation rather than a failure.
 *
 * Two shapes, because two layers raise them. `AbortController` raises a
 * `DOMException` named `AbortError` and `fetch` raises the same for an aborted
 * body; a name comparison rather than a constructor check, because a
 * `DOMException` crossing a worker boundary arrives as a plain object with the
 * same `name` and `instanceof DOMException` is false. And an action superseded by
 * a newer one throws [`cancelled`].
 *
 * **This started too wide.** The first version also matched a message merely
 * *containing* "cancelled", which is exactly how a real failure gets swallowed:
 * `Error("cancelled the subscription")` is a broken subscription, and reporting
 * nothing for it is the defect this file exists to remove. A test case for that
 * is in `test/asyncaction.test.mjs` and the message heuristic is gone.
 */
export function isCancellation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if ((e as { ksavCancelled?: unknown }).ksavCancelled === true) return true;
  const name = (e as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

/**
 * Run an action, and say so if it fails.
 *
 * Returns the promise rather than discarding it, so a caller that *does* want to
 * wait — a test, or a handler chaining two actions — can. The point is not to stop
 * awaiting; the point is that the promise never rejects silently.
 */
export function action(doing: Doing, body: () => Promise<unknown>): Promise<void> {
  return body().then(
    () => undefined,
    (e: unknown) => {
      // A cancelled action is the app doing what it was asked. Saying so would be
      // noise, and noise in a status line is how writers learn to stop reading it.
      if (isCancellation(e)) return;
      const bad = troubleSaid(e, doing);
      setStatus(bad.said, "err", bad.detail);
    },
  );
}

/**
 * The approved fire-and-forget form: start it, do not wait, report a failure.
 *
 * `void action(...)` on the outside, so a reader can see at the call site that
 * this is deliberate rather than forgotten — which is the entire difference
 * between this and the 93 sites it replaces.
 */
export function voidAction(doing: Doing, body: () => Promise<unknown>): void {
  void action(doing, body);
}
