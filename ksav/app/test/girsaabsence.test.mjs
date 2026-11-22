// UAT 17 — every Girsa entry point, with no Girsa, says so in a sentence and
// leaves the writer's words alone.
//
// The report: *"the copy-a-link/source-link error when Girsa is unavailable was
// cryptic."* The fix is `girsaNeedsApp` in four places and nothing else, and it
// had no test — so "the error is understandable now" was a claim about one
// string, while the item asks about **every** Girsa-dependent entry point and
// about what happens to the text when there is nowhere to send it.
//
// Two kinds of fence here, and both are needed:
//
//   - **Behavioural**, against the real modules with a stub status bar: with a
//     backend that has no Girsa, `linkifySelection`, `refreshSources` and
//     `askForMekor` each put `girsaNeedsApp` in the slot and leave the document
//     exactly as it was — and with a Girsa that *throws*, the sentence is the
//     trouble sentence rather than the needs-app one, because the two are
//     different facts and telling the writer the wrong one sends them installing
//     software they already have.
//   - **Structural**, over `src/girsa.ts`: every exported function that reaches a
//     service asks `sourcesOf(runtime.backend)` first and reports before it
//     sends anything. A new entry point added later cannot be silent.

import { check, installChrome, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as runtime from "../.tmp-test/runtime.mjs";
import { fakeView } from "./harness.mjs";
import { t, setLang } from "../.tmp-test/i18n.mjs";
import { linkifySelection, refreshSources, askForMekor } from "../.tmp-test/girsa.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(join(HERE, "../src/girsa.ts"), "utf8");

/** A backend that has no loopback to Girsa, whatever else it can do. */
const noGirsa = { kind: "wasm", async scan(text) { return scanner(text); }, async compile() { return null; } };
const scanner = (text) => ({ nodes: [], roots: [], comments: [], recoveryComments: [], delims: [], raw: [], strings: [], contentGroups: [], byStart: new Map(), text });

export async function run() {
  const chrome = installChrome();
  try {
    setLang("he");
    const sentence = t("girsaNeedsApp");

    // -------------------------------------------------- the sentence itself
    //
    // "Understandable" is not measurable, but three of its parts are: it names
    // the thing that is missing, it names where that thing lives (beside this
    // application, not inside a browser tab), and it exists in both languages
    // rather than being one of the two.
    ok("the sentence names a specific gap rather than an error", sentence.length > 20, sentence);
    ok("…and says where the missing thing lives", /לצד/u.test(sentence), sentence);
    const saidEn = (setLang("en"), t("girsaNeedsApp"));
    ok("…and it is written in English as well as Hebrew", saidEn.length > 20 && saidEn !== sentence, saidEn);
    setLang("he");

    // -------------------------------------------------- no Girsa: says so
    //
    // Each of the three routes a writer can press. The document is put back
    // unchanged in every case, which is the half of the item that is about *the
    // text* rather than about the wording.
    const prose = "עיין בשולחן ערוך, אורח חיים סימן א";
    runtime.setBackend(noGirsa);
    runtime.setView(fakeView(prose, 0));
    runtime.view.dispatch({ selection: { anchor: 0, head: prose.length } });

    chrome.clear();
    await linkifySelection();
    check("linkify with no Girsa says what is missing", chrome.status(), sentence);
    check("…and the selected prose is exactly as written", runtime.view.state.doc.toString(), prose);
    check("…and the writer can still edit it — the caret is where it was", runtime.view.state.selection.main.head, prose.length);

    chrome.clear();
    await refreshSources();
    check("refresh with no Girsa says the same thing", chrome.status(), sentence);
    check("…and the document is untouched", runtime.view.state.doc.toString(), prose);

    chrome.clear();
    await askForMekor();
    check("ask-for-a-mekor with no Girsa says the same thing", chrome.status(), sentence);
    check("…and the document is untouched again", runtime.view.state.doc.toString(), prose);

    // ------------------------------------------- Girsa present but unreachable
    //
    // The other direction, and the one that was never tested: a backend that
    // *has* Girsa and cannot reach it must not be reported as "open Girsa
    // beside Ksav" — it is running. The transport's own words go through
    // `troubleSaid`, so the sentence is neither the needs-app one nor empty.
    const unreachable = {
      kind: "http",
      inbox: async () => [],
      async linkify() {
        // **The code, not the sentence.** Girsa's English `Display` is not API —
        // `prohibitions.test.mjs` forbids matching it, and forbids even writing it
        // down outside the corpus of real strings. What crosses the seam is
        // `code()`, so that is what is thrown at.
        throw Object.assign(new Error("refused"), { code: "post-unreachable" });
      },
      async scan(text) { return scanner(text); },
      async compile() { return null; },
    };
    runtime.setBackend(unreachable);
    runtime.setView(fakeView(prose, 0));
    runtime.view.dispatch({ selection: { anchor: 0, head: prose.length } });
    chrome.clear();
    await linkifySelection();
    ok("a Girsa that cannot be reached is not reported as a missing Girsa", chrome.status() !== sentence, chrome.status());
    ok("…and the writer is told something", chrome.status().length > 0, chrome.status());
    check("…and the prose survives that too", runtime.view.state.doc.toString(), prose);
    check("…and it is an error, not a success", chrome.statusClass(), "err");

    // -------------------------------------------------- the structural half
    //
    // A new entry point is the way this comes back: `dropIntoGirsa` was written
    // by copying `refreshSources`' guard, which is fine, and the next one may be
    // written by copying a function that had no guard at all.
    const src = source();
    const fns = src.split(/\n(?=export (?:async )?function )/u).filter((f) => /^export /u.test(f));
    ok("the module has entry points to check", fns.length > 3, `${fns.length}`);
    const sends = fns.filter((f) => /\bgirsa\.[a-zA-Z]+\(/u.test(f));
    ok("and some of them reach the service", sends.length >= 3, `${sends.length}`);
    for (const fn of sends) {
      const name = /^export (?:async )?function (\w+)/u.exec(fn)?.[1] ?? "?";
      const guardAt = fn.indexOf("sourcesOf(runtime.backend)");
      const firstSend = fn.indexOf("girsa.");
      ok(
        `${name} asks whether Girsa is reachable before it sends anything`,
        guardAt >= 0 && guardAt < firstSend,
        `guard at ${guardAt}, first service call at ${firstSend}`,
      );
      // **Awaiting is the difference between "the writer asked" and "a courtesy
      // fired on its own".** The routes a writer presses must say what is
      // missing; `tellGirsaWhereItIs` fires after a save to tell the library
      // where the file went, and its own comment says a line about it on every
      // save *"would be noise about a courtesy the writer never asked for"*.
      // So the rule is not a list of names to exempt — it is the shape of the
      // call: awaited → report; fire-and-forget → silence, and silence that is
      // checked, so neither side can drift.
      const awaited = /\bawait girsa\./u.test(fn);
      if (awaited) {
        ok(`${name} says which gap it is`, fn.includes("girsaNeedsApp"), "");
      } else {
        ok(
          `${name} stays silent because nobody asked it anything`,
          !fn.includes("girsaNeedsApp") && /void girsa\./u.test(fn),
          fn.slice(0, 160),
        );
      }
    }
    // And the sentence is never softened into a bare "failed" on the way out.
    notRefusalWithoutSentence(src);
  } finally {
    chrome.restore();
  }
}

/** Every `if (!girsa)` in the file leads to the sentence, not to a return. */
function notRefusalWithoutSentence(src) {
  const refusals = [...src.matchAll(/if \(!girsa\) \{([\s\S]*?)\n  \}/gu)].map((m) => m[1]);
  ok("every no-Girsa branch was found", refusals.length >= 4, `${refusals.length}`);
  for (const [i, body] of refusals.entries()) {
    ok(`refusal ${i + 1} reports rather than returning silently`, /setStatus\(t\("girsaNeedsApp"\)/u.test(body), body.trim().slice(0, 120));
  }
}
