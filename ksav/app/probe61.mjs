import { noteFor, tieredNoteAt } from "./.tmp-test/notes.mjs";
for (const lang of ["he", "en"]) {
  for (const depth of [0, 1]) {
    const doc = depth === 0 ? "prose |" : "#הערה[outer |]";
    const pos = doc.indexOf("|");
    const snippet = tieredNoteAt(doc, pos, lang);
    const card = noteFor(snippet);
    console.log(lang, "depth", depth, "->", snippet, "->", card ? card.pick.kind : "NULL");
  }
}
console.log("en tier2 direct:", JSON.stringify(noteFor("#tier2[|]")));
console.log("en fnote direct:", JSON.stringify(noteFor("#fnote[|]")));
