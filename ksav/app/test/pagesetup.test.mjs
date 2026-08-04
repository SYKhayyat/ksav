// Page setup as a property of the document, not of the application (B26).
//
// > *"Direction, font, margins and paper live in settings, so opening an English
// > document and then a Hebrew one means changing direction by hand. Loading a
// > template does it for you, which papers over the seam."*
//
// `fixes.md` had already called making page setup a property of the document
// *"the real fix and a larger change than anything in this file"*, and it is the
// one that has to exist before anybody keeps twenty documents in the library.
//
// The whole of it comes down to one function of two arguments — what this
// document says about itself, over a default for everything it does not — which
// is why it can be held here rather than by opening two documents and looking.

import { check, ok, notOk } from "./harness.mjs";
import { pageSetup, defaultPageSetup, PAGE_FIELDS } from "../.tmp-test/settings.mjs";

export function run() {
  const shipped = defaultPageSetup();

  // ---------------------------------------------------------------- the migration
  //
  // A document saved before B26 says nothing about its own layout, and is laid out
  // the shipped way. **Not** by whatever the app's settings happen to say now:
  // that would mean the same file rendering differently on two machines, which is
  // this bug with a nicer face on it. Everything in a page setup is one panel away
  // from being changed.
  check("a document that says nothing is laid out the shipped way", pageSetup(undefined, shipped), shipped);
  check("and so is one whose setup is empty", pageSetup({}, shipped), shipped);

  // ---------------------------------------------------------------- what it says
  {
    const english = pageSetup({ dir: "ltr", lang: "en" }, shipped);
    check("a document that says it is left-to-right is", english.dir, "ltr");
    // Field by field, not all-or-nothing: a document that only ever said *ltr*
    // keeps following the shipped font rather than losing every other field.
    check("…and still follows the default for everything else", english.font, shipped.font);
    check("…including its paper", english.paper, shipped.paper);
  }

  // The two values that would be lost by a truthiness check, and both are things a
  // writer sets on purpose: a document with **no** header, and one with no indent.
  {
    const bare = pageSetup({ header: "", first_line_indent_em: 0 }, { ...shipped, header: "ברכות", first_line_indent_em: 1.5 });
    check("an empty header is a header a writer removed", bare.header, "");
    check("and a zero indent is an indent they set to zero", bare.first_line_indent_em, 0);
  }

  // ---------------------------------------------------------------- nothing is lost
  //
  // Every field of a compile config has to come out of this, or a document
  // compiles with a hole in it.
  {
    const full = {};
    for (const key of PAGE_FIELDS) full[key] = shipped[key];
    const out = pageSetup(full, shipped);
    for (const key of PAGE_FIELDS) {
      ok(`${key} survives`, out[key] === shipped[key]);
    }
  }

  // A page setup carrying a field nobody has heard of — a document written by a
  // newer Ksav, opened by an older one. It must not throw and must not lose the
  // fields it does understand.
  {
    const out = pageSetup({ dir: "ltr", somethingNewer: 7 }, shipped);
    check("a field from the future is ignored", out.dir, "ltr");
    notOk("and does not reach the compile config", "somethingNewer" in out);
  }

  // ---------------------------------------------------------------- not the app's
  //
  // The fields that are about the person and not the document stay out of this
  // entirely. A theme is not a property of a sefer.
  for (const key of ["theme", "zoom", "layout", "spellcheck", "previewSide"]) {
    notOk(`${key} is not page setup`, PAGE_FIELDS.includes(key));
  }

  // And the ones that are, are all here — the list is the split, so a field added
  // to one side and not the other is the drift this is meant to prevent.
  for (const key of ["font", "paper", "margin_cm", "dir", "columns", "header", "footer"]) {
    ok(`${key} is page setup`, PAGE_FIELDS.includes(key));
  }

  // ------------------------------------------------------- binding & two-sided
  //
  // How a sefer is bound, and what runs across the top of a left-hand page, are
  // facts about the sefer. They travel with the file for the same reason the
  // margin does.
  for (const key of [
    "two_sided", "margin_inner_cm", "margin_outer_cm", "gutter_cm",
    "header_odd", "header_even", "head_align", "title", "author", "pdf_standard",
  ]) {
    ok(`${key} is page setup`, PAGE_FIELDS.includes(key));
  }

  // "Just pages 4 to 9" is a property of one export, not of the document. Saving
  // it would mean a sefer that quietly exports three pages forever after.
  notOk("a page range is not page setup", PAGE_FIELDS.includes("pdf_pages"));

  {
    const bound = pageSetup(
      { two_sided: true, margin_inner_cm: 4, margin_outer_cm: 1.5, header_even: "ברכות" },
      shipped,
    );
    check("a bound sefer keeps its inner margin", bound.margin_inner_cm, 4);
    check("…and its verso running head", bound.header_even, "ברכות");
    check("…and still follows the default for the plain margin", bound.margin_cm, shipped.margin_cm);
  }

  // An unset per-edge margin means *follow the one margin*, which is not the same
  // as zero — so it must be absent from the shipped setup rather than defaulted.
  // If it were defaulted to 2.5, moving the single margin slider would stop
  // moving all four edges and nobody would be able to say why.
  notOk("the shipped setup does not pin the top edge", "margin_top_cm" in shipped);
  notOk("nor the inner edge", "margin_inner_cm" in shipped);
  check("but two-sided is a real, stated default", shipped.two_sided, false);

  {
    // A zero edge is a thing a writer set, and must survive the same way an empty
    // header does.
    const flush = pageSetup({ margin_outer_cm: 0 }, { ...shipped, margin_outer_cm: 2 });
    check("a zero outer margin is a margin a writer chose", flush.margin_outer_cm, 0);
  }
}
