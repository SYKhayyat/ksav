// The view registry: scope × mode, links, layers, and the scope query.
//
// `decisions/2026-11-23-frontends-are-views-in-boxes.md` makes three promises
// this file holds the registry to. Any scope combines with any mode, and the
// combinations that cannot work are *refused with a reason*, never hidden. A
// link chain is allowed and a cycle is refused when it would be made. Layers
// resolve global < mode < scope < box, so the focused box decides what a
// command means. The built-ins go through the same API, so they are tested
// through it too.

import { check, ok, notOk } from "./harness.mjs";
import * as views from "../.tmp-test/views.mjs";
import * as builtin from "../.tmp-test/views-builtin.mjs";

/** A note span with only what the scope reads. */
function span(from, to, depth, series = "הערה", bodyFrom = from + 1, bodyTo = to - 1) {
  return { from, to, bodyFrom, bodyTo, depth, series, hasBody: true, command: "הערה", text: "", deferred: null };
}

export async function run() {
  // ------------------------------------------------------------ the registry is the only door

  {
    views._resetRegistry();
    builtin.registerBuiltins();
    const modeIds = views.modes().map((m) => m.id);
    ok("the built-in modes are registered through the registry", ["source", "preview", "outline", "marks"].every((m) => modeIds.includes(m)));
    check("the built-in parts", views.parts().map((p) => p.id), ["body", "notes", "file"]);
    check("the built-in link modes", views.linkModes().map((l) => l.id), ["unlinked", "scroll", "aligned"]);
    let threw = false;
    try {
      views.registerMode({ id: "source", name: "x", edits: true });
    } catch {
      threw = true;
    }
    ok("a second registration of an id is refused, not a silent overwrite", threw);
    const undo = views.registerMode({ id: "braille", name: "viewMode.braille", edits: false });
    ok("a contribution registers like a built-in", !!views.modeOf("braille"));
    undo();
    notOk("and takes itself back", !!views.modeOf("braille"));
  }

  // ------------------------------------------------------------ refusals carry a reason

  {
    const r = (view) => views.viewRefusal(view)?.key ?? null;
    check("raw source of the file is a view", r({ scope: { part: "file" }, mode: "source" }), null);
    check("a preview of the body is a view", r({ scope: { part: "body" }, mode: "preview" }), null);
    check(
      "a preview of one note is refused with the design's own sentence",
      r({ scope: { part: "notes", under: "n7f3" }, mode: "preview" }),
      "view.noteHasNoPages",
    );
    check("a preview of a series is refused too", r({ scope: { part: "notes", series: ["הערה"] }, mode: "preview" }), "view.notesHaveNoPages");
    check("an unknown mode says which", views.viewRefusal({ scope: { part: "body" }, mode: "nope" }), { key: "view.unknownMode", args: ["nope"] });
    check("an unknown part says which", r({ scope: { part: "margin" }, mode: "source" }), "view.unknownPart");
    check("a filter the part does not take is refused", r({ scope: { part: "file", series: ["x"] }, mode: "source" }), "view.filterNotFor");
    check("depth 0 is not a depth", r({ scope: { part: "notes", depth: 0 }, mode: "outline" }), "view.badDepth");
    check("an upside-down depth range is not one", r({ scope: { part: "notes", depth: [3, 2] }, mode: "outline" }), "view.badDepth");
    check("the notes list is an outline over the notes", r({ scope: { part: "notes" }, mode: "outline" }), null);
    check("what is designed but not built says so", r({ scope: { part: "notes", depth: 2 }, mode: "source" }), "view.notYet");
  }

  // ------------------------------------------------------------ links

  {
    const body = { id: "a", view: { scope: { part: "file" }, mode: "source" } };
    const foot = { id: "b", view: { scope: { part: "notes" }, mode: "outline" } };
    const deep = { id: "c", view: { scope: { part: "notes" }, mode: "outline" } };
    const links = { a: null, b: "a", c: "b" };
    const leaderOf = (id) => links[id] ?? null;
    check("a chain is allowed: notes on notes → notes → body", views.linkRefusal(deep, foot, "scroll", leaderOf), null);
    check("a box cannot follow itself", views.linkRefusal(foot, foot, "scroll", leaderOf)?.key, "view.linkSelf");
    check("closing the chain into a loop is refused", views.linkRefusal(body, deep, "scroll", leaderOf)?.key, "view.linkCycle");
    check("unlinking needs no leader", views.linkRefusal(foot, null, "unlinked", leaderOf), null);
    check("linking does", views.linkRefusal(foot, null, "scroll", leaderOf)?.key, "view.linkNeedsLeader");
    check("aligned is for notes beside a body", views.linkRefusal(body, foot, "aligned", () => null)?.key, "view.alignedNeedsNotes");
  }

  // ------------------------------------------------------------ layers

  {
    const undo = [
      views.registerLayer({ id: "t.global", level: "global", commands: { "note.insert": "note.insert" }, keys: { "Mod-n": "note.insert" } }),
      // Registered *before* the global one would have been, at a higher level:
      // order of registration across levels must not matter.
      views.registerLayer({
        id: "t.notes",
        level: "scope",
        when: (c) => c.view.scope.part === "notes",
        commands: { "note.insert": "note.insertOnNote", "heading.insert": null },
      }),
      views.registerLayer({ id: "t.preview", level: "mode", when: (c) => c.view.mode === "preview", keys: { j: "preview.down", "Mod-n": null } }),
      views.registerLayer({ id: "t.box", level: "box", when: (c) => c.box === "p9", commands: { "note.insertOnNote": "note.insertPlain" } }),
    ];
    const at = (box, view) => views.resolveLayers({ box, view });
    const body = at("p1", { scope: { part: "file" }, mode: "source" });
    check("in the body the note command is itself", views.commandIn(body, "note.insert"), "note.insert");
    check("a command no layer names is itself", views.commandIn(body, "save"), "save");
    const notes = at("p2", { scope: { part: "notes" }, mode: "outline" });
    check("in a notes scope the note command inserts a note on a note", views.commandIn(notes, "note.insert"), "note.insertOnNote");
    check("a scope layer can hide a command", views.commandIn(notes, "heading.insert"), null);
    check("the layers in force, lowest first", notes.layers, ["t.global", "t.notes"]);
    const prev = at("p3", { scope: { part: "body" }, mode: "preview" });
    check("in preview a typing key navigates", prev.keys.get("j"), "preview.down");
    check("and a mode can unbind a global key", prev.keys.get("Mod-n"), null);
    const mine = at("p9", { scope: { part: "notes" }, mode: "outline" });
    check("a box layer beats its scope's, and remaps follow", views.commandIn(mine, "note.insert"), "note.insertPlain");
    for (const u of undo) u();
    const loop = [
      views.registerLayer({ id: "t.l1", level: "global", commands: { x: "y" } }),
      views.registerLayer({ id: "t.l2", level: "box", commands: { y: "x" } }),
    ];
    ok("two layers remapping into each other end rather than spin", typeof views.commandIn(at(null, { scope: { part: "body" }, mode: "preview" }), "x") === "string");
    for (const u of loop) u();
  }

  // ------------------------------------------------------------ the scope query

  {
    // body ⟨ f1 ⟨ s1 ⟩ ⟩ ⟨ e1 ⟩ ⟨ f2 ⟨ s2 ⟨ t1 ⟩ ⟩ ⟩
    const f1 = span(10, 40, 0);
    const s1 = span(20, 30, 1);
    const e1 = span(50, 60, 0, "הערתסיום");
    const f2 = span(70, 120, 0);
    const s2 = span(80, 110, 1);
    const t1 = span(90, 100, 2);
    const all = [f1, s1, e1, f2, s2, t1];
    const q = (scope, ctx) => views.notesInScope(all, { part: "notes", ...scope }, ctx);
    check("all notes", q({}).length, 6);
    check("footnotes on the body", q({ series: ["הערה"], depth: 1 }), [f1, f2]);
    check("endnotes", q({ series: ["הערתסיום"] }), [e1]);
    check("notes on notes", q({ depth: 2 }), [s1, s2]);
    check("depth as a range", q({ depth: [2, 3] }), [s1, s2, t1]);
    check("the sub-notes of the footnote the caret is in", q({ depth: 1, under: "caret" }, { caretNote: f2 }), [s2]);
    check("and everything under it", q({ under: "caret" }, { caretNote: f2 }), [s2, t1]);
    check("no caret note, no notes — never a guess", q({ under: "caret" }, { caretNote: null }), []);
    check("a pinned note is that note", q({ under: "n1" }, { pinned: (id) => (id === "n1" ? s1 : null) }), [s1]);
    check("a pin whose note is gone is empty, not another note", q({ under: "n2" }, { pinned: () => null }), []);
    check(
      "narrowed to one section",
      q({ depth: 1, within: "ב" }, { section: (t) => (t === "ב" ? { from: 45, to: 130 } : null) }),
      [e1, f2],
    );
    check("a body scope takes no notes", views.notesInScope(all, { part: "body" }), []);
  }

  // ------------------------------------------------------------ naming and equality

  {
    ok("scopes compare by meaning, not key order", views.sameScope({ part: "notes", series: ["b", "a"] }, { series: ["a", "b"], part: "notes" }));
    notOk("a different depth is a different scope", views.sameScope({ part: "notes", depth: 1 }, { part: "notes", depth: 2 }));
    check(
      "the mode line reads the scope the way a writer says it",
      views.scopeLabel({ part: "notes", series: ["הערה"], depth: 2, under: "caret" }).map((p) => p.key),
      ["scope.series", "scope.depth", "scope.underCaret"],
    );
    check("a body scope is named by its part", views.scopeLabel({ part: "body" }), [{ key: "scope.body" }]);
  }

  // ------------------------------------------------------------ the scope alone, and the order of layers

  {
    check("a scope is asked about before any mode: a filter its part has not got", views.scopeRefusal({ part: "file", depth: 1 }), { key: "view.filterNotFor", args: ["depth", "file"] });
    check("…a depth that is no depth", views.scopeRefusal({ part: "notes", depth: [3, 1] })?.key, "view.badDepth");
    check("…a well-formed scope has no complaint", views.scopeRefusal({ part: "notes", depth: [1, 2] }), null);
    check("a part is found by its id, the way a contribution would find one", views.partOf("notes")?.filters, ["series", "depth", "under", "within"]);
    check("…and an unknown one is not", views.partOf("nope"), undefined);
    check("the layers resolve narrowest last, so the box has the last word", [...views.LEVELS], ["global", "mode", "scope", "box"]);
  }
}
