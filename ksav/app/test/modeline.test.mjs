// The mode line and the open-box picker: what they offer, and what they refuse.
//
// `decisions/2026-11-23-frontends-are-views-in-boxes.md`: each box's head reads
// `scope · mode · link → leader`, each part clickable, and every combination
// that cannot work is **refused with a reason** rather than left out. So the
// questions here are the grid — which scope × mode pairs a box can hold today,
// and that each one it cannot hold says why — and the head itself: three parts,
// the link part only when there is something to link to, naming its leader.

import { check, ok, notOk } from "./harness.mjs";
import * as modeline from "../.tmp-test/modeline.mjs";
import * as panes from "../.tmp-test/panes.mjs";
import * as panestate from "../.tmp-test/panestate.mjs";
import * as views from "../.tmp-test/views.mjs";

/** The least document `el()` needs, keeping attributes and children. */
function fakeDom() {
  const doc = {
    createElement: (tag) => ({
      tagName: String(tag).toUpperCase(),
      className: "",
      attrs: {},
      children: [],
      setAttribute(k, v) {
        this.attrs[k] = String(v);
      },
      addEventListener() {},
      append(...c) {
        this.children.push(...c);
      },
    }),
  };
  const had = globalThis.document;
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  return () => {
    if (had === undefined) delete globalThis.document;
    else Object.defineProperty(globalThis, "document", { value: had, configurable: true, writable: true });
  };
}

/** Every element under `n`, depth first. */
const all = (n) => (n && typeof n === "object" ? [n, ...(n.children ?? []).flatMap(all)] : []);
const textOf = (n) => (typeof n === "string" ? n : (n.children ?? []).map(textOf).join(""));

export async function run() {
  // ------------------------------------------------------------ the grid

  {
    const can = (scope, mode) => modeline.boxRefusal({ scope, mode }) === null;
    ok("the raw file in source is a box", can({ part: "file" }, "source"));
    ok("the body as pages is a box", can({ part: "body" }, "preview"));
    ok("the body's outline is a box", can({ part: "body" }, "outline"));
    ok("the notes list is a box", can({ part: "notes" }, "outline"));
    notOk("a preview of notes is not, and says so", can({ part: "notes" }, "preview"));
    check(
      "…with the design's own sentence",
      modeline.boxRefusal({ scope: { part: "notes" }, mode: "preview" })?.key,
      "view.notesHaveNoPages",
    );
    // Every scope the picker offers has a row for every mode, and every row it
    // cannot take has a reason a writer can read — never a blank.
    for (const scope of modeline.SCOPES) {
      for (const m of views.modes()) {
        const r = modeline.boxRefusal({ scope, mode: m.id });
        if (r) ok(`${JSON.stringify(scope)} × ${m.id} is refused in words`, modeline.reason(r).length > 3, modeline.reason(r));
      }
    }
    // What is allowed is exactly what something draws: a pair the registry
    // passes and no box can show would be a picker row that opens a blank.
    for (const scope of modeline.SCOPES) {
      for (const m of views.modes()) {
        const view = { scope, mode: m.id };
        check(`${JSON.stringify(scope)} × ${m.id}: allowed iff drawn`, modeline.boxRefusal(view) === null, panes.rendererOf(view) !== null);
      }
    }
    ok("the picker offers more than today's boxes, so the grid shows what is coming", modeline.SCOPES.some((s) => views.modes().every((m) => modeline.boxRefusal({ scope: s, mode: m.id }))));
  }

  // ------------------------------------------------------------ the head

  const restore = fakeDom();
  try {
    panes._resetIds();
    const src = panes.leaf("source");
    let tree = panes.split(src, src.id, "row", panes.leaf("preview"));
    const prev = panes.leaves(tree)[1];
    tree = panes.follow(tree, prev.id, src.id, "scroll").tree;
    panestate.setPaneTree(tree);

    const head = modeline.modeLine(panes.find(tree, prev.id), { relinked() {} });
    const parts = all(head).filter((n) => n.attrs?.["data-ml"]).map((n) => n.attrs["data-ml"]);
    check("a box's head has its three parts, in the order they are read", parts, ["scope", "mode", "link"]);
    const link = all(head).find((n) => n.attrs?.["data-ml"] === "link");
    ok("the link part names the box it follows", textOf(link).includes(`→ ${panestate.paneNumberOf(src.id)}`), textOf(link));
    check("…and the kind of link", link.attrs["data-link"], "scroll");
    const mode = all(head).find((n) => n.attrs?.["data-ml"] === "mode");
    check("the mode part re-localises by its key", mode.attrs["data-i18n"], "viewMode.preview");

    const lead = modeline.modeLine(panes.find(tree, src.id), { relinked() {} });
    const leadLink = all(lead).find((n) => n.attrs?.["data-ml"] === "link");
    check("a leader follows nothing itself", leadLink.attrs["data-link"], "unlinked");
    notOk("…so it names no leader", textOf(leadLink).includes("→"));

    panestate.setPaneTree(src);
    const alone = modeline.modeLine(src, { relinked() {} });
    notOk("a lone box offers no link: there is nothing to link to", all(alone).some((n) => n.attrs?.["data-ml"] === "link"));
  } finally {
    restore();
  }
}
