// ------------------------------------------------------------- destinations
//
// The one section of this panel that edits the *document's own* declarations
// rather than a `#הגדרות_*` call, because that is what a destination is: a note
// stream, declared once and read wherever a note is written.
//
// It is here rather than in the Notes chooser on purpose, and the split is the
// whole model. The chooser asks *"where should this note go?"* once, at the
// moment a note is written. This asks *"what does that place look like"* about
// a destination that already exists, with the notes already written — so
// lettering three hundred haaros א,ב,ג is one control and not three hundred
// edits, which is exactly what the eighteen commands could not offer.
//
// **The word "channel" is not on this surface.** A writer picks a place and sets
// what a place looks like; `channels.ts` is the machinery underneath, and the
// prelude's `#ערוץ` line is what gets written.
//
// This file refuses to answer for: the panel it renders inside
// (`stylespanel.ts`) and the panel's row dress it borrows
// (`styleRow`/`selectControl`/`textControl` from there).

import * as channels from "./channels";
import { makeWiring } from "./wiring";
import * as apparatus from "./apparatus";
import type { DestinationId, NotePick } from "./channels";
import {
  DESTINATIONS,
  caveatsFor,
  regionsIn,
  samePick,
} from "./channels";
import { insertSnippet } from "./insert";
import { regionShown } from "./notes";
import { el } from "./dom";
import * as runtime from "./runtime";
import { docTextOf } from "./spans";
import { t } from "./i18n";
import { docLang } from "./insert";
import { renderStylesPanel } from "./stylespanel";
import { styleRow, selectControl, textControl } from "./stylecontrols";
import * as panelviews from "./panelviews";

/**
 * What the destinations borrow from the shell: the whole-editor replace with a
 * caret (an editor operation, not a channels one) — the wave that carves the
 * editor's write-back (wave 10) will move it again.
 */
export interface DestinationsWiring {
  replaceAll(text: string, caret: number): void;
}

const W = makeWiring<DestinationsWiring>("wireDestinations");
export const wireDestinations = W.wire;
export const destinationsWiring = W.get;

/** The destination this section is editing. */
let stylePick: NotePick = { dest: "foot", region: null };

/** A pick as one string, for a `<select>` value. */
function pickKey(pick: NotePick): string {
  return pick.region ? `region:${pick.region}` : pick.dest;
}

function pickFromKey(key: string): NotePick {
  if (key.startsWith("region:")) return { dest: "region", region: key.slice(7) };
  return { dest: key as DestinationId, region: null };
}

/**
 * Every destination this document could be setting: the five singular ones and
 * one entry per region it has.
 *
 * A region a writer named without declaring it is in the list too, because
 * naming one is not an error — it is an apparatus of its own, which is what
 * `#הערה_זרם("מקורות")` has always been — and a panel that hid it would be
 * hiding a block that is on the page.
 */
function styleDestinations(): NotePick[] {
  const doc = runtime.view ? docTextOf(runtime.view.state.doc) : "";
  const named = new Set<string>();
  for (const r of regionsIn(doc)) named.add(r.name);
  for (const c of channels.usedChannels(doc)) {
    if (!channels.destinationForChannel(c)) named.add(c);
  }
  return [
    ...DESTINATIONS.filter((d) => d.id !== "region").map(
      (d) => ({ dest: d.id, region: null }) as NotePick,
    ),
    ...[...named].map((name) => ({ dest: "region", region: name }) as NotePick),
  ];
}

/** What to call a destination on this panel: its place, or the writer's own name. */
function destinationLabel(pick: NotePick): string {
  return pick.region ?? t("dest." + pick.dest);
}

/** Rewrite one destination's declaration and put the caret on it. */
function setDestination(fields: channels.DestinationSettings) {
  if (!runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const { text, at } = channels.writeDestination(doc, stylePick, fields, docLang());
  destinationsWiring().replaceAll(text, at);
  renderStylesPanel();
}

/** Rewrite one region's declaration and put the caret on it. */
function setRegion(name: string, fields: channels.RegionSettings) {
  if (!runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const { text, at } = channels.writeRegion(doc, name, fields, docLang());
  destinationsWiring().replaceAll(text, at);
  renderStylesPanel();
}

/**
 * The region's own settings, when the destination is one.
 *
 * The rows themselves are `panelviews.regionPanel`, where a test can build them
 * and press them; this is the half that only the shell can do — reading the
 * document, and writing the edit back through the editor.
 */
function regionRows(doc: string, name: string): Node[] {
  return panelviews.regionPanel(
    { name, held: channels.regionSettingsOf(doc, name) },
    { set: (fields) => setRegion(name, fields) },
  );
}

export function destinationRows(): Node[] {
  const doc = runtime.view ? docTextOf(runtime.view.state.doc) : "";
  const list = styleDestinations();
  // A region the document has since lost is a stale answer, and showing its
  // settings would be the panel describing a document that is not there.
  if (!list.some((p) => samePick(p, stylePick))) stylePick = { dest: "foot", region: null };

  const rows: Node[] = [
    styleRow(
      t("destPick"),
      selectControl(
        list.map((p) => [pickKey(p), destinationLabel(p)] as [string, string]),
        pickKey(stylePick),
        (v) => {
          stylePick = pickFromKey(v);
          renderStylesPanel();
        },
      ),
    ),
  ];

  // What is wrong with this destination against this document, in the same words
  // the chooser uses. A writer who reaches the settings without going through the
  // chooser gets the same sentence — one answer to "what does this cost", not two.
  for (const c of caveatsFor(doc, stylePick)) {
    rows.push(el("p", { class: "styles-note" }, [t(c.why)]));
  }

  const held = channels.settingsOf(doc, stylePick);
  // The knobs, from the one table that pairs each with the prelude's own
  // argument name **and its label**. A row per knob and no second list: a knob
  // that exists in the model and not on this panel is not expressible, which is
  // stronger than a test looking for the table's name in this file — a check
  // that reads source as text passes on a mention of the thing it wants.
  for (const knob of channels.DESTINATION_KNOBS) {
    rows.push(
      styleRow(
        t(knob.label),
        textControl(
          held[knob.key] ?? "",
          (v) => setDestination({ [knob.key]: v.trim() || null }),
          knob.hint,
        ),
      ),
    );
  }

  // The place on the page, when the destination has one. A region is the only
  // destination that is a place rather than only a stream, so this is the only
  // one that has a second half.
  if (stylePick.dest === "region" && stylePick.region) {
    rows.push(...regionRows(doc, stylePick.region));
  }

  // What this destination *is*, said plainly: the same three kinds `_ch_kind`
  // answers, because a writer should not have to hold the rules in their head to
  // know whether the block they have just described grows with its notes.
  const name = channels.destinationChannelName(stylePick);
  const kind = channels.channelsIn(doc).find((c) => c.name === name)?.kind;
  if (kind) rows.push(el("p", { class: "styles-note" }, [t("channelKind." + kind)]));

  rows.push(
    styleRow(
      "",
      el("span", { class: "chan-actions" }, [
        el(
          "button",
          {
            class: "note-use",
            onClick: () => insertSnippet(channels.pickLine(stylePick, docLang())),
          },
          ["+ " + t("channelInsertNote")],
        ),
        // A collected destination prints nowhere until its block is shown. This
        // is the "collected and then never rendered" failure that every one of
        // the eighteen commands could produce, offered as a button instead of as
        // a lint after the fact.
        //
        // Filed at the **end of the document**, through the same rule the lint's
        // own repair uses. Splicing it at the caret is what this button did
        // first, and a call renders what was written before it — so on a
        // document whose caret is on line one it rendered nothing and left the
        // warning standing, which is the button producing the defect it exists
        // to cure.
        ...(kind === "collected" && name && !regionShown(doc, name)
          ? [
              el(
                "button",
                {
                  class: "note-use",
                  onClick: () => {
                    if (!runtime.view) return;
                    const filed = apparatus.fileAtEnd(
                      docTextOf(runtime.view.state.doc),
                      channels.showRegionLine(name, docLang()),
                    );
                    destinationsWiring().replaceAll(filed.text, filed.caret);
                  },
                },
                ["+ " + t("channelInsertDump")],
              ),
            ]
          : []),
      ]),
    ),
  );
  return rows;
}