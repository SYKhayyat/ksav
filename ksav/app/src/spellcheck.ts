// The spell-check user interface: the scheduler, the incremental bookkeeping,
// the squiggle menu, and the sentences in the settings panel that state what
// the checker is actually doing.
//
// Owns: the debounce timer and the dirty-range/generation bookkeeping that
// decide what a check covers; the suggestion menu a squiggle right-click
// opens; the note menu's dismissal; the three panel notes
// (`editingModeNote`, `snapshotNote`, `spellCoverageNote`), which report
// state rather than assert it.
//
// Defers to `spell.ts` for the engine side — the wasm checking, the word
// list and the `misspellings` field this module only dispatches effects
// into — and to `runtime.ts` for the editor view and the backend,
// `keyhint.ts` for the chord a note names, `panels.ts` for mounting and
// closing a menu.
//
// Refuses to answer for `autoExtension` and the completion machinery: the
// name shared this region's banner in main.ts by accident of file order, but
// autocomplete is not spell-check, and its source,
// `ksavCompletions`, lives in the extension assembly in main.ts. Moving it
// here would make this module answer for a feature it does not own.
import * as keymodes from "./keymodes";
import * as runtime from "./runtime";
import * as spell from "./spell";
import { el } from "./dom";
import { getLang, t, tf } from "./i18n";
import { closePanel, mountPanel } from "./panels";
import { settings } from "./settings";
import { docTextOf } from "./spans";
import { hintFor } from "./keyhint";

// ---------------------------------------------------------------- spell check
//
// The engine holds the lexicons and does the checking (see engine/src/spell/);
// this schedules the checks and turns a click on a squiggle into something
// useful. Checking is debounced separately from compiling, and longer: a
// misspelling that appears half a second late costs nothing, whereas checking on
// every keystroke would squiggle words the writer is still in the middle of.

let spellTimer: number | undefined;
/** Set when the last check could not reach the engine, so the coverage note can
 *  say so instead of continuing to read as a clean bill of health — the exact
 *  silence this feature was built to avoid. */
let spellFailed = false;

export function scheduleSpellCheck() {
  clearTimeout(spellTimer);
  if (!settings.spellcheck) return;
  spellTimer = window.setTimeout(runSpellCheck, 700);
}

// Incremental spell-check bookkeeping.
//
// A full-document check re-tokenises and re-looks-up the whole sefer on every
// pause in typing, and ships ~420 KB of offset-preserving text to the one engine
// worker to do it — behind the compile, on a shorter timer. But a pause almost
// always follows a change in *one* paragraph. So the typing path checks only the
// changed region (widened to paragraph boundaries) and splices the answer into
// the field, while explicit triggers with no document change — a spellcheck
// toggle, learning a word — leave the dirty range empty and fall through to a
// full check, which is exactly what those need.
let spellDirtyFrom = Infinity;
let spellDirtyTo = -1;
// Set by the two changes that make *every* paragraph's answer potentially
// different without touching the document: the comment setting and the word list.
let spellFullPending = false;
// A generation ticket, the same shape `runCompile` uses. A stale response must
// not overwrite the field — its offsets describe text that no longer exists, and
// `setMisspellings` replaces wholesale, discarding the positions the field
// mapped through the intervening edits. Squiggles landing on the wrong words.
let spellGeneration = 0;

/** Widen the changed region back and forward to the nearest blank line. */
export function paragraphAround(text: string, from: number, to: number): { from: number; to: number } {
  const prevBlank = text.lastIndexOf("\n\n", Math.max(0, from - 1));
  const nextBlank = text.indexOf("\n\n", to);
  return { from: prevBlank < 0 ? 0 : prevBlank + 2, to: nextBlank < 0 ? text.length : nextBlank };
}

/** Grow the dirty region by the ranges this update touched, in current coords. */
export function markSpellDirty(changes: import("@codemirror/state").ChangeDesc): void {
  // Map the accumulated region forward — but only when it is addressable by this
  // changeset. A document switch (or any wholesale replace) leaves a region from
  // the *previous* document behind, and `mapPos` on a position past the incoming
  // changeset's start length throws. When that happens the old region is
  // meaningless anyway, so drop it and re-seed from this transaction's ranges.
  const startLen = changes.length;
  if (spellDirtyTo >= 0 && spellDirtyFrom <= startLen && spellDirtyTo <= startLen) {
    spellDirtyFrom = changes.mapPos(spellDirtyFrom, -1);
    spellDirtyTo = changes.mapPos(spellDirtyTo, 1);
  } else {
    spellDirtyFrom = Infinity;
    spellDirtyTo = -1;
  }
  changes.iterChangedRanges((_fa, _ta, fromB, toB) => {
    spellDirtyFrom = Math.min(spellDirtyFrom, fromB);
    spellDirtyTo = Math.max(spellDirtyTo, toB);
  });
}

/** Ask for a full re-check on the next beat — a word list or comment-mode change. */
export function forceFullSpellCheck(): void {
  spellFullPending = true;
  scheduleSpellCheck();
}

export async function runSpellCheck() {
  if (!runtime.backend || !settings.spellcheck || !runtime.view) return;
  const doc = runtime.view.state.doc;
  const realText = docTextOf(doc);
  // Full when something changed the answer everywhere (or nothing has told us
  // where the change was); otherwise the one paragraph that moved.
  const full = spellFullPending || spellDirtyTo < 0 || spellDirtyFrom > spellDirtyTo;
  const region = full
    ? { from: 0, to: realText.length }
    : paragraphAround(
        realText,
        Math.max(0, Math.min(spellDirtyFrom, realText.length)),
        Math.max(0, Math.min(spellDirtyTo, realText.length)),
      );
  // Only the text that will actually print: command names are not misspellings,
  // and underlining them would make the feature useless on its first document.
  //
  // The region **first**, and only then the text for it. This used to build the
  // whole document's checkable text and slice a paragraph out of it, which is
  // the one part of the incremental check that never became incremental —
  // `AUDIT-perf-and-blocking.md` §A6 fixed the transfer and the engine's work
  // and left the client's. See `checkableText`'s `window` parameter.
  const payload = spell.checkableText(
    realText,
    { comments: !!settings.spellcheckComments },
    region,
  );
  const mine = ++spellGeneration;
  try {
    const res = await runtime.backend.spell(payload, spell.userWordsText(), false);
    // Superseded, or the document moved under the request: its offsets are now
    // fiction, so drop it and let the next scheduled check answer the real text.
    if (mine !== spellGeneration || runtime.view.state.doc !== doc) return;
    spellFailed = false;
    spell.noteLexiconSizes(res.lexicon_sizes);
    // The panel is built before the first check answers, so the note starts as
    // the general statement and becomes the measured one here. Updating the node
    // rather than rebuilding the chrome, because this runs on every pause in
    // typing.
    const note = document.getElementById("spell-coverage");
    if (note) note.textContent = spellCoverageNote();
    const fresh = res.misspellings.map((m) => ({ ...m, start: m.start + region.from }));
    const next = full
      ? fresh
      : [
          // Keep every existing mark that lies wholly outside the re-checked
          // paragraph; replace the ones inside it with the fresh answer.
          ...(runtime.view.state.field(spell.misspellings, false) ?? []).filter(
            (m) => m.start + m.len <= region.from || m.start >= region.to,
          ),
          ...fresh,
        ];
    runtime.view.dispatch({ effects: spell.setMisspellings.of(next) });
    // Checked cleanly: this region (or the whole document) is no longer dirty.
    spellFullPending = false;
    spellDirtyFrom = Infinity;
    spellDirtyTo = -1;
  } catch (e) {
    // A single dropped check is not worth a modal, but it must not read as a
    // clean page either: the toggle still says "on" and the panel still names
    // two lexicons, so a silence here is exactly the false all-clear this feature
    // exists to refuse. Mark it, and let the coverage note tell the truth.
    spellFailed = true;
    const note = document.getElementById("spell-coverage");
    if (note) note.textContent = spellCoverageNote();
    console.warn("spell check failed:", e);
  }
}

/**
 * What the editing mode is actually doing, said out loud.
 *
 * This was `t("editingModeNote")` — a static string reading *"Real Vim and
 * Emacs. While one is on it gets the keys before Ksav's own shortcuts"* —
 * printed regardless of whether anything had loaded. For the whole life of the
 * feature it was false: the mode was never applied at all, because
 * `loadSettings` was throwing and `settings.editingMode` was `"default"` by the
 * time boot looked at it. A sentence asserting that a thing works is not a
 * substitute for the thing working, and it is actively worse than silence when
 * the writer is trying to work out why their keys do nothing.
 *
 * So it reports. `keymodes.loadError()` has existed since the modes were
 * written, with a comment promising "a note saying why the mode did not
 * arrive", and **had no caller anywhere in the application** — its only
 * reference was a test asserting it was null. This is the caller.
 */
export function editingModeNote(): string {
  const mode = settings.editingMode ?? "default";
  if (mode === "default") return t("editingModeNoteOff");
  const failed = keymodes.loadError();
  if (failed) return tf("editingModeFailed", failed);
  return t("editingModeNote");
}

/**
 * Which of the two the history is on, and how to take one by hand.
 *
 * A checkbox reading "automatic snapshots" answers half the question and leaves
 * the important half — *then what?* — to be worked out. Off, the writer needs to
 * know there is a key; on, they need to know the number underneath is minutes
 * and that the key still works. Both sentences name the binding in force rather
 * than the shipped one, so a rebound `Mod-Alt-s` reads as whatever the writer
 * made it.
 */
export function snapshotNote(): string {
  // Unbound is a state a writer can put this in from the Shortcuts list below,
  // and "press  to keep a point" is the sort of sentence that gets shipped. The
  // fallback names the button, which is always there.
  const key = hintFor("snapshot") || t("snapshotNow");
  return settings.autoSnapshot === false
    ? tf("autoSnapshotOffNote", key)
    : tf("autoSnapshotOnNote", key);
}

/**
 * What the checker is actually checking, said out loud.
 *
 * This is the other half of adding English. The toggle used to read as on over a
 * page it had never looked at, and a silence that reads as a clean bill of
 * health is worse than a missing feature. So the panel names the languages —
 * and names them from what the *engine reported*, not from what this file
 * believes, because those came apart once before: a checked-in wasm module that
 * predated spell-check shipped with no checker in it and nothing said so.
 */
export function spellCoverageNote(): string {
  if (spellFailed) return t("spellFailed"); // the check could not reach the engine
  const s = spell.lexiconSizes();
  if (!s) return t("spellLanguages"); // before the first check, what the engine ships with
  const n = (v: number) => v.toLocaleString(getLang() === "he" ? "he-IL" : "en-US");
  if (s.he > 0 && s.en > 0) return tf("spellLanguagesCount", n(s.he), n(s.en));
  if (s.he > 0) return tf("spellLanguagesPartial", t("langHebrew"));
  if (s.en > 0) return tf("spellLanguagesPartial", t("langEnglish"));
  return t("spellLanguagesNone");
}

export function clearSpellCheck() {
  if (runtime.view) runtime.view.dispatch({ effects: spell.setMisspellings.of([]) });
}

/** The suggestion menu for the squiggle at `pos`, anchored at the pointer. */
export async function openSpellMenu(m: spell.Misspelling, x: number, y: number) {
  const box = el("div", { class: "spell-menu", style: `left:${x}px; top:${y}px` }, [
    el("div", { class: "spell-word" }, [m.word]),
    el("div", { class: "spell-loading" }, ["…"]),
  ]);
  mountPanel("spell-menu", box, document.body);

  let suggestions: string[] = [];
  try {
    suggestions = await runtime.backend!.suggest(m.word, spell.userWordsText());
  } catch {
    suggestions = [];
  }
  if (!box.isConnected) return; // dismissed while we were asking

  const replace = (word: string) => {
    // Only if the span still says what `m` said it said.
    //
    // `m` was measured before `suggest` was awaited, and `box.isConnected` above
    // asks whether the *menu* is still on screen — not whether the document
    // still reads that way. This menu is not modal: the document keeps taking
    // edits from a mirrored pane, from `takeArrivals`, from a background
    // `linkify`. Accepting a suggestion after any of those replaced whatever had
    // moved into those offsets, which on a fast writer's document is somebody
    // else's word.
    //
    // The paste handler in `makeState` already does exactly this check for
    // exactly this reason; it is the same guard, and it reaches the keyboard
    // route (`spellSuggest`) too, which is the route a fast writer uses.
    const doc = docTextOf(runtime.view.state.doc);
    if (doc.slice(m.start, m.start + m.len) !== m.word) {
      closeSpellMenu();
      runtime.view.focus();
      // Re-check, because the document under the squiggle has changed and the
      // mark that was there is describing text that has gone.
      scheduleSpellCheck();
      return;
    }
    runtime.view.dispatch({
      changes: { from: m.start, to: m.start + m.len, insert: word },
      selection: { anchor: m.start + word.length },
    });
    closeSpellMenu();
    runtime.view.focus();
    scheduleSpellCheck();
  };

  box.replaceChildren(
    el("div", { class: "spell-word" }, [m.word]),
    ...(suggestions.length
      ? suggestions.map((w) => el("button", { class: "spell-item", onClick: () => replace(w) }, [w]))
      : [el("div", { class: "spell-none" }, [t("noSuggestions")])]),
    el("div", { class: "menu-sep" }),
    // Teaching it a word has to be one click: no lexicon holds every chaburah's
    // terminology or every rebbe's name, and a checker that cannot be taught is
    // one people switch off.
    el("button", { class: "spell-item spell-add", onClick: () => {
      spell.addUserWord(m.word);
      closeSpellMenu();
      // A learned word can appear anywhere, so re-check the whole document, not
      // just the paragraph the squiggle was in.
      spellFullPending = true;
      runSpellCheck();
      runtime.view.focus();
    } }, ["＋ " + t("addToDictionary")]),
  );
}

export function closeSpellMenu() {
  closePanel("spell-menu");
}

/**
 * Dismiss the note menu.
 *
 * Its own — it used to borrow `closeSpellMenu`, which worked only because the
 * spell menu's selector caught it through the `.spell-menu` class it wears for
 * its styling. Now that each has a registry row, each closes itself.
 */
export function closeNoteMenu() {
  closePanel("note-menu");
}

/**
 * Forget the dirty region and ask for a full check on the next beat.
 *
 * The incoming document is a different text: its dirty region has no meaning
 * here, and its first check must cover all of it. Also the answer a removed
 * word owes — a dropped word can be anywhere, so a paragraph-scoped check
 * would leave it squiggled.
 *
 * Exactly what main.ts's document swap did inline before this module owned
 * the state; the call site reads better than the three assignments it
 * replaced, and the semantics are the same three assignments.
 */
export function spellCheckFromScratch() {
  spellDirtyFrom = Infinity;
  spellDirtyTo = -1;
  spellFullPending = true;
}

/** A full check right now — a word learned or removed, a dictionary imported. */
export function runFullSpellCheck() {
  spellFullPending = true;
  runSpellCheck();
}
