// A guard over the source itself, for the mistake that was spread across it.
//
// Six sites appended a raw caught error to a translated label
// (`${t("saveFailed")} — ${String(e)}`) and one showed nothing but the English.
// A unit test of any one of them passes while the other five are still wrong,
// which is the reason this is a file-reading test and not a unit test.
//
// Mirrors `Girsa/app/test/sources.test.mjs`, because it is the same class of
// defect in the sibling repository and there is no reason for two shapes of the
// same guard.

import { check } from "./harness.mjs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = path.resolve(HERE, "..", "src");

/**
 * A raw caught error put where a reader will read it.
 *
 * `String(e)` is fine as an argument to `troubleSaid` or `rawOf`, and fine as a
 * `title`. It is not fine inside a message, a status line or a `textContent`.
 */
const RAW_INTO_UI = [
  /setStatus\(\s*(?:`[^`]*\$\{\s*)?String\(\s*e\w*\s*\)/,
  /\.(?:textContent|innerText)\s*=[^;]*String\(\s*e\w*\s*\)/,
  // A translated label with the machine's own string glued onto it. This is the
  // exact shape of all six sites.
  /t\("[A-Za-z]+"\)\}?\s*—\s*\$\{\s*String\(\s*e\w*\s*\)\s*\}/,
];

/** A comment is not something a reader sees; these files discuss the bug. */
function isComment(line) {
  const s = line.trim();
  return s.startsWith("//") || s.startsWith("*") || s.startsWith("/*");
}

export async function run() {
  const names = (await readdir(SRC)).filter((f) => f.endsWith(".ts"));
  check("there is source to check", names.length > 15, true);

  const leaks = [];
  for (const f of names) {
    if (f === "diagnostics.ts") continue; // the one module allowed to hold the raw string
    const body = await readFile(path.join(SRC, f), "utf8");
    body.split("\n").forEach((line, i) => {
      if (!isComment(line) && RAW_INTO_UI.some((re) => re.test(line))) leaks.push(`${f}:${i + 1}`);
    });
  }
  check("no raw caught error reaches the writer as the message", leaks, []);

  // ---------------------------------------------- page setup comes from the document (B26)
  //
  // > *"Direction, font, margins and paper live in settings, so opening an English
  // > document and then a Hebrew one means changing direction by hand."*
  //
  // Page setup is a property of the document now, and `settings` still holds the
  // same fields — as the defaults a *new* document starts from. So a module that
  // reads `settings.dir` is reading the wrong one, and reading it in the place a
  // writer would notice: the editor's direction, the preview's, the .docx export's.
  // There were ten such reads and every one of them was correct before B26.
  const PAGE = [
    "font", "size_pt", "margin_cm", "dir", "numbering", "justify",
    "line_spacing_em", "para_spacing_em", "first_line_indent_em",
    "columns", "paper", "hebrew_numbering", "header", "footer",
  ];
  const stale = [];
  for (const f of names) {
    if (f === "settings.ts") continue; // where both live, and the only place that may
    const body = await readFile(path.join(SRC, f), "utf8");
    body.split("\n").forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      for (const field of PAGE) {
        // `settings.dir = "ltr"` at boot is a write to the *default* for new
        // documents, which is what that object is for now. A read is the bug.
        if (new RegExp("settings\\." + field + "\\b(?!\\s*=[^=])").test(line)) {
          stale.push(f + ":" + (i + 1) + " " + field);
        }
      }
    });
  }
  check("no module reads page setup off the application's settings", stale, []);

  // A helper nothing imports is not a single source of truth.
  let readers = 0;
  for (const f of names) {
    if (f === "diagnostics.ts") continue;
    const body = await readFile(path.join(SRC, f), "utf8");
    if (/\btroubleSaid\b/.test(body)) readers++;
  }
  check("`troubleSaid` has readers", readers > 2, true);
}
