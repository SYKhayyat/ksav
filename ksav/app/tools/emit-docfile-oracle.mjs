// What `src/docs.ts` believes a `.ksav` file is — for the engine to be held to.
//
// # Why
//
// A `.ksav` is plain text when it can be and JSON when it cannot: `serializeDoc`
// wraps the document only when it carries assets, its own custom commands, or
// its own page setup. That rule has exactly one implementation, `parseDoc`, and
// it lives in the browser.
//
// Nothing else was told. `engine/src/main.rs` read every `.ksav` with
// `read_to_string` and compiled whatever came back, so a document with one image
// in it compiled its own JSON wrapper as prose and printed a success line over a
// PDF of `{"format": "ksav-document", …}` — sixteen pages of it, in the case that
// found this. `editors/emacs` put `.ksav` in `auto-mode-alist` and had the same
// hole from the other end.
//
// `engine/src/docfile.rs` is the second implementation, which the house rule
// allows only with an oracle both sides are executed against. This is it.
//
//   node tools/emit-docfile-oracle.mjs          # rewrite the fixture
//   node tools/emit-docfile-oracle.mjs --check  # fail if it is stale
//
// `npm test` runs the --check form; `cargo test --test docfile_oracle` is the
// oracle itself. The staleness check is what makes the pair work: change
// `docs.ts` and this fixture no longer matches, so the regeneration is forced,
// and the next `cargo test` compares the *new* beliefs against Rust.
//
// # Why the corpus is built by `serializeDoc`
//
// The two functions that have to agree about the format are `serializeDoc` (what
// the editor writes) and `docfile::read` (what the engine reads). So most of the
// corpus is literally `serializeDoc`'s output: a hand-written sample of the
// wrapper would be a sample of what its author believed on the day, which is the
// class of test that was green all the way through the bug.
//
// The rest is what no serialiser produces: a text document that opens with a
// brace, a truncated wrapper, wrong magic, a `body` that is not a string. Those
// are the cases where "is this one of ours" is decided, and the whole failure was
// a wrong answer to that question.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runAsScript } from "./generated.mjs";
import { load } from "./load.mjs";
import { ENGINE, SRC } from "./paths.mjs";

const OUT = join(ENGINE, "tests", "fixtures", "docfile-oracle.json");

const { parseDoc, serializeDoc, requestAssets } = await load("docs");

/** A base64 payload small enough to read in a diff and real enough to decode. */
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TTF = "AAEAAAALAIAAAwAwT1MvMg==";

const image = (name = "logo.png") => ({ name, data: PNG, kind: "image" });
const font = (name = "sefer.ttf") => ({ name, data: TTF, kind: "font" });

/**
 * Page setup values that are in range and are not the shipped default.
 *
 * In range on purpose. `readPageSetup` type-checks and does not clamp;
 * `DocConfig::from_json` clamps and does not type-check, because each is
 * defending against what reaches it. Feeding the corpus a 900pt font would
 * compare a TypeScript value against a Rust clamp and fail for a reason that is
 * not drift — and the clamping already has its own tests next to the code that
 * does it. What this corpus is for is the thing that *can* silently drift: the
 * key names, and which keys survive being read.
 */
const SETUP = {
  size_pt: 13.5,
  margin_cm: 3.25,
  dir: "ltr",
  two_sided: true,
  header_odd: "Kuntres",
  keywords: ["halacha", "iyun"],
};

const CUSTOM = "#let emph(x) = text(fill: red, strong(x))\n#let ר = [רבי]";

/** A document, as `serializeDoc` wants one. */
const doc = (over) => ({
  id: "oracle",
  title: "kuntres",
  body: "#כותרת1[פרק א]\n\nשלום עולם.\n",
  assets: [],
  ...over,
});

/**
 * Everything `serializeDoc` will actually write, crossed.
 *
 * Three independent reasons to wrap and a body that is sometimes empty: eight
 * combinations, and the one that matters most is the all-empty case, because
 * that is the one that must come back out as bare text with no wrapper at all.
 */
function serialised() {
  const out = [];
  for (const assets of [[], [image()], [font()], [image(), font(), image("second.png")]]) {
    for (const customCommands of ["", CUSTOM]) {
      for (const config of [undefined, SETUP]) {
        const id = `ser:${assets.map((a) => a.kind).join("+") || "none"}:${
          customCommands ? "custom" : "plain"
        }:${config ? "setup" : "shipped"}`;
        out.push([id, serializeDoc(doc({ assets, customCommands, config }))]);
      }
    }
  }

  // Bodies that make the "is this JSON" question hard, each serialised the two
  // ways a body can travel — bare, and inside the wrapper.
  const awkward = {
    empty: "",
    "opens-with-a-brace": '{ "this": "is prose" }',
    "is-itself-our-json": '{"format":"ksav-document","version":1,"body":"nested"}',
    "leading-whitespace-then-brace": '\n\n   {"format":"ksav-document","body":"x"}',
    "hebrew-and-quotes": 'רש"י על (בראשית א׳) — #הדגשה[כך]',
    "backslashes-and-newlines": "a\\nb\r\nc\td\\\\e",
    "lone-brace": "{",
  };
  for (const [k, body] of Object.entries(awkward)) {
    out.push([`bare:${k}`, serializeDoc(doc({ body }))]);
    out.push([`wrapped:${k}`, serializeDoc(doc({ body, assets: [image()] }))]);
  }
  return out;
}

/**
 * What no serialiser writes, which is where the bug lived.
 *
 * Every one of these is a decision about *whether the file is one of ours*, and
 * the CLI got that decision wrong in the direction that puts the wrapper on the
 * page. The two directions are both here: a wrapper that must be unwrapped, and
 * prose that must not be.
 */
const ADVERSARIAL = {
  // Prose. Must survive as itself, to the byte.
  "prose-in-braces": "{ this is prose }",
  "prose-json-not-ours": '{"format":"something-else","body":"x"}',
  "prose-json-no-format": '{"title":"kuntres","body":"x"}',
  "prose-truncated-wrapper": '{"format":"ksav-document","body":"trunc',
  "prose-json-array": '[{"format":"ksav-document","body":"x"}]',
  "prose-format-not-a-string": '{"format":7,"body":"x"}',
  "prose-starts-with-brace-then-typst": "{#הדגשה[כך]}",
  // Ours, and malformed. An empty document — never its own JSON.
  "ours-no-body": '{"format":"ksav-document","version":1}',
  "ours-body-null": '{"format":"ksav-document","body":null}',
  "ours-body-number": '{"format":"ksav-document","body":42}',
  "ours-body-object": '{"format":"ksav-document","body":{"text":"x"}}',
  "ours-title-empty": '{"format":"ksav-document","title":"","body":"x"}',
  "ours-title-number": '{"format":"ksav-document","title":7,"body":"x"}',
  "ours-custom-not-a-string": '{"format":"ksav-document","body":"x","customCommands":7}',
  "ours-assets-not-an-array": '{"format":"ksav-document","body":"x","assets":{"name":"a.png"}}',
  "ours-asset-without-kind": '{"format":"ksav-document","body":"x","assets":[{"name":"a.png","data":"' + PNG + '"}]}',
  "ours-asset-without-data": '{"format":"ksav-document","body":"x","assets":[{"name":"a.png"}]}',
  "ours-config-not-an-object": '{"format":"ksav-document","body":"x","config":"big"}',
  "ours-config-empty": '{"format":"ksav-document","body":"x","config":{}}',
  "ours-config-wrong-types": '{"format":"ksav-document","body":"x","config":{"size_pt":"large","two_sided":"yes","keywords":"one"}}',
  "ours-config-unknown-key": '{"format":"ksav-document","body":"x","config":{"nosuchfield":3,"size_pt":11}}',
  "ours-pretty-printed": '{\n  "format": "ksav-document",\n  "version": 1,\n  "body": "spread out"\n}',
  "ours-leading-newline": '\n{"format":"ksav-document","body":"x"}',
};

/** `[id, fileText]` for every file the oracle sweeps. */
function corpus() {
  const docs = [];

  // The shipped templates, which are the plain-text form as it really ships.
  const templates = join(ENGINE, "templates");
  for (const f of readdirSync(templates).sort()) {
    if (f.endsWith(".ksav")) {
      docs.push([`template:${f}`, readFileSync(join(templates, f), "utf8")]);
    }
  }

  // Both starter documents, read out of `main.ts` rather than restated — a
  // second copy of the starter would be a document the oracle checks and the
  // product does not ship. Same trick as `emit-scan-oracle.mjs`.
  const src = readFileSync(join(SRC, "main.ts"), "utf8");
  for (const name of ["STARTER_HE", "STARTER_EN"]) {
    const at = src.indexOf(`const ${name} = \``);
    if (at < 0) throw new Error(`${name} is not in main.ts`);
    const from = src.indexOf("`", at) + 1;
    let to = from;
    while (to < src.length && !(src[to] === "`" && src[to - 1] !== "\\")) to++;
    const text = src.slice(from, to).replace(/\\`/g, "`").replace(/\\\$/g, "$");
    docs.push([`starter:${name}`, text]);
    // And the same starter carrying an image, which is the wrapper form of a
    // document somebody really has.
    docs.push([
      `starter:${name}:with-image`,
      serializeDoc(doc({ body: text, assets: [image()] })),
    ]);
  }

  docs.push(...serialised());
  for (const [k, text] of Object.entries(ADVERSARIAL)) docs.push([`adversarial:${k}`, text]);
  return docs;
}

/**
 * What `parseDoc` says about one file.
 *
 * `fallbackTitle` is the empty string so the oracle can see the difference
 * between a title the file carried and one the caller supplied: the Rust side
 * returns `None` and leaves the fallback to its caller, so an emitted `title` of
 * `""` and a Rust `None` are the same answer.
 */
function beliefs(text) {
  const p = parseDoc(text, "");
  return {
    // The one that matters: is this file its own body, or a wrapper?
    wrapped: p.body !== text,
    title: p.title || null,
    body: p.body,
    custom: p.customCommands ?? "",
    // Split by `requestAssets` — the real splitter, not a restatement of it —
    // because the claim being checked is *which of the two lists an entry lands
    // in*. One `assets` array in the file becomes `assets` and `fonts` on a
    // request, keyed on `kind`, and an entry with no `kind` is a picture.
    //
    // `bytes` rides along because the engine drops an entry that carries
    // neither bytes nor a hash, and TypeScript does not: `parseDoc` hands the
    // array through untouched. That is not drift, it is the two sides having
    // different jobs, so the oracle states the input and lets the Rust side
    // assert its own rule against it.
    assets: (() => {
      const split = requestAssets(p.assets ?? []);
      const one = (a) => ({ name: a.name, bytes: !!a.data });
      return { files: split.assets.map(one), fonts: split.fonts.map(one) };
    })(),
    // The keys that survived `readPageSetup`, with their values. The Rust side
    // must have read exactly these and no others.
    config: p.config ?? null,
  };
}

export function buildFixture() {
  const docs = corpus().map(([id, text]) => ({ id, text, ...beliefs(text) }));
  const seen = new Set();
  for (const d of docs) {
    if (seen.has(d.id)) throw new Error(`duplicate corpus id: ${d.id}`);
    seen.add(d.id);
  }
  const note = "generated by app/tools/emit-docfile-oracle.mjs — what src/docs.ts believes a .ksav is";
  return `{\n "note": ${JSON.stringify(note)},\n "docs": [\n${docs
    .map((d) => "  " + JSON.stringify(d))
    .join(",\n")}\n ]\n}\n`;
}

/** Every generated output, as `[path, wanted, label]`. */
export const OUTPUTS = [[OUT, buildFixture(), "docfile-oracle.json"]];

runAsScript(import.meta.url, OUTPUTS, "docfile oracle", "node tools/emit-docfile-oracle.mjs");
