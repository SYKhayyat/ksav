import { check, ok } from "./harness.mjs";
import {
  EXPORTS,
  chips,
  docTitle,
  exportItems,
  fileItems,
  isSep,
  templateItems,
} from "../.tmp-test/header.mjs";
import { setLang } from "../.tmp-test/i18n.mjs";

// What the header says about the state of the application, asked directly.
//
// Every chip in this chrome is a glyph, a tooltip and two booleans, decided from
// the settings. All twenty of those decisions lived inline in `buildHeader`,
// which is 200 lines of `main.ts` — the one module no test can import. So the
// chipbar, which is the surface whose entire job is *reporting the state*, was
// the least checkable thing in the application.
//
// That matters more here than almost anywhere else, because a chip is not a
// control that happens to have a label: the label **is** the feature. A theme
// toggle showing the sun while the theme is dark is not cosmetic — it is the
// interface lying about the setting it exists to display, which is this
// repository's whole bug family with the volume turned up.

/** A base state with everything off, so a test states only what it varies. */
const OFF = {
  theme: "light",
  prose: false,
  layout: "two",
  previewSide: "left",
  outline: false,
  nikud: false,
  notesPane: false,
  recording: false,
};

const by = (state, id) => chips(state).find((c) => c.id === id);

export async function run() {
  setLang("he");

  // -------------------------------------------------- the bar is the whole bar

  {
    const bar = chips(OFF);
    ok("the chipbar has every chip", bar.length === 20, `${bar.length} chips`);
    check(
      "…each with an id, a glyph and a name",
      bar.filter((c) => !c.id || !c.glyph || !c.title).map((c) => c.id ?? "(none)"),
      [],
    );
    const ids = bar.map((c) => c.id);
    check("…and no id twice", ids.filter((id, i) => ids.indexOf(id) !== i), []);
  }

  // ------------------------------------------------ a toggle names its own state

  {
    // The four toggles that change glyph. Each names the state it would switch
    // *to*, which is the only rule that can be applied consistently — and the
    // pair has to agree: `🅐` with "prose" would be a button whose picture and
    // whose words describe opposite actions.
    check("light theme offers the moon", by({ ...OFF, theme: "light" }, "theme").glyph, "🌙");
    check("dark theme offers the sun", by({ ...OFF, theme: "dark" }, "theme").glyph, "☀");
    check("code mode offers prose", by({ ...OFF, prose: false }, "prose").glyph, "＃");
    check("prose mode offers code", by({ ...OFF, prose: true }, "prose").glyph, "🅐");
    check("idle offers record", by(OFF, "record").glyph, "⏺");
    check("recording offers stop", by({ ...OFF, recording: true }, "record").glyph, "⏹");
  }
  {
    // …and the *name* moves with the glyph. This is the assertion that would
    // have caught a toggle whose picture was updated and whose tooltip was not.
    const code = by({ ...OFF, prose: false }, "prose").title;
    const prose = by({ ...OFF, prose: true }, "prose").title;
    ok("the prose toggle's name changes with it", code !== prose, `${code} / ${prose}`);
    const idle = by(OFF, "record").title;
    const on = by({ ...OFF, recording: true }, "record").title;
    ok("so does the recorder's", idle !== on, `${idle} / ${on}`);
  }

  // ------------------------------------------------------- on means on

  {
    for (const [key, id] of [
      ["outline", "outline"],
      ["nikud", "nikud"],
      ["notesPane", "notesPane"],
      ["prose", "prose"],
      ["recording", "record"],
    ]) {
      check(`${id} is not active when ${key} is off`, by(OFF, id).active ?? false, false);
      check(`…and is when it is on`, by({ ...OFF, [key]: true }, id).active, true);
    }
    // And nothing else claims to be a toggle. A chip that is `active` on a state
    // nothing set is a chip reporting on something that is not there.
    check(
      "no chip is active in a state where nothing is on",
      chips(OFF).filter((c) => c.active).map((c) => c.id),
      [],
    );
  }

  // ---------------------------------------- unavailable means unavailable

  {
    // The finding this one is named after. `previewSideToggle` passed
    // `"chip disabled"`, the stylesheet greyed it, and `iconBtn` had no notion
    // of the state — so the control looked greyed, clicked, saved a setting,
    // rebuilt the chrome and announced itself to a screen reader as enabled.
    // `dom.ts` reads the class now; this is the half that decides *when*.
    check("the preview side is a question a split view has", by(OFF, "previewSide").disabled, false);
    for (const layout of ["page", "source"]) {
      check(
        `…and one a ${layout} layout does not`,
        by({ ...OFF, layout }, "previewSide").disabled,
        true,
      );
    }
    check(
      "nothing else is ever unavailable",
      chips({ ...OFF, layout: "page" }).filter((c) => c.disabled).map((c) => c.id),
      ["previewSide"],
    );
  }

  // --------------------------------------------- every glyph exists to be shown

  {
    // Four layouts × four sides. A missing entry in either table is `undefined`
    // rendered as the string "undefined" into a button, which is the shape a
    // fifth layout would arrive in.
    for (const layout of ["two", "page", "source"]) {
      const c = by({ ...OFF, layout }, "layout");
      ok(`the ${layout} layout has a glyph`, !!c.glyph && c.glyph !== "undefined", c.glyph);
      ok(`…and names itself`, c.title.includes(":"), c.title);
    }
    for (const previewSide of ["left", "right", "top", "bottom"]) {
      const c = by({ ...OFF, previewSide }, "previewSide");
      ok(`the ${previewSide} side has a glyph`, !!c.glyph && c.glyph !== "undefined", c.glyph);
    }
  }

  // ------------------------------------------------------------ the language

  {
    setLang("he");
    check("a Hebrew interface offers English", by(OFF, "language").glyph, "EN");
    const he = by(OFF, "settings").title;
    setLang("en");
    check("an English interface offers Hebrew", by(OFF, "language").glyph, "עב");
    const en = by(OFF, "settings").title;
    ok("and the names are translated", he !== en, `${he} / ${en}`);
    setLang("he");
  }

  // ------------------------------------------------------------- the menus

  {
    // With the File System Access API the last item saves *to a file the writer
    // keeps*; without it the browser can only push a copy into the downloads
    // folder. Calling both of them "Save as…" promises a binding that will not
    // exist, which is the sort of promise this application is careful about.
    const real = fileItems(true).find((e) => e.id === "saveAs").label;
    const copy = fileItems(false).find((e) => e.id === "saveAs").label;
    ok("save-as says which one it means", real !== copy, `${real} / ${copy}`);
    check("and nothing else moves with it", fileItems(true).length, fileItems(false).length);
  }
  {
    // Nine, not one. A menu where only the item under test can be found is a
    // menu that will grow a tenth item nothing can reach — and
    // `.github/scripts/acceptance.mjs` finds these by `data-export`, which is
    // the id.
    const items = exportItems();
    check("every export is addressable", items.length, EXPORTS.length);
    check(
      "…by an id, not by a localised label",
      items.filter((r) => !r.id || !r.label).map((r) => r.id),
      [],
    );
    ok("…and the PDF one is in there", items.some((r) => r.id === "exportPdf"));
  }
  {
    const tpl = [{ id: "sefer", he: "ספר", en: "Sefer", desc_he: "תיאור", desc_en: "A book" }];
    const mine = [{ id: "u1", name: "שלי" }];

    check("no user templates, no separator", templateItems(tpl, []).filter(isSep).length, 0);
    check("some of each, one separator", templateItems(tpl, mine).filter(isSep).length, 1);
    // A menu that draws a divider under its last item looks like a menu that
    // failed to load the rest.
    check("no builtins, no separator", templateItems([], mine).filter(isSep).length, 0);

    const rows = templateItems(tpl, mine).filter((e) => !isSep(e));
    check("a shipped template carries its description", rows[0].desc, "תיאור");
    check("…and the writer's own is marked as theirs", rows[1].label, "★ שלי");
    check("…and only theirs can be deleted", rows.filter((r) => r.removable).map((r) => r.id), [
      "u1",
    ]);
    setLang("en");
    check("the label follows the interface language", templateItems(tpl, [])[0].label, "Sefer");
    setLang("he");
  }

  // -------------------------------------------------------- the document name

  {
    const n = docTitle("קונטרס", "kuntres.ksav");
    check("the title bar shows the document", n.title, "קונטרס");
    check("…and the file it is bound to", n.file, "kuntres.ksav");
    // Twenty controls announcing "rename" is twenty controls a screen-reader
    // user cannot tell apart.
    ok("…and the button says what it renames", n.label.includes("קונטרס"), n.label);
    const none = docTitle(undefined, undefined);
    check("an unnamed document is empty, not `undefined`", [none.title, none.file], ["", ""]);
  }
}
