// The `shell` settings (#233; `docs/ui-architecture.md` §7).
//
// What is held here: there is one shell, so the setting holds only what the
// writer changes about it — collapsed, Quick Access, their ribbon; the stored
// blob is read field by field (one bad field costs that field, not the others);
// `shellsettings.ts` imports nothing, because `settings.ts` calls it while it is
// itself still being evaluated; and a change to the setting redraws the header.

import { check, ok, notOk } from "./harness.mjs";
import * as S from "../.tmp-test/shellsettings.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const { readShell, SHELL_DEFAULTS } = S;
const src = (f) => readFileSync(path.join(dirOf(import.meta.url), "..", "src", f), "utf8");

export async function run() {
  check("nothing stored is the defaults", readShell(undefined), { ...SHELL_DEFAULTS });
  for (const junk of [null, 7, "tabs", [], true]) {
    check(`a stored ${JSON.stringify(junk)} is the defaults`, readShell(junk), { ...SHELL_DEFAULTS });
  }
  check("the ribbon opens expanded, with nothing added to Quick Access", SHELL_DEFAULTS, { collapsed: false, quick: [] });
  notOk("there is no choice of shell", "SHELL_VARIANTS" in S);

  // Field by field: a blob with one bad field keeps its good ones.
  check(
    "a bad field costs only that field",
    readShell({ collapsed: "yes", quick: ["bold", 7, "", "bold", "x".repeat(201), "nikud"] }),
    { collapsed: false, quick: ["bold", "nikud"] },
  );
  check("a stored shell from before is just the defaults", readShell({ variant: "menus", menubar: "always", labels: "names" }), { ...SHELL_DEFAULTS });
  check("every field survives a round trip", readShell({ collapsed: true, quick: ["print"] }), { collapsed: true, quick: ["print"] });
  check("Quick Access is a row, not a ribbon", readShell({ quick: Array.from({ length: 40 }, (_, i) => "a" + i) }).quick.length, 16);

  // The boot fence: `settings.ts` runs this inside its module-scope read.
  ok("shellsettings.ts imports nothing", !/^\s*import\b/m.test(src("shellsettings.ts")));
  ok("loadSettings reads the shell through readShell", /s\.shell = readShell\(raw\.shell\)/.test(src("settings.ts")));

  // The redraw: a change to `shell` rebuilds the header, keeping the scroll.
  const main = src("main.ts");
  const branch = main.slice(main.indexOf('key === "shell"'));
  ok("applySettingChange has a shell branch", main.includes('key === "shell"'));
  ok("and it rebuilds the chrome", branch.slice(0, 800).includes("rerenderChrome()"));

  // One shell: no variant is read, and the ribbon is always drawn.
  const header = src("appheader.ts");
  notOk("the header names no shell", /data-shell|variant/.test(header));
  ok("the header always draws the ribbon", /\bbuildRibbon\(/.test(header));
  notOk("no action picks a shell", /shellMenus|shellToolbar|shellTabs/.test(src("actionsurface.ts") + src("placement.ts")));
  notOk("nor a drawer row", /shellSelectRow|shellVariant|shellMenubar|shellContextual/.test(src("settingsdrawer.ts")));
}
