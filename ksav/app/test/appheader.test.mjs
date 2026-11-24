// The header's shell half: the wiring it needs and the frame's chips it draws.
//
// `header.ts` holds what the header *decides* and is tested there. This file is
// the other half — `buildHeader` draws the DOM — and drawing is not something
// the suite can hold: it has no `document`, and `tools/eyes.mjs` is where the
// picture is judged. What *can* be held here is the seam, which is the part of
// this module that can be wrong without crashing:
//
//   · the two shell verbs arrive through `wireHeader` and nowhere else, so a
//     second copy of `setSetting` here would be a fork of a rule that has one home
//   · `CHIP_RUN` covers every chip `header.chips` can produce — a chip with no
//     runner is a button that does nothing, and the type checker cannot see the
//     gap because the record is keyed by the union and a chip id is just a string
//
// The second one is the reason this file exists rather than a `MISSING` entry in
// `modules.mjs`: the mapping is checked from both ends instead of asserted by
// hand.

import { check, ok, notOk } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { dirOf } from "../tools/paths.mjs";
import path from "node:path";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");

export async function run() {
  // Importing the module proves it can be built and evaluated without booting
  // the application — the property that lets this file exist at all. The wiring
  // must be *registered* before anything can run, exactly as `main.ts`'s boot
  // does; a module that worked without it would be one that reached around the
  // seam.
  const { buildHeader, wireHeader } = await import("../.tmp-test/appheader.mjs");
  let called = 0;
  wireHeader({
    setSetting: () => {
      called += 1;
    },
    toggleNikud: () => {
      called += 1;
    },
  });

  const src = readFileSync(path.join(SRC, "appheader.ts"), "utf8");

  // ---- the seam -----------------------------------------------------------
  ok(
    "the header takes its shell verbs through `makeWiring`",
    /makeWiring<HeaderWiring>\("wireHeader"\)/u.test(src),
  );
  ok("and exports one `wireHeader`", /export function wireHeader\(/u.test(src));

  // The two verbs the header cannot import: each has exactly one home in
  // `main.ts`. If a second definition appears here, the header has started
  // deciding where a setting is written.
  const localDefs = ["setSetting", "toggleNikud"].filter((n) =>
    new RegExp(`^function ${n}\\b|^const ${n}\\b`, "mu").test(src),
  );
  check("none of the shell verbs is redefined here", localDefs, []);

  // ---- the chips -----------------------------------------------------------
  //
  // Every chip the header can describe must have a runner. Read both ends: the
  // ids from `header.ts`'s `ChipId` union, the keys from `CHIP_RUN` here.
  const unionSrc = readFileSync(path.join(SRC, "header.ts"), "utf8");
  // Scoped to `ChipId`'s own declaration. `header.ts` also declares `FileItemId`
  // and `ExportId`, and a sweep over every `| "…"` line read those as chips —
  // `newDoc`, `open`, `save` and the rest — which made the completeness check
  // fail on ids that have nothing to do with the chips.
  const chipUnion = unionSrc.slice(
    unionSrc.indexOf("export type ChipId ="),
    unionSrc.indexOf("/**", unionSrc.indexOf("export type ChipId =")),
  );
  // The union's last line carries the `;`, and a pattern that insisted on no
  // trailing punctuation silently dropped exactly one id — `settings` — which is
  // the chip most likely to be looked for.
  const ids = [...chipUnion.matchAll(/^\s*\| "([A-Za-z][\w]*)"[;]?$/gmu)].map((m) => m[1]);
  ok("the chip union has ids to check", ids.length >= 10);

  // Sliced from `CHIP_RUN` to its own closing brace. This file also holds
  // `FILE_RUN` and `EXPORT_RUN`, and a slice that ran on past `CHIP_RUN` picked
  // up their keys as if they were chips — the same "read a wider region than you
  // meant" fault the fences in this suite exist to catch.
  const start = src.indexOf("const CHIP_RUN");
  const runBody = src.slice(start, src.indexOf("\n};", start) + 3);
  const missing = ids.filter((id) => !new RegExp(`^\\s*${id}:`, "mu").test(runBody));
  check("every chip id has a runner in CHIP_RUN", missing, []);

  // And no runner for a chip that does not exist — that is the same bug from the
  // other side, and it is how a renamed chip leaves its handler behind.
  const keys = [...runBody.matchAll(/^\s*([A-Za-z][\w]*):/gmu)]
    .map((m) => m[1])
    .filter((k) => k !== "const" && k !== "CHIP_RUN");
  const extra = keys.filter((k) => !ids.includes(k));
  check("and CHIP_RUN has no runner for a chip that is not in the union", extra, []);

  // The seam is a *lazy* dependency: wiring it after import must not throw, and
  // the verbs are not touched until a chip runs. `buildHeader` cannot be
  // exercised without a document, but the record can be read through the
  // module's own behaviour — and the fact that import succeeded at all is the
  // assertion, held by `await import` above.
  ok("wiring after import does not throw", typeof buildHeader === "function");
  notOk("no chip ran, so no verb was called", called > 0);
}
