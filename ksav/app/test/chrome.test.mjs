import { ok, check } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";

// Can you get back out of it?
//
// The settings drawer shipped with an open and no close. Not a subtle bug: the
// ⚙ chip toggled it, and that was the entire exit. Below 720px a drawer is the
// full viewport width, so on a phone the chip was *underneath the drawer* and
// there was no way out of Settings at all. The outline drawer had the same
// shape. Both survived two audits, because nothing in the test suite ever
// opened a panel — the tests cover the pure modules, and the chrome is the one
// place a person actually touches.
//
// A DOM test would need CodeMirror and a browser. This is cheaper and catches
// the thing that actually goes wrong: a surface gains an opener and never gains
// a closer. It reads main.ts as text and asks, for every element that gets
// `open` put on it, whether the code can also take it off and whether a person
// can reach that from inside the surface itself.

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = readFileSync(path.join(HERE, "..", "src", "main.ts"), "utf8");
const CSS = readFileSync(path.join(HERE, "..", "src", "styles.css"), "utf8");

/**
 * Surfaces that legitimately need no close control of their own — and the
 * **evidence** for it, which this file then checks.
 *
 * A prose reason is not enough, and that is not a hypothetical. The welcome
 * overlay was exempted here with the reason *"every control on it dismisses
 * it"*, which was false: it had no ×, ignored Escape, and its only exits were
 * template buttons that replaced whatever was in the buffer. A writer who
 * opened it by accident was trapped. This file exists precisely to catch "a
 * surface with no exit", and it had been told to look away from the one surface
 * that had none.
 *
 * So an exemption is now a claim with a test attached:
 *
 *   inline  — the CSS says it does not cover anything: no `position: fixed`,
 *             no `position: absolute`, no `inset: 0`. An inline strip cannot
 *             hide the control that toggles it, at any width.
 *   inside  — main.ts builds it within another surface, which owns dismissal
 *             and is itself held to the full standard.
 *
 * If the evidence stops holding, the exemption fails and the surface has to
 * earn its own way out.
 */
const NO_CLOSE_NEEDED = {
  // A strip above the editor, not a covering surface.
  "nikud-bar": { kind: "inline", selector: ".nikud-bar" },
  // The contextual ribbon: an inline strip under the toolbar that appears and
  // disappears with the caret. It covers nothing, captures no keys, and has no
  // state to be stuck in — closing it means moving the caret out of the table.
  "context-bar": { kind: "inline", selector: ".context-bar" },
  // The inner list of the command palette. The palette overlay around it is the
  // surface, and it has the scrim and the Escape.
  "palette-list": { kind: "inside", parent: "palette" },
};

/** The declarations of the first CSS rule whose selector list mentions `sel`. */
function cssRule(sel) {
  const re = new RegExp(`(^|[,}])\\s*${sel.replace(/[.#]/g, "\\$&")}[^{}]*\\{([^}]*)\\}`, "m");
  return re.exec(CSS)?.[2] ?? null;
}

export async function run() {

// ---------------------------------------------------------------- the scan

/**
 * Every id this file puts the `open` class on.
 *
 * Two spellings, and the second one matters more than it looks. A panel is often
 * fetched into a local (`const panel = document.getElementById("hydra")!`) and
 * opened forty lines later, past any fixed-size window — the first version of
 * this scan used a 200-character lookahead and therefore did not see the hydra
 * at all. A surface the reachability test cannot see is a surface with no
 * reachability test, which is the whole failure being guarded against, reproduced
 * inside the guard.
 */
function openedIds() {
  const ids = new Set();
  const direct = /getElementById\("([\w-]+)"\)!?\??\.classList\.(?:add|toggle)\("open"/g;
  for (const m of SRC.matchAll(direct)) ids.add(m[1]);
  // `const NAME = document.getElementById("ID")` … anywhere later, `NAME.classList.add("open")`
  const bound = /(?:const|let)\s+(\w+)\s*=\s*document\.getElementById\("([\w-]+)"\)/g;
  for (const m of SRC.matchAll(bound)) {
    const [, name, id] = m;
    if (new RegExp(`\\b${name}\\.classList\\.(?:add|toggle)\\("open"`).test(SRC)) ids.add(id);
  }
  return [...ids];
}

const opened = openedIds();
ok("the scan found the app's surfaces at all", opened.length >= 8);

// ---------------------------------------------------------------- 1. a closer exists

for (const id of opened) {
  // Both spellings again: fetched-and-closed inline, or fetched into a local and
  // closed later. Checking only the first form failed the contextual ribbon,
  // which does close itself — through a variable.
  const inline =
    SRC.includes(`getElementById("${id}")!.classList.remove("open")`) ||
    SRC.includes(`getElementById("${id}")?.classList.remove("open")`) ||
    SRC.includes(`getElementById("${id}")!.classList.toggle("open"`) ||
    // Taking the element out of the document is a stronger exit than taking a
    // class off it, and it is what a one-shot overlay should do. The welcome
    // screen does this and was failing a test that only knew about the class.
    SRC.includes(`getElementById("${id}")?.remove()`) ||
    SRC.includes(`getElementById("${id}")!.remove()`);
  let viaLocal = false;
  const bound = new RegExp(
    `(?:const|let)\\s+(\\w+)\\s*=\\s*document\\.getElementById\\("${id}"\\)`,
    "g",
  );
  for (const m of SRC.matchAll(bound)) {
    if (
      new RegExp(`\\b${m[1]}\\.classList\\.(?:remove|toggle)\\("open"`).test(SRC) ||
      new RegExp(`\\b${m[1]}\\.remove\\(\\)`).test(SRC)
    ) {
      viaLocal = true;
    }
  }
  ok(`${id}: something can take the open class off again`, inline || viaLocal);
}

// ---------------------------------------------------------------- 2. a way out from inside
//
// A toggle chip in the header is not an exit: at phone widths the surface is
// the whole viewport and the chip is behind it. The surface has to carry its
// own dismiss control, or be one of the documented exemptions.

// ------------------------------------------------- 2a. the exemptions prove it

for (const [id, ev] of Object.entries(NO_CLOSE_NEEDED)) {
  ok(`exemption ${id}: is still a surface this file sees`, opened.includes(id));
  if (ev.kind === "inline") {
    const rule = cssRule(ev.selector);
    ok(`exemption ${id}: ${ev.selector} has a rule to read`, rule !== null);
    ok(
      `exemption ${id}: claims to be inline, and the CSS agrees (nothing covering)`,
      !!rule && !/position:\s*(fixed|absolute)/.test(rule) && !/inset:\s*0/.test(rule),
    );
  } else if (ev.kind === "inside") {
    // *Every* occurrence, not the first: `id: "palette"` is an action in the
    // keybinding registry as well as an element, and the registry entry comes
    // first in the file. This test already learned that lesson once, three
    // sections down, and then this check was written the other way.
    const sites = [];
    for (let at = SRC.indexOf(`id: "${ev.parent}"`); at >= 0; at = SRC.indexOf(`id: "${ev.parent}"`, at + 1)) {
      sites.push(SRC.slice(at, at + 2000));
    }
    ok(`exemption ${id}: the parent ${ev.parent} is built in main.ts`, sites.length > 0);
    ok(
      `exemption ${id}: is built inside ${ev.parent}, which owns dismissal`,
      sites.some((block) => block.includes(`id: "${id}"`)),
    );
    ok(`exemption ${id}: and ${ev.parent} is not itself exempt`, !NO_CLOSE_NEEDED[ev.parent]);
  } else {
    ok(`exemption ${id}: carries a kind of evidence this test knows how to check`, false);
  }
}

for (const id of opened) {
  if (NO_CLOSE_NEEDED[id]) continue;
  // `id: "x"` appears in the keybinding registry as well as on the element, so
  // every occurrence gets looked at rather than the first — the first version of
  // this test failed the command palette on the strength of an action id.
  const sites = [];
  for (let at = SRC.indexOf(`id: "${id}"`); at >= 0; at = SRC.indexOf(`id: "${id}"`, at + 1)) {
    sites.push(SRC.slice(at, at + 1400));
  }
  ok(`${id}: is built in main.ts`, sites.length > 0);
  // A panel built empty and filled in later carries its × in the render
  // function rather than at the construction site, so the whole file is the
  // haystack for those.
  const rendered = new RegExp(
    `getElementById\\("${id}"\\)[\\s\\S]{0,3000}?styles-close`,
  );
  const hasClose =
    sites.some(
      (block) =>
        block.includes("styles-close") || // the × every panel carries
        block.includes('class: "overlay"'), // an overlay dismisses on its scrim click
    ) || rendered.test(SRC);
  ok(`${id}: carries its own way out (× or a dismissing scrim)`, hasClose);
}

// ---------------------------------------------------------------- 3. Escape
//
// Every *modal* surface — one that takes the keyboard — must answer Escape.
// Drawers are exempt by design: the outline pane is a persisted layout choice,
// and Escape throwing it away would be its own bug.

const esc = SRC.slice(SRC.indexOf('e.key === "Escape"'), SRC.indexOf('e.key === "Alt"'));
for (const fn of ["closePalette", "closeNotesChooser", "closeModal", "closeSettings", "dismissOnboard"]) {
  ok(`Escape reaches ${fn}`, esc.includes(fn));
}

check("the Escape branch was actually found", esc.length > 40, true);

}
