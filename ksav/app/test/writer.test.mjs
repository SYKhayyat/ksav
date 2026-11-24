// Writer mode: prose with the markup never shown and never stood inside.
//
// `decisions/2026-11-23-frontends-are-views-in-boxes.md` §4: writer
// scaffolding is replace decorations registered as atomic ranges, so the caret
// can never stand inside markup; the bodies of formatting commands stay text.
// Prose mode reveals a command when the caret touches it — the writer does
// not, and that one difference is what is held here, against the real
// CodeMirror state.

import { check, ok, notOk } from "./harness.mjs";
import { proseMode, writerFacet, atomicOf } from "../.tmp-test/ksav-lang.mjs";
import * as panes from "../.tmp-test/panes.mjs";
import * as modeline from "../.tmp-test/modeline.mjs";
import { EditorState } from "@codemirror/state";
import * as notedelete from "../.tmp-test/notedelete.mjs";
import * as notes from "../.tmp-test/notes.mjs";

/** The replaced spans of a state's prose drawing, as [from, to]. */
function hidden(state) {
  const out = [];
  for (const it = atomicOf(state.field(proseMode).deco).iter(); it.value; it.next()) out.push([it.from, it.to]);
  return out;
}

export async function run() {
  const doc = "פתיחה #הדגשה[חשוב] סוף.\n";
  const open = doc.indexOf("#");
  const inName = open + 2;

  const prose = EditorState.create({ doc, selection: { anchor: inName }, extensions: [proseMode] });
  const writer = EditorState.create({ doc, selection: { anchor: inName }, extensions: [writerFacet.of(true), proseMode] });

  notOk("prose mode reveals the command the caret stands in", hidden(prose).some(([f, t]) => f <= inName && inName <= t));
  ok("the writer hides it with the caret inside", hidden(writer).some(([f, t]) => f <= open && inName < t), hidden(writer));

  const body = doc.indexOf("חשוב");
  notOk("…and the body of the formatting command is text, not scaffolding",
    hidden(writer).some(([f, t]) => f <= body && body < t));

  const moved = writer.update({ selection: { anchor: body + 1 } }).state;
  check("a caret move does not change what the writer hides", hidden(moved), hidden(writer));

  // The box: a writer over the body is drawn by the source editor; a writer
  // over the raw file is refused in words.
  check("writer × body is a source editor drawn as prose", panes.rendererOf({ scope: { part: "body" }, mode: "writer" }), "source");
  check("writer × file is refused with its reason", modeline.boxRefusal({ scope: { part: "file" }, mode: "writer" })?.key, "view.writerIsTheBodys");

  // Deleting a note (§2, the owner's setting). A fake view: the state, and a
  // dispatch that applies.
  const ndoc = "לפני#הערה[עיין שם בפנים] אחרי.\n";
  const n = notes.notesIn(ndoc)[0];
  ok("the fixture has its note", !!n, notes.notesIn(ndoc));
  const fake = (anchor) => {
    const v = { state: EditorState.create({ doc: ndoc, selection: { anchor } }) };
    v.dispatch = (spec) => (v.state = v.state.update(spec).state);
    return v;
  };
  {
    const v = fake(n.to);
    let said = "";
    ok("two-step: Backspace at the marker's end is taken", notedelete.deleteIntoNote(v, false, "twoStep", (w) => (said = w)));
    check("…and only selects the marker", [v.state.selection.main.from, v.state.selection.main.to, v.state.doc.toString()], [n.from, n.to, ndoc]);
    ok("…saying the note's first words", said.includes("עיין"), said);
    ok("the second Backspace deletes", notedelete.deleteIntoNote(v, false, "twoStep", () => {}));
    check("…marker and body together, one change", v.state.doc.toString(), notes.deleteNote(ndoc, n).text);
  }
  {
    const v = fake(n.from);
    ok("immediate: Delete at the marker's start deletes at once", notedelete.deleteIntoNote(v, true, "immediate", () => {}));
    check("…the whole note", v.state.doc.toString(), notes.deleteNote(ndoc, n).text);
  }
  notOk("away from a marker the key is the ordinary one", notedelete.deleteIntoNote(fake(1), false, "twoStep", () => {}));
  check("changeBetween is the one edit", notedelete.changeBetween("abcXYdef", "abcdef"), { from: 3, to: 5, insert: "" });

  // A formatting edge, met by one key, is unwrapped — never broken. Found by
  // running CodeMirror's own Backspace after `]`: it took the `]` alone and the
  // bold ran on to the end of the paragraph.
  {
    const d = "פתיחה #הדגשה[חשוב] סוף.\n";
    const plain = "פתיחה חשוב סוף.\n";
    const at = (pos, fwd) => notedelete.unwrapRange(d, pos, fwd);
    check("Backspace after ] unwraps, caret after the words", at(d.indexOf("]") + 1, false), { text: plain, caret: plain.indexOf(" סוף") });
    check("Backspace after [ unwraps, caret before them", at(d.indexOf("[") + 1, false), { text: plain, caret: plain.indexOf("חשוב") });
    check("Delete before # unwraps", at(d.indexOf("#"), true)?.text, plain);
    check("Delete before ] unwraps", at(d.indexOf("]"), true)?.text, plain);
    check("inside the words the key is the ordinary one", at(d.indexOf("שוב"), false), null);
    check("a note's edge is held, not unwrapped", notedelete.unwrapRange("א #הערה[ב] ג", "א #הערה[ב] ג".indexOf("]") + 1, false), "hold");
  }
}
