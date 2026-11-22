// A link in a document, followed — and the four ways writing that down goes wrong.
//
// # The finding (#202)
//
// A `#link("https://…")` the writer typed reached the preview as an `<a href>`,
// and `svgsafe.ts` had decided which schemes may survive: `http`, `https`,
// `mailto`, `tel`. What nobody had decided is what a *click* does. In the browser
// it was a navigation of the application's own tab, and an editor that has
// navigated away has lost every open document and has no back button; in the
// desktop build the same click asked the webview to load a **new document**, and
// a `file:` URL there is a local file rendered inside the window that carries the
// application's IPC bridge. The sanitizer closed the dangerous half of that (a
// `file:` link is not kept) and the surviving half was still wrong: an `https:`
// link replaced the editor with somebody's web page.
//
// `openlink.ts` is the answer: the click is intercepted, and the URL leaves the
// application through the system's browser instead of through the document.
//
// # What is pinned here, and why each of the four is a different failure
//
//   1. **The walk finds the link under the pointer.** A laid-out page puts a
//      transparent `<rect>` on top of the text, so the click target is almost
//      never the `<text>` and never the `<a>`. A resolver written against the
//      node it expects finds nothing on every real click and the feature is dead
//      while every unit of it passes.
//   2. **The walk stops.** At the page's `<svg>`, and at a destination the
//      sanitizer would not have kept. The second is what makes this a *second*
//      line rather than a copy of the first: an export path or an older engine
//      can hand a page whose attributes the sanitizer never saw.
//   3. **A followed link goes somewhere else, never here.** `followLink` refuses
//      what `linkAt` refuses and calls the opener with the URL; the browser door
//      opens a **new tab** with `noopener`, because a page that can reach back
//      through `window.opener` can navigate the editor.
//   4. **The wiring and the shell agree.** `panehost.ts` must intercept *before*
//      it jumps, and `src-tauri/src/open.rs` must hold the same four schemes —
//      a shell that opens something the page would not keep is not a policy, and
//      a page that ships what the shell refuses is a dead link.
//
// Mutation lives in the shapes, which is what this module takes: plain objects in
// the tests, DOM nodes in the page, so `test/harness.mjs` needs no DOM here and a
// fence that needs a browser is a fence that gets skipped.

import { check, ok, notOk } from "./harness.mjs";
import { linkAt, followLink } from "../.tmp-test/openlink.mjs";
import { linkable } from "../.tmp-test/svgsafe.mjs";
import { readFileSync } from "node:fs";

/** An element of a laid-out page, as much of one as the walk reads. */
const node = (tagName, attrs = {}, parentElement = null) => ({
  tagName,
  parentElement,
  getAttribute: (name) => (name in attrs ? attrs[name] : null),
});

export async function run() {

// -------------------------------------------------------------- 1. the walk

{
  // The measured shape: `<a><rect fill="none" pointer-events="all"/></a>`, and the
  // click lands on the rect.
  const link = node("a", { href: "https://example.com/a" });
  const rect = node("rect", {}, link);
  check("a click on a link's hit-area finds the link", linkAt(rect), "https://example.com/a");

  // Deeper, because a link can wrap a whole line of shaped text: `<a><g><g><text>`.
  const far = node("a", { href: "https://example.com/deep" });
  const mid = node("g", {}, far);
  const top = node("g", {}, mid);
  check("three levels up is still the link", linkAt(node("rect", {}, top)), "https://example.com/deep");

  // `xlink:href`, which Typst emits alongside `href` in some versions.
  const old = node("a", { "xlink:href": "mailto:x@example.com" });
  check("xlink:href is read too", linkAt(node("rect", {}, old)), "mailto:x@example.com");

  // Whitespace around the attribute is the attribute's business.
  const spaced = node("a", { href: "  tel:+972512345678\n" });
  check("the destination is trimmed", linkAt(spaced), "tel:+972512345678");

  // Nothing under the pointer is a link: the ordinary click, which jumps.
  check("a click on plain text is not a link", linkAt(node("text", {}, node("g"))), null);
  check("a click on nothing at all is not a link", linkAt(null), null);
  check("a click on a bare string is not a link", linkAt("rect"), null);
}

// ------------------------------------------------------------- 2. the bound

{
  // A link in a *previous* page must not be reachable through the document body:
  // the walk stops at the page's `<svg>`, which is what `root` is.
  const svg = node("svg");
  const text = node("text", {}, svg);
  check("the walk stops at the page's own svg", linkAt(text, svg), null);
  // An `<a>` *above* the page — a document-level link wrapping a whole `<svg>`,
  // which nothing emits today and a future engine could — must not capture every
  // click in the page. This is what `root` is for.
  const wrapper = node("a", { href: "https://example.com/whole-page" }, svg);
  svg.parentElement = wrapper;
  check("a link above the page is not reached", linkAt(text, svg), null);
  // And with no `root` handed in at all — the bound is the `<svg>` itself, not the
  // caller's memory of which page it asked about.
  check("the svg bounds the walk even without a root", linkAt(text), null);

  // A destination the sanitizer would not keep is refused even if a page carries
  // it — an export path, a cached page, a hand-written SVG.
  for (const refused of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,x",
    "blob:https://example.com/u",
    "vscode://file/x",
  ]) {
    notOk(`refuses ${refused}`, linkAt(node("a", { href: refused })));
  }
  // And a link with no destination at all — Typst's hit-area `<a>` has none.
  notOk("refuses an anchor with no href", linkAt(node("a")));
  check("an anchor without href stops the walk", linkAt(node("rect", {}, node("a", {}, node("a", { href: "https://x.example" })))), null);
}

// ------------------------------------------------------- 3. following one

{
  const seen = [];
  const record = (url) => {
    seen.push(url);
  };

  await followLink("https://example.com/x", record);
  check("followed", seen, ["https://example.com/x"]);

  await followLink("file:///etc/passwd", record);
  await followLink("javascript:alert(1)", record);
  check("refused destinations never reach the door", seen.length, 1);

  // The rule is `linkable`'s, not a copy of it: every scheme it keeps is a scheme
  // this follows, and the two cannot drift because there is one function.
  for (const kept of ["https://a.example", "http://b.example", "mailto:c@example.com", "tel:+1"]) {
    ok(`the sanitizer keeps ${kept}`, linkable(kept));
  }
}

// --------------------------------------------------- 4. the wiring and the shell

{
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

  const panehost = read("../src/panehost.ts");
  const clickWire = panehost.slice(panehost.indexOf("function wirePreviewClicks"));
  ok("the preview click is intercepted", clickWire.includes("linkAt(e.target"));
  ok("and the webview is told not to act on it", clickWire.includes("e.preventDefault()"));
  // Order matters and is the whole of the fix: a jump taken first is a caret
  // moved and a navigation already under way.
  ok(
    "the link is handled before the jump",
    clickWire.indexOf("linkAt(") < clickWire.indexOf("jumpFromClick("),
  );
  ok("and through the one door", clickWire.includes("followLink("));

  // The shell, and the third check. Read as text because a Tauri command needs a
  // webview to call and this suite has none — what can be checked without one is
  // that the door exists, and that its scheme list is the page's.
  const shell = read("../src-tauri/src/open.rs");
  ok("the shell has the door", shell.includes("pub fn openable"));
  for (const scheme of ["http", "https", "mailto", "tel"]) {
    ok(`the shell allows ${scheme}`, shell.includes(`"${scheme}"`));
  }
  ok("the policy is a pure function", shell.includes("pub fn refusal"));
  const lib = read("../src-tauri/src/lib.rs");
  ok("the command is declared", /#\[tauri::command\]\s*\nfn ksav_open_external/.test(lib));
  ok("and registered", lib.includes("ksav_open_external"));
  // Ordered, in the shell as in the page: the policy is asked **before** anything
  // is spawned, so there is no path where a refused URL is passed to a program.
  const door = lib.slice(lib.indexOf("fn ksav_open_external"));
  // The *call*, not the name: the doc comment above the command names it too, and
  // a fence that matched prose would report a deleted check as present.
  const asked = door.indexOf("open::refusal(&url)");
  const spawned = door.indexOf("open::spawn(&url)");
  // Both, before the comparison: `-1 < indexOf(…)` is true, so a deleted check
  // used to read as a check that ran first. (It did read exactly that, once.)
  ok("the command asks the policy", asked >= 0);
  ok("the refusal runs before the spawn", asked >= 0 && asked < spawned);
  ok("opened with the platform's own browser", shell.includes("xdg-open") && shell.includes("\"open\""));
}
}
