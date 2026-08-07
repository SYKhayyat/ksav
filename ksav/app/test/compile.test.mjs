// What gets sent to the engine, and what comes back.
//
// The last of the nineteen modules the runner could not build. `compile.ts` is
// where the *speculative heal* lives — the decision to compile a repaired copy
// of an unbalanced document so the writer keeps seeing their page while they
// type the body of a `#הערה[`. It is a good decision and it is the origin of the
// export bug in `exports.test.mjs`: everything downstream of `lastResult` is
// looking at text the writer did not type, and only the routes that say so are
// honest about it.
//
// Three contracts are asserted here, and every one of them is depended on by a
// different module that cannot see it:
//
//   * **`bodyOnScreen` returns the healed text**, because `jump.ts` maps clicks
//     against the layout and the layout came from the heal.
//   * **the heal never changes the number of lines**, which is what lets
//     `diagview` treat an engine line number as a line number in what the writer
//     typed. `diagview` has its own test for the offset; nothing asserted the
//     invariant the offset rests on.
//   * **`reflowableHtml` reports a reason and not an outcome.** It used to set
//     the status line to "exporting page images instead" — a sentence about what
//     its *caller* was going to do, true for one caller and false for two.

import { check, ok, notOk, fakeView, installChrome } from "./harness.mjs";
import { bodyOnScreen, compileForExport, reflowableHtml } from "../.tmp-test/compile.mjs";
import { analyze } from "../.tmp-test/brackets.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const SRC = path.resolve(HERE, "..", "src");

const lines = (s) => s.split(String.fromCharCode(10)).length;

/** An engine that records what it was asked for and answers as told. */
function backendThat(answer) {
  const seen = [];
  runtime.setBackend({
    async compile(body, config, opts) {
      seen.push({ body, config, opts });
      return typeof answer === "function" ? answer(body, opts) : answer;
    },
  });
  return seen;
}

export async function run() {
  const chrome = installChrome();
  try {
    // ------------------------------------------------ the heal, and what sees it

    {
      const doc = "פתיחה#הערה[הגוף לא נסגר\nעוד שורה\n";
      runtime.setView(fakeView(doc, 0));
      const { body } = bodyOnScreen();
      ok("the text on screen is the repaired copy", body.includes("]"));
      check("and it is what the analyzer would produce", body.endsWith(analyze(doc).healed), true);
      check("the writer's document itself is untouched", runtime.docText(), doc);
    }

    {
      // The invariant everything downstream rests on. Healing inserts closers
      // and never a newline, which is the only reason an engine line number can
      // be treated as a line number in the writer's own text.
      const docs = [
        "פתיחה#הערה[לא נסגר\nעוד שורה\nושלישית\n",
        "א#הערה[אחת\nב#הדגשה[שתיים\nג#נטוי[שלוש\n",
        "#רשימה(\n  פריט[אלף\n  פריט[בית\n",
        "טקסט) מיותר\n",
        "/* פתוח ולא נסגר\nהמשך\n",
      ];
      for (const doc of docs) {
        const { healed, problems } = analyze(doc);
        ok(`${JSON.stringify(doc.slice(0, 14))} is unbalanced`, problems.length > 0);
        check("and the repair adds no line", lines(healed), lines(doc));
      }
    }

    {
      // A balanced document is sent exactly as written — no repair, no
      // difference between what is compiled and what is on screen.
      const doc = "פתיחה#הערה[נסגר] סוף.\n";
      runtime.setView(fakeView(doc, 0));
      check("nothing to repair", analyze(doc).problems, []);
      ok("so the body ends with the writer's own text", bodyOnScreen().body.endsWith(doc));
    }

    // ------------------------------------------------ what the export asks for

    {
      // The export path asks for the PDF and the assembled source; the preview
      // deliberately does not, because both cost more than the page. Asserted
      // because it is a performance decision written as two booleans, and a
      // performance decision nothing checks is one that gets undone.
      runtime.setView(fakeView("פתיחה\n", 0));
      const seen = backendThat({ ok: true, pages_svg: [], diagnostics: [], pdf_base64: "AA", typst_source: "x" });
      await compileForExport();
      check("one compile was asked for", seen.length, 1);
      check("with the PDF", seen[0].opts.want_pdf, true);
      check("and the assembled source", seen[0].opts.want_source, true);
    }

    {
      // A per-export field rides on the request without being saved into the
      // document — "just pages 4 to 9" is decided at the moment of exporting.
      runtime.setView(fakeView("פתיחה\n", 0));
      const seen = backendThat({ ok: true, pages_svg: [], diagnostics: [] });
      await compileForExport({ pdf_pages: "4-9" });
      check("the page range reaches the engine", seen[0].config.pdf_pages, "4-9");
    }

    {
      // The export compiles the document as *written*, not as healed: an
      // unbalanced document must fail with a compile error rather than quietly
      // exporting a repair. That asymmetry with the preview is the whole point.
      const doc = "פתיחה#הערה[לא נסגר\n";
      runtime.setView(fakeView(doc, 0));
      const seen = backendThat({ ok: false, pages_svg: [], diagnostics: [] });
      await compileForExport();
      notOk("the export was not sent the repair", seen[0].body.includes("נסגר]"));
      ok("it was sent what the writer typed", seen[0].body.includes("לא נסגר"));
    }

    {
      // A transport failure is reported and answered with null, rather than
      // throwing into a click handler.
      runtime.setView(fakeView("פתיחה\n", 0));
      runtime.setBackend({
        compile: () => Promise.reject(new Error("the engine is not there")),
      });
      chrome.clear();
      check("a dead engine answers null", await compileForExport(), null);
      ok("and says so", chrome.status().length > 0);
      check("as an error", chrome.statusClass(), "err");
    }

    // ------------------------------------------------ the reason, not the outcome

    {
      runtime.setView(fakeView("פתיחה\n", 0));
      backendThat({ ok: true, html: "<html><body>שלום</body></html>", pages_svg: [], diagnostics: [] });
      const good = await reflowableHtml();
      ok("real HTML comes back", good.html?.includes("שלום"));
      check("with nothing to explain", good.why, "");
    }

    {
      runtime.setView(fakeView("פתיחה\n", 0));
      backendThat({ ok: false, pages_svg: [], diagnostics: [{ message: "html export unsupported" }] });
      chrome.clear();
      const bad = await reflowableHtml();
      check("a refusal is null", bad.html, null);
      check("carrying the engine's own reason", bad.why, "html export unsupported");
      // The correction: the shared layer says nothing at all. Its two callers do
      // different things about the same refusal — one writes page images, two
      // write nothing — so a sentence here is wrong for at least one of them.
      check("and the shared layer announces nothing", chrome.status(), "");
    }

    {
      // The same, from source, so the rule survives a refactor that keeps the
      // return shape and puts the sentence back. This is the layering the bug
      // was made of, and a return value cannot express "and told nobody".
      const src = await readFile(path.join(SRC, "compile.ts"), "utf8");
      const start = src.indexOf("export async function reflowableHtml");
      ok("the function was found", start > 0);
      const body = src.slice(start, src.indexOf("\n}", start));
      notOk("`reflowableHtml` sets no status of its own", /setStatus\(/.test(body));
    }

    {
      // And an engine that throws is the same kind of answer, not an exception
      // escaping into the export menu.
      runtime.setView(fakeView("פתיחה\n", 0));
      runtime.setBackend({ compile: () => Promise.reject(new Error("gone")) });
      const bad = await reflowableHtml();
      check("a thrown engine is a refusal", bad.html, null);
      ok("with something to say about it", bad.why.length > 0);
    }
  } finally {
    chrome.restore();
  }
}
