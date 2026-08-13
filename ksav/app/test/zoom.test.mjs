// Two zooms, and which of them a key means.
//
// The finding is *"zoom in the source and in the preview"*, and the state it was
// found in was one zoom that only the preview read. So the assertions here are
// about the two things that were missing rather than about arithmetic: that
// there are two surfaces, that each names the settings field it lives in, and
// that the rule deciding which one a Ctrl+= lands on is a rule and not a guess
// buried in `main.ts`.

import { check, ok, notOk } from "./harness.mjs";
import * as zoom from "../.tmp-test/zoom.mjs";
import { DEFAULTS } from "../.tmp-test/settings.mjs";
import { DEFAULT_KEYS, readable } from "../.tmp-test/bindings.mjs";

export async function run() {

// ---------------------------------------------------------------- two of them

{
  check("there are two surfaces", [...zoom.SURFACES], ["source", "preview"]);
  check("each names its own settings field", zoom.FIELD_OF, {
    source: "sourceZoom",
    preview: "zoom",
  });
  // The preview's field keeps the old name on purpose: settings are stored by
  // key, so renaming it would throw away the zoom of everybody who has set one.
  check("the preview keeps the field it has always had", zoom.FIELD_OF.preview, "zoom");
  ok("and both ship at 100%", DEFAULTS.zoom === 1 && DEFAULTS.sourceZoom === 1);
}

// ---------------------------------------------------------------- the rule

{
  // The one line of policy the module exists for.
  check("the caret in the text means the text", zoom.surfaceOf(true), "source");
  check("anywhere else means the page", zoom.surfaceOf(false), "preview");
}

// ---------------------------------------------------------------- the bounds

{
  check("a zoom below the floor is the floor", zoom.clamp(0.1), zoom.MIN);
  check("and above the ceiling is the ceiling", zoom.clamp(9), zoom.MAX);
  check("nonsense is 100%", zoom.clamp(NaN), zoom.DEFAULT);
  ok("the floor is below the ceiling", zoom.MIN < zoom.MAX);
  ok("and 100% is between them", zoom.MIN <= zoom.DEFAULT && zoom.DEFAULT <= zoom.MAX);
}

{
  check("one step out", zoom.step(1, 1), 1.1);
  check("one step in", zoom.step(1, -1), 0.9);
  // The reason this module rounds at all: 0.7 + 0.1 is 0.7999999999999999 in
  // every JavaScript engine there is, and that number reaches a stylesheet as
  // `calc(15px * 0.7999999999999999)` and a spinner the writer cannot get back
  // to a round figure with.
  check("and never on a float's raw answer", zoom.step(0.7, 1), 0.8);
  check("stepping in from the floor stays at the floor", zoom.step(zoom.MIN, -1), zoom.MIN);
  check("and out from the ceiling at the ceiling", zoom.step(zoom.MAX, 1), zoom.MAX);
}

{
  // Every step between the two ends lands on a tenth, in both directions. The
  // one-off checks above would pass on an implementation that rounds once and
  // then drifts.
  const tenths = (z) => Math.abs(Math.round(z * 10) - z * 10) < 1e-9;
  let up = zoom.MIN;
  const out = [];
  for (let i = 0; i < 40; i++) {
    up = zoom.step(up, 1);
    if (!tenths(up)) out.push(up);
  }
  check("stepping from floor to ceiling never leaves a tenth", out, []);
  check("and arrives at the ceiling", up, zoom.MAX);
}

// ---------------------------------------------------------------- as a person reads it

{
  check("a zoom prints as a percentage", zoom.percent(1), "100%");
  check("including a stepped one", zoom.percent(zoom.step(1, 1)), "110%");
  check("and it is clamped like everything else", zoom.percent(9), "200%");
}

// ---------------------------------------------------------------- the keys

{
  // Three keys, and the minus one is the reason `readable` had to learn that its
  // separator is also a key.
  check("bigger", DEFAULT_KEYS.zoomIn, "Mod-=");
  check("smaller", DEFAULT_KEYS.zoomOut, "Mod--");
  check("back to 100%", DEFAULT_KEYS.zoomReset, "Mod-0");
  check("and the minus key prints as the minus key", readable(DEFAULT_KEYS.zoomOut), "Ctrl+-");
  notOk(
    "not as a plus, which is what splitting on the separator gave",
    readable(DEFAULT_KEYS.zoomOut).endsWith("++"),
  );
  check("the plus side is unharmed", readable(DEFAULT_KEYS.zoomIn), "Ctrl+=");
}

}
