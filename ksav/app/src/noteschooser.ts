// ---------------------------------------------------------------- notes chooser
//
// One pick: where should the note print. `channels.ts` holds the six
// destinations and what each writes; `panelviews.notesPanel` asks the question;
// this connects the two and performs the answer.
//
// This file refuses to answer for: what one pick *writes* (`channels.ts` —
// `applyPick` is the one string in / one string out seam), and where a note's
// prose is *filed* when a pick sends it to a companion document — the errand
// runs here, but the library read and write behind it is `docs.ts`'s.

import * as panelviews from "./panelviews";
import * as runtime from "./runtime";
import { editDoc, setStatus, closeMenus } from "./runtime";
import { openPanel, closePanel } from "./panels";
import { t, tf } from "./i18n";
import { dirLang } from "./insert";
import { applyPick } from "./notes";
import { docTextOf, plainText } from "./spans";
import { setSafeSvg } from "./svgsafe";
import { docConfig } from "./settings";
import { settings } from "./settings";
import {
  PRESETS,
  caveatsFor,
  presetOf,
  regionsIn,
  samePick,
  setDeclaredArgs,
  type NotePick,
} from "./channels";
import { BODY_HOMES, defersBody, type BodyHome, type Errand } from "./deferred";
import * as docs from "./docs";
import { el } from "./dom";
import { scheduleCompile } from "./compile";
// ---------------------------------------------------------------- notes chooser
//
// One pick: where should the note print. `channels.ts` holds the six
// destinations and what each writes; `panelviews.notesPanel` asks the question;
// this connects the two and performs the answer.

export function openNotesChooser() {
  closeMenus();
  openPanel("notes-chooser");
}

export function closeNotesChooser() {
  closePanel("notes-chooser");
}

/**
 * Where the prose of a new note is written in the *file*.
 *
 * A separate question from where it prints, and deliberately not asked in the
 * chooser: the page is byte-identical whichever answer it gets, so it is a
 * preference about reading the source and it lives with the other document
 * preferences. See `deferred.BODY_HOMES`.
 *
 * Persisted, not session-scoped: somebody who writes their note bodies at the
 * end of the file writes *every* note that way, and having to re-answer after
 * each reload is how an answer stops being believed.
 */
export function bodyHome(): BodyHome {
  const held = settings.noteBodyHome;
  if (held && (BODY_HOMES as readonly string[]).includes(held)) return held as BodyHome;
  // The old boolean, still honoured. `deferNoteBodies` was this preference when
  // it had two answers, and a writer who set it does not have to set it again.
  return settings.deferNoteBodies === true ? "file" : "inline";
}

/**
 * Where *this* note's prose goes — the per-destination override, falling back to
 * the document-wide answer.
 *
 * This is what lets footnotes stay in the sentence while the haaros at the back
 * collect into a block at the end of the source: each kind reads the way the
 * writer thinks of it.
 */
function bodyHomeFor(pick: NotePick): BodyHome {
  const per = settings.noteBodyPlacement?.[pick.dest];
  if (per && (BODY_HOMES as readonly string[]).includes(per)) return per as BodyHome;
  return bodyHome();
}

/**
 * Write a note into the document. The only place that does.
 *
 * Reached from the chooser, from `insertSnippet` (and therefore from the
 * toolbar, the palette, the Insert menu and every key binding), and from the
 * right-click menu on an existing note. One producer means the scaffolding and
 * the source-position preference cannot be honoured in one surface and forgotten
 * in three — which is exactly what happened, and what `channels.test.mjs` and
 * `notecommands.test.mjs` now hold between them.
 */
export function applyNotePick(
  pick: NotePick,
  sel: { to?: number; text?: string; marker?: string } = {},
  preset: string | null = null,
) {
  const from = runtime.view.state.selection.main.from;
  const home = bodyHomeFor(pick);
  const { text, caret, errand } = applyPick(
    docTextOf(runtime.view.state.doc),
    from,
    pick,
    defersBody(home),
    sel,
    dirLang(),
    // The filing has to know about the blocks, or the option is true only until
    // the writer adds a note. See `neighbours` in `deferred.ts`.
    settings.deferGrouped === true,
    preset ? presetOf(preset) : null,
    home,
  );
  editDoc(text, caret);
  // A body filed in a companion document. `applyPick` is one string in and one
  // string out by design, so it hands the write back rather than reaching into
  // the library itself — and this is the only place that runs it.
  if (errand) void runErrand(errand);
  scheduleCompile();
  // The caret lands inside the note's brackets, but a note reached from the
  // toolbar (†) or the chooser modal leaves focus on the button that was
  // clicked, so the writer's next keystroke goes nowhere until they click back
  // in. Return the focus to where the caret already is.
  runtime.view.focus();
}

/**
 * Append a note body to the document it was filed in, making that document if
 * the sefer has not got one yet.
 *
 * The fourth of thing one's homes, and the half that could not live in
 * `deferred.ts`: writing into another document is a library operation and that
 * module is pure. The marker and the `#כלול` line went into this file already;
 * this is the prose arriving where the line points.
 *
 * Reported either way. A body that quietly failed to be written is the marker
 * with no note behind it that this whole home was held back to avoid.
 */
async function runErrand(errand: Errand): Promise<void> {
  try {
    const found = docs.library().find((e) => e.title === errand.file);
    if (found) {
      const doc = await docs.getDoc(found.id);
      if (!doc) throw new Error("the companion is in the index and not in the store");
      const body = doc.body.replace(/\s*$/u, "") + "\n" + errand.entry + "\n";
      await docs.putDoc({ ...doc, body });
    } else {
      await docs.createDoc(errand.file, errand.entry + "\n");
    }
    setStatus(tf("noteBodyFiledIn", errand.file), "ok");
  } catch (e) {
    setStatus(tf("noteBodyNotFiled", errand.file, String(e)), "warn");
  }
}

/**
 * A real page, set from the writer's own text, in place of an ASCII sketch.
 *
 * Four rows of `▤` cannot say whether the block lands at the foot of the page or
 * where the prose happens to stop — which is precisely the distinction the
 * writer is being asked to make. So the pick compiles: the opening of the
 * document in hand, with two notes sent to that destination, and the first page
 * shown at thumbnail size. Only the picked one, because six compiles to open a
 * modal is not a preview, it is a stall.
 */
async function fillNotePreview(host: HTMLElement, pick: NotePick) {
  const backend = runtime.backend;
  if (!backend) return;
  // The writer's own words, with the markup taken out. Slicing raw source at 700
  // characters lands in the middle of a bracket about as often as not, and a
  // preview that silently never appears because the excerpt would not compile is
  // worse than an honest sketch. So: strip the commands, keep the prose.
  const own = plainText(docTextOf(runtime.view.state.doc)).slice(0, 700);
  const filler = Array.from({ length: 18 }, (_, i) => t("notePreviewLine") + " " + (i + 1)).join(
    "\n\n",
  );
  const base = own.length > 120 ? own : filler;
  let src = base;
  // Two notes, back to front so that an earlier insertion cannot move a later
  // one's offset — enough to show the block growing rather than a single entry.
  const bodies = [t("notePreviewNoteA"), t("notePreviewNoteB")];
  for (let i = bodies.length - 1; i >= 0; i--) {
    const at = Math.floor((base.length * (i + 1)) / (bodies.length + 1));
    const r = applyPick(src, at, pick, false, {}, dirLang(), false, presetOf(notesPreset ?? ""));
    src = r.text.slice(0, r.caret) + bodies[i] + r.text.slice(r.caret);
  }
  const res = await backend.compile(src, { ...docConfig(), paper: "a5" }).catch(() => null);
  const svg = res?.pages_svg?.[0];
  if (!svg) return;
  // Through the allow-list, not `innerHTML`: this panel renders engine output in
  // the serve origin, and a string assigned to `innerHTML` is parsed as markup
  // there. See `svgsafe.ts` — and the measurement in it, which is why this is
  // hardening rather than the close of a live hole.
  setSafeSvg(host, svg);
  host.classList.add("ready");
}

/**
 * The pick in hand, held here because the panel is redrawn whole.
 *
 * One object and not two answers, because there is one question now: a
 * destination, and for one of the six the region under it. `pickAfterDestination`
 * decides what a change of destination does to the region, so the panel and the
 * state cannot disagree about it.
 */
let notesPick: NotePick = { dest: "foot", region: null };
/** The preset the pick came from, until the writer takes it apart. */
let notesPreset: string | null = null;

/** The presets whose pick this is — a preset is a value, so this is equality. */
function presetForPick(pick: NotePick): string | null {
  return PRESETS.find((p) => samePick(p.pick, pick))?.id ?? null;
}

export function renderNotesChooser() {
  const box = document.getElementById("notes-chooser-body")!;
  const doc = docTextOf(runtime.view.state.doc);
  const regions = regionsIn(doc).map((r) => r.name);
  // A pick naming a region the document has since lost is a stale answer, and
  // showing it would be the panel describing a document that is not there.
  if (notesPick.dest === "region" && notesPick.region && !regions.includes(notesPick.region)) {
    notesPick = panelviews.pickAfterDestination("region", regions, null);
    notesPreset = presetForPick(notesPick);
  }
  box.replaceChildren(
    ...panelviews.notesPanel(
      {
        pick: notesPick,
        regions,
        caveats: caveatsFor(doc, notesPick),
        preset: notesPreset,
      },
      {
        pick: (pick) => {
          notesPick = pick;
          // Taking a preset apart stops it being that preset — which is the
          // whole property decision 11 asks for, said in one line.
          notesPreset = presetForPick(pick);
          renderNotesChooser();
        },
        usePreset: (id) => {
          const p = presetOf(id);
          if (!p) return;
          notesPick = { ...p.pick };
          notesPreset = id;
          renderNotesChooser();
        },
        use: () => {
          applyNotePick(notesPick, {}, notesPreset);
          closeNotesChooser();
        },
        preview: (host, pick) => void fillNotePreview(host, pick),
      },
    ),
  );
  // Per-region heights, under the chooser: one row per declared region, each
  // writing its גובה back into the declaration itself — the same real edit
  // dragging the strip would make, and absent stays absent (the engine
  // decides).
  const declared = regionsIn(doc);
  if (declared.length > 0) {
    const rows = declared.map((d) => {
      const input = el("input", {
        type: "text",
        value: d.args["גובה"] ?? "",
        onchange: () => {
          const v = (input as HTMLInputElement).value.trim();
          const next = setDeclaredArgs(docTextOf(runtime.view.state.doc), d, {
            "גובה": v === "" ? null : v,
          });
          if (next === doc) return;
          editDoc(next);
          scheduleCompile();
        },
      });
      return el("label", { class: "set-row" }, [el("span", {}, [d.name]), input]);
    });
    box.append(
      el("h3", { style: "margin-top:14px" }, [t("regionHeightsTitle")]),
      el("div", { class: "set-note" }, [t("regionHeightsNote")]),
      ...rows,
    );
  }

  // The answer, brought to where the question was asked.
  //
  // Measured in the assembled run, which is the only place a viewport exists: at
  // 1280×720 the picked card and the button that writes it landed at y=835 —
  // below the bottom of the screen — so a writer who had just answered was
  // looking at the space where their answer was not. The run clicked it anyway,
  // because a driver scrolls and a person does not know there is anything to
  // scroll to.
  //
  // `nearest` rather than `center`: a card that is already on screen must not
  // jump, and the bottom edge is the one that carries the button.
  box.querySelector<HTMLElement>("[data-note-card]")?.scrollIntoView?.({ block: "nearest" });
}