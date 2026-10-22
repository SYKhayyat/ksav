// The settings drawer: two hundred lines of fields about this application, and
// its own keys section — capture, the dictionaries, reset — with it.
// Owns: every view row the drawer renders (`numberRow`, `selectRow`, the font
// picker, the about/notices sections, the keys section that captures
// chords), plus `now` (the B26 reader), `captureShortcut`, and the keys
// drawer's door (`openKeys`).
// Defers: what a row changes — `now`'s document half arrives as the wiring's
// `live`, and the writes (`setSetting`, `setPageSetup` and kin), the run-list
// and the modal as wiring methods; the B26 model to `settings.ts` and the
// mutations to the shell.
// Refuses: a second opinion about a value. Every row reads through the
// registered `live` and writes through `write`, so the drawer and the model
// cannot disagree.

import { el } from "./dom";
import { t, tf } from "./i18n";

import { whoHolds } from "./bindings";
import { keybindings } from "./keyhint";
import { settings, saveSettings, docConfig, type Field, type PageSetup } from "./settings";
import type { Settings } from "./settings";
import { hasKey } from "./i18n";
import { defersBody, BODY_HOMES, type BodyHome } from "./deferred";
import { DESTINATIONS } from "./channels";
import { deferAll, inlineAll, sortDeferredBodies } from "./deferred-lint";
import { scheduleCompile } from "./compile";
import * as docs from "./docs";
import { reportSaveFailure } from "./save";
import * as files from "./files";
import { snapshotNote, editingModeNote, spellCoverageNote } from "./spellcheck";
import * as update from "./update";
import { BUNDLED_NOTICES } from "./engine.gen";
import { hintFor, hintIsMode } from "./keyhint";
import { setStatus } from "./runtime";
import * as spellN from "./spell";
import * as settings_ from "./settings";
import { BUNDLED_FONTS } from "./engine.gen";
import * as fonts from "./fonts";
import * as zoomu from "./zoom";
import { glyphBtn } from "./dom";
import { panelHead } from "./panels";
import { runFullSpellCheck } from "./spellcheck";
import { voidAction } from "./asyncaction";

import * as runtime from "./runtime";
import { pickFile } from "./dom";
import { togglePanel, closePanel } from "./panels";

// # The wiring
//
// The effects a drawer row can ask the shell for are the shell's, not the
// view's. They arrive as one registered object — as the chrome's, the
// palette's, the help's and the rows' wirings do — so the view declares with
// what it answers for and nothing else.

type ValueOf<T> = T extends keyof typeof settings ? (typeof settings)[T]
  : never;

export interface SettingsWiring {
  /** Every action the shortcuts table lists and the keys drawer names. */
  runList(): { id: string }[];
  /** Read a keyboard event into the key string the table stores. */
  eventToKey(e: KeyboardEvent): string | null;
  /** What to call a command that is not the registry's. */
  whose(from: "registry" | "document" | "yours"): string;
  /** Rebuild the keymap after a rebind or a capture. */
  reconfigure(): void;
  /** Open the keys drawer (the door lives with the shell's drawer keys). */
  openKeys(): void;
  /** Move a running head out of the drawer and into the document. */
  swapRunningHead(which: "header" | "footer"): void;
  /** The small modal's promise question. */
  confirm(message: string, opts?: { title?: string; okLabel?: string; danger?: boolean }): Promise<boolean>;
  /** Where a note's body files by default (the chooser's B-rule). */
  noteHome(): BodyHome;
  /** Attach a font file. */
  attachFont(): void;
  /** Remove an asset the document carries. */
  dropAsset(name: string): void;
  /** What a setting reads *now* (B26) — page fields from the document. */
  live(key: Field): ValueOf<Field>;
  /** Write page setup onto the open document. */
  pageSet(change: PageSetup): void;
  /** Make the open document's layout what a new document starts with. */
  adoptDefault(): void;
  /** Change a setting — of the document, or of the application. */
  write<K extends Field>(key: K, value: ValueOf<K>): void;
}

let wiredSettings: SettingsWiring | undefined;

/** Register the settings wiring. Called once, from main.ts's boot. */
export function wireSettings(w: SettingsWiring): void {
  wiredSettings = w;
}

/** The wiring, registered at boot. */
export const settingsWiring = (): SettingsWiring => {
  if (!wiredSettings) throw new Error("wireSettings was never called: the settings wiring is missing");
  return wiredSettings;
};

// ---------------------------------------------------------------- settings drawer
function numberRow(labelKey: string, key: Field, min: number, max: number, step: number) {
  const input = el("input", {
    type: "number",
    min,
    max,
    step,
    // The live value, which for page setup is the open document's (B26).
    value: String(settingsWiring().live(key)),
    onChange: (e: Event) => settingsWiring().write(key, Number((e.target as HTMLInputElement).value) as never),
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}
/**
 * A number the writer may leave unset.
 *
 * `numberRow` renders `String(settingsWiring().live(key))`, which for an absent optional prints
 * the word "undefined" into the box. That matters here beyond looking wrong: the
 * four per-edge margins mean *"follow the one margin"* when unset, so an empty
 * box is a real and useful state, and clearing one has to write `undefined`
 * back rather than zero — a zero margin and an unset margin are different pages.
 */
function optNumberRow(labelKey: string, key: Field, min: number, max: number, step: number) {
  const live = settingsWiring().live(key);
  const input = el("input", {
    type: "number",
    min,
    max,
    step,
    placeholder: t("perEdgeHint"),
    value: live === undefined || live === null ? "" : String(live),
    onChange: (e: Event) => {
      const raw = (e.target as HTMLInputElement).value.trim();
      settingsWiring().write(key, (raw === "" ? undefined : Number(raw)) as never);
    },
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}

/** Remove an optional page field entirely: absent means "decide from the
 * document", which merging cannot say. Same write path as `setPageSetup`. */
function clearPageField(key: Field): void {
  const doc = runtime.currentDoc;
  if (!doc) return;
  const config: Record<string, unknown> = { ...(doc.config ?? {}) };
  delete config[key];
  runtime.setCurrentDoc({ ...doc, config });
  void docs.rememberConfig(doc.id, config).catch(reportSaveFailure);
}

/**
 * The page-foot reserve row: a length (`2cm`, `40pt`) or a percent of a
 * chosen base, blank meaning the engine decides. The percent is converted
 * to centimetres here — the engine's knob is centimetres — using the open
 * document's own sheet and margins, so the number the writer sees is the
 * number the layout gets.
 */
function reserveRow() {
  const input = el("input", {
    type: "text",
    placeholder: t("perEdgeHint").replace(/שוליים/g, "").trim() || "2cm",
    value: (() => {
      const cm = settingsWiring().live("notes_region_cm");
      return cm === undefined || cm === null ? "" : `${cm}cm`;
    })(),
  });
  const base = el(
    "select",
    {},
    [
      ["sheet", t("baseSheet")],
      ["text", t("baseText")],
    ].map(([v, label]) => {
      const o = el("option", {}, [label]);
      (o as HTMLOptionElement).value = v;
      return o;
    }),
  );
  const apply = (raw: string) => {
    if (raw === "") return clearPageField("notes_region_cm");
    if (raw.endsWith("%")) {
      const frac = Number(raw.slice(0, -1)) / 100;
      if (!Number.isFinite(frac)) return;
      const pageH = Number(settingsWiring().live("page_height_cm")) || 29.7;
      const mTop = Number(settingsWiring().live("margin_top_cm") ?? settingsWiring().live("margin_cm") ?? 2.5);
      const mBot = Number(settingsWiring().live("margin_bottom_cm") ?? settingsWiring().live("margin_cm") ?? 2.5);
      const baseH = (base as HTMLSelectElement).value === "text" ? pageH - mTop - mBot : pageH;
      settingsWiring().write("notes_region_cm", Math.round(frac * baseH * 1000) / 1000 as never);
    } else {
      const cm = raw.endsWith("pt")
        ? (Number(raw.slice(0, -2)) * 2.54) / 72
        : raw.endsWith("mm")
          ? Number(raw.slice(0, -2)) / 10
          : raw.endsWith("in")
            ? Number(raw.slice(0, -2)) * 2.54
            : Number(raw);
      if (Number.isFinite(cm)) settingsWiring().write("notes_region_cm", Math.round(cm * 1000) / 1000 as never);
    }
  };
  input.onchange = (e: Event) => apply((e.target as HTMLInputElement).value.trim());
  base.onchange = () => apply(input.value.trim());
  // The same write path under the writer's hand: dragging is typing, one
  // value at a time, through `setSetting`.
  const slider = el("input", { type: "range", min: "0", max: "12", step: "0.1" });
  const sync = () => {
    const cm = settingsWiring().live("notes_region_cm");
    (slider as HTMLInputElement).value = String(cm ?? 0);
  };
  sync();
  (slider as HTMLInputElement).oninput = () => {
    const cm = Number((slider as HTMLInputElement).value);
    settingsWiring().write("notes_region_cm", Math.round(cm * 1000) / 1000 as never);
    input.value = `${cm}cm`;
  };
  const originalApply = apply;
  const applyAndUpdateSlider = (raw: string) => {
    originalApply(raw);
    sync();
  };
  input.onchange = (e: Event) => applyAndUpdateSlider((e.target as HTMLInputElement).value.trim());
  base.onchange = () => applyAndUpdateSlider(input.value.trim());
  return el("div", { class: "set-row" }, [el("span", {}, [t("notesReserve")]), input, slider, base]);
}

/** A fixed choice, labelled through the dictionary like every other row. */
function selectRow(labelKey: string, key: Field, options: [string, string][]) {
  const live = String(settingsWiring().live(key) ?? "");
  const sel = el(
    "select",
    {
      // A stable name, across languages and themes — the same rule `header.ts`
      // states for the chips, applied where it was equally missing. Every row in
      // this drawer was a `<select>` with a localised `<option>` list and nothing
      // else, so the only way to find one from outside was by its label text: a
      // selector that works in Hebrew and silently matches nothing in English.
      // The acceptance run drives the editing-mode row through this.
      "data-setting": key,
      onChange: (e: Event) => settingsWiring().write(key, (e.target as HTMLSelectElement).value as never),
    },
    options.map(([value, label]) => {
      // An `<option>` holds text and nothing else, so its only tag is the text
      // itself. The key is `<labelKey>.<value>` — `searchScope.source` for the
      // `searchScope` row — and it is **checked** rather than assumed, so a row
      // that does not follow the convention simply goes untagged, which is the
      // old behaviour, rather than being re-localised to a key that means
      // something else. Measured 2026-09-27: the four `searchScope.*` rows were
      // in Hebrew after a switch to English, in both this drawer and the find
      // panel, and they are the same four keys in both places.
      const key = `${labelKey}.${value}`;
      return el(
        "option",
        {
          value,
          ...(live === value ? { selected: "selected" } : {}),
          ...(hasKey(key) ? { "data-i18n": key } : {}),
        },
        [label],
      );
    }),
  );
  return el("label", { class: "set-row" }, [
    el("span", { "data-i18n": labelKey }, [t(labelKey)]),
    sel,
  ]);
}

/**
 * Where a note's prose sits in the source — the document-level preference, and
 * one override per destination.
 *
 * **Thing one of the note model, and it is not a note-layout question.** Where
 * the prose sits changes the *file* and never the page: the engine's own
 * `every_note_layout_lays_out_identically_with_deferred_bodies` renders each
 * layout twice, inline and deferred, and asserts every run landed on the same
 * page at the same coordinates at the same size. So it does not belong in the
 * chooser that asks where a note prints, and it is here, with the other
 * preferences about reading and writing the source.
 *
 * It had no home at all before this. The global answer existed only as two
 * buttons *inside* the notes chooser — the one surface it is not allowed to be
 * in — so a writer who wanted their bodies at the end of the file had to open a
 * panel about note layouts to say so, and a writer who never opened that panel
 * had no way to discover the preference existed.
 *
 * Its own builder rather than a stack of `selectRow`s because the per-
 * destination answers are keys of the `noteBodyPlacement` record, not scalar
 * `Field`s that `setSetting` knows how to write. An empty value clears the key,
 * which is what "default" means: fall back to the global answer above.
 */
function noteBodyRows(): HTMLElement[] {
  const homes: [string, string][] = BODY_HOMES.map((h) => [h, t("settingsWiring().noteHome." + h)]);
  const global = el(
    "select",
    {
      "data-setting": "noteBodyHome",
      onChange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value as BodyHome;
        settings.noteBodyHome = v;
        // The boolean this replaced, kept in step rather than left to rot: it is
        // still what an older build reads, and two answers to one question that
        // can disagree is the defect family this repository is named for.
        settings.deferNoteBodies = defersBody(v);
        saveSettings();
      },
    },
    homes.map(([value, label]) =>
      el("option", { value, ...(value === settingsWiring().noteHome() ? { selected: "selected" } : {}) }, [label]),
    ),
  );
  const rows = [
    el("label", { class: "set-row" }, [el("span", {}, [t("noteBodyHomeLabel")]), global]),
    el("p", { class: "set-hint" }, [t("noteBodyHomeNote")]),
  ];
  // One override per destination, keyed by the destination's own id — so a
  // writer keeps their footnotes in the sentence and sends the haaros at the
  // back to a block at the end of the source.
  for (const d of DESTINATIONS) {
    const live = settings.noteBodyPlacement?.[d.id] ?? "";
    const options: [string, string][] = [["", t("settingsWiring().noteHome.default")], ...homes];
    const sel = el(
      "select",
      {
        "data-setting": `noteBodyPlacement.${d.id}`,
        onChange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          const map = { ...(settings.noteBodyPlacement ?? {}) };
          if ((BODY_HOMES as readonly string[]).includes(v)) map[d.id] = v as BodyHome;
          else delete map[d.id];
          settings.noteBodyPlacement = map;
          saveSettings();
        },
      },
      options.map(([value, label]) =>
        el("option", { value, ...(value === live ? { selected: "selected" } : {}) }, [label]),
      ),
    );
    rows.push(el("label", { class: "set-row" }, [el("span", {}, [t("dest." + d.id)]), sel]));
  }
  // The two sweeps and the tidy, beside the preference rather than behind a
  // panel about note layouts. Changing the answer above decides where the *next*
  // note's prose goes; these are how the notes already written follow it, and a
  // preference with no way to apply it to the document in hand is half a
  // feature.
  rows.push(
    el("div", { class: "set-row set-actions" }, [
      el("button", { type: "button", "data-defer-sweep": "end", onClick: () => deferAll(runtime.view) }, [
        t("deferAllAction"),
      ]),
      el("button", { type: "button", "data-defer-sweep": "inline", onClick: () => inlineAll(runtime.view) }, [
        t("deferRecallAllAction"),
      ]),
      el("button", { type: "button", "data-defer-sweep": "sort", onClick: () => sortDeferredBodies(runtime.view) }, [
        t("deferSortAction"),
      ]),
    ]),
  );
  return rows;
}

/**
 * Where the text sits: justified, right, centre or left — one row.
 *
 * Its own function rather than a `selectRow`, because the answer is written to
 * *two* page fields at once and `setSetting` writes one. Writing them
 * separately would put the document through a state holding both an edge and
 * `justify: true` — briefly, and then compiled, because each write schedules a
 * compile. `setPageSetup` takes the pair in one act.
 */
function alignRow() {
  const cfg = docConfig();
  const live = settings_.alignChoice(cfg);
  const sel = el(
    "select",
    {
      onChange: (e: Event) => {
        const choice = (e.target as HTMLSelectElement).value as settings_.AlignChoice;
        settingsWiring().pageSet(settings_.alignSetup(choice));
        scheduleCompile();
      },
    },
    settings_.ALIGN_CHOICES.map((value) =>
      el("option", { value, ...(live === value ? { selected: "selected" } : {}) }, [
        t(`align.${value}`),
      ]),
    ),
  );
  return el("label", { class: "set-row" }, [el("span", {}, [t("textAlign")]), sel]);
}

/**
 * A comma-separated list, edited as text and stored as an array.
 *
 * The split is deliberately forgiving about spaces and empty entries — a
 * keyword list is the kind of field where a trailing comma is a keystroke, not
 * an intention.
 */
function listRow(labelKey: string, key: Field) {
  const live = settingsWiring().live(key);
  const input = el("input", {
    type: "text",
    value: Array.isArray(live) ? live.join(", ") : "",
    onChange: (e: Event) => {
      const parts = (e.target as HTMLInputElement).value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      settingsWiring().write(key, parts as never);
    },
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}

function checkRow(labelKey: string, key: Field) {
  const input = el("input", {
    type: "checkbox",
    ...(settingsWiring().live(key) ? { checked: "checked" } : {}),
    onChange: (e: Event) => settingsWiring().write(key, (e.target as HTMLInputElement).checked as never),
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}
function textRow(labelKey: string, key: Field, placeholder = "") {
  const input = el("input", {
    type: "text",
    placeholder,
    // `now`, not `settings`: header and footer are page setup and belong to the
    // open document (B26), so reading the app preference here showed one value
    // in the box and typeset another on the page.
    value: String(settingsWiring().live(key) ?? ""),
    onInput: (e: Event) => settingsWiring().write(key, (e.target as HTMLInputElement).value as never),
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}
function textAreaRow(labelKey: string, key: keyof Settings, placeholder = "") {
  const ta = el(
    "textarea",
    {
      class: "set-textarea",
      rows: 4,
      placeholder,
      onInput: (e: Event) => settingsWiring().write(key, (e.target as HTMLTextAreaElement).value as never),
    },
    [String(settings[key] ?? "")],
  );
  return el("div", { class: "set-block" }, [el("span", {}, [t(labelKey)]), ta]);
}

/**
 * The font control: a real list, grouped by where each face comes from.
 *
 * > *"The font dropdown is ugly. Named plainly, recorded plainly."*
 *
 * It was not a dropdown. It was a text box with a `datalist` hint, so choosing a
 * font meant typing a family name exactly right — and typed wrong, nothing said
 * so: Typst falls back to whatever it can find and the sefer comes out in a face
 * nobody chose. Each option is drawn **in its own face**, which is the plainest
 * naming there is; the group it sits in says whether it will still resolve on
 * somebody else's machine.
 *
 * The typed route survives as the last option rather than as the only one. A
 * font installed on this machine is real and no list the application can build
 * knows its name, so refusing the text box would have taken a working thing
 * away — see `fonts.ts`.
 */
function buildFontPicker(): HTMLElement {
  const assets = runtime.currentDoc?.assets ?? [];
  const current = docConfig().font;
  const options = fonts.fontOptions(BUNDLED_FONTS, assets, current);
  const box = el("span", { class: "font-pick" }, []);

  const typeIt = () => {
    const input = el("input", {
      type: "text",
      class: "font-typed",
      value: current,
      "aria-label": t("font"),
      onChange: (e: Event) => {
        settingsWiring().write("font", (e.target as HTMLInputElement).value as never);
        runtime.rerenderChrome();
      },
    });
    box.replaceChildren(input, addFontButton());
    input.focus();
  };

  const sel = el(
    "select",
    {
      id: "font-family",
      onChange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === OTHER_FONT) return typeIt();
        settingsWiring().write("font", v as never);
        runtime.rerenderChrome();
      },
    },
    [
      ...fonts.fontGroups(options).map((g) =>
        el(
          "optgroup",
          { label: t(`fontFrom.${g.source}`) },
          g.fonts.map((f) =>
            el(
              "option",
              {
                value: f.name,
                // Drawn in its own face. A list of font names set in one face is
                // a list of strings; the whole question a writer is asking here
                // is what the letters look like.
                style: `font-family:"${f.name}"`,
                ...(f.name === current ? { selected: "selected" } : {}),
              },
              [f.name],
            ),
          ),
        ),
      ),
      el("option", { value: OTHER_FONT }, [t("fontOther")]),
    ],
  );
  box.replaceChildren(sel, addFontButton());
  return box;
}

/** The `+` that attaches a font file to this document — labelled, not a bare glyph. */
function addFontButton(): HTMLElement {
  return glyphBtn("+", t("addFont"), () => settingsWiring().attachFont(), "mini");
}

/** The sentinel value of the "name it yourself" row. Not a family anybody has. */
const OTHER_FONT = "__ksav-other-font__";

export function buildSettingsDrawer(): HTMLElement {
  const fontSel = buildFontPicker();
  const dirSel = el(
    "select",
    { onChange: (e: Event) => settingsWiring().write("dir", (e.target as HTMLSelectElement).value as never) },
    [
      el("option", { value: "rtl", ...(docConfig().dir === "rtl" ? { selected: "selected" } : {}) }, [t("rtl")]),
      el("option", { value: "ltr", ...(docConfig().dir === "ltr" ? { selected: "selected" } : {}) }, [t("ltr")]),
    ],
  );
  const paperSel = el(
    "select",
    { onChange: (e: Event) => settingsWiring().write("paper", (e.target as HTMLSelectElement).value as never) },
    [
      ["a4", "A4"],
      ["us-letter", "Letter"],
      ["a5", "A5"],
      ["a3", "A3"],
    ].map(([v, lbl]) =>
      el("option", { value: v, ...(docConfig().paper === v ? { selected: "selected" } : {}) }, [lbl]),
    ),
  );
  // The writer's own words, listed so a mistaken "add to dictionary" can be
  // undone — otherwise a typo taught by accident is permanent and invisible.
  const dictWords = spellN.userWords();
  const dictRows = dictWords.length
    ? dictWords.map((w) =>
        el("div", { class: "set-row asset-row" }, [
          el("span", { class: "asset-name" }, [w]),
          glyphBtn(
            "×",
            t("delete"),
            () => {
              spellN.removeUserWord(w);
              runFullSpellCheck();
              runtime.rerenderChrome();
            },
            "mini",
          ),
        ]),
      )
    : [el("div", { class: "set-note" }, [t("emptyDictionary")])];

  const assets = runtime.currentDoc?.assets ?? [];
  const assetRows = assets.length
    ? assets.map((a) =>
        el("div", { class: "set-row asset-row" }, [
          el("span", { class: "asset-name" }, [(a.kind === "font" ? "🅵 " : "🖼 ") + a.name]),
          glyphBtn("×", t("removeAsset"), () => settingsWiring().dropAsset(a.name), "mini"),
        ]),
      )
    : [el("div", { class: "set-note" }, [t("noAssets")])];

  return el("aside", { id: "settings-drawer", class: "drawer", "aria-label": t("settings") }, [
    // Every other panel in the app closes with × and with Escape; this one used
    // to close only by finding the ⚙ chip again — and below 720px the drawer is
    // the full viewport width, so that chip is *underneath it*. There was
    // literally no way out of Settings on a phone.
    panelHead("settings-drawer", "settings", { level: "h3" }),
    // B26. The fourteen fields below this line belong to the **open document** and
    // travel with it; everything under `fitWidthLabel` is about the person at the
    // desk. Saying which is which is the whole point — a writer who does not know
    // whether a margin follows the sefer or the machine cannot use either.
    el("div", { class: "set-note" }, [t("setupIsPerDoc")]),
    el("label", { class: "set-row" }, [el("span", {}, [t("font")]), fontSel]),
    numberRow("fontSize", "size_pt", 8, 36, 1),
    numberRow("margin", "margin_cm", 1, 6, 0.5),
    el("label", { class: "set-row" }, [el("span", {}, [t("direction")]), dirSel]),
    el("label", { class: "set-row" }, [el("span", {}, [t("paper")]), paperSel]),
    // A custom page size, which overrides the named paper when **both** are
    // given. Empty is the ordinary state and means "use the paper above" — the
    // same "absent is an instruction" rule the four per-edge margins follow, and
    // the reason both rows are optional rather than pre-filled with A4's
    // numbers.
    optNumberRow("pageWidth", "page_width_cm", 1, 200, 0.5),
    optNumberRow("pageHeight", "page_height_cm", 1, 200, 0.5),
    checkRow("pageNumbers", "numbering"),
    checkRow("hebrewNumbering", "hebrew_numbering"),
    // One row, four answers. Was a `justify` tick box with nothing beside it,
    // which is why a centred sheet had to be done paragraph by paragraph.
    alignRow(),
    numberRow("lineSpacing", "line_spacing_em", 0.4, 1.5, 0.05),
    numberRow("paraSpacing", "para_spacing_em", 0, 3, 0.1),
    numberRow("firstIndent", "first_line_indent_em", 0, 4, 0.25),
    numberRow("columns", "columns", 1, 3, 1),
    textRow("headerText", "header", ""),
    textRow("footerText", "footer", ""),
    // > *"Header and footer content lives in the settings drawer, which makes
    // > anything beyond plain text — bold, mixed runs — hard to express. They
    // > are document content in a settings control."*
    //
    // Both halves are answered by moving them into the document: `#כותרת_עליונה`
    // takes content, so everything the writer can type works, and a document may
    // set it more than once — the masechta over one chapter and a different one
    // over the next, which no settings field could ever have said.
    //
    // The boxes above stay. Plain text is still the common case and typing it
    // into a field is still the shortest way to get it; this is the door out of
    // that field for the moment it is not enough, and it carries what is already
    // written across rather than making the writer type it twice.
    el("div", { class: "set-note" }, [t("runningHeadNote")]),
    el("div", { class: "set-row" }, [
      el("button", { class: "sc-key", type: "button", onClick: () => settingsWiring().swapRunningHead("header") }, [
        t("headerToDocument"),
      ]),
      el("button", { class: "sc-key", type: "button", onClick: () => settingsWiring().swapRunningHead("footer") }, [
        t("footerToDocument"),
      ]),
    ]),
    // Everything a sefer that will be *printed and bound* needs and a document
    // read on a screen does not. Kept in its own group and off by default, so
    // the ordinary page setup above stays five fields rather than eighteen.
    el("h3", { style: "margin-top:18px" }, [t("bindingTitle")]),
    el("div", { class: "set-note" }, [t("bindingNote")]),
    checkRow("twoSided", "two_sided"),
    optNumberRow("marginTop", "margin_top_cm", 0, 7, 0.25),
    optNumberRow("marginBottom", "margin_bottom_cm", 0, 7, 0.25),
    optNumberRow("marginInner", "margin_inner_cm", 0, 7, 0.25),
    optNumberRow("marginOuter", "margin_outer_cm", 0, 7, 0.25),
    numberRow("gutter", "gutter_cm", 0, 5, 0.25),
    reserveRow(),
    selectRow("reserveOverflow", "reserve_overflow", [
      ["grow", t("overflowGrow")],
      ["refuse", t("overflowRefuse")],
      ["flow", t("overflowFlow")],
    ]),
    // The two ceilings on a `#כלול` expansion. Two and not one because they
    // answer different questions: below the soft one nothing is said, above it
    // the document is reported and still laid out, and above the hard one the
    // walk stops — because past a point there is nothing left to warn about.
    numberRow("maxLinesWarn", "max_lines_warn", 1000, 100000000, 1000),
    numberRow("maxLinesRefuse", "max_lines_refuse", 1000, 100000000, 1000),
    selectRow("headAlign", "head_align", [
      ["center", t("headAlign.center")],
      ["outside", t("headAlign.outside")],
      ["inside", t("headAlign.inside")],
    ]),
    textRow("headerOdd", "header_odd", ""),
    textRow("headerEven", "header_even", ""),
    textRow("footerOdd", "footer_odd", ""),
    textRow("footerEven", "footer_even", ""),
    el("h3", { style: "margin-top:18px" }, [t("pdfTitle")]),
    textRow("docTitle", "title", ""),
    textRow("docAuthor", "author", ""),
    listRow("docKeywords", "keywords"),
    selectRow("pdfStandard", "pdf_standard", [
      ["", t("pdfStandard.none")],
      ["a-2b", "PDF/A-2b"],
      ["a-3b", "PDF/A-3b"],
      ["a-4", "PDF/A-4"],
      ["ua-1", "PDF/UA-1"],
      ["1.7", "PDF 1.7"],
      ["2.0", "PDF 2.0"],
    ]),
    checkRow("pdfTagged", "pdf_tagged"),
    checkRow("preventOrphans", "prevent_orphans"),
    checkRow("continuous", "continuous"),
    el("div", { class: "set-note" }, [t("pdfStandardNote")]),
    // The affordance per-document setup takes away and has to give back: a
    // writer who has got their sefer looking right wants the next one to start
    // there, rather than setting fourteen fields again.
    el("div", { class: "set-row" }, [
      el("button", { class: "sc-key", type: "button", onClick: () => settingsWiring().adoptDefault() }, [
        t("setAsDefault"),
      ]),
    ]),
    el("h3", { style: "margin-top:18px" }, [t("thisMachine")]),
    checkRow("fitWidthLabel", "fitWidth"),
    // Where the outline and the notes list go. Asked for twice in the margins,
    // about two different drawers, in the same words: a panel that covers the
    // source is a panel you have to close to read what it is telling you about.
    selectRow("panelPlacementLabel", "panelPlacement", [
      ["float", t("placement.float")],
      ["pane", t("placement.pane")],
    ]),
    // Two zooms, named for the two things they zoom. The bounds and the step are
    // `zoom.ts`'s, not four numbers typed into two calls: they are a fact about
    // what a zoom is, and the keyboard has to agree with the panel about them.
    numberRow("zoomSource", "sourceZoom", zoomu.MIN, zoomu.MAX, zoomu.STEP),
    numberRow("zoom", "zoom", zoomu.MIN, zoomu.MAX, zoomu.STEP),
    // Which of the two a Ctrl+= lands on is not guessable from the rows above,
    // and it is the whole reason there is one pair of keys rather than two.
    el("div", { class: "set-note" }, [t("zoomNote")]),
    checkRow("autoSnapshotLabel", "autoSnapshot"),
    numberRow(
      "autoSnapshotMinutes",
      "autoSnapshotMinutes",
      docs.MIN_SNAPSHOT_MINUTES,
      docs.MAX_SNAPSHOT_MINUTES,
      1,
    ),
    el("div", { class: "set-note" }, [snapshotNote()]),
    selectRow("editingModeLabel", "editingMode", [
      ["default", t("mode.default")],
      ["vim", t("mode.vim")],
      ["emacs", t("mode.emacs")],
    ]),
    el("div", { class: "set-note" }, [editingModeNote()]),
    selectRow("tabCompileLabel", "tabCompile", [
      ["keep", t("tabCompile.keep")],
      ["idle", t("tabCompile.idle")],
      ["onSwitch", t("tabCompile.onSwitch")],
    ]),
    el("div", { class: "set-note" }, [t("tabCompileNote")]),
    checkRow("focusModeLabel", "focusMode"),
    checkRow("typewriterLabel", "typewriter"),
    // The note, because this is the one setting here whose effect a writer
    // cannot see by looking: at rest it is a document that scrolls slightly
    // differently, and nothing on screen says so.
    el("div", { class: "set-note" }, [t("typewriterNote")]),
    selectRow("typewriterAnchorLabel", "typewriterAnchor", [
      ["upper", t("typewriterAnchor.upper")],
      ["center", t("typewriterAnchor.center")],
      ["lower", t("typewriterAnchor.lower")],
    ]),
    checkRow("autocompleteLabel", "autocomplete"),
    checkRow("autoPairBracketsLabel", "autoPairBrackets"),
    checkRow("autoPairQuotesLabel", "autoPairQuotes"),
    // Off by default, and the note says why rather than leaving a writer to
    // discover it by fighting their own gershayim for an hour.
    el("div", { class: "set-note" }, [t("autoPairQuotesNote")]),
    checkRow("showWhitespaceLabel", "showWhitespace"),
    // **Beside its own checkbox, which is the whole point of a note.** This one
    // sat fourteen rows lower, under the *indent* dials, so it read as an
    // explanation of the indent settings — and it is the setting whose note
    // matters most, because a writer who cannot see a space cannot see a
    // paragraph break either. Nothing tested adjacency, because nothing can:
    // `settings.test.mjs` proves the key is reachable and `docfacts` proves the
    // string exists, and the failure mode is two correct things in the wrong
    // order.
    el("div", { class: "set-note" }, [t("showWhitespaceNote")]),
    // #85 — a dial rather than a checkbox: the feature is "how much", not "whether".
    numberRow("dimOutsideTagLabel", "dimOutsideTag", 0, 100, 5),
    checkRow("minimapLabel", "minimap"),
    checkRow("minimapColorsLabel", "minimapColors"),
    el("div", { class: "set-note" }, [t("minimapNote")]),
    checkRow("indentViewLabel", "indentView"),
    el("div", { class: "set-note" }, [t("indentViewNote")]),
    // The three dials, all of them the writer's own number. **Minimum words is the
    // one that matters** — it is what keeps `#נטוי[מילה]` on one line, hundreds of
    // times over, without the writer having to ask for that every time.
    numberRow("indentAmountLabel", "indentAmount", 1, 8, 1),
    numberRow("indentMinWordsLabel", "indentMinWords", 0, 40, 1),
    numberRow("indentPercentLabel", "indentPercent", 10, 90, 5),
    // #86 — what a bare click on a `[` means. A select and not a checkbox, because
    // there is no off: clicking a bracket does something either way, and the only
    // question is which of the two. `Alt`+click is the other, so this is a
    // preference about the bare hand rather than a switch between capabilities.
    selectRow("clickSelectsTagLabel", "clickSelectsTag", [
      ["body", t("clickSelectsBody")],
      ["whole", t("clickSelectsWhole")],
    ]),
    checkRow("keepMenuPositionLabel", "keepMenuPosition"),
    // Off by default, and the note says what the strip is — because a writer
    // who has never seen it cannot decide about a control they cannot picture,
    // and the one who turned it off wants to know what they turned off.
    checkRow("proseStripLabel", "proseStrip"),
    el("div", { class: "set-note" }, [t("proseStripNote")]),
    checkRow("spellcheckLabel", "spellcheck"),
    checkRow("spellcheckCommentsLabel", "spellcheckComments"),
    el("div", { id: "spell-coverage", class: "set-note" }, [spellCoverageNote()]),
    // The strip's own visibility, beside the rest of "what is on screen". It
    // defaults to `always` now: it used to appear only at two arrangements, and
    // the `+` that makes the second one lives *in* it, so the only visible door
    // to the feature opened once you had already used it.
    selectRow("tabStripLabel", "tabStrip", [
      ["always", t("tabStrip.always")],
      ["auto", t("tabStrip.auto")],
      ["never", t("tabStrip.never")],
    ]),
    // Four switches where there was one, and the one did not do what it said.
    // "Synced scrolling" used to gate the caret follow and the source click and
    // leave the actual pane-to-pane scrolling alone; each of these now gates
    // exactly the behaviour it is named after, which is what *"each
    // independently"* asks for and also the only way the labels stop lying.
    checkRow("syncScrollLabel", "syncScroll"),
    checkRow("followCaretLabel", "followCaret"),
    checkRow("clickToPreviewLabel", "clickToPreview"),
    checkRow("clickToSourceLabel", "clickToSource"),
    selectRow("clickTargetLabel", "clickTarget", [
      ["match", t("clickTarget.match")],
      ["keep", t("clickTarget.keep")],
    ]),
    el("div", { class: "set-note" }, [t("clickTargetNote")]),
    selectRow("outlineJumpLabel", "outlineJump", [
      ["source", t("outlineJump.source")],
      ["preview", t("outlineJump.preview")],
      ["both", t("outlineJump.both")],
    ]),
    el("div", { class: "set-note" }, [t("outlineJumpNote")]),
    selectRow("openInLabel", "openIn", [
      ["reuse", t("openIn.reuse")],
      ["newTab", t("openIn.newTab")],
      ["current", t("openIn.current")],
    ]),
    el("div", { class: "set-note" }, [t("openInNote")]),
    // One section for all of it, which the report asks for by name. The four
    // rows are one question — *how does the other pane follow this one* — and
    // they were spread between a checkbox here and two constants in the source.
    selectRow("syncMatchLabel", "syncMatch", [
      ["direction", t("syncMatch.direction")],
      ["top", t("syncMatch.top")],
      ["middle", t("syncMatch.middle")],
      ["bottom", t("syncMatch.bottom")],
    ]),
    numberRow("syncDeadZoneLabel", "syncDeadZone", 0, 60, 1),
    checkRow("syncExactLabel", "syncExact"),
    numberRow("syncSettleMsLabel", "syncSettleMs", 0, 2000, 50),
    el("p", { class: "set-hint" }, [t("syncSettleNote")]),
    selectRow("previewDelayLabel", "previewDelay", [
      ["live", t("previewDelay.live")],
      ["relaxed", t("previewDelay.relaxed")],
      ["manual", t("previewDelay.manual")],
    ]),
    // Which sefer a search reads. Here as well as on the find drawer itself:
    // this is where a writer sets the application up, and that is where they
    // meet the consequence — a control that lives in only one of the two is a
    // control somebody has to already know about.
    selectRow("searchScope", "searchScope", [
      ["source", t("searchScope.source")],
      ["preview", t("searchScope.preview")],
      ["both", t("searchScope.both")],
    ]),
    checkRow("searchCaseSensitive", "searchCaseSensitive"),
    el("p", { class: "set-hint" }, [t("searchCaseSensitiveNote")]),
    // Keeping a hand-numbered series in order. Beside the search rows rather
    // than in a corner of its own is arbitrary; what is not arbitrary is that
    // the *report* has a row of its own — a rewrite of the writer's own
    // characters that says nothing is the thing to be able to turn off, and it
    // is not the same question as whether to rewrite at all.
    checkRow("renumberAuto", "renumberAuto"),
    checkRow("renumberReport", "renumberReport"),
    el("p", { class: "set-hint" }, [t("renumberNote")]),
    // How the deferred bodies at the foot of the file are arranged. Beside the
    // renumbering rows because both are about the *source* staying legible
    // rather than about the page.
    checkRow("deferGrouped", "deferGrouped"),
    el("p", { class: "set-hint" }, [t("deferGroupedNote")]),
    // The two history ceilings. Beside the snapshot cadence rather than in a
    // corner of their own, because *how often* and *how many are kept* are one
    // question asked twice, and a writer changing one wants to see the other.
    numberRow("maxSnapshotsLabel", "maxSnapshots", 1, 500, 5),
    numberRow("maxHistoryMBLabel", "maxHistoryMB", 0.25, 200, 0.5),
    el("p", { class: "set-hint" }, [t("historyLimitsNote")]),
    el("h3", { style: "margin-top:18px" }, [t("notePlacementLabel")]),
    ...noteBodyRows(),
    checkRow("autosaveFileLabel", "autosaveFile"),
    checkRow("checkUpdatesLabel", "checkUpdates"),
    el("div", { class: "set-note" }, [t("checkUpdatesNote")]),
    el("div", { class: "set-note" }, [`${t("version")} ${update.CURRENT_VERSION}`]),
    el("h3", { style: "margin-top:18px" }, [t("userDictionary")]),
    // The dictionary is per browser profile, so it is invisible to the desktop
    // app and gone if that profile is cleared. Until there is somewhere to sync
    // it to, the writer at least owns it as a file.
    el("div", { class: "set-row" }, [
      el("button", { class: "sc-key", type: "button", onClick: exportDictionary }, [
        t("exportDictionary"),
      ]),
      el("button", { class: "sc-key", type: "button", onClick: () => voidAction("save_file", () => importDictionary()) }, [
        t("importDictionary"),
      ]),
    ]),
    ...dictRows,
    el("h3", { style: "margin-top:18px" }, [t("assetsTitle")]),
    ...assetRows,
    el("h3", { style: "margin-top:18px" }, [t("customization")]),
    textAreaRow("customCommandsLabel", "customCommands", "#let דגש(x) = text(fill: red, strong(x))"),
    textAreaRow("snippetsLabel", "snippets", "בסד = בס\"ד\nסי = #סימן[|][]"),
    // A door, not the room.
    //
    // Sixty-odd rows of key capture used to be printed here, below the paper
    // size, the margins, the dictionary and the asset list — one scrolling
    // drawer with two subjects in it, which is the first half of inventory item
    // 126. They live in `keys-drawer` now, searchable, with a key of their own.
    // What stays is this line, because Settings is where somebody who has not
    // learned the key will look first.
    el("h3", { style: "margin-top:18px" }, [t("shortcuts")]),
    el("label", { class: "set-row" }, [
      el("span", {}, [t("keysOpen")]),
      el("button", {
        // The mode class here too, and for the same reason it is on every menu's
        // `<code>`: under Vim or Emacs this button goes on working — it is a
        // click — but the chord it used to print stopped, so what it prints now
        // is `M-x keysdrawer`, which is how the keyboard actually reaches it.
        class: "sc-key" + (hintIsMode() ? " sc-key-mode" : ""),
        type: "button",
        id: "keys-open",
        onClick: () => {
          closePanel("settings-drawer");
          settingsWiring().openKeys();
        },
      }, [hintFor("keysDrawer") || t("keysTitle")]),
    ]),
    ...buildAboutSection(),
  ]);
}

/**
 * The licence notice, in the app.
 *
 * Not decoration and not a nicety. Six font files are compiled into the engine,
 * so every way Ksav is distributed — the installers, the server binary, and the
 * ~23 MB wasm module the browser build downloads — is a redistribution of them.
 * Both the SIL OFL and the GUST licence require their notice to accompany a
 * redistribution, and a web build has no installer to put a text file beside.
 * So the notice lives where the software is.
 *
 * The facts themselves come from `engine/src/notices.rs`, which sits beside the
 * `include_bytes!` lines that create the obligation and is tied to them by a
 * test in both directions. This was the fourth hand-kept copy of them — after
 * the Markdown, the licence texts and the font list — and the failure mode of a
 * fourth copy of a licence notice is a licence violation on every download,
 * arriving quietly, with a green test suite.
 */
const BUNDLED_FONT_NOTICES = BUNDLED_NOTICES.filter((n) => n.kind === "font");

/**
 * The lexicon notices, for the same reason as the fonts.
 *
 * `lexicon-en.txt` is a word list derived from the English Speller Database, and
 * ESDB's licence covers derived word lists explicitly: the copyright and
 * permission notice must appear in all copies. The list is compiled into the
 * engine with `include_str!`, so every binary and the wasm module are copies.
 * The Hebrew lexicon needs no notice — it is built from Public Domain text — and
 * it is named here anyway, because "which dictionaries is this thing using" is a
 * fair question and the answer should not be half an answer.
 */
const BUNDLED_LEXICON_NOTICES = BUNDLED_NOTICES.filter((n) => n.kind === "lexicon");

function buildAboutSection(): Node[] {
  return [
    el("h3", { style: "margin-top:18px" }, [t("aboutTitle")]),
    el("div", { class: "set-note" }, [t("aboutLicence")]),
    el("div", { class: "set-note" }, [t("aboutFonts")]),
    ...BUNDLED_FONT_NOTICES.map(noticeRow),
    el("div", { class: "set-note" }, [t("aboutLexicons")]),
    ...BUNDLED_LEXICON_NOTICES.map(noticeRow),
  ];
}

function noticeRow(n: { name: string; copyright: string; licence: string; url: string }): HTMLElement {
  return el("div", { class: "font-notice" }, [
    el("b", {}, [n.name]),
    el("span", {}, [n.copyright]),
    el("a", { href: n.url, target: "_blank", rel: "noopener noreferrer" }, [n.licence]),
  ]);
}

let capturing = false;
export function captureShortcut(actionId: string, btn: HTMLButtonElement) {
  if (capturing) return;
  capturing = true;
  const original = btn.textContent || "—";
  btn.textContent = t("pressKey");
  btn.classList.add("capturing");
  const done = (text: string) => {
    capturing = false;
    btn.classList.remove("capturing");
    btn.textContent = text;
    window.removeEventListener("keydown", handler, true);
  };
  const handler = async (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return done(original);
    const key = settingsWiring().eventToKey(e);
    if (!key) return; // still waiting for a non-modifier key
    // Refuse to bind a chord that another action already holds without saying so.
    // Silently assigning it left two actions on one key, one of them shadowed with
    // no way to tell which won. Offer to move it; if declined, keep what was there.
    const kb = keybindings();
    const conflict = whoHolds(kb, key, actionId);
    let reassigned = false;
    if (conflict) {
      if (!(await settingsWiring().confirm(tf("shortcutConflict", key)))) return done(original);
      // Unbind the other so the chord is held by exactly one action.
      settings.keybindings = { ...(settings.keybindings || {}), [conflict]: "", [actionId]: key };
      reassigned = true;
    } else {
      settings.keybindings = { ...(settings.keybindings || {}), [actionId]: key };
    }
    saveSettings();
    settingsWiring().reconfigure();
    done(key);
    // Redraw so the action that lost the chord shows as unbound, not stale.
    if (reassigned) runtime.rerenderChrome();
  };
  window.addEventListener("keydown", handler, true);
}
export function exportDictionary() {
  const name = "ksav-dictionary.txt";
  files.download(name, spellN.exportUserWords());
  // Said, like every other file that leaves. This one is outside `exports.ts`
  // and was therefore outside the fence there, which is the whole reason the
  // rule now lives in `prohibitions.test.mjs` instead.
  setStatus(`✓ ${tf("exported", name)}`, "ok");
}

export async function importDictionary() {
  const f = await pickFile(".txt,text/plain");
  if (!f) return;
  const added = spellN.importUserWords(await f.text());
  runFullSpellCheck();
  runtime.rerenderChrome();
  setStatus(added ? tf("dictionaryImported", added) : t("dictionaryNothingNew"), added ? "ok" : "");
}

export function resetShortcuts() {
  delete settings.keybindings;
  saveSettings();
  settingsWiring().reconfigure();
  runtime.rerenderChrome();
}
export function toggleSettings() {
  togglePanel("settings-drawer");
}