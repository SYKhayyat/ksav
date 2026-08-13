// Which faces the panel offers, and where each one came from.
//
// > *"The font dropdown is ugly. Named plainly, recorded plainly."*
//
// It was not a dropdown: a free-text box with a `datalist` hint, so choosing a
// font meant typing a family name exactly right — and a family name is a string
// only the font file knows. Typed wrong, nothing says so.
//
// The property this file exists for is the one a flat list could not have: every
// entry says **where it comes from**, which is the same question as *will this
// still resolve when somebody else opens the sefer*. That is what a writer
// sending a kovetz to a printer needs, and the text box could not even be asked.

import { check, ok } from "./harness.mjs";
import * as fonts from "../.tmp-test/fonts.mjs";
import { BUNDLED_FONTS, BUNDLED_NOTICES } from "../.tmp-test/engine.gen.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";

const ASSETS = [
  { name: "Vilna.ttf", kind: "font" },
  { name: "diagram.png", kind: "image" },
];

export async function run() {

// ---------------------------------------------------------------- the sources

{
  check("three, surest first", [...fonts.SOURCES], ["bundled", "document", "elsewhere"]);
  // Every group heading is a sentence in both languages. A group labelled with
  // a raw key is the failure this whole surface is a correction for.
  const keys = fonts.SOURCES.map((s) => `fontFrom.${s}`);
  check("each is translated in Hebrew", keys.filter((k) => !DICTS.he[k]), []);
  check("and in English", keys.filter((k) => !DICTS.en[k]), []);
}

// ---------------------------------------------------------------- a document's own

{
  check("a font asset is offered by its family, not its filename", fonts.documentFonts(ASSETS), ["Vilna"]);
  check("an image is not a font", fonts.documentFonts([{ name: "a.png", kind: "image" }]), []);
  check("no assets, no fonts", fonts.documentFonts(), []);
}

// ---------------------------------------------------------------- where one came from

{
  check(
    "a bundled family is bundled",
    fonts.sourceOf(BUNDLED_FONTS[0], BUNDLED_FONTS, ASSETS),
    "bundled",
  );
  check("an attached one travels with the document", fonts.sourceOf("Vilna", BUNDLED_FONTS, ASSETS), "document");
  // Not an error, and the honest word for it: Typst will find it here, and
  // nothing promises it is anywhere else.
  check("anything else is this machine's", fonts.sourceOf("Times New Roman", BUNDLED_FONTS, ASSETS), "elsewhere");
}

// ---------------------------------------------------------------- the list

{
  const options = fonts.fontOptions(BUNDLED_FONTS, ASSETS, "Times New Roman");
  const names = options.map((f) => f.name);
  ok("the bundled faces are in it", BUNDLED_FONTS.every((f) => names.includes(f)));
  ok("so is the document's own", names.includes("Vilna"));
  // The property that makes this a `<select>` at all: a control that cannot show
  // what is already chosen silently changes it the moment somebody opens the
  // panel.
  ok("and so is whatever is already chosen", names.includes("Times New Roman"));
  check("no duplicates", names.length, new Set(names).size);
}

{
  // Choosing a bundled face must not put a second copy of it in the list under
  // "this machine" — the current family is added with the source it really has.
  const options = fonts.fontOptions(BUNDLED_FONTS, ASSETS, BUNDLED_FONTS[0]);
  check(
    "a chosen bundled face appears once, as bundled",
    options.filter((f) => f.name === BUNDLED_FONTS[0]),
    [{ name: BUNDLED_FONTS[0], source: "bundled" }],
  );
  const own = fonts.fontOptions(BUNDLED_FONTS, ASSETS, "Vilna");
  check(
    "and a chosen attached one, as the document's",
    own.filter((f) => f.name === "Vilna"),
    [{ name: "Vilna", source: "document" }],
  );
}

{
  // Nothing chosen yet is not an empty row in the list.
  const names = fonts.fontOptions(BUNDLED_FONTS, [], "").map((f) => f.name);
  check("an empty family adds nothing", names.filter((n) => !n), []);
  check("and the bundled ones are all there is", names, [...BUNDLED_FONTS]);
}

// ---------------------------------------------------------------- the groups

{
  const groups = fonts.fontGroups(fonts.fontOptions(BUNDLED_FONTS, ASSETS, "Times New Roman"));
  check("all three, in order", groups.map((g) => g.source), ["bundled", "document", "elsewhere"]);
  check("every option lands in exactly one", groups.reduce((n, g) => n + g.fonts.length, 0),
    fonts.fontOptions(BUNDLED_FONTS, ASSETS, "Times New Roman").length);
  // An empty group is not drawn: a heading with nothing under it reads as a list
  // that failed to load.
  const plain = fonts.fontGroups(fonts.fontOptions(BUNDLED_FONTS, [], BUNDLED_FONTS[0]));
  check("a document with no fonts of its own gets one group", plain.map((g) => g.source), ["bundled"]);
}

// ---------------------------------------------------------------- what is offered

{
  // The list is the engine's own, filtered by `selectable` — which is why the
  // maths font is not in it. NewCM Math carries an OpenType MATH table and no
  // Hebrew letters, so offering it here would be offering a way to typeset a
  // sefer in a font with nothing to set it in.
  const maths = BUNDLED_NOTICES.find((n) => n.name.includes("Math"));
  ok("the maths font is notified", !!maths);
  check("and is not offered as a body face", BUNDLED_FONTS.includes(maths.name), false);
  ok("there is something to choose", BUNDLED_FONTS.length > 0);
}

}
