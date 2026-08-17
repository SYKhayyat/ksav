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
  RENAMED_ACTIONS,
  keybindingsFrom,
  aliasesInForce,
  whoHolds,
  commandName,
  keyHint,
  readable,
} from "../.tmp-test/bindings.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";
import { actionById, isEnabled, STRUCTURE_ACTIONS } from "../.tmp-test/structure.mjs";

export function run() {

  // ------------------------------------------------------------ the shipped table
  ok("there are bindings", Object.keys(DEFAULT_KEYS).length > 20);

  // Two actions on one combination is a keystroke whose effect depends on which
  // list was read first — undebuggable from the writing side. The settings panel
  // refuses to create one; this asserts none ships.
  //
  // **One exception, and it is proved rather than trusted.** A *structure*
  // action is already scoped: `list.indent` cannot fire outside a list,
  // `table.nextCell` cannot fire outside a table, and `structureAt` resolves the
  // **innermost** structure — so at any caret at most one of them applies and
  // the keystroke still has exactly one effect. `structureKeymap` binds without
  // `preventDefault`, so the one that declines falls through to the other.
  //
  // It exists for `Tab`, which is how every table in every word processor is
  // filled in and which a table here had no key for at all. The uniqueness rule
  // is about one keystroke having one effect; it was written as "one key, one
  // action", which is a stronger claim than the reason behind it.
  {
    const structural = new Set(STRUCTURE_ACTIONS.map((a) => a.id));
    const byKey = new Map();
    for (const [id, key] of Object.entries(DEFAULT_KEYS)) {
      byKey.set(key, [...(byKey.get(key) ?? []), id]);
    }
    const shared = [...byKey].filter(([, ids]) => ids.length > 1);
    const illegal = shared.filter(([, ids]) => {
      if (!ids.every((id) => structural.has(id))) return true;
      const kinds = new Set(ids.map((id) => actionById(id).structure));
      return kinds.size !== ids.length;
    });
    check("no two actions ship on one combination", illegal.map(([k]) => k), []);
    ok("…and the exception is used, so this is not vacuous", shared.length > 0);
  }

  // The exclusion the exception rests on, over a corpus rather than by argument:
  // no caret anywhere makes two sharers of one key both applicable.
  {
    const byKey = new Map();
    for (const [id, key] of Object.entries(DEFAULT_KEYS)) {
      byKey.set(key, [...(byKey.get(key) ?? []), id]);
    }
    const docs = [
      "#רשימה(\n  פריט[א],\n  פריט[ב],\n)\n",
      "#טבלה(עמודות: 2,\n  תא[א], תא[ב],\n)\n",
      // The case the whole argument turns on: a list inside a cell. Innermost
      // wins, so `Tab` is the list's there and the table's everywhere else in it.
      "#טבלה(עמודות: 1,\n  תא[#רשימה(פריט[פנימי],)],\n)\n",
      "סתם טקסט בלי מבנה.\n",
    ];
    const both = [];
    for (const [key, ids] of byKey) {
      if (ids.length < 2) continue;
      for (const doc of docs) {
        for (let pos = 0; pos <= doc.length; pos++) {
          const live = ids.filter((id) => isEnabled(actionById(id), doc, pos));
          if (live.length > 1) both.push(`${key} @${pos}: ${live.join(" + ")}`);
        }
      }
    }
    check("no caret makes two sharers of one key both apply", both.slice(0, 6), []);
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

  // ------------------------------------------------------------ a rename is not a reset
  //
  // Rebindings are stored by action id, so renaming an action throws the
  // writer's key away without saying so: the setting is still in the file,
  // keyed to a name nothing answers to, and the shipped default quietly comes
  // back. `region` became `fold` and `comment` became `hideBlock` the day the
  // three source constructs got names that say which one reaches the page, and
  // that is the shape of every rename after it.
  {
    const bound = keybindingsFrom({ region: "Mod-Alt-g", comment: "Mod-Alt-c" });
    check("a rename carries the writer's key", bound.fold, "Mod-Alt-g");
    check("…for both of them", bound.hideBlock, "Mod-Alt-c");
    check("…and the old id is not still bound", bound.region, undefined);
  }
  for (const [was, now] of Object.entries(RENAMED_ACTIONS)) {
    ok(`the rename target ${now} exists`, now in DEFAULT_KEYS, `${was} → ${now}`);
    ok(`…and ${was} is gone from the shipped table`, !(was in DEFAULT_KEYS));
  }
  {
    // An action may be bound without shipping a key of its own — the settings
    // panel offers every action, not only the ones with a default — so the
    // rename pass must not quietly drop what it does not recognise.
    const bound = keybindingsFrom({ "list.deleteItem": "Mod-Alt-Shift-x" });
    check("a key on an action with no default survives", bound["list.deleteItem"], "Mod-Alt-Shift-x");
  }

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

  // --------------------------------------------------- and what a mode does to it
  //
  // `buildShortcutKeymap` returns *nothing at all* while Vim or Emacs is really
  // installed — that is how a mode wins the keyboard, rather than by
  // out-ranking anything. Twenty surfaces went on printing the chord anyway.
  // This is the rule they all go through now, and `prohibitions.test.mjs` holds
  // `readable` unreachable from anywhere else in `src/`.
  check("with no mode, a key is a key", keyHint("Mod-k", "default", "palette"), "Ctrl+K");
  check("under Emacs it is what to type", keyHint("Mod-k", "emacs", "palette"), "M-x palette");
  check("under Vim it is the ex command", keyHint("Mod-k", "vim", "palette"), ":palette");
  // The one that matters: a mode does not merely blank the column. An action
  // that is deliberately unbound is still reachable by name, and saying nothing
  // would be honest and useless.
  check("an unbound action still has a way in", keyHint("", "emacs", "foldall"), "M-x foldall");
  check("…and without a mode it has nothing to print", keyHint("", "default", "foldall"), "");

  // The name is `commandName`'s, and it moved here from `keymodes.ts` so that
  // the panel views — which no test can give a CodeMirror to — can reach it.
  check("a dotted id becomes one word", commandName("table.rowBelow"), "tablerowbelow");
  check("every shipped action has a name to be reached by", [
    ...new Set(Object.keys(DEFAULT_KEYS).filter((id) => !commandName(id))),
  ], []);
  {
    // Distinct, or two actions answer to one `M-x` name and the second is
    // unreachable under a name that looks like it works. `keymodes.test.mjs`
    // holds the live registry to this; here it is the shipped table.
    const seen = new Map();
    const clash = [];
    for (const id of Object.keys(DEFAULT_KEYS)) {
      const name = commandName(id);
      if (seen.has(name)) clash.push([seen.get(name), id]);
      else seen.set(name, id);
    }
    check("no two shipped actions answer to the same name", clash, []);
  }

  // ...and as something a person can read, in both languages. An action with no
  // `sc.` string is not a crash: the settings drawer and the card fall back to the
  // internal id, so it ships as a row saying `hiddenBreak` and everybody assumes
  // somebody meant to name it later. That is exactly the kind of thing that
  // survives a review, so it is asserted rather than noticed.
  //
  // Read from the dictionaries and not through `t`, which would answer for Hebrew
  // out of the English shelf and pass a test that a Hebrew-first app should fail.
  // Two sources of names now: a plain `sc.` string, or — for a structural
  // operation — the label already carried in `STRUCTURE_ACTIONS`, which the
  // settings drawer reads. The invariant is "every bindable action has a human
  // name", not "every one has an `sc.` string"; asserting the narrower thing
  // would force a second copy of every list label to exist purely to satisfy a
  // test, which is how registries stop being single sources.
  for (const lang of ["he", "en"]) {
    const unnamed = Object.keys(DEFAULT_KEYS).filter((id) => {
      if (DICTS[lang]["sc." + id]) return false;
      const structural = actionById(id);
      return !(structural && DICTS[lang][structural.label]);
    });
    check(`every action is named in ${lang}`, unnamed, []);
  }
}
