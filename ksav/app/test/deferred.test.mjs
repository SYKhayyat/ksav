import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";
import { check, ok, notOk } from "./harness.mjs";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");
import {
  scan,
  problems,
  nextName,
  jump,
  bodyOf,
  createBody,
  insertDeferred,
  inlineNoteAt,
  deferInlineNote,
  inlineDeferredNote,
  deferAllInlineNotes,
  inlineAllDeferredNotes,
  deferSnippet,
  resolveDeferred,
  sortBodies,
  printingAnchor,
} from "../.tmp-test/deferred.mjs";
import { NOTE_CHOICES, applyChoice, markersOf } from "../.tmp-test/notes.mjs";
import { toMarkdown } from "../.tmp-test/markdown.mjs";

// Deferred note bodies: the editing model behind #הערה_בשם / #גוף_הערה.
//
// The engine tests prove the page is identical whichever way the source is
// arranged. These prove the *source* transformations: that the pair can be
// found, jumped between, created from either end, and moved in and out without
// the writer losing a word.

export async function run() {

// ---------------------------------------------------------------- scanning

// 1. the plain pair
{
  const t = `ראש#הערה_בשם("א") סוף.\n#גוף_הערה("א")[הביאור]\n`;
  const s = scan(t);
  check("scan: one marker", s.refs.length, 1);
  check("scan: marker name", s.refs[0].name, "א");
  check("scan: no kind by default", s.refs[0].kind, null);
  check("scan: one body", s.defs.length, 1);
  check("scan: body name", s.defs[0].name, "א");
  check("scan: body text", t.slice(s.defs[0].bodyFrom, s.defs[0].bodyTo), "הביאור");
  check("scan: the name span is the name", t.slice(s.refs[0].nameFrom, s.refs[0].nameTo), `"א"`);
}

// 2. the layout argument, and everything else riding along
{
  const s = scan(`#הערה_בשם("א", סוג: מדף_בדרגה, 2)`);
  check("scan: kind", s.refs[0].kind, "מדף_בדרגה");
  check("scan: rest", s.refs[0].rest, "2");
}
{
  const s = scan(`#הערה_בשם("א", סוג: הערתסיום, זרם: "מקורות")`);
  check("scan: kind with a named extra", s.refs[0].kind, "הערתסיום");
  check("scan: named extra survives", s.refs[0].rest, `זרם: "מקורות"`);
}

// 3. the bracket form, which every other Ksav command accepts
{
  const t = `#הערה_בשם[א]\n#גוף_הערה[א][הביאור]`;
  const s = scan(t);
  check("scan: bracketed marker", s.refs[0].name, "א");
  check("scan: bracketed body name", s.defs[0].name, "א");
  check("scan: bracketed body text", t.slice(s.defs[0].bodyFrom, s.defs[0].bodyTo), "הביאור");
  check("scan: the two forms pair up", problems(t).length, 0);
}

// 4. English aliases
{
  const s = scan(`Start#note_named("a", kind: endnote) end.\n#note_body("a")[the gloss]`);
  check("scan: english marker", s.refs[0].name, "a");
  check("scan: english kind", s.refs[0].kind, "endnote");
  check("scan: english body", s.defs[0].name, "a");
}

// 5. named `שם:` rather than positional
{
  const s = scan(`#הערה_בשם(שם: "א", סוג: הערתסיום)`);
  check("scan: named שם", s.refs[0].name, "א");
  check("scan: named שם leaves kind alone", s.refs[0].kind, "הערתסיום");
}

// 6. commented-out markup is prose, not structure
{
  const s = scan(`// #הערה_בשם("א")\n#הערה_בשם("ב")\n/* #גוף_הערה("ג")[x] */\n`);
  check("scan: skips line comments", s.refs.length, 1);
  check("scan: the live one", s.refs[0].name, "ב");
  check("scan: skips block comments", s.defs.length, 0);
}

// 7. gershayim are Hebrew abbreviations, not string delimiters
{
  const t = `#גוף_הערה("א")[עיין רש"י שם ובשו"ע]\n#הערה_בשם("א")`;
  const s = scan(t);
  check("scan: gershayim don't swallow the document", s.defs.length, 1);
  check("scan: body intact", t.slice(s.defs[0].bodyFrom, s.defs[0].bodyTo), `עיין רש"י שם ובשו"ע`);
  check("scan: marker after gershayim still found", s.refs.length, 1);
}

// 8. a body with brackets inside it
{
  const t = `#גוף_הערה("א")[ראה #הדגשה[כאן] ובטבלה #טבלה(עמודות: 2, תא[א], תא[ב])]`;
  const s = scan(t);
  check("scan: nested groups", t.slice(s.defs[0].bodyFrom, s.defs[0].bodyTo).includes("תא[ב]"), true);
}

// 9. the bodies region
{
  const s = scan(`טקסט\n#גופי_הערות[\n#גוף_הערה("א")[x]\n]\n`);
  ok("scan: finds the region", s.region);
  check("scan: the body is inside the region", s.defs[0].from > s.region.innerFrom, true);
}

// 10. a half-typed definition is not a definition
{
  check("scan: no body group yet", scan(`#גוף_הערה("א")`).defs.length, 0);
  check("scan: unclosed body", scan(`#גוף_הערה("א")[חצי`).defs.length, 0);
}

// ---------------------------------------------------------------- the lint

// 11. the two silent failures deferring introduces
{
  const p = problems(`#הערה_בשם("חסר") #הערה_בשם("קיים")\n#גוף_הערה("קיים")[x]\n#גוף_הערה("יתום")[y]`);
  check("lint: two problems", p.length, 2);
  check("lint: dangling first", p[0].kind, "dangling");
  check("lint: dangling name", p[0].name, "חסר");
  check("lint: orphan", p[1].kind, "orphan");
  check("lint: orphan name", p[1].name, "יתום");
}

// 12. a duplicate body is reported, and is not also called an orphan
{
  const p = problems(`#הערה_בשם("א")\n#גוף_הערה("א")[first]\n#גוף_הערה("א")[second]`);
  check("lint: one problem", p.length, 1);
  check("lint: duplicate", p[0].kind, "duplicate");
}

// 13. a healthy document is quiet
{
  check("lint: nothing to say", problems(`#הערה_בשם("א")\n#גוף_הערה("א")[x]`).length, 0);
  check("lint: no notes at all", problems(`סתם טקסט`).length, 0);
}

// ---------------------------------------------------------------- naming

// 14. the writer never types a name
{
  check("name: first", nextName(`סתם טקסט`), "1");
  check("name: skips used", nextName(`#הערה_בשם("1") #גוף_הערה("2")[x]`), "3");
  check("name: fills a gap", nextName(`#הערה_בשם("1") #הערה_בשם("3")`), "2");
  check("name: ignores non-numeric names", nextName(`#הערה_בשם("רש״י")`), "1");
}

// ---------------------------------------------------------------- jumping

// 15. one key, both directions
{
  const t = `ראש#הערה_בשם("א") סוף.\n#גוף_הערה("א")[הביאור]\n`;
  const onRef = jump(t, t.indexOf(`#הערה_בשם`) + 3);
  check("jump: marker → body", onRef.kind, "toBody");
  check("jump: lands in the body", t.slice(onRef.pos, onRef.pos + 5), "הביאו");

  const back = jump(t, t.indexOf(`#גוף_הערה`) + 3);
  check("jump: body → marker", back.kind, "toMarker");
  check("jump: lands on the marker", back.pos, t.indexOf(`#הערה_בשם`));

  check("jump: nothing under the caret", jump(t, 0), null);
}

// 16. the create half — the key does not report an error, it writes the line
{
  const t = `ראש#הערה_בשם("א") סוף.`;
  const j = jump(t, t.indexOf("בשם"));
  check("jump: body missing", j.kind, "bodyMissing");
  check("jump: knows the name", j.name, "א");
}
{
  const t = `#גוף_הערה("א")[הביאור]`;
  const j = jump(t, 3);
  check("jump: marker missing", j.kind, "markerMissing");
}

// 17. innermost wins — a marker inside a body jumps to its own body
{
  const t = `#גוף_הערה("א")[הפירוש#הערה_בשם("ב")]\n#גוף_הערה("ב")[על הפירוש]`;
  const j = jump(t, t.indexOf(`#הערה_בשם`) + 3);
  check("jump: innermost", j.kind, "toBody");
  check("jump: to the inner body", t.slice(j.pos, j.pos + 4), "על ה");
}

// 18. reading a body without moving — for the hover preview
{
  const t = `#הערה_בשם("א")\n#גוף_הערה("א")[הביאור]`;
  check("bodyOf", bodyOf(t, "א"), "הביאור");
  check("bodyOf: missing", bodyOf(t, "ב"), null);
}

// ---------------------------------------------------------------- creating

// 19. filing a body when the document has none
{
  const t = `ראש#הערה_בשם("א") סוף.`;
  const c = createBody(t, "א");
  ok("create: the body exists now", c.text.includes(`#גוף_הערה("א")[]`));
  check("create: caret is inside the brackets", c.text[c.caret - 1], "[");
  check("create: caret is before the closer", c.text[c.caret], "]");
  check("create: the document is now consistent", problems(c.text).length, 0);
}

// 20. filing next to the bodies that are already there
{
  const t = `#הערה_בשם("א")#הערה_בשם("ב")\n\n#גוף_הערה("א")[first]\n`;
  const c = createBody(t, "ב");
  const s = scan(c.text);
  check("create: two bodies", s.defs.length, 2);
  check("create: appended after the last", s.defs[1].name, "ב");
  check("create: consistent", problems(c.text).length, 0);
}

// 21. filing into the region, when the writer made one
{
  const t = `#הערה_בשם("א")\n#גופי_הערות[\n]\n`;
  const c = createBody(t, "א");
  const s = scan(c.text);
  check("create: inside the region", s.defs[0].from > s.region.innerFrom, true);
  check("create: still inside", s.defs[0].to < s.region.innerTo, true);
}

// 22. a fresh deferred note from nothing
{
  const t = `ראש סוף.`;
  const c = insertDeferred(t, 3);
  const s = scan(c.text);
  check("insert: a marker", s.refs.length, 1);
  check("insert: and its body", s.defs.length, 1);
  check("insert: matched", s.refs[0].name, s.defs[0].name);
  check("insert: marker at the caret", c.text.slice(0, 3), "ראש");
  check("insert: caret in the body", c.text[c.caret], "]");
  check("insert: consistent", problems(c.text).length, 0);
}
{
  // …in whatever layout the chooser picked
  const c = insertDeferred(`ראש`, 3, "הערתסיום");
  ok("insert: carries the layout", c.text.includes(`סוג: הערתסיום`));
}

// ---------------------------------------------------------------- exile

// 23. finding the note under the caret
{
  const t = `ראש#הערה[הביאור] סוף.`;
  const n = inlineNoteAt(t, t.indexOf("הביאור") + 2);
  check("at: command", n.cmd, "הערה");
  check("at: body", t.slice(n.bodyFrom, n.bodyTo), "הביאור");
  notOk("at: outside any note", inlineNoteAt(t, 1));
}
{
  // innermost: the caret is in the inner note, so that is the one meant
  const t = `#הערה[חיצונית #הערה[פנימית] עוד]`;
  const n = inlineNoteAt(t, t.indexOf("פנימית") + 1);
  check("at: innermost body", t.slice(n.bodyFrom, n.bodyTo), "פנימית");
}

// 24. sending the prose to the end
{
  const t = `ראש#הערה[הביאור] סוף.\n`;
  const c = deferInlineNote(t, t.indexOf("הביאור") + 1);
  ok("defer: marker left behind", c.text.includes(`#הערה_בשם("1")`));
  ok("defer: prose at the end", c.text.includes(`#גוף_הערה("1")[הביאור]`));
  notOk("defer: the inline body is gone from the sentence", /ראש#הערה\[/.test(c.text));
  check("defer: consistent", problems(c.text).length, 0);
  check("defer: caret stays in the sentence", c.text.slice(c.caret, c.caret + 5), " סוף.");
}

// 25. the layout and its arguments are preserved exactly
{
  const t = `ראש#מדף_בדרגה(2)[הביאור] סוף.`;
  const c = deferInlineNote(t, t.indexOf("הביאור"));
  ok("defer: keeps the layout", c.text.includes(`סוג: מדף_בדרגה`));
  ok("defer: keeps its argument", c.text.includes(`, 2)`));
}
{
  const t = `ראש#הערתסיום(זרם: "מקורות")[הביאור] סוף.`;
  const c = deferInlineNote(t, t.indexOf("הביאור"));
  ok("defer: keeps a named argument", c.text.includes(`זרם: "מקורות"`));
  ok("defer: and the layout", c.text.includes(`סוג: הערתסיום`));
}

// 26. a command that is not a note is left alone
{
  notOk("defer: declines non-notes", deferInlineNote(`#הדגשה[טקסט]`, 4));
}

// ---------------------------------------------------------------- recall

// 27. bringing it back
{
  const t = `ראש#הערה_בשם("1") סוף.\n\n#גוף_הערה("1")[הביאור]\n`;
  const c = inlineDeferredNote(t, t.indexOf("בשם"));
  ok("recall: inline again", c.text.includes(`#הערה[הביאור]`));
  notOk("recall: the body is gone", c.text.includes(`#גוף_הערה`));
  check("recall: consistent", problems(c.text).length, 0);
}

// 28. the round trip gives the document back
{
  for (const t of [
    `ראש#הערה[הביאור] סוף.\n`,
    `ראש#מדור_בדרגה(2)[הביאור] סוף.\n`,
    `ראש#הערתסיום(זרם: "מקורות")[הביאור] סוף.\n`,
    `ראש#הערה[עיין רש"י שם] סוף.\n`,
  ]) {
    const out = deferInlineNote(t, t.indexOf("הביאור") >= 0 ? t.indexOf("הביאור") : t.indexOf("רש"));
    const back = inlineDeferredNote(out.text, out.text.indexOf("בשם"));
    check(`round trip: ${t.trim().slice(0, 24)}`, back.text, t);
  }
}

// 29. recall declines rather than silently duplicating
{
  const t = `א#הערה_בשם("1") ב#הערה_בשם("1")\n#גוף_הערה("1")[הביאור]`;
  notOk("recall: two markers, one body — declines", inlineDeferredNote(t, t.indexOf("בשם")));
}
{
  notOk("recall: nothing to bring back", inlineDeferredNote(`#הערה_בשם("1")`, 5));
}

// ---------------------------------------------------------------- the bulk move

// 30. every note at once — the migration path for a document that exists
{
  const t = `א#הערה[ראשונה] ב#הערה[שנייה] ג#מדור_א[שלישית] ד.\n`;
  const { text, moved } = deferAllInlineNotes(t);
  check("all: moved three", moved, 3);
  check("all: consistent", problems(text).length, 0);
  const s = scan(text);
  check("all: three markers", s.refs.length, 3);
  check("all: three bodies", s.defs.length, 3);
  check("all: distinct names", new Set(s.defs.map((d) => d.name)).size, 3);
  check("all: layout preserved", s.refs[2].kind, "מדור_א");
  ok("all: prose intact", text.includes("ראשונה") && text.includes("שנייה") && text.includes("שלישית"));
  notOk("all: no inline note left in the sentence", /[א-ת]#הערה\[/.test(text));
}

// 31. a note inside a note travels with its parent, it is not hoisted separately
{
  const t = `א#הערה[חיצונית #הערה[פנימית]] ב.\n`;
  const { text, moved } = deferAllInlineNotes(t);
  check("all: one top-level note moved", moved, 1);
  ok("all: the nested note rode along", text.includes(`#הערה[פנימית]`));
  check("all: consistent", problems(text).length, 0);
}

// 32. names do not collide with what is already deferred
{
  const t = `א#הערה[חדשה] ב#הערה_בשם("1")\n#גוף_הערה("1")[קיימת]\n`;
  const { text } = deferAllInlineNotes(t);
  const s = scan(text);
  check("all: no name reused", new Set(s.defs.map((d) => d.name)).size, s.defs.length);
  check("all: consistent", problems(text).length, 0);
}

// 33. nothing to do is not an edit
{
  const t = `סתם טקסט בלי הערות.\n`;
  const r = deferAllInlineNotes(t);
  check("all: nothing moved", r.moved, 0);
  check("all: text untouched", r.text, t);
}

// 34. a commented-out note is prose and stays put
{
  const t = `// #הערה[מוסתרת]\nא#הערה[אמיתית] ב.\n`;
  const { text, moved } = deferAllInlineNotes(t);
  check("all: only the live note", moved, 1);
  ok("all: the comment is untouched", text.includes(`// #הערה[מוסתרת]`));
}

// ---------------------------------------------------------------- exporting

// 35. everything downstream that must SEE the body gets it put back
{
  const t = `ראש#הערה_בשם("1") סוף.\n\n#גוף_הערה("1")[הביאור]\n`;
  const r = resolveDeferred(t);
  check("resolve: inline again", r, `ראש#הערה[הביאור] סוף.\n`);
}
{
  const t = `ראש#הערה_בשם("1", סוג: הערתסיום, זרם: "מקורות") סוף.\n#גוף_הערה("1")[הביאור]\n`;
  ok("resolve: the layout comes back", resolveDeferred(t).includes(`#הערתסיום(זרם: "מקורות")[הביאור]`));
}
{
  // A body used twice is duplicated — which is what the page does, and what a
  // Word file has to contain.
  const t = `א#הערה_בשם("1") ב#הערה_בשם("1")\n#גוף_הערה("1")[חוזר]`;
  const r = resolveDeferred(t);
  check("resolve: both markers", (r.match(/חוזר/gu) ?? []).length, 2);
  notOk("resolve: no definitions left", r.includes("#גוף_הערה"));
}
{
  // Deferred inside deferred: expanded until nothing is left to expand.
  const t = `א#הערה_בשם("1") ב.\n#גוף_הערה("1")[חיצונית#הערה_בשם("2")]\n#גוף_הערה("2")[פנימית]\n`;
  const r = resolveDeferred(t);
  ok("resolve: nested expanded", r.includes(`#הערה[חיצונית#הערה[פנימית]]`));
  notOk("resolve: nothing deferred remains", r.includes("בשם") || r.includes("גוף_הערה"));
}
{
  // A marker with no body has nothing to say in a Word file.
  const r = resolveDeferred(`א#הערה_בשם("חסר") ב.`);
  notOk("resolve: dangling marker dropped", r.includes("הערה_בשם"));
  ok("resolve: the sentence survives", r.includes("א") && r.includes("ב."));
}
{
  // A body that refers to itself would expand forever; it stops instead.
  const r = resolveDeferred(`א#הערה_בשם("1")\n#גוף_הערה("1")[עצמי#הערה_בשם("1")]`);
  ok("resolve: a cycle terminates", typeof r === "string" && r.length < 4000);
}
{
  check("resolve: a document with no notes is untouched", resolveDeferred(`סתם טקסט.\n`), `סתם טקסט.\n`);
}

// 36. the Word/Markdown export therefore carries deferred notes as footnotes
{
  const inline = toMarkdown(`ראש#הערה[הביאור] סוף.\n`);
  const deferredDoc = toMarkdown(`ראש#הערה_בשם("1") סוף.\n\n#גוף_הערה("1")[הביאור]\n`);
  check("export: identical to the inline form", deferredDoc, inline);
  ok("export: it really is a footnote", inline.includes("[^1]"));
}

// ---------------------------------------------------------------- the chooser

// 35. the snippet rewrite, layout by layout
{
  check("snippet: plain footnote", deferSnippet(`#הערה[|]`, "1").marker, `#הערה_בשם("1")`);
  check("snippet: named layout", deferSnippet(`#מדף_א[|]`, "1").marker, `#הערה_בשם("1", סוג: מדף_א)`);
  check("snippet: with an argument", deferSnippet(`#מדור_בדרגה(2)[|]`, "1").marker, `#הערה_בשם("1", סוג: מדור_בדרגה, 2)`);
  check("snippet: the caret follows the prose", deferSnippet(`#הערה[|]`, "1").body, `#גוף_הערה("1")[|]`);
  notOk("snippet: declines a non-note", deferSnippet(`#הדגשה[|]`, "1"));
}

// 36. every one of the eleven layouts survives the chooser's deferred path
//
// The engine tests prove the *page* is identical either way. This proves the
// chooser cannot emit a source that is inconsistent — a marker with no body, or
// a layout silently downgraded to a plain footnote on the way through.
{
  for (const c of NOTE_CHOICES) {
    // Every marker the layout has, not the first two. A card with three streams
    // has a third command that is exactly as much a note as the first, and the
    // deferred path has to file a body for it too.
    markersOf(c).forEach((snippet, layer) => {
      const r = applyChoice("ראש סוף.\n", 3, c, layer, true);
      const s = scan(r.text);
      check(`chooser/${c.id}/${layer}: one marker`, s.refs.length, 1);
      check(`chooser/${c.id}/${layer}: one body`, s.defs.length, 1);
      check(`chooser/${c.id}/${layer}: consistent`, problems(r.text).length, 0);
      // The layout the writer picked is the layout that gets written.
      const cmd = /^#([A-Za-z0-9֐-׿_]+)/.exec(snippet)[1];
      check(
        `chooser/${c.id}/${layer}: layout kept`,
        s.refs[0].kind,
        cmd === "הערה" ? null : cmd,
      );
      // The caret lands in the body, which is what the writer is about to type.
      check(`chooser/${c.id}/${layer}: caret in the body`, r.text[r.caret], "]");
    });
  }
}

// 37. the layout's own scaffolding still gets written, and the body sits after it
{
  const c = NOTE_CHOICES.find((x) => x.id === "endnote");
  const r = applyChoice("ראש סוף.\n", 3, c, 0, true);
  ok("chooser: the dump call is still written", r.text.includes("#הערות_בסוף"));
  ok(
    "chooser: the body is filed after it",
    r.text.indexOf("#גוף_הערה") > r.text.indexOf("#הערות_בסוף"),
  );
}

// 38. inline remains the default, unchanged
{
  const c = NOTE_CHOICES.find((x) => x.id === "footnote");
  const r = applyChoice("ראש סוף.\n", 3, c, 0);
  ok("chooser: still inline by default", r.text.includes("#הערה[]"));
  notOk("chooser: no body filed", r.text.includes("#גוף_הערה"));
}

// ---------------------------------------------------------------- 39. order
//
// The list at the foot of the file must read in the order of the text.
//
// Bodies were filed by appending, so the order was the order the notes were
// *written*: add a note to the first paragraph of a finished chapter and its
// prose lands underneath the note from the last page. org-mode has the same
// defect and the same answer — a definition belongs where its reference does.

/** The names of the filed bodies, top to bottom. */
const filed = (text) => scan(text).defs.map((d) => d.name);

// A note added before every existing one is filed above them, not under them.
{
  const doc = 'סוף המשפט#הערה_בשם("1")\n\n#גוף_הערה("1")[אחרונה]\n';
  const at = doc.indexOf("סוף");
  const r = insertDeferred(doc, at);
  check("a note added earlier in the text is filed first", filed(r.text), ["2", "1"]);
}

// And one added after them still goes last.
{
  const doc = 'ראש#הערה_בשם("1") ואז סוף.\n\n#גוף_הערה("1")[ראשונה]\n';
  const r = insertDeferred(doc, doc.indexOf(" ואז סוף") + 8);
  check("a note added later in the text is filed last", filed(r.text), ["1", "2"]);
}

// Between two: the new body lands between their bodies.
{
  const doc =
    'א#הערה_בשם("1") ב ג#הערה_בשם("2")\n\n#גוף_הערה("1")[ראשונה]\n#גוף_הערה("2")[שלישית]\n';
  const r = insertDeferred(doc, doc.indexOf(" ב ") + 2);
  check("a note added between two is filed between them", filed(r.text), ["1", "3", "2"]);
}

// The repair for the documents that already exist.
{
  const scrambled =
    'א#הערה_בשם("7") ב#הערה_בשם("3") ג#הערה_בשם("5")\n\n' +
    '#גוף_הערה("5")[גימל]\n#גוף_הערה("7")[אלף]\n#גוף_הערה("3")[בית]\n';
  const s = sortBodies(scrambled);
  check("sorting puts the bodies in marker order", filed(s.text), ["1", "2", "3"]);
  ok("and the prose travels with its name", /#גוף_הערה\("1"\)\[אלף\]/.test(s.text));
  ok("the second is the second marker's", /#גוף_הערה\("2"\)\[בית\]/.test(s.text));
  ok("the markers are renumbered to match", /א#הערה_בשם\("1"\) ב#הערה_בשם\("2"\)/.test(s.text));
  check("and it says how many moved", s.moved > 0, true);
  check("running it again changes nothing", sortBodies(s.text).text, s.text);
}

// A name the writer chose is theirs. Renumbering `רש״י` to `2` would be the
// panel destroying the writer's own text to tidy something they never asked to
// be tidy, and it also has to not collide with the numbers around it.
{
  const mixed =
    'א#הערה_בשם("4") ב#הערה_בשם("רש״י") ג#הערה_בשם("2")\n\n' +
    '#גוף_הערה("2")[גימל]\n#גוף_הערה("רש״י")[בית]\n#גוף_הערה("4")[אלף]\n';
  const s = sortBodies(mixed);
  check("a writer's own name survives the sort", filed(s.text), ["1", "רש״י", "2"]);
  ok("and its body is still its own", /#גוף_הערה\("רש״י"\)\[בית\]/.test(s.text));
}

// A body whose marker was deleted has no place in reading order, so it keeps the
// end of the list rather than being dropped or shuffled to an arbitrary middle.
{
  const orphaned =
    'א#הערה_בשם("2")\n\n#גוף_הערה("9")[יתום]\n#גוף_הערה("2")[אלף]\n';
  const s = sortBodies(orphaned);
  check("an orphan body sorts last", filed(s.text), ["1", "9"]);
  ok("and is not renumbered onto a live name", s.text.includes('#גוף_הערה("9")[יתום]'));
}

// Nothing but the definitions moves: the whitespace, the blank lines and any
// prose between them are the writer's and stay put.
{
  const spaced =
    'א#הערה_בשם("2") ב#הערה_בשם("1")\n\n' +
    '// ההערות:\n\n#גוף_הערה("1")[שנייה]\n\n#גוף_הערה("2")[ראשונה]\n';
  const s = sortBodies(spaced);
  ok("the comment between them stays where it was", s.text.includes("// ההערות:\n\n#גוף_הערה"));
  ok("the blank line between the bodies survives", /\]\n\n#גוף_הערה/.test(s.text));
}

// ------------------------------------------------- and back again, in bulk
//
// Where the note bodies live has to be changeable *after the notes already
// exist*, and it was changeable in one direction only: a document could be swept
// to the org-mode arrangement with one press and could not be swept back. A
// switch that goes one way is not a switch, and a writer who tried it on a
// finished sefer had three hundred notes to move by hand.

{
  const inline = "בראשית#הערה[עיין שם] ברא#הערה[ועיין עוד] אלקים.\n";
  const away = deferAllInlineNotes(inline);
  check("every note went to the end", away.moved, 2);
  const back = inlineAllDeferredNotes(away.text);
  check("and every one came back", back.moved, 2);
  check("the document is the one we started with", back.text.trim(), inline.trim());
}

{
  // Round-tripping must not lose what the marker said about *where* the note
  // prints — that is the whole of `סוג`, and dropping it turns an endnote into
  // a footnote on the way home.
  const t = 'א#הערה_בשם("1", סוג: הערתסיום)\n\n#גוף_הערה("1")[בסוף]\n';
  const r = inlineAllDeferredNotes(t);
  check("a marker with a layout comes back as that layout", r.moved, 1);
  ok("…and it is the endnote it was", r.text.includes("#הערתסיום[בסוף]"));
}

{
  // Two markers for one name would have to duplicate the prose, and silently
  // doubling a note is worse than declining to move it.
  const shared = 'א#הערה_בשם("1") ב#הערה_בשם("1")\n\n#גוף_הערה("1")[אחת]\n';
  const r = inlineAllDeferredNotes(shared);
  check("a name with two markers is left alone", r.moved, 0);
  check("and the document is untouched", r.text, shared);
}

{
  // A marker whose prose has not been written is a note the writer has not
  // finished, not a note to delete.
  const half = 'א#הערה_בשם("1") ב#הערה_בשם("2")\n\n#גוף_הערה("2")[שנייה]\n';
  const r = inlineAllDeferredNotes(half);
  check("the finished one moves", r.moved, 1);
  ok("the dangling marker stays a marker", r.text.includes('#הערה_בשם("1")'));
  ok("…and the finished one is inline", r.text.includes("#הערה[שנייה]"));
}

{
  // A partly-deferred document is legal — that is what the per-note override
  // is — so a bulk move in either direction leaves the other half alone.
  const mixed = 'א#הערה[קרובה] ב#הערה_בשם("1")\n\n#גוף_הערה("1")[רחוקה]\n';
  const r = inlineAllDeferredNotes(mixed);
  check("only the deferred half moves", r.moved, 1);
  ok("the inline note is where it was", r.text.includes("#הערה[קרובה]"));
}

{
  check(
    "nothing to recall says so by moving nothing",
    inlineAllDeferredNotes("טקסט בלי הערות כלל.\n").moved,
    0,
  );
}

{
  // An English document comes back in English, which is the rule every rewrite
  // in this module follows.
  const en = 'a#note_named("1")\n\n#note_body("1")[see Rashi]\n';
  const r = inlineAllDeferredNotes(en);
  ok("an English pair inlines to an English command", r.text.includes("#fnote[see Rashi]"));
}


// ---------------------------------------------------------------- printing anchor
//
// The preview half of the marker/body link. `jump` walks the pair inside the
// source; this is what lets the *page* answer, by handing the compiler a
// position that actually prints. Clicking a footnote marker is the most obvious
// thing in a document to click and it used to do nothing, because every
// character of `#הערה_בשם("א")` is syntax and the reveal came back empty.

{
  const t = 'ראש#הערה_בשם("א") סוף.\n#גוף_הערה("א")[הביאור]\n';
  const marker = t.indexOf("#הערה_בשם") + 3;
  const bodyFrom = t.indexOf("הביאור");
  check("a marker answers with its body's prose", printingAnchor(t, marker), bodyFrom);
  check(
    "a body's head answers with its own prose",
    printingAnchor(t, t.indexOf("#גוף_הערה") + 2),
    bodyFrom,
  );
  // Inside the prose the caret needs no help, and the engine's own answer about
  // real text beats anything invented here.
  check("inside the prose it says nothing", printingAnchor(t, bodyFrom + 2), null);
  check("ordinary prose says nothing", printingAnchor(t, 1), null);
}

{
  // A marker with no body yet is the state a note is in for the seconds between
  // writing the marker and writing the prose. Nothing printed, so nothing to
  // show — and the caller says so rather than pointing at a stranger's note.
  const t = 'א#הערה_בשם("א") ב#הערה_בשם("ב")\n#גוף_הערה("ב")[שנייה]\n';
  check("a marker with no body says nothing", printingAnchor(t, t.indexOf('("א")') + 2), null);
  check(
    "and its neighbour still answers",
    printingAnchor(t, t.indexOf('("ב")') + 2),
    t.indexOf("שנייה"),
  );
}

{
  const t = '#הערה_בשם("א")\n#גוף_הערה("א")[]\n';
  check("an empty body prints nothing, so it answers nothing", printingAnchor(t, 3), null);
}

{
  // Innermost wins, the same rule `jump` follows: a marker written inside
  // another note's body belongs to its own note, not to the one it sits in.
  const t = '#גוף_הערה("א")[ביאור#הערה_בשם("ב")]\n#גוף_הערה("ב")[פנימי]\n';
  const inner = t.indexOf('#הערה_בשם("ב")') + 3;
  check("a nested marker answers with its own body", printingAnchor(t, inner), t.indexOf("פנימי"));
}

{
  // Every rewrite in this module keeps the document's language; this reads
  // rather than writes, so the only thing to prove is that it reads both.
  const t = 'a#note_named("1")\n#note_body("1")[see Rashi]\n';
  check("an English pair answers too", printingAnchor(t, 3), t.indexOf("see Rashi"));
}

{
  // The seam, read from source. What broke here was never the arithmetic — the
  // reveal was correct about every position it was given — it was *which
  // position it was given*, so the test that matters is that `revealCursor`
  // still asks.
  const main = readFileSync(path.join(SRC, "main.ts"), "utf8");
  const at = main.indexOf("async function revealCursor(");
  ok("revealCursor is still a function in main.ts", at >= 0);
  const body = main.slice(at, main.indexOf("\n}", at));
  ok("revealCursor remaps a deferred caret before asking", body.includes("printingAnchor("));
  ok("…and falls back to the caret itself", /printingAnchor\([\s\S]*?\?\?/.test(body));
}

}
