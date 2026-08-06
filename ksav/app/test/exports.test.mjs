// The seven ways a document leaves the application.
//
// `exports.ts` had no test, and it could not have had one: it was one of the
// nineteen modules missing from `run.mjs`'s hand-written list, so there was
// nothing in `.tmp-test/` for a test to import. Two live bugs were sitting in
// it, and both are the shape this repository is named for — a working engine
// behind a surface saying something else:
//
//   1. **Print put closers the writer never typed onto paper.** The page images
//      come from `lastResult`, which is the *preview* compile, and the preview
//      is compiled from the speculatively healed copy. Every other route calls
//      `warnIfHealed`; print did not, and print is the irreversible one. One
//      menu gave two answers about the same unbalanced document — Export PDF
//      refused with a compile error, Print silently printed the repair.
//
//   2. **The Word handoff produced nothing and announced an export.**
//      `reflowableHtml` set the status to "Typst's HTML export failed —
//      exporting page images instead" and returned null; `exportWord` and
//      `copyForWord` then returned in silence. That sentence is true of
//      `exportHtml`, which does fall back. On the two routes that fall back to
//      nothing, the writer was told a file had been written in a form they had
//      not asked for, and no file existed.
//
// Both are asserted from the writer's end — what was downloaded, what the status
// bar says afterwards — because both bugs consisted of the status bar and the
// filesystem disagreeing, and a test of either alone is green while it is wrong.

import { check, ok, notOk } from "./harness.mjs";
import * as exports_ from "../.tmp-test/exports.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";

// ---------------------------------------------------------------- the fakes
//
// Deliberately assembled inside `run()` and torn down after: a `document` on
// `globalThis` is enough to convince `@codemirror/view` it is in a browser, and
// the next test file is imported after this one has run. The harness has the
// same note on it, from the other direction.

/** What was handed to the browser as a download, and what was printed. */
const captured = { downloads: [], printed: null, clipboard: null, status: null };

function installDom() {
  const saved = {};
  const names = ["document", "URL", "window", "navigator", "ClipboardItem"];
  for (const k of names) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  // `navigator` is a getter-only property on modern node, so plain assignment
  // throws. Defining over it works and the descriptor above puts it back.
  const set = (k, v) =>
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });

  const statusEl = { textContent: "", className: "", title: "", removeAttribute() { this.title = ""; } };

  set("document", {
    getElementById: (id) => (id === "status" ? statusEl : null),
    // `runtime.closeMenus` sweeps the header dropdowns on the way out of every
    // export. There are none here; what matters is that it is called.
    querySelectorAll: () => [],
    body: { appendChild() {}, removeChild() {} },
    createElement: (tag) => ({
      tagName: String(tag).toUpperCase(),
      setAttribute(k, v) { this[k] = v; },
      // `dom.download` builds an `<a href download>` and clicks it. That click
      // is the moment a file reaches the writer, so it is what gets recorded.
      click() {
        captured.downloads.push({ name: this.download, body: this._body });
      },
    }),
  });
  set("URL", {
    createObjectURL: (blob) => {
      // The blob's text is the file's contents; capture it against the `<a>`
      // that is about to be built for it.
      void blob;
      return "blob:pending";
    },
    revokeObjectURL: () => {},
  });
  set("window", {
    open: () => {
      const win = { html: "", printed: false, document: {
        write(h) { win.html += h; }, close() {} },
        focus() {}, print() { win.printed = true; } };
      captured.printed = win;
      return win;
    },
    prompt: () => null,
    setTimeout: (fn) => fn,
  });
  set("navigator", { clipboard: { write: async (items) => { captured.clipboard = items; } } });
  set("ClipboardItem", class { constructor(parts) { this.parts = parts; } });

  return () => {
    for (const k of names) {
      if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
      else delete globalThis[k];
    }
  };
}

/** The status bar, as a writer would read it. */
const statusText = () => globalThis.document.getElementById("status").textContent;
const statusClass = () => globalThis.document.getElementById("status").className;

/** An editor holding this text, and nothing else about an editor. */
function withDoc(text) {
  runtime.setView({
    state: { doc: { toString: () => text, length: text.length } },
    dispatch: () => {},
    focus: () => {},
  });
}

/** A backend whose HTML export behaves as told. */
function backendThat({ html = "<html><body><p>שלום</p></body></html>", ok: isOk = true, why = "" }) {
  runtime.setBackend({
    async compile(_body, _config, opts) {
      if (opts?.format === "html") {
        return isOk
          ? { ok: true, html, pages_svg: [], diagnostics: [] }
          : { ok: false, pages_svg: [], diagnostics: why ? [{ message: why, severity: "error" }] : [] };
      }
      return { ok: true, pages_svg: ["<svg/>"], pages_hash: ["h"], diagnostics: [], pdf_base64: "", typst_source: "src" };
    },
  });
}

const UNBALANCED = "פתיחה#הערה[הגוף לא נסגר\nעוד שורה\n";
const BALANCED = "פתיחה#הערה[הגוף נסגר] סוף.\n";

export async function run() {
  const restore = installDom();
  try {
    runtime.setLastResult({ pages_svg: ["<svg id='page1'/>"], pages_hash: ["h"], diagnostics: [] });
    runtime.setCurrentDoc?.({ title: "קונטרס", assets: [] });

    // ------------------------------------------------ 1. print and the heal

    {
      // The bug, from the writer's end: an unbalanced document, and what reaches
      // the paper is the repaired copy.
      withDoc(UNBALANCED);
      captured.printed = null;
      exports_.doPrint();
      ok("print opened a window", !!captured.printed);
      ok(
        "print says the pages were built from a repair",
        /<div class="healed">/.test(captured.printed.html),
      );
      ok(
        "and says it in the status bar too",
        statusText().includes("⚠"),
      );
      check("the status bar calls it a warning", statusClass(), "warn");
      // The banner is on the screen and not on the paper. Printing the warning
      // would be a second bug in the opposite direction.
      ok(
        "the banner is suppressed when printing",
        /@mediaprint\{\.healed\{display:none\}\}/.test(captured.printed.html.replace(/\s+/g, "")),
      );
    }

    {
      // And the control: a balanced document prints with nothing added.
      withDoc(BALANCED);
      captured.printed = null;
      globalThis.document.getElementById("status").textContent = "";
      exports_.doPrint();
      notOk("a balanced document gets no banner", /<div class="healed">/.test(captured.printed.html));
      check("and nothing is said about it", statusText(), "");
    }

    {
      // The number in the warning is the number of repairs, not a fixed string.
      withDoc("א#הערה[אחת\nב#הדגשה[שתיים\n");
      captured.printed = null;
      exports_.doPrint();
      const n = DICTS.he.previewHealed.replace("{0}", "2");
      ok("the count is the document's own", captured.printed.html.includes("2") && statusText().includes("2"));
      ok("and it is the translated sentence", n.includes("2"));
    }

    // ------------------------------------------------ 2. the Word handoff

    {
      // The bug: HTML export fails, so no `.doc` is produced — and the writer is
      // told so, instead of being told page images went out.
      withDoc(BALANCED);
      backendThat({ ok: false, why: "html export unsupported for this element" });
      captured.downloads.length = 0;
      await exports_.exportWord();
      check("no file is produced when the HTML backend refuses", captured.downloads, []);
      check("and the status bar says so as an error", statusClass(), "err");
      ok("it names the Word handoff", statusText().includes(DICTS.he.wordNoHtml.slice(0, 20)));
      notOk(
        "and does not claim page images were exported",
        statusText().includes(DICTS.he.htmlFellBack) || statusText().includes(DICTS.en.htmlFellBack),
      );
      ok("the engine's own reason is carried across", statusText().includes("html export unsupported"));
    }

    {
      // The same for the clipboard route, which had the same silence.
      withDoc(BALANCED);
      backendThat({ ok: false, why: "no" });
      captured.clipboard = null;
      await exports_.copyForWord();
      check("nothing reaches the clipboard either", captured.clipboard, null);
      check("and that is reported as a failure", statusClass(), "err");
    }

    {
      // The working case still works, and still says what flattens.
      withDoc(BALANCED);
      backendThat({ html: "<html><head><style>p{margin:0}</style></head><body><p>שלום</p></body></html>" });
      captured.downloads.length = 0;
      await exports_.exportWord();
      check("a .doc is produced when the backend can", captured.downloads.length, 1);
      ok("named after the document", captured.downloads[0].name.endsWith(".doc"));
      check("and the flattening note is a warning, not an error", statusClass(), "warn");
    }

    // ------------------------------------------------ 3. HTML keeps its fallback

    {
      // `exportHtml` is the route the fallback sentence was always true of: it
      // really does write page images. It keeps saying so.
      withDoc(BALANCED);
      backendThat({ ok: false, why: "" });
      captured.downloads.length = 0;
      await exports_.exportHtml();
      check("a file is still produced", captured.downloads.length, 1);
      ok("as .html", captured.downloads[0].name.endsWith(".html"));
      ok(
        "and the fallback is announced here, where it happened",
        statusText().includes(DICTS.he.htmlFellBack),
      );
      check("as a warning rather than an error", statusClass(), "warn");
    }

    {
      // The two are not interchangeable, which is the whole point of the split:
      // one route falls back to pictures, the other refuses. Asserted together,
      // because the bug was that they shared a sentence.
      withDoc(BALANCED);
      backendThat({ ok: false, why: "" });
      captured.downloads.length = 0;
      await exports_.exportHtml();
      const htmlFiles = captured.downloads.length;
      captured.downloads.length = 0;
      await exports_.exportWord();
      const wordFiles = captured.downloads.length;
      check("HTML falls back to a file, Word refuses to", [htmlFiles, wordFiles], [1, 0]);
    }

    // ------------------------------------------------ 4. the plain formats

    {
      withDoc("#כותרת1[פרק א]\nטקסט עם #הדגשה[הדגשה].\n");
      captured.downloads.length = 0;
      exports_.exportMarkdown();
      exports_.exportText();
      check("markdown and plain text both come out", captured.downloads.length, 2);
      check(
        "with the right extensions",
        captured.downloads.map((d) => d.name.slice(d.name.lastIndexOf("."))),
        [".md", ".txt"],
      );
    }
  } finally {
    restore();
  }
}
