// Where the caret's preview follow looks — and the one place it refuses to guess.
//
// #197's fence. The bug was a DOM guard: `followCaretInPreview` collected
// `.preview-host` elements and returned when there were not exactly one, so the
// shipped `twoPreviews` arrangement — two preview hosts, by construction — made
// the linked preview silently stop following, since a preview that does not
// scroll looks exactly like a preview that is already where it should be.
//
// What is asserted here is the *tree* answer, which is the one the code now
// reads: a preview is linked or it is not, `panes` states that per leaf, and
// the follow target is "the linked preview, when there is exactly one". The DOM
// lookup by `pane-host-` id is the same pairing `panehost.ts` writes when it
// renders the leaf, so nothing here needs a browser.

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as panes from "../.tmp-test/panes.mjs";
import { followedPreview } from "../.tmp-test/panescroll.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

export async function run() {
  // ------------------------------------------------- 1. the plain arrangement
  //
  // One source, one preview: the arrangement every follow since the feature
  // began was written for, and the answer is unchanged — the one preview.
  {
    const tree = panes.defaultTree();
    const pane = followedPreview(tree);
    ok("the default tree has a follow target", !!pane);
    check("…which is the preview", pane?.role, "preview");
    check("…and it is linked", pane?.linked, true);
  }

  // ------------------------------------------------- 2. the shipped twoPreviews
  //
  // The bug, as an arrangement: `twoPreviews` is pure data in `panes.ts` and it
  // ships in ARRANGEMENTS. Its second preview is explicitly unlinked, so the
  // answer here must not be "nothing to follow" — the whole point of the preset
  // is one preview that follows. This assertion is the one that was red the day
  // the guard counted DOM boxes instead of tree links.
  {
    const two = panes.ARRANGEMENTS.find((a) => a.id === "twoPreviews");
    ok("the twoPreviews arrangement ships", !!two);
    const pane = followedPreview(two.build());
    ok("twoPreviews still has exactly one follow target", !!pane, String(pane?.id));
    check("…and it is the linked preview, not the unlinked one", pane?.linked, true);
    // The reverse: the unlinked preview is the second one in the column, and a
    // follow that ever picked it would be the same bug wearing the other hat.
    const unlinked = panes.leaves(two.build()).filter((l) => !l.linked);
    check("…while the other preview stays unlinked", unlinked.length, 1);
  }

  // ------------------------------------------------- 3. the refusal cases
  //
  // None and more-than-one are equally "do not guess". None is an arrangement
  // with no preview at all; two linked previews is #163's open question and a
  // follow that picked one of them would be inventing an answer the product has
  // not chosen.
  {
    const only = panes.leaf("source");
    check("a tree without a preview follows nothing", followedPreview(only), null);
    // Written as the tree's own literal shape: `splitOf` is private to
    // `panes.ts` and the point of this case is the *data*, not the builder.
    const box = (dir, a, b) => ({ kind: "split", id: `s-${dir}-${a.id ?? "x"}`, dir, frac: 0.5, a, b });
    const row = box("row", box("col", panes.leaf("preview"), panes.leaf("preview")), panes.leaf("source"));
    check("two linked previews are left to #163, not guessed", followedPreview(row), null);
  }

  // ------------------------------------------------- 4. the pairing with the DOM
  //
  // The follow now looks the host up by the pane id `panehost.ts` writes
  // (`pane-host-${pane.id}`). A global `.preview-host` scan is the reported
  // bug's shape — count the boxes, take the first, forget the tree — so it is
  // refused here the way chrome.test.mjs refuses undeclared selectors.
  {
    // Comments stripped first: the header of the fix *quotes* the guard it
    // replaced, and a guard that reads its own explanation as evidence is the
    // mistake `chrome.test.mjs` already paid for once.
    const src = readFileSync(`${HERE}/../src/panescroll.ts`, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    // #211: a scroll floor says *another writer owns this pane right now*, and the
    // follow used to obey it by dropping itself. What was left on screen was that
    // other writer's position — for a jump, the linked scroll's proportion of the
    // source — so the pane stopped 157px from the heading and only a second click
    // finished the journey. Re-arming costs one timer and lands the exact place
    // once the claim expires; dropping it means the estimate is the answer.
    ok(
      "a scroll floor defers the follow rather than discarding it",
      /if \(scrollFloor && performance\.now\(\) < scrollFloor\.until\) \{\s*caretFollowTimer = window\.setTimeout/u.test(src),
    );
    ok("the follow prefixes its id for the host it means", src.includes("pane-host-"));
    ok(
      "and no scan counts preview boxes",
      !/querySelectorAll\(\s*["'`]\.preview-host/.test(src),
    );
  }
}