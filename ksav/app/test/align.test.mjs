import { check, ok } from "./harness.mjs";
import { plan } from "../.tmp-test/insert.mjs";
import {
  ALIGN_EDGES,
  COMMAND_OF_EDGE,
  alignCommand,
  alignPlan,
  edgeAt,
  edgeOf,
  paragraphIn,
  paragraphsIn,
  wrapperIn,
} from "../.tmp-test/alignment.mjs";
import { ALIGN_ORDER } from "../.tmp-test/settings.mjs";
import { paragraphAt } from "../.tmp-test/focus.mjs";
import { EditorState } from "@codemirror/state";

// The three alignment buttons, which were `insertSnippet` in a row with **B**,
// **I** and **U** (#175).
//
// Five rows were measured in a running app: every one of them produced an
// **empty** `#מרכז[]` spliced into the middle of a word, and four of the five
// also threw away the alignment the paragraph already had. The table below is
// those five rows, plus the English spellings of the same three commands, plus
// the selection and multi-paragraph cases the fix created.
//
// The fence at the end is the general one: **no press of an alignment button may
// ever produce an empty call**, in any of the six spellings, on any of the
// documents the writing side reported. That is the class, and the five rows are
// its instances.

const EMPTY_ALIGN = /#(?:מרכז|ימין|שמאל|center_|right_|left_)\[\]/u;

/** What a press of `name` at `[from, from)` — or over a selection — does. */
function press(doc, from, to, name) {
  const p = plan(doc, from, to, doc.slice(from, to), `#${name}[|]`, "he");
  return p.kind === "rewrite" ? p.text : `<${p.kind}>`;
}

export async function run() {
  // ------------------------------------------------- the five rows measured live

  {
    const doc = "#ימין[שלום]";
    check("caret at the line start retargets in place", press(doc, 0, 0, "מרכז"), "#מרכז[שלום]");
    check("caret inside the word retargets in place", press(doc, 8, 8, "מרכז"), "#מרכז[שלום]");
    check("caret at the line end retargets in place", press(doc, doc.length, doc.length, "מרכז"), "#מרכז[שלום]");
  }
  {
    // The row that was `של#מרכז[]ום עולם`: a caret mid-word in ordinary prose.
    const doc = "שלום עולם";
    check("a mid-word caret aligns the whole paragraph", press(doc, 3, 3, "מרכז"), "#מרכז[שלום עולם]");
  }
  {
    // Already centred, and the press takes it off rather than adding a second
    // call. Word's toggle, and the reason the old behaviour lost alignment.
    const doc = "#מרכז[שלום]";
    check("pressing the edge a paragraph is on unwraps it", press(doc, 6, 6, "מרכז"), "שלום");
    check("…and the other edge retargets", press(doc, 6, 6, "שמאל"), "#שמאל[שלום]");
  }

  // ------------------------------------------------------------ other shapes

  {
    // An indented wrapper keeps its indentation: the call is the paragraph, and
    // the leading spaces are not part of it.
    const doc = "  #ימין[שלום]";
    check("indentation stays outside the rewrite", press(doc, 5, 5, "מרכז"), "  #מרכז[שלום]");
  }
  {
    // A call that is *inside* a paragraph rather than being one: the paragraph
    // is what gets centred, and the fragment keeps its own alignment.
    const doc = "#ימין[שלום] ועוד";
    check("a fragment does not become the paragraph", press(doc, doc.length, doc.length, "מרכז"), "#מרכז[#ימין[שלום] ועוד]");
  }
  {
    // Two paragraphs, and each is aligned on its own — Word's answer, and the
    // one that keeps every paragraph independently toggleable afterwards.
    const doc = "ראשון\n\nשני";
    const out = press(doc, 1, doc.length - 1, "מרכז");
    check("a selection across two paragraphs wraps each", out, "#מרכז[ראשון]\n\n#מרכז[שני]");
  }
  {
    // A selection inside one paragraph aligns the paragraph, not the four
    // characters — the caret is in a word, and so is the selection.
    const doc = "שלום עולם";
    check("a selection aligns its whole paragraph", press(doc, 0, 4, "ימין"), "#ימין[שלום עולם]");
  }
  {
    // A blank line between paragraphs is not a paragraph. Pressing it does
    // nothing rather than producing `#מרכז[]` — the empty call this whole
    // module exists to make impossible.
    const doc = "ראשון\n\nשני";
    const at = 6;
    check("a caret on the blank line changes nothing", alignPlan(doc, at, at, "center", "he"), null);
  }
  {
    // Multi-line wrapper, which is how the registry writes a heading.
    const doc = "#מרכז[\n  שלום\n]";
    check("a multi-line wrapper retargets", press(doc, 10, 10, "ימין"), "#ימין[\n  שלום\n]");
  }
  {
    // Code mode is not this module's question: a paragraph is not a thing
    // there, and the caller's own splice is the right answer.
    const doc = "#בלוק[\n  #align(center)[שלום]\n]";
    check("inside code this module declines", alignPlan(doc, 20, 20, "center", "he"), null);
  }

  // ------------------------------------------------------------ both spellings

  {
    check("Hebrew names map to edges", edgeOf("מרכז"), "center");
    check("…and the English ones do too", edgeOf("center_"), "center");
    check("…and something that is not an alignment is null", edgeOf("הדגשה"), null);
    for (const edge of ALIGN_EDGES) {
      const he = COMMAND_OF_EDGE[edge];
      ok(`#${edge} has a Hebrew command`, typeof he === "string" && he.length > 0);
      check(`#${edge} is spelt the same either way through the registry`, alignCommand(edge, "en"), `${edge}_`);
      check(`#${edge} answers in Hebrew`, alignCommand(edge, "he"), he);
    }
    // The ribbon's own order and this module's edges are the same three. They
    // are two lists in two files, and this is what stops them disagreeing.
    check("the edge list and the ribbon order are the same three", [...ALIGN_ORDER].join(","), [...ALIGN_EDGES].join(","));
  }
  {
    // The English document: the buttons write `#center_`, not `#מרכז`, and the
    // wrapper they retarget is the English one.
    const doc = "B\"H";
    const p = plan(doc, 0, 0, "", "#center_[|]", "en");
    check("an English document gets the English command", p.text, "#center_[B\"H]");
    const doc2 = "#right_[B\"H]";
    check("…and an English wrapper retargets in place", press(doc2, 2, 2, "center_"), "#center_[B\"H]");
  }

  // --------------------------------------------------------- the paragraph

  {
    // `paragraphIn` here and `paragraphAt` in `focus.ts` are two spellings of
    // one definition — the blank-line run of lines, which is what Typst means by
    // a paragraph. They read different inputs (a string and an `EditorState`),
    // so they are two implementations, and two implementations of one definition
    // is what this repository has paid for before. Held to each other here.
    const corpus = [
      "שלום עולם",
      "ראשון\n\nשני",
      "א\nב\nג\n\nד",
      "\n\n\n",
      "  \nטקסט\n  \n",
      "#כותרת1[פרק]\n\nטקסט\nעוד",
    ];
    for (const text of corpus) {
      const state = EditorState.create({ doc: text });
      for (let pos = 0; pos <= text.length; pos++) {
        const mine = paragraphIn(text, pos);
        const theirs = paragraphAt(state, pos);
        const line = state.doc.lineAt(Math.min(pos, text.length));
        // `focus.paragraphAt` answers in line numbers; this answers in offsets.
        const want = { from: state.doc.line(theirs.from).from, to: state.doc.line(theirs.to).to };
        check(`the two paragraph definitions agree at ${pos} in ${JSON.stringify(text)}`, `${mine.from}-${mine.to}`, `${want.from}-${want.to}`);
        void line;
      }
    }
  }
  {
    // Every paragraph the selection touches, in order, no overlaps and no
    // repeats — the walk that turns a drag into the set of things to align.
    const doc = "א\n\nב\nג\n\nד";
    const ps = paragraphsIn(doc, 0, doc.length);
    check("a whole-document selection finds every paragraph", ps.length, 3);
    for (let i = 1; i < ps.length; i++) ok("…in order", ps[i].from > ps[i - 1].to);
  }

  // ------------------------------------------------------------- the wrapper

  {
    const doc = "#ימין[שלום]";
    const w = wrapperIn(doc, 0, doc.length);
    ok("the wrapper is found", w != null);
    check("…with its edge", w.edge, "right");
    check("…its name span", doc.slice(w.nameFrom, w.nameTo), "ימין");
    check("…and its body", doc.slice(w.bodyFrom, w.bodyTo), "שלום");
    check("a paragraph that is not a call has no wrapper", wrapperIn("שלום עולם", 0, 10), null);
    check("a call with arguments is not read as one", wrapperIn("#ימין(x)[שלום]", 0, 15), null);
    check("a call with text after it is not the paragraph", wrapperIn("#ימין[שלום] עוד", 0, 14), null);
  }

  // ------------------------------------------------------------------ state

  {
    const doc = "ראשון\n\n#מרכז[שני]\n\nשלישי";
    check("the ribbon shows the edge the paragraph is on", edgeAt(doc, doc.indexOf("שני")), "center");
    check("…and nothing in ordinary prose", edgeAt(doc, 1), null);
  }

  // ---------------------------------------------------------------- the class

  {
    // The fence: no press, anywhere, may produce an empty call. This is the
    // whole finding in one assertion — the five rows above are its instances.
    const docs = [
      "שלום עולם",
      "#ימין[שלום]",
      "#מרכז[שלום]",
      "#left_[hello]",
      "א\n\nב",
      "#כותרת1[פרק]",
    ];
    const names = [...Object.values(COMMAND_OF_EDGE), ...Object.values(COMMAND_OF_EDGE).map((n) => alignCommand(edgeOf(n), "en"))];
    let pressed = 0;
    for (const doc of docs) {
      for (let from = 0; from <= doc.length; from++) {
        // A blank line is the one place an empty call is the answer — see the
        // module header — so the sweep is over paragraphs that hold something.
        if (doc.slice(paragraphIn(doc, from).from, paragraphIn(doc, from).to).trim() === "") continue;
        for (const name of names) {
          const p = plan(doc, from, from, "", `#${name}[|]`, "he");
          const text = p.kind === "rewrite" ? p.text : p.kind === "edit" ? p.text : "";
          pressed++;
          if (EMPTY_ALIGN.test(text)) {
            check(`no empty call from #${name} at ${from} in ${JSON.stringify(doc)}`, text, "no empty alignment call");
          }
        }
      }
    }
    ok("…and the sweep pressed the buttons", pressed > 100);
  }
  {
    // The one deliberate empty call: a blank paragraph, where it means "type
    // here, centred" and the caret is already between the brackets.
    const p = plan("", 0, 0, "", "#מרכז[|]", "he");
    check("an empty document takes the snippet", p.text, "#מרכז[]");
    check("…with the caret inside it", p.cursor, "#מרכז[".length);
  }
}
