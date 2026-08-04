// The keyboard bindings, out of the god module and under test (B31, B36).
//
// > *"The pattern is the tell: in Ksav, every module that got extracted got tested,
// > and the god module didn't."*
//
// These twenty-nine bindings lived in `main.ts`, which is 3,400 lines and had no
// test file. Two rules were in there with them and both are the kind that go wrong
// quietly: which aliases still apply once a writer has rebound things, and which
// action already holds a combination.

import { check, ok, notOk } from "./harness.mjs";
import {
  DEFAULT_KEYS,
  KEY_ALIASES,
  keybindingsFrom,
  aliasesInForce,
  whoHolds,
  readable,
} from "../.tmp-test/bindings.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";

export function run() {

  // ------------------------------------------------------------ the shipped table
  ok("there are bindings", Object.keys(DEFAULT_KEYS).length > 20);

  // Two actions on one combination is a keystroke whose effect depends on which
  // list was read first — undebuggable from the writing side. The settings panel
  // refuses to create one; this asserts none ships.
  {
    const keys = Object.values(DEFAULT_KEYS);
    check("no two actions ship on one combination", new Set(keys).size, keys.length);
  }

  // An alias must not collide with a shipped binding either, or redo's `Mod-Shift-z`
  // would be shadowing something on a fresh install.
  {
    const shipped = new Set(Object.values(DEFAULT_KEYS));
    const clashing = Object.entries(KEY_ALIASES).flatMap(([id, keys]) =>
      keys.filter((k) => shipped.has(k)).map((k) => `${id}:${k}`),
    );
    check("no alias shadows a shipped binding", clashing, []);
  }

  // ------------------------------------------------------------ the writer's changes
  {
    const bound = keybindingsFrom({ bold: "Mod-Alt-b" });
    check("a rebinding takes", bound.bold, "Mod-Alt-b");
    check("and everything else is untouched", bound.italic, DEFAULT_KEYS.italic);
  }
  check("no changes is the shipped table", keybindingsFrom(undefined).bold, DEFAULT_KEYS.bold);
  check("and so is an empty object", keybindingsFrom({}).save, DEFAULT_KEYS.save);

  // ------------------------------------------------------------ aliases yield
  //
  // Redo answers to `Mod-Shift-z` as well as `Mod-y`, because a great many people
  // press the first and conclude redo is broken. It is an alias and not a second
  // setting: the moment the writer puts something of their own on that
  // combination, the alias goes.
  {
    const plain = aliasesInForce(keybindingsFrom(undefined));
    ok("redo answers to the combination people actually press", plain.redo?.includes("Mod-Shift-z"));

    const taken = aliasesInForce(keybindingsFrom({ bold: "Mod-Shift-z" }));
    notOk("…until the writer wants that combination for something else", taken.redo);
  }

  // Rebinding redo itself does not lose the alias: the alias is about the *action*,
  // and somebody who moved redo to F4 still presses Mod-Shift-z out of habit.
  {
    const moved = aliasesInForce(keybindingsFrom({ redo: "F4" }));
    ok("moving an action keeps its alias", moved.redo?.includes("Mod-Shift-z"));
  }

  // ------------------------------------------------------------ who holds a key
  {
    const bound = keybindingsFrom(undefined);
    check("a shipped combination names its action", whoHolds(bound, DEFAULT_KEYS.bold, "italic"), "bold");
    // Asking about the action that already has it is not a conflict — a writer
    // rebinding something to the key it already has is a no-op, not a warning.
    check("an action does not conflict with itself", whoHolds(bound, DEFAULT_KEYS.bold, "bold"), null);
    check("a free combination is free", whoHolds(bound, "Mod-Alt-Shift-q", "bold"), null);
  }

  // ------------------------------------------------------------ how a card prints one
  //
  // B36: *"no keyboard-shortcut card (Ksav has 29 bindings, discoverable only by
  // hovering)"*. `tools/card.mjs` reads this module, so the card is wrong only if
  // the app is — and this is the function that decides what it says.
  check("Mod prints as Ctrl", readable("Mod-b"), "Ctrl+B");
  check("modifiers are spelled out", readable("Mod-Shift-f"), "Ctrl+Shift+F");
  check("and so are two of them", readable("Mod-Alt-n"), "Ctrl+Alt+N");
  check("a digit is a digit", readable("Mod-1"), "Ctrl+1");
  check("a punctuation key survives", readable("Mod-/"), "Ctrl+/");
  check("a bracket survives", readable("Mod-Alt-["), "Ctrl+Alt+[");
  // The one that catches uppercasing the whole string.
  check("a named key is not shouted", readable("F4"), "F4");

  // Every shipped binding has to print as something a person can type.
  {
    const bad = Object.entries(DEFAULT_KEYS)
      .map(([id, key]) => [id, readable(key)])
      .filter(([, printed]) => !printed || printed.includes("Mod") || printed.endsWith("+"));
    check("every shipped binding prints readably", bad, []);
  }

  // ...and as something a person can read, in both languages. An action with no
  // `sc.` string is not a crash: the settings drawer and the card fall back to the
  // internal id, so it ships as a row saying `hiddenBreak` and everybody assumes
  // somebody meant to name it later. That is exactly the kind of thing that
  // survives a review, so it is asserted rather than noticed.
  //
  // Read from the dictionaries and not through `t`, which would answer for Hebrew
  // out of the English shelf and pass a test that a Hebrew-first app should fail.
  for (const lang of ["he", "en"]) {
    const unnamed = Object.keys(DEFAULT_KEYS).filter((id) => !DICTS[lang]["sc." + id]);
    check(`every action is named in ${lang}`, unnamed, []);
  }
}
