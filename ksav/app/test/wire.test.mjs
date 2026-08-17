// The shape Rust sends and the shape TypeScript declares.
//
// # The instrument this borrows, and why
//
// The 9 August three-repository report compared the two shells row by row and
// gave this row to the other application:
//
// > | Wire checking | Girsa: independent hand-written mirror + comparator |
// > | Ksav: generated from one side | **Girsa** — a generator catches a stale
// > | copy of a registry, never a *wrong* one |
//
// It is right, and the distinction is the whole point. `services.gen.ts` is
// generated from `services.rs`, so *which services exist* cannot drift — but
// **what each one answers with** is a `serde_json::json!` literal on one side
// and a hand-written `export interface` on the other, and nothing compared
// them. A generator can only tell you a copy is stale. It cannot tell you the
// original is wrong.
//
// So this is Girsa's `app/test/wire.test.mjs`, over this tree: the seam stated
// by hand *here*, checked against the literals in the engine. When the two
// disagree, one of them is wrong and neither compiler will say so.
//
// # What it checks, and what it deliberately does not
//
// **Key names.** Every response literal the engine builds, against the
// interface `api.ts` parses it into. Names are where the drift is: a field the
// editor reads and Rust stopped sending is `undefined` at a call site,
// silently, in one of three transports.
//
// **Not types.** `Option<String>` against `string | null` is a mapping and not
// an equality, and a checker that understood it would be a second Rust parser
// in JavaScript — the shape of thing this file exists to argue against. Girsa's
// header makes the same call for the same reason.
//
// **Both directions, and `optional` is a claim.** Everything Rust sends must be
// declared, or the editor is reading a field it does not know about. Everything
// the interface declares must be sent by *some* response of that shape, or it
// is a field the editor waits for and never gets — unless it is named in
// `optional`, which is a written claim about why, and which fails if the field
// turns out to be sent after all.

import { check, ok } from "./harness.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const ENGINE = path.resolve(HERE, "..", "..", "engine", "src");
const SRC = path.resolve(HERE, "..", "src");

/**
 * The seam, stated here by hand.
 *
 * Each row is *this response literal carries these keys, and the editor reads
 * them through this interface*. Written out rather than derived, because a
 * derivation from either side would be that side agreeing with itself — which
 * is exactly the failure the report names.
 *
 * `at` is a distinctive fragment of the literal in the Rust file, so a row
 * points at one literal rather than at a function that may hold several.
 */
const SEAM = [
  {
    what: "compile: the pages, their fingerprints and the diagnostics",
    file: "lib.rs",
    at: '"pages_hash": fingerprints',
    ts: "CompileResult",
    // `html` belongs to the `format: "html"` answer and no other; its own rows
    // are below.
    optional: ["html"],
  },
  {
    what: "compile, when the request would not read",
    file: "lib.rs",
    at: '"pages_hash": [],',
    ts: "CompileResult",
    optional: ["html"],
  },
  {
    what: "an html compile that produced a document",
    file: "lib.rs",
    at: '"ok": true, "html": html',
    ts: "CompileResult",
    // Nothing is laid out for HTML: no pages, no fingerprints, no PDF, no
    // assembled source and no page runs. What the caller reads is `html`.
    optional: ["pages_svg", "pages_hash", "pdf_base64", "typst_source", "pages_lines", "note_markers"],
  },
  {
    what: "an html compile that failed",
    file: "lib.rs",
    at: '"html": serde_json::Value::Null',
    ts: "CompileResult",
    optional: ["pages_svg", "pages_hash", "pdf_base64", "typst_source", "pages_lines", "note_markers"],
  },
  {
    what: "assemble: the document as Typst, with nothing laid out",
    file: "lib.rs",
    at: '"typst_source": assemble_source(',
    ts: "AssembledSource",
    optional: [],
  },
  {
    what: "assemble, when the request would not read",
    file: "lib.rs",
    at: '                "typst_source": "",',
    ts: "AssembledSource",
    optional: [],
  },
  {
    what: "jump: which line of which file a click on a page came from",
    file: "jump.rs",
    at: '"line": origin.map_or(s.line',
    ts: "Located",
    optional: [],
  },
  {
    what: "reveal: everywhere on the pages one place in the body ended up",
    file: "jump.rs",
    at: '"points": points',
    ts: "Revealed",
    optional: [],
  },
  {
    what: "services: the registry describing itself",
    file: "services.rs",
    at: '"name": s.name',
    ts: "ServiceRow",
    optional: [],
  },
  {
    what: "a refusal, from any service",
    file: "services.rs",
    at: '"error": message',
    ts: "CompileResult",
    // The refusal is deliberately a superset of the compile shape, so a failed
    // `/compile` reads identically whatever produced it. It carries no
    // fingerprints, no html, no missing assets and no page runs, because nothing
    // was laid out; `error` is the key it adds, and it is in `EXTRA_SENT`.
    optional: ["pages_hash", "html", "missing_assets", "pages_lines", "note_markers"],
  },
  {
    what: "linkify: the markup with its mareh mekomos linked",
    file: "services.rs",
    at: '"text": text',
    ts: "Linkified",
    optional: [],
  },
  {
    what: "refresh: the citations as the library has them now",
    file: "services.rs",
    at: '"quotes": got.quotes',
    ts: "RefreshResult",
    optional: [],
  },
  {
    what: "saved-here: Girsa took the errand",
    file: "services.rs",
    at: '"told": told',
    ts: "Told",
    optional: [],
  },
  {
    what: "saved-here, in a build with no loopback",
    file: "services.rs",
    // The precise literal: `"told": false` also appears in the doc comment two
    // dozen lines up, which is the right thing for a doc comment to say and the
    // wrong thing for a fragment to match.
    at: 'json!({ "told": false })',
    ts: "Told",
    optional: [],
  },
  {
    what: "clipboard-source: a packet, rendered to markup in Rust",
    file: "services.rs",
    at: '"markup": markup',
    nth: 0,
    ts: "ClipboardSource",
    optional: [],
  },
  {
    what: "clipboard-source: no packet, when the clipboard cannot be read",
    file: "services.rs",
    at: '"markup": serde_json::Value::Null',
    nth: 0,
    ts: "ClipboardSource",
    optional: [],
  },
  {
    what: "clipboard-source: no packet, in a build with no clipboard",
    file: "services.rs",
    at: '"markup": serde_json::Value::Null',
    nth: 1,
    ts: "ClipboardSource",
    optional: [],
  },
];

/**
 * Keys a response sends that its interface does not declare, and why.
 *
 * One entry, and it is load-bearing rather than an exemption: `error` is read
 * by `out.error` at the call sites `services.rs` names (mekoros, linkify) and
 * is deliberately not on `CompileResult`, because a success never has one. If
 * it ever appears there, this list is what has to be argued with.
 */
const EXTRA_SENT = { CompileResult: ["error"] };

/**
 * The keys of the `json!({ … })` literal containing the `nth` occurrence of
 * `at`, and where that literal starts.
 *
 * `nth` because two literals really are identical: `clipboard-source` answers
 * `{"markup": null}` from three places — a packet that will not read, a build
 * with no clipboard, and the wasm build that has neither — and the sameness is
 * the design (*"every way this can go wrong has the same right answer"*). Three
 * rows pointing at one fragment would look like coverage and be one literal
 * checked three times.
 */
function keysAt(rust, at, nth = 0) {
  let found = -1;
  for (let i = 0; i <= nth; i += 1) {
    found = rust.indexOf(at, found + 1);
    if (found < 0) return null;
  }
  // Back to the `json!({` that opens the literal this fragment is inside.
  const opened = rust.lastIndexOf("json!({", found);
  if (opened < 0) return null;
  let depth = 0;
  let end = rust.length;
  for (let i = opened + "json!(".length; i < rust.length; i += 1) {
    if (rust[i] === "{") depth += 1;
    else if (rust[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = rust.slice(opened, end);
  keysAt.opened = opened;
  // Top-level keys only: a nested `{"severity": …}` inside `diagnostics` is
  // that array's business and has its own interface.
  const out = [];
  let level = 0;
  for (const [, key, brace] of body.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:|([{}])/gu)) {
    if (brace === "{") level += 1;
    else if (brace === "}") level -= 1;
    else if (level === 1) out.push(key);
  }
  return out;
}

/** The field names of one `export interface` in `api.ts`. */
function fieldsOf(ts, name) {
  const at = ts.indexOf(`export interface ${name} {`);
  if (at < 0) return null;
  const end = ts.indexOf("\n}", at);
  const body = ts.slice(at, end);
  return [...body.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)\??:/gmu)].map((m) => m[1]);
}

export async function run() {
  const rust = {
    "lib.rs": await readFile(path.join(ENGINE, "lib.rs"), "utf8"),
    "jump.rs": await readFile(path.join(ENGINE, "jump.rs"), "utf8"),
    "services.rs": await readFile(path.join(ENGINE, "services.rs"), "utf8"),
  };
  const ts = await readFile(path.join(SRC, "api.ts"), "utf8");

  ok("the seam is stated", SEAM.length >= 17, `${SEAM.length} response shapes`);

  const declaredIn = new Map();
  const covered = new Set();
  for (const row of SEAM) {
    const sent = keysAt(rust[row.file], row.at, row.nth ?? 0);
    const opened = keysAt.opened;
    covered.add(`${row.file}:${opened}`);
    ok(`${row.what}: the literal is where the seam says`, sent !== null, `${row.file}`);
    if (!sent) continue;

    let read = declaredIn.get(row.ts);
    if (!read) {
      read = fieldsOf(ts, row.ts);
      declaredIn.set(row.ts, read);
    }
    ok(`${row.ts} is an interface in api.ts`, read !== null, row.ts);
    if (!read) continue;

    const allowed = new Set([...read, ...(EXTRA_SENT[row.ts] ?? [])]);
    const undeclared = sent.filter((key) => !allowed.has(key));
    ok(
      `${row.what}: everything it sends is declared`,
      undeclared.length === 0,
      undeclared.length ? `not on ${row.ts}: ${undeclared.join(", ")}` : row.ts,
    );

    const missing = read.filter((key) => !sent.includes(key) && !row.optional.includes(key));
    ok(
      `${row.what}: and everything ${row.ts} declares is sent`,
      missing.length === 0,
      missing.length ? `declared and absent: ${missing.join(", ")}` : "all sent",
    );

    // The `optional` list is a claim, not a skip list: a key named there that
    // *is* sent means the claim went stale and the row should stop making it.
    const wrong = row.optional.filter((key) => sent.includes(key));
    ok(
      `${row.what}: and nothing claimed absent is present`,
      wrong.length === 0,
      wrong.length ? `claimed optional and sent: ${wrong.join(", ")}` : "as claimed",
    );
  }

  // Every response literal in the three files is covered by a row above.
  //
  // By **offset**, not by count: two rows pointing at one literal would look
  // like coverage and be one literal checked twice. Without this the seam is
  // whatever somebody remembered to write down, which is the failure mode of
  // every hand-written mirror — including the fifty-nine interfaces on the
  // other side of this comparison, before Girsa wrote its version of this file.
  {
    const uncovered = [];
    for (const [file, body] of Object.entries(rust)) {
      // Response literals only: the ones under `#[cfg(test)]` are fixtures.
      const tests = body.indexOf("\n#[cfg(test)]");
      const shipping = tests === -1 ? body : body.slice(0, tests);
      for (const m of shipping.matchAll(/json!\(\{/gu)) {
        if (!covered.has(`${file}:${m.index}`)) {
          uncovered.push(`${file}:${shipping.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    ok(
      "every response literal the engine ships has a row here",
      uncovered.length === 0,
      uncovered.length ? `no row for: ${uncovered.join(", ")}` : `${covered.size} literals`,
    );
  }
}
