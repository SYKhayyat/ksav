// What the four list panels list — decided here, drawn by the shell.
//
// # Why this module exists
//
// The 7 August report's §7 is one claim made twice: every feature in this
// application is half in a tested module and half in `main.ts`, and the seam is
// where the bugs are. `actions.ts` took which command each shell action inserts.
// `insert.ts` took what an insertion becomes. This takes what a **panel row is**.
//
// Four panels show a list of things you can click — the outline, the notes pane,
// the version history and the command palette. Each one built its rows inline in
// `main.ts`, which is the one module no test can import, and between them they
// answered four questions four times:
//
//   1. **How far to indent.** `8 + level * 14` in the outline, `8 + depth * 14`
//      in the notes pane. One rule, two spellings, and nothing comparing them.
//   2. **What a row's words are.** The notes pane flattens the markup with
//      `plainText`, so a row reads *"עיין שם היטב"*. The history panel takes
//      the first non-blank line raw — so a snapshot of a document that opens
//      with a title page is listed as `#שער[קונטרס בעניני שבת]`, markup and
//      all. The two panels were asked the same question and gave different
//      answers, and one of them is not an answer.
//   3. **What to say when there is nothing.** Three of the four have an empty
//      state. The palette has none: type a query nothing matches and you get a
//      blank rectangle, which is the surface whose entire job is *finding
//      things* declining to say that it found none.
//   4. **What to do about a cap.** The palette shows 30 actions and 60
//      commands. There is no thirty-first and no sixty-first, there is no
//      indication that there was one, and the registry has 115 commands in it —
//      so an empty query lists just over half of them and says nothing. A cap
//      that is invisible reads as completeness.
//
// (1) and (2) are the shape the report's appendix calls bucket 2 — live callers,
// one idea copied N times — and (3) and (4) are what that shape hides. All four
// are decisions, none of them was reachable from a test, and all four are here
// now.
//
// # The split
//
// Every function returns a [`PanelList`]: rows, an empty-state key, and how many
// rows a cap dropped. Nothing here touches the DOM, schedules anything or knows
// what a click does — a row carries a [`RowAction`] saying what it *is for*, and
// the shell's six lines of `switch` perform it.

import { plainText } from "./spans";
import type { OutlineRow } from "./ksav-lang";
import type { NoteSpan } from "./notes";
import type { MarkSpan } from "./marks";
import type { Snapshot } from "./docs";
import type { Available } from "./commands";
import { matches } from "./commands";
import { actionForCommand } from "./actions";
import { readable } from "./bindings";

/** What a row is for. The shell performs these; nothing here does. */
export type RowAction =
  | { kind: "jump"; at: number }
  /** A note: click jumps to the prose, right-click acts on the marker. */
  | { kind: "note"; at: number; marker: number }
  | { kind: "action"; id: string }
  | { kind: "insert"; snippet: string }
  /** Restore the snapshot at this index of the list that was passed in. */
  | { kind: "restore"; index: number };

export interface PanelRow {
  does: RowAction;
  /**
   * Indent steps — **not** pixels.
   *
   * One rule, and it is the shell's job to turn a step into a length. Two
   * panels each spelled `8 + n * 14` into an inline style; a third one would
   * have made it three.
   */
  indent: number;
  /** The small leading chip: an ordinal, a category, a date. */
  chip?: string;
  /** A second, quieter label between the chip and the words. */
  note?: string;
  /** The row's own words. Never markup — see `gist`. */
  label: string;
  /** Trailing monospace text: a shortcut, a command name. */
  trailing?: string;
  /**
   * When this row happened, as a timestamp.
   *
   * Not formatted here: `toLocaleDateString` reads the host's locale, and a
   * module that decides what a list contains has no business deciding what a
   * date looks like in Jerusalem.
   */
  when?: number;
  /** A stable identifier for anything that has to find this row from outside. */
  id?: string;
  /** i18n key for the row's tooltip, when it has one worth having. */
  title?: string;
  /** The row's words in full, where `label` is a cut-down version of them. */
  full?: string;
  /** The line of the document this row points into, for reading it in place. */
  context?: string;
}

export interface PanelList {
  rows: PanelRow[];
  /**
   * The i18n key to show instead of the rows, or `null` when there are rows.
   *
   * A key rather than a sentence, because this module does not resolve
   * language — and because a panel with no empty state is then a `null` that
   * cannot be written by accident.
   */
  empty: string | null;
  /**
   * How many rows a cap dropped.
   *
   * Zero for the three panels that have no cap. The palette has one and used to
   * apply it silently: the shell now says so, because a list that stops without
   * saying it stopped is a list that reads as complete.
   */
  hidden: number;
}

/**
 * How far a nested row is indented, in pixels.
 *
 * Here rather than in the shell because it was in the shell twice, in two
 * panels, spelled identically and reachable from neither a test nor the other.
 */
export function indentPx(steps: number): number {
  return 8 + Math.max(0, steps) * 14;
}

/** The longest a row's words may be before they are cut. */
const GIST = 60;

/**
 * A row's words: the markup flattened, collapsed and cut to length.
 *
 * One answer for all four panels. The history panel had its own — the first
 * non-blank line, verbatim — which shows `#שער[קונטרס בעניני שבת]` for every
 * document that opens with a title page, and `//{ פרק א` for every one that
 * opens with a fold. Neither is a name for a version; both are the source
 * showing through the surface.
 *
 * Cut by **letters**, not by units and not by code points. `slice` on a
 * JavaScript string counts UTF-16 units; a nikud point is a unit of its own and
 * a code point of its own, so `slice(0, 42)` — which is what the history panel
 * did — shows a fully pointed line with half the words of an unpointed one, and
 * a cut can land between a letter and its own vowels. Combining marks are
 * therefore not counted and never separated from the letter they belong to.
 */
export function gist(text: string, limit = GIST): string {
  const flat = plainText(text).replace(/\s+/gu, " ").trim();
  let letters = 0;
  let end = -1;
  for (const ch of flat) {
    // A mark rides along with the letter before it: it costs nothing and it
    // cannot be the character the cut lands after.
    if (!/\p{M}/u.test(ch)) {
      if (letters === limit) break;
      letters++;
    }
    end += ch.length;
  }
  if (letters < limit) return flat;
  const cut = flat.slice(0, end + 1);
  // Back up to the last space, but only if that leaves most of the room used —
  // a single sixty-letter word should be cut, not thrown away.
  const space = cut.lastIndexOf(" ");
  return (space > cut.length * 0.6 ? cut.slice(0, space) : cut) + "…";
}

/**
 * The outline pane: every heading, indented by its depth below the shallowest.
 *
 * Relative to the shallowest and not absolute, because a document whose only
 * headings are `#כותרת3` is not a document indented three levels — it is a
 * document whose headings all sit at the same place.
 */
export function outlineList(items: readonly OutlineRow[]): PanelList {
  if (!items.length) return { rows: [], empty: "noHeadings", hidden: 0 };
  const shallowest = Math.min(...items.map((i) => i.level));
  return {
    rows: items.map((it) => ({
      does: { kind: "jump", at: it.from },
      indent: it.level - shallowest,
      label: it.title,
    })),
    empty: null,
    hidden: 0,
  };
}

/** Markup out, whitespace collapsed — a note's words as words. */
function flat(text: string): string {
  return plainText(text).replace(/\s+/gu, " ").trim();
}

/**
 * The line the note's *marker* sits on, as prose, with a `†` where it sits.
 *
 * The marker's line and not the note's: for a deferred note those are two
 * different lines, and the one worth reading is the sentence being annotated
 * rather than the pile of note bodies at the end of the file.
 *
 * The note's own words come out of it. Left in — which is what stripping the
 * markup does on its own, since a footnote body *is* text — the line repeats
 * the note directly under the note, and the sentence it is supposed to show
 * cannot be read through it.
 */
function lineAround(doc: string, n: NoteSpan): string | undefined {
  const from = doc.lastIndexOf("\n", Math.max(0, n.from - 1)) + 1;
  const nl = doc.indexOf("\n", n.from);
  const to = nl < 0 ? doc.length : nl;
  // The marker's own span and no more. `bodyTo` is the wrong end to cut at for
  // a deferred note: its prose is on another line entirely, and everything from
  // the marker to there would go with it.
  const end = Math.min(n.to, to);
  const line = flat(doc.slice(from, n.from)) + " † " + flat(doc.slice(end, to));
  const said = line.replace(/\s+/gu, " ").trim();
  return said === "†" ? undefined : said;
}

/**
 * The notes pane: every note in reading order, indented by how many notes it is
 * inside.
 *
 * The ordinal is the note's position in that order and is what the writer counts
 * by — it is not the printed mark, which the prelude decides and which restarts
 * per page for a banded apparatus.
 */
export function noteList(items: readonly NoteSpan[], doc = ""): PanelList {
  if (!items.length) return { rows: [], empty: "notesPaneEmpty", hidden: 0 };
  return {
    rows: items.map((n, i) => ({
      does: { kind: "note", at: n.bodyFrom, marker: n.from },
      indent: n.depth,
      chip: String(i + 1),
      // The whole note, and the sentence it hangs off — *"the notes drawer
      // should expand to the whole note, and to the line the note sits on"*.
      // One line of a note is enough to recognise it and never enough to read
      // it, and a note read away from the sentence it annotates is half a note.
      full: flat(n.text),
      context: doc ? lineAround(doc, n) : undefined,
      // The pair's name, for a note written the deferred way — it is what the
      // two halves are called in the source, and reading a row without it means
      // hunting for which marker this prose belongs to.
      note: n.deferred?.name,
      // A marker whose body is not written yet has no words; naming the command
      // is the only honest thing left to show.
      label: gist(n.text) || "#" + n.command,
      title: n.deferred ? "noteJumpDeferred" : "noteJump",
    })),
    empty: null,
    hidden: 0,
  };
}

/**
 * The marks pane: every semantic mark in the document, grouped by its class.
 *
 * *"You should be able to … see just these in some list somewhere."* Grouped and
 * not flat, because the question a writer arrives with is about one class — every
 * lemma, every siman, every place in Shas — and a single stream of all eight
 * classes in reading order answers it no better than the document does.
 *
 * The class heading is a row of its own with no action, which is how this list
 * says *there are seven of these* without a second surface to say it in. The
 * count goes in the chip, where the notes pane puts an ordinal: it is the number
 * the writer is actually asking for.
 *
 * `label` for a class row is its **Hebrew class name**, not a translation. This
 * module does not resolve language — see `PanelList.empty` — so the shell
 * translates it through `markClass.<name>`, and a class with no key would show
 * its own name rather than a blank.
 */
export function markList(items: readonly MarkSpan[], order: readonly string[]): PanelList {
  if (!items.length) return { rows: [], empty: "marksPaneEmpty", hidden: 0 };
  const rows: PanelRow[] = [];
  for (const cls of order) {
    const mine = items.filter((m) => m.cls === cls);
    if (!mine.length) continue;
    rows.push({
      does: { kind: "jump", at: mine[0].from },
      indent: 0,
      chip: String(mine.length),
      label: cls,
      id: "markclass:" + cls,
    });
    for (const m of mine) {
      rows.push({
        does: { kind: "jump", at: m.from },
        indent: 1,
        // A mark whose words are not written yet — `#גמרא[][]` straight out of
        // the Insert menu — has nothing to show but what it is, and naming the
        // command is the only honest row left.
        label: gist(m.text) || "#" + m.command,
        full: flat(m.text) || undefined,
      });
    }
  }
  return { rows, empty: null, hidden: 0 };
}

/**
 * The version history: newest first, each row named by what the document said.
 *
 * Newest first is decided here rather than by the caller reversing the array,
 * because "which end is the newest" is exactly the sort of thing that is right
 * in one caller and wrong in the next.
 */
export function historyList(snapshots: readonly Snapshot[]): PanelList {
  if (!snapshots.length) return { rows: [], empty: "noHistory", hidden: 0 };
  return {
    rows: snapshots
      .map((s, index) => ({ s, index }))
      .reverse()
      .map(({ s, index }) => ({
        does: { kind: "restore" as const, index },
        indent: 0,
        label: gist(s.body) || "—",
        when: s.t,
        id: String(s.t),
      })),
    empty: null,
    hidden: 0,
  };
}

/** How many rows of each kind the palette shows before it stops. */
export const PALETTE_ACTIONS = 30;
export const PALETTE_COMMANDS = 60;

/** One heading in the commands drawer, and the commands under it. */
export interface CommandGroup {
  /**
   * The i18n key for the heading — a registry category, or where a command the
   * writer defined came from.
   */
  title: string;
  rows: PanelRow[];
}

/**
 * Every command, grouped, with nothing left out.
 *
 * # Why this exists next to the palette
 *
 * The inventory's reader could not reach the 122 commands from any of the four
 * surfaces that advertise them — the Insert menu, the palette, autocomplete and
 * the help page — and then arrived independently at what they wanted instead: a
 * drawer holding every command, searchable and grouped. The record says to take
 * that as the specification, so this is it.
 *
 * It is not the palette again. The palette is a modal that closes on the first
 * thing you run, caps its list at sixty and mixes commands in with operations,
 * because it answers *"I know what I want, get me there"*. This answers the
 * other question — *"what is there?"* — which needs the whole list, the
 * headings that make a list of 122 readable, and a surface that survives being
 * used. It sits beside the text like the outline and the notes list, and the
 * groups are the registry's own categories, so it is the same taxonomy the
 * menus and the help page present rather than a fourth opinion.
 *
 * **No cap.** Every other list here has one and reports it; this one is the
 * inventory, and an inventory that stops at sixty is the exact failure the
 * palette's `hidden` count exists to confess to.
 *
 * `bound` is the live bindings by action id — the writer's over the shipped
 * table — so a row shows the key that actually runs it today.
 */
export function commandGroups(
  commands: readonly Available[],
  bound: Record<string, string>,
  query: string,
  lang: "he" | "en",
): { groups: CommandGroup[]; empty: string | null; shown: number } {
  const groups: CommandGroup[] = [];
  const byTitle = new Map<string, CommandGroup>();
  let shown = 0;
  for (const c of commands) {
    if (!matches(c, query)) continue;
    shown++;
    // A registry command groups by its category; one the writer defined groups
    // by where it came from, which is the distinction that matters when both a
    // document's `#דגש` and yours exist and the compiler runs one of them.
    const title = c.category
      ? "cat." + c.category
      : c.from === "document"
        ? "fromDocument"
        : "fromYou";
    let group = byTitle.get(title);
    if (!group) {
      group = { title, rows: [] };
      byTitle.set(title, group);
      groups.push(group);
    }
    const key = bound[actionForCommand(c.name) ?? ""];
    group.rows.push({
      does: { kind: "insert", snippet: c.insert },
      indent: 0,
      // The shortcut, where there is one. Thirteen commands have had a key
      // since the beginning and no surface that lists commands has ever
      // printed it beside one.
      note: key ? readable(key) : undefined,
      label:
        (c.from === "registry" ? (lang === "he" ? c.desc_he : c.desc_en) : undefined) ?? c.name,
      trailing: "#" + c.name + (c.en ? " · " + c.en : ""),
      id: c.name,
    });
  }
  return { groups, empty: shown ? null : "paletteNothing", shown };
}

/** One action the palette can run: an id, a name, and the key that runs it. */
export interface PaletteAction {
  id: string;
  label: string;
  key: string;
}

/**
 * The command palette: operations first, then commands.
 *
 * Operations first because they are what the word "command" means to somebody
 * who opened this looking for one, and because they are the half that was
 * missing for a year.
 *
 * # The two things this fixes
 *
 * **The caps are reported.** 30 and 60 are still the caps — a palette that
 * renders 115 rows on every keystroke is a slow palette — but `hidden` now says
 * how many did not fit, and the shell prints it. An empty query listed 60 of the
 * registry's 115 commands and said nothing at all, which is a list that reads as
 * *all of them*.
 *
 * **There is an empty state.** A query nothing matches produced a blank
 * rectangle. This is the one surface in the application whose entire job is
 * finding things, and it declined to say when it had found none.
 */
export function paletteList(
  actions: readonly PaletteAction[],
  commands: readonly Available[],
  query: string,
  lang: "he" | "en",
): PanelList {
  const q = query.trim().toLowerCase();
  const acts = actions.filter(
    (a) => !q || a.label.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
  );
  const cmds = commands.filter((c) => matches(c, query));

  const rows: PanelRow[] = [
    ...acts.slice(0, PALETTE_ACTIONS).map((a) => ({
      does: { kind: "action" as const, id: a.id },
      indent: 0,
      chip: "cat.action",
      label: a.label,
      // The id when there is no key: a palette row with an empty trailing column
      // looks like a row that does nothing.
      trailing: a.key || a.id,
      id: a.id,
    })),
    ...cmds.slice(0, PALETTE_COMMANDS).map((c) => ({
      does: { kind: "insert" as const, snippet: c.insert },
      indent: 0,
      // A user-defined command says where it came from instead of a category —
      // *this document's* or *yours*, which is the distinction that matters when
      // both exist and the compiler runs one of them. A registry command with no
      // category gets no chip rather than an empty one, which is what the
      // shell's own `whose` returned for it.
      chip: c.category
        ? "cat." + c.category
        : c.from === "document"
          ? "fromDocument"
          : c.from === "yours"
            ? "fromYou"
            : undefined,
      label:
        (c.from === "registry" ? (lang === "he" ? c.desc_he : c.desc_en) : undefined) ?? c.name,
      trailing: "#" + c.name + (c.en ? " · " + c.en : ""),
      id: c.name,
    })),
  ];

  const hidden =
    Math.max(0, acts.length - PALETTE_ACTIONS) + Math.max(0, cmds.length - PALETTE_COMMANDS);
  return { rows, empty: rows.length ? null : "paletteNothing", hidden };
}
