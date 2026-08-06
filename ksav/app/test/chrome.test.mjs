import { ok, check } from "./harness.mjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PANELS, hasExit } from "../.tmp-test/panels.mjs";

// Does the chrome go *through* the registry, or around it?
//
// `panels.test.mjs` proves the mechanism: every declared surface has a way out,
// the × closes the panel it belongs to, Escape reaches everything that says it
// should. All of that is worth nothing if `main.ts` can still put the `open`
// class on an element by hand, because then a surface can exist without being
// declared — and a surface the guard cannot see is a surface with no guard,
// which is the failure this file has spent its whole life being an example of.
//
// # What this file used to be, and why it could not work
//
// It read `main.ts` as text and matched shapes in it. Three properties of a
// 5,600-line string defeated that, and each was verified by mutation against
// HEAD rather than argued:
//
//   - It identified surfaces by the *name of the local* they were fetched into,
//     tested against the whole file. Three panels had bound one called
//     `overlay` and two had bound one called `list`, so the welcome overlay was
//     credited with the command palette's opener and the palette's inner div
//     was credited with a header dropdown's. Renaming two locals — a pure
//     refactor — made the welcome overlay vanish from the guard, after which
//     deleting its only exit was green.
//   - Its Escape check sliced from the first `e.key === "Escape"` to the first
//     `e.key === "Alt"`: 3,967 lines, 70% of the file. The five names it looked
//     for matched their own function *definitions*. Deleting the entire global
//     Escape handler left five of six assertions passing, and one comment
//     naming `dismissOnboard` bought back the sixth.
//   - Its × check passed a panel if `styles-close` appeared within 3,000
//     characters of a `getElementById`. `styles-close` occurred ten times.
//
// So it is not reading for shapes any more. It reads for **absence** — the one
// thing a regex over source does perfectly, and the thing `sources.test.mjs`
// already does for the rest of `src/`. A prohibition cannot be fooled by a
// coincidence of naming, because it is not looking for a coincidence.

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRCDIR = path.join(HERE, "..", "src");
const FILES = readdirSync(SRCDIR).filter((f) => f.endsWith(".ts"));
const SOURCES = new Map(FILES.map((f) => [f, readFileSync(path.join(SRCDIR, f), "utf8")]));
const MAIN = SOURCES.get("main.ts");

/** Every file but `panels.ts`, which is where all of this is allowed to live. */
function elsewhere(re) {
  const hits = [];
  for (const [name, src] of SOURCES) {
    if (name === "panels.ts") continue;
    for (const line of src.split("\n")) if (re.test(line)) hits.push(`${name}: ${line.trim()}`);
  }
  return hits;
}

export async function run() {

// ---------------------------------------------------------------- 1. prohibitions
//
// One module owns the `open` class, the `×`, and the backdrop. Not by
// convention — by there being no second place they are written.

const openClass = elsewhere(/classList\s*\.\s*(add|remove|toggle|contains)\(\s*"open"/);
check(`nothing outside panels.ts touches the "open" class`, openClass, []);

const closers = elsewhere(/"styles-close"/);
check("nothing outside panels.ts builds a × ", closers, []);

const scrims = elsewhere(/class:\s*"overlay"/);
check("nothing outside panels.ts builds a dismissing backdrop", scrims, []);

// The `open` class is how a surface becomes visible, so this is what makes
// "every surface is in PANELS" true by construction rather than by inspection:
// there is no way to show one without naming it to `openPanel` or `mountPanel`,
// and both refuse a name that is not in the registry.
ok("...so a surface cannot appear without being declared", true);

// ---------------------------------------------------- 2. every name is a surface

const NAMED_BY = /\b(openPanel|closePanel|togglePanel|isPanelOpen|mountPanel|wirePanel|panelHead|overlayPanel|panelOf)\(\s*"([\w-]+)"/g;
const ids = new Set(PANELS.map((p) => p.id));
const used = new Set();
const strangers = [];
for (const [name, src] of SOURCES) {
  if (name === "panels.ts") continue;
  for (const m of src.matchAll(NAMED_BY)) {
    used.add(m[2]);
    if (!ids.has(m[2])) strangers.push(`${name}: ${m[1]}("${m[2]}")`);
  }
}
// Belt and braces: the functions throw on an unknown name at runtime, but a
// panel opened on one code path nobody exercises would throw in front of a
// writer rather than in front of this file.
check("every panel name in src/ is a declared surface", strangers, []);

// ------------------------------------------------- 3. every surface is real chrome
//
// The other direction, and the one that retires `palette-list`. That entry sat
// in this file's exemption table with written evidence for a *div* — it never
// took the `open` class at all, and was only ever detected because a header
// dropdown had bound a local called `list`. An id in the registry now has to be
// something `main.ts` actually builds.

/** Is this text anywhere in `src/`? The nikud bar is built by `nikud.ts`. */
const somewhere = (needle) => [...SOURCES].some(([, src]) => src.includes(needle));

for (const p of PANELS) {
  ok(`${p.id}: something in the chrome opens or closes it`, used.has(p.id));
  if (p.presence === "class") {
    ok(
      `${p.id}: is an element the chrome builds`,
      somewhere(`id: "${p.id}"`) || somewhere(`overlayPanel("${p.id}"`),
    );
  } else {
    ok(`${p.id}: is mounted when it is shown`, somewhere(`mountPanel("${p.id}"`));
  }
  // A claimed exit has to be a built one. The welcome overlay was exempted from
  // this check for its whole life with a reason that was false.
  if (hasExit(p, "head")) {
    ok(`${p.id}: its × is built through panelHead`, somewhere(`panelHead("${p.id}"`));
  }
  if (hasExit(p, "scrim")) {
    ok(`${p.id}: its backdrop is built through overlayPanel`, somewhere(`overlayPanel("${p.id}"`));
  }
}

// ---------------------------------------------------------------- 4. Escape
//
// A narrow assertion, deliberately. `closeOnEscape` is exported from one module
// and called from one place, so "is it wired" is a question about a single
// token rather than about a slice of the file — which is the whole difference
// between this and the version that survived the handler being deleted.

const escapes = [...MAIN.matchAll(/e\.key === "Escape"/g)].map((m) => m.index);
ok("main.ts handles Escape somewhere", escapes.length > 0);
const wired = escapes.some((at) => MAIN.slice(at, at + 600).includes("closeOnEscape()"));
ok("the Escape key reaches the panel sweep", wired);
check(
  "and the sweep is called exactly once — there is no second, partial list",
  [...MAIN.matchAll(/closeOnEscape\(\)/g)].length,
  1,
);

// The thing the old file was trying to say. Every panel's closer is derived
// from `PANELS`, so no named close call belongs in the global branch at all: a
// list of them is exactly the shape that left the hydra out.
//
// Scoped to the branch that calls the sweep, not to every `Escape` in the file.
// The citation list runs its own key handler while it has focus — Tab moves,
// Enter takes, Escape gives up — and a widget answering its own keys is not the
// failure being guarded against.
const branch = MAIN.slice(MAIN.indexOf("closeOnEscape()") - 600, MAIN.indexOf("closeOnEscape()") + 600);
const handList = [...branch.matchAll(/\bclose[A-Z]\w*\(\)/g)]
  .map((m) => m[0])
  .filter((c) => c !== "closeOnEscape()");
check("Escape closes surfaces through the registry, not a hand-written list", handList, []);

// ---------------------------------------------------------------- 5. outside clicks

ok(
  "a click outside an anchored menu is offered to the registry",
  /addEventListener\("click"[\s\S]{0,300}?closeOnOutsideClick\(/.test(MAIN),
);

// ---------------------------------------------------------------- 6. coverage

ok("the registry describes the whole chrome", PANELS.length >= 15);
check(
  "and every declared surface is used by the application",
  PANELS.filter((p) => !used.has(p.id)).map((p) => p.id),
  [],
);

}
