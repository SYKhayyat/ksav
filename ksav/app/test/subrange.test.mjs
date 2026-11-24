// A box over one range of the primary: the range follows every change, the
// box's edits land in the primary, and a range deleted from outside is `gone`
// — never a change of the wrong length (frontends record §4).
//
// Held against random edits: whatever the primary does, the box's text after
// applying `follow` is exactly the primary's slice at the new range.

import { check, ok } from "./harness.mjs";
import * as sub from "../.tmp-test/subrange.mjs";
import * as notes from "../.tmp-test/notes.mjs";
import { ChangeSet, EditorState, Text } from "@codemirror/state";

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 8;
}

export async function run() {
  const doc = "לפני #הערה[גוף ההערה כאן] אחרי";
  const from = doc.indexOf("[") + 1;
  const to = doc.indexOf("]");
  const range = { from, to };
  const primary = Text.of([doc]);

  // The box's own edit, forwarded, is the primary's edit at the offset.
  const box = EditorState.create({ doc: doc.slice(from, to) });
  const tr = box.update({ changes: { from: 4, insert: "!" } });
  const spec = sub.forward(range, tr.changes);
  const pc = ChangeSet.of(spec, primary.length);
  const after = pc.apply(primary);
  check("a box's edit lands in the primary at the range's offset", after.toString(), doc.slice(0, from + 4) + "!" + doc.slice(from + 4));
  const f = sub.follow(range, pc, after);
  check("…and the range grows by it", f.kind === "moved" && [f.range.from, f.range.to], [from, to + 1]);

  // Typing at the edges belongs to the range; a deletion before it moves it.
  {
    const at = (pos, ins) => sub.follow(range, ChangeSet.of([{ from: pos, insert: ins }], primary.length), Text.of([""]));
    check("typing at the start is inside", at(from, "x").range, { from, to: to + 1 });
    check("typing at the end is inside", at(to, "x").range, { from, to: to + 1 });
    const del = sub.follow(range, ChangeSet.of([{ from: 0, to: 4 }], primary.length), Text.of([""]));
    check("a deletion before moves it", [del.kind, del.range], ["moved", { from: from - 4, to: to - 4 }]);
  }

  // Deleted from outside: gone, and nothing applied.
  check("the note deleted whole is gone", sub.follow(range, ChangeSet.of([{ from: from - 6, to: to + 1 }], primary.length), Text.of([""])).kind, "gone");

  // Random edits: the box is always the slice.
  const next = rng(42);
  let bad = 0;
  for (let round = 0; round < 400; round++) {
    let p = Text.of([doc]);
    let r = range;
    let b = Text.of([doc.slice(from, to)]);
    for (let step = 0; step < 12; step++) {
      const a = next() % (p.length + 1);
      const z = Math.min(p.length, a + (next() % 5));
      const ins = ["", "x", "יז", "\n"][next() % 4];
      const cs = ChangeSet.of([{ from: a, to: z, insert: ins }], p.length);
      p = cs.apply(p);
      const f = sub.follow(r, cs, p);
      if (f.kind === "gone") break;
      try {
        b = f.kind === "moved" ? f.changes.apply(b) : Text.of(f.text.split("\n"));
      } catch (e) {
        if (bad++ < 3) ok(`round ${round}: follow never throws`, false, String(e));
        break;
      }
      r = f.range;
      if (b.toString() !== p.sliceString(r.from, r.to) && bad++ < 3) ok(`round ${round}.${step}: the box is the slice`, false, [b.toString(), p.sliceString(r.from, r.to)]);
    }
  }
  check("4800 random primary edits: the box is always exactly the slice", bad, 0);

  // Pins: the id goes into that note's head, is found again after the text
  // around it moves, and a deleted id is nothing — not the nearest note.
  {
    const two = "א #הערה[ראשונה] ב #הערה(שם: \"x\")[שנייה] ג.";
    const [n1, n2] = notes.notesIn(two);
    const id = sub.freshId(two, () => 0.5);
    const p1 = sub.pinNote(two, n1, id);
    ok("a bare note takes an id", p1?.includes(`#הערה(מזהה: "${id}")[ראשונה]`), p1);
    const p2 = sub.pinNote(two, n2, "n2");
    ok("a note with arguments takes it after them", p2?.includes(`#הערה(שם: "x", מזהה: "n2")[שנייה]`), p2);
    const moved = "פתיחה חדשה. " + p1;
    check("the pin finds its note after the text moves", sub.pinnedNote(moved, id)?.text, "ראשונה");
    check("…and still parses as the same notes", notes.notesIn(moved).length, 2);
    check("an id that is gone finds nothing", sub.pinnedNote(two, id), null);
    ok("fresh ids are not ones already used", sub.freshId(p1, (() => { let k = 0; return () => (k++ === 0 ? 0.5 : 0.25); })()) !== id);
  }
}
