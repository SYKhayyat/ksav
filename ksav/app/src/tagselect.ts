// Selecting a tag, from a click on its bracket or from a key.
//
// #84 makes nesting legible; this makes it grabbable. #84's guide says a note is
// three levels deep, and the obvious next want is *"select that note"* — which
// today is a careful drag from a column you are guessing at, on a line you are
// guessing the width of.
//
// Three ways in, and one range underneath all of them:
//
//   · **click** an opening `[` — selects per the setting (`body` or `whole`)
//   · **`Alt`+click** — always selects the other one, so both are reachable
//     without ever touching the setting
//   · **two key bindings**, one per answer, in `DEFAULT_KEYS` like every action
//
// # Two sources of truth that already exist
//
// `scan()` pairs delimiters into `Frame { open, close }`. `delimiters()` walks the
// same document and reports every bracket with an `opener` flag. Both know which
// `]` closes which `[`, they were written separately, and `deferred.ts:1520`
// records what happens when two answers to "where does this end?" sit next to each
// other: a rewriter silently reshaped the writer's own source and nothing said so.
//
// So this module reads **one** of them — `scan()`, which already skips comments
// and code samples, where a `[` is prose — and `brackets-agree.test.mjs` asserts
// the other one reaches the same answer for every tag in a document. Not a
// comment. A test, on every bracket in the file.

import { scan, type Frame } from "./spans";
import type { Extension, TransactionSpec } from "@codemirror/state";
import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** Which of the two answers a selection should be. */
export type TagSelection = "body" | "whole";

/** What `Alt`+click does to the setting: give me the other one. */
export const otherSelection = (mode: TagSelection): TagSelection =>
  mode === "body" ? "whole" : "body";

/**
 * A tag, as a range.
 *
 * `body` is the words between the brackets — selecting it and typing replaces the
 * note's contents and leaves the note a note. `whole` is the call including its
 * brackets, which is what *moving* a note needs, and which is why typing over it
 * has to put the brackets back: see `typingRestoresBrackets`.
 */
export interface TagRange {
  /** Between the brackets, brackets excluded. `from === to` for `#הערה[]`. */
  body: { from: number; to: number };
  /** The whole call, `#הערה[…]`, brackets included. Equals `body` for a bare group. */
  whole: { from: number; to: number };
  /** The command that owns the tag; `""` for a bare `[…]`. */
  name: string;
  /** The frame, so a caller can ask whether it ever closes. */
  frame: Frame;
  /**
   * Does this tag have a `]`?
   *
   * Settled once, here, because this is the only place the document's own length
   * is known — `Frame.close` is `text.length` for a group that never closes, so
   * the question cannot be answered by looking at the frame alone afterwards.
   */
  closed: boolean;
}

/** The selection `mode` means, as a range into the document. */
export function rangeFor(tag: TagRange, mode: TagSelection): { from: number; to: number } {
  return mode === "body" ? tag.body : tag.whole;
}

/**
 * The tag whose **opener `[`** sits at `pos`, or `null`.
 *
 * This is the click entry point and it is deliberately strict: `pos` must be the
 * `[` itself. A click just inside the brackets is a click on prose — the writer
 * put their caret there to write words, and stealing that would be the same
 * mistake as stealing a click on any other character.
 *
 * Only `[`. Not `(`, not `{`: #86 is about *tags*, and a parenthesis in a sentence
 * is a parenthesis in a sentence.
 */
export function tagAtOpener(doc: string, pos: number): TagRange | null {
  const s = scan(doc);
  for (const frame of s.frames) {
    if (frame.open === pos && doc[pos] === "[") return tagOf(s, frame, doc.length);
  }
  return null;
}

/**
 * The innermost tag **containing** `pos`, or `null` when the caret is in none.
 *
 * The key-binding entry point, where there is no clicked bracket to go on. The
 * innermost wins for the same reason `structureAt` says so (`structure.ts:1003`):
 * the tag you are writing inside is the one you meant.
 *
 * ## Why this reads `frames` and not `Node.bodies`
 *
 * `Node.bodies` is empty for a tag that never closes — measured, `#הערה[לא נסגר`
 * scans to `bodies: []` while its frame runs `open 5 → close 13`. A body range
 * that a half-written note does not have cannot be the source for "where am I?",
 * and `spans.ts:250` is explicit that half of `#רשימה(` is the **normal state of a
 * document being written** and every path has to answer while it is. The frames
 * are always there, closed or not.
 */
export function tagContaining(doc: string, pos: number): TagRange | null {
  const s = scan(doc);
  let best: TagRange | null = null;
  for (const frame of s.frames) {
    if (doc[frame.open] !== "[") continue;
    // `close` is already `text.length` for a group nothing closes, so `<=` here is
    // what puts a caret at the very end of the document *inside* the note whose
    // words run up against that end.
    if (!(frame.open < pos && pos <= frame.close)) continue;
    const tag = tagOf(s, frame, doc.length);
    // Innermost: the smallest group that still contains the caret.
    if (!best || tag.body.to - tag.body.from <= best.body.to - best.body.from) best = tag;
  }
  return best;
}

/**
 * A frame as a `TagRange`, finding the command that owns it.
 *
 * # `Math.max(owner.to, frame.close)` is not defensive coding
 *
 * For a closed tag the node already ends at its `]`, and the two agree. For an
 * unclosed one the node stops **at the `[`** — `#הערה[לא נסגר` scans to a node of
 * `0…5`, before a single word of the note it is opening. So the node's `to` cannot
 * be the end of a tag that does not end yet, and the frame's `close` can. Taking
 * the larger of the two gives the same number for the common case and the right
 * one for the case that only happens while somebody is typing.
 */
function tagOf(s: ReturnType<typeof scan>, frame: Frame, docLength: number): TagRange {
  let owner: { from: number; to: number; name: string } | null = null;
  for (const node of s.nodes) {
    // Outermost-first in document order, so the last match is the innermost call
    // the opener belongs to — which is the command, not some `#let` around it.
    if (node.from <= frame.open && frame.open <= node.to) owner = node;
  }
  const from = owner ? owner.from : frame.open;
  const to = owner ? Math.max(owner.to, frame.close) : frame.close;
  return {
    body: { from: frame.open + 1, to: Math.min(frame.close, docLength) },
    whole: { from, to },
    name: frame.name,
    frame,
    closed: frame.close < docLength,
  };
}

/**
 # Typing over a whole-tag selection puts the brackets back.

 Decided, and unchanged: selecting `#הערה[…]` whole and typing over it would
 otherwise leave plain text where a note was. That is `brackets.ts:3`'s *"the
 worst moment in Ksav"* happening **as a feature** — the one place this application
 is allowed to delete a bracket silently should be the one place it never does.

 So a whole-tag selection types back as `#הערה[` + what you typed + `]`.

 And the test that holds this is not "the brackets are still there afterwards",
 which a string comparison proves while the selection has quietly become a cursor.
 It is that the replacement is **symmetric**: apply it, and the tag is still a tag
 with the same body — so undo, re-select and delete all still work, because the
 thing on screen was never a bare string.

 ## Why `whole` only

 Selecting the **body** and typing should replace the words and nothing else.
 Wrapping body-typed text back in brackets would put a note inside every note the
 writer ever retyped one word in, which is not a restore — it is a second edit
 nobody asked for. The rule is about not *losing* structure, never about adding
 it.
 */
export function typingRestoresBrackets(
  tag: TagRange,
  mode: TagSelection,
  text: string,
): TransactionSpec | null {
  if (mode !== "whole") return null;
  // No `]` to put back. Printing one the writer never typed is the mirror image of
  // the bug this rule exists to prevent: inventing structure rather than losing it.
  if (!tag.closed) return null;
  const open = `[`;
  const close = `]`;
  const head = tag.name ? `#${tag.name}${open}` : open;
  return {
    changes: { from: tag.whole.from, to: tag.whole.to, insert: `${head}${text}${close}` },
  };
}

// The selection made by a click or a key, remembered so that typing over it can be
// recognised as typing over *this* thing rather than over an arbitrary range the
// writer dragged to exactly the same offsets.
const TAG_SELECTION = StateEffect.define<{ from: number; to: number; mode: TagSelection } | null>();

/** Set by `selectTag`; read by the input handler. Cleared on any other selection. */
const tagSelectionField = StateField.define<{ from: number; to: number; mode: TagSelection } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(TAG_SELECTION)) return e.value;
    // Any selection the writer made themselves stops being ours. A `Transaction`
    // reports a changed selection as `tr.selection` being set at all — there is no
    // `selectionSet` on this type — and the field is cleared by moving the caret,
    // which is what must happen when the writer clicks elsewhere by hand.
    if (tr.selection && !tr.isUserEvent("selectTag")) return null;
    return value;
  },
});

export const setTagSelection = TAG_SELECTION;

/**
 * The transaction that selects `tag` as `mode`.
 *
 * A spec rather than a dispatch, so the selection can be built and read in a test
 * with no view in it — and so there is exactly one place that knows what selecting
 * a tag *is*, whether the writer clicked, pressed a key, or ran a macro.
 */
export function tagSelectionSpec(tag: TagRange, mode: TagSelection): TransactionSpec {
  const { from, to } = rangeFor(tag, mode);
  return {
    selection: EditorSelection.range(from, to),
    // Marked, so typing over it can tell a tag selection from a range the writer
    // dragged to exactly the same offsets.
    effects: TAG_SELECTION.of({ from, to, mode }),
    scrollIntoView: true,
  };
}

/** Select `tag` as `mode` in `view`. */
export function selectTag(view: EditorView, tag: TagRange, mode: TagSelection): boolean {
  view.dispatch(tagSelectionSpec(tag, mode));
  return true;
}

/**
 * Do the click-and-type wiring. Kept apart from the pure geometry above so that
 * everything above can be tested without a `DOM`, which this suite has none of.
 */
export function tagSelectExtension(mode: () => TagSelection): Extension {
  return [
    tagSelectionField,
    // `Alt` is free here: `main.ts:10810` and `main.ts:14235` both let modified
    // keys through so `Mod-S` still saves with a hydra up, and `Shift`+click
    // already selects a range in the preview (`jump.ts:isPlainClick`) — it had a
    // job before this.
    EditorView.domEventHandlers({
      mousedown(event) {
        if (event.button !== 0) return false;
        const pos = (event.target as HTMLElement | null)?.closest?.(".cm-content")
          ? this.posAtCoords({ x: event.clientX, y: event.clientY })
          : null;
        if (pos == null) return false;
        const doc = this.state.doc.toString();
        const tag = tagAtOpener(doc, pos);
        if (!tag) return false;
        event.preventDefault();
        selectTag(this, tag, event.altKey ? otherSelection(mode()) : mode());
        return true;
      },
    }),
    EditorView.inputHandler.of((view, from, to, text) => {
      const marked = view.state.field(tagSelectionField, false);
      if (!marked || !text) return false;
      // Only ours, and only if the writer has not moved the caret since.
      if (from !== marked.from || to !== marked.to) return false;
      const tag =
        marked.mode === "whole" ? tagContaining(view.state.doc.toString(), from) : null;
      if (!tag) return false;
      const spec = typingRestoresBrackets(tag, marked.mode, text);
      if (!spec) return false;
      view.dispatch({ ...spec, userEvent: "input.type" });
      return true;
    }),
  ];
}