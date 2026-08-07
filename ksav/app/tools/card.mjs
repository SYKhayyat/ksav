// Generate the keyboard shortcut card (B36).
//
// > *"no keyboard-shortcut card (Ksav has 29 bindings, discoverable only by
// > hovering)"*
//
//   node tools/card.mjs > ../../docs/shortcuts.md
//
// Reads `src/bindings.ts` for the bindings and `src/i18n.ts` for both languages'
// labels, through esbuild, the same way `test/run.mjs` gets at a module. So the
// card is wrong only if the application is — which is the whole point, because the
// reason B36 asks for a card is that nobody could find out what the shortcuts were,
// and a hand-written second list of them would be the same problem with one more
// copy to forget about.

import { readFile } from "node:fs/promises";
import { commands } from "./commands.mjs";
import { loadMany } from "./load.mjs";

const mods = await loadMany(["bindings", "i18n", "structure"]);
const { DEFAULT_KEYS, KEY_ALIASES, readable } = mods.bindings;
const i18n = mods.i18n;
const { STRUCTURE_ACTIONS } = mods.structure;

/**
 * The i18n key a structure action is already named under.
 *
 * Ten of the bindings are structure operations — `Tab` indents a list item,
 * `Alt+Shift+←` promotes a section — and they had no `sc.` string, so the card
 * printed `list.indent` at ten readers in two languages. They are not unnamed:
 * `STRUCTURE_ACTIONS` carries the key the ribbon, the palette and the hydra all
 * label them with. Reading it is the difference between the card knowing a name
 * and the project owning a second set of names for the same ten operations.
 */
const STRUCTURE_LABEL = Object.fromEntries(STRUCTURE_ACTIONS.map((a) => [a.id, a.label]));

/**
 * Girsa's own documentation, as an absolute URL.
 *
 * It was `../../Girsa/docs/start-here.md` — a path out of this repository and
 * into an untracked sibling directory, which resolves on exactly one machine in
 * the world and 404s for everybody who follows it on GitHub. The same link is in
 * three hand-written pages; `documentation.test.mjs` now refuses a relative link
 * that does not resolve to a tracked file, which is what makes this the only
 * spelling available.
 */
const GIRSA_START_HERE = "https://github.com/SYKhayyat/girsa/blob/main/docs/start-here.md";

/**
 * How many commands the registry holds.
 *
 * Counted, not typed. The card said "104 of them" for as long as there were 104,
 * and then for a while after there weren't — which is the exact failure this
 * generator exists to prevent, reproduced one paragraph below the table that
 * prevents it.
 *
 * **And then it happened again, one level down.** Counting *was* the fix and it
 * was still wrong, because this file counted with `/^\s*cmd!\(/gmu` — which
 * matches the macro's own recursive expansion at `commands.rs:39`. So the card
 * printed 116 against a registry of 115, and `docfacts.mjs` counted the same
 * way and therefore *enforced* the wrong number onto three more pages. Counting
 * is not enough; there has to be one thing that counts. That is
 * `tools/commands.mjs`, and it is the only reader of this table left.
 */
const commandCount = () => commands().length;

/** A label in one language, or the action's id if nobody named it. */
function label(id, lang) {
  i18n.setLang(lang);
  const said = i18n.t("sc." + id);
  if (said !== "sc." + id) return said;
  // No `sc.` string. If it is a structure operation, it is already named where
  // every other surface reads its name from.
  const key = STRUCTURE_LABEL[id];
  if (key) {
    const from = i18n.t(key);
    if (from !== key) return from;
  }
  // `t` hands back the key when there is no string for it, which is exactly the
  // case worth showing rather than hiding: an unnamed action on a printed card is
  // a row somebody has to go and name.
  return `\`${id}\``;
}

const lines = [];
lines.push("# Ksav — keyboard shortcuts · כְּתָב — מקשים");
lines.push("");
lines.push("<!-- Generated: node tools/card.mjs > ../../docs/shortcuts.md");
lines.push("     Do not edit by hand. The bindings are `ksav/app/src/bindings.ts` and the");
lines.push("     labels are `ksav/app/src/i18n.ts`, which is what the editor actually uses —");
lines.push("     so this card is wrong only if the application is. -->");
lines.push("");
lines.push("`Ctrl` is `⌘` on a Mac. Every one of these can be changed in the settings");
lines.push("drawer, and rebinding a combination something else already holds asks first");
lines.push("rather than leaving two actions on one key.");
lines.push("");
lines.push("`Ctrl` הוא `⌘` במק. כל אחד מהם ניתן לשינוי במגירת ההגדרות.");
lines.push("");
lines.push("| Keys · מקשים | What it does | מה זה עושה |");
lines.push("|---|---|---|");

for (const [id, binding] of Object.entries(DEFAULT_KEYS)) {
  const keys = [binding, ...(KEY_ALIASES[id] ?? [])]
    .map(readable)
    // A pipe would eat the cell boundary; nothing here has one today, and the
    // thirtieth binding might.
    .map((k) => "`" + k.replace(/\|/g, "\\|") + "`")
    .join(" · ");
  lines.push(`| ${keys} | ${label(id, "en")} | ${label(id, "he")} |`);
}

lines.push("");
lines.push("## Not in the table");
lines.push("");
lines.push("**Alt** held down reveals the markup under the prose view. Let go and it is");
lines.push("prose again — the markup is one key away, which is the right distance for the");
lines.push("people who want it. The `＃` button in the header switches permanently.");
lines.push("");
lines.push("**`#`** in the editor offers every command, in both languages, with what each");
lines.push(`one does. There are ${await commandCount()} of them and none is worth memorising.`);
lines.push("");
lines.push("**Nikud** has its own keymap while you are typing pointed Hebrew. It is not in");
lines.push("this table because it is not one binding — it is a layer, and it is documented");
lines.push("where it is implemented.");
lines.push("");
lines.push("**Ctrl+Shift+C in Girsa**, not here: that is what puts a mekor into whatever you");
lines.push("are writing, and it is the one shortcut that spans both applications. See");
lines.push("[Girsa's own start-here](" + GIRSA_START_HERE + ").");

console.log(lines.join("\n"));
