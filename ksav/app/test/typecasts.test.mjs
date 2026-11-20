// `as unknown as` — the one construct `tsc --strict` cannot argue with.
//
// # Why this file exists (#221)
//
// `strict: true` is on, `noUnusedLocals` and `noUnusedParameters` are on, and the
// tree still had a **wire shape written out by hand inside a cast**:
//
//     const res = (await backend.compile(…))
//       as unknown as { ok: boolean; html?: string; diagnostics?: … };
//
// `Backend.compile` already answered `CompileResult`. Throwing it away to declare
// three of its nine keys by hand made the compile answer the one reader
// `wire.test.mjs` could not see — the comparator reads `api.ts`'s interfaces and
// this literal was not one — so a field the engine stopped sending would have
// arrived as `undefined` with nothing anywhere saying so.
//
// A second cast did the same thing to a *capability*: `main.ts` probed
// `(backend as { dictionary?: unknown }).dictionary` and then wrote the answer's
// shape out again, because `dictionary()` is on `TauriBackend` and on no
// interface. Both are now declarations (`CompileResult`, `WireCompileResult`,
// `Dictionary`) and both are gone.
//
// # What this fence is
//
// Every `as unknown as` in `src/` is named below with the reason it is honest,
// and the count is asserted. The remaining ones are DOM-lib mismatches and the
// settings drawer reading keys by name; a *new* one — the shape of thing that
// hid the compile answer — fails until somebody writes down why it is not the
// same disease. A `as X` between types with a common shape is not this file's
// subject: it is checked by the compiler. `as unknown as` is the grammar's only
// legal way to lie to it, and a lie with a written reason is a decision.

import { ok } from "./harness.mjs";
import { srcOf, sourceFiles } from "./source.mjs";

/**
 * The casts that stay, each with what it is a lie about.
 *
 * `at` is a distinctive fragment of the line, not a line number: a fence keyed to
 * a line number goes red when a comment is added above it and stops being read
 * when somebody "fixes" it by editing the number. `count` is how many times the
 * fragment appears in that file — two identical casts in one function are one
 * decision, and a third has to be argued for.
 */
const EXEMPT = [
  {
    file: "files.ts",
    at: "as unknown as BufferSource",
    count: 1,
    why:
      "DOM lib: a `Uint8Array` is a `BufferSource` at runtime, and TypeScript 5.7's " +
      "generic `ArrayBufferLike` is not assignable to it in either direction. The " +
      "value is our own bytes; the disagreement is the standard library's.",
  },
  {
    file: "files.ts",
    at: "as unknown as BlobPart",
    count: 1,
    why: "The same `Uint8Array` one line later, into `Blob`'s part list — same lib mismatch.",
  },
  {
    file: "reconcile.ts",
    at: "as unknown as { children?: ArrayLike<Node> }",
    count: 1,
    why:
      "`node.children` exists on `Element`, and the reconciler is handed `Node` " +
      "because the caller may have a text node. No wire, no contract: one DOM " +
      "property read defensively, and the answer is guarded.",
  },
  {
    file: "wasm-worker.ts",
    at: "as unknown as Worker",
    count: 1,
    why:
      "Inside the worker the global scope is a `DedicatedWorkerGlobalScope`, not a " +
      "`Worker`; the DOM lib has no common interface with `postMessage` on both. A " +
      "browser global's typing, not this program's.",
  },
  {
    file: "keymodes.ts",
    at: "as unknown as Parameters<typeof registerUnits>[0]",
    count: 1,
    why: "The same `vim` module one layer out — `Vim`'s own type is not the keymap's.",
  },
  {
    file: "settings.ts",
    at: "as unknown as Record<string, unknown>",
    count: 5,
    why:
      "The settings drawer reads and writes **every key by name** (`keyof Settings` " +
      "iteration), and an interface with no index signature is not a `Record`. The " +
      "blocks are `unknown` on purpose: each is validated by the field that reads " +
      "it, and the drawer's whole job is to be generic over the settings schema.",
  },
  {
    file: "settings.ts",
    at: "as unknown as DocConfig",
    count: 1,
    why: "`out` is assembled field by field from the same schema; the last step is the nominal type.",
  },
  {
    file: "settings.ts",
    at: "as ValueOf<K>",
    count: 1,
    why: "The read half of the same generic-by-name lookup — `ValueOf<K>` is the key's own type.",
  },
  {
    file: "styles.ts",
    at: "as unknown as Record<StyleCommand, readonly string[]>",
    count: 1,
    why:
      "A literal table is checked key by key against the union by the test that reads " +
      "it; `Record<Union, T>` cannot be asserted of an object literal without one of " +
      "these, and the assertion is the reason the table can be indexed by name.",
  },
];

/** How many `as unknown as` the tree has, as a claim rather than a tally. */
const TOTAL_CASTS = 12;

/** Source with `//` and `/* … *\/` comments removed. */
function stripped(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, (m) => m.replace(/[^\n]/gu, " "))
    .replace(/(^|\s)\/\/.*$/gmu, "$1");
}

/** Every `as unknown as` in `src/`, as `file\0line\0snippet`. */
function casts() {
  const out = [];
  for (const file of sourceFiles()) {
    const text = stripped(srcOf(file));
    for (const [i, line] of text.split("\n").entries()) {
      if (!line.includes("as unknown as")) continue;
      out.push({ file, line: i + 1, text: line.trim() });
    }
  }
  return out;
}

export async function run() {
  const found = casts();

  ok("some casts remain, so this fence has a subject", found.length > 0, `${found.length} casts`);

  // Every cast is claimed by an exemption, and every exemption's count is exact.
  {
    const unclaimed = found.filter(
      (cast) => !EXEMPT.some((e) => e.file === cast.file && cast.text.includes(e.at)),
    ).map((cast) => `${cast.file}:${cast.line} ${cast.text}`);
    ok(
      "every `as unknown as` in src/ is one the list below names",
      unclaimed.length === 0,
      unclaimed.length
        ? `unclaimed: ${unclaimed.join(" · ")}`
        : `${found.length} casts, ${EXEMPT.length} reasons`,
    );

    const stale = [];
    for (const entry of EXEMPT) {
      // Counted per entry, not per line: one line can carry two of these
      // (`settings.ts:1403` reads a key by name *and* answers it as `ValueOf<K>`),
      // and each is its own claim.
      const seen = found.filter((c) => c.file === entry.file && c.text.includes(entry.at)).length;
      if (seen !== entry.count) stale.push(`${entry.file} ${entry.at}: ${seen} not ${entry.count}`);
    }
    ok(
      "…and every reason still has the casts it is about",
      stale.length === 0,
      stale.length ? `stale: ${stale.join(" · ")}` : "all current",
    );
  }

  // The two that made this file exist. Positive assertions rather than a count,
  // because these are rules with a subject: the compile answer is read as
  // `CompileResult`, and the dictionary capability is asked for, not probed.
  {
    const compile = srcOf("compile.ts");
    ok(
      "the html compile reader uses the declared answer, not a hand-written one",
      /const res: CompileResult = await backend\.compile\(/u.test(compile),
    );
    const main = srcOf("main.ts");
    ok("the dictionary capability is asked for through `api.ts`", /dictionaryOf\(runtime\.backend\)/u.test(main));
    ok("…and nothing probes for it with a cast", !/as \{ dictionary\?: unknown \}/u.test(main));
    const api = srcOf("api.ts");
    ok("the capability is declared", /export interface Dictionary \{\n  dictionary\(\)/u.test(api));
    ok(
      "and the wire's `null` page is in its own type",
      /export interface WireCompileResult extends Omit<CompileResult, "pages_svg">/u.test(api),
    );
  }

  // The count is the claim. Growing it is a decision somebody writes down here;
  // shrinking it is somebody deleting the line and the entry together.
  ok(
    `the tree has exactly the ${TOTAL_CASTS} casts reasoned about here`,
    found.length === TOTAL_CASTS,
    `${found.length} found, ${TOTAL_CASTS} reasoned`,
  );
}
