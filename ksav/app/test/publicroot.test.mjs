// Two bundlers, one rule: `/fonts/…` means `public/fonts/…`.
//
// # The finding (#116)
//
// The editor suite would not start at `HEAD`. `src/styles.css` had just gained
// its first `url("/fonts/…")` references; Vite resolves those against `public/`
// and kept building, and esbuild — which bundles the *tests* — resolved them
// against the filesystem root, so the bundle step failed before a test ran.
//
// A green `vite build` and a green test suite are produced by two different
// programs, and only one of them had ever been asked what a root-absolute URL
// means. That is the class: **an asset rule both bundlers implement, stated in
// one of them.**
//
// So this file asks both about the same string:
//
//   - every root-absolute reference in the stylesheets names a file under
//     `public/`, which is Vite's half and is checked against the disk;
//   - the esbuild resolver maps that same string to that same file, checked by
//     calling the plugin itself.
//
// The end-to-end half needs no test of its own: `test/run.mjs` bundles every
// module through this plugin, so a resolver that stops resolving takes the
// whole suite down — which is exactly how this defect was found.
//
// `runner.test.mjs` forbids test files from invoking esbuild (`prose.test.mjs`
// once grew a private build for two years), so the plugin is exercised through
// the handlers it registers rather than by compiling something.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, ok } from "./harness.mjs";
import { publicRoot } from "../tools/publicroot.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(APP, "src");
const PUBLIC = path.join(APP, "public");

/** Every `.css` under `src/`, so a new stylesheet is swept without an edit. */
function stylesheets(dir = SRC) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...stylesheets(full));
    else if (entry.name.endsWith(".css")) found.push(full);
  }
  return found;
}

/** The root-absolute references in one stylesheet, as written. */
function rootAbsoluteUrls(file) {
  const text = readFileSync(file, "utf8");
  const urls = [];
  for (const m of text.matchAll(/url\(\s*["']?(\/[^"')\s]+)["']?\s*\)/g)) urls.push(m[1]);
  return urls;
}

/** The plugin's own handlers, without esbuild: what would it do with a URL? */
function resolver(appDir) {
  const resolves = [];
  const loads = [];
  publicRoot(appDir).setup({
    onResolve: (options, handler) => resolves.push({ filter: new RegExp(options.filter), handler }),
    onLoad: (options, handler) => loads.push({ filter: new RegExp(options.filter), handler }),
  });
  return { resolves, loads };
}

export async function run() {
  const references = stylesheets().flatMap((file) =>
    rootAbsoluteUrls(file).map((url) => ({ file: path.relative(APP, file), url })),
  );

  ok("the stylesheets reference something root-absolute at all", references.length > 0);

  // --- Vite's half: the URL is a file under public/ ------------------------

  {
    const missing = references.filter((r) => !existsSync(path.join(PUBLIC, r.url.slice(1))));
    check("every root-absolute URL names a file under public/", missing.map((m) => `${m.file}: ${m.url}`), []);
  }

  // --- esbuild's half: the same string resolves to the same file ------------

  {
    const plugin = publicRoot(APP);
    ok("the rule is named", plugin.name === "public-root");

    const { resolves, loads } = resolver(APP);
    check("the rule registers one resolver and one loader", [resolves.length, loads.length], [1, 1]);

    const font = references.find((r) => r.url.startsWith("/fonts/"));
    ok("the stylesheets reference a font (so this test is about something)", Boolean(font));
    if (font) {
      check(
        `the resolver sends ${font.url} to public/`,
        resolves[0].handler({ path: font.url })?.path,
        path.join(APP, "public", font.url.slice(1)),
      );
      // The binaries load as nothing: a unit test is not exercising glyph data.
      check("and the binary loads as an empty strand", loads[0].handler({}), {
        contents: "",
        loader: "empty",
      });
    }

    // Vite's rule, not "anything absolute": the plugin is keyed on the two
    // public directories, so it cannot quietly become a filesystem root.
    check("the rule claims the public directories", resolves[0].filter.test("/fonts/x.otf"), true);
    check("and not the rest of the filesystem", resolves[0].filter.test("/etc/passwd"), false);
  }
}
