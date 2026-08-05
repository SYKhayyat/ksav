import { ok, check } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_KEYS, KEY_ALIASES, readable } from "../.tmp-test/bindings.mjs";

// The README names keys. Documentation that names a key the application does not
// have is the same bug as a menu item that does nothing — a promise the product
// does not keep — and it is the easiest of all of them to ship, because prose
// compiles no matter what it says.
//
// The in-app help avoids this by being generated. A README cannot be, so it gets
// a test instead.

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
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
  ok("the README claims eleven note layouts", README.includes("eleven note layouts"));
  ok("and nine heading levels", /nine levels/.test(README));
}

// The orientation section exists at all, and points at the generated reference
// rather than duplicating it — a shortcut table in a README is a shortcut table
// that is wrong by the next release.
ok("there is a Using Ksav section", README.includes("## Using Ksav"));
ok("it sends the reader to F1 for the full reference", /Press `F1`/.test(README));

}
