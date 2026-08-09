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

import { GIRSA } from "./names";

/** What was being attempted when the error was caught.
 *
 *  Needed because "what failed in the writer's words" cannot be written without
 *  knowing what was being tried: a timeout reaching Girsa and a timeout writing a
 *  file are the same `io::Error` and two entirely different things to be told. */
export type Doing = "compile" | "save_file" | "reach_girsa" | "linkify" | "general";

const DOING: Record<Doing, { he: string; en: string }> = {
  compile: { he: "ההידור", en: "the compile" },
  save_file: { he: "השמירה לקובץ", en: "saving to the file" },
  reach_girsa: { he: `הקשר עם ${GIRSA}`, en: "reaching Girsa" },
  linkify: { he: "סימון המקורות", en: "marking the citations" },
  general: { he: "הפעולה", en: "the operation" },
};

/**
 * The refusals `girsa-post` makes on purpose, by the **name** Rust puts on them.
 *
 * `PostError::code()`, printed as `post-not-running: ksav is not running`. These
 * three used to be matched by regular expression against the English prose of a
 * `Display` impl in another repository — and so did Girsa's frontend, with four
 * character-identical regexes. Every word of `girsa-post`'s error strings was
 * load-bearing API between two repositories, in the crate that exists so the two
 * sides need not agree in prose.
 *
 * Girsa had already written and tested this exact fix for its *own* error type
 * (`girsa_app::trouble::Code`, and a test asserting *"rewording the prose
 * changes nothing a reader sees"*). It had never been applied to the one type
 * that actually crosses.
 *
 * `POST_CODES` in `engine.gen.ts` is `PostError::CODES`, and
 * `diagnostics.test.mjs` fails if a code Rust can send has no line here.
 */
const CODED: Record<string, { he: (d: { he: string }) => string; en: (d: { en: string }) => string }> = {
  // Girsa is simply not open. Not a fault.
  "post-not-running": {
    he: () => `${GIRSA} אינה פועלת — פתחו אותה ונסו שוב`,
    en: () => "Girsa isn't running — open it and try again",
  },
  // The endpoint file outlived the listener.
  "post-unreachable": {
    he: (d) => `${d.he} לא נענה בזמן — ייתכן שהיישום נסגר שלא כשורה`,
    en: (d) => `${d.en} did not answer in time — the other application may have closed badly`,
  },
  // It answered, and said no.
  "post-refused": {
    he: (d) => `${d.he} נדחה על ידי הצד השני`,
    en: (d) => `${d.en} was refused by the other side`,
  },
};

/** What Rust put in front of the colon, if it is a name this file knows. */
function codeOf(detail: string): string | undefined {
  const at = detail.indexOf(": ");
  if (at <= 0) return undefined;
  const name = detail.slice(0, at);
  return name in CODED ? name : undefined;
}

/**
 * The failures this application does **not** own.
 *
 * A browser `NotAllowedError`, an `os error 2`, a quota. Matching somebody
 * else's words is the only thing available for these, and that is honest —
 * unlike doing it to a sibling's error type, which is what `CODED` above ended.
 *
 * `PostError::Io` and `::Json` are deliberately uncoded and land here, because
 * the distinction a reader needs — permission against not-found — lives in the
 * operating system's own string and nowhere else.
 */
const TROUBLES: { match: RegExp; he: (d: { he: string }) => string; en: (d: { en: string }) => string }[] = [
  {
    match: /connection refused|actively refused/i,
    he: (d) => `${d.he} נדחה על ידי הצד השני`,
    en: (d) => `${d.en} was refused by the other side`,
  },
  {
    // A timeout that is *not* `PostError::Unreachable` — a browser fetch, a
    // socket the operating system gave up on. The post's own timeout is
    // `post-unreachable` above; this is what is left, and it is genuinely
    // somebody else's prose.
    match: /timed out|timeout|etimedout/i,
    he: (d) => `${d.he} לא נענה בזמן`,
    en: (d) => `${d.en} did not answer in time`,
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
  // The name first, and the words only if there is no name. A refusal the
  // sibling made on purpose carries one; a refusal from the operating system or
  // the browser does not.
  const code = codeOf(detail);
  if (code) {
    const said = CODED[code];
    if (said) return { said: `${said.he(d)}  ·  ${said.en(d)}`, detail };
  }
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
