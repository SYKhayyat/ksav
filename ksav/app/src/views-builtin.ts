// Ksav's own parts, modes and link modes, registered the way anybody's would be.
//
// Nothing here is reachable except through `views.register*`: there is no
// second table a built-in can read that a contribution cannot. That is the
// whole of the registry's promise (`views.ts`), and it is kept by writing the
// built-ins against it from the first commit rather than migrating them later.
//
// # What is refused, and why the refusals say "not yet"
//
// Some combinations are right in the design and not yet drawn: a note edited in
// a box of its own, the writer, an aligned link. They are refused with
// `view.notYet` rather than left out of the pickers, so the picker already
// shows the whole grid and the refusal is lifted where the work lands, in one
// place, instead of an entry appearing from nowhere.

import { modeOf, registerLinkMode, registerMode, registerPart, type Refusal, type Scope } from "./views";

const NOT_YET: Refusal = { key: "view.notYet" };

/** A notes scope narrowed beyond "all of them", which the lists cannot draw yet. */
const filtered = (s: Scope) =>
  s.series !== undefined || s.depth !== undefined || (s.under !== undefined && s.under !== "all") || s.within !== undefined;

/**
 * Register the built-ins. Idempotent, so every module that needs them may ask —
 * and asked of the registry rather than of a flag here, so a test that resets
 * the registry gets them back by asking again.
 */
export function registerBuiltins(): void {
  if (modeOf("source")) return;

  registerPart({ id: "body", name: "scope.body", filters: ["within"] });
  registerPart({ id: "notes", name: "scope.notes", filters: ["series", "depth", "under", "within"] });
  registerPart({ id: "file", name: "scope.file", filters: [] });

  registerMode({
    id: "source",
    name: "viewMode.source",
    edits: true,
    // The raw text of the whole file is what a source box has always been. The
    // body without its notes, and a note on its own, are projections (step 5).
    refuses: (s) => (s.part === "file" ? null : NOT_YET),
  });
  registerMode({
    id: "preview",
    name: "viewMode.preview",
    edits: false,
    refuses: (s) => {
      if (s.part !== "notes") return null;
      // The example the design was written around: a note prints on the body's
      // pages and has none of its own.
      if (s.under && s.under !== "all") return { key: "view.noteHasNoPages" };
      return { key: "view.notesHaveNoPages" };
    },
  });
  registerMode({
    id: "outline",
    name: "viewMode.outline",
    edits: false,
    refuses: (s) => (s.part === "notes" && filtered(s) ? NOT_YET : s.within ? NOT_YET : null),
  });
  registerMode({
    id: "marks",
    name: "viewMode.marks",
    edits: false,
    refuses: (s) => (s.part === "notes" ? { key: "view.marksAreTheBodys" } : s.within ? NOT_YET : null),
  });

  registerLinkMode({ id: "unlinked", name: "link.unlinked" });
  registerLinkMode({ id: "scroll", name: "link.scroll" });
  registerLinkMode({
    id: "aligned",
    name: "link.aligned",
    refuses: (follower) => (follower.scope.part !== "notes" ? { key: "view.alignedNeedsNotes" } : NOT_YET),
  });
}
