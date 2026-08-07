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
 * Action id → the Hebrew name of the command it inserts.
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
} as const;

/** The action ids that insert a registry command. */
export type CommandAction = keyof typeof ACTION_COMMAND;
