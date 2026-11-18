import { notesIn, noteAt, retargetNote } from "./.tmp-test/notes.mjs";
const doc = `פתיחה #הערה_בשם("1", סוג: "הערה")[עיין שם] סוף.

#גוף_הערה("1")[עיין שם]`;
const note = noteAt(doc, doc.indexOf("#הערה_בשם") + 2);
console.log(JSON.stringify(retargetNote(doc, note, { dest: "end", region: null }, "he").text));
