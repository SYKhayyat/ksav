// Spell-check in the editor: squiggles, suggestions, and teaching it a word.
//
// The checkers themselves live in the engine (see engine/src/spell/ and the
// reasoning there about why Ksav owns a Hebrew lexicon and builds an English one
// on top of a general word list). This is the editor half: it decides *what* to
// check, when, and what happens when you click a squiggle.
//
// Two things matter more here than they might elsewhere:
//
//   * **Never check markup.** `#הערה` is not a misspelling, and neither is
//     `#mktable`. Ksav documents are full of command names, and underlining them
//     would make the feature useless immediately. Only the text that will
//     actually print gets checked — which matters more now that command names
//     can be Latin: the Hebrew ones were half-protected by being Hebrew words
//     the lexicon knows, and `mktable` is not an English word at all.
//   * **Teaching it a word must be one click.** No lexicon can hold every
//     chaburah's terminology, every rebbe's name, or a writer's own coinages. A
//     checker that cannot be taught is one people switch off.

import { EditorView, Decoration, ViewPlugin, hoverTooltip } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import { scan } from "./spans";

export interface Misspelling {
  start: number;
  len: number;
  word: string;
  /** Which lexicon flagged it: "he" or "en". */
  lang?: string;
  suggestions?: string[];
}

// ---------------------------------------------------------------- what is checked
//
// The checker used to skip every word containing a Latin letter, so an English
// page with three typos in it came back clean while the toggle still read as on.
// It checks both languages now — but "it checks both" is a claim about what the
// engine loaded, not about what this file believes, and those came apart once
// already: a checked-in wasm module that predated spell-check shipped with no
// checker in it at all and nothing said so.
//
// So the interface reports the sizes the engine actually returns. If a lexicon
// is missing, the settings panel says which one rather than repeating the claim.

let sizes: { he: number; en: number } | null = null;

/** Record the lexicon sizes from a spell response. */
export function noteLexiconSizes(s: { he?: number; en?: number } | undefined) {
  if (!s) return;
  sizes = { he: Number(s.he) || 0, en: Number(s.en) || 0 };
}

/** The lexicon sizes last reported by the engine, or null before the first check. */
export function lexiconSizes(): { he: number; en: number } | null {
  return sizes;
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
 *
 * **This used to carry a private recursive walker.** Inside `(…)` Typst is in
 * code context, so a nested call is written without a `#` — `#טבלה(עמודות: 2,
 * תא[רש"י])`, `#רשימה(פריט[א])` — and a scanner that matched on `#` could not
 * see one. Blanking a head as one range from `#` to the closing paren therefore
 * blanked every table cell and every list item along with it, and a large share
 * of real prose (including the bulleted list in Ksav's own starter document) was
 * silently exempt from the checker. The walker written to fix that had to know
 * about strings, escapes and nesting — a fourth opinion about the markup, in the
 * module least likely to be checked against the other three.
 *
 * `spans.ts` sees bare calls because it tracks context, so the walker is gone
 * and the question is asked in its true form: prose is what sits in *content*
 * mode and is not a command head or a comment. That is one line of definition
 * and it also picks up content the walker never could — `#סימן("א", [דיני
 * תפילה])` puts its title in a content argument belonging to no nested call.
 */
/**
 * A comment's contents, without the marks that make it one.
 *
 * Stripped before the contents are read back, or the recursion would look at
 * `// שלום` and correctly answer *that is a comment* — and blank the very words
 * it was asked to expose.
 */
function insideMarks(text: string, c: { from: number; to: number }): { from: number; to: number } {
  let open = text.startsWith("/*", c.from) || text.startsWith("//", c.from) ? 2 : 0;
  // A fold's brace is part of its mark, not part of its label: `//{ פרק א` names
  // a fold *פרק א*, and leaving the `{` in would open a code block in the reader
  // below and take the label with it.
  if (open === 2 && (text[c.from + 2] === "{" || text[c.from + 2] === "}")) open = 3;
  const close = text.endsWith("*/", c.to) ? 2 : 0;
  const from = c.from + open;
  const to = Math.max(from, c.to - close);
  return { from, to };
}

export function proseRegions(
  text: string,
  opts: { comments?: boolean } = {},
): { from: number; to: number }[] {
  // A mask rather than a list of ranges, because the regions genuinely nest and
  // interleave: a command head can contain a command body which can contain
  // another head. Range arithmetic on that is where the old bug came from.
  const prose = new Uint8Array(text.length).fill(1);
  const paint = (from: number, to: number, v: number) => {
    for (let i = Math.max(0, from); i < Math.min(text.length, to); i++) prose[i] = v;
  };

  const doc = scan(text);
  // Heads blank, content exposes, applied strictly in document order — which is
  // what puts the nesting back the right way round: a head inside a body is
  // blanked *after* the body containing it was exposed.
  const events: { at: number; to: number; markup: boolean }[] = [];
  for (const n of doc.nodes) {
    events.push({ at: n.from, to: n.args ? n.args.to + 1 : n.nameTo, markup: true });
  }
  for (const g of doc.contentGroups) events.push({ at: g.from, to: g.to, markup: false });
  // On a tie, expose before blank. A head and a content group share a start
  // offset exactly when the head is the first thing inside the group —
  // `תא[#הדגשה[…]]` — so the group is the container and must be applied first,
  // or the command name it holds comes back out as prose.
  events.sort((a, b) => a.at - b.at || Number(a.markup) - Number(b.markup));
  for (const e of events) paint(e.at, e.to, e.markup ? 0 : 1);

  // Comments never reach the page — including ones inside a command body, which
  // is why this runs last.
  //
  // `opts.comments` is the one caller that wants them anyway. A comment is prose
  // the writer typed: a note to a chavrusa, a paragraph parked while it is
  // reworked, the label on a fold. It does not print, which is why this is off
  // by default and why `scrollmap.ts` — which asks the same function *what
  // prints* — must never turn it on.
  for (const c of doc.comments) {
    paint(c.from, c.to, 0);
    if (!opts.comments) continue;
    // A comment holds prose *and* markup: a commented-out paragraph is the most
    // ordinary kind there is, and `#הערה` is no more a misspelling behind a `//`
    // than in front of one. So the same question is asked of what is inside the
    // marks — recursively, rather than by a second scanner that would be this
    // module's private opinion about markup all over again.
    const body = insideMarks(text, c);
    for (const r of proseRegions(text.slice(body.from, body.to)))
      paint(body.from + r.from, body.from + r.to, 1);
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
 *
 * `comments` carries the writer's setting through: a comment is not on the page,
 * so it is not checked unless they say so.
 */
export function checkableText(
  text: string,
  opts: { comments?: boolean } = {},
  /**
   * Materialise only this window of the answer.
   *
   * The incremental check sends one paragraph and used to compute the whole
   * sefer to get it: `runSpellCheck` called this over the entire document and
   * then *sliced* the result. What that cost, measured on the built module —
   * 3.2 ms per call on a 64 KB document, 8.0 ms on a 200 KB one, on the main
   * thread, on a 700 ms timer, while the writer is typing. Half a frame budget
   * on a 200 KB sefer, to produce a paragraph.
   *
   * The regions are still computed over the whole text, and deliberately: a
   * paragraph is not a safe boundary to *parse* from — a block comment or an
   * unclosed bracket spans one — and `spans.scan` is memoised on the text, so
   * asking the whole document what is prose is nearly free. What was not free is
   * this function's own second and third passes: an `Array<string>` one entry
   * per UTF-16 code unit, filled and then joined. Those are what the window
   * bounds.
   *
   * Offsets inside the returned string are relative to `window.from`, which is
   * what `runSpellCheck`'s existing splice arithmetic already assumed of the
   * slice it was taking.
   */
  window?: { from: number; to: number },
): string {
  const keep = proseRegions(text, opts);
  const from = Math.max(0, window?.from ?? 0);
  const to = Math.min(text.length, window?.to ?? text.length);
  const out = new Array<string>(Math.max(0, to - from)).fill(" ");
  for (const r of keep) {
    const a = Math.max(r.from, from);
    const b = Math.min(r.to, to);
    for (let i = a; i < b; i++) out[i - from] = text[i];
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

/**
 * Where the dictionary is kept, once something has said (B29).
 *
 * `null` means *nobody has looked yet*, and then it falls back to
 * `localStorage` — the browser's answer, and until B29 everybody's.
 *
 * The desktop app calls [`keepDictionaryIn`] at startup with a file behind it.
 * Held here rather than asked per call because the readers are synchronous: this
 * list is handed to every spell request and every suggestion, and making those
 * await a file read would put a disk on the path of a keystroke.
 */
let kept: { words: string[]; write: (text: string) => void } | null = null;

/**
 * Keep the dictionary in a file from now on, starting from what is in it (B29).
 *
 * > *"The user dictionary lives in one browser profile — invisible to the desktop
 * > app, gone if the profile is cleared."*
 *
 * Merges whatever `localStorage` already had: a writer who used the browser build
 * first and then installed the desktop app should not have to notice that their
 * words moved. A merge and not a replace, for the same reason `importUserWords`
 * is one.
 *
 * Returns how many the browser's copy contributed, so the window can say so once
 * rather than leaving a writer to wonder whether a zman of teaching survived.
 */
export function keepDictionaryIn(text: string, write: (text: string) => void): number {
  const merged = mergeWords(parseDictionary(text), fromLocalStorage().join("\n"));
  kept = { words: merged.words, write };
  // Written back only when the browser's copy actually added something, so
  // opening the app does not rewrite the file every time it starts.
  if (merged.added > 0) write(serializeDictionary(merged.words));
  return merged.added;
}

/** One word per line, comments and blanks out — the format the engine reads. */
export function parseDictionary(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const word = line.trim();
    if (!word || word.startsWith("#") || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

/**
 * A dictionary as a file: a comment header and the words.
 *
 * The same shape `Lexicon::add_words` reads in the engine, so a dictionary
 * written here can be dropped straight into a lexicon build.
 */
export function serializeDictionary(words: string[]): string {
  return (
    "# Ksav user dictionary · מילון אישי\n" +
    "# One word per line. Lines beginning with # are ignored.\n" +
    "# מילה אחת בכל שורה. שורות המתחילות ב־# מתעלמים מהן.\n" +
    (words.length ? words.join("\n") + "\n" : "")
  );
}

/**
 * Fold a word list into an existing dictionary, and say how many were new.
 *
 * Merge and never replace: someone loading their dictionary onto a second machine
 * wants both halves, and a replace would quietly discard whatever they had taught
 * the checker there. Order is kept — the words they had, then the ones that
 * arrived — because a dictionary panel that reshuffles is one you cannot find
 * anything in.
 */
export function mergeWords(existing: string[], text: string): { words: string[]; added: number } {
  const words = [...existing];
  const have = new Set(existing);
  let added = 0;
  for (const word of parseDictionary(text)) {
    if (have.has(word)) continue;
    have.add(word);
    words.push(word);
    added++;
  }
  return { words, added };
}

function fromLocalStorage(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(USER_WORDS_KEY) || "[]");
    return Array.isArray(list) ? list.filter((w) => typeof w === "string" && w.trim()) : [];
  } catch {
    return [];
  }
}

export function userWords(): string[] {
  return kept ? [...kept.words] : fromLocalStorage();
}

function writeUserWords(list: string[]) {
  if (kept) {
    kept.words = [...list];
    kept.write(serializeDictionary(list));
    return;
  }
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
  return serializeDictionary(userWords());
}

/**
 * Merge a word list into the dictionary, returning how many words were new.
 *
 * Merge rather than replace: someone loading their dictionary onto a second
 * machine wants both halves, and a replace would quietly discard whatever they
 * had taught the checker there.
 */
export function importUserWords(text: string): number {
  const merged = mergeWords(userWords(), text);
  if (merged.added) writeUserWords(merged.words);
  return merged.added;
}

// ---------------------------------------------------------------- reaching a squiggle
//
// Two questions that look like one, and conflating them is what made a
// spell-checked word impossible to put a caret in.
//
// **Where is the caret?** A caret sits *between* characters, so a caret at
// either end of a misspelled word is legitimately "in" it — that is what makes
// `Ctrl+.` work when you have just finished typing the word. Inclusive at both
// ends is correct here.
//
// **What did the pointer land on?** A click resolves to the nearest boundary, so
// inclusive-at-both-ends means the position immediately *after* a misspelling
// counts as a hit on it — and the writer's report was, exactly, that the caret
// could not be placed "on or after a spell-checked word". Half-open is correct
// here, and the two are separate functions rather than a flag because the call
// sites are asking different questions.

/** The misspelling the caret is standing in, counting both ends. */
export function misspellingAt(view: EditorView, pos: number): Misspelling | null {
  const list = view.state.field(misspellings, false) ?? [];
  return list.find((m) => pos >= m.start && pos <= m.start + m.len) ?? null;
}

/** The misspelling a pointer landed on — the character, not the boundary after it. */
export function misspellingUnder(view: EditorView, pos: number): Misspelling | null {
  const list = view.state.field(misspellings, false) ?? [];
  return list.find((m) => pos >= m.start && pos < m.start + m.len) ?? null;
}

/**
 * What a squiggle is, on hover.
 *
 * The left button used to open the suggestion menu, which is why this is here.
 * That gesture was two things at once: it was the only route anybody could find
 * to the suggestions, and it was also the reason a spell-checked word could not
 * be clicked into — `preventDefault` on every `mousedown` over a squiggle, so
 * the caret never moved. Handing the left button back to the caret removes the
 * defect and removes the only signpost with it.
 *
 * So the signpost gets built properly: hovering says what the mark means, which
 * lexicon flagged it, and both ways to act on it. That is the same argument the
 * inventory makes about the change gutter's red wedge and about disabled menu
 * items — the application knows, and does not say.
 *
 * `text` is passed in rather than looked up so this module keeps no opinion
 * about the interface's language; `main.ts` owns `i18n`.
 */
export function spellTooltip(text: (m: Misspelling) => string) {
  return hoverTooltip((view, pos) => {
    const m = misspellingUnder(view, pos);
    if (!m) return null;
    return {
      pos: m.start,
      end: m.start + m.len,
      above: true,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "cm-spell-tip";
        dom.textContent = text(m);
        return { dom };
      },
    };
  });
}
