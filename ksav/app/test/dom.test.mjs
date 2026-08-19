import { check, ok, notOk } from "./harness.mjs";
import { el, iconBtn, glyphBtn } from "../.tmp-test/dom.mjs";
import { dirOf } from "../tools/paths.mjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// `dom.ts` is the layer every other module builds its chrome out of, and it had
// no test file at all — which is how a *greyed control that still worked*
// shipped.
//
// `previewSideToggle` passed `"chip disabled"`. `styles.css` gave
// `.chip.disabled` an `opacity: .4` and no `pointer-events`. And `iconBtn` had
// no notion of the state whatsoever. So the control looked unavailable, clicked
// anyway, saved a setting, fired a full chrome rebuild, and announced itself to
// a screen reader as *enabled* — the one user for whom the greying conveys
// nothing at all was the one most likely to press it.
//
// The ribbon, the menus and the hydra all set the real attribute. Two
// conventions lived in one file and the cosmetic one was in the constructor
// every header chip goes through, which is why it was the one that spread.

/** The smallest document `el()` needs, recording what it was told. */
function fakeDom() {
  const made = [];
  const doc = {
    createElement: (tag) => {
      const n = {
        tagName: String(tag).toUpperCase(),
        className: "",
        attrs: {},
        listeners: {},
        children: [],
        setAttribute(k, v) {
          this.attrs[k] = String(v);
        },
        addEventListener(kind, fn) {
          (this.listeners[kind] ??= []).push(fn);
        },
        append(...c) {
          this.children.push(...c);
        },
        /** Fire every click listener, the way a real button would. */
        click() {
          for (const fn of this.listeners.click ?? []) fn({});
        },
      };
      made.push(n);
      return n;
    },
  };
  const had = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    value: doc,
    configurable: true,
    writable: true,
  });
  return {
    made,
    restore() {
      if (had === undefined) delete globalThis.document;
      else
        Object.defineProperty(globalThis, "document", {
          value: had,
          configurable: true,
          writable: true,
        });
    },
  };
}

export async function run() {
  const dom = fakeDom();
  try {
    // ------------------------------------------------------------- el basics
    {
      const n = el("div", { class: "a b", role: "group", "aria-label": "שם" }, ["x"]);
      check("class is set directly", n.className, "a b");
      check("everything else becomes an attribute", n.attrs.role, "group");
      check("including an aria name", n.attrs["aria-label"], "שם");
      check("children are appended", n.children, ["x"]);
      // A null property is absent, not the string "null" — which is what an
      // optional attribute spelled `x ? y : null` relies on.
      const bare = el("div", { title: null });
      notOk("a null property sets no attribute", "title" in bare.attrs);
    }

    // ------------------------------------------------------ an enabled button
    {
      let fired = 0;
      const b = iconBtn("†", "Footnote", () => fired++);
      check("it has an accessible name and not only a tooltip", b.attrs["aria-label"], "Footnote");
      notOk("an ordinary button is not disabled", "disabled" in b.attrs);
      b.click();
      check("and it does what it was given", fired, 1);
    }

    // ----------------------------------------------------- a disabled button
    //
    // The assertion the greyed chip needed and nobody had written. Both halves
    // matter and the second is the one that was wrong for a year: it must *look*
    // unavailable and it must *be* unavailable.
    {
      let fired = 0;
      const b = iconBtn("⊞", "Preview side", () => fired++, "chip disabled");
      ok("the class still carries the greying", /\bdisabled\b/.test(b.className));
      check("the real attribute is set", b.attrs.disabled, "");
      check("…and announced", b.attrs["aria-disabled"], "true");
      b.click();
      check("clicking it does nothing", fired, 0);
    }

    // The state is read off the class because that is the spelling a dozen call
    // sites already use. A parameter would have been tidier and would have left
    // every one of them still lying.
    {
      let fired = 0;
      const b = iconBtn("x", "t", () => fired++, "chip is-disabled-looking");
      b.click();
      check("a class that merely contains the word is not the state", fired, 1);
    }
  {
    const HERE = dirOf(import.meta.url);
    const SRC = path.join(HERE, "..", "src");
    const offenders = [];
    for (const name of readdirSync(SRC)) {
      if (!name.endsWith(".ts")) continue;
      const src = readFileSync(path.join(SRC, name), "utf8");
      for (const { call, line } of scanButtons(src)) {
        const label = loneLiteralChild(call);
        // Not a bare glyph: it has no children, or its child is computed, or its
        // child is a word. Either way its name is not this rule's problem.
        if (label === null) continue;
        // A word names itself. "×", "⊟", "⇅", "📄", "+" do not — measured as
        // "contains no letter and no digit in any script", which is what makes a
        // run of characters a symbol rather than a label.
        if (/[\p{L}\p{N}]/u.test(label)) continue;
        if (/"aria-label"\s*:/u.test(call)) continue;
        offenders.push(`${name}:${line} ${label}`);
      }
    }
    check("every bare-glyph button carries an aria-label", offenders, []);
  }

  // And the producer, from the other end: `glyphBtn` is what `iconBtn` is built
  // on now, so the naming lives in one place rather than in each surface that
  // happens to remember.
  {
    const b = glyphBtn("⊟", "Split down", () => {}, "pane-btn");
    check("glyphBtn names the button", b.attrs["aria-label"], "Split down");
    check("…and keeps the title for a pointer", b.attrs.title, "Split down");
    check("…on the class list it was given", b.className, "pane-btn");
    check("…and the data attributes it was given", glyphBtn("×", "n", () => {}, "c", { "data-pane-act": "close" }).attrs["data-pane-act"], "close");
    const off = glyphBtn("⊟", "Split down", () => {}, "pane-btn disabled");
    check("…and `disabled` in the class list still means disabled", off.attrs.disabled, "");
  }
  } finally {
    dom.restore();
  }
}


// ------------------------------------------------- every glyph button has a name
//
// The class: **a button whose only name is a `title`.**
//
// Text content wins over `title` in accessible-name computation, so
// `<button title="Split down">⊟</button>` is announced as *"⊟, button"*.
// `iconBtn`'s own docstring says this was already found once and closed — *"a
// screen reader announced the toolbar as '†, button', '⁑, button', '▤, button'
// — forty-two of them, page-wide, with zero `aria-label`"* — and it was closed
// for the ribbon only, because `iconBtn` hardcoded `tb-btn` onto the class list.
// Every surface whose buttons are not ribbon buttons therefore could not use it
// and built its own.
//
// `paneHead` was the bulk of it: eleven controls per pane, in the surface a
// writer uses to arrange their window, and its own comment said so without
// noticing — *"Each control names itself. The strip is the one place in the
// application whose buttons are pure glyph, so the only other thing that could
// identify them is the `title`."* That is a statement that they are **not**
// named, written as though it were a fix. Six more turned up when this sweep was
// pointed at the rest of the shell.
//
// Scanned rather than pattern-matched. A regex over the attribute object gets
// two things wrong that matter: a nested `{}` (a template literal's `${…}`, a
// spread) hides an `aria-label` that is genuinely there, and a button whose
// child is a real word — `[t("accept")]` — needs no `aria-label` at all,
// because its name is what it says. Both are false positives, and a sweep with
// false positives is a sweep somebody deletes.
const lineOf = (src, at) => src.slice(0, at).split(String.fromCharCode(10)).length;

function scanButtons(src) {
  const found = [];
  for (const m of src.matchAll(/el\(\s*"button"/gu)) {
    const i = m.index;
    // Balance from the `(` after `el`, so the whole call is in hand — attributes,
    // children and any nesting inside either.
    const open = src.indexOf("(", i);
    let depth = 0;
    let end = -1;
    for (let j = open; j < src.length; j++) {
      const c = src[j];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) continue;
    found.push({ call: src.slice(open + 1, end), line: lineOf(src, i) });
  }
  return found;
}

/**
 * The literal a button's children are, when they are exactly one string.
 *
 * `["×"]` and `["📄"]` yes; `[t("accept")]`, `[el("b", …)]` and anything
 * computed, no — those either carry a real name or are not this rule's subject.
 */
function loneLiteralChild(call) {
  const at = call.lastIndexOf("[");
  if (at < 0) return null;
  const shut = call.lastIndexOf("]");
  if (shut < at) return null;
  const inner = call.slice(at + 1, shut).trim().replace(/,$/, "").trim();
  const m = /^"((?:[^"\\]|\\.)*)"$/u.exec(inner);
  return m ? m[1] : null;
}
