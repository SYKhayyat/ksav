import { ok, check, notOk } from "./harness.mjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PANELS, hasExit } from "../.tmp-test/panels.mjs";
import { dirOf } from "../tools/paths.mjs";

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

const HERE = dirOf(import.meta.url);
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
  // The title is a key, not the answer to one. `panelHead` throws on this at
  // boot, which is the real guard; here so it is a failing test rather than a
  // blank screen. See `panels.ts` — a head built from `t("notesPane")` reads
  // right once and then stays in the language it was born in.
  notOk(
    `${p.id}: its head is given a key, not a translated string`,
    somewhere(`panelHead("${p.id}", t(`),
  );
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

// ------------------------------------------- 7. actions go through one door
//
// The same prohibition shape, for the same reason, one layer in. `noteAction`
// had exactly one caller — inside `runStructureAction` — so the macro recorder
// saw the 43 structural operations and none of the ~30 shell ones. Press F3,
// Ctrl+B, F4 and the answer was "Nothing was recorded": bold, italic, footnote,
// endnote, the headings, bullets, tables, alignment, the three review marks and
// all three defer operations are first-class `ACTIONS` entries with shipped key
// bindings, and every one of them was invisible.
//
// The cause is not that somebody forgot a call. It is that there was **no one
// place** to put it: the keymap invoked `a.run` directly, so recording meant
// remembering at every invocation site, which is the same distributed-duty
// failure `panels.ts` was built to end for the `open` class. `runAction(id)` is
// that place, and this is the fence that keeps it the only one.
//
// Absence, not shape — and the *reference* as well as the call. The first
// version of this fence matched only `.run(runtime.view)` and `.run(v)`, which
// would not have caught the bug it was written for: the keymap did not call
// `a.run`, it passed it (`{ key, run: a.run }`) and CodeMirror called it later.
// A fence aimed one construct to the left of the live bug is this repository's
// signature failure, so it is aimed at both.
//
// `runStructureAction` is allowed its own `action.run(doc, pos)` — that is
// `StructureAction.run`, a pure function of text and position, and a different
// thing wearing the same name.
{
  // Blanked, not stripped, so every offset still points at the line it came
  // from. Matching over the comments finds this file's own prose about the bug
  // and reports the explanation as the offence — which it did, on the first run.
  const CODE = MAIN.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  const CALLS = /\b(?:a|action)\s*\??\.run\b|\)\s*\??\.run\b/g;
  const lines = CODE.split("\n");
  const at = (index) => CODE.slice(0, index).split("\n").length - 1;
  /** The nearest enclosing top-level `function name(` above a line. */
  const enclosing = (line) => {
    for (let i = line; i >= 0; i--) {
      const m = /^function\s+(\w+)/.exec(lines[i]);
      if (m) return m[1];
    }
    return "(top level)";
  };
  const invocations = [...CODE.matchAll(CALLS)].map((m) => enclosing(at(m.index)));
  // `playMacro` is the one documented exception and says why in place: replaying
  // a macro must not record its own steps, so it deliberately does not go
  // through `runAction`.
  const stray = invocations.filter(
    (f) => f !== "runAction" && f !== "playMacro" && f !== "runStructureAction",
  );
  check("an action is only ever reached through runAction", stray, []);
  ok("…and runAction is where it happens", invocations.includes("runAction"));
  ok(
    "runAction notes the action for the recorder",
    /function runAction[\s\S]{0,600}?noteAction\(/.test(MAIN),
  );
  // The other half: the recorder has to see a command that arrives with no
  // action behind it — the toolbar, the Insert menu and the palette all call
  // `insertSnippet` with a registry command directly.
  ok(
    "a command inserted with no action behind it is recorded too",
    /function insertSnippet[\s\S]{0,400}?noteSnippet\(/.test(MAIN),
  );
}

// ------------------------------------- 8. the palette holds operations at all
//
// It read `commands.available(runtime.commandsReg)` — the engine's *content*
// registry — and nothing else, so typing "table" into Ctrl+K offered `#טבלה`
// and could not offer "insert row below", "save", "export PDF" or "record
// macro". The one surface in the product labelled Commands was a symbol picker.
//
// Re-aimed once the palette's rows moved to `panelrows.ts`. The first version
// read the text of `renderPaletteList` and looked for `runAction(` inside it,
// which is a fence tied to where the code happens to sit rather than to what it
// has to do: the moment the row-drawing moved one function along, the fence went
// red for a change that fixed nothing and broke nothing. What it *means* is that
// an operation row runs through the one door, so it is asked of the function
// that performs a row. The other half — that operations are in the list at all
// — is executable now, in `panelrows.test.mjs`.
{
  const body = MAIN.slice(MAIN.indexOf("function renderPaletteList"));
  const list = body.slice(0, body.indexOf("\n}\n") + 3);
  ok("the palette offers operations", /paletteActions\(\)/.test(list));
  // The `switch` moved out of `drawRow` into `runRow` when help entries became
  // clickable — help speaks the same `RowAction` vocabulary now, and a second
  // copy of this dispatch beside the help panel is how one of them would come to
  // disagree with the other. So the fence follows the property rather than the
  // function: there is one dispatcher, it reaches `runAction`, and every surface
  // that performs a row goes through it.
  const door = MAIN.slice(MAIN.indexOf("function runRow"));
  ok(
    "…and runs them through the one door",
    /case "action":[\s\S]{0,200}?runAction\(/.test(door.slice(0, door.indexOf("\n}\n") + 3)),
  );
  const draw = MAIN.slice(MAIN.indexOf("function drawRow"));
  ok("a drawn row goes through it", /runRow\(r\.does/.test(draw.slice(0, draw.indexOf("\n}\n") + 3)));
  ok(
    "and so does a help entry",
    /function renderHelp[\s\S]{0,2000}?runRow\(/.test(MAIN),
  );
  ok("it still offers commands", /commands\.available\(/.test(list));
  // Structural operations are filtered to where the caret actually is, the same
  // rule the ribbon and the hydra use. Offering "delete row" outside a table and
  // silently doing nothing is how a palette teaches people not to trust it.
  ok(
    "structural operations are filtered to the caret",
    /function paletteActions[\s\S]{0,700}?availableAt\(/.test(MAIN),
  );
}


// -------------------------------- 9. a chip that reports a setting is rebuilt
//
// **Found by pressing it.** The theme toggle flipped the page to dark, flipped
// the editor to dark, saved the setting — and went on showing 🌙, "switch to
// dark", for the rest of the session. `setSetting`'s `theme` branch applied the
// theme and did not rebuild the header; its four siblings — `lang`, `prose`,
// `layout`, `editingMode` — all did. One missing line, in the toggle a writer
// presses first, and every reading test in this repository was green through it.
//
// The class, not the instance: `header.chips` is a pure function of a named
// state, so **every settings key that state is built from has to be a key whose
// change rebuilds the chrome.** The list is read off `headerState()` rather than
// written here, so a chip that starts reporting a new setting is covered the
// moment it is added — which is the difference between this and a fence that
// names `theme`.
{
  const END = "\n}\n";
  const state = MAIN.slice(MAIN.indexOf("function headerState()"));
  const body = state.slice(0, state.indexOf(END) + END.length);
  ok("the header's state is gathered in one place", body.includes("settings."));
  const shown = [...body.matchAll(/settings\.(\w+)/g)].map((m) => m[1]);
  // Four, not six. The threshold came down because two of the things the header
  // shows stopped being settings: prose is a property of the open document now,
  // and the arrangement is read off the pane tree. A header that reported those
  // from `settings` would be reporting the wrong document's mode the moment a
  // second one was open, which is the failure this whole fence exists to catch —
  // so the number falling is the fix working, not the fence weakening.
  ok("…and it reads several settings", shown.length >= 4, `${shown.length}`);

  const set = MAIN.slice(MAIN.indexOf("function setSetting"));
  const fn = set.slice(0, set.indexOf(END) + END.length);
  // Each `else if (key === "x") { … }` arm, with its body.
  const arms = new Map();
  const ARM = /key === "(\w+)"\)\s*\{([\s\S]*?)\n  \}/g;
  for (const m of fn.matchAll(ARM)) arms.set(m[1], m[2]);
  ok("the settings dispatcher was read", arms.size >= 8, `${arms.size} arms`);

  const silent = shown
    .filter((key) => arms.has(key))
    .filter((key) => !arms.get(key).includes("rerenderChrome()"));
  check("a setting the chipbar shows is a setting that rebuilds it", silent, []);
}

// ---------------------------------------------------------------- 9. the
// selectors the acceptance run drives the assembled app by
//
// `.github/scripts/acceptance.mjs` is the only check that opens the real
// product: the built bundle, inside the real server, driven by a real browser.
// It finds things by id, class and data-attribute — and nothing has ever held
// it to those names existing.
//
// It went stale exactly the way you would expect. The window became a tree of
// panes, so "the preview" stopped being `#preview` and became however many
// `.preview-host` elements are on screen; the acceptance run kept asking for
// `#preview .page`, kept getting nothing, and reported `0 pages` thirteen times
// on a build where every compile succeeded and the pages were on the screen.
//
// A check that cannot fail for the reason it names is worse than no check, so
// this is the check on the check: every selector it drives by has to appear in
// `src/`. Cheap, textual, and it can only ever produce a loud refusal.
{
  const HERE = dirOf(import.meta.url);
  const accept = readFileSync(
    path.join(HERE, "..", "..", "..", ".github", "scripts", "acceptance.mjs"),
    "utf8",
  );
  // Only the strings that are selectors, and only the parts of them that name
  // something `src/` is responsible for.
  // Read out of the calls that take one, rather than out of every string that
  // starts with a dot — `endsWith(".pdf")` is not a selector, and a guard that
  // reports it is a guard people learn to ignore.
  const wanted = new Set();
  const CALLS = /(?:locator|click|fill|waitForSelector|querySelectorAll|selectOption)\(\s*["'`]([^"'`]+)["'`]/g;
  for (const m of accept.matchAll(CALLS)) {
    for (const part of m[1].split(/\s+/)) {
      if (part.startsWith("#") || part.startsWith(".")) wanted.add(part);
    }
  }
  for (const m of accept.matchAll(/\[data-(?:action|command|menu|export|chip)="([^"]+)"\]/g)) {
    wanted.add(m[1]);
  }
  ok("the acceptance script was read", wanted.size > 5, `${wanted.size} selectors`);

  const src = (f) => readFileSync(path.join(HERE, "..", "src", f), "utf8");
  const TS = readdirSync(path.join(HERE, "..", "src"))
    .filter((f) => f.endsWith(".ts"))
    .map(src)
    .join("\n");
  // Comments stripped, because this stylesheet argues with itself in prose and
  // names selectors while doing it. The comment explaining that `#preview` is
  // gone contains the string `#preview`, which was enough to answer "is this
  // declared?" with yes — the guard reading its own explanation as evidence.
  const CSS = src("styles.css").replace(/\/\*[\s\S]*?\*\//g, " ");

  // **Not** "does this word appear in src/". That was the first spelling of this
  // check and it passed the mutation: put `#preview` back and it stayed green,
  // because the word *preview* is all over `preview.ts`, the pane roles and
  // `#preview-modal-body`. A guard that cannot fail is the thing it is guarding
  // against, one storey up.
  //
  // So an id has to be *declared* as an id and a class as a class:
  const declared = (sel) => {
    const name = sel.slice(1);
    if (sel.startsWith("#")) {
      return (
        TS.includes(`id: "${name}"`) ||
        TS.includes(`getElementById("${name}")`) ||
        // The boundary is load-bearing, and the mutation proved it: without it
        // `#preview` matched the rule for `#preview-modal-body`, and the guard
        // stayed green with the exact selector that produced thirteen red
        // acceptance checks.
        new RegExp(`#${name}(?![\\w-])`).test(CSS)
      );
    }
    // A class is real if the stylesheet has a rule for it or the shell puts it
    // on an element. `.cm-content` is CodeMirror's own and is styled here,
    // which is the honest evidence that this application depends on it.
    return (
      new RegExp(`\\.${name}[\\s,:.{>]`).test(CSS) ||
      TS.includes(`classList.add("${name}"`) ||
      new RegExp(`class: "[^"]*\\b${name}\\b`).test(TS)
    );
  };

  // Names that come from the engine's registry rather than from `src/` — a
  // command is `#הדגשה` in `commands.rs` and reaches the DOM through a loop.
  const FROM_REGISTRY = /^[֐-׿_]+$/u;
  const missing = [...wanted]
    .filter((sel) => !FROM_REGISTRY.test(sel))
    .filter((sel) => sel.startsWith("#") || sel.startsWith("."))
    .filter((sel) => !declared(sel));
  check("every selector the acceptance run drives by is declared in src/", missing, []);

  // ---------------------------------------------------------- 10. the way out
  //
  // "Settings and other drawers cannot be closed without scrolling back up to
  // reach the close button." A drawer scrolls, the head scrolled with it, and
  // below 720px a drawer is the whole viewport — so the chip that opened it is
  // underneath it and the × is the only way back. Read off the stylesheet
  // because that is where it is decided, and because deleting the rule is a
  // one-line change that nothing else here would notice.
  const rule = /\.drawer\s+\.styles-head\s*\{([^}]*)\}/.exec(CSS);
  ok("the drawer head has a rule of its own", !!rule);
  ok("…and it stays put while the drawer scrolls", /position:\s*sticky/.test(rule?.[1] ?? ""));
  ok("…anchored to the top", /top:\s*0/.test(rule?.[1] ?? ""));
  // The other half, and it is not decoration: a sticky element cannot rise
  // above its container's content box, so a drawer with padding at the top
  // parks its head below the edge and the text scrolls through the gap.
  const drawer = /\.drawer\s*\{([^}]*)\}/.exec(CSS);
  notOk(
    "…and the drawer keeps no top padding for the text to show through",
    /padding:\s*\d+(px|em|rem)/.test(drawer?.[1] ?? ""),
  );
}

}
