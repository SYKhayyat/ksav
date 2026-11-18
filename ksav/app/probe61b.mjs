import { plan } from "./.tmp-test/insert.mjs";
import { tieredNoteAt, noteFor } from "./.tmp-test/notes.mjs";
for (const lang of ["he", "en"]) {
  for (const depth of [0, 1, 2]) {
    const doc = "#הערה[א".repeat(depth) + "prose |" + "]".repeat(depth);
    const pos = doc.indexOf("|");
    const snippet = tieredNoteAt(doc, pos, lang);
    const p = plan(doc, pos, pos, "", snippet);
    console.log(lang, "depth", depth, snippet, "->", p.kind, p.head ? "HEAD" : "no-head");
  }
}
