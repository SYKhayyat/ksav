import { ok, notOk, check } from "./harness.mjs";
import { PANELS, isPanelOpen, resetPanels } from "../.tmp-test/panels.mjs";
import { openKeys } from "../.tmp-test/keysdrawer.mjs";

// The keys drawer's door.
//
// `openKeys` is two lines — close the menus, open the drawer — and the fence
// that caught it (a module no test imports) is also the reason it deserves
// more than its size: the door is the one piece of the keys drawer a reader
// can enter by, and the failure it could have is exactly the one a test can
// see. Open the wrong surface, or skip the menu close so a dropdown hangs
// beside the drawer, and these assertions go red.
//
// The other two pieces of the drawer are fenced where they live: the view is
// `panelviews.keysPanel` (panelviews.test.mjs), the capture is the settings
// drawer's table (settings.test.mjs).

// ---------------------------------------------------------------- a small DOM
//
// The least `openPanel` and `closeMenus` can stand on: an element registry by
// id, a class matcher, and enough sibling wiring for the menu close to set
// `aria-expanded` on the button beside the list. Taken away after every case —
// a stub that outlives its test leaks into the next one's assertions.

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parent = null;
    this.attrs = new Map();
    this.classes = new Set();
    this.id = "";
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
  append(...nodes) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
  }
  get previousElementSibling() {
    const sibs = this.parent?.children ?? [];
    return sibs[sibs.indexOf(this) - 1] ?? null;
  }
  matches(sel) {
    return sel.split(".").every((c) => !c || this.classes.has(c));
  }
  *walk() {
    yield this;
    for (const c of this.children) yield* c.walk();
  }
  querySelectorAll(sel) {
    return [...this.walk()].filter((n) => n !== this && n.matches(sel));
  }
}

function withDom(fn) {
  const root = new FakeEl("div");
  root.setAttribute("id", "app");
  const body = new FakeEl("body");
  body.append(root);
  globalThis.document = {
    body,
    getElementById: (id) => [...body.walk()].find((n) => n.id === id) ?? null,
    querySelectorAll: (sel) => body.querySelectorAll(sel),
  };
  try {
    return fn(root);
  } finally {
    delete globalThis.document;
    resetPanels();
  }
}

/** A class-toggled drawer, as the registry declares the keys drawer. */
function place(root, id, cls = "drawer") {
  const n = new FakeEl("aside");
  n.setAttribute("id", id);
  if (cls) n.className = cls;
  root.append(n);
  return n;
}

export async function run() {
  // ---------------------------------------------------------------- declared
  const entry = PANELS.find((p) => p.id === "keys-drawer");
  check("the keys drawer is a declared surface", !!entry, true);
  check("and it is a drawer", entry?.kind, "drawer");

  // ------------------------------------------------------------------- opens
  withDom((root) => {
    place(root, "keys-drawer");
    openKeys();
    ok("the door opens the keys drawer", isPanelOpen("keys-drawer"));
    notOk("and only the keys drawer", isPanelOpen("styles-panel"));
  });

  // ------------------------------------------------------------ menus first
  // The drawer is a drawer, not a dropdown: a menu left open beside it is the
  // door's other line failing. The button's `aria-expanded` follows, because
  // closeMenus answers for it and the reader's screen reader reads it.
  withDom((root) => {
    place(root, "keys-drawer");
    const menu = new FakeEl("div");
    menu.className = "menu-list open";
    const btn = new FakeEl("button");
    btn.setAttribute("aria-expanded", "true");
    // the button sits *before* the list — closeMenus sets `aria-expanded` on
    // the list's previous element sibling
    root.append(btn, menu);
    openKeys();
    notOk("a hanging menu closes when the drawer opens", menu.classes.has("open"));
    ok("the drawer is open beside a clean menu bar", isPanelOpen("keys-drawer"));
  });
}
