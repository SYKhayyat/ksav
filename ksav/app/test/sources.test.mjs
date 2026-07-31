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

  // A helper nothing imports is not a single source of truth.
  let readers = 0;
  for (const f of names) {
    if (f === "diagnostics.ts") continue;
    const body = await readFile(path.join(SRC, f), "utf8");
    if (/\btroubleSaid\b/.test(body)) readers++;
  }
  check("`troubleSaid` has readers", readers > 2, true);
}
