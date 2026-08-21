// Writing a note is one pick: which destination.
//
// # What this replaced, and why it had to go
//
// This file used to hold `NOTE_CHOICES` — eleven cards over a `where` x `how`
// grid, five places by six arrangements, thirty cells of which eleven were
// filled and nineteen were refusals. It was a real improvement on the ~25 raw
// command names it replaced, and it was still the wrong shape: **the cells were
// the product**. Every arrangement anybody wanted had to be somebody's card, so
// a mechanism the engine had and no card named was unreachable — which happened
// three times, each time to code that was already written, tested and aliased.
//
// The model underneath is one axis, not two. A note goes **somewhere**, and
// where it goes decides everything else: its numbering, its size, whether it
// runs in, what it does when the box is full. Notes that share a destination
// share those things because they *are the same stream* — so there is nothing
// to declare before writing a note, and nothing to choose beside the place.
//
//     #הערה[…]                        the live page foot
//     #הערה(ערוץ: "סוף")[…]           the back of the sefer
//     #הערה(ערוץ: "סוף_מדור")[…]      the end of this section
//     #הערה(ערוץ: "צד")[…]            the side column
//     #הערה(ערוץ: "קובץ")[…]          a companion volume
//     #הערה(אזור: "שער_הציון")[…]     a named region
//
// Four singular destinations and a named list. The list is what recovers the one
// case a flat five forecloses — two separately-numbered apparatuses in the same
// place — because two regions placed at the back are two apparatuses at the
// back, and one destination is one.
//
// The vocabulary and the table live in `channels.ts`, which is the editor's half
// of one authority with the prelude. This file is the *writing* half: it turns a
// pick into markup, files the prose wherever the writer keeps it, and adds
// whatever the destination needs in order to actually print.
//
// # A sub-note's parent is not a pick
//
// It is whatever note the caret is inside — determined, never chosen, which is
// what a writer means anyway. `tieredNoteAt` reads the caret; nothing asks.
//
// # The one thing the cards got right
//
// The small page sketches. They are kept, in `channels.DESTINATIONS`, because a
// pick has to show what it builds and four rows of `▤` say more about where a
// note lands than any sentence does.

import {
  deferSnippet,
  fileNewBody,
  nextName,
  removePair,
  retargetRef,
  scan as scanDeferred,
  type BodyHome,
  type Errand,
} from "./deferred";
import type { NoteMarker } from "./api";
import {
  PLACEMENTS,
  channelLine,
  destinationArg,
  destinationChannelName,
  destinationOf,
  pickFor,
  pickLine,
  presetLines,
  declarationsIn,
  regionPlacement,
  regionsIn,
  regionsShownIn,
  seriesOf,
  showRegionLine,
  type NotePick,
  type Placement,
  type Preset,
} from "./channels";
import { dumpFor } from "./apparatus";
import { canonicalName, docLang, insertionAt, translated } from "./mode";
import { DEFAULT_NOTE_KIND, TIERS, opensNoteBody, tierCommand } from "./note-commands";
import { scan as scanSpans, type Node, type Scan } from "./spans";

export type { NotePick } from "./channels";

// ---------------------------------------------------------------- one path in
//
// §1.5 of the plan, and the complaint that produced it: *"I have to go into the
// menu to pick an org-mode one each time."* `settings.deferNoteBodies` was
// persisted correctly and read by exactly one caller — the Notes chooser. The
// toolbar `†`, `Ctrl+Shift+F` and the command palette each spliced `#הערה[|]`
// straight into the buffer, so a writer who had said "note bodies at the end of
// the file" got it only when they went through the modal.
//
// Four call sites, four authors, one preference honoured once. The fix is not to
// wire the other three: it is that there is one producer of note markup, and
// every surface reaches it *by inserting the ordinary snippet*. `noteFor` is
// what makes that possible — it recognises a raw registry snippet as a note, so
// `insertSnippet` can route it without any of its callers knowing that notes are
// special.

/**
 * The destination a raw snippet writes into, if it is a note at all.
 *
 * **Said in Hebrew before it is asked.** Snippets arrive in either language —
 * the toolbar's fixed buttons pass Hebrew literals, and `tieredNoteAt` quite
 * deliberately passes `#fnote[|]` in an English document — and a table walked in
 * one language only is the defect family this repository is named for. Matched
 * against Hebrew literals, an English tiered note was **not a note at all**, so
 * `plan` fell through to a plain splice and the two things only the note path
 * does were skipped: the destination's scaffolding, and `deferNoteBodies`.
 *
 * The marker comes back **in Hebrew**, for the reason it is matched in Hebrew:
 * `applyPick` spells it for the document as its first act, and handing it a form
 * already in that language would be the one path that skips the translation.
 *
 * There is no table of markers any more, and that is the point: *any* command
 * that opens a note body is a note, and where it prints comes off the call. A
 * mechanism the engine grows is reachable the day `note-commands.ts` learns its
 * name, rather than the day somebody writes it a card.
 */
export function noteFor(snippet: string): { pick: NotePick; marker: string } | null {
  const s = translated(snippet.trim(), "he");
  const sc = scanSpans(s);
  // The call the snippet *is*, not one buried in it: `#רשימה(פריט[|])` holds a
  // node at offset 0 and one inside it, and only the outer one is what the
  // writer pressed.
  const n = sc.nodes.find((x) => x.hash && x.from === 0);
  if (!n) return null;
  const name = canonicalName(n.name);
  if (!opensNoteBody(name)) return null;
  const args = n.args ? s.slice(n.args.from, n.args.to) : "";
  return { pick: pickFor(name, args), marker: s };
}


/**
 * How many notes enclose this position. 0 in ordinary prose.
 *
 * Read off the index rather than off the enclosing command names, because a
 * deferred body is inside a note and does not look like it: the caret sits in
 * `#גוף_הערה("1")[…]` at the end of the file, and the note it belongs to is a
 * marker three pages up. Counting command names answered 0 there — see the
 * index below.
 */
export function noteDepthAt(doc: string, pos: number): number {
  let best = -1;
  for (const n of notesIn(doc)) {
    if (n.hasBody && n.bodyFrom <= pos && pos <= n.bodyTo && n.depth > best) best = n.depth;
  }
  return best + 1;
}

/**
 * The tiered-note command to write here.
 *
 * The toolbar's `⁑` used to insert `#הערה_על_הערה`, which is a cosmetic alias —
 * `footnote(text(size: 0.94em, style: "italic", …))`, measured at 10.2pt against
 * a plain nested footnote's 9.6pt, in the same block with the same rhythm. The
 * real tiered mechanism had no button at all. Now the button writes the real
 * thing, and it reads the caret: a tiered note inside one note is tier ב, inside
 * two is tier ג, and standing in ordinary prose it is tier א.
 *
 * `lang` is the document's direction, not the interface's: an English document
 * gets `#tier2`. Reading the caret was always the point of this function, and
 * until the shared list arrived it could not read an English one — every
 * `#fnote[…]` around the caret counted as zero, so this wrote tier א from inside
 * a note.
 */
export function tieredNoteAt(doc: string, pos: number, lang: "he" | "en" = "he"): string {
  const tier = Math.min(noteDepthAt(doc, pos) + 1, TIERS.length);
  return `#${tierCommand(tier, lang)}[|]`;
}

// ---------------------------------------------------------------- the index
//
// Word's navigation pane, for notes. Anyone with more than ten notes works by
// scanning the list and jumping, not by scrolling the source looking for the
// one that started "ועיין". Ksav had no such list, and the notes are exactly the
// text a writer most often needs to get back to.

export interface NoteSpan {
  /**
   * Offset of the `#` of the note's *marker* — where the note prints.
   *
   * For a deferred note that is the `#הערה_בשם(…)` in the prose, not the
   * `#גוף_הערה(…)[…]` at the end of the file: the marker is the note as far as
   * the page and the reader are concerned, and it is what a right-click, a
   * conversion and a deletion have to act on.
   */
  from: number;
  /** One past the end of the marker. */
  to: number;
  /** Offset of the first character of the prose, wherever it lives. */
  bodyFrom: number;
  /** One past the last character of the prose. */
  bodyTo: number;
  /**
   * False for a marker whose body has not been written yet.
   *
   * `bodyFrom`/`bodyTo` then both sit just past the marker, so a jump still
   * lands somewhere sensible — but a caret there is in prose, not in a note.
   */
  hasBody: boolean;
  /** The layout command, without the hash — `הערה`, `הערתסיום`, `מדור_בדרגה`. */
  command: string;
  /** The note's text, brackets and nested markup included. */
  text: string;
  /** How many notes enclose this one: 0 for a note on the body. */
  depth: number;
  /**
   * The series this note is numbered in — see `channels.seriesOf`.
   *
   * Carried here rather than worked out by each reader, because it comes off
   * the same scan that produced the span and a second parse of the same markup
   * is the defect family this repository is named for.
   */
  series: string;
  /**
   * Where the prose lives, when it does not live in the marker.
   *
   * Present exactly when the note is written the deferred way. `defFrom`/
   * `defTo` cover the whole `#גוף_הערה(…)[…]` call, which is what has to go
   * when the note is deleted.
   */
  deferred: { name: string; defFrom: number; defTo: number } | null;
}

/**
 * Every note in the document, in reading order, nested ones included.
 *
 * # Both spellings, one list
 *
 * A note can be written two ways — the prose inline, or a marker here and the
 * prose at the end of the file — and until this was one function they were
 * mutually exclusive features. `notesIn` walked brackets looking for a command
 * that opens a note body; `#הערה_בשם` opens none, so on a document written the
 * deferred way it returned **nothing**, and the notes pane, its jump list and
 * the whole right-click convert/delete/sub-note menu were empty on a document
 * full of notes. `settings.deferNoteBodies` — the preference §1.5 of the plan
 * exists to honour everywhere — switched the other half of the feature off.
 *
 * The two commands are still deliberately absent from `NOTE_BODY_COMMANDS`,
 * and that is still right: that list means *takes note prose as its last
 * positional argument*, which is what lets `deferred.ts` exile a body and what
 * `noteDepthAt` counts. It was never a list of "what is a note". This is.
 *
 * # Order and depth are logical, not textual
 *
 * The rows come out in the order a reader meets them: markers in document
 * order, and a note written inside another note's prose directly beneath its
 * parent — which for a deferred parent means a row from the end of the file
 * appearing next to a marker from page one. The pane indents by `depth`, so
 * ordering any other way would draw a tree whose children are forty rows from
 * their parents. `depth` counts enclosing *notes* by the same logic: prose
 * inside a deferred body is inside that note, wherever the bytes are.
 *
 * # One scanner
 *
 * Both halves come from `spans.ts` (via `deferred.scan` for the pairing). The
 * private bracket walk this replaces was one more scanner of the same markup,
 * and it swept clean past the prohibition that exists to catch them: that
 * sweep looks fourteen lines past a `depth` counter for a bracket literal, and
 * this walk had fifty-five between them. The window is eighty now.
 */
export function notesIn(doc: string): NoteSpan[] {
  const s = scanSpans(doc);
  const { refs, defs } = scanDeferred(doc);

  /** First definition wins, which is the rule the prelude's `_nb_find` uses. */
  const bodyFor = new Map<string, (typeof defs)[number]>();
  for (const d of defs) if (!bodyFor.has(d.name)) bodyFor.set(d.name, d);
  /** A definition by the offset it starts at, to recognise one as an ancestor. */
  const defAt = new Map<number, (typeof defs)[number]>();
  for (const d of defs) defAt.set(d.from, d);

  const spans: NoteSpan[] = [];
  /** By marker offset, which is how an ancestor node is turned back into a note. */
  const byMarker = new Map<number, NoteSpan>();
  /** The first marker for a name — the one whose place on the page the prose takes. */
  const markerFor = new Map<string, NoteSpan>();

  for (const n of s.nodes) {
    if (!opensNoteBody(n.name)) continue;
    const closed = n.bodies.length > 0;
    const body = closed ? n.bodies[n.bodies.length - 1] : unclosedBody(s, n);
    if (!body) continue;
    const span: NoteSpan = {
      from: n.from,
      // An unclosed note ran off the end of the document. Report it as far as it
      // got rather than dropping it: half-typed is the common case.
      to: closed ? n.to : doc.length,
      bodyFrom: body.from,
      bodyTo: body.to,
      hasBody: true,
      command: n.name,
      text: doc.slice(body.from, body.to),
      depth: 0,
      series: seriesOf(n.name, n.args ? doc.slice(n.args.from, n.args.to) : ""),
      deferred: null,
    };
    spans.push(span);
    byMarker.set(span.from, span);
  }

  for (const r of refs) {
    const d = bodyFor.get(r.name);
    const span: NoteSpan = {
      from: r.from,
      to: r.to,
      bodyFrom: d ? d.bodyFrom : r.to,
      bodyTo: d ? d.bodyTo : r.to,
      hasBody: !!d,
      command: r.kind ?? DEFAULT_NOTE_KIND[r.lang],
      text: d ? doc.slice(d.bodyFrom, d.bodyTo) : "",
      depth: 0,
      // A deferred note is a marker in the prose and a body at the end of the
      // file, and it is the **marker** that says which series it prints in.
      series: seriesOf(r.kind ?? DEFAULT_NOTE_KIND[r.lang], r.rest),
      // `defFrom`/`defTo` are -1 until the body is written; `hasBody` says so.
      deferred: { name: r.name, defFrom: d ? d.from : -1, defTo: d ? d.to : -1 },
    };
    spans.push(span);
    byMarker.set(span.from, span);
    if (!markerFor.has(r.name)) markerFor.set(r.name, span);
  }

  /**
   * The note this one is written inside, if any.
   *
   * Walked up `spans.ts`'s containment tree rather than compared against every
   * other note, because a sefer has thousands of notes and the pane re-renders
   * on every keystroke — an all-pairs test would be the quadratic the ribbon
   * was just cured of, in a new place. Two kinds of ancestor count: a note
   * whose own body we are in, and a `#גוף_הערה`, which puts us inside whichever
   * note's marker names it — however far away that marker is.
   */
  const parentOf = (n: NoteSpan): NoteSpan | null => {
    for (let p = s.byStart.get(n.from)?.parent ?? null; p; p = p.parent) {
      const own = byMarker.get(p.from);
      if (own && own !== n) return own;
      const d = defAt.get(p.from);
      if (d) {
        const marker = markerFor.get(d.name);
        return marker && marker !== n ? marker : null;
      }
    }
    return null;
  };

  return arrange(spans, parentOf);
}

/**
 * The marker each note actually printed, or `null` where the page cannot say.
 *
 * One entry per note, in the order given. This is the client half of
 * `engine/src/notemarks.rs`: the engine hands back every marker the layout
 * printed paired with the offset of the prose beside it, and has no idea which
 * of those pairs is a note. This does, because it is holding the scan.
 *
 * # Why the innermost note wins
 *
 * A note written inside another note's prose sits **inside its parent's body
 * range**, textually — `#הערה[אבג#הערה_בדרגה(2)[דהו]]` has the outer body
 * covering the inner call and everything in it. So an offset in `דהו` is inside
 * two notes, and only the deeper one printed a marker beside it. Matching
 * against the first containing note would give the tier-2 note's marker to its
 * parent and lose the parent's own.
 *
 * # Why the earliest offset wins
 *
 * An entry prints its marker and then its body from the beginning, so the pair
 * that lands on a note's *first* words is the one the entry made. The marker
 * printed in the prose is followed by whatever comes after the note — usually
 * ordinary text, which is inside no body and drops out here — but inside a
 * parent's body it is followed by the rest of that parent, which is a real pair
 * about the wrong note. It is always later than the parent's own first word, so
 * taking the earliest settles it without a rule about which kind of pair this is.
 *
 * # Why a missing marker is not filled in
 *
 * A note whose body is empty prints a marker over nothing, so there is no prose
 * to pair with and no honest answer. It comes back `null` and the drawer falls
 * back to counting. The one thing this must never do is produce a plausible
 * number, which is the failure this whole path exists to end.
 */
export function markersFor(
  items: readonly NoteSpan[],
  marks: readonly NoteMarker[],
): (string | null)[] {
  const best = new Map<NoteSpan, NoteMarker>();
  for (const mark of marks) {
    let innermost: NoteSpan | null = null;
    for (const n of items) {
      if (!n.hasBody || mark.at < n.bodyFrom || mark.at >= n.bodyTo) continue;
      // Deeper means written inside, and `depth` is already the answer — worked
      // out by `arrange` over the containment tree rather than by comparing
      // offsets, which is what makes a deferred body's depth right at all.
      if (!innermost || n.depth > innermost.depth) innermost = n;
    }
    if (!innermost) continue;
    const held = best.get(innermost);
    if (!held || mark.at < held.at) best.set(innermost, mark);
  }
  return items.map((n) => best.get(n)?.marker ?? null);
}

/**
 * The body of a note that is still being typed.
 *
 * `spans.ts` gives a call no body until its bracket closes, which is the right
 * answer for a renderer and the wrong one for a list: a half-typed note is the
 * ordinary state of the document a writer is looking at, and dropping it out of
 * the pane mid-word is how a pane teaches people not to trust it. Whether the
 * bracket closed is still `spans.ts`'s answer — `closes` — and not a second
 * opinion about it.
 */
function unclosedBody(s: Scan, n: Node): { from: number; to: number } | null {
  let at = n.to;
  while (s.text[at] === " " || s.text[at] === "\t") at++;
  if (s.text[at] !== "[" || s.closes.has(at)) return null;
  return { from: at + 1, to: s.text.length };
}

/**
 * Depth and reading order, over notes whose prose may sit anywhere.
 *
 * A tree walk rather than a sort, because sorting by offset alone would put a
 * note written inside a deferred body at the bottom of the pane, forty rows
 * from the parent it is indented under.
 */
function arrange(spans: NoteSpan[], parentOf: (n: NoteSpan) => NoteSpan | null): NoteSpan[] {
  const byStart = [...spans].sort((a, b) => a.from - b.from);
  const children = new Map<NoteSpan | null, NoteSpan[]>();
  for (const n of byStart) {
    const p = parentOf(n);
    const list = children.get(p);
    if (list) list.push(n);
    else children.set(p, [n]);
  }

  // A body that contains a marker for itself (`#גוף_הערה("1")[…#הערה_בשם("1")…]`)
  // makes a note its own ancestor — a cycle Typst declines to expand and this
  // must not walk forever. Anything the walk never reaches keeps its place at
  // the end of the list rather than disappearing from it.
  const out: NoteSpan[] = [];
  const seen = new Set<NoteSpan>();
  const walk = (p: NoteSpan | null, depth: number) => {
    for (const n of children.get(p) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      n.depth = depth;
      out.push(n);
      walk(n, depth + 1);
    }
  };
  walk(null, 0);
  for (const n of byStart) if (!seen.has(n)) out.push(n);
  return out;
}

/**
 * The innermost note at `pos`, if any.
 *
 * Either end counts: the marker in the prose and the `#גוף_הערה` at the end of
 * the file are two views of one note, and a right-click on either of them is
 * pointing at the same thing.
 */
export function noteAt(doc: string, pos: number): NoteSpan | null {
  let best: NoteSpan | null = null;
  for (const n of notesIn(doc)) {
    const here =
      (n.from <= pos && pos <= n.to) ||
      (n.hasBody && n.bodyFrom <= pos && pos <= n.bodyTo) ||
      (!!n.deferred && n.deferred.defFrom >= 0 && n.deferred.defFrom <= pos && pos <= n.deferred.defTo);
    if (here && (!best || n.depth > best.depth || (n.depth === best.depth && n.from > best.from))) {
      best = n;
    }
  }
  return best;
}

/**
 * Rewrite one note as a different kind, keeping its text.
 *
 * The consolation prize for §1.4 — a tier-1 collector adopting the note the
 * writer already has is the real fix, and `#הערה` now *is* tier 1, but the band
 * apparatuses (`#מדור_*`, `#מדף_*`) collect their own markers and cannot adopt a
 * native footnote without printing it twice. For those, converting the note in
 * place beats retyping it.
 *
 * For a deferred note the prose does not move: what changes is the marker's
 * `סוג`, because that is the whole of where a deferred note prints. Rewriting
 * the `#גוף_הערה` instead would have produced a document with two notes in it.
 */
export function convertNote(doc: string, note: NoteSpan, command: string): { text: string; caret: number } {
  if (note.deferred) {
    const ref = scanDeferred(doc).refs.find((r) => r.from === note.from);
    if (!ref) return { text: doc, caret: note.from };
    return retargetRef(doc, ref, command);
  }
  const body = doc.slice(note.bodyFrom, note.bodyTo);
  const replacement = `#${command}[${body}]`;
  return {
    text: doc.slice(0, note.from) + replacement + doc.slice(note.to),
    caret: note.from + replacement.length - 1,
  };
}

/**
 * Delete a note and its marker, leaving the surrounding prose joined up.
 *
 * A deferred note is deleted from both ends. Taking the marker alone would
 * leave the prose behind as an orphan — a paragraph at the end of the file that
 * prints nowhere — which is a worse document than the one the writer asked to
 * be rid of.
 */
export function deleteNote(doc: string, note: NoteSpan): { text: string; caret: number } {
  if (note.deferred) {
    const { refs, defs } = scanDeferred(doc);
    const ref = refs.find((r) => r.from === note.from);
    if (!ref) return { text: doc, caret: note.from };
    return removePair(doc, ref, defs.find((d) => d.name === ref.name) ?? null);
  }
  return { text: doc.slice(0, note.from) + doc.slice(note.to), caret: note.from };
}

/**
 * Does the document already end with (or contain) this scaffolding line?
 *
 * Asked in **both spellings**, because the document may be written in either
 * and this decides whether to add the line again. An English document holding
 * `#endnotes()` answered "no" to `#הערות_בסוף` and got a second dump call in
 * the other language — two apparatus footers, one document, and the second one
 * printing the notes a second time.
 */
export function hasLine(doc: string, line: string): boolean {
  const head = line.split("(")[0].trim();
  if (!head) return false;
  return (
    doc.includes(head) ||
    doc.includes(translated(head, "he")) ||
    doc.includes(translated(head, "en"))
  );
}

/**
 * Every line a destination needs before its notes will print, in order.
 *
 * Two of them, and forgetting either is the same failure — *collected and never
 * rendered*, the one this application has performed on its own writers twice and
 * then reported back to them as a lint:
 *
 *   - **the placement.** A destination is a stream and a stream has to be told
 *     where it prints. `#ערוץ("סוף", מיקום: "סוף")` is that, and it is written
 *     once per document rather than once per note — which is the whole payoff of
 *     the model, because moving three hundred haaros to the back is then this
 *     one word.
 *   - **the dump call.** A stream that is not at the page foot is *collected*,
 *     and collected notes print where `#הצג_אזור` asks for them and nowhere
 *     else.
 *
 * The page foot needs neither: the default channel already lives there, which is
 * why `pickLine` writes a bare `#הערה[…]` for it.
 *
 * **Derived from `PLACEMENTS`, not hand-listed.** The engine validates a
 * placement against `_ch_places` and panics on one it does not know, so a line
 * written for a destination the engine cannot yet place would stop the compile
 * rather than move a note. `PLACEMENTS` is this side's copy of that set, held
 * against the prelude in both directions by `enginefacts.test.mjs` — so this
 * grows a destination the day the engine does, and refuses to write markup the
 * engine would reject in the meantime. `channels.caveatsFor` is what tells the
 * writer, in words, that the destination is not placed yet.
 */
export function destinationLines(
  pick: NotePick,
  lang: "he" | "en" = "he",
  /**
   * Where the region prints, for a pick that names one — `channels.
   * regionPlacement` against the document, or the placement a preset is about
   * to declare.
   *
   * It decides whether the region needs a dump call at all, and getting it
   * wrong is wrong in both directions: a region at the page foot is painted by
   * the page furniture, so calling for it renders its notes a second time, and
   * a region anywhere else prints only where it is called for.
   */
  regionPlace: Placement = "רגל",
): { head: string[]; tail: string[] } {
  const name = destinationChannelName(pick, lang);
  if (!name) return { head: [], tail: [] };
  const place = pick.dest === "region" ? null : destinationOf(pick.dest).channel;
  // A region is declared in the page-layout surface and carries its own
  // placement; this only makes sure the block gets printed.
  if (pick.dest === "region") {
    return { head: [], tail: regionPlace === "רגל" ? [] : [showRegionLine(name, lang)] };
  }
  if (!place || place === "רגל") return { head: [], tail: [] };
  if (!(PLACEMENTS as readonly string[]).includes(place)) return { head: [], tail: [] };
  return {
    head: [channelLine(name, { placement: place as (typeof PLACEMENTS)[number] }, lang)],
    tail: [showRegionLine(name, lang)],
  };
}

/**
 * Add whatever a destination needs, if the document has not got it already.
 *
 * Separate from `applyPick` because **inserting a note is not the only way a
 * document acquires one.** Right-clicking a footnote and sending it to the back
 * produced a stream with nothing printing it — the same failure by a different
 * door — so the conversion path runs this too, and there is one answer to "what
 * does this destination need" rather than one per entry point.
 *
 * A preset's region comes first, because the dump call for a region the document
 * has not declared is a call naming nothing.
 */
export function scaffold(
  doc: string,
  caret: number,
  pick: NotePick,
  /** What the page direction says, for a document that has said nothing yet. */
  whenSilent: "he" | "en" = "he",
  /** The preset this pick came from, when it came from one. */
  preset: Preset | null = null,
  /**
   * The marker that was actually written, when it was not the pick's own.
   *
   * The collecting commands — `#הערתסיום`, `#מדור_א…ז` — are still in the
   * registry and still work, and each needs a dump call of its own or its prose
   * is collected and never printed. `apparatus.dumpFor` is the one place that
   * knows which, and the lint reads the same rules from the other side: a writer
   * who reaches for one of these by name gets the command they asked for *and*
   * the call that renders it, rather than the command they asked for and a
   * warning about it.
   */
  marker: string | null = null,
): { text: string; caret: number } {
  // Every string a destination writes is spelt in the *document's* language, not
  // in the one this table happens to be written in. A scaffolding line is source
  // the writer has to read and edit, and Hebrew lines wrapped around an English
  // document is the report *"everything is coming in in Hebrew"* with the
  // application doing the inserting.
  //
  // Derived from the document rather than passed in, for the reason `insertionAt`
  // gives about the same decision: the callers forgot the mode three separate
  // times in one day, and there is no version of "each surface remembers" that
  // survives a fourth surface.
  const lang = docLang(doc, caret, whenSilent);
  const made = preset ? presetLines(preset, lang) : { head: [], tail: [] };
  // A preset declares its region in this same act, so its placement is the one
  // to ask about — the document does not carry it yet.
  const rgPlace =
    preset?.makes?.placement ?? (pick.region ? regionPlacement(doc, pick.region) : "רגל");
  const needed = destinationLines(pick, lang, rgPlace);
  let text = doc;

  // First line of the file, before anything else: a `#ערוץ` line is read with
  // `.final()` and may sit anywhere, but a region declaration is not, and a
  // reader looks for a document's apparatus at the top either way.
  for (const line of [...made.head, ...needed.head].reverse()) {
    if (scaffoldPresent(text, line)) continue;
    text = line + "\n\n" + text;
    caret += line.length + 2;
  }

  const named = marker ? /^#([A-Za-z0-9֐-׿_]+)/u.exec(marker)?.[1] : null;
  const legacy = named ? dumpFor(canonicalName(named), lang) : null;
  for (const line of [...made.tail, ...needed.tail, ...(legacy ? [legacy] : [])]) {
    if (scaffoldPresent(text, line)) continue;
    text = text.replace(/\s*$/, "") + "\n\n" + line + "\n";
  }
  return { text, caret };
}

/**
 * Is this destination's block already printed somewhere in the document?
 *
 * Asked of the *region*, not of the line, because `hasLine` compares command
 * names and a document with two regions has two `#הצג_אזור` calls that differ
 * only in their argument. Answering "yes, there is a dump call" for the wrong
 * one is the collected-and-never-rendered failure with an alibi.
 */
export function regionShown(doc: string, name: string): boolean {
  return regionsShownIn(doc).some((r) => r.region === name);
}

/**
 * Does the document already carry this scaffolding line?
 *
 * **By the call it is, not by the command it starts with.** `hasLine` compares
 * command *names*, which is right for `#הערות_בסוף()` — there is one of those
 * per document — and wrong for every line this model writes, because they all
 * name something: a document with notes at the back and notes at the end of each
 * section wants **two** `#ערוץ` lines and two `#הצג_אזור` calls, differing only
 * in their argument.
 *
 * Asked the loose way, the second destination got no placement line and no dump
 * call: its notes were collected into a stream the engine had never been told
 * where to print, and never rendered. That is the failure this application has
 * performed on its own writers twice already, arriving a third time through the
 * one function whose job is to prevent it.
 *
 * Both spellings, because the document may be written in either.
 */
function scaffoldPresent(doc: string, line: string): boolean {
  const command = /^#([A-Za-z0-9֐-׿_]+)/u.exec(line)?.[1];
  const name = /"([^"]*)"/u.exec(line)?.[1];
  if (!command) return false;
  // A call with no name is a whole-document line — the legacy dump calls — and
  // one of those per document is the answer `hasLine` was written for.
  if (name === undefined) return hasLine(doc, line);
  return declarationsIn(doc, canonicalName(command)).some((d) => d.name === name);
}

/**
 * The destinations a note that already exists could be sent to instead.
 *
 * The right-click menu's list, and it is the whole conversion story now: a note
 * does not change *command* to move, it changes **argument**. `#הערתסיום`,
 * `#מדור_א` and `#הערת_גיליון` were eighteen commands for what is one command
 * and one word, and offering a writer a list of near-identical Hebrew names was
 * the original complaint this work answers.
 *
 * Its own destination is excluded, because a conversion that changes nothing is
 * a menu item that lies. The regions come from the document, so the list is the
 * *document's* rather than a fixed menu.
 */
export function destinationTargets(doc: string, note: NoteSpan): NotePick[] {
  const own = noteDestination(doc, note);
  const out: NotePick[] = [];
  for (const d of ["foot", "end", "section", "side", "file"] as const) {
    if (own.dest === d) continue;
    out.push({ dest: d, region: null });
  }
  for (const r of regionsIn(doc)) {
    if (own.dest === "region" && own.region === r.name) continue;
    out.push({ dest: "region", region: r.name });
  }
  return out;
}

/**
 * Where a note in the document is printing now.
 *
 * Off the note's own call, through the one reader — `channels.pickFor` — rather
 * than by a second parse of the same markup here. `NoteSpan` already carries the
 * series the note is numbered in for the same reason.
 */
export function noteDestination(doc: string, note: NoteSpan): NotePick {
  const n = scanSpans(doc).byStart.get(note.from);
  const args = n?.args ? doc.slice(n.args.from, n.args.to) : "";
  return pickFor(note.command, args);
}

/**
 * Send an existing note to a different destination, keeping its prose.
 *
 * The argument changes and the command does not, which is the difference between
 * this model and the eighteen it replaced: a note is `#הערה[…]` wherever it
 * prints, so moving it is an edit to one word and never a retype.
 *
 * For a deferred note the prose does not move either — what changes is the
 * marker, because the marker is the whole of where a deferred note prints.
 */
export function retargetNote(
  doc: string,
  note: NoteSpan,
  pick: NotePick,
  whenSilent: "he" | "en" = "he",
): { text: string; caret: number } {
  const lang = docLang(doc, note.from, whenSilent);
  if (note.deferred) {
    const ref = scanDeferred(doc).refs.find((r) => r.from === note.from);
    if (!ref) return { text: doc, caret: note.from };
    // The destination rides on the marker as a named argument, so moving a
    // deferred note is a rewrite of one argument in `rest` and nothing else —
    // the prose at the end of the file is not touched, and the note keeps its
    // layout, its name and every other argument it was carrying.
    return retargetRef(doc, ref, ref.kind ?? DEFAULT_NOTE_KIND[ref.lang], destRest(ref.rest, pick, lang));
  }
  const body = doc.slice(note.bodyFrom, note.bodyTo);
  const marker = pickLine(pick, lang).replace("|", "");
  const replacement = marker.replace(/\[\]$/, "[" + body + "]");
  return {
    text: doc.slice(0, note.from) + replacement + doc.slice(note.to),
    caret: note.from + replacement.length - 1,
  };
}

/**
 * A deferred marker's other arguments, with its destination replaced.
 *
 * `deferred.ts` deliberately does not know the destination vocabulary — a second
 * module knowing it is how two spellings of one rule get written — so it hands
 * back `rest` verbatim and this puts the one argument back, through
 * `channels.destinationArg`, which is the only thing that spells it.
 */
function destRest(rest: string, pick: NotePick, lang: "he" | "en"): string {
  const kept = rest
    .replace(/(?:^|,)\s*(?:ערוץ|channel|אזור|region)\s*:\s*"[^"]*"/gu, "")
    .replace(/^\s*,/, "")
    .trim()
    .replace(/,\s*$/, "");
  return [kept, destinationArg(pick, lang)].filter(Boolean).join(", ");
}

/**
 * Write a note into the document. The only place that does.
 *
 * Returns the new text plus where the caret should land.
 */
export function applyPick(
  doc: string,
  selectionFrom: number,
  pick: NotePick,
  deferred = false,
  /**
   * The writer's selection, when they had one.
   *
   * A toolbar button pressed with text selected wraps that text — which is what
   * every word processor does. Routing the toolbar through this producer would
   * have quietly dropped it, so the producer learns about selections instead.
   *
   * `marker` overrides what the pick would have written: a tiered note is the
   * same destination as an ordinary one and wants the same scaffolding, but not
   * the same command.
   *
   * With deferred bodies the selected text goes into the *body* at the end of the
   * file, not into the marker: the marker is a name, and there is nothing to wrap
   * there.
   */
  sel: { to?: number; text?: string; marker?: string } = {},
  /** What the page direction says, for a document that has said nothing yet. */
  whenSilent: "he" | "en" = "he",
  /**
   * Whether the deferred bodies at the foot of the file are kept in one block
   * per apparatus.
   *
   * Threaded down to `fileNewBody` rather than read from a setting here, because
   * this module has never imported one — and because the option is only true
   * tomorrow if the *filing* knows about the blocks. A tidy that groups and an
   * insertion that appends is a setting that lies about itself the first time the
   * writer adds a note.
   */
  grouped = false,
  /** The preset this pick came from, whose region has to exist first. */
  preset: Preset | null = null,
  /** Where the prose goes in the file. See `deferred.BODY_HOMES`. */
  home: BodyHome = "file",
): { text: string; caret: number; errand?: Errand } {
  const lang = docLang(doc, selectionFrom, whenSilent);
  // Spelt in the document's language before anything else happens to it, so the
  // deferred pair, the caret arithmetic and `scaffold`'s own reading of the
  // document all see the string that is actually going in.
  //
  // A pick is built in the target language rather than translated into it, and
  // that is not a shortcut: a **region's name is the writer's own word**, and
  // `translated` localises whole string values on purpose — so a note sent to
  // `#הערה(אזור: "מקורות")` would have come out `#fnote(region: "Sources")`,
  // naming a region that does not exist. A marker handed in from a toolbar is a
  // snippet of ours and still goes through the table.
  const chosen = sel.marker ? translated(sel.marker, lang) : pickLine(pick, lang);
  // Where the prose is written is orthogonal to where the note prints, so it is a
  // rewrite of the snippet rather than a seventh destination: the same six picks,
  // each available with the prose anywhere the writer keeps it.
  //
  // Named once and kept, because the body has to be filed *next to its own
  // marker* and cannot ask which name that was after the fact.
  const name = deferred ? nextName(doc) : "";
  const pair = deferred ? deferSnippet(chosen, name) : null;
  const taken = sel.text ?? "";
  const bare = pair ? pair.marker : chosen;
  // Through the same door every other insertion uses.
  //
  // `insertionAt` is the function that knows a document has *modes*: inside
  // `#רשימה(…)` or `#טבלה(…)` the caret is already in code, where a leading `#`
  // is not a hash but a syntax error, and an element spliced between two others
  // needs its comma. Every other command learned this when the insertion sweep
  // found 384 broken documents; the note path did not, because `plan`
  // short-circuits here — and 288 of 1,248 swept documents did not compile.
  //
  // Applied to the marker only, and deliberately. The `|` passes through
  // untouched — that is `insertionAt`'s contract — so the caret arithmetic below
  // is unchanged. The *body* is a different question: it is filed at top level,
  // which is never code mode, so putting it through here would add a comma to a
  // line that has no argument list.
  const snippet = insertionAt(doc, selectionFrom, bare, sel.to ?? selectionFrom, whenSilent);
  const filled = pair ? snippet : snippet.replace("|", taken + "|");
  const caretInSnippet = filled.indexOf("|");
  const clean = filled.replace("|", "");

  const to = Math.max(selectionFrom, sel.to ?? selectionFrom);
  let text = doc.slice(0, selectionFrom) + clean + doc.slice(to);
  let caret = selectionFrom + (caretInSnippet < 0 ? clean.length : caretInSnippet);

  ({ text, caret } = scaffold(text, caret, pick, whenSilent, preset, sel.marker ?? null));

  // The body last, so it is filed *after* the destination's own scaffolding
  // rather than being pushed below it — and the caret follows the writer to it,
  // since the prose is what they are about to type.
  if (pair) {
    const body = pair.body.replace("|", taken + "|");
    // The name, which is the whole reason `fileNewBody` takes one. Without it
    // `neighbours` has nothing to place this body relative to and falls through
    // to "after the last one", so bodies come out in the order they were created
    // rather than the order their markers are read in.
    const filed = fileNewBody(text, body.replace("|", ""), name, grouped, home, caret);
    text = filed.text;
    // A body filed in a companion document is not in this text, so there is
    // nothing here for the caret to land on: it stays where the marker was
    // written, and `fileNewBody` says so by handing `near` straight back.
    caret = filed.errand ? filed.at : filed.at + body.indexOf("|");
    if (filed.errand) return { text, caret, errand: filed.errand };
  }

  return { text, caret };
}
