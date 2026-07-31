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

import { build } from "esbuild";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const APP = path.resolve(HERE, "..");
const OUT = await mkdtemp(path.join(tmpdir(), "ksav-card-"));

await build({
  entryPoints: [path.join(APP, "src", "bindings.ts"), path.join(APP, "src", "i18n.ts")],
  outdir: OUT,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
});

const { DEFAULT_KEYS, KEY_ALIASES, readable } = await import(
  pathToFileURL(path.join(OUT, "bindings.mjs")).href
);
const i18n = await import(pathToFileURL(path.join(OUT, "i18n.mjs")).href);

/** A label in one language, or the action's id if nobody named it. */
function label(id, lang) {
  i18n.setLang(lang);
  const said = i18n.t("sc." + id);
  // `t` hands back the key when there is no string for it, which is exactly the
  // case worth showing rather than hiding: an unnamed action on a printed card is
  // a row somebody has to go and name.
  return said === "sc." + id ? `\`${id}\`` : said;
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
lines.push("one does. There are 104 of them and none is worth memorising.");
lines.push("");
lines.push("**Nikud** has its own keymap while you are typing pointed Hebrew. It is not in");
lines.push("this table because it is not one binding — it is a layer, and it is documented");
lines.push("where it is implemented.");
lines.push("");
lines.push("**Ctrl+Shift+C in Girsa**, not here: that is what puts a mekor into whatever you");
lines.push("are writing, and it is the one shortcut that spans both applications. See");
lines.push("[`Girsa/docs/start-here.md`](../../Girsa/docs/start-here.md).");

console.log(lines.join("\n"));
await rm(OUT, { recursive: true, force: true });
