// The ribbon when the command list is not there.
//
// # The finding (#105)
//
// `buildToolbar()`'s button builder returned `el("span")` for a command the
// registry did not contain — an element with no glyph, no accessible name and
// no tooltip. So a registry that resolved **empty** did not fail; it deleted the
// ribbon. The writer saw a shorter toolbar and nothing anywhere said why, which
// is indistinguishable from a product that has fewer tools — and no test could
// see it, because a DOM assertion that asks "is this button present?" passes
// when the button is absent for the wrong reason.
//
// Two states are asserted here, and they are different answers:
//
//   - **no commands at all** — the whole registry is missing, so the toolbar
//     says so in words, in the surface the writer is looking at;
//   - **one command missing** — the rest of the ribbon is usable, so the button
//     keeps its place, struck through, with a title that explains it.
//
// Both are failures of the same fetch. The difference is what a writer can do
// about it: reload, or use the rest of the ribbon meanwhile.

import { check, notOk, ok } from "./harness.mjs";
import { fakeView, installChrome } from "./harness.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { buildToolbar } from "../.tmp-test/ribbon.mjs";
import { t } from "../.tmp-test/i18n.mjs";
import { commands } from "../tools/commands.mjs";

/** Every node in a built tree, depth first. */
function all(nodes) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  for (const n of nodes) walk(n);
  return out;
}

/** Every string of text in it, which is what a reader sees. */
function words(nodes) {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string") return out.push(n);
    if (!n || typeof n !== "object") return;
    for (const c of n.children ?? []) walk(c);
  };
  for (const n of nodes) walk(n);
  return out;
}

/** A control with no accessible name and no text: what `el("span")` produced. */
function anonymous(nodes) {
  return all(nodes).filter(
    (n) =>
      (n.tagName === "SPAN" || n.tagName === "BUTTON") &&
      !(n.title ?? "") &&
      !(n["aria-label"] ?? "") &&
      words([n]).join("").trim() === "",
  );
}

export async function run() {
  installChrome();
  // A well-formed editor state, because `buildToolbar` asks the document what
  // language it is written in. In a filtered run `runtime.view` is undefined and
  // the code takes its no-view branch; in the full suite a previous test may
  // have left a view-shaped object without a selection, which is a failure about
  // test order rather than about the ribbon.
  runtime.setView(fakeView("שלום"));
  const reg = commands();
  ok("the real registry has commands to lose", reg.length > 5);

  // ---------------------------------------------- what counts as arrived

  {
    ok("a fetched list of commands is one the chrome can be built from", runtime.registriesArrived(reg));
    notOk("an empty list is a failure, not a smaller product", runtime.registriesArrived([]));
    notOk("and nothing at all is not an arrival", runtime.registriesArrived(undefined));
  }

  // ---------------------------------------------- the whole registry is gone

  {
    runtime.setRegistries([], []);
    const bar = buildToolbar();
    const text = words([bar]).join(" ");

    ok("an empty registry still draws a toolbar", bar.className.includes("toolbar"));
    check("and it says, in words, that the command list did not load", text, t("registriesFailed"));
    check("it contains no anonymous control to click", anonymous([bar]), []);

    // The message is the one the boot path shows, so a writer who reaches the
    // ribbon and a writer who reads the banner are told the same thing.
    check("the words are the registries-failed sentence", text.includes(t("registriesFailed")), true);
  }

  // ---------------------------------------------- one command out of many

  {
    const without = "הדגשה";
    runtime.setRegistries(
      reg.filter((c) => c.he !== without),
      [],
    );
    const bar = buildToolbar();
    const missing = all([bar]).filter((n) => n["data-missing"] === without);

    check("a missing command keeps its button", missing.length, 1);
    ok("the button still shows its glyph", words([missing[0]]).includes("B"));
    ok(
      "and it explains itself instead of being silent",
      (missing[0]?.title ?? "").includes(t("registryMissing")),
    );
    check("no control is left without a name", anonymous([bar]), []);
  }

  // ---------------------------------------------- and with everything there

  {
    runtime.setRegistries(reg, []);
    const bar = buildToolbar();
    check("a complete registry has no missing buttons", all([bar]).filter((n) => n["data-missing"]), []);
  }
}
