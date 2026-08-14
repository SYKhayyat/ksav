import { check, ok, notOk } from "./harness.mjs";
import { helpSections, search, documentedIds } from "../.tmp-test/help.mjs";
import { STRUCTURE_ACTIONS } from "../.tmp-test/structure.mjs";
import { DEFAULT_KEYS } from "../.tmp-test/bindings.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";

// Help is a projection of the registries, so the test that earns its keep is
// coverage: an operation that exists and appears in no section is an operation
// nobody can be told about, which is this codebase's oldest bug wearing a
// documentation hat.

const t = (k) => DICTS.en[k] ?? k;
const base = { t, keys: { ...DEFAULT_KEYS }, lang: "en" };

export async function run() {

// ---------------------------------------------------------------- coverage

{
  const ids = documentedIds(helpSections(base));
  const missing = STRUCTURE_ACTIONS.filter((a) => !ids.has(a.id)).map((a) => a.id);
  check("every structural operation is documented", missing, []);
}

{
  const ids = documentedIds(helpSections(base));
  const missing = Object.keys(DEFAULT_KEYS).filter((id) => !ids.has(id));
  check("every shipped keybinding is documented", missing, []);
}

{
  // Nothing may reach the reader as a raw i18n key.
  //
  // Three assertions, not 285. This was a loop over 5 sections × 140 entries
  // asserting the same two predicates one entry at a time, which is 92% of this
  // file's assertion count and one fact: *no entry is untranslated*. A `filter`
  // says it once and says it better, because when it fails it names every
  // offender at once instead of stopping at whichever one the loop reached
  // first. Assertion counts are not coverage, and this file was the clearest
  // case of the two being confused in the suite.
  const sections = helpSections(base);
  check(
    "every section title is translated",
    sections.filter((s) => !DICTS.en[s.title] && !s.title.includes(".")).map((s) => s.title),
    [],
  );
  const entries = sections.flatMap((s) => s.entries.map((e) => ({ ...e, section: s.title })));
  ok("there are entries to check", entries.length > 100);
  check(
    "no entry reaches the reader as a raw i18n key",
    entries.filter((e) => /^[a-z]+\.[a-zA-Z]+$/.test(e.what)).map((e) => `${e.section}: ${e.what}`),
    [],
  );
  check(
    "and every entry says how to do the thing",
    entries.filter((e) => !e.how.length).map((e) => `${e.section}: ${e.what}`),
    [],
  );
}

// ---------------------------------------------------------------- it tells the truth

{
  // A rebound key is documented as the key it now is. Help showing the shipped
  // binding to somebody who changed it is worse than none: it is confidently
  // wrong, and costs the reader the time to disbelieve it.
  const rebound = { ...base, keys: { ...DEFAULT_KEYS, bold: "Mod-Shift-9" } };
  const flat = helpSections(rebound).flatMap((s) => s.entries);
  const bold = flat.find((e) => e.id === "bold");
  check("the writer's own binding is what is shown", bold.how, "Ctrl+Shift+9");
}

{
  // An action the writer has unbound entirely is not documented as having a key.
  const unbound = { ...base, keys: { ...DEFAULT_KEYS, bold: "" } };
  const flat = helpSections(unbound).flatMap((s) => s.entries);
  const inShortcuts = helpSections(unbound)
    .find((s) => s.title === "helpShortcuts")
    .entries.some((e) => e.id === "bold");
  notOk("an unbound action has no shortcut row", inShortcuts);
  ok("but it is still reachable elsewhere if it is structural", flat.length > 0);
}

{
  // The same argument, one step further. A key the writer *rebound* is wrong to
  // print; a key an editing mode has taken is wrong in the identical way and
  // was printed for far longer, because `buildShortcutKeymap` installs nothing
  // at all while Vim or Emacs is on. Help that prints `Ctrl+B` to somebody in
  // Emacs mode is help that has never been tried in Emacs mode.
  const inEmacs = helpSections({ ...base, mode: "emacs" }).flatMap((s) => s.entries);
  check("under a mode, help says what to type", inEmacs.find((e) => e.id === "bold").how, "M-x bold");
  const inVim = helpSections({ ...base, mode: "vim" }).flatMap((s) => s.entries);
  check("…and vim gets vim's colon", inVim.find((e) => e.id === "bold").how, ":bold");
  // A structural row falls back to the ribbon glyph when there is no key. Under
  // a mode there is always something to type, so the glyph gives way to it —
  // the reader who came to this page asking "how do I do that from the
  // keyboard" gets an answer rather than a picture of a button.
  const structural = inEmacs.find((e) => e.id.startsWith("table."));
  ok("a structural row names its command too", structural.how.startsWith("M-x "), structural.how);
}

// ---------------------------------------------------------------- the sections

{
  const titles = helpSections(base).map((s) => s.title);
  ok("shortcuts come first", titles[0] === "helpShortcuts");
  for (const want of ["structure.list", "structure.table", "structure.heading", "helpHydras"]) {
    ok(`${want} has a section`, titles.includes(want));
  }
  notOk("an empty section is not shown", titles.includes("macros"));
}

{
  const withMacros = {
    ...base,
    macros: [{ id: "m1", name: "Rashi note", steps: [{ kind: "text", text: "רש״י" }] }],
  };
  const macros = helpSections(withMacros).find((s) => s.title === "macros");
  ok("a recorded macro is documented", !!macros);
  check("by name", macros.entries[0].what, "Rashi note");
  ok("and by what it does when it has no key", macros.entries[0].how.includes("רש״י"));
}

{
  const withCommands = {
    ...base,
    commands: [
      {
        he: "הדגשה",
        en: "bold",
        category: "style",
        desc_he: "מודגש",
        desc_en: "Bold text",
        insert: "#הדגשה[|]",
      },
    ],
  };
  const style = helpSections(withCommands).find((s) => s.title === "cat.style");
  ok("engine commands are listed too", !!style);
  check("in the reader's language", style.entries[0].what, "Bold text");
  check("with the command to type", style.entries[0].how, "#bold");
  const he = helpSections({ ...withCommands, lang: "he" }).find((s) => s.title === "cat.style");
  check("Hebrew readers get the Hebrew name", he.entries[0].how, "#הדגשה");
}

// ---------------------------------------------------------------- it can be used
//
// *"Help entries should be clickable."* Help could tell you that Ctrl+Shift+F
// makes a footnote and could not make one — a page about the product rather than
// a part of it. Every entry that names something runnable now carries what to
// run, in the same `RowAction` vocabulary the palette and the panels speak.

{
  const withEverything = {
    ...base,
    macros: [{ id: "m1", name: "Rashi note", steps: [{ kind: "text", text: "רש״י" }] }],
    commands: [
      {
        he: "הדגשה",
        en: "bold",
        category: "style",
        desc_he: "מודגש",
        desc_en: "Bold text",
        insert: "#הדגשה[|]",
      },
    ],
  };
  const sections = helpSections(withEverything);
  const by = (title) => sections.find((s) => s.title === title);

  check(
    "a shortcut runs its action",
    by("helpShortcuts").entries.find((e) => e.id === "bold").does,
    { kind: "action", id: "bold" },
  );
  check(
    "a structural operation runs its action",
    by("structure.table").entries[0].does.kind,
    "action",
  );
  check("a hydra entry runs its action", by("helpHydras").entries[0].does.kind, "action");
  check("a macro runs itself", by("macros").entries[0].does, { kind: "action", id: "macro.m1" });
  check("a command inserts itself", by("cat.style").entries[0].does, {
    kind: "insert",
    snippet: "#הדגשה[|]",
  });

  // The legend is the exception, and deliberately: a wedge in the gutter is a
  // thing to recognise, not a thing to run, and a button that does nothing would
  // be worse than the text it replaced.
  check(
    "the marks legend runs nothing",
    by("helpMarks").entries.filter((e) => e.does).map((e) => e.what),
    [],
  );

  // Every entry outside the legend has somewhere to go. The point of the fence:
  // a section added later without a `does` is a section of dead rows.
  check(
    "and nothing else is a dead row",
    sections
      .filter((s) => s.title !== "helpMarks")
      .flatMap((s) => s.entries.filter((e) => !e.does).map((e) => `${s.title}: ${e.what}`)),
    [],
  );

  // Every action a help entry offers to run must be an id something answers to.
  // A `does` naming an operation that does not exist is a button that fails
  // silently, which is the family this whole surface is a correction for.
  const known = new Set([
    ...Object.keys(DEFAULT_KEYS),
    ...STRUCTURE_ACTIONS.map((a) => a.id),
    "macro.m1",
  ]);
  check(
    "every action it offers is one that exists",
    sections
      .flatMap((s) => s.entries)
      .filter((e) => e.does?.kind === "action" && !known.has(e.does.id))
      .map((e) => e.does.id),
    [],
  );
}

// ---------------------------------------------------------------- search

{
  const all = helpSections(base);
  const hits = search(all, "column");
  ok("a search finds something", hits.length > 0);
  ok("every hit matches", hits.every((s) => s.entries.every((e) =>
    e.what.toLowerCase().includes("column") || e.how.toLowerCase().includes("column"))));
  ok("empty sections are dropped from the results", hits.every((s) => s.entries.length > 0));
  check("an empty query changes nothing", search(all, "  ").length, all.length);
  check("a query that matches nothing gives nothing", search(all, "zzzz").length, 0);
  ok("searching by key works too", search(all, "ctrl+b").length > 0);
}

}
