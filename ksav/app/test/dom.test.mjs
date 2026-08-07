import { check, ok, notOk } from "./harness.mjs";
import { el, iconBtn } from "../.tmp-test/dom.mjs";

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
  } finally {
    dom.restore();
  }
}
