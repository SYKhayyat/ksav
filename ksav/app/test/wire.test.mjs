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
import { readdir, readFile } from "node:fs/promises";
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
    optional: ["html", "asset_cache"],
  },
  {
    what: "an html compile that produced a document",
    file: "lib.rs",
    at: '"ok": true, "html": html',
    ts: "CompileResult",
    // Nothing is laid out for HTML: no pages, no fingerprints, no PDF, no
    // assembled source and no page runs. What the caller reads is `html`.
    optional: ["pages_svg", "pages_hash", "pdf_base64", "typst_source", "pages_lines", "pages_text", "note_markers"],
  },
  {
    what: "an html compile that failed",
    file: "lib.rs",
    at: '"html": serde_json::Value::Null',
    ts: "CompileResult",
    optional: ["pages_svg", "pages_hash", "pdf_base64", "typst_source", "pages_lines", "pages_text", "note_markers"],
  },
  {
    what: "assemble: the document as Typst, with nothing laid out",
    file: "lib.rs",
    at: '"prelude_name": PRELUDE_PATH',
    ts: "AssembledSource",
    // The prelude pair is #130's compact arrangement; the self-contained answer
    // sends the same two keys with an empty `prelude`, deliberately, so that one
    // shape covers both rather than two shapes that have to be told apart.
    optional: [],
  },
  {
    what: "assemble, when the request would not read",
    file: "lib.rs",
    at: '                "typst_source": "",',
    ts: "AssembledSource",
    optional: ["prelude", "prelude_name"],
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
    // #82. The list beside `reveal`'s single answer, and the row is here because
    // the seam is the whole claim: a field added to the engine's answer and not
    // to `Places` is a field every client reads as `undefined`, which is how a
    // response loses a field without anything noticing. `first` is the one that
    // matters — the client is forbidden from deriving it from the list, so if the
    // engine stopped sending it the client would silently answer `null`.
    what: "places: every place one line of a part ended up, and the first of them",
    file: "jump.rs",
    at: '"places": places',
    ts: "Places",
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
    optional: ["pages_hash", "html", "missing_assets", "asset_cache", "pages_lines", "pages_text", "note_markers"],
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
    at: 'json!({ "told": true })',
    ts: "Told",
    // The reason travels only on a refusal.
    optional: ["why"],
  },
  {
    what: "saved-here: Girsa refused, and said why",
    file: "services.rs",
    at: '"told": false, "why": why',
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
    optional: ["why"],
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

  // --------------------------------------------- the nine services #225 found
  //
  // Each of these is a service whose answer shape was declared on this side and
  // compared to nothing at all: a key renamed in Rust reached the client as
  // `undefined`, in one of three transports, and the whole suite stayed green.
  // The rows are here so that cannot happen again, and `ANSWERS` below is what
  // makes the *set* of them a claim rather than a memory.
  {
    what: "spell: every word the checker does not know, and how much it knows",
    file: "spell/mod.rs",
    at: '"misspellings": found,',
    ts: "SpellResult",
    optional: [],
  },
  {
    what: "spell: one finding, positioned in UTF-16 code units",
    file: "spell/mod.rs",
    at: '"start": start,',
    ts: "Misspelling",
    // Added only when the caller asked for suggestions, so the absence is a
    // claim about the answer and not a gap in the row.
    optional: ["suggestions"],
  },
  {
    what: "spell, when the request would not read",
    file: "spell/mod.rs",
    at: '"error": format!("malformed spell request',
    ts: "Refusable",
    optional: [],
  },
  {
    what: "suggest: words near the one that was not recognised",
    file: "spell/mod.rs",
    at: '"suggestions": checker.suggest(word, limit)',
    ts: "Suggestions",
    optional: [],
  },
  {
    what: "sefarim: the catalogue, under the one key it travels in",
    file: "sefarim.rs",
    at: '"sefarim": entries',
    ts: "SefarimAnswer",
    optional: [],
  },
  {
    what: "sefarim: one sefer in it",
    file: "sefarim.rs",
    at: '"canonical": s.canonical',
    ts: "SeferDef",
    optional: [],
  },
  // Three answers that are not `json!` literals at all: `serde` serialises a
  // struct, so the field *declarations* are the wire. Read as declarations, by
  // the same rule — a field renamed in the struct is a field the client stops
  // receiving, and no compiler here writes both sides.
  {
    what: "commands: the registry, as `Command` serialises",
    file: "commands.rs",
    struct: "Command",
    ts: "CommandDef",
    optional: [],
  },
  {
    what: "templates: the registry, as `Template` serialises",
    file: "templates.rs",
    struct: "Template",
    ts: "TemplateDef",
    optional: [],
  },
  {
    what: "inbox: the sources waiting for the cursor, as `Arrival` serialises",
    file: "post.rs",
    struct: "Arrival",
    ts: "Arrival",
    optional: [],
  },
  //
  // ------------------------------------------------ git: eighteen operations
  //
  // `GitAnswer` is one superset shape: every operation's answer is a subset of
  // it, because the refusal shape is shared and the drawer reads one type. So
  // each row below claims *this answer sends exactly these keys* (`optional:
  // "*"`) and the union rule below — every key the interface declares is sent
  // by some answer — is what keeps the superset honest.
  {
    what: "git status, in a document outside any repository",
    file: "git.rs",
    at: '"root": serde_json::Value::Null,',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git status, in a repository",
    file: "git.rs",
    at: '"root": root.to_string_lossy()',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git status: the document itself",
    file: "git.rs",
    at: '"path": rel,',
    ts: "GitThis",
    optional: [],
  },
  {
    what: "git status: who git will record as the author",
    file: "git.rs",
    at: '"name": name, "email": email',
    ts: "GitWho",
    optional: [],
  },
  {
    what: "git log: an empty history",
    file: "git.rs",
    at: '"commits": []',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git log: the history",
    file: "git.rs",
    at: '"commits": read_log',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git log: one commit in the history",
    file: "git.rs",
    at: '"hash": f[0],',
    ts: "GitCommit",
    optional: [],
  },
  {
    what: "git show: the document at a commit",
    file: "git.rs",
    at: '"text": r.out',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git: git did what it was asked and said so",
    file: "git.rs",
    at: '"said": r.message()',
    every: true,
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git commit: the hash it made",
    file: "git.rs",
    at: '"hash": hash, "said": r.message()',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git: the operation finished and had nothing to say",
    file: "git.rs",
    at: '"ok": true })',
    every: true,
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git branches: the list",
    file: "git.rs",
    at: '"branches": list',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git branches: one branch in it",
    file: "git.rs",
    at: '"name": f.first().copied()',
    ts: "GitBranch",
    optional: [],
  },
  {
    what: "git merge: it merged",
    file: "git.rs",
    at: '"merged": true,',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git merge: it stopped on conflicts, which is not a failure",
    file: "git.rs",
    at: '"merged": false,',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git remotes: the list",
    file: "git.rs",
    at: '"remotes": list',
    ts: "GitAnswer",
    optional: "*",
  },
  {
    what: "git remotes: one remote in it",
    file: "git.rs",
    at: '"name": name, "url": url',
    ts: "GitRemote",
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
 * Which interface each service answers with — the list `wire.test.mjs` did not
 * have, and the reason nine answers went unchecked (`#225`).
 *
 * Read as a claim by the fence in `run()`: **every service in the engine's
 * registry** is named here or in `EXEMPT` with a reason, and every interface
 * named here has a row above. Adding a service without a row is then a red
 * test rather than an untested answer — the property `services.rs` gives the
 * four transports, one level down.
 */
const ANSWERS = {
  compile: ["CompileResult"],
  assemble: ["AssembledSource"],
  jump: ["Located"],
  reveal: ["Revealed"],
  places: ["Places"],
  spell: ["SpellResult", "Misspelling", "Refusable"],
  suggest: ["Suggestions"],
  commands: ["CommandDef"],
  templates: ["TemplateDef"],
  sefarim: ["SefarimAnswer", "SeferDef"],
  inbox: ["Arrival"],
  linkify: ["Linkified"],
  refresh: ["RefreshResult"],
  "clipboard-source": ["ClipboardSource"],
  "saved-here": ["Told"],
  git: ["GitAnswer", "GitThis", "GitWho", "GitCommit", "GitBranch", "GitRemote"],
};

/**
 * Services with no row above, and the instrument that fences them instead.
 *
 * Both entries are exemptions of *mechanism*, not of coverage: each names a
 * fence that compares the two sides harder than this file could.
 */
const EXEMPT = {
  scan:
    "`tools/emit-scan-oracle.mjs` writes fixtures from the Rust scanner and " +
    "`spans.scanWire` is compared to them value by value, which catches a " +
    "renamed key as a failing object, not as an `undefined` at a call site",
  mekoros:
    "Girsa's own JSON, handed to the editor unchanged — `post.rs`'s own words: " +
    "a shape re-described on the way through is a shape that drifts, so the " +
    "change to make it wrong has to be made in Girsa and the fixture that " +
    "catches it belongs there",
};

/**
 * Literals in the swept files that are **not answers**, and why.
 *
 * The exhaustiveness fence below walks every `json!({` in a shipping file; a
 * literal that is a question to somebody else is not an answer this file has
 * anything to say about, and saying so is cheaper than a row that pretends to
 * compare it.
 */
const NOT_ANSWERS = [
  {
    file: "post.rs",
    at: '"phrase": phrase, "except": except',
    why: "an errand to Girsa over the loopback, not an answer from the engine",
  },
  { file: "post.rs", at: '"phrase": phrase })', why: "an errand to Girsa, not an answer" },
  { file: "post.rs", at: '"text": prose', why: "an errand to Girsa, not an answer" },
];

/**
 * Declared keys that no row's literal sends, and the door that does send them.
 *
 * `error` is the shared refusal: every service that can refuse answers through
 * `services::error_json`, whose literal has its own row above and whose
 * interface is `CompileResult`. So a service whose *own* answers never carry one
 * still declares it, deliberately — one shape for failure in all four builds.
 */
const DECLARED_ELSEWHERE = {
  GitAnswer: ["error"],
  Mekoros: ["error"],
  // Added to the finding after the literal is built — `o["suggestions"] =
  // serde_json::json!(…)` when the caller asked for them — so it is a key this
  // answer really sends and one a `json!` reader cannot see.
  Misspelling: ["suggestions"],
};

/**
 * The `json!({ … })` literal containing the `nth` occurrence of `at`: its
 * offsets and its top-level keys.
 *
 * `nth` because two literals really are identical: `clipboard-source` answers
 * `{"markup": null}` from three places — a packet that will not read, a build
 * with no clipboard, and the wasm build that has neither — and the sameness is
 * the design (*"every way this can go wrong has the same right answer"*). Three
 * rows pointing at one fragment would look like coverage and be one literal
 * checked three times.
 */
function literalAt(rust, at, nth = 0) {
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
  // Top-level keys only: a nested `{"severity": …}` inside `diagnostics` is
  // that array's business and has its own interface.
  const keys = [];
  let level = 0;
  for (const [, key, brace] of rust.slice(opened, end).matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:|([{}])/gu)) {
    if (brace === "{") level += 1;
    else if (brace === "}") level -= 1;
    else if (level === 1) keys.push(key);
  }
  return { opened, end, keys };
}
let TS_API = "";
let TS_GEN = "";

/** The field names of one `export interface` in `api.ts` — or `engine.gen.ts`,
 *  where the generated tables live (`TemplateDef` is re-exported from there). */
function fieldsOf(ts, name) {
  for (const body of [ts, TS_GEN]) {
    const at = body.indexOf(`export interface ${name} {`);
    if (at >= 0) {
      const end = body.indexOf("\n}", at);
      return [...body.slice(at, end).matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)\??:/gmu)].map((m) => m[1]);
    }
    // An interface that extends another declares only what it adds.
    const heir = new RegExp(`export interface ${name} extends ([A-Za-z_][A-Za-z0-9_]*) \\{`, "u").exec(body);
    if (heir) {
      const own = body.indexOf(heir[0]);
      const end = body.indexOf("\n}", own);
      const added = [...body.slice(own, end).matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)\??:/gmu)].map((m) => m[1]);
      return [...(fieldsOf(ts, heir[1]) ?? []), ...added];
    }
  }
  return null;
}

/**
 * The fields a `serde::Serialize` struct puts on the wire.
 *
 * The declaration *is* the wire for a struct — the same claim a `json!` literal
 * makes — so the row kind `struct:` reads the declaration. `#[serde(rename = "x")]`
 * is honoured because it renames the wire and not the field; a `skip` is
 * dropped for the same reason.
 */
function structFields(rust, name) {
  const at = rust.indexOf(`pub struct ${name} {`);
  if (at < 0) return null;
  const end = rust.indexOf("\n}", at);
  const body = rust.slice(at, end);
  const out = [];
  let rename = null;
  for (const line of body.split("\n")) {
    const renamed = /^\s*#\[serde\(rename = "([A-Za-z_][A-Za-z0-9_]*)"\)\]/.exec(line);
    if (renamed) {
      rename = renamed[1];
      continue;
    }
    if (/^\s*#\[(serde|doc)/.test(line)) continue;
    const field = /^\s*pub ([a-z_][a-z0-9_]*):/.exec(line);
    if (field) {
      out.push(rename ?? field[1]);
      rename = null;
    }
  }
  return out;
}

/** Every offset `at` appears at, in shipping code only. */
function allAt(rust, at) {
  const out = [];
  let found = -1;
  for (;;) {
    found = rust.indexOf(at, found + 1);
    if (found < 0) return out;
    out.push(found);
  }
}

/**
 * The files whose every `json!({` literal must be accounted for.
 *
 * The three this file began with, plus the five `#225` added. `scan.rs` is here
 * by *exemption* rather than omission: its answer shape is fenced value by value
 * by the scan oracle, which is a stronger comparison than a key list.
 */
const SWEPT = [
  "lib.rs",
  "jump.rs",
  "services.rs",
  "git.rs",
  "post.rs",
  "sefarim.rs",
  "spell/mod.rs",
];

/** Shipping code of one engine file: everything before its first test module. */
function shippingOf(body) {
  const tests = body.indexOf("\n#[cfg(test)]");
  return tests === -1 ? body : body.slice(0, tests);
}

export async function run() {
  TS_API = await readFile(path.join(SRC, "api.ts"), "utf8");
  TS_GEN = await readFile(path.join(SRC, "engine.gen.ts"), "utf8");

  const cache = new Map();
  const rust = async (file) => {
    if (!cache.has(file)) {
      cache.set(file, await readFile(path.join(ENGINE, file), "utf8"));
    }
    return cache.get(file);
  };

  ok("the seam is stated", SEAM.length >= 37, `${SEAM.length} response shapes`);

  const declaredIn = new Map();
  const covered = new Set();
  /** Every key some row sends, per interface — the union rule's input. */
  const sentByTs = new Map();
  for (const row of SEAM) {
    const body = await rust(row.file);
    // Two row kinds: a `json!` literal, and a serialised struct's declaration.
    let sent;
    if (row.struct) {
      sent = structFields(shippingOf(body), row.struct);
      ok(`${row.what}: the struct is where the seam says`, sent !== null, `${row.file}`);
    } else if (row.every) {
      // One shape from several places — `{"ok": true}` is four operations'
      // answer and one sentence. Every occurrence is checked, and every
      // occurrence is *covered*, so "covered by offset" stays honest.
      const spots = allAt(shippingOf(body), row.at);
      ok(`${row.what}: the literal is where the seam says`, spots.length > 0, `${row.file}`);
      if (spots.length === 0) continue;
      sent = [];
      for (let i = 0; i < spots.length; i += 1) {
        const found = literalAt(shippingOf(body), row.at, i);
        if (!found) continue;
        covered.add(`${row.file}:${found.opened}`);
        sent.push(...found.keys);
      }
    } else {
      const found = literalAt(body, row.at, row.nth ?? 0);
      sent = found ? found.keys : null;
      if (found) covered.add(`${row.file}:${found.opened}`);
      ok(`${row.what}: the literal is where the seam says`, sent !== null, `${row.file}`);
    }
    if (!sent) continue;

    let read = declaredIn.get(row.ts);
    if (!read) {
      read = fieldsOf(TS_API, row.ts);
      declaredIn.set(row.ts, read);
    }
    ok(`${row.ts} is an interface in api.ts`, read !== null, row.ts);
    if (!read) continue;

    const union = sentByTs.get(row.ts) ?? new Set();
    for (const key of sent) union.add(key);
    sentByTs.set(row.ts, union);

    const allowed = new Set([...read, ...(EXTRA_SENT[row.ts] ?? [])]);
    const undeclared = sent.filter((key) => !allowed.has(key));
    ok(
      `${row.what}: everything it sends is declared`,
      undeclared.length === 0,
      undeclared.length ? `not on ${row.ts}: ${undeclared.join(", ")}` : row.ts,
    );

    // `optional: "*"` is not a skip list either; it is the claim the row makes
    // when the interface is a *superset* by design — `GitAnswer` is one shape
    // for eighteen operations — and the union rule below is then the only
    // honest way to state the other direction.
    if (row.optional !== "*") {
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
  }

  // Every key an interface declares is sent by *some* answer of that shape.
  //
  // The clause the header above has always stated, now enforced once for the
  // whole seam instead of row by row — which is what makes `optional: "*"`
  // honest: a declared key nobody sends is a field the editor waits for and
  // never gets, whatever any single row claims about its own answer.
  for (const [ts, union] of sentByTs) {
    const read = declaredIn.get(ts);
    if (!read) continue;
    const elsewhere = new Set([...(EXTRA_SENT[ts] ?? []), ...(DECLARED_ELSEWHERE[ts] ?? [])]);
    const missing = read.filter((key) => !union.has(key) && !elsewhere.has(key));
    ok(
      `${ts}: every key it declares is sent by some answer`,
      missing.length === 0,
      missing.length ? `declared and never sent: ${missing.join(", ")}` : `${union.size} keys`,
    );
  }

  // Every response literal in the swept files is covered by a row above, or is
  // named in `NOT_ANSWERS` with a reason.
  //
  // By **offset**, not by count: two rows pointing at one literal would look
  // like coverage and be one literal checked twice. Without this the seam is
  // whatever somebody remembered to write down, which is the failure mode of
  // every hand-written mirror — including the fifty-nine interfaces on the
  // other side of this comparison, before Girsa wrote its version of this file.
  {
    const uncovered = [];
    let literals = 0;
    for (const file of SWEPT) {
      const shipping = shippingOf(await rust(file));
      // The literals that are questions rather than answers, resolved to the
      // literal each sits inside — so the excuse is one literal and not every
      // literal that happens to share a fragment.
      const excused = new Set(
        NOT_ANSWERS.filter((n) => n.file === file)
          .map((n) => literalAt(shipping, n.at, 0)?.opened)
          .filter((opened) => opened !== undefined),
      );
      for (const m of shipping.matchAll(/json!\(\{/gu)) {
        literals += 1;
        if (covered.has(`${file}:${m.index}`) || excused.has(m.index)) continue;
        uncovered.push(`${file}:${shipping.slice(0, m.index).split("\n").length}`);
      }
    }
    ok(
      "every response literal the engine ships has a row here",
      uncovered.length === 0,
      uncovered.length ? `no row for: ${uncovered.join(", ")}` : `${literals} literals, ${covered.size} rows`,
    );
  }

  // ------------------------------- every service is either covered or exempt
  //
  // The registry is the engine's own list (`SERVICES` in `services.rs`), read
  // here rather than restated, so a nineteenth service cannot arrive without
  // either a row above or a written reason it needs none. This is the check
  // whose absence let nine answers go compared to nothing (`#225`).
  {
    const registry = await rust("services.rs");
    const names = [...registry.matchAll(/^ *svc\("([a-z-]+)"/gmu)].map((m) => m[1]);
    ok("the engine's service registry was read", names.length >= 18, `${names.length} services`);

    const checked = new Set();
    for (const row of SEAM) if (row.ts) checked.add(row.ts);
    const uncovered = names.filter(
      (name) => !(name in EXEMPT) && !(ANSWERS[name] ?? []).every((ts) => checked.has(ts)),
    );
    ok(
      "every service the engine answers has a row, or a written reason it needs none",
      uncovered.length === 0,
      uncovered.length ? `no row and no exemption: ${uncovered.join(", ")}` : `${names.length} services`,
    );

    // And the other direction: a name in either table that the registry does
    // not carry is a row about a service that no longer exists, which reads as
    // coverage and is not.
    const stale = [...Object.keys(ANSWERS), ...Object.keys(EXEMPT)].filter((n) => !names.includes(n));
    ok(
      "and nothing is claimed about a service the registry does not have",
      stale.length === 0,
      stale.length ? `not in the registry: ${stale.join(", ")}` : "all present",
    );
  }
}

{
  // The mode-takeover rule, held at **both** layers it must hold at. Inside the
  // editor it works by standing `buildShortcutKeymap` down; the window resolver
  // (`runShortcutOutsideEditor`) resolves the same table from the *bubble*
  // phase, and the audit found its exception living 2,400 lines from the rule
  // with nothing connecting them: under vim, focus in a panel, every chord in
  // `DEFAULT_KEYS` still fired at window level. The fence is the connection.
  const MAIN = await readFile(path.join(HERE, "..", "src", "main.ts"), "utf8");
  // `buildShortcutKeymap` — the editor's half of the rule — moved to
  // `compartments.ts` with the notebook's machinery (the audit's #161); the
  // window resolver it must agree with stayed in main. Both halves are read.
  const KEYMAP = await readFile(path.join(HERE, "..", "src", "compartments.ts"), "utf8");
  const resolver = MAIN.slice(MAIN.indexOf("function runShortcutOutsideEditor"));
  const body = resolver.slice(0, resolver.indexOf("\n}"));
  ok("the window resolver stands down when a mode is really here", /activeMode\(\) !== "default"/.test(body));
  ok("…and does not answer a keystroke a lower handler already took", body.includes("e.defaultPrevented"));
  ok(
    "…and the editor's half states the rule beside its own stand-down",
    /activeMode\(\) !== "default" \?\s*\[\] :/.test(KEYMAP) ||
      KEYMAP.includes('if (keymodes.activeMode() !== "default") return [];'),
  );

  // --------------------------------------- the shell's command registry (#127)
  //
  // The same seam, one layer down, and the one place where a *name* is the
  // whole contract. A `#[tauri::command]` becomes callable by **being listed in
  // `generate_handler!`** — the attribute alone registers nothing — and a name
  // that the frontend invokes and the list does not carry is rejected at
  // *runtime*, in the writer's hands, as "Command ksav_save_export not found".
  // No compiler sees it and no Rust test can: both halves are strings, which is
  // this file's entire subject.
  //
  // #127 put a new command across this boundary, so the pairing is asserted:
  // every `ksav_…` name the frontend names must be one the shell registered. The
  // other direction is not a fault — `ksav_dpr_probe` and `ksav_engine` are
  // reached from Rust itself — so the check runs one way only.
  {
    const SHELL = await readFile(path.join(HERE, "..", "src-tauri", "src", "lib.rs"), "utf8");
    // The **list**, not the file. Scanning all of `lib.rs` would find the name in
    // the `///` comment above the command and stay green with it unregistered,
    // which is the failure this exists to catch — the first version of this check
    // did exactly that.
    const list = /generate_handler!\s*\[([\s\S]*?)\]/u.exec(SHELL)?.[1] ?? "";
    const registered = new Set(list.match(/ksav_[a-z0-9_]+/gu) ?? []);
    const invoked = new Map();
    for (const file of await readdir(path.join(HERE, "..", "src"))) {
      if (!file.endsWith(".ts")) continue;
      const text = await readFile(path.join(HERE, "..", "src", file), "utf8");
      for (const m of text.matchAll(/"(ksav_[a-z0-9_]+)"/gu)) {
        if (!invoked.has(m[1])) invoked.set(m[1], file);
      }
    }
    ok("the frontend really was scanned for command names", invoked.size >= 8);
    check(
      "every command the frontend invokes is registered in the shell's handler list",
      [...invoked].filter(([name]) => !registered.has(name)).map(([n, f]) => `${n} (src/${f})`),
      [],
    );
    ok("and the handler list really was read", registered.has("ksav_save_export"));
  }
}
