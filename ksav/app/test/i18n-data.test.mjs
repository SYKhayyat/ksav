// The translation shelves are deliberately separate from the lookup runtime.
// Keep this test about the data boundary: both shelves must be real, complete
// string dictionaries and i18n.ts must expose the same objects through DICTS.

import { check, ok } from "./harness.mjs";
import { EN } from "../.tmp-test/i18n-en.mjs";
import { HE } from "../.tmp-test/i18n-he.mjs";
import { DICTS, getLang, isRtlUi, setLang, t, tf } from "../.tmp-test/i18n.mjs";

export function run() {
  ok("the Hebrew data module is a dictionary", HE && typeof HE === "object");
  ok("the English data module is a dictionary", EN && typeof EN === "object");
  ok("the runtime exposes the Hebrew data object", DICTS.he === HE);
  ok("the runtime exposes the English data object", DICTS.en === EN);

  const missing = Object.keys(HE).filter((key) => !(key in EN));
  const extra = Object.keys(EN).filter((key) => !(key in HE));
  check("the language shelves have the same keys", { missing, extra }, { missing: [], extra: [] });

  const invalid = [HE, EN].flatMap((dict) =>
    Object.entries(dict)
      .filter(([key, value]) => typeof value !== "string" || value.length === 0)
      .map(([key]) => key),
  );
  check("every translation entry is a non-empty string", invalid, []);

  setLang("en");
  check("t still reads the English shelf", t("appName"), EN.appName);
  check("tf still interpolates data from the English shelf", tf("msg.named", "one", "two"), "one: two");
  check("the runtime language remains English", getLang(), "en");
  check("the English shelf remains left-to-right", isRtlUi(), false);

  setLang("he");
  check("the runtime language can switch back", getLang(), "he");
  check("the Hebrew shelf remains right-to-left", isRtlUi(), true);
}
