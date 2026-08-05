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

}
