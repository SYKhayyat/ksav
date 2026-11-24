// The icons Tabler does not have: the Torah terms (`docs/ui-architecture.md` §10).
//
// Drawn on Tabler's grid — 24 units, 2-unit round stroke, nothing filled — so a
// row that mixes the two cannot be told apart by weight. The shapes are the
// thing itself where it has a shape (an aleph, a sof pasuk, a daf of gemara with
// its commentary around it) and a page with its marks where it does not (siman,
// seif, a dibur hamaschil).

type Nodes = readonly (readonly [string, Readonly<Record<string, string>>])[];

const path = (d: string) => ["path", { d }] as const;
const dot = (cx: number, cy: number) => ["circle", { cx: String(cx), cy: String(cy), r: "1" }] as const;

export const KSAV_ICONS: Readonly<Record<string, Nodes>> = {
  /** סימן: a page whose first line is a heading. */
  siman: [path("M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1z"), path("M9 7h6"), path("M9 7.5h6"), path("M8 11h8"), path("M8 14h8"), path("M8 17h5")],
  /** סעיף: a page with an indented paragraph under its heading. */
  seif: [path("M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1z"), path("M8 7h8"), path("M8 11h5"), path("M10 14h6"), path("M10 17h6")],
  /** אות: an aleph. */
  ot: [path("M7 5l10 14"), path("M15 5c0 3 -1 4.5 -3.5 5"), path("M9 19c0 -3 1 -4.5 3.5 -5")],
  /** דיבור המתחיל: the opening words heavy, the rest of the line light. */
  dibur: [path("M4 8h6"), path("M4 9h6"), path("M13 8.5h7"), path("M4 13h16"), path("M4 17h11")],
  /** מראה מקום: a place in brackets. */
  mareh: [path("M8 5h-3v14h3"), path("M16 5h3v14h-3"), ["circle", { cx: "12", cy: "12", r: "2" }] as const],
  /** גמרא: an open daf, the text in the middle and commentary on both sides. */
  gemara: [path("M3 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0 -2 -2h-7z"), path("M21 5h-7a2 2 0 0 0 -2 2v12a2 2 0 0 1 2 -2h7z"), path("M6 9h3"), path("M6 12h3"), path("M15 9h3"), path("M15 12h3")],
  /** פסוק: a line ending in a sof pasuk. */
  pasuk: [path("M4 12h11"), dot(19, 9), dot(19, 15)],
  /** הערה: a word with its mark, and the note under the line. */
  note: [path("M4 10h10"), path("M17 4v5"), path("M15.5 5.5l1.5 -1.5"), path("M4 16h16"), path("M4 20h8")],
  /** הערה בדרגה: notes on two tiers. */
  tiered: [path("M4 7h12"), path("M18 4v4"), path("M4 13h16"), path("M4 17h10"), path("M7 20h10")],
  /** ניקוד: an aleph with a kamatz under it. */
  nikud: [path("M7 3l10 13"), path("M15 3c0 2.5 -1 4 -3.5 4.5"), path("M9 16c0 -2.5 1 -4 3.5 -4.5"), path("M9 20h6"), path("M12 20v1.5")],
};
