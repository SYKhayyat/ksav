// The pure-move verifier for the main.ts split.
//
// The split plan's rule 1 says a move commit relocates code verbatim: no renames,
// no edits, no reformatting. That sentence is only worth anything if it is a
// checkable claim — the chrome around main.ts has close to zero behavioral
// tests, so verbatim-ness is the whole safety net — and this file is what
// checks it.
//
//   node tools/moved.mjs              # compare now against HEAD~1
//   node tools/moved.mjs HEAD~2       # or against any commit
//
// It walks every top-level declaration in `src/*.ts`, finds the same-named
// declaration in the commit's tree, and token-compares the two. A declaration
// that appears in a different file than the commit has it in is a *passenger* —
// it is supposed to have moved. A passenger whose token stream differs is
// drift, and the run goes red naming the token where the two disagree.
//
// Token-compare, not text-compare: comments and whitespace travel with the code
// and are irrelevant to the claim (the claim is about code), but a rename or a
// reformat inside a moved body is drift, and so is a changed string literal.
//
// The one benign difference is `export`. A moved declaration gains `export`
// for the first time when it lands in a module of its own; the verifier drops
// the leading `export` keyword from both sides before comparing. Everything
// else — the type annotations included — is load-bearing.
//
// Nothing moved at all exits 1: this tool exists to verify move commits, and a
// run that verifies nothing says so rather than waving itself through.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..");
const SRC_DIR = path.join(APP_DIR, "src");

/** Every `*.ts` module name in `src/`, as written. */
function srcFiles() {
  return readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
}

// ---------------------------------------------------------------- tokenizing
//
// Identifiers, numbers, string contents and punctuation, in order; comments and
// whitespace out. Template interpolations are tokenized as code — that is why
// `left:${x}px` compares against its own `x` and not as one opaque string.

function tokens(src) {
  const out = [];
  let i = 0;
  const n = src.length;

  const readString = (quote) => {
    out.push(quote);
    i++;
    while (i < n) {
      const c = src[i];
      if (c === "\\") {
        out.push(src.slice(i, i + 2));
        i += 2;
        continue;
      }
      out.push(c);
      i++;
      if (c === quote) return;
    }
    out.push("unterminated-string");
  };

  // Reads a template literal character by character; `depth` is how many
  // interpolations we are inside (a nested backtick inside `${…}`).
  const readTemplate = (depth) => {
    if (depth === 0) i++; // past the opening backtick
    out.push("`");
    while (i < n) {
      const c = src[i];
      if (c === "\\") {
        out.push(src.slice(i, i + 2));
        i += 2;
        continue;
      }
      if (c === "`") {
        out.push("`");
        i++;
        return; // closes a template at any depth
      }
      if (c === "$" && src[i + 1] === "{") {
        out.push("interp");
        i += 2;
        readInterp();
        continue;
      }
      out.push(c);
      i++;
    }
    out.push("unterminated-template");
  };

  const readInterp = () => {
    let depth = 1;
    while (i < n) {
      const c = src[i];
      if (c === "}" && depth === 1) {
        i++;
        return;
      }
      if (c === "{" || c === "(" || c === "[") depth++;
      if ((c === "}" || c === ")" || c === "]") && depth > 1) depth--;
      if (c === "/" && src[i + 1] === "/") {
        while (i < n && src[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        i = src.indexOf("*/", i) + 2;
        continue;
      }
      if (c === "'" || c === "\"") {
        readString(c);
        continue;
      }
      if (c === "`") {
        readTemplate(1);
        continue;
      }
      if (!/\s/.test(c)) out.push(c);
      i++;
    }
    out.push("unterminated-interp");
  };

  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i) + 2;
      continue;
    }
    if (c === "'" || c === "\"") {
      readString(c);
      continue;
    }
    if (c === "`") {
      readTemplate(0);
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      out.push(src.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9a-fA-F._xXbBoO]/.test(src[j])) j++;
      out.push(src.slice(i, j));
      i = j;
      continue;
    }
    if (!/\s/.test(c)) out.push(c);
    i++;
  }
  return out;
}

/** A declaration's token stream with the benign leading `export` dropped. */
function declTokens(decl) {
  const t = tokens(decl.text);
  if (t[0] === "export") t.shift();
  return t;
}

const show = (v) => JSON.stringify(v);

// ------------------------------------------------------- finding declarations

/**
 * The top-level declarations of one source text, in order.
 *
 * Column 0 only — the file's top level, never a nested function — and
 * kind-led only, which is deliberately narrower than TypeScript's grammar.
 * A declaration ends where its braces close (functions, classes) or where a
 * top-level `;` falls (let/const/var), with strings, templates and comments
 * skipped on the way so their contents cannot open or close anything.
 */
function declarations(text) {
  const out = [];
  const re =
    /^((?:export\s+)?(?:(?:async\s+)?function\*?\s+|const\s+|let\s+|var\s+|class\s+)([\w$]+))/;
  const lines = text.split("\n");

  // The text offset where line `j` begins.
  const startOfLine = (j) => lines.slice(0, j).join("\n").length + (j === 0 ? 0 : 1);

  for (let li = 0; li < lines.length; li++) {
    const m = re.exec(lines[li]);
    if (!m) continue;
    const name = m[2];
    const begin = startOfLine(li);
    let i = begin + m[0].length;
    let depth = 0;
    let openSeen = false;
    let ended = false;
    while (i < text.length && !ended) {
      const c = text[i];
      if (c === "/" && text[i + 1] === "/") {
        const nl = text.indexOf("\n", i);
        i = nl < 0 ? text.length : nl + 1;
        continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        i = Math.max(i + 2, text.indexOf("*/", i) + 2);
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        i++;
        while (i < text.length) {
          if (text[i] === "\\") {
            i += 2;
            continue;
          }
          if (c !== "`" && text[i] === c) {
            i++;
            break;
          }
          if (c === "`" && text[i] === "`") {
            i++;
            break;
          }
          i++;
        }
        continue;
      }
      if (c === "{") {
        depth++;
        openSeen = true;
      } else if (c === "}") {
        depth--;
        if (openSeen && depth === 0) {
          ended = true;
          i++;
          break;
        }
      } else if (c === "(" || c === "[") {
        depth++;
      } else if (c === ")" || c === "]") {
        depth--;
      } else if (c === ";" && depth === 0 && !openSeen) {
        ended = true;
        i++;
        break;
      }
      i++;
    }
    if (openSeen && depth !== 0 && !ended) {
      out.push({ name, start: li, end: lines.length, text: lines.slice(li).join("\n") });
    } else {
      const endOffset = i;
      out.push({ name, start: li, text: text.slice(begin, endOffset) });
    }
    // Jump the outer line scan past what this declaration has consumed.
    li = Math.max(li, text.slice(begin, i).split("\n").length + li - 1);
  }
  return out;
}

// ---------------------------------------------------------------- the compare
//
// `node tools/moved.mjs [commit]`

const commit = process.argv[2] ?? "HEAD~1";
const toplevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: APP_DIR,
  encoding: "utf8",
}).trim();

const oldByName = new Map(); // name -> [{ file, decl }]
const tracked = new Set(
  execFileSync("git", ["ls-files", "ksav/app/src"], { cwd: toplevel, encoding: "utf8" })
    .split("\n")
    .filter(Boolean),
);
for (const f of srcFiles()) {
  const repoPath = `ksav/app/src/${f}`;
  if (!tracked.has(repoPath)) continue;
  let text;
  try {
    text = execFileSync("git", ["show", `${commit}:${repoPath}`], { encoding: "utf8" });
  } catch {
    continue;
  }
  for (const d of declarations(text)) {
    if (!oldByName.has(d.name)) oldByName.set(d.name, []);
    oldByName.get(d.name).push({ file: f, d });
  }
}

const moved = [];
const drift = [];
const ambiguous = [];
for (const f of srcFiles()) {
  const d2 = declarations(readFileSync(path.join(SRC_DIR, f), "utf8"));
  for (const d of d2) {
    const candidates = oldByName.get(d.name) ?? [];
    if (candidates.length === 0) continue; // nothing by this name at the commit
    if (candidates.every((c) => c.file === f)) continue; // stayed where it was
    const others = candidates.filter((c) => c.file !== f);
    if (candidates.some((c) => c.file === f)) {
      // Name exists here *and* elsewhere — a duplicate, not a passenger.
      ambiguous.push(`${f}: ${d.name} — a same-name declaration stayed in this file; nothing to verify.`);
      continue;
    }
    if (others.length > 1) {
      // Same name in several files at the commit: which one moved is not
      // decidable by name alone, so the honest answer is "ambiguous", not a
      // drift claim built on the wrong guess.
      ambiguous.push(`${f}: ${d.name} — lives in ${others.length} files at ${commit}; ambiguous, not verified.`);
      continue;
    }
    const old = others[0];
    moved.push({ name: d.name, from: old.file, to: f });
    if (JSON.stringify(declTokens(old.d)) !== JSON.stringify(declTokens(d))) {
      const older = declTokens(old.d);
      const now = declTokens(d);
      const since = older.length <= now.length ? older.length : now.length;
      let at = 0;
      while (at < since && older[at] === now[at]) at++;
      drift.push(
        `${f}: ${d.name} (from ${old.file}) drifts at token ${at}\n` +
          `    old: …${older.slice(Math.max(0, at - 3), at + 4).map(show).join(" ")}…\n` +
          `    new: …${now.slice(Math.max(0, at - 3), at + 4).map(show).join(" ")}…`,
      );
    }
  }
}

if (moved.length === 0) {
  console.error(
    `moved.mjs: no declaration moved between ${commit} and now.\n` +
      `This is the pure-move verifier; a commit with nothing moved is not a move commit.`,
  );
  process.exit(1);
}
// The caller check (the audit's #156): after a move, no other module may reach
// the name *through the old file* — that is a stale re-export route, the thing
// a reader follows to the wrong home. The old file citing the name itself is
// fine (it imports the moved code, exactly as a rewired caller should); what
// this looks for is `import { name } from "./oldfile"` somewhere else.
// The caller check (the audit's #156): after a move, no other module may reach
// the name *through the old file* — `import { name } from "./oldfile"` — which
// is either a re-export route a reader follows to the wrong home, or the old
// file still declaring the name. Sound per-wave (names are assumed unique in
// one commit's diff); against a many-wave base, same-name declarations in other
// files make it noisy, so this is information, not a gate.
const stale = [];
for (const m of moved) {
  const base = m.from.replace(/\.ts$/, "");
  const route = new RegExp(
    `import\\s*\\{[^}]*\\b${m.name}\\b[^}]*\\}\\s*from\\s*"\\./${base}"`,
  );
  for (const f of srcFiles()) {
    if (f === m.from || f === m.to) continue;
    const src = readFileSync(path.join(SRC_DIR, f), "utf8");
    if (route.test(src)) {
      stale.push(`  ${f}: imports ${m.name} from ${m.from} — the name moved to ${m.to}`);
    }
  }
}

for (const m of moved) console.log(`moved  ${m.name}  ${m.from} → ${m.to}`);
for (const a of ambiguous) console.log(`skip   ${a}`);
if (stale.length) {
  console.log(`rewire check — old modules still citing moved names (re-export or prune?):`);
  for (const s of stale) console.log(s);
}
for (const a of ambiguous) console.log(`skip   ${a}`);
if (drift.length) {
  console.error(`\n${moved.length} moved, ${drift.length} DRIFTED:`);
  for (const d of drift) console.error(`  ${d}`);
  process.exit(1);
}
console.log(`\n${moved.length} moved, zero drift — code identical, only moved.`);
