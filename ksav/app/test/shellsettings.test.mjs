// The `shell` settings (#233, step 3; `docs/ui-architecture.md` §7).
//
// What is held here: the stored blob is read field by field (one bad field
// costs that field, not the others); `shellsettings.ts` imports nothing, because
// `settings.ts` calls it while it is itself still being evaluated; and a change
// to the setting redraws the header, which omits the toolbar row under `menus`.

import { check, ok } from "./harness.mjs";
import { readShell, SHELL_DEFAULTS, SHELL_VARIANTS } from "../.tmp-test/shellsettings.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const src = (f) => readFileSync(path.join(dirOf(import.meta.url), "..", "src", f), "utf8");

export async function run() {
  check("nothing stored is the defaults", readShell(undefined), { ...SHELL_DEFAULTS });
  for (const junk of [null, 7, "tabs", [], true]) {
    check(`a stored ${JSON.stringify(junk)} is the defaults`, readShell(junk), { ...SHELL_DEFAULTS });
  }
  check("the default shell is the toolbar", SHELL_DEFAULTS.variant, "toolbar");
  check("three shells", [...SHELL_VARIANTS], ["menus", "toolbar", "tabs"]);

  // Field by field: a blob with one bad field keeps its good ones.
  check(
    "a bad field costs only that field",
    readShell({ variant: "tabs", labels: 7, menubar: "always", contextual: "yes", toolbarTab: "Home!" }),
    { ...SHELL_DEFAULTS, variant: "tabs", menubar: "always" },
  );
  check("an unknown variant falls back", readShell({ variant: "ribbon" }).variant, "toolbar");
  check(
    "every field survives a round trip",
    readShell({ variant: "menus", menubar: "always", toolbarTab: "insert", labels: "names", contextual: false }),
    { variant: "menus", menubar: "always", toolbarTab: "insert", labels: "names", contextual: false },
  );

  // The boot fence: `settings.ts` runs this inside its module-scope read.
  ok("shellsettings.ts imports nothing", !/^\s*import\b/m.test(src("shellsettings.ts")));
  ok("loadSettings reads the shell through readShell", /s\.shell = readShell\(raw\.shell\)/.test(src("settings.ts")));

  // The redraw: a change to `shell` rebuilds the header, keeping the scroll.
  const main = src("main.ts");
  const branch = main.slice(main.indexOf('key === "shell"'));
  ok("applySettingChange has a shell branch", main.includes('key === "shell"'));
  ok("and it rebuilds the chrome", branch.slice(0, 800).includes("rerenderChrome()"));

  const header = src("appheader.ts");
  ok("the header says which shell it is", header.includes('"data-shell": variant'));
  ok("the menus shell draws no toolbar row", header.includes('variant === "toolbar" ? [buildPinnedTab()] : []'));

  // Both doors to the setting: View and the drawer.
  const surface = src("actionsurface.ts");
  for (const id of ["shellMenus", "shellToolbar", "shellTabs"]) ok(`${id} is an action`, surface.includes(`"${id}"`));
  ok("the drawer has the variant row", src("settingsdrawer.ts").includes('shellSelectRow("shellVariantLabel", "variant"'));
}
