import { check, ok, notOk } from "./harness.mjs";
import {
  headings,
  headingAt,
  sectionAt,
  sectionEnd,
  setLevel,
  promote,
  demote,
  moveSection,
  deleteSection,
  addContents,
  canAddContents,
  contentsCall,
  contentsDepth,
  setContentsDepth,
  inContents,
  toggleInContents,
  makeHeading,
  MAX_LEVEL,
} from "../.tmp-test/headings.mjs";

// Nine levels, and the operations an outliner is expected to have. The toolbar
// showed three; the engine always accepted nine.

const D = `#כותרת1[ראשון]

גוף א.

#כותרת2[תת ראשון]

גוף ב.

#כותרת1[שני]

גוף ג.
`;

export async function run() {

// ---------------------------------------------------------------- reading

{
  const hs = headings(D);
  check("all three headings are found", hs.length, 3);
  check("levels are read", hs.map((h) => h.level).join(","), "1,2,1");
  check("titles are located", D.slice(hs[1].bodyFrom, hs[1].bodyTo), "תת ראשון");
}

{
  const deep = `#כותרת(רמה: 8)[עמוק]\n`;
  const hs = headings(deep);
  check("the generic form carries its level", hs[0].level, 8);
  const en = `#hlevel(level: 7)[deep]\n`;
  check("in English too", headings(en)[0].level, 7);
  check("and the language is read off the source", headings(en)[0].lang, "en");
}

{
  check("on a heading", headingAt(D, D.indexOf("ראשון")).level, 1);
  notOk("in the body, no heading under the caret", headingAt(D, D.indexOf("גוף א")));
  check("but the body belongs to a section", sectionAt(D, D.indexOf("גוף א")).level, 1);
  check("and a nested body to the nearest one", sectionAt(D, D.indexOf("גוף ב")).level, 2);
}

{
  // A section runs to the next heading at the same or a higher level, so a
  // subsection is part of its parent rather than a sibling of it.
  const hs = headings(D);
  const end = sectionEnd(D, hs[0]);
  check("section 1 ends at the next level-1 heading", end, hs[2].from);
  ok("so it contains its subsection", D.slice(hs[0].from, end).includes("תת ראשון"));
}

// ---------------------------------------------------------------- level changes

{
  const h = headingAt(D, D.indexOf("ראשון"));
  const r = setLevel(D, h, 3);
  check("a level change rewrites the command", headings(r.text)[0].level, 3);
  ok("using the named form up to six", r.text.startsWith("#כותרת3["));
  ok("the title survives", r.text.includes("[ראשון]"));
  check("the caret lands in the title", r.text[r.caret], "ר");
}

{
  const h = headingAt(D, D.indexOf("ראשון"));
  const r = setLevel(D, h, 8);
  ok("past six it uses the generic form", r.text.startsWith("#כותרת(רמה: 8)["));
  check("and reads back at that level", headings(r.text)[0].level, 8);
}

{
  const en = `#h2[Title]\n`;
  const h = headingAt(en, 3);
  ok("an English heading stays English", setLevel(en, h, 4).text.startsWith("#h4["));
  ok("including past six", setLevel(en, h, 7).text.startsWith("#hlevel(level: 7)["));
}

{
  const h = headingAt(D, D.indexOf("תת ראשון"));
  check("promote raises it", headings(promote(D, h).text)[1].level, 1);
  check("demote lowers it", headings(demote(D, h).text)[1].level, 3);
  notOk("level 1 cannot promote", promote(D, headingAt(D, D.indexOf("ראשון"))));
  const deep = `#כותרת(רמה: ${MAX_LEVEL})[עמוק]\n`;
  notOk("the deepest level cannot demote", demote(deep, headingAt(deep, 5)));
  check("setting the level it already has does nothing", setLevel(D, h, 2), null);
}

// ---------------------------------------------------------------- moving

{
  const hs = headings(D);
  const r = moveSection(D, hs[0], 1);
  ok("the second section is now first", r.text.indexOf("שני") < r.text.indexOf("ראשון"));
  ok("and the subsection travelled with its parent",
     r.text.indexOf("ראשון") < r.text.indexOf("תת ראשון"));
  check("nothing was lost", headings(r.text).length, 3);
  for (const w of ["גוף א", "גוף ב", "גוף ג"]) ok(`${w} survived the move`, r.text.includes(w));
}

{
  const hs = headings(D);
  const back = moveSection(D, hs[0], 1);
  const again = moveSection(back.text, headings(back.text)[1], -1);
  check("moving back restores the document exactly", again.text, D);
}

{
  const hs = headings(D);
  notOk("the first section cannot move up", moveSection(D, hs[0], -1));
  notOk("the last cannot move down", moveSection(D, hs[2], 1));
  // A subsection has no sibling at its own level to swap with.
  notOk("a lone subsection cannot move", moveSection(D, hs[1], 1));
}

// ---------------------------------------------------------------- delete

{
  const hs = headings(D);
  const r = deleteSection(D, hs[0]);
  check("the section and its subsection are gone", headings(r.text).length, 1);
  notOk("its body went with it", r.text.includes("גוף ב"));
  ok("the next section is untouched", r.text.includes("גוף ג"));
  notOk("no blank-line pile-up", /\n{3,}/.test(r.text));
}

// ---------------------------------------------------------------- make a heading

{
  const body = `שורה רגילה כאן.
`;
  const r = makeHeading(body, 3, 2);
  check("a plain line becomes a heading", headings(r.text).length, 1);
  check("at the level asked for", headings(r.text)[0].level, 2);
  ok("keeping its text", r.text.includes("[שורה רגילה כאן.]"));
  check("the caret ends at the end of the title", r.text[r.caret], "]");
}

{
  // On an existing heading it changes the level rather than nesting one inside
  // another — the same button, the meaning a writer expects in each place.
  const r = makeHeading(D, D.indexOf("ראשון"), 4);
  check("still one heading there", headings(r.text).length, 3);
  check("at the new level", headings(r.text)[0].level, 4);
}

{
  // In body text it must NOT reach up and restyle the section above.
  const r = makeHeading(D, D.indexOf("גוף ב"), 5);
  check("the existing headings keep their levels", headings(r.text).map((h) => h.level).join(","), "1,2,5,1");
  ok("and the body line became the new one", r.text.includes("[גוף ב.]"));
}

{
  const other = `#רשימה(פריט[א],)
`;
  notOk("a line that is already a command is left alone", makeHeading(other, 2, 2));
  const eng = `Just a line.
`;
  ok("an English line gets an English heading", makeHeading(eng, 3, 2).text.startsWith("#h2["));
  ok("past six, the generic English form", makeHeading(eng, 3, 8).text.startsWith("#hlevel(level: 8)["));
}

// ---------------------------------------------------------------- contents

{
  const r = addContents(D);
  ok("a table of contents is written at the top", r.text.startsWith("#תוכן()"));
  ok("the document follows it", r.text.includes("#כותרת1[ראשון]"));
  notOk("and it is only ever written once", addContents(r.text));
  ok("English documents get the English call", addContents("#h1[T]\n", "en").text.startsWith("#toc()"));
}

// ---------------------------------------------------------------- what enters it
//
// > *"Choose exactly what enters the table of contents, including excluding
// > individual headings."*
//
// Neither half was expressible. `#תוכן` took a title and a numbering scheme and
// nothing about *which headings*; a heading could be kept out only by knowing
// that Typst calls it `outlined` and that the prelude passes strays through.

{
  // How deep — a property of the contents, so it lives on the call.
  check("a contents with no depth is every level", contentsDepth("#תוכן()\n\nגוף\n"), null);
  check("a depth is read", contentsDepth("#תוכן(עומק: 2)\n"), 2);
  check("in English too", contentsDepth("#toc(depth: 3)\n"), 3);
  check("a document with no contents has no depth", contentsDepth("גוף\n"), null);
  check("nor a contents call", contentsCall("גוף\n"), null);
}

{
  const made = addContents(D, "he", 2);
  ok("a contents can be made at a depth", made.text.startsWith("#תוכן(עומק: 2)"));
  check("and reads back as that depth", contentsDepth(made.text), 2);
  ok("English gets the English argument", addContents("#h1[T]\n", "en", 2).text.startsWith("#toc(depth: 2)"));
}

{
  const doc = "#תוכן()\n\n#כותרת1[א]\n";
  const deep = setContentsDepth(doc, 3);
  ok("the depth of an existing contents is set in place", deep.text.startsWith("#תוכן(עומק: 3)"));
  ok("and the rest of the document is untouched", deep.text.includes("#כותרת1[א]"));
  check("changing it again replaces rather than repeats", contentsDepth(setContentsDepth(deep.text, 1).text), 1);
  ok(
    "…and leaves one argument, not two",
    (setContentsDepth(deep.text, 1).text.match(/עומק/g) || []).length === 1,
  );
  // Back to "all" is the call the writer started with, not `עומק: none`: a
  // sentinel would be a third state of a two-state question, visible in their
  // source forever.
  check("clearing it gives back the plain call", setContentsDepth(deep.text, null).text.split("\n")[0], "#תוכן()");
  check("nothing to set when there is no contents", setContentsDepth("גוף\n", 2), null);
}

{
  // Another argument on the call survives a depth change, which is the whole
  // reason this is a rewrite of the argument list rather than of the call.
  const titled = '#תוכן(כותרת: [פתח דבר])\n';
  const r = setContentsDepth(titled, 2);
  ok("the title is kept", r.text.includes("כותרת: [פתח דבר]"));
  ok("and the depth is added", r.text.includes("עומק: 2"));
  check("and taking the depth off again leaves the title", setContentsDepth(r.text, null).text.trim(), '#תוכן(כותרת: [פתח דבר])');
}

{
  // Not this one — a property of a heading, so the writer marks it where the
  // heading is.
  const doc = "#כותרת1[שער]\n\n#כותרת1[פרק א]\n";
  const h = headings(doc)[0];
  ok("a plain heading is in the contents", inContents(doc, h));
  const out = toggleInContents(doc, h);
  ok("taking it out writes the Hebrew argument", out.text.startsWith("#כותרת1(בתוכן: false)[שער]"));
  check("and it reads back as out", inContents(out.text, headings(out.text)[0]), false);
  ok("its neighbour is untouched", inContents(out.text, headings(out.text)[1]));
  // A heading that is out of the contents is still a heading: same level, same
  // title, still in the outline. Only one line of the contents is missing.
  check("it is still a heading at the same level", headings(out.text)[0].level, 1);
  check("with the same title", out.text.includes("[שער]"), true);
}

{
  const doc = "#כותרת1(בתוכן: false)[שער]\n";
  const back = toggleInContents(doc, headings(doc)[0]);
  check("putting it back leaves no empty argument list", back.text.trim(), "#כותרת1[שער]");
  ok("and it is in the contents again", inContents(back.text, headings(back.text)[0]));
}

{
  // The argument joins whatever the heading already carries, and leaves when it
  // is taken off — the same "no empty `()`" rule, one level down.
  const doc = '#כותרת1(צבע: red)[פרק]\n';
  const out = toggleInContents(doc, headings(doc)[0]);
  ok("an existing argument is kept", out.text.includes("צבע: red"));
  ok("and the new one joins it", out.text.includes("בתוכן: false"));
  const back = toggleInContents(out.text, headings(out.text)[0]);
  check("removing it leaves the other behind", back.text.trim(), "#כותרת1(צבע: red)[פרק]");
}

{
  // An English document gets Typst's own name, which has always worked and had
  // no Hebrew spelling — which is the whole finding.
  const doc = "#h1[Title page]\n";
  const out = toggleInContents(doc, headings(doc)[0]);
  ok("English uses `outlined`", out.text.startsWith("#h1(outlined: false)"));
  check("and reads back as out", inContents(out.text, headings(out.text)[0]), false);
  check("and back in again", toggleInContents(out.text, headings(out.text)[0]).text.trim(), "#h1[Title page]");
}

{
  // Round trip over every heading in a real document: out and back in leaves the
  // text exactly as it was. The single cases above would pass on an
  // implementation that leaves a stray comma behind.
  const drift = headings(D)
    .map((_, i) => {
      const h = headings(D)[i];
      const out = toggleInContents(D, h);
      const back = toggleInContents(out.text, headings(out.text)[i]);
      return back.text === D ? null : `${i}: ${back.text}`;
    })
    .filter(Boolean);
  check("out and back in changes nothing", drift, []);
}

{
  // The depth control's two states, which is what the Insert row switches on.
  ok("a document with no contents can be given one", canAddContents(D));
  notOk("and one that has one cannot", canAddContents(addContents(D).text));
}

}
