// Searching the source, the page, or both — and the one way this can be faked.
//
// # The report
//
// > *"Search should be configurable to search the source, the preview, or
// > both."*
//
// The item carries its own warning, and it is the reason half of this file
// exists: built off the source string under a new label, *"search the preview"*
// becomes a fake — a control that appears to do a second thing and does the
// first one twice. That failure passes every assertion about hits, counts,
// ordering and scope, because all of those are about a string and the wrong
// string is still a string. So the assertions below are in two halves: what a
// search finds, and **where the printed half came from**.
//
// # What makes the two scopes different
//
// The source holds text that never prints — command names, argument names,
// comments — and the page holds text nobody typed: a note's marker, a running
// head repeating a heading from far above, an auto-numbered siman, a whole
// included chapter. Every case below that matters is one of those, because a
// phrase that is identical on both sides cannot tell a real preview search from
// a second source search.

import { check, ok, notOk } from "./harness.mjs";
import * as find from "../.tmp-test/find.mjs";
import * as panelrows from "../.tmp-test/panelrows.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");
const MAIN = readFileSync(path.join(SRC, "main.ts"), "utf8");
const COMPILE = readFileSync(path.join(SRC, "compile.ts"), "utf8");
const FIND = readFileSync(path.join(SRC, "find.ts"), "utf8");

/** A page of printed lines, as the engine reports them. */
function page(...lines) {
  return lines.map((text, i) => ({ y: 100 + i * 14, text, file: null, line: null }));
}

/** A printed line that traces back to a line of the writer's own text. */
function traced(text, line, y = 100) {
  return { y, text, file: null, line };
}

export async function run() {
  // --------------------------------------------------------- the source half

  {
    const body = "אלף בית\n#הערה[גימל]\nאלף בית";
    const r = find.findIn(body, null, "אלף", { scope: "source" });
    check("both copies of a repeated phrase are found", r.hits.length, 2);
    check("...the first at its own offset", r.hits[0].at, 0);
    // The bug this is really about: a per-line `indexOf` over the whole body
    // finds the *first* copy every time, so the second row sends the caret to
    // the first paragraph and looks exactly like a working list.
    check("...and the second at its own", r.hits[1].at, body.lastIndexOf("אלף"));
    check("...on the line it is actually on", r.hits[1].line, 3);
    check("...and every one of them is in the source", [...new Set(r.hits.map((h) => h.where))], ["source"]);
  }

  {
    // A command name is in the source and never on the page. Searching the
    // source finds it; that is the half a writer editing markup wants.
    const body = "#הדגשה[אלף]";
    check("a command name is findable in the source", find.findIn(body, null, "הדגשה", { scope: "source" }).hits.length, 1);
  }

  // ---------------------------------------------------------- the page half

  {
    // The marker `1` is on the page and nowhere in the source: nothing typed it.
    // This is the case that separates a real preview search from a second
    // source search, and it is the one the item warns about by name.
    const body = "אלף#הערה[גימל] בית";
    const pages = [page("אלף1 בית", "1. גימל")];
    check(
      "a phrase that printed but was never typed is found on the page",
      find.findIn(body, pages, "אלף1", { scope: "preview" }).hits.length,
      1,
    );
    check(
      "...and the same search against the source finds nothing",
      find.findIn(body, pages, "אלף1", { scope: "source" }).hits.length,
      0,
    );
  }

  {
    const pages = [page("שער"), page("פרק א", "אלף בית")];
    const r = find.findIn("", pages, "אלף", { scope: "preview" });
    check("a printed hit says which page", r.hits[0].page, 2);
    check("...and where on it", r.hits[0].y, 114);
    check("...and pages come back in page order", r.hits.length, 1);
  }

  {
    // Line 12 of an included chapter and line 12 of the sefer that included it
    // are two different places. The file travels with the hit for the same
    // reason `LineRun` carries one.
    const pages = [[{ y: 100, text: "אלף בית", file: "perek-b.ksv", line: 12 }]];
    const r = find.findIn("", pages, "אלף", { scope: "preview" });
    check("a hit from an included chapter names the file", r.hits[0].file, "perek-b.ksv");
    notOk("...and is not offered as a place to type", find.isEditable(r.hits[0]));
  }

  {
    const pages = [[traced("אלף בית", 4)]];
    const hit = find.findIn("", pages, "בית", { scope: "preview" }).hits[0];
    check("a printed hit that traces to the source says which line", hit.line, 4);
    ok("...and can be gone to", find.isEditable(hit));
  }

  {
    // Ink the writer never typed — a running head, an auto-numbered siman, a
    // note's marker. It can be shown and it cannot be edited, and the row says
    // so rather than putting the caret somewhere plausible.
    const hit = find.findIn("", [page("שולחן ערוך · סימן ג")], "סימן", { scope: "preview" }).hits[0];
    check("untraceable ink has no source line", hit.line, undefined);
    notOk("...and is not offered as a place to type", find.isEditable(hit));
  }

  // ------------------------------------------------------------- the scopes

  {
    const body = "אלף";
    const pages = [page("אלף")];
    check("source only looks at the source", find.findIn(body, pages, "אלף", { scope: "source" }).hits.length, 1);
    check("preview only looks at the pages", find.findIn(body, pages, "אלף", { scope: "preview" }).hits.length, 1);
    const both = find.findIn(body, pages, "אלף", { scope: "both" });
    check("both looks at both", both.hits.length, 2);
    check("...the source first, because that is where a writer types", both.hits[0].where, "source");
    check("...and the page after it", both.hits[1].where, "preview");
  }

  {
    // *"No matches"* and *"there was nothing to match against"* are different
    // answers, and only one of them is about the phrase that was typed.
    const notYet = find.findIn("אלף", null, "אלף", { scope: "preview" });
    check("a preview search before the sefer is laid out says so", notYet.previewUnavailable, "not-compiled");
    check("...rather than reporting no matches", notYet.hits.length, 0);
    check("an empty page list is the same answer", find.findIn("", [], "א", { scope: "preview" }).previewUnavailable, "not-compiled");
    check(
      "...and a search that did lay out says nothing is wrong",
      find.findIn("", [page("אלף")], "אלף", { scope: "preview" }).previewUnavailable,
      null,
    );
    // The source half still answers under `both`: half an answer beats none.
    const half = find.findIn("אלף", null, "אלף", { scope: "both" });
    check("under both, the source half still answers", half.hits.length, 1);
    check("...and the page half still says why it did not", half.previewUnavailable, "not-compiled");
  }

  {
    // The item names this trap by hand: *"in the laid-out text, words break
    // across lines"*. A phrase the reader sees plainly on the page is, on the
    // page's own terms, the tail of one line and the head of the next — and a
    // per-line search finds nothing at all for it.
    const pages = [page("...אמר רבי יוחנן משום", "רבי שמעון בן יוחאי")];
    const r = find.findIn("", pages, "משום רבי שמעון", { scope: "preview" });
    check("a phrase broken across a line break is found", r.hits.length, 1);
    check("...and reported on the line it starts on", r.hits[0].text, "...אמר רבי יוחנן משום");
    check("...at the point it starts", r.hits[0].from, "...אמר רבי יוחנן ".length);
    // No end on this line, so the end is the line. An index past the string
    // would light up nothing, or be trusted by a caller slicing with it.
    check("...and its end clamped to that line", r.hits[0].to, "...אמר רבי יוחנן משום".length);
  }

  {
    // The join is a space and not nothing: two lines of a page are two lines,
    // and "יוחנןרבי" is a word that appeared nowhere.
    const pages = [page("אמר רבי יוחנן", "רבי שמעון")];
    check(
      "the lines of a page are not run together into a word nobody wrote",
      find.findIn("", pages, "יוחנןרבי", { scope: "preview" }).hits.length,
      0,
    );
  }

  {
    // A page is its own string: a phrase whose halves are on two different
    // pages did not appear anywhere, and finding it would be an invention.
    const pages = [page("אמר רבי יוחנן משום"), page("רבי שמעון בן יוחאי")];
    check(
      "a phrase split across two pages is not found",
      find.findIn("", pages, "משום רבי שמעון", { scope: "preview" }).hits.length,
      0,
    );
  }

  // ------------------------------------------------------- the small print

  {
    check("an empty query finds nothing", find.findIn("אלף", [page("אלף")], "", { scope: "both" }).hits.length, 0);
    // Non-overlapping, which is what a reader means by "how many times does
    // this appear": `אאא` holds one `אא` and a leftover, not two.
    check("occurrences do not overlap", find.findIn("אאא", null, "אא", { scope: "source" }).hits.length, 1);
  }

  {
    const body = "Alef alef";
    check("case is ignored by default", find.findIn(body, null, "alef", { scope: "source" }).hits.length, 2);
    check(
      "...and told apart when asked",
      find.findIn(body, null, "alef", { scope: "source", caseSensitive: true }).hits.length,
      1,
    );
  }

  {
    // A list that stops without saying it stopped reads as complete — the same
    // rule the palette was fixed for.
    const body = Array.from({ length: 20 }, () => "אלף").join("\n");
    const r = find.findIn(body, null, "אלף", { scope: "source", limit: 5 });
    check("the limit is applied", r.hits.length, 5);
    check("...and what it dropped is counted", r.hidden, 15);
  }

  // ------------------------------------------------------------- the rows

  {
    const rows = panelrows.findList(
      find.findIn("אלף", [page("אלף")], "אלף", { scope: "both" }),
      "אלף",
      "both",
    );
    const groups = rows.rows.filter((r) => r.id?.startsWith("findgroup:")).map((r) => r.label);
    check("both groups get a heading", groups, ["findInSource", "findOnPage"]);
    check("...each carrying its count", rows.rows.find((r) => r.id === "findgroup:findInSource").chip, "1");
  }

  {
    // A "0 in the source" heading under a preview-only scope would be a count
    // of something nobody counted.
    const rows = panelrows.findList(
      find.findIn("אלף", [page("אלף")], "אלף", { scope: "preview" }),
      "אלף",
      "preview",
    );
    const groups = rows.rows.filter((r) => r.id?.startsWith("findgroup:")).map((r) => r.label);
    check("a scope that did not read the source shows no source heading", groups, ["findOnPage"]);
  }

  {
    // The empty half is still named. A list that silently omits it reads as
    // though the search never looked there — the marks pane's complaint again.
    const rows = panelrows.findList(
      find.findIn("אלף", [page("בית")], "אלף", { scope: "both" }),
      "אלף",
      "both",
    );
    ok(
      "a half with no hits says so instead of vanishing",
      rows.rows.some((r) => r.id === "findempty:findOnPage"),
    );
  }

  {
    const rows = panelrows.findList(
      find.findIn("אלף", null, "אלף", { scope: "both" }),
      "אלף",
      "both",
    );
    ok(
      "an unlaid-out sefer says so in place of the page group",
      rows.rows.some((r) => r.id === "findgroup:unavailable"),
    );
    notOk(
      "...and does not also claim no matches printed",
      rows.rows.some((r) => r.id === "findempty:findOnPage"),
    );
  }

  {
    const rows = panelrows.findList(find.findIn("אלף", null, "", { scope: "both" }), "", "both");
    check("nothing asked is its own empty state", rows.empty, "findNothingAsked");
  }

  {
    const hit = panelrows
      .findList(find.findIn("", [[traced("אלף בית", 4, 260)]], "אלף", { scope: "preview" }), "אלף", "preview")
      .rows.find((r) => r.does.kind === "hit" && r.does.page !== undefined);
    check("a printed row carries the page", hit.does.page, 1);
    check("...and the point on it", hit.does.y, 260);
    check("...and the place in the source, when there is one", hit.does.at, undefined);
  }

  // ------------------------------------------------- and it is not the fake
  //
  // The half that cannot be checked by exercising `findIn`: *which document*
  // the shell hands it. Every assertion above passes if `renderFindPane` were
  // to pass the buffer in place of the pages — the hits would be real hits
  // against a real string, and the scope chooser would be a control that
  // silently does the same thing twice.

  {
    ok(
      "the printed half is read off the pages that are on screen",
      /function renderFindPane\(\)[\s\S]{0,1400}currentPageText\(\)/.test(MAIN),
    );
    // **Not off the last compile**, which is a different record and this
    // repository's third instance of the same mistake — `prohibitions.test.mjs`
    // states the class and caught this one while it was being written. A failed
    // compile is stored with no pages and no text while the pages on screen are
    // still the last good ones, so a find drawer reading it would announce that
    // the phrase the writer is looking at printed nowhere, on every unbalanced
    // bracket, mid keystroke.
    notOk("...and never off the last compile", /lastResult\?\.pages_text/.test(MAIN));
    // The prohibition, and it is the fence: nothing in `find.ts` may take a
    // page from a source string. `findIn` receives the pages; it never builds
    // them, and there is no second door into the preview half.
    notOk("...and `find.ts` never manufactures a page of its own", /pages\s*=\s*\[/.test(FIND));
  }

  {
    // The walk is not free, so it is asked for only while a search that reads
    // it is on screen — the same bargain `want_lines` and `want_markers` make.
    ok("the engine is asked for the page text", /want_text: searchingThePage\(\)/.test(COMPILE));
    ok(
      "...only under a scope that reads the page",
      /function searchingThePage\(\)[\s\S]{0,300}searchScope[\s\S]{0,80}=== "source"\) return false/.test(COMPILE),
    );
    ok(
      "...and only while the drawer is open",
      /function searchingThePage\(\)[\s\S]{0,400}find-drawer/.test(COMPILE),
    );
  }

  {
    // Opening the drawer, or switching into a scope that reads the page, has to
    // ask for the compile that fills it in — otherwise the drawer reports the
    // preview unavailable until some unrelated keystroke happens to trigger one.
    ok(
      "opening the drawer under a page scope asks for a layout",
      /wirePanel\("find-drawer"[\s\S]{0,600}compileNow\(\)/.test(MAIN),
    );
    ok(
      "...and so does switching into one",
      /id: "find-scope"[\s\S]{0,600}compileNow\(\)/.test(MAIN),
    );
  }

  {
    ok("the scope is on the drawer it governs", /id: "find-scope"/.test(MAIN));
    ok("...and in the settings, where the application is set up", /selectRow\("searchScope", "searchScope"/.test(MAIN));
    // The default is what the application has always done. A new scope is an
    // option, not a change of what happens to a writer who never opens the
    // settings.
    ok(
      "the find action still opens the editor's own panel under the default",
      /function startFind\([\s\S]{0,300}=== "source"\) return openSearchPanel\(view\)/.test(MAIN),
    );
    ok("...and the drawer under the other two", /function startFind\([\s\S]{0,400}openPanel\("find-drawer"\)/.test(MAIN));
  }

  {
    // A row does both, when both are known, and in that order.
    ok(
      "a hit puts the caret where it can be typed",
      /case "hit":[\s\S]{0,600}does\.at !== undefined\) goToOffset\(does\.at\)/.test(MAIN),
    );
    ok(
      "...and shows the page it printed on",
      /case "hit":[\s\S]{0,700}revealPrinted\(does\.page, does\.y\)/.test(MAIN),
    );
  }
}
