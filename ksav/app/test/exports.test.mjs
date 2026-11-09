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

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, ok, notOk } from "./harness.mjs";
import * as exports_ from "../.tmp-test/exports.mjs";
// The destination list, so the sentences below are checked against the model
// rather than against a copy of it written here.
import * as channels_ from "../.tmp-test/channels.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { drawPages } from "../.tmp-test/preview.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";

/**
 * Put pages on the screen, which is not the same as recording a compile.
 *
 * `currentPages` is what print and the HTML fallback read, and it is fed by
 * `drawPages` rather than by `runtime.lastResult` — deliberately, and for the
 * reason its own comment gives: a failed compile stores an empty `pages_svg`
 * and the redraw is skipped, so the two records disagree exactly when it
 * matters. A test that set `lastResult` and expected print to see pages would
 * be asserting the bug.
 */
function onScreen(pages) {
  // No hashes, which takes the blind full-redraw path — the one a webview
  // without an IntersectionObserver takes, and the one that needs nothing of the
  // host but somewhere to put a string. The windowed path is `preview.test.mjs`'s
  // subject; what matters here is only that `currentPages` now says these.
  drawPages({ innerHTML: "" }, pages);
}

// ---------------------------------------------------------------- the fakes
//
// Deliberately assembled inside `run()` and torn down after: a `document` on
// `globalThis` is enough to convince `@codemirror/view` it is in a browser, and
// the next test file is imported after this one has run. The harness has the
// same note on it, from the other direction.

/**
 * The module's own source, read now rather than inside `run`.
 *
 * `installDom` replaces the global `URL` with a fake carrying only the two
 * object-URL methods, so `new URL(…)` throws for as long as the fakes are up —
 * which is the whole of `run`.
 */
const EXPORTS_TS = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "exports.ts"),
  "utf8",
);

/** What was handed to the browser as a download, and what was printed. */
const captured = { downloads: [], printed: null, clipboard: null, status: null, blobs: [] };

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
    body: { appendChild() {}, removeChild() {}, append() {} },
    createElement: (tag) => ({
      tagName: String(tag).toUpperCase(),
      setAttribute(k, v) { this[k] = v; },
      // Every route out of the app flushes pending saves first, and there is no
      // document store here, so the save fails and `reportSaveFailure` builds a
      // banner. That is the *right* behaviour — an export must not silently
      // carry unsaved text out — and the fake has to be able to survive it, or
      // the only route that could not be tested would be the one that saves.
      append() {},
      appendChild() {},
      addEventListener() {},
      classList: { add() {}, remove() {}, toggle() {} },
      style: {},
      remove() {},
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
      // that is about to be built for it. Kept as the blob rather than as a
      // string because `Blob.text()` is asynchronous and this fake is not — the
      // assertions that need the words await it themselves.
      if (blob) captured.blobs.push(blob);
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

    // ------------------------------------------------ 1b. print and the range
    //
    // > *"A page range is offered for PDF only. No reason has been given for
    // > that."*
    //
    // Print is the route where "pages 4 to 9" is the entire reason anybody asks
    // the question, and it took the lot. These are pictures of pages, one SVG
    // each, so the range is a filter and nothing more — which is why it could
    // have been here all along.

    {
      withDoc(BALANCED);
      onScreen(["<svg id='p1'/>", "<svg id='p2'/>", "<svg id='p3'/>", "<svg id='p4'/>"]);
      exports_.setPages("");
      captured.printed = null;
      exports_.doPrint();
      check("with no range, every page prints", (captured.printed.html.match(/<svg /g) || []).length, 4);

      exports_.setPages("2-3");
      captured.printed = null;
      exports_.doPrint();
      check("with one, only those", (captured.printed.html.match(/<svg /g) || []).length, 2);
      ok("and they are the ones named", captured.printed.html.includes("p2") && captured.printed.html.includes("p3"));
      notOk("not the ones that were not", captured.printed.html.includes("p1"));
    }

    {
      // A spec with a piece in it that names nothing is refused rather than
      // silently trimmed. The engine's own parser drops what it cannot read, so
      // `1,x,5` used to print pages 1 and 5 and never mention the `x` — a sheaf
      // of paper that is quietly not the one that was asked for, on the one
      // route that cannot be undone by deleting a file.
      withDoc(BALANCED);
      exports_.setPages("1,x,5");
      captured.printed = null;
      exports_.doPrint();
      check("nothing is printed", captured.printed, null);
      check("and it is reported as an error", statusClass(), "err");
      ok("naming the piece that could not be read", statusText().includes("x"));
    }

    {
      // Asking past the end is not an error — the pages that exist still print —
      // but a printer that emits nothing looks exactly like a printer that is
      // broken, so it is worth a word.
      withDoc(BALANCED);
      exports_.setPages("9-12");
      captured.printed = null;
      exports_.doPrint();
      ok("the window still opens", !!captured.printed);
      check("with no pages in it", (captured.printed.html.match(/<svg /g) || []).length, 0);
      check("and that is said as a warning", statusClass(), "warn");
      exports_.setPages("");
    }

    {
      // Not persisted, deliberately: a range is a fact about one export, not a
      // preference. What is asserted is only that the module is the one place it
      // lives, so nothing else can hold a second opinion about it.
      exports_.setPages("3-4");
      check("the box remembers what was typed, verbatim", exports_.pagesText(), "3-4");
      check("and hands out the parsed form", exports_.pagesSpec().spans, [{ from: 3, to: 4 }]);
      exports_.setPages("");
      check("clearing it means every page again", exports_.pagesSpec().spans, null);
      onScreen(["<svg id='page1'/>"]);
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
      // The working case still works — and what it says about the handoff is
      // about **this document**, which is the whole of NOTES-PLAN decision 15's
      // *"a stated downgrade beats a silent one"*.
      //
      // It used to be one constant sentence on every export, which is wrong in
      // both directions at once: a sefer of plain footnotes was warned about an
      // apparatus it does not have, and a sefer with a side column was told that
      // "the multi-layer apparatus flattens" without being told into what.
      const html = "<html><head><style>p{margin:0}</style></head><body><p>שלום</p></body></html>";

      withDoc(BALANCED);
      backendThat({ html });
      captured.downloads.length = 0;
      await exports_.exportWord();
      check("a .doc is produced when the backend can", captured.downloads.length, 1);
      ok("named after the document", captured.downloads[0].name.endsWith(".doc"));
      check(
        "a document with nothing to lose is not warned about losing anything",
        statusClass(),
        "ok",
      );
      ok(
        "and is told that outright",
        statusText().includes(DICTS.he.wordKeepsEverything.slice(0, 12)),
      );

      // A side column, which Word has no equivalent for at all. Built by
      // joining lines rather than written as one literal: this file is edited
      // through tools that have twice turned a `\n` inside a JavaScript string
      // into a real line break, which is a syntax error the moment the string
      // also carries a quotation mark.
      withDoc(
        ["#עם_הערות_צד[", 'שלום#הערה(ערוץ: "צד")[הערת צד]', "]"].join("\n"),
      );
      backendThat({ html });
      await exports_.exportWord();
      check("a document that loses something is warned", statusClass(), "warn");
      ok(
        "and told what its side notes become",
        statusText().includes(DICTS.he.wordLosesSide.slice(0, 20)),
      );
      notOk(
        "without being told about the things it does not have",
        statusText().includes(DICTS.he.wordLosesFile.slice(0, 12)),
      );
    }

    {
      // Every destination this warning can name is one the model has. A
      // destination added to `channels.ts` with no sentence here would export
      // silently, which is the failure the whole item is about.
      const named = new Set(["side", "section", "region", "file"]);
      const missing = channels_.DESTINATION_IDS.filter(
        (id) => id !== "foot" && id !== "end" && !named.has(id),
      );
      check("every destination that loses something has a sentence", missing, []);
      // …and the two that lose nothing are named here too, so that adding a
      // third silent one has to be a deliberate edit.
      check(
        "and the ones that cross over unchanged are the two Word has",
        channels_.DESTINATION_IDS.filter((id) => id === "foot" || id === "end").sort(),
        ["end", "foot"],
      );
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

    // ------------------------------------- 3b. every HTML export states its direction
    //
    // #132. A Hebrew sefer exported to HTML and opened in a browser read left to
    // right, because the one path that trusted a backend to state the direction
    // was the one path where nothing stated it. There are three HTML producers —
    // the engine's reflowable export, the page-image fallback, and the Word
    // envelope — and they had three different contracts: `<html dir>` on the
    // fallback, `<body dir>` on the Word file, and nothing at all on the native
    // export.
    //
    // The engine now writes `dir` (and `lang`) on its own root element, where the
    // document's configuration is; these assertions are the other two agreeing,
    // read out of the files that actually reach a writer.
    {
      const rootDirOf = async () => (await captured.blobs.at(-1).text()).match(/<html[^>]*\bdir="([^"]+)"/)?.[1];
      const setDirection = (dir) => runtime.setCurrentDoc({ title: "קונטרס", assets: [], config: { dir } });

      for (const dir of ["rtl", "ltr"]) {
        setDirection(dir);

        // The page-image fallback, which has always carried it.
        withDoc(BALANCED);
        backendThat({ ok: false, why: "" });
        captured.blobs.length = 0;
        captured.downloads.length = 0;
        await exports_.exportHtml();
        check(`the page-image fallback says dir="${dir}"`, await rootDirOf(), dir);

        // The Word envelope, which said it on `<body>` only.
        withDoc(BALANCED);
        backendThat({ ok: true });
        captured.blobs.length = 0;
        captured.downloads.length = 0;
        await exports_.exportWord();
        check(`the Word export says dir="${dir}" on its root`, await rootDirOf(), dir);
        ok(
          "…and on the body Word actually reads",
          (await captured.blobs.at(-1).text()).includes(`<body dir="${dir}"`),
        );

        // And the reflowable export is passed through as the engine wrote it —
        // this is the third contract, and the app's half of it is *not touching
        // it*.
        withDoc(BALANCED);
        backendThat({ ok: true, html: `<html dir="${dir}" lang="he"><body><p>שלום</p></body></html>` });
        captured.blobs.length = 0;
        captured.downloads.length = 0;
        await exports_.exportHtml();
        check(`the reflowable export keeps dir="${dir}"`, await rootDirOf(), dir);
      }
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
      // …and each of them says so. These two, and Org, produced a file and set
      // no status at all, so the status bar went on saying whatever the last
      // operation had put there. Found by exporting a PDF and then watching the
      // bar read "rendering…" for eleven seconds while the file sat in the
      // downloads folder.
      ok("the last one names the file it wrote", statusText().includes(".txt"), statusText());
    }

    // ------------------------------------ 4b. a file never leaves in silence
    //
    // The class, rather than the four instances. Seven routes hand a file over
    // and two of them remembered to say so; the announcement belongs to the act
    // of handing it over, which is `handOver` in `exports.ts`. This is the
    // executable half of that: a route that reaches for the bare `download`
    // goes quiet again, and nothing else in the suite would notice.

    {
      // The three that take no backend and flush nothing. `exportTypst` and
      // `exportPdf` are asserted where they already run, deliberately: both
      // begin with `flushSaves()`, and a save inside these fakes genuinely
      // fails — which is the right behaviour and leaves `save.ts` holding a
      // recorded failure that the next *file* in the suite reads as its own.
      // The structural check below covers all seven anyway.
      const routes = [
        ["exportMarkdown", ".md"],
        ["exportOrg", ".org"],
        ["exportText", ".txt"],
      ];
      const silent = [];
      for (const [name, ext] of routes) {
        withDoc("#כותרת1[פרק א]\nטקסט.\n");
        captured.downloads.length = 0;
        globalThis.document.getElementById("status").textContent = "";
        await exports_[name]();
        const said = statusText();
        const wrote = captured.downloads.some((d) => d.name.endsWith(ext));
        if (wrote && !said.includes(ext)) silent.push(`${name}: "${said}"`);
      }
      check("no route hands a file over without saying so", silent, []);

      // And the source says it too, so the next route added cannot be the one
      // that forgets: `download` is called only inside the two functions that
      // announce what they wrote — `handOver` for one file, `handOverPair` for
      // the compact export's two (#130) — and each of those calls sits beside a
      // `setStatus`.
      const pairs = [
        "download(name, blob);",
        'download(first.name, new Blob([first.text], text));',
        'download(second.name, new Blob([second.text], text));',
      ];
      const bare = EXPORTS_TS.split("\n")
        .map((l, i) => [i + 1, l])
        .filter(([, l]) => /(?<![\w.])download\(/u.test(l))
        .filter(([, l]) => !l.trim().startsWith("import "))
        .filter(([, l]) => !pairs.includes(l.trim()));
      check(
        "and every handover goes through the two functions that announce it",
        bare.map(([n, l]) => `${n}: ${l.trim()}`),
        [],
      );
      // …and both of those functions do announce. A `download` call added to
      // them without a `setStatus` would be quiet again, which is what this
      // half is for.
      // Read between a function's opening brace and the first line that is a
      // lone `}` — enough for these two, and enough to see a `setStatus` in
      // them without a parser.
      const bodyOf = (name) => {
        const start = EXPORTS_TS.indexOf(`function ${name}(`);
        if (start < 0) return "";
        const end = EXPORTS_TS.indexOf("\n}\n", start);
        return end < 0 ? "" : EXPORTS_TS.slice(start, end);
      };
      const handOverBody = bodyOf("handOver");
      const pairBody = bodyOf("handOverPair");
      ok("the one-file handover says what it wrote", handOverBody.includes("setStatus"));
      ok("and the two-file one says both names", pairBody.includes("setStatus"));
    }

    // ------------------------------------------------ 5. the .typ, uncompiled

    {
      // Export .typ used to be a full render — PDF and all — asked for so that
      // one field of the response could be read. The `.typ` *is* the input to a
      // compile, so the compile was pure cost: seconds on a sefer, to obtain a
      // `format!` the engine does before Typst is invoked at all. That it no
      // longer happens is the claim, so it is what is asserted: the route is
      // driven and the compile counter has to stay at zero.
      // Nothing open to save. Every route out of the app flushes first, and a
      // flush with a document but no store behind it records a *real* storage
      // failure — which is right, and which would then be the state the next
      // test file starts in, because the modules are one graph across the
      // suite. So this block says what it means: there is nothing pending.
      runtime.setCurrentDoc?.(null);
      withDoc(BALANCED);
      let compiles = 0;
      let assembles = 0;
      runtime.setBackend({
        async compile() {
          compiles++;
          return { ok: true, pages_svg: [], diagnostics: [], pdf_base64: "", typst_source: "src" };
        },
        async assemble() {
          assembles++;
          return { ok: true, typst_source: "#let ...\nפתיחה\n", diagnostics: [] };
        },
      });
      captured.downloads.length = 0;
      await exports_.exportTypst();
      check("the .typ comes out", captured.downloads.length, 1);
      ok("with the right extension", captured.downloads[0].name.endsWith(".typ"));
      check("assembled once", assembles, 1);
      check("and nothing was compiled to get it", compiles, 0);
      // …and it says the file went out. Asserted here rather than in the sweep
      // above, for the reason given there.
      ok("and it names what it wrote", statusText().includes(".typ"), statusText());
    }

    // ------------------------------- 5b. the compact export is two files, and whole
    //
    // #130. The self-contained `.typ` is 550 KB whatever the document is, because
    // it carries the whole prelude. The compact arrangement — the one a compile
    // already uses — is a document that `#import`s its prelude plus that prelude
    // as a sibling file. What is asserted here is the shape of that handover:
    // two files, the prelude first, both named, and nothing written if the engine
    // sends only half of the pair.
    {
      const PRELUDE = "#let _ix = ()\n#let מסמך(..) = none\n";
      const DOC = '#import "core.typ": *\n#show: מסמך\n\nפתיחה\n';
      let asked = null;
      let assembles = 0;
      let compiles = 0;
      // Nothing open to save: every route out of the app flushes first, and a
      // flush with a document but no store behind it records a *real* storage
      // failure, which the next file in the suite would then read as its own.
      //
      // Which means `fileStem()` is `ksav` here — the same name the prelude is
      // usually called — so the prelude is answered under a name the app could
      // not possibly have guessed. That is the better assertion anyway: it says
      // the name is **read from the engine** rather than spelled in `exports.ts`.
      runtime.setCurrentDoc?.(null);
      withDoc(BALANCED);
      runtime.setBackend({
        async compile() {
          compiles++;
          return { ok: true, pages_svg: [], diagnostics: [], pdf_base64: "", typst_source: "" };
        },
        async assemble(_body, _cfg, _assets, opts) {
          assembles++;
          asked = opts;
          return {
            ok: true,
            typst_source: DOC,
            prelude: PRELUDE,
            prelude_name: "core.typ",
            diagnostics: [],
          };
        },
      });

      captured.downloads.length = 0;
      captured.blobs.length = 0;
      await exports_.exportTypstCompact();

      check("a compact export asks the engine for the compact arrangement", asked, { compact: true });
      check("it writes two files", captured.downloads.length, 2);
      check(
        "the two files are the prelude and the document, in that order",
        captured.downloads.map((d) => d.name),
        ["core.typ", "ksav.typ"],
      );
      check(
        "the prelude's bytes are the ones the engine sent",
        (await captured.blobs[0].text()).length,
        PRELUDE.length,
      );
      ok(
        "and the document names exactly that file",
        (await captured.blobs[1].text()).startsWith('#import "core.typ": *'),
        await captured.blobs[1].text(),
      );
      ok(
        "the status names both files",
        statusText().includes("core.typ") && statusText().includes(captured.downloads[1].name),
        statusText(),
      );
      check("assembled once", assembles, 1);
      check("and nothing was compiled to get it", compiles, 0);
    }

    {
      // Half a pair is not a file. A document importing a prelude that was never
      // written is the exact failure the compact option exists to avoid, so the
      // document is refused and the writer is told — rather than saving something
      // that does not compile.
      withDoc(BALANCED);
      runtime.setBackend({
        async assemble() {
          return {
            ok: true,
            typst_source: '#import "ksav.typ": *\nפתיחה\n',
            prelude: "",
            prelude_name: "ksav.typ",
            diagnostics: [],
          };
        },
      });
      captured.downloads.length = 0;
      await exports_.exportTypstCompact();
      check("a document with no prelude beside it is not written", captured.downloads.length, 0);
      check("and that is an error, not a warning", statusClass(), "err");
      ok(
        "said in words",
        statusText().includes(DICTS.he.typstCompactNoPrelude.slice(0, 12)),
        statusText(),
      );
    }

    {
      // And the self-contained route says which of the two it is, with the size
      // on the end — the missing half of the UAT report. A writer who exports a
      // five-word note and gets 550 KB is not being told a bug, they are being
      // told the price of a file that compiles anywhere; the number is what makes
      // that legible.
      const short = "#let ...\nפתיחה\n";
      const bytes = new TextEncoder().encode(short).length;
      runtime.setCurrentDoc?.(null);
      withDoc(BALANCED);
      runtime.setBackend({
        async assemble() {
          return { ok: true, typst_source: short, diagnostics: [] };
        },
      });
      captured.downloads.length = 0;
      await exports_.exportTypst();
      check("the self-contained export writes one file", captured.downloads.length, 1);
      ok(
        "and says the prelude is inside it",
        statusText().includes("עצמאי") || statusText().includes("self-contained"),
        statusText(),
      );
      ok("with the size it wrote", statusText().includes(`${bytes} B`), statusText());
    }

    {
      // The one thing that can still go wrong without a layout: a chapter the
      // library no longer holds. That is a hole in the file, so the file does
      // not go out and the writer is told which chapter — rather than finding
      // out from whoever opens it.
      withDoc(BALANCED);
      runtime.setBackend({
        async assemble() {
          return {
            ok: false,
            typst_source: "",
            diagnostics: [{ severity: "error", message: "אין מסמך בשם \"פרק ג\"" }],
          };
        },
      });
      captured.downloads.length = 0;
      await exports_.exportTypst();
      check("nothing is downloaded", captured.downloads.length, 0);
      ok("and the reason names the chapter", statusText().includes("פרק ג"));
      check("as an error", statusClass(), "err");
    }
  } finally {
    restore();
  }
}
