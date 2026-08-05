// Macros: record what you did, do it again.
//
// Word and LibreOffice both ship this, and both mean two different things by it —
// record-and-replay, and a scripting language. Ksav already has the second half
// in a different shape: `#let` definitions under "your commands" are procedures
// the compiler runs, and they are a better answer than Basic because they are
// the same language the document is written in. What was missing is the first
// half, which is the one people actually reach for: I just did this fiddly thing
// eleven times, do it eleven more.
//
// A macro here is a list of *actions*, not of keystrokes and not of positions.
// That distinction is the whole design:
//
//   - Keystrokes break when a binding changes. Actions do not.
//   - Positions break the moment the document is a character longer, which is
//     what a macro's second repetition guarantees. Actions are relative to the
//     caret by construction.
//
// So a recorded macro replays correctly from anywhere, which is the property
// that makes the feature worth having at all. It also means a macro composes
// with everything else in the registry — and, because a saved macro registers as
// an action itself, it can be bound to a key like anything else.

/** One recorded step. */
export type Step =
  | { kind: "action"; id: string }
  | { kind: "text"; text: string };

export interface Macro {
  id: string;
  name: string;
  steps: Step[];
}

/**
 * Fold a raw recording into something replayable.
 *
 * Typing produces one transaction per character, so a recording of "רש״י" is
 * four steps before this runs and one after. Beyond tidiness this matters for
 * correctness of *display*: a macro listing 40 steps for a word nobody can read
 * is one nobody will trust enough to bind to a key.
 */
export function compact(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (const step of steps) {
    const last = out[out.length - 1];
    if (step.kind === "text" && last && last.kind === "text") {
      out[out.length - 1] = { kind: "text", text: last.text + step.text };
    } else {
      out.push(step);
    }
  }
  // A trailing or leading empty text step is noise from the recorder starting
  // and stopping, not something the writer did.
  return out.filter((s) => s.kind !== "text" || s.text.length > 0);
}

/** A short human description, for the menu and the shortcut list. */
export function describe(macro: Macro, nameOf: (id: string) => string): string {
  return macro.steps
    .map((s) => (s.kind === "text" ? JSON.stringify(s.text) : nameOf(s.id)))
    .join(" → ");
}

/**
 * Drop steps that no longer mean anything.
 *
 * A macro is saved in localStorage and outlives the release it was recorded in.
 * If an operation is renamed or removed, the step referring to it is silently
 * dropped rather than throwing mid-replay and leaving the document half-edited:
 * a macro that does four of its five things is recoverable, and one that throws
 * on step three is a corrupted document plus a stack trace.
 */
export function validate(macro: Macro, known: (id: string) => boolean): Macro {
  return { ...macro, steps: macro.steps.filter((s) => s.kind === "text" || known(s.id)) };
}

/** Is this macro worth saving? */
export function isEmpty(macro: Macro): boolean {
  return macro.steps.length === 0;
}

/**
 * A fresh id.
 *
 * Time-based rather than a counter, so two macros recorded in two tabs of the
 * same document library do not collide on `macro-3`.
 */
export function newId(now = Date.now(), rand = Math.random()): string {
  return `m${now.toString(36)}${Math.floor(rand * 1296).toString(36).padStart(2, "0")}`;
}

/** The action id a saved macro answers to, so it can be bound like anything else. */
export function actionIdOf(macro: Macro): string {
  return `macro.${macro.id}`;
}

/** The macro an action id refers to, if it is a macro at all. */
export function macroIdOf(actionId: string): string | null {
  return actionId.startsWith("macro.") ? actionId.slice("macro.".length) : null;
}

/**
 * Read a macro list back from storage, defensively.
 *
 * Anything malformed is dropped rather than crashing the chrome at boot: these
 * are preferences, and a preference that cannot be parsed is worth less than the
 * application starting.
 */
export function parseAll(raw: unknown): Macro[] {
  if (!Array.isArray(raw)) return [];
  const out: Macro[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const { id, name, steps } = m as Partial<Macro>;
    if (typeof id !== "string" || !id) continue;
    if (!Array.isArray(steps)) continue;
    const clean: Step[] = [];
    for (const s of steps) {
      if (!s || typeof s !== "object") continue;
      if (s.kind === "text" && typeof s.text === "string") clean.push({ kind: "text", text: s.text });
      else if (s.kind === "action" && typeof s.id === "string") clean.push({ kind: "action", id: s.id });
    }
    out.push({ id, name: typeof name === "string" && name ? name : id, steps: clean });
  }
  return out;
}
