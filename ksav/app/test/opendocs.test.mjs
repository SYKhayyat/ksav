// The open set: which documents are open, as distinct from which exist.
//
// Seven complaints in the marked-up UI inventory were one missing concept —
// a document has a title and a filename and nothing explains the difference,
// there is no way to have two documents open, "new document" made the open one
// disappear, undo after that restored the previous document's text into the new
// one, reopening a document brought it back in prose mode, reopening it brought
// the preview back left-to-right, and several views of one document is not
// possible at all. None of those is a bug in the ordinary sense. The application
// had **no concept of an open document distinct from the document**, and each
// item is that one absence showing through somewhere different.
//
// What is testable here is the set itself: order, focus, closing, and the one
// invariant the whole model rests on — *a document is never open twice*, because
// two entries for one document is two carets and two undo stacks over one text,
// which is the forked state this exists to prevent.
//
// The `EditorState` a real entry carries is not built here. A state needs the
// whole extension array, which needs the chrome; what this file asserts is the
// bookkeeping, and the bookkeeping is what a switch, a close and a delete all go
// through.

import { check, ok, notOk } from "./harness.mjs";
import * as open from "../.tmp-test/opendocs.mjs";

/** A stand-in for the editor state, which this module only ever stores. */
const doc = (id, prose = true) => ({ id, state: { id }, scrollTop: 0, prose });

export async function run() {
  // ------------------------------------------------------------------ opening

  {
    open.reset();
    check("nothing is open to begin with", open.count(), 0);
    check("and nothing is focused", open.focusedId(), null);

    open.put(doc("a"));
    open.put(doc("b"));
    check("two documents are open", open.count(), 2);
    ok("both are known to be open", open.isOpen("a") && open.isOpen("b"));
    notOk("something else is not", open.isOpen("c"));
    // Opening is not looking at. A link into another chapter, or the switcher
    // pre-loading, is a real thing to want, and conflating the two verbs is the
    // conflation this module exists to undo.
    check("...and opening did not focus anything", open.focusedId(), null);
  }

  {
    // The invariant. Two entries for one document is two carets and two undo
    // stacks over one text — the fork the whole model exists to prevent.
    open.reset();
    open.put(doc("a", true));
    open.put(doc("a", false));
    check("a document cannot be open twice", open.count(), 1);
    check("and the later record wins", open.opened("a").prose, false);
  }

  // ------------------------------------------------------------------ order

  {
    open.reset();
    open.put(doc("a"));
    open.put(doc("b"));
    open.put(doc("c"));
    open.focus("a");
    check("focusing moves a document to the front", open.openDocs().map((d) => d.id), ["a", "b", "c"]);
    open.focus("c");
    check("...and again", open.openDocs().map((d) => d.id), ["c", "a", "b"]);
    check("the focused one is the focused one", open.focusedId(), "c");

    // Most-recently-used, which is what makes the *second* entry the answer to
    // "the one I was just in". The switcher and the `lastDoc` key read the same
    // list, so they cannot disagree about what "last" means.
    check("previous is the one before this", open.previous(), "a");
    open.focus("a");
    check("...and it is symmetric", open.previous(), "c");
  }

  {
    open.reset();
    open.put(doc("a"));
    open.focus("a");
    check("with one open there is nowhere to go back to", open.previous(), null);
  }

  {
    open.reset();
    open.put(doc("a"));
    check("focusing something that is not open is refused", open.focus("zz"), undefined);
    check("...and changes nothing", open.focusedId(), null);
  }

  // ------------------------------------------------------------------ stashing

  {
    // What the view held goes back into the set on the way out. This is the
    // whole of per-document caret, per-document undo and per-document scroll:
    // the state is the carrier, and this is where it is put down.
    open.reset();
    open.put(doc("a"));
    open.focus("a");
    open.stash("a", { id: "a", edited: true }, 420);
    check("the state is kept", open.opened("a").state.edited, true);
    check("and so is where it was scrolled to", open.opened("a").scrollTop, 420);
    // Stashing against something not open is a caller's mistake, and doing
    // nothing is better than inventing an entry nobody asked to open.
    open.stash("zz", { id: "zz" }, 1);
    notOk("stashing an unopened document opens nothing", open.isOpen("zz"));
  }

  // ------------------------------------------------------------------ closing

  {
    open.reset();
    open.put(doc("a"));
    open.put(doc("b"));
    open.put(doc("c"));
    open.focus("a");
    open.focus("b");
    open.focus("c"); // order: c, b, a

    check("closing the focused one lands on the one you came from", open.close("c"), "b");
    check("...which is now focused", open.focusedId(), "b");
    check("and it is gone from the set", open.count(), 2);
    notOk("really gone", open.isOpen("c"));
  }

  {
    open.reset();
    open.put(doc("a"));
    open.put(doc("b"));
    open.focus("b");
    check("closing one you are not looking at leaves the focus alone", open.close("a"), "b");
    check("...really alone", open.focusedId(), "b");
    check("and only the closed one went", open.count(), 1);
  }

  {
    open.reset();
    open.put(doc("a"));
    open.focus("a");
    check("closing the last one leaves nothing focused", open.close("a"), null);
    check("and nothing open", open.count(), 0);
  }

  {
    open.reset();
    open.put(doc("a"));
    open.focus("a");
    check("closing something already closed is not an error", open.close("zz"), "a");
    check("and does not disturb the set", open.count(), 1);
  }

  // --------------------------------------------------- per-document view state

  {
    // Prose or raw is a property of the document, which is the fix for "I closed
    // this document and reopened it, and it went into prose mode". Two documents
    // holding opposite answers at the same time is exactly the case an
    // application-wide flag could not express.
    open.reset();
    open.put(doc("sefer", true));
    open.put(doc("markup", false));
    check("one is in prose", open.opened("sefer").prose, true);
    check("...while the other is raw, at the same time", open.opened("markup").prose, false);
  }
}
