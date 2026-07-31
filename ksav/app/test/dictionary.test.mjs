// The writer's own dictionary, as a file they own (B29).
//
// > *"The user dictionary lives in one browser profile — invisible to the desktop
// > app, gone if the profile is cleared. It exports and imports as a plain word
// > list, which is the honest half."*
//
// The other half is the desktop app keeping it in a file. A browser cannot read a
// path, so *one file both read* is not something a sandbox permits — what it can
// do is stop the list living inside one browser profile.
//
// Three decisions here are functions of their arguments, which is why they are in
// this file and not behind a filesystem: what a dictionary file says, what one
// looks like written down, and what happens when two of them meet.

import { check, ok } from "./harness.mjs";
import * as spell from "../.tmp-test/spell.mjs";

// ------------------------------------------------ the dictionary as a file (B29)
//
// > *"The user dictionary lives in one browser profile — invisible to the desktop
// > app, gone if the profile is cleared."*
//
// The three decisions that are functions of their arguments and can be held here:
// what a dictionary file says, what one looks like written down, and what happens
// when two of them meet. The file itself is the desktop shell's, and a browser
// cannot read a path at all — so *one file both read* is not something a sandbox
// permits, and this is the half that could be built.

export function run() {

  // ------------------------------------------------------------------ reading one
  check(
    "a dictionary file is one word per line, comments and blanks out",
    spell.parseDictionary("# a header\n\nרש״י\n  Guttenmacher  \n\n# another\nחבורה\n"),
    ["רש״י", "Guttenmacher", "חבורה"],
  );

  check("a word listed twice is one word", spell.parseDictionary("א\nא\nב"), ["א", "ב"]);

  check("an empty file is an empty dictionary and not an error", spell.parseDictionary(""), []);

  // A file somebody hand-edited badly. Whatever it holds, it must not throw at
  // startup: this runs before anything is drawn.
  check("a file of nothing but comments reads as empty", spell.parseDictionary("#a\n#b\n"), []);

  // ------------------------------------------------------------------ writing one
  {
    const written = spell.serializeDictionary(["רש״י", "חבורה"]);
    ok("the header says what the format is", written.startsWith("#"));
    ok("and the words follow it", written.includes("רש״י\nחבורה\n"));
    // The round trip is the property that matters: a dictionary this app wrote
    // has to be a dictionary this app can read, or every export is a one-way door.
    check(
      "what it writes, it reads back",
      spell.parseDictionary(written),
      ["רש״י", "חבורה"],
    );
    check(
      "an empty dictionary still writes a readable file",
      spell.parseDictionary(spell.serializeDictionary([])),
      [],
    );
  }

  // ------------------------------------------------------------------ two of them
  //
  // Merge and never replace. Somebody loading their dictionary onto a second
  // machine wants both halves; a replace would discard whatever they had taught
  // the checker there, silently, which is the whole of what B29 is worried about.
  {
    const merged = spell.mergeWords(["רש״י", "חבורה"], "# theirs\nתוספות\nרש״י\n");
    check("both halves survive", merged.words, ["רש״י", "חבורה", "תוספות"]);
    check("and only the new ones are counted", merged.added, 1);
  }

  check(
    "merging a file you already have adds nothing",
    spell.mergeWords(["א", "ב"], "א\nב\n").added,
    0,
  );

  {
    // Order is kept: the words they had, then the ones that arrived. A dictionary
    // panel that reshuffles itself on every import is one you cannot find
    // anything in.
    const merged = spell.mergeWords(["ב", "א"], "ג\n");
    check("the order they had is the order they keep", merged.words, ["ב", "א", "ג"]);
  }

  check(
    "merging nothing into nothing is nothing",
    spell.mergeWords([], "").words,
    [],
  );
}
