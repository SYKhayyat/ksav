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
/**
 * The `[…]` bodies of bare calls inside an argument list — `תא[…]`, `פריט[…]`,
 * `מיזוג(2)[…]`.
 *
 * Inside `(…)` Typst is already in code context, so a nested call needs no `#`
 * and `scanCommands` — which matches on `#` — never sees one. Double-quoted
 * strings are skipped so an argument like `כותרת: "תא[x]"` is not mistaken for a
 * call.
 */
const BARE_NAME = /[A-Za-z֐-׿_][A-Za-z0-9֐-׿_]*/y;

function bareCallBodies(
  text: string,
  from: number,
  to: number,
  out: { from: number; to: number }[] = [],
): { from: number; to: number }[] {
  for (let i = from; i < to; i++) {
    if (text[i] === '"') {
      // A string literal. Skipping it is what keeps `כותרת: "תא[x]"` from being
      // read as a call — and the scan must *not* continue into a body, because
      // inside a body Typst is in markup context where `"` is an ordinary
      // character. Hebrew writes gershayim as `"`, so `תא[רש"י]` would otherwise
      // open a string that swallowed everything up to the next citation.
      for (i++; i < to; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === '"') break;
      }
      continue;
    }
    BARE_NAME.lastIndex = i;
    const m = BARE_NAME.exec(text);
    if (!m) continue;
    let j = m.index + m[0].length;
    // An optional argument list of its own — `מיזוג(2)[…]`, or a nested call
    // whose arguments hold more bare calls.
    let argFrom: number | null = null;
    let argTo = 0;
    if (text[j] === "(") {
      const close = matchBracket(text, j, "(", ")", to);
      if (close == null) {
        i = j;
        continue;
      }
      argFrom = j + 1;
      argTo = close;
      j = close + 1;
    }
    if (text[j] === "[") {
      const close = matchBracket(text, j, "[", "]", to);
      if (close != null) {
        out.push({ from: j + 1, to: close });
        if (argFrom != null) bareCallBodies(text, argFrom, argTo, out);
        i = close; // past the body; its own contents are markup context
        continue;
      }
    }
    if (argFrom != null) {
      // A nested call with no body of its own: its arguments are still an
      // argument list, and may hold bare calls that do have bodies.
      bareCallBodies(text, argFrom, argTo, out);
      i = argTo;
      continue;
    }
    i = j - 1; // a bare name, not a call; resume after it rather than inside it
  }
  return out;
}

function matchBracket(src: string, open: number, o: string, c: string, limit: number): number | null {
  let depth = 1;
  for (let i = open + 1; i < limit; i++) {
    if (src[i] === o) depth++;
    else if (src[i] === c && --depth === 0) return i;
  }
  return null;
}

export function proseRegions(text: string): { from: number; to: number }[] {
  // A mask rather than a list of ranges, because the regions genuinely nest and
  // interleave: a command head can contain a command body which can contain
  // another head. Range arithmetic on that is where the bug below came from.
  const prose = new Uint8Array(text.length).fill(1);
  const blank = (from: number, to: number) => {
    for (let i = Math.max(0, from); i < Math.min(text.length, to); i++) prose[i] = 0;
  };
  const expose = (from: number, to: number) => {
    for (let i = Math.max(0, from); i < Math.min(text.length, to); i++) prose[i] = 1;
  };

  // Command heads (`#name` plus any `(arguments)`) are markup; command bodies
  // (`[…]`) are prose.
  //
  // The subtlety, and a real bug this had: a command's *arguments* can contain
  // whole nested calls with bodies of their own, and inside an argument list
  // those are written **bare** — `#טבלה(עמודות: 2, תא[רש"י])`,
  // `#רשימה(פריט[א])` — with no `#`, because they are already in code context.
  // `scanCommands` only ever matches `#name`, so it does not see them, and
  // blanking the head as one range from `#` to the closing paren blanked every
  // table cell and every list item along with it. Tables and lists are two of
  // the most common structures in the product, so a large share of real prose —
  // including the bulleted list in Ksav's own starter document — was silently
  // exempt from the checker.
  //
  // `scanCommands` yields spans in document order, which is outermost first, so
  // blanking each head and then re-exposing the bodies inside it puts the
  // nesting back in the right order: an inner head is blanked *after* the outer
  // body that contains it has been exposed.
  for (const s of scanCommands(text)) {
    const headEnd = s.argClose != null ? s.argClose + 1 : s.nameEnd;
    blank(s.cmdStart, headEnd);
    if (s.argOpen != null && s.argClose != null) {
      for (const r of bareCallBodies(text, s.argOpen + 1, s.argClose)) expose(r.from, r.to);
    }
    if (s.open != null && s.close != null) expose(s.open + 1, s.close);
  }

  // Comments never reach the page — including ones inside a command body, which
  // is why this runs last.
  for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
    blank(m.index!, m.index! + m[0].length);
  }
  for (const m of text.matchAll(/(^|[^:])(\/\/[^\n]*)/g)) {
    const start = m.index! + m[1].length;
    blank(start, start + m[2].length);
  }

  const out: { from: number; to: number }[] = [];
  let from = -1;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && prose[i]) {
      if (from < 0) from = i;
    } else if (from >= 0) {
      out.push({ from, to: i });
      from = -1;
    }
  }
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

// ---------------------------------------------------------------- the user's own words
//
// The dictionary lives in `localStorage`, which means it lives in *one browser
// profile*: it is invisible to the desktop app, invisible in another browser,
// and gone if that profile is cleared. For a bochur who has spent a zman
// teaching the checker their rebbe's name, their chaburah's terminology and
// their own coinages, that is real work to lose.
//
// The honest fix at this stage is not sync — there is no account system and
// inventing one for a word list would be absurd. It is to make the list a
// *file*: something the writer owns, can put in Dropbox or in git beside their
// seforim, and can load into whichever Ksav they are sitting in front of.

const USER_WORDS_KEY = "ksav.userWords";

export function userWords(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(USER_WORDS_KEY) || "[]");
    return Array.isArray(list) ? list.filter((w) => typeof w === "string" && w.trim()) : [];
  } catch {
    return [];
  }
}

function writeUserWords(list: string[]) {
  try {
    localStorage.setItem(USER_WORDS_KEY, JSON.stringify(list));
  } catch {
    // A word list is a few kilobytes; if this fails the browser is out of room
    // entirely, which the save path reports far more usefully than a squiggle
    // menu could.
  }
}

export function addUserWord(word: string) {
  const list = userWords();
  if (!list.includes(word)) {
    list.push(word);
    writeUserWords(list);
  }
}

export function removeUserWord(word: string) {
  writeUserWords(userWords().filter((w) => w !== word));
}

/** The user dictionary in the newline form the engine expects. */
export function userWordsText(): string {
  return userWords().join("\n");
}

/**
 * The dictionary as a portable file.
 *
 * A plain word list with a comment header — the same shape
 * `Lexicon::add_words` reads in the engine, so a dictionary exported here can
 * also be dropped straight into a lexicon build.
 */
export function exportUserWords(): string {
  const list = userWords();
  return (
    "# Ksav user dictionary · מילון אישי\n" +
    "# One word per line. Lines beginning with # are ignored.\n" +
    "# מילה אחת בכל שורה. שורות המתחילות ב־# מתעלמים מהן.\n" +
    (list.length ? list.join("\n") + "\n" : "")
  );
}

/**
 * Merge a word list into the dictionary, returning how many words were new.
 *
 * Merge rather than replace: someone loading their dictionary onto a second
 * machine wants both halves, and a replace would quietly discard whatever they
 * had taught the checker there.
 */
export function importUserWords(text: string): number {
  const existing = userWords();
  const have = new Set(existing);
  let added = 0;
  for (const line of text.split("\n")) {
    const word = line.trim();
    if (!word || word.startsWith("#") || have.has(word)) continue;
    have.add(word);
    existing.push(word);
    added++;
  }
  if (added) writeUserWords(existing);
  return added;
}

/** The misspelling under a document position, if any. */
export function misspellingAt(view: EditorView, pos: number): Misspelling | null {
  const list = view.state.field(misspellings, false) ?? [];
  return list.find((m) => pos >= m.start && pos <= m.start + m.len) ?? null;
}
