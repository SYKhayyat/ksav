// Which registry command each shell action inserts.
//
// # The finding
//
// `ACTIONS` in `main.ts` held a hand-written second copy of the registry's
// insertion snippets, and the two had already drifted:
//
//     commands.rs:89   cmd!("רשימה", …, "#רשימה(\n  פריט[|],\n  פריט[],\n)")
//     main.ts:427      { id: "bullets", run: () => insertSnippet("#רשימה(\n  פריט[|],\n)") }
//
// Clicking the toolbar's • gave you a two-item list. Pressing Ctrl+Shift+8 gave
// you a one-item list. Same operation, same product, two documents — and
// `buildToolbar` twenty lines further down was already doing it the right way,
// so both conventions lived in one file.
//
// The previous report's fix — one registry, plus a fence — was correct and
// worked *wherever it was applied*. What it could not do is reach `main.ts`, the
// one module no test can see. So the repository ended up with one source of
// truth and a hand-typed copy beside it.
//
// # Why this is a module and not a table inside `main.ts`
//
// Two reasons, and the second is the load-bearing one.
//
// It can be tested. `actions.test.mjs` checks every name here against
// `commands.rs` itself, so renaming a command in Rust turns the toolbar red
// instead of leaving a button that silently falls back to a stale string.
//
// And `enginefacts.test.mjs` sweeps `src/` for any module holding a Hebrew
// command name beside its English twin — a second copy of the pairing the
// prelude already makes. Putting these fifteen Hebrew names into `main.ts`
// tripped it immediately, because `main.ts` already contains `"bold"`,
// `"table"`, `"toc"`, `"center"` and the rest as *action ids*, and eight of
// those ids are spelled exactly like the English command they invoke. The sweep
// could not tell an action id from a command name, and it was right not to
// try: the cure is that the two lists stop living in one file.

/**
 * Action id → the Hebrew name of the command it is the door to.
 *
 * All but one of them insert it at the caret; see [`PLACED_COMMANDS`] for the
 * one that places it instead. Either way this is the pairing, and it is what
 * lets a menu row for a command print the key that also runs it.
 *
 * Hebrew only, deliberately. The English spelling is the *prelude's* to make
 * (`#let bold = הדגשה`), `engine.gen.ts` mirrors it, and writing it here again
 * would be the third statement of one fact.
 *
 * The keys are unquoted because they are identifiers in this table, not strings
 * about commands — which is also what keeps the pairing sweep able to read this
 * file honestly rather than by exemption.
 */
export const ACTION_COMMAND = {
  bold: "הדגשה",
  italic: "נטוי",
  underline: "קו_תחתון",
  footnote: "הערה",
  // Routed through `insertSnippet` like everything else, so it arrives with its
  // scaffolding — the `#הערות_בסוף()` dump, without which every endnote in the
  // document is collected and never printed.
  endnote: "הערתסיום",
  // The margin note, which the product has always been able to set and has
  // never had a door to.
  //
  // The ribbon's third note button was `#הערת_צד` — which is a **callout**, a
  // blue emphasis box (`commands.rs:229`, category `block`), sitting between the
  // footnote and the endnote where its Hebrew name reads "side note". So a
  // writer who wanted a note down the margin pressed it and got a blue box,
  // while `#הערת_גיליון` — the real thing — was reachable only by finding the
  // Notes chooser and knowing to look under "margin".
  //
  // That is the second time this exact group has done this. The comment above
  // it in `main.ts` describes the first: `⁑` held the button for a cosmetic
  // alias while the real tiered note had none.
  //
  // Routed through `insertSnippet` like the endnote, and for the same reason:
  // the margin layout carries a `wrap` (`#עם_הערות_צד[…]`), and a bare splice of
  // `#הערת_גיליון[…]` compiles into a document that prints nothing in the margin.
  sidenote: "הערת_גיליון",
  h1: "כותרת1",
  h2: "כותרת2",
  h3: "כותרת3",
  bullets: "רשימה",
  numbered: "ממוספרת",
  table: "טבלה",
  toc: "תוכן",
  center: "מרכז",
  right: "ימין",
  left: "שמאל",
  // Two of the breaks whose command is spliced in at the caret and generated a
  // door from this table. `lineBreak` also has a key now but stays in
  // `BREAK_COMMAND` with `columnBreak`, and its door is hand-listed in the shell
  // beside `hiddenBreak`. See `BREAKS` for the whole family and the fence on it.
  paraBreak: "מעבר_פסקה",
  pageBreak: "מעבר_עמוד",
} as const;

/** The action ids that insert a registry command. */
export type CommandAction = keyof typeof ACTION_COMMAND;

/**
 * The doors that do **not** splice their command in at the caret.
 *
 * `#תוכן()` goes after the title block and there may only ever be one of
 * them, which is a placement rather than an insertion — so `toc` runs
 * `headings.addContents` and the generated `insertSnippet` door is skipped for
 * it. Listed here rather than left as a special case in the shell so that the
 * exception is one line in the same table as the rule, and so a test can hold
 * the shell to it: an id in here must have a hand-written action, and an id not
 * in here must not.
 */
export const PLACED_COMMANDS: readonly CommandAction[] = ["toc"];

/**
 * The breaks, in order of how much of the page they move.
 *
 * # One question asked five ways
 *
 * A single newline in the source is a **space** on the page. That is Typst's
 * rule, it is right, and it is the one thing about writing here that surprises
 * everybody arriving from Word — because it means the shortest way to any
 * visible break is *two* lines. Each of these is one line, and they differ only
 * in what the page does with it: nothing at all, a line, a paragraph, a column,
 * a page.
 *
 * # Why this list exists rather than five rows written out
 *
 * Two of the five had no door of any kind. `#מעבר_עמוד` — the break every writer
 * arrives already knowing — was reachable only by *name*, from the registry
 * section at the bottom of the Insert menu, which is to say reachable by
 * somebody who already knew Ksav had it; `#מעבר_טור` was in the same position.
 * The two that did have keys were in a named row that printed neither.
 *
 * So this is the list, and `actions.test.mjs` holds it against the registry:
 * **every command in the engine whose name begins `מעבר_` must be in here.** A
 * sixth break added to the prelude goes red until it has a door, which is the
 * only arrangement in which "every break is reachable" is a fact rather than
 * something that was true on the day somebody checked.
 *
 * `hiddenBreak` leads and is not a registry command at all — it is a comment
 * pair the editor writes, so the break is in the source and never on the page.
 * It belongs to the family by what it answers, which is the same question.
 */
export const BREAKS: readonly string[] = [
  "hiddenBreak",
  "lineBreak",
  "paraBreak",
  "columnBreak",
  "pageBreak",
];

/**
 * The command each break inserts, for the three that are not in
 * [`ACTION_COMMAND`] because they carry no key.
 *
 * Kept apart from that table rather than folded into it, because the invariant
 * there is load-bearing and worth keeping literal: an id in `ACTION_COMMAND` has
 * a shipped binding, and `actions.test.mjs` asserts it. A break with a row and no
 * key is a legitimate thing to be; an entry in that table with no key is the
 * drift it exists to prevent.
 */
export const BREAK_COMMAND: Readonly<Record<string, string>> = {
  lineBreak: "מעבר_שורה",
  columnBreak: "מעבר_טור",
  // Read off the pairing rather than restated, so the two tables cannot disagree
  // about which command a key and a row both reach.
  paraBreak: ACTION_COMMAND.paraBreak,
  pageBreak: ACTION_COMMAND.pageBreak,
};

/**
 * The mark each break's row is drawn with.
 *
 * Beside the list rather than in the shell, so that the fence which says every
 * break has a door can also say every door has a face — a row rendering
 * `undefined` beside its name is the shape a hand-kept list fails in, and this
 * list exists because two of these had no row at all.
 */
export const BREAK_GLYPH: Readonly<Record<string, string>> = {
  hiddenBreak: "⏎",
  lineBreak: "↵",
  paraBreak: "¶",
  columnBreak: "⇥",
  pageBreak: "⤓",
};

/** The same table read the other way, built once. */
const BY_COMMAND: Record<string, CommandAction> = Object.fromEntries(
  Object.entries(ACTION_COMMAND).map(([id, he]) => [he, id as CommandAction]),
);

/**
 * The action that inserts this command, if one does.
 *
 * For the menus, so that a row offering `#הדגשה` prints the key that also
 * inserts it. They printed nothing: the Insert menu showed the command name in
 * a `<code>` and left the shortcut column empty for all 122 rows, while
 * `Ctrl+B`, `Ctrl+I`, `Ctrl+U`, `Ctrl+E` and nine more were live the whole time.
 * A shortcut nobody can find is the same as no shortcut, and the place a writer
 * looks for one is beside the thing it does.
 *
 * The name is the Hebrew one because that is the side `ACTION_COMMAND` states —
 * the English spelling is the prelude's, and asking for it here would be a
 * second statement of the pairing. Callers hold a `CommandDef`, which carries
 * both.
 */
export function actionForCommand(he: string): CommandAction | undefined {
  return BY_COMMAND[he];
}
