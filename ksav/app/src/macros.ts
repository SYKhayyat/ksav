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

/**
 * One recorded step.
 *
 * Three kinds and not two, because there are three ways a writer changes a
 * document and the recorder used to see one of them. `action` is a named
 * operation from the registry — a heading, a table row, a review mark. `text` is
 * typing. `snippet` is a command arriving from the toolbar, the Insert menu or
 * the palette, which is neither: it has no action id, and recording it as text
 * would replay `#הדגשה[|]` including the caret marker as literal characters.
 */
export type Step =
  | { kind: "action"; id: string }
  | { kind: "text"; text: string }
  | { kind: "snippet"; snippet: string };

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
    .map((s) =>
      s.kind === "text"
        ? JSON.stringify(s.text)
        : s.kind === "snippet"
          ? commandIn(s.snippet)
          : nameOf(s.id),
    )
    .join(" → ");
}

/**
 * The command a snippet inserts, for the description — `#הדגשה[|]` reads as
 * `#הדגשה`. The rest of a snippet is scaffolding the writer did not type and
 * would not recognise in a list of steps.
 */
function commandIn(snippet: string): string {
  const m = /^#?([A-Za-z0-9֐-׿_]+)/u.exec(snippet.trim());
  return m ? "#" + m[1] : JSON.stringify(snippet.slice(0, 12));
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
  // A snippet carries its own text and refers to nothing that can be renamed
  // away, so it never goes stale the way an action id can. If the *command* it
  // names stops existing the compiler will say so, in the document, which is
  // where that belongs.
  return {
    ...macro,
    steps: macro.steps.filter((s) => s.kind !== "action" || known(s.id)),
  };
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
      else if (s.kind === "snippet" && typeof s.snippet === "string")
        clean.push({ kind: "snippet", snippet: s.snippet });
    }
    out.push({ id, name: typeof name === "string" && name ? name : id, steps: clean });
  }
  return out;
}

// # The recorder
//
// The state half the engine above existed for: what is being recorded, the
// saved list (read defensively and cached), the names, and the replay. The
// engine stays pure; everything here touches settings, the view or the shell,
// and what it may not touch — the modal, the shortcut re-configuration —
// arrives as the registered wiring rather than as an import of main.
import { makeWiring } from "./wiring";
//
// Owns: `recording`/`replaying`/`macroCache`, the note hooks (`noteAction`,
// `noteTyped`, `noteSnippet` — the recorder's three ears), `toggleRecording`,
// `finishRecording`, `playMacro`, `deleteMacro` and `macroName` (the one
// resolver for all three name sources).
// Defers: what runs (`runAction` is the shell's action door and stays
// main-held; replay reaches it through the wiring), what names a modal
// (askText), what rebinds (reconfigureShortcuts), and the settings file
// itself is `settings.ts`'s. Refuses: a second cache of the saved list —
// `macroCache` is the one, keyed on the setting by identity.

import { settings, saveSettings } from "./settings";
import { t, tf } from "./i18n";
import { setStatus, rerenderChrome, view } from "./runtime";
import { insertSnippet } from "./insert";
import { scheduleCompile } from "./compile";
import { actionName } from "./actions";

export interface MacrosWiring {
  /** Any action by id — built-in, structural, or a previously saved macro. */
  actionById(id: string): { id: string; run: (v: unknown) => boolean } | undefined;
  /** The shell's namable-prompt modal. */
  askText(message: string, initial?: string): Promise<string | null>;
  /** Rebuild the shortcut registry after the saved list changes. */
  reconfigureShortcuts(): void;
}

const W = makeWiring<MacrosWiring>("wireMacros");
export const wireMacros = W.wire;
export const macroWiring = W.get;

let recording: Step[] | null = null;

/**
 * The saved macros, read defensively — a bad preference must not stop the app.
 *
 * **Cached on the raw value.** `parseAll` re-validates every step of every macro
 * and allocates a fresh object per step, and this is called from `actions()`,
 * which the palette calls **per keystroke** while somebody is typing a command
 * name. A writer with thirty macros of a dozen steps each was paying tens of
 * thousands of allocations per keypress to produce a list that had not changed
 * since the session started.
 *
 * Keyed on `settings.macros` by identity rather than by a dirty flag: the only
 * thing that replaces it is `settings.macros = …`, which every writer here does
 * (`macroSave`, `macroDelete`), so a stale cache is not reachable without
 * mutating the array in place — which nothing does and which the assignment
 * makes awkward.
 */
let macroCache: { raw: unknown; parsed: Macro[] } | null = null;
export function savedMacros(): Macro[] {
  const held = macroCache;
  if (held && held.raw === settings.macros) return held.parsed;
  const parsed = parseAll(settings.macros);
  macroCache = { raw: settings.macros, parsed };
  return parsed;
}

/** The saved macros as an action-id → name map, what `actions.actionName` reads. */
export function savedNameMap(): Map<string, string> {
  return new Map(savedMacros().map((m) => [actionIdOf(m), m.name]));
}


/**
 * Set while a macro is replaying, so its steps are not recorded again.
 *
 * A macro can play another macro — `macroPlay` is an action like any other — and
 * recording a replay would turn one step into all of the inner macro's, which
 * then diverge the moment the inner one is edited. The outer action is the step.
 */
let replaying = false;

/** The chipbar reads this; the update listener gates its typed-text loop on it. */
export function isRecording(): boolean {
  return recording !== null;
}

/** The recording itself, or null — a read the chrome's menus hold a step name of. */
export function currentRecording(): Step[] | null {
  return recording;
}

/** Note an action for the recorder. Called by `runAction`, and by nothing else. */
export function noteAction(id: string) {
  if (recording && !replaying) recording.push({ kind: "action", id });
}

/** Note typed text for the recorder. */
export function noteTyped(text: string) {
  if (recording && !replaying && text) recording.push({ kind: "text", text });
}

/** Note a command inserted with no action behind it — the toolbar, the palette. */
export function noteSnippet(snippet: string) {
  if (recording && !replaying && snippet) recording.push({ kind: "snippet", snippet });
}

export function toggleRecording() {
  if (recording) {
    finishRecording();
    return;
  }
  recording = [];
  setStatus(t("macroRecording"), "");
  rerenderChrome();
}

async function finishRecording() {
  const steps = compact(recording ?? []);
  recording = null;
  const macro: Macro = { id: newId(), name: "", steps };
  if (isEmpty(macro)) {
    setStatus(t("macroEmpty"), "");
    rerenderChrome();
    return;
  }
  const suggested = describe(macro, (id) => actionName(id, savedNameMap())).slice(0, 40);
  const name = await macroWiring().askText(t("macroNamePrompt"), suggested);
  if (name === null) {
    setStatus(t("macroDiscarded"), "");
    rerenderChrome();
    return;
  }
  macro.name = name.trim() || suggested;
  settings.macros = [...savedMacros(), macro];
  saveSettings();
  // A saved macro is an action like any other from this point on: it appears in
  // the shortcut list and can be bound to a key without another line of code.
  macroWiring().reconfigureShortcuts();
  rerenderChrome();
  setStatus(tf("macroSaved", macro.name), "ok");
}

/** Run a macro's steps, in order, from wherever the caret is. */
export function playMacro(macro: Macro, times = 1) {
  const valid = validate(macro, (id) => macroWiring().actionById(id) !== undefined);
  if (valid.steps.length < macro.steps.length) {
    // Said out loud rather than silently: a macro doing four of its five things
    // is a macro whose next result will surprise somebody.
    setStatus(tf("macroStepsDropped", macro.name), "");
  }
  const wasReplaying = replaying;
  replaying = true;
  try {
  for (let i = 0; i < times; i++) {
    for (const step of valid.steps) {
      if (step.kind === "text") {
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: step.text },
          selection: { anchor: sel.from + step.text.length },
        });
      } else if (step.kind === "snippet") {
        insertSnippet(step.snippet);
      } else {
        // `run` rather than the wiring's runner: replaying a macro must not
        // record its own steps if the writer is recording a macro that plays
        // another one. The outer `macroPlay` is the step, and it is already noted.
        macroWiring().actionById(step.id)?.run(view);
      }
    }
  }
  } finally {
    replaying = wasReplaying;
  }
  scheduleCompile();
  view.focus();
}

export function deleteMacro(id: string) {
  settings.macros = savedMacros().filter((m) => m.id !== id);
  saveSettings();
  macroWiring().reconfigureShortcuts();
  rerenderChrome();
}
