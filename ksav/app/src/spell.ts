// Spell-check in the editor: squiggles, suggestions, and teaching it a word.
//
// The checker itself lives in the engine (see engine/src/spell.rs and the
// reasoning there about why Ksav owns its Hebrew lexicon). This is the editor
// half: it decides *what* to check, when, and what happens when you click a
// squiggle.
//
// Two things matter more here than they might elsewhere:
//
//   * **Never check markup.** `#הערה` is not a misspelling. Ksav documents are
//     full of command names, and underlining them would make the feature useless
//     immediately. Only the text that will actually print gets checked.
//   * **Teaching it a word must be one click.** No lexicon can hold every
//     chaburah's terminology, every rebbe's name, or a writer's own coinages. A
//     checker that cannot be taught is one people switch off.

import { EditorView, Decoration, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import { scanCommands } from "./ksav-lang";

export interface Misspelling {
  start: number;
  len: number;
  word: string;
  suggestions?: string[];
}

/** Replace the current set of squiggles. */
export const setMisspellings = StateEffect.define<Misspelling[]>();

const squiggle = Decoration.mark({ class: "cm-spell-error" });

export const misspellings = StateField.define<Misspelling[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setMisspellings)) return e.value;
    // Shift existing marks through edits rather than dropping them, so the
    // squiggles do not flicker away on every keystroke while the next check is
    // still in flight.
    if (tr.docChanged) {
      return value
        .map((m) => {
          const start = tr.changes.mapPos(m.start, 1);
          const end = tr.changes.mapPos(m.start + m.len, -1);
          return end > start ? { ...m, start, len: end - start } : null;
        })
        .filter((m): m is Misspelling => m !== null);
    }
    return value;
  },
});

export const spellDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.state.field(misspellings) !== u.startState.field(misspellings)) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function build(view: EditorView): DecorationSet {
  const list = view.state.field(misspellings, false) ?? [];
  const len = view.state.doc.length;
  const ranges = list
    .filter((m) => m.start >= 0 && m.start + m.len <= len && m.len > 0)
    .sort((a, b) => a.start - b.start)
    .map((m) => squiggle.range(m.start, m.start + m.len));
  return Decoration.set(ranges, true);
}

/**
 * The regions of the document that are prose, not markup.
 *
 * A Ksav document is `#command[…]` all the way down, and command names are not
 * Hebrew words the checker should have an opinion about. This returns the spans
 * that will actually print — command *contents*, and the plain text between
 * commands — with comments excluded, since those never print either.
 */
export function proseRegions(text: string): { from: number; to: number }[] {
  const skip: { from: number; to: number }[] = [];

  // Command heads: `#name` and any `(arguments)`. The `[body]` is prose and is
  // deliberately not skipped.
  for (const s of scanCommands(text)) {
    const headEnd = s.argClose != null ? s.argClose + 1 : s.nameEnd;
    skip.push({ from: s.cmdStart, to: headEnd });
  }
  // Comments never reach the page.
  for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
    skip.push({ from: m.index!, to: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/(^|[^:])(\/\/[^\n]*)/g)) {
    const start = m.index! + m[1].length;
    skip.push({ from: start, to: start + m[2].length });
  }

  skip.sort((a, b) => a.from - b.from);
  const out: { from: number; to: number }[] = [];
  let at = 0;
  for (const s of skip) {
    if (s.from > at) out.push({ from: at, to: s.from });
    at = Math.max(at, s.to);
  }
  if (at < text.length) out.push({ from: at, to: text.length });
  return out;
}

/**
 * The document's prose with the markup blanked out.
 *
 * Blanked rather than removed: every character keeps its original offset, so a
 * misspelling's position in this string is its position in the real document and
 * no index mapping is needed. Getting that wrong underlines the wrong words.
 */
export function checkableText(text: string): string {
  const keep = proseRegions(text);
  const out = new Array<string>(text.length).fill(" ");
  for (const r of keep) {
    for (let i = r.from; i < r.to; i++) out[i] = text[i];
  }
  return out.join("");
}

/** A word the writer has taught the checker, stored per browser profile. */
const USER_WORDS_KEY = "ksav.userWords";

export function userWords(): string[] {
  try {
    return JSON.parse(localStorage.getItem(USER_WORDS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addUserWord(word: string) {
  const list = userWords();
  if (!list.includes(word)) {
    list.push(word);
    localStorage.setItem(USER_WORDS_KEY, JSON.stringify(list));
  }
}

export function removeUserWord(word: string) {
  localStorage.setItem(USER_WORDS_KEY, JSON.stringify(userWords().filter((w) => w !== word)));
}

/** The user dictionary in the newline form the engine expects. */
export function userWordsText(): string {
  return userWords().join("\n");
}

/** The misspelling under a document position, if any. */
export function misspellingAt(view: EditorView, pos: number): Misspelling | null {
  const list = view.state.field(misspellings, false) ?? [];
  return list.find((m) => pos >= m.start && pos <= m.start + m.len) ?? null;
}
