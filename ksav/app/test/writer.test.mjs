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
}
