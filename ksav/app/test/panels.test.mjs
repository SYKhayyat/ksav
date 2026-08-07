import { ok, check, notOk } from "./harness.mjs";
import { dirOf } from "../tools/paths.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";

// Can you get back out of it — asked of the surfaces themselves.
//
// The question is the one `chrome.test.mjs` has always asked, and the answer
// used to be looked up in a 5,600-line string. That could not work, and three
// mutations against HEAD showed exactly how it failed:
//
//   1. Delete the entire global Escape handler — the application answers Escape
//      nowhere at all — and five of the six Escape assertions still passed,
//      because the names they looked for (`closePalette`, `closeModal`, …)
//      matched their own *function definitions*, which live inside the window
//      the test was slicing. The sixth passed too once a *comment* naming
//      `dismissOnboard` was added anywhere in the same 3,967 lines.
//   2. Rename two locals that happened to be called `overlay` — a pure
//      refactor, in the palette and the notes chooser — and the welcome overlay
//      disappeared from the guard entirely, because it had only ever been
//      *detected* through those. With it gone, deleting its × was green.
//   3. `palette-list`, one of the three documented exemptions, is not a surface.
//      It never takes the `open` class; a header dropdown had bound a local
//      called `list`. An exemption had been written, with evidence, excusing a
//      plain div from a check it was never subject to.
//
// So this file does not read `main.ts`. It imports the registry every surface
// is now declared in, builds each one against a DOM, and clicks its way out.
// `chrome.test.mjs` keeps the other half — that `main.ts` actually goes through
// the registry rather than around it.

import {
  PANELS,
  panelOf,
  hasExit,
  panelHead,
  overlayPanel,
  openPanel,
  closePanel,
  togglePanel,
  isPanelOpen,
  mountPanel,
  wirePanel,
  resetPanels,
  closeOnEscape,
  closeOnOutsideClick,
  closeMenus,
  toggleMenu,
} from "../.tmp-test/panels.mjs";

const HERE = dirOf(import.meta.url);
const CSS = readFileSync(path.join(HERE, "..", "src", "styles.css"), "utf8");

// ---------------------------------------------------------------- a small DOM
//
// Enough of one to build a panel and click it, and no more. `harness.mjs`
// deliberately does not install `globalThis.document`, because a `document`
// existing at all convinces `@codemirror/view` it is in a browser and it reads
// half a DOM off it at import time — so this one is installed for the duration
// of this file and removed at the end, and the removal is asserted.

/** `.a.b:not(.c)` — the three shapes `panels.ts` actually uses. */
function selectorParts(sel) {
  const forbid = [];
  const base = sel.replace(/:not\(([^)]*)\)/g, (_, inner) => {
    for (const m of inner.matchAll(/\.([\w-]+)/g)) forbid.push(m[1]);
    return "";
  });
  const want = [...base.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  return { want, forbid };
}

class FakeText {
  constructor(text) {
    this.text = String(text);
    this.parent = null;
  }
}

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parent = null;
    this.attrs = new Map();
    this.handlers = new Map();
    this.classes = new Set();
    this.id = "";
    this.style = {};
    this.focused = 0;
  }
  get className() {
    return [...this.classes].join(" ");
  }
  set className(v) {
    this.classes = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  get classList() {
    const s = this.classes;
    return {
      add: (...c) => c.forEach((x) => s.add(x)),
      remove: (...c) => c.forEach((x) => s.delete(x)),
      contains: (c) => s.has(c),
      toggle: (c, on) => {
        const next = on ?? !s.has(c);
        if (next) s.add(c);
        else s.delete(c);
        return next;
      },
    };
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
    if (k === "id") this.id = String(v);
    if (k === "class") this.className = v;
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null;
  }
  addEventListener(type, fn) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === "string" ? new FakeText(n) : n;
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    const i = this.parent?.children.indexOf(this) ?? -1;
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
  focus() {
    this.focused++;
  }
  get previousElementSibling() {
    const sibs = (this.parent?.children ?? []).filter((n) => n instanceof FakeEl);
    return sibs[sibs.indexOf(this) - 1] ?? null;
  }
  matches(sel) {
    const { want, forbid } = selectorParts(sel);
    return want.every((c) => this.classes.has(c)) && !forbid.some((c) => this.classes.has(c));
  }
  closest(sel) {
    for (let n = this; n; n = n.parent) if (n instanceof FakeEl && n.matches(sel)) return n;
    return null;
  }
  /** Every descendant, self included. */
  *walk() {
    yield this;
    for (const c of this.children) if (c instanceof FakeEl) yield* c.walk();
  }
  querySelectorAll(sel) {
    return [...this.walk()].filter((n) => n !== this && n.matches(sel));
  }
  /** Fire `click`, bubbling, with `target` fixed at the node that was clicked. */
  click() {
    const e = { target: this, stopPropagation() {}, preventDefault() {} };
    for (let n = this; n; n = n.parent) for (const fn of n.handlers.get("click") ?? []) fn(e);
  }
  find(pred) {
    return [...this.walk()].find(pred) ?? null;
  }
}

/** Install the stub, run `fn`, and take it away again whatever happens. */
function withDom(fn) {
  const root = new FakeEl("div");
  root.setAttribute("id", "app");
  const body = new FakeEl("body");
  body.append(root);
  globalThis.document = {
    body,
    createElement: (tag) => new FakeEl(tag),
    createTextNode: (s) => new FakeText(s),
    getElementById: (id) => [...body.walk()].find((n) => n.id === id) ?? null,
    querySelectorAll: (sel) => body.querySelectorAll(sel),
  };
  try {
    return fn(root, body);
  } finally {
    delete globalThis.document;
    resetPanels();
  }
}

/** A stand-in element for a class-toggled panel, so `openPanel` has a target. */
function place(root, id, cls = "") {
  const n = new FakeEl("div");
  n.setAttribute("id", id);
  if (cls) n.className = cls;
  root.append(n);
  return n;
}

/** The declarations of the first CSS rule whose selector list mentions `sel`. */
function cssRule(sel) {
  const re = new RegExp(`(^|[,}])\\s*${sel.replace(/[.#]/g, "\\$&")}[^{}]*\\{([^}]*)\\}`, "m");
  return re.exec(CSS)?.[2] ?? null;
}

export async function run() {

// ---------------------------------------------------------------- 1. the shape

const ids = PANELS.map((p) => p.id);
check("every surface is declared once", ids.length, new Set(ids).size);
ok("the registry covers the application's surfaces", PANELS.length >= 15);

for (const p of PANELS) {
  ok(`${p.id}: has at least one way out`, p.exits.length > 0);
  // The lesson from the settings drawer, stated as a rule rather than a story:
  // a surface that is taken out of the document flow can end up on top of the
  // control that opened it — below 720px a drawer *is* the viewport — so it has
  // to carry a dismissal that does not require reaching that control again.
  // `toggle` and `caret` are only honest answers for a surface that covers
  // nothing, and the CSS below is where that is checked.
  const selfContained = p.exits.some((e) => ["head", "scrim", "outside"].includes(e.via));
  const inFlow = p.exits.some((e) => ["toggle", "caret"].includes(e.via));
  ok(`${p.id}: its exits are of one kind or the other`, selfContained !== inFlow);
  // A surface that covers the document and takes the keyboard must answer
  // Escape. This is the assertion the hydra failed against HEAD: it is the one
  // panel here that owns the keyboard outright, and it was the one the
  // hand-written list of twelve close calls had left out.
  if (p.kind === "modal" || p.kind === "popup") {
    ok(`${p.id}: a covering surface answers Escape`, p.escape);
  }
  // And the converse, which is the assertion with teeth: `escape: false` has to
  // be a decision, not an omission. There are exactly two defensible reasons to
  // decline Escape — the surface's visibility is a saved preference the writer
  // chose, or it follows the caret and has no state to be stuck in. "Nobody
  // added it to the list" is not one, and it is the reason the hydra spent its
  // whole life unreachable by Escape once its own buttons had focus.
  if (!p.escape) {
    ok(
      `${p.id}: declines Escape for a stated reason`,
      p.persisted === true || hasExit(p, "caret"),
    );
  }
  if (p.persisted) {
    // A saved preference the writer cannot turn off is worse than a transient
    // surface, not better: it comes back every launch. Either it carries its own
    // ×, or it covers nothing and the control that opened it is still there —
    // and that second claim is not taken on trust, it is read out of the CSS
    // below.
    ok(
      `${p.id}: a persisted surface can still be turned off`,
      hasExit(p, "head") || hasExit(p, "toggle"),
    );
  }
}

// ---------------------------------------------------- 2. the exemptions prove it

for (const p of PANELS) {
  for (const e of p.exits) {
    if (e.via !== "toggle") continue;
    const rule = cssRule(e.selector);
    ok(`${p.id}: ${e.selector} has a rule to read`, rule !== null);
    ok(
      `${p.id}: claims to cover nothing, and the CSS agrees`,
      !!rule && !/position:\s*(fixed|absolute)/.test(rule) && !/inset:\s*0/.test(rule),
    );
  }
}

// ---------------------------------------------------------------- 3. a × closes it
//
// Not "a × exists somewhere in the file within 3,000 characters of a
// getElementById" — the actual button, actually clicked, and then the panel
// asked whether it is still open.

withDom((root) => {
  for (const p of PANELS) {
    if (!hasExit(p, "head")) continue;
    const host = p.presence === "class" ? place(root, p.id) : null;
    const head = panelHead(p.id, "title");
    (host ?? root).append(head);
    const x = head.find((n) => n.classes.has("styles-close"));
    ok(`${p.id}: its head carries a ×`, !!x);
    ok(`${p.id}: the × has an accessible name, not just a tooltip`, !!x?.getAttribute("aria-label"));

    if (!x || p.presence !== "class") continue;
    openPanel(p.id);
    ok(`${p.id}: opens`, isPanelOpen(p.id));
    x.click();
    notOk(`${p.id}: and its own × closes it`, isPanelOpen(p.id));
  }
});

// A × cannot be wired to the wrong panel, because it is never handed a closer —
// only the id it belongs to. This is the failure the old spelling invited:
// ten surfaces each passed their own close function to a hand-built head.
withDom((root) => {
  place(root, "help-panel");
  place(root, "styles-panel");
  const head = panelHead("help-panel", "help");
  root.append(head);
  openPanel("help-panel");
  openPanel("styles-panel");
  head.find((n) => n.classes.has("styles-close"))?.click();
  notOk("the × closes the panel it was built for", isPanelOpen("help-panel"));
  ok("and leaves every other panel alone", isPanelOpen("styles-panel"));
});

// A surface that does not claim a head exit must not build one, so the registry
// cannot drift into describing a × that is not there.
withDom(() => {
  let threw = false;
  try {
    panelHead("palette", "no head here");
  } catch {
    threw = true;
  }
  ok("a panel with no declared × cannot build one", threw);
});

// ---------------------------------------------------------------- 4. the scrim

withDom((root) => {
  for (const p of PANELS) {
    if (!hasExit(p, "scrim")) continue;
    const node = overlayPanel(p.id, "box", ["contents"]);
    root.append(node);
    if (p.presence === "class") openPanel(p.id);
    else mountPanel(p.id, node, root);
    ok(`${p.id}: opens`, isPanelOpen(p.id));

    // Clicking the panel's own contents must fall through to the contents.
    const box = node.children.find((n) => n instanceof FakeEl);
    box.click();
    ok(`${p.id}: clicking inside it does not dismiss it`, isPanelOpen(p.id));
    node.click();
    notOk(`${p.id}: clicking the backdrop dismisses it`, isPanelOpen(p.id));
  }
});

withDom(() => {
  let threw = false;
  try {
    overlayPanel("outline-drawer", "box", []);
  } catch {
    threw = true;
  }
  ok("a panel with no declared scrim cannot build one", threw);
});

// ---------------------------------------------------------------- 5. Escape
//
// The sentence the old test wrote in English in a comment and then asserted
// something else entirely. Every transient surface is opened at once, Escape is
// pressed once, and the answer is read off the panels rather than off the source.

withDom((root) => {
  const classPanels = PANELS.filter((p) => p.presence === "class");
  for (const p of classPanels) {
    place(root, p.id);
    openPanel(p.id);
  }
  // Every mounted surface except the second anchored menu: opening one of those
  // deliberately closes the other, which §8 checks on its own terms.
  for (const p of PANELS.filter((x) => x.presence === "mounted" && x.id !== "mekoros")) {
    const n = new FakeEl("div");
    n.setAttribute("id", p.id);
    if (p.selector) n.className = selectorParts(p.selector).want.join(" ");
    mountPanel(p.id, n, root);
  }
  const up = PANELS.filter((p) => p.id !== "mekoros");
  ok("every surface is open", up.every((p) => isPanelOpen(p.id)));

  const closed = closeOnEscape();
  check(
    "Escape closed exactly the surfaces that say it does",
    closed.slice().sort(),
    up.filter((p) => p.escape).map((p) => p.id).sort(),
  );
  for (const p of up) {
    check(`${p.id}: after Escape`, isPanelOpen(p.id), !p.escape);
  }
  // The outline and notes panes are a saved layout choice. Escape throwing that
  // away would be its own bug, and this is the assertion that keeps somebody
  // from "fixing" it by adding them to the sweep.
  ok("the persisted panes survived it", isPanelOpen("outline-drawer") && isPanelOpen("notes-drawer"));
});

// A second Escape must be free to mean something else.
withDom((root) => {
  place(root, "palette");
  check("Escape with nothing open closes nothing", closeOnEscape(), []);
  openPanel("palette");
  check("Escape closes the palette", closeOnEscape(), ["palette"]);
  check("and then has nothing left to close", closeOnEscape(), []);
});

// ------------------------------------------------- 6. closing runs the side effects
//
// This is what makes a derived sweep safe. The hand-written Escape handler
// called `closeModal`, `closeHydra`, `closePalette` — each of which put
// something back besides the class. A sweep that only stripped classes would be
// a *weaker* Escape than the list it replaced, so the registry owns the hooks
// and closing through any route runs them.

withDom((root) => {
  place(root, "form-modal");
  let opened = 0;
  let closed = 0;
  wirePanel("form-modal", { open: () => opened++, close: () => closed++ });

  openPanel("form-modal");
  check("opening runs the open hook", [opened, closed], [1, 0]);
  closeOnEscape();
  check("Escape runs the close hook, not just the class", [opened, closed], [1, 1]);

  // The guard that used to be hand-written inside `dismissOnboard`, with its
  // reasoning in a comment: Escape is pressed constantly and the sweep touches
  // every transient surface, so closing something already closed must be
  // nothing at all. Otherwise the welcome overlay marks a reader onboarded
  // every time they dismiss a completion.
  closeOnEscape();
  closePanel("form-modal");
  check("closing something already closed runs nothing", [opened, closed], [1, 1]);
});

withDom((root) => {
  place(root, "welcome-stand-in");
  let onboarded = 0;
  wirePanel("welcome", { close: () => onboarded++ });
  const n = new FakeEl("div");
  n.setAttribute("id", "welcome");
  mountPanel("welcome", n, root);
  closeOnEscape();
  closeOnEscape();
  closeOnEscape();
  check("three Escapes after it is gone mark nobody onboarded", onboarded, 1);
});

// ------------------------------------------------- 7. toggles and saved state

withDom((root) => {
  place(root, "outline-drawer");
  let on = 0;
  let off = 0;
  wirePanel("outline-drawer", { open: () => on++, close: () => off++ });
  // Restoring a preference that is off must not announce anything: at boot this
  // is what keeps `togglePanel(id, false)` from writing the setting back and
  // re-rendering the chrome for a pane nobody asked for.
  togglePanel("outline-drawer", false);
  check("restoring an off preference runs no hook", [on, off], [0, 0]);
  togglePanel("outline-drawer", true);
  check("restoring an on preference opens it", [on, off], [1, 0]);
  ok("and it is open", isPanelOpen("outline-drawer"));
  check("toggle with no argument flips it", togglePanel("outline-drawer"), false);
  check("which is a close", [on, off], [1, 1]);
});

// ---------------------------------------------------- 8. the anchored menus

withDom((root) => {
  const spell = new FakeEl("div");
  spell.className = "spell-menu";
  const inner = new FakeEl("button");
  spell.append(inner);
  mountPanel("spell-menu", spell, root);
  ok("the spell menu is up", isPanelOpen("spell-menu"));

  closeOnOutsideClick(inner);
  ok("a click inside it leaves it alone", isPanelOpen("spell-menu"));
  closeOnOutsideClick(root);
  notOk("a click outside it takes it away", isPanelOpen("spell-menu"));
});

withDom((root) => {
  const spell = new FakeEl("div");
  spell.className = "spell-menu";
  mountPanel("spell-menu", spell, root);
  const mekoros = new FakeEl("div");
  // The citation list borrows `.spell-menu` for its styling, which is how the
  // two used to close each other — by accident, through a shared class rather
  // than through anybody deciding it.
  mekoros.className = "spell-menu mekoros";
  mountPanel("mekoros", mekoros, root);
  notOk("opening one anchored menu closes the other", isPanelOpen("spell-menu"));
  ok("and the new one is up", isPanelOpen("mekoros"));
  // `.spell-menu:not(.mekoros)` is what keeps these two distinguishable, so a
  // citation list is not silently counted as a spell menu.
  closeOnOutsideClick(mekoros.children[0] ?? mekoros);
  ok("a click inside the citation list leaves it alone", isPanelOpen("mekoros"));
});

// ---------------------------------------------------------------- 9. the dropdowns

withDom((root) => {
  const mk = () => {
    const btn = new FakeEl("button");
    const list = new FakeEl("div");
    list.className = "menu-list";
    root.append(btn, list);
    return { btn, list };
  };
  const a = mk();
  const b = mk();
  let filled = 0;

  ok("a menu opens", toggleMenu(a.list, a.btn, () => filled++));
  check("and is filled on the way open", filled, 1);
  check("and says so", a.btn.getAttribute("aria-expanded"), "true");
  toggleMenu(b.list, b.btn);
  notOk("opening a second closes the first", a.list.classes.has("open"));
  check("and the first says so too", a.btn.getAttribute("aria-expanded"), "false");
  notOk("toggling an open menu closes it", toggleMenu(b.list, b.btn));
  check("closing does not rebuild", filled, 1);

  toggleMenu(a.list, a.btn);
  closeMenus();
  notOk("closeMenus closes them all", a.list.classes.has("open"));
});

// ---------------------------------------------------------------- 10. bad names

withDom((root) => {
  for (const [what, fn] of [
    ["openPanel", () => openPanel("no-such-panel")],
    ["closePanel", () => closePanel("no-such-panel")],
    ["wirePanel", () => wirePanel("no-such-panel", {})],
    ["panelOf", () => panelOf("no-such-panel")],
  ]) {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    ok(`${what} refuses a name that is not a surface`, threw);
  }

  // The two presences are not interchangeable, and saying so out loud is what
  // stops a mounted surface from being "opened" into a document it is not in.
  let threw = false;
  try {
    openPanel("welcome");
  } catch {
    threw = true;
  }
  ok("openPanel refuses a surface that is built when shown", threw);

  threw = false;
  try {
    place(root, "palette");
    mountPanel("palette", new FakeEl("div"), root);
  } catch {
    threw = true;
  }
  ok("mountPanel refuses a surface that is always in the document", threw);
});

ok("the DOM stub was taken away again", typeof globalThis.document === "undefined");

}
