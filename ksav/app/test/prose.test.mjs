import { check, ok } from "./harness.mjs";
import { build } from "esbuild";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Prose mode, driven by the real CodeMirror.
//
// This is the one view whose whole promise is "it looks like the page", it is
// the most decoration-dense code in the app, and it had no test — because every
// other test file externalises `@codemirror/*` and prose mode is a StateField
// that cannot run without it. So this file bundles it, the way `tools/card.mjs`
// bundles the bindings, and drives it.
//
// What it catches is the failure mode that module actually has: two `replace`
// decorations over overlapping ranges, which CodeMirror rejects at the moment
// the set is built ("Ran out of text content"). It shows up as a blank editor,
// not as a wrong pixel, and it depends on where the caret is — `touchedAt`
// suppresses ranges under the cursor, so a document can decorate cleanly at
// every offset but one. Hence: every offset.

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const APP = path.resolve(HERE, "..");

async function loadProseMode() {
  const out = await mkdtemp(path.join(tmpdir(), "ksav-prose-"));
  const entry = path.join(out, "entry.ts");
  const lang = path.join(APP, "src", "ksav-lang.ts").split(path.sep).join("/");
  await writeFile(
    entry,
    `export { proseMode } from ${JSON.stringify(lang)};\n` +
      `export { EditorState } from "@codemirror/state";\n`,
  );
  await build({
    entryPoints: [entry],
    outdir: out,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    format: "esm",
    platform: "neutral",
    logLevel: "warning",
    absWorkingDir: APP,
    // The entry sits in a temp directory, so ordinary node_modules lookup walks
    // up from there and never reaches the app's.
    nodePaths: [path.join(APP, "node_modules")],
  });
  const mod = await import(pathToFileURL(path.join(out, "entry.mjs")).href);
  return { ...mod, cleanup: () => rm(out, { recursive: true, force: true }) };
}

/** Documents that have historically been where decoration bugs live. */
const DOCS = {
  // deferred note bodies — markers, definitions, and the region
  "deferred: plain pair": `ראש#הערה_בשם("1") סוף.\n\n#גוף_הערה("1")[הביאור]\n`,
  "deferred: layouts": `ראש#הערה_בשם("1", סוג: הערתסיום) אמצע#הערה_בשם("2", סוג: מדף_א) סוף.\n#גוף_הערה("1")[א]\n#גוף_הערה("2")[ב]\n`,
  "deferred: bracket form": `ראש#הערה_בשם[א] סוף.\n#גוף_הערה[א][הביאור]\n`,
  "deferred: region": `טקסט#הערה_בשם("1").\n#גופי_הערות[\n#גוף_הערה("1")[הביאור]\n]\n`,
  "deferred: definition first": `#גוף_הערה("1")[הביאור]\nראש#הערה_בשם("1") סוף.\n`,
  "deferred: dangling": `ראש#הערה_בשם("חסר") סוף.\n`,
  "deferred: orphan": `ראש סוף.\n#גוף_הערה("1")[יתום]\n`,
  "deferred: mixed with inline": `א#הערה[ראשונה] ב#הערה_בשם("1") ג#מדור_א[שלישית].\n#גוף_הערה("1")[שנייה]\n`,
  "deferred: rich body": `א#הערה_בשם("1").\n#גוף_הערה("1")[#הדגשה[מודגש] ו#רשימה(פריט[א], פריט[ב])]\n`,
  "deferred: nested": `א#הערה_בשם("1").\n#גוף_הערה("1")[חיצונית#הערה_בשם("2")]\n#גוף_הערה("2")[פנימית]\n`,
  "deferred: multi-line body": `א#הערה_בשם("1").\n#גוף_הערה("1")[\n  שורה ראשונה\n  שורה שנייה\n]\n`,
  "deferred: commented out": `// #הערה_בשם("1")\nא#הערה_בשם("2") ב.\n#גוף_הערה("2")[הביאור]\n`,
  "deferred: table in a body": `א#הערה_בשם("1").\n#גוף_הערה("1")[#טבלה(עמודות: 2, תא[א], תא[ב])]\n`,
  "deferred: marker inside an inline note": `א#הערה[חיצונית #הערה_בשם("1")] ב.\n#גוף_הערה("1")[פנימית]\n`,
  "deferred: gershayim": `א#הערה_בשם("1").\n#גוף_הערה("1")[עיין רש"י שם ובשו"ע]\n`,
  "deferred: half typed": `א#הערה_בשם("1"\n#גוף_הערה("2")[חצי\n`,
  // the rest of the mode, which was never covered either
  "inline notes, nested": `א#הערה[חיצונית #הערה[פנימית]] ב.\n`,
  "list with a note in an item": `#רשימה(\n  פריט[אלף#הערה[הערה]],\n  פריט[בית],\n)\n`,
  table: `#טבלה(עמודות: 2,\n  כותרת_תא[א], כותרת_תא[ב],\n  תא[1], תא[2],\n)\n`,
  "headings and emphasis": `#כותרת1[פרק]\nטקסט עם #הדגשה[מודגש] ו#נטוי[נטוי].\n`,
  "hidden break": `שורה // מעבר\nהמשך\n`,
  "block comment": `לפני /* פנים\nעוד */ אחרי\n`,
  empty: ``,
};

export async function run() {
  const { proseMode, EditorState, cleanup } = await loadProseMode();
  try {
    let clean = 0;
    for (const [name, doc] of Object.entries(DOCS)) {
      let failure = null;
      for (let pos = 0; pos <= doc.length && !failure; pos++) {
        try {
          const state = EditorState.create({
            doc,
            selection: { anchor: pos },
            extensions: [proseMode],
          });
          const it = state.field(proseMode).deco.iter();
          while (it.value) {
            if (it.from > it.to) throw new Error(`inverted range ${it.from}>${it.to}`);
            it.next();
          }
        } catch (e) {
          failure = `@${pos}: ${e.message}`;
        }
      }
      check(`prose: ${name}`, failure, null);
      if (!failure) clean++;
    }
    ok("prose: every document decorated", clean === Object.keys(DOCS).length);

    // The claim the deferred work makes about this view: a marker collapses to a
    // chip, and the definitions region reads as a numbered list — neither is left
    // as raw markup in the mode whose promise is that there isn't any.
    const doc = `ראש#הערה_בשם("1") סוף.\n\n#גוף_הערה("1")[הביאור]\n`;
    // Caret at 0, so nothing is "touched" and every decoration is emitted.
    const state = EditorState.create({ doc, selection: { anchor: 0 }, extensions: [proseMode] });
    const spans = [];
    const it = state.field(proseMode).deco.iter();
    while (it.value) {
      spans.push(doc.slice(it.from, it.to));
      it.next();
    }
    ok(
      "prose: the marker is covered",
      spans.some((s) => s === `#הערה_בשם("1")`),
    );
    ok(
      "prose: the definition's markup is covered",
      spans.some((s) => s === `#גוף_הערה("1")[`),
    );
    ok(
      "prose: the body's own text is not",
      !spans.some((s) => s.includes("הביאור")),
    );
  } finally {
    await cleanup();
  }
}
