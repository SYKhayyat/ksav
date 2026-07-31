// Turning what the engine reports into something a writer can act on.
//
// **The compiler half of this module has moved.** It used to rephrase Typst's own
// diagnostics here — `unknown variable: הדגשה` into a sentence, the forty-item
// paper-size enumeration into the four in the menu — which meant the wasm
// backend, the Tauri backend and `ksav serve` each depended on this one front end
// to make their output legible, and anything else talking to `/compile` got
// Typst's raw English. It lives in `engine/src/diagnostics.rs` now, beside the
// span it needs, the prelude it has to subtract and the 104-entry registry that
// answers *did you mean*. Two mechanisms for one job is how the wrong one ends up
// on the flagship question, so there is one, and it is the one that also has the
// line number.
//
// What is left here is the half that never existed: a *caught* error. Six sites
// did `${t("saveFailed")} — ${String(e)}` — a translated label with an
// untranslated browser or Rust `Error` glued on — and one showed nothing but the
// English. Same rule as the engine's: the sentence is the reader's, the machine's
// string is behind the details affordance, and it is never the sentence.

/** What was being attempted when the error was caught.
 *
 *  Needed because "what failed in the writer's words" cannot be written without
 *  knowing what was being tried: a timeout reaching Girsa and a timeout writing a
 *  file are the same `io::Error` and two entirely different things to be told. */
export type Doing = "compile" | "save_file" | "reach_girsa" | "linkify" | "general";

const DOING: Record<Doing, { he: string; en: string }> = {
  compile: { he: "ההידור", en: "the compile" },
  save_file: { he: "השמירה לקובץ", en: "saving to the file" },
  reach_girsa: { he: "הקשר עם גִּרְסָא", en: "reaching Girsa" },
  linkify: { he: "סימון המקורות", en: "marking the citations" },
  general: { he: "הפעולה", en: "the operation" },
};

const TROUBLES: { match: RegExp; he: (d: { he: string }) => string; en: (d: { en: string }) => string }[] = [
  {
    // `PostError::NotRunning` — Girsa is simply not open. Not a fault.
    match: /\bis not running\b/i,
    he: () => "גִּרְסָא אינה פועלת — פתחו אותה ונסו שוב",
    en: () => "Girsa isn't running — open it and try again",
  },
  {
    // `PostError::Unreachable` — the endpoint file outlived the listener.
    match: /could not reach|timed out|timeout/i,
    he: (d) => `${d.he} לא נענה בזמן — ייתכן שהיישום נסגר שלא כשורה`,
    en: (d) => `${d.en} did not answer in time — the other application may have closed badly`,
  },
  {
    match: /refused it\b|connection refused|actively refused/i,
    he: (d) => `${d.he} נדחה על ידי הצד השני`,
    en: (d) => `${d.en} was refused by the other side`,
  },
  {
    match: /failed to fetch|networkerror|load failed/i,
    he: (d) => `${d.he} לא הגיע לשרת — בדקו שהמנוע פועל`,
    en: (d) => `${d.en} never reached the server — check the engine is running`,
  },
  {
    match: /notallowederror|permission denied|access is denied/i,
    he: (d) => `${d.he} נמנעה — אין הרשאה לקובץ`,
    en: (d) => `${d.en} was blocked — no permission for the file`,
  },
  {
    match: /notfounderror|no such file|os error 2\b/i,
    he: (d) => `${d.he} נכשלה — הקובץ אינו נמצא במקום שנרשם`,
    en: (d) => `${d.en} failed — the file is not where it was recorded`,
  },
  {
    match: /quotaexceeded/i,
    he: (d) => `${d.he} נכשלה — אין מקום פנוי באחסון`,
    en: (d) => `${d.en} failed — there is no storage space left`,
  },
];

export interface Trouble {
  /** The bilingual sentence. Always present. */
  said: string;
  /** The machine's own string, for the details affordance. Never the message. */
  detail: string;
}

/** Whatever a `catch` caught, as something a writer can act on. */
export function troubleSaid(e: unknown, doing: Doing = "general"): Trouble {
  const detail = rawOf(e);
  const d = DOING[doing] ?? DOING.general;
  for (const fam of TROUBLES) {
    if (fam.match.test(detail)) return { said: `${fam.he(d)}  ·  ${fam.en(d)}`, detail };
  }
  // Unrecognised: still name what failed, still say where the rest of it is.
  return {
    said: `${d.he} נכשלה · פרטים בהצבה על ההודעה  ·  ${d.en} failed · details on hover`,
    detail,
  };
}

/** The machine's own string, however the error arrived. */
export function rawOf(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
