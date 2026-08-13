import { check, ok } from "./harness.mjs";
import {
  DEFAULT_CHANNEL,
  PLACEMENTS,
  TIER_CHANNELS,
  channelLine,
  channelsIn,
  noteCounts,
  noteLine,
  regionLine,
  regionsIn,
  showRegionLine,
  usedChannels,
  writeChannel,
} from "../.tmp-test/channels.mjs";

// The editor's half of the channel model.
//
// The engine's half is `engine/tests/channels.rs`, which renders documents and
// asserts where the notes landed. This one asks the question the editor actually
// has to answer — *what channels does this document have, and what does each one
// do* — off the source, in both languages, without compiling anything.
//
// The pair matters more than either half: a panel that reads a channel one way
// and an engine that places it another is the failure family this repository
// keeps rebuilding, and `kindsAgree` below is the crossing point.

const channel = (doc, name) => channelsIn(doc).find((c) => c.name === name);

export async function run() {
  // ---------------------------------------------------------- the built-ins

  {
    const cs = channelsIn("טקסט");
    check(
      "channels: an empty document already has the seven tiers",
      cs.slice(0, TIER_CHANNELS.length).map((c) => c.name).join(","),
      TIER_CHANNELS.join(","),
    );
    check("channels: the default channel is native", channel("טקסט", DEFAULT_CHANNEL).kind, "native");
    check("channels: the default channel has no source", channel("טקסט", DEFAULT_CHANNEL).source, null);
    check("channels: tier two hangs off it", channel("טקסט", "הערה_ב").source, DEFAULT_CHANNEL);
    check("channels: and is native too", channel("טקסט", "הערה_ב").kind, "native");
  }

  // ------------------------------------------------------------ declarations

  {
    const doc = '#ערוץ("ביאור", מקור: "הערה", מיקום: "רגל")\nטקסט#הערה(ערוץ: "ביאור")[גוף]';
    const c = channel(doc, "ביאור");
    check("channels: a declared source is read", c.source, "הערה");
    check("channels: a declared placement is read", c.placement, "רגל");
    check(
      "channels: a channel on the default one, at the foot, is a tier of the native apparatus",
      c.kind,
      "native",
    );
    ok("channels: the declaration's position is reported", c.at && c.at.from === 0);
  }

  {
    // A *second* root channel at the page foot cannot join Typst's one balanced
    // series, so it is a fixed region there — which is what costs a reserve.
    const doc = '#ערוץ("מקורות", מיקום: "רגל")\nטקסט#הערה(ערוץ: "מקורות")[גוף]';
    check("channels: a second root at the foot is a region", channel(doc, "מקורות").kind, "foot");
    check("channels: and its own region is named after it", channel(doc, "מקורות").region, "מקורות");
  }

  {
    const doc = '#ערוץ("ביאור", מיקום: "סוף")\nטקסט#הערה(ערוץ: "ביאור")[גוף]';
    check("channels: a channel at the back is collected", channel(doc, "ביאור").kind, "collected");
  }

  {
    // A channel takes its region's placement. Asking the channel *and* the
    // region where the notes go is asking the same question twice and letting
    // the two answers disagree.
    const doc =
      '#אזור("פירושים", מיקום: "סוף")\n#ערוץ("ביאור", אזור: "פירושים")\nא#הערה(ערוץ: "ביאור")[גוף]';
    check("channels: a channel inherits its region's placement", channel(doc, "ביאור").placement, "סוף");
    check("channels: and is collected with it", channel(doc, "ביאור").kind, "collected");
    check("channels: the region is the one it was pointed at", channel(doc, "ביאור").region, "פירושים");
    check("channels: the region is listed", regionsIn(doc).map((r) => r.name).join(","), "פירושים");
  }

  {
    // A height with no region is the shortcut: one command makes both.
    const doc = '#ערוץ("ביאור", גובה: 3cm)\nא#הערה(ערוץ: "ביאור")[גוף]';
    check("channels: a declared height is read as written", channel(doc, "ביאור").height, "3cm");
    check("channels: and it is a page-foot region", channel(doc, "ביאור").kind, "foot");
  }

  {
    // The whole point of the model: this document is one word away from the
    // previous one and the apparatus is at the other end of the sefer.
    const notes = 'טקסט#הערה(ערוץ: "ביאור")[גוף]';
    const foot = `#ערוץ("ביאור", מיקום: "רגל")\n${notes}`;
    const back = `#ערוץ("ביאור", מיקום: "סוף")\n${notes}`;
    check("channels: placement is the only difference", channel(foot, "ביאור").kind, "foot");
    check("channels: …and it moves the apparatus", channel(back, "ביאור").kind, "collected");
    ok(
      "channels: not one note changed",
      foot.slice(foot.indexOf("טקסט")) === back.slice(back.indexOf("טקסט")),
    );
  }

  // -------------------------------------------------------------- both languages

  {
    const doc = '#channel("peirush", placement: "foot", height: 3cm)\ntext#fnote(channel: "peirush")[body]';
    const c = channel(doc, "peirush");
    check("channels: an English declaration is read", c.placement, "רגל");
    check("channels: including its height", c.height, "3cm");
    check("channels: and its kind", c.kind, "foot");
    check("channels: an English note names its channel", usedChannels(doc).join(","), "peirush");
  }

  {
    // An English command with a Hebrew value, which is the defect `_en_values`
    // exists to end — accepted, because that is what the prelude does.
    const doc = '#channel("peirush", placement: "רגל")\ntext#fnote(channel: "peirush")[body]';
    check("channels: a Hebrew value on an English command still reads", channel(doc, "peirush").placement, "רגל");
  }

  // ------------------------------------------------------------------ counting

  {
    const doc =
      'א#הערה[אחת] ב#הערה[שתיים] ג#הערה(ערוץ: "מקורות")[שלוש] ד#הערה_ב[ארבע]';
    const n = noteCounts(doc);
    check("channels: the default channel's notes are counted", n.get(DEFAULT_CHANNEL), 2);
    check("channels: a named channel's are its own", n.get("מקורות"), 1);
    check("channels: a tier command counts as its channel", n.get("הערה_ב"), 1);
  }

  {
    // A deferred marker takes the same argument, and a sefer whose notes
    // outweigh its text is written that way.
    const doc = 'א#הערה_בשם("1", ערוץ: "ביאור")\n#גוף_הערה("1")[גוף]';
    check("channels: a deferred marker names its channel", usedChannels(doc).join(","), "ביאור");
  }

  {
    // Off the one scanner: a channel named inside a comment is not a channel.
    const doc = '// #ערוץ("ביאור", מיקום: "סוף")\nטקסט';
    ok(
      "channels: a commented-out declaration declares nothing",
      !channelsIn(doc).some((c) => c.name === "ביאור"),
    );
  }

  // ------------------------------------------------------------------- writing

  {
    check(
      "channels: a declaration line, in Hebrew",
      channelLine("ביאור", { placement: "סוף" }),
      '#ערוץ("ביאור", מיקום: "סוף")',
    );
    check(
      "channels: …and in English, values included",
      channelLine("peirush", { placement: "סוף", height: "3cm" }, "en"),
      '#channel("peirush", placement: "document", height: 3cm)',
    );
    check(
      "channels: a region line",
      regionLine("פירושים", { placement: "רגל", height: "10%", layout: "צד" }),
      '#אזור("פירושים", מיקום: "רגל", גובה: 10%, פריסה: "צד")',
    );
    check(
      "channels: a region line in English",
      regionLine("peirushim", { placement: "רגל", layout: "צד" }, "en"),
      '#region("peirushim", placement: "foot", layout: "side")',
    );
    check("channels: the dump call", showRegionLine("פירושים"), '#הצג_אזור("פירושים")');
    check("channels: the dump call in English", showRegionLine("peirushim", "en"), '#show_region("peirushim")');
    check("channels: a note in the default channel is a plain note", noteLine(null), "#הערה[|]");
    check("channels: a note in a named channel names it", noteLine("ביאור"), '#הערה(ערוץ: "ביאור")[|]');
    check("channels: …in English", noteLine("peirush", "en"), '#fnote(channel: "peirush")[|]');
  }

  {
    const doc = 'טקסט#הערה(ערוץ: "ביאור")[גוף]';
    const added = writeChannel(doc, "ביאור", { placement: "סוף" });
    ok("channels: a new declaration goes to the top of the file", added.text.startsWith("#ערוץ("));
    check("channels: and the document is otherwise untouched", added.text.split("\n")[1], doc);
  }

  {
    // A field left alone keeps what the document said; the defect this guards
    // is a panel that writes one knob and wipes the three beside it.
    const doc = '#ערוץ("ביאור", מקור: "הערה", גובה: 2cm)\nטקסט';
    const moved = writeChannel(doc, "ביאור", { placement: "סוף" });
    ok("channels: rewriting a declaration keeps the source", moved.text.includes('מקור: "הערה"'));
    ok("channels: …and the height", moved.text.includes("גובה: 2cm"));
    ok("channels: …and applies the change", moved.text.includes('מיקום: "סוף"'));
    check("channels: exactly one declaration remains", moved.text.split("#ערוץ(").length - 1, 1);
  }

  {
    // …and `null` is a different instruction from "leave it alone".
    const doc = '#ערוץ("ביאור", מקור: "הערה")\nטקסט';
    const cleared = writeChannel(doc, "ביאור", { source: null });
    ok("channels: null clears a field", !cleared.text.includes("מקור"));
  }

  {
    const doc = '#channel("peirush", placement: "foot")\ntext';
    const moved = writeChannel(doc, "peirush", { placement: "סוף" }, "en");
    ok(
      "channels: an English document stays English when a control edits it",
      moved.text.includes('#channel("peirush", placement: "document")'),
    );
  }

  // ------------------------------------------------------------------ the axes

  ok("channels: three placements, not eighteen commands", PLACEMENTS.length === 3);
  ok(
    "channels: every placement round-trips through a written line",
    PLACEMENTS.every((p) => {
      const doc = channelLine("x", { placement: p }) + "\nא#הערה(ערוץ: \"x\")[גוף]";
      return channel(doc, "x").placement === p;
    }),
  );
  ok(
    "channels: …in English too",
    PLACEMENTS.every((p) => {
      const doc = channelLine("x", { placement: p }, "en") + "\na#fnote(channel: \"x\")[body]";
      return channel(doc, "x").placement === p;
    }),
  );
}
