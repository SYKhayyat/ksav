// Does the browser engine actually run?
//
// `wasm-pack build` succeeding proves the crate compiled for
// wasm32-unknown-unknown. It does not prove the module instantiates, and it
// certainly does not prove it can lay out a document: a panic on first use, a
// missing font, a `SystemTime::now()` reached through a dependency — all of
// those link cleanly and fail the moment anybody types. Since the built package
// is git-ignored and produced locally, nothing in CI used to exercise this path
// at all, and the whole no-server build could rot silently between releases.
//
// So this loads the real module the way the worker does and puts the engine
// through the same surface a writer touches in the first minute: every bundled
// template compiled, and the spell-checker asked a question it must get right.
//
// Node rather than a browser on purpose. The thing under test is the wasm
// module and its JS glue, which are identical in both; a headless browser would
// add a large dependency to test the part that is least likely to be wrong.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "../../ksav/wasm/pkg");

const glue = path.join(pkg, "ksav_wasm.js");
const binary = path.join(pkg, "ksav_wasm_bg.wasm");
for (const f of [glue, binary]) {
  if (!fs.existsSync(f)) {
    console.error(`missing ${f} — run \`wasm-pack build --target web --release --out-dir pkg\` first`);
    process.exit(1);
  }
}

const engine = await import(pathToFileURL(glue).href);
const bytes = fs.readFileSync(binary);

const started = Date.now();
// `--target web` expects to fetch its own URL; hand it the bytes instead, which
// is what the worker's bundler-provided URL amounts to.
await engine.default({ module_or_path: bytes });
console.log(`instantiated in ${Date.now() - started} ms (${(bytes.length / 1048576).toFixed(1)} MB)`);

const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
};

// The registries drive the toolbar, the palette and the menus. Empty ones are a
// working editor with nothing in it, which is not a passing state.
const commands = JSON.parse(engine.ksav_commands());
const templates = JSON.parse(engine.ksav_templates());
check("command registry is populated", commands.length > 50, `${commands.length} commands`);
check("template registry is populated", templates.length > 0, `${templates.length} templates`);

// Every template, because these are what a new document starts from: one that
// does not compile is the first thing a writer would ever see go wrong.
for (const template of templates) {
  const request = {
    body: template.body,
    ...(template.lang === "en" ? { dir: "ltr", lang: "en" } : {}),
  };
  const result = JSON.parse(engine.ksav_compile(JSON.stringify(request)));
  const errors = (result.diagnostics ?? []).filter((d) => d.severity === "error");
  check(
    `template ${template.id} compiles`,
    result.ok && errors.length === 0 && result.pages_svg.length > 0,
    errors.map((e) => e.message.split("\n")[0]).join("; "),
  );
}

// Both lexicons have to be present and separable: a wasm build that shipped one
// of them would still answer, and would quietly stop checking half of a
// bilingual document.
const spell = JSON.parse(
  engine.ksav_spell(JSON.stringify({ text: "שלום עולם helo wrold", user_words: "" })),
);
const flagged = (spell.misspellings ?? []).map((m) => m.word);
check("hebrew lexicon loaded", (spell.lexicon_sizes?.he ?? 0) > 1000, `${spell.lexicon_sizes?.he}`);
check("english lexicon loaded", (spell.lexicon_sizes?.en ?? 0) > 1000, `${spell.lexicon_sizes?.en}`);
check(
  "misspellings are caught and correct words are not",
  flagged.includes("helo") && flagged.includes("wrold") && flagged.length === 2,
  `flagged ${JSON.stringify(flagged)}`,
);

const suggestions = JSON.parse(
  engine.ksav_suggest(JSON.stringify({ word: "wrold", user_words: "" })),
).suggestions ?? [];
check("suggestions are offered", suggestions.includes("world"), JSON.stringify(suggestions.slice(0, 4)));

// A malformed request must come back as a failed compile with a reason, not as
// a blank page reported as success — the browser build shares that path with
// the server, and it is worth pinning on both.
const malformed = JSON.parse(engine.ksav_compile(JSON.stringify({ body: 12345 })));
check(
  "a request with no usable body is an error",
  malformed.ok === false && malformed.pages_svg.length === 0,
  JSON.stringify(malformed.diagnostics?.[0]?.message ?? "").slice(0, 120),
);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed in the wasm engine`);
  process.exit(1);
}
console.log(`\nall checks passed — the browser engine works`);
