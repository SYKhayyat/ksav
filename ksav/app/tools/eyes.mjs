// Eyes.
//
// Every instrument in this repository so far has measured text. None of them has
// looked at the thing. `indent.test.mjs` can prove the planner indents level 2 by
// two spaces and would still be perfectly happy if the renderer drew nothing at
// all, which is the same class of failure as a green test over a tautology: the
// instrument is measuring something adjacent to the thing.
//
// So: serve the built app, drive it in the Chromium that is already installed,
// type a document into the editor, and write a PNG. No Rust server — `ksav serve`
// embeds `dist` at *compile* time and takes an hour to link on this machine, and
// none of it is needed to look at the editor. `vite preview` serves the same
// `dist`.
//
// Usage:  node tools/eyes.mjs <out.png> [--toggle=<flagKey>] [--set=<key>:<value>] [--caret=<0..1>]
//
// Deliberately not a test. It writes a file and asserts nothing, because the thing
// it is for is being looked at, and a harness that only reports pass/fail is the
// harness that reports green while measuring nothing.

import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(APP, "dist");

/** The Chromium on this machine, if there is one. Nix puts it somewhere unpickable. */
function findChromium() {
  const roots = ["/nix/store", "/usr/lib", "/usr/bin", "/opt"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    if (root.endsWith("/bin")) {
      if (existsSync(root)) return root;
      continue;
    }
    try {
      for (const d of readdirSync(root)) {
        if (!d.includes("chrom")) continue;
        for (const p of [join(root, d, "bin", "chromium"), join(root, d, "bin", "chrome")]) {
          if (existsSync(p)) return p;
        }
      }
    } catch {
      /* unreadable root, keep looking */
    }
  }
  return null;
}

/** A document with nesting worth looking at — three levels, a paragraph break, a short tag. */
const DOC = `#מדף_א[זהו המדף הראשון ובו מילים רבות כדי שיהיה צריך להיפרד לשורות נפרדות ולהיות מקולט בעומק השורה הזו כאן עוד מילה]

פסקה שנייה בתוך אותו מדף כדי לבדוק שהשורה הריקה משתפת את רמת ההזחה ולא נופלת לשוליים כאן עוד מילה שלישית]

#הערה[הערה קצרה]

#הדגשה[מילה אחת בלבד לא אמורה להיפרד כלל כי היא קצרה מדי]
`;

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--")) ?? "/tmp/ksavv/eyes.png";
const toggle = (args.find((a) => a.startsWith("--toggle=")) ?? "").split("=")[1];
// `--set=key:value` for settings that are numbers, not flags. #85's dimming is a
// dial (0-100) and `--toggle` would set it to `true`, which is neither 0 nor a dial.
const sets = args.filter((a) => a.startsWith("--set=")).map((a) => a.slice("--set=".length));
/**
 * Where the caret goes, as a fraction of the document.
 *
 * Needed and not optional. Every feature in this family is a function of **where the
 * caret is** — #85 dims outside the tag the caret is in, and its rule is that a caret
 * in no tag dims nothing at all — so a screenshot taken with the caret at position 0
 * shows an editor that looks completely un-dimmed, and it is indistinguishable from
 * the feature being broken. It is not a bug report, it is the picture lying.
 */
const caretArg = (args.find((a) => a.startsWith("--caret=")) ?? "").split("=")[1];
const caret = caretArg === undefined ? 0.5 : Number(caretArg);
const settings = { ...(toggle ? { [toggle]: true } : {}) };
for (const pair of sets) {
  const i = pair.indexOf(":");
  const key = pair.slice(0, i);
  const raw = pair.slice(i + 1);
  settings[key] = /^-?[0-9.]+$/.test(raw) ? Number(raw) : raw === "true";
}

if (!existsSync(DIST)) {
  console.error(`no build at ${DIST} — run: npm run build`);
  process.exit(1);
}

const executablePath = findChromium();
if (!executablePath) {
  console.error("no Chromium found under /nix/store or /usr — install one");
  process.exit(1);
}

const port = 8731 + (process.pid % 200);
const profile = mkdtempSync(join(tmpdir(), "eyes-"));
const server = spawn(
  "npx",
  ["vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
  { cwd: APP, stdio: "ignore", env: { ...process.env } },
);

const stop = () => {
  try {
    server.kill();
  } catch {
    /* already gone */
  }
};
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview never answered on ${port}`);
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=2"],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

  // Settings are put in place **before the first navigation**, via an init script,
  // rather than by setting localStorage and reloading. The reload version worked
  // right up until it did not: after `page.reload` the editor had not come back and
  // the harness reported a selector timeout, which is indistinguishable from "the
  // feature broke the app". One navigation, no second chance to lose the thing.
  if (settings) {
    await page.addInitScript((kv) => {
      for (const [k, v] of Object.entries(kv)) {
        const raw = JSON.parse(localStorage.getItem("ksav.settings") ?? "{}");
        raw[k] = v;
        localStorage.setItem("ksav.settings", JSON.stringify(raw));
      }
    }, settings);
  }

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".cm-content", { timeout: 30000 });

  await page.evaluate(
    ({ doc, caret }) => {
      const view = document.querySelector(".cm-content").cmView?.view;
      if (!view) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
      view.dispatch({
        selection: { anchor: Math.round(view.state.doc.length * caret) },
        // The decorations above are rebuilt from the caret, and a selection dispatch
        // is what makes them. `scrollIntoView` so the line is actually on screen —
        // otherwise the screenshot shows the top of the file with the caret below it.
        scrollIntoView: true,
      });
    },
    { doc: DOC, caret },
  );
  await page.waitForTimeout(500);

  const png = await page.screenshot({ fullPage: false });
  writeFileSync(out, png);
  console.log(`wrote ${out}`);
  const text = await page.evaluate(() => document.querySelector(".cm-content")?.innerText ?? "");
  console.log("--- editor shows ---");
  console.log(text.split("\n").slice(0, 14).join("\n"));
  await browser.close();
} catch (e) {
  console.error(`eyes failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  stop();
}