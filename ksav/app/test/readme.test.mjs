import { ok, check } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_KEYS, KEY_ALIASES, readable } from "../.tmp-test/bindings.mjs";
import { dirOf } from "../tools/paths.mjs";
import { ROOT, livingPages } from "./docfacts.mjs";

// The README names keys. Documentation that names a key the application does not
// have is the same bug as a menu item that does nothing — a promise the product
// does not keep — and it is the easiest of all of them to ship, because prose
// compiles no matter what it says.
//
// The in-app help avoids this by being generated. A README cannot be, so it gets
// a test instead.
//
// # The 9 August report says to delete this file, and it is wrong
//
// > **Also positive:** `readme.test.mjs` (77 lines, 45 assertions) — already
// > convicted in prose by the file that replaced it
// > (`documentation.test.mjs:5-8`: *"which is how nineteen false claims survived
// > forty-five green assertions"*). `delete`.
//
// The file that supposedly replaced it calls itself **"the rest of that
// argument"**, and its four fences are the card, counted claims, links and the
// living/log partition. None of them checks a key name against `bindings.ts`.
// Deleting this would remove the only fence in the tree between the prose and
// the keymap, on the strength of a sentence that was complimenting it.
//
// What the criticism *is* right about is scope: twelve claims, hand-listed, over
// one of nine prose files. So the answer is the sweep rather than the delete —
// the hand-written table below stays, because it asserts a key is bound to the
// **right action** and no scraper can know that, and beneath it every key-shaped
// string in every living page is checked for being a key this product ships.

const HERE = dirOf(import.meta.url);
const README = readFileSync(path.join(HERE, "..", "..", "README.md"), "utf8");

export async function run() {

/** Every key the shipped bindings offer, as a reader would see it written. */
const bound = new Set(Object.values(DEFAULT_KEYS).map(readable));

// Keys the README claims, and what each should be bound to. Written out rather
// than scraped: a scraper would have to guess which backticked strings are keys,
// and guessing wrong in either direction makes the test worthless.
const CLAIMED = [
  ["F1", "help"],
  ["F3", "macroRecord"],
  ["F4", "macroPlay"],
  ["Ctrl+Alt+K", "hydra"],
  ["Ctrl+K", "palette"],
  ["Ctrl+Shift+F", "footnote"],
  ["Ctrl+Alt+D", "endnote"],
  ["Ctrl+Shift+N", "tieredNote"],
  ["Shift+Enter", "list.breakInItem"],
  ["Tab", "list.indent"],
  ["Shift+Tab", "list.outdent"],
  ["Enter", "list.splitItem"],
];

for (const [shown, id] of CLAIMED) {
  ok(`the README mentions ${shown}`, README.includes(shown));
  check(`${shown} is bound, and to ${id}`, readable(DEFAULT_KEYS[id] ?? ""), shown);
  ok(`${shown} is a key the product actually ships`, bound.has(shown));
}

// Word's own footnote key, which the README offers alongside Ksav's. An alias
// rather than a binding, so it is checked against the alias table — and the
// README says "or `Ctrl+Alt+F`, which is Word's", which is a promise like any
// other.
ok("the README offers Ctrl+Alt+F", README.includes("Ctrl+Alt+F"));
ok(
  "and the footnote really answers to it",
  (KEY_ALIASES.footnote ?? []).map(readable).includes("Ctrl+Alt+F"),
);

// The section-move chord is written with arrows in the prose.
ok("the README mentions the section-move chord", README.includes("Alt+Shift+↑/↓"));
check("and it is bound", DEFAULT_KEYS["heading.moveUp"], "Alt-Shift-ArrowUp");
check("in both directions", DEFAULT_KEYS["heading.moveDown"], "Alt-Shift-ArrowDown");

// Claims about scale, which are the other kind of thing prose gets wrong.
{
  // Thirteen, and counted from `NOTE_CHOICES` rather than from prose — see
  // `docfacts.mjs`. "Eleven options" was a claim about a taxonomy that the
  // documentation fence had to choose its evidence to defend.
  ok("the README claims thirteen note layouts", README.includes("thirteen note layouts"));
  ok("and nine heading levels", /nine levels/.test(README));
}

// # Every key-shaped string in every living page
//
// The generalisation of the table above. A backticked `Ctrl+…` or `F7` in any
// tracked page that is documentation rather than record has to be a combination
// the product answers to — which is the *class* the twelve claims above are
// twelve instances of.
//
// The pattern is deliberately tight. `readme.test.mjs`'s own opening argues that
// a scraper "would have to guess which backticked strings are keys, and guessing
// wrong in either direction makes the test worthless" — so this one does not
// guess: a modifier chord or a function key, backticked, and nothing else. A
// bare `Tab` in prose is a word.
{
  const shipped = new Set([
    ...Object.values(DEFAULT_KEYS).map(readable),
    ...Object.values(KEY_ALIASES).flat().map(readable),
  ]);
  // Combinations the platform owns and we do not bind. Each is a claim: if Ksav
  // ever binds one, this list is what has to be argued with.
  const THEIRS = new Set(["Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+Shift+Z", "Ctrl+A"]);
  const KEYLIKE = /`((?:Ctrl|Alt|Shift|Cmd)(?:\+(?:Ctrl|Alt|Shift|Cmd))*\+[^`\s]+|F(?:[1-9]|1[0-2]))`/gu;

  let looked = 0;
  const wrong = [];
  for (const page of livingPages()) {
    const body = readFileSync(path.join(ROOT, page), "utf8");
    for (const [, combo] of body.matchAll(KEYLIKE)) {
      looked += 1;
      if (shipped.has(combo) || THEIRS.has(combo)) continue;
      wrong.push(`${page}: \`${combo}\``);
    }
  }
  ok("the sweep found key names in the prose", looked > 20, `${looked} of them`);
  ok(
    "and every one is a key this product ships",
    wrong.length === 0,
    wrong.join("\n      ") || "all bound",
  );
}

// The orientation section exists at all, and points at the generated reference
// rather than duplicating it — a shortcut table in a README is a shortcut table
// that is wrong by the next release.
ok("there is a Using Ksav section", README.includes("## Using Ksav"));
ok("it sends the reader to F1 for the full reference", /Press `F1`/.test(README));

}
