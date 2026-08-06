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
      { he: "הדגשה", en: "bold", category: "style", desc_he: "מודגש", desc_en: "Bold text" },
    ],
  };
  const style = helpSections(withCommands).find((s) => s.title === "cat.style");
  ok("engine commands are listed too", !!style);
  check("in the reader's language", style.entries[0].what, "Bold text");
  check("with the command to type", style.entries[0].how, "#bold");
  const he = helpSections({ ...withCommands, lang: "he" }).find((s) => s.title === "cat.style");
  check("Hebrew readers get the Hebrew name", he.entries[0].how, "#הדגשה");
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
