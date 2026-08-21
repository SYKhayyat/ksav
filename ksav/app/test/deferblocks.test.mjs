// One block per apparatus at the foot of the file — and reading order inside it.
//
// # The report
//
// > *"At the end of the source, deferred bodies for footnotes and endnotes are
// > interleaved in one run, which is confusing to read and to edit. Add an
// > option to keep each apparatus's bodies in its own block, with a heading or
// > separator."*
//
// And the two sentences after it, which are what make this a design rather than
// a sort:
//
// > *"This must hold together with the existing rule that deferred bodies are
// > filed in **reading order**. So the answer is grouping by apparatus first and
// > reading order within each group — not abandoning the ordering. The insertion
// > logic must know about the grouping too, or the setting is true only until
// > the writer adds a note."*
//
// So there are three claims to hold, and each has its own section below: the
// blocks exist, the reading order survives inside them, and a note added
// afterwards lands in the right block. The third is the one that makes the
// setting true tomorrow rather than only at the moment the tidy was run.

import { check, ok, notOk } from "./harness.mjs";
import {
  sortBodies,
  fileNewBody,
  scan,
  apparatusOf,
} from "../.tmp-test/deferred.mjs";

/** A document, written as lines so no escape has to survive a quote. */
const doc = (...lines) => lines.join("\n") + "\n";

/** The bodies at the foot of the file, in the order they are written. */
function bodies(text) {
  return scan(text).defs.map((d) => text.slice(d.bodyFrom, d.bodyTo));
}

/** The apparatus of each body, in order. */
function blocks(text) {
  const s = scan(text);
  return s.defs.map((d) => apparatusOf(s, d.name));
}

/**
 * A sefer with a footnote and an endnote in each of two paragraphs, filed at
 * the foot in reading order — which is what the writer would have today.
 *
 * The marker order is `1 2 3 4` = foot, end, foot, end, so a grouping that
 * ignored reading order and a reading order that ignored grouping produce
 * visibly different lists. A document where the two rules agree would prove
 * nothing about either.
 */
const SEFER = doc(
  'אלף#הערה_בשם("1") בית#הערה_בשם("2", סוג: הערתסיום).',
  "",
  'גימל#הערה_בשם("3") דלת#הערה_בשם("4", סוג: הערתסיום).',
  "",
  '#גוף_הערה("1")[ראשונה בשוליים]',
  '#גוף_הערה("2")[ראשונה בסוף]',
  '#גוף_הערה("3")[שניה בשוליים]',
  '#גוף_הערה("4")[שניה בסוף]',
);

export async function run() {
  // -------------------------------------------------------- what it is today

  {
    check("a body knows which apparatus it belongs to", blocks(SEFER), [
      "הערה",
      "הערתסיום",
      "הערה",
      "הערתסיום",
    ]);
    // The default is unchanged, which is the point of it being a setting: a
    // writer who never opens the settings sees exactly what they saw before.
    check("ungrouped, the list is left in reading order", bodies(sortBodies(SEFER).text), [
      "ראשונה בשוליים",
      "ראשונה בסוף",
      "שניה בשוליים",
      "שניה בסוף",
    ]);
    notOk("...and nothing is written above it", sortBodies(SEFER).text.includes("——"));
  }

  // ------------------------------------------------- grouped, and still sorted

  {
    const out = sortBodies(SEFER, true).text;
    check("grouped, each apparatus keeps its own block", blocks(out), [
      "הערה",
      "הערה",
      "הערתסיום",
      "הערתסיום",
    ]);
    // **The constraint the item states in the same breath.** Grouping is a
    // *first* key, not a replacement: inside each block the bodies are still in
    // the order a reader meets their markers.
    check("...in reading order inside it", bodies(out), [
      "ראשונה בשוליים",
      "שניה בשוליים",
      "ראשונה בסוף",
      "שניה בסוף",
    ]);
  }

  {
    const out = sortBodies(SEFER, true).text;
    ok("each block is named", out.includes("—— הערה ——"));
    ok("...including the second", out.includes("—— הערתסיום ——"));
    check("...once each", out.split("——").length - 1, 4);
    // The separator prints nothing. A heading would be on the page and a
    // `#גופי_הערות` region is an engine construct with meaning; a comment is
    // the only thing in this language addressed to the person reading the
    // source and to nobody else, which is exactly what this is.
    ok("...and says nothing to the compiler", out.includes("// —— "));
  }

  {
    // Running the tidy twice is one separator per block, not two. A tidy that
    // accumulates litter is one nobody trusts twice.
    const once = sortBodies(SEFER, true).text;
    const twice = sortBodies(once, true).text;
    check("the tidy is idempotent", twice, once);
  }

  {
    // And turning it back off takes the headings with it, whole line included —
    // otherwise the writer is left with a run of blank lines where the blocks
    // had been.
    const grouped = sortBodies(SEFER, true).text;
    const back = sortBodies(grouped, false).text;
    notOk("turning it off leaves no separators", back.includes("——"));
    check("...and puts the list back in reading order", bodies(back), [
      "ראשונה בשוליים",
      "ראשונה בסוף",
      "שניה בשוליים",
      "שניה בסוף",
    ]);
  }

  {
    // The blocks are in reading order too — the apparatus whose first marker
    // appears first comes first. Any fixed precedence would be a decision this
    // module is not entitled to make: there is no natural order between a
    // footnote and an endnote, and one would shuffle somebody's file for a
    // reason nobody can see on the page.
    const other = doc(
      'אלף#הערה_בשם("1", סוג: הערתסיום) בית#הערה_בשם("2").',
      "",
      '#גוף_הערה("1")[בסוף]',
      '#גוף_הערה("2")[בשוליים]',
    );
    check("the blocks follow the order a reader meets them", blocks(sortBodies(other, true).text), [
      "הערתסיום",
      "הערה",
    ]);
  }

  {
    // A body whose marker is gone has no place in the reading order, and
    // inventing a block for it would move somebody's text on a guess. It keeps
    // the end of the list and gets no heading of its own; the lint already says
    // what is wrong with it, on its own line.
    const orphaned = doc(
      'אלף#הערה_בשם("1").',
      "",
      '#גוף_הערה("1")[יש לה סימן]',
      '#גוף_הערה("9")[אין לה סימן]',
    );
    const out = sortBodies(orphaned, true).text;
    check("an orphan keeps the end of the list", bodies(out), ["יש לה סימן", "אין לה סימן"]);
    check("...and is given no block of its own", out.split("——").length - 1, 2);
  }

  // ------------------------------- the half that makes the setting true tomorrow

  {
    // > *"The insertion logic must know about the grouping too, or the setting
    // > is true only until the writer adds a note."*
    //
    // A new footnote whose marker is in the *first* paragraph belongs at the
    // head of the footnote block — not at the head of the whole list, which is
    // where reading order alone would put it, and not at the end, which is
    // where appending would.
    const grouped = sortBodies(SEFER, true).text;
    const withMarker = grouped.replace('אלף#הערה_בשם("1")', 'אלף#הערה_בשם("5") #הערה_בשם("1")');
    const filed = fileNewBody(withMarker, '#גוף_הערה("5")[חדשה בשוליים]', "5", true);
    check("a new body lands inside its own block", blocks(filed.text), [
      "הערה",
      "הערה",
      "הערה",
      "הערתסיום",
      "הערתסיום",
    ]);
    check("...at the place its marker puts it", bodies(filed.text)[0], "חדשה בשוליים");
  }

  {
    // The same insertion with the setting off is the behaviour that shipped:
    // reading order across the whole list, blocks or no blocks.
    const withMarker = SEFER.replace('אלף#הערה_בשם("1")', 'אלף#הערה_בשם("5") #הערה_בשם("1")');
    const filed = fileNewBody(withMarker, '#גוף_הערה("5")[חדשה בשוליים]', "5", false);
    check("ungrouped, it lands in reading order among them all", bodies(filed.text)[0], "חדשה בשוליים");
    check("...and the rest are untouched", blocks(filed.text), [
      "הערה",
      "הערה",
      "הערתסיום",
      "הערה",
      "הערתסיום",
    ]);
  }

  {
    // The first body of an apparatus that has none yet: there is no neighbour
    // inside the block to file it beside, so the answer comes from the block
    // order — after everything in the earlier blocks, before everything in the
    // later ones.
    const grouped = sortBodies(SEFER, true).text;
    const withMarker = grouped.replace(
      'גימל#הערה_בשם("3")',
      'גימל#הערה_בשם("6", סוג: מדור_א) #הערה_בשם("3")',
    );
    const filed = fileNewBody(withMarker, '#גוף_הערה("6")[במדור]', "6", true);
    const got = blocks(filed.text);
    check("a block with nothing in it yet still gets its body together", got.length, 5);
    ok(
      "...and the new apparatus is not scattered through the others",
      got.indexOf("מדור_א") === got.lastIndexOf("מדור_א"),
    );
  }
}
