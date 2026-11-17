// The one check that opens a window.
//
//   node tools/render-check.mjs
//
// # What it checks
//
// That the shipped webview, in the shell this repository builds, hands the page
// a display it can lay itself out on: `devicePixelRatio` positive, a viewport
// with a positive size, and a document that has actually drawn something.
//
// # Why it exists
//
// On NixOS 26.05 under native Wayland, WebKitGTK 2.52.5 gives the page
// `devicePixelRatio = -1/96` and `innerWidth = -96 × outerWidth`. The chrome
// collapses and the editor is unusable. `GDK_BACKDEN`/`GDK_BACKEND=x11` avoids
// it, which `src-tauri/src/main.rs` now arranges on startup, and the cause is
// still unknown (#103).
//
// Nothing measured that. A `cargo test` never opens a window, so the entire
// shipped UI had no coverage at all — which is why this file is #101, filed when
// the defect was found rather than guessed at.
//
// # Why it asks the page
//
// Because for one day the investigation drew conclusion after conclusion from
// **screenshots**, and the windows stack behind one another: a screenshot read as
// proof that an application rendered was, several times, an unrelated Firefox or
// Konsole window. Every such reading was wrong, and each one cost an hour. A
// number the page reports about itself cannot be fooled that way, so that is the
// only evidence this check accepts.
//
// The measurement is taken by `render_probe` in the shell, compiled in only for
// this check via `--features dpr-probe`. A downloaded binary carries neither the
// command nor the thread that asks for it.
//
// # What it cannot tell you
//
// This asserts a symptom, not a cause, and it runs on whatever display the
// machine has. Under `xvfb-run` — which is what CI uses — that is X11, the path
// that already worked, so **this does not catch a regression in the native
// Wayland path.** It catches a regression in the path most people get after the
// startup fallback, and it catches the app failing to render at all. A developer
// on native Wayland running the gate by hand gets the stronger check for free.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { displayPresent, renderEnv, renderNodes, shellBinary } from "./renderenv.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = path.join(APP, "src-tauri");

/** The last few lines of a captured stream, so a failure can quote the app. */
function tail(text, lines = 20) {
  const kept = String(text || "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(-lines);
  return kept.length ? kept.map((line) => `      ${line}`).join("\n") : "      (nothing)";
}

/** The window label the shell's probe asks for, and the record says it found. */
const WANTED_WINDOW = "main";

/** How long the page gets to answer, in milliseconds. */
const ANSWER_BY_MS = 25_000;

/**
 * The variable that asks for the evidence to be kept, and where CI points it.
 *
 * A directory rather than a flag, so the runner decides where artefacts go and
 * the check does not have to know what a runner is. Unset means keep nothing,
 * which is what a reader on their own machine wants.
 */
export const KEEP_ENV = "KSAV_RENDER_KEEP";

/**
 * What this run knows, collected as it goes rather than reconstructed after.
 *
 * A failure path is a `fail()` in eight places, and every one of them has to
 * leave the same record behind; a record assembled at the end would be missing
 * from exactly the runs that needed it.
 */
const recorded = { facts: {}, streams: {}, scratch: null };

/**
 * Copies everything a finished run knows into a directory that outlives it.
 *
 * # Why (#190)
 *
 * This check is the only one here that can fail for a reason the tree cannot
 * explain, and it used to delete its own evidence: both records went into a
 * `mkdtemp` and a `finally` removed it, the app's stdout and stderr were
 * captured and only `tail`-ed into the message, and no job in the repository
 * uploaded an artefact. A 25-second failure's entire record was one AT-SPI
 * warning line — so every attempt at the defect behind #189 cost a push and
 * returned no more than the attempt before it.
 *
 * `streams` are written whole. The tail in the message stays, because a message
 * has to stay readable, but a tail is not a record.
 *
 * Exported so the behaviour can be tested without opening a window.
 */
export function keepEvidence({ scratch, keep, facts = {}, streams = {} }) {
  if (!keep) return null;
  mkdirSync(keep, { recursive: true });
  const kept = [];
  for (const name of ["measurement.json", "boot.json"]) {
    const from = scratch ? path.join(scratch, name) : null;
    if (from && existsSync(from)) {
      copyFileSync(from, path.join(keep, name));
      kept.push(name);
    }
  }
  for (const [name, text] of Object.entries(streams)) {
    writeFileSync(path.join(keep, name), String(text ?? ""), "utf8");
    kept.push(name);
  }
  // `run.json` names itself in its own list, so a reader who finds the directory
  // can see it is complete rather than inferring it from the file names.
  kept.push("run.json");
  writeFileSync(
    path.join(keep, "run.json"),
    `${JSON.stringify({ ...facts, kept }, null, 2)}\n`,
    "utf8",
  );
  return keep;
}

/** Keep what this run has, if it was asked to. Returns where, or `null`. */
function saveEvidence(verdict) {
  const keep = process.env[KEEP_ENV];
  if (!keep) return null;
  try {
    return keepEvidence({
      scratch: recorded.scratch,
      keep,
      facts: { ...recorded.facts, verdict },
      streams: recorded.streams,
    });
  } catch (e) {
    // A failure to keep the evidence must not hide the failure that caused it.
    console.error(`  could not keep evidence in ${keep}: ${e.message}`);
    return null;
  }
}

/** Fail with this rather than a stack trace: it is the whole point of the file. */
function fail(message) {
  const kept = saveEvidence("failed");
  console.error(`\n✗ desktop render check\n\n${message}\n`);
  if (kept) {
    console.error(`  The whole record of this run is in ${kept}\n`);
  } else {
    console.error(
      "  Set KSAV_RENDER_KEEP=<dir> to keep the records, the page's own answer and\n" +
        "  the application's whole output, when this happens again.\n",
    );
  }
  process.exit(1);
}

function run(argv, cwd) {
  const done = spawnSync(argv[0], argv.slice(1), { cwd, stdio: "inherit" });
  if (done.error) fail(`could not start \`${argv.join(" ")}\`: ${done.error.message}`);
  if (done.status !== 0) fail(`\`${argv.join(" ")}\` exited ${done.status}`);
}

/** A JSON file the shell wrote, or `null` if it is absent or unreadable. */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** The window labels the shell said it had, or `null` when it said nothing. */
function labelsOf(booted) {
  return Array.isArray(booted?.labels) ? booted.labels : null;
}

/** The window label the running shell asked for — read from the shell, not us. */
function askedOf(booted) {
  return typeof booted?.asked === "string" ? booted.asked : WANTED_WINDOW;
}

/**
 * Why a silent run has no window record, in the smallest number of words.
 *
 * Three answers, because they send a reader to three different places and the
 * check used to have one (#196): a `dpr-probe` build that exited **0** without
 * reaching `setup` handed its command line to a Ksav that was already running
 * and quit — the single-instance plugin's whole job, and nothing whatever to do
 * with a webview. Read as one answer, it printed "the webview did not start",
 * which is the sentence #189 is an open investigation into, so a developer who
 * hit it locally believed they had reproduced a CI failure.
 *
 * Exported so `test/rendercheck.test.mjs` can fence all of them without starting
 * a process.
 *
 * @param {{status: number|null, signal: string|null, timedOut: boolean}|null} child
 *   how the application ended, from `spawnSync`
 * @returns {{kind: "handover"|"no-webview"|"stalled", sentence: string, advice: string}}
 */
export function whyNoWindow(child) {
  // `spawnSync` leaves `status` null when it kills on the deadline and puts the
  // signal there instead, so `status === 0` is the whole test: a probe that was
  // killed cannot look like a handover.
  const exitedCleanly = !!child && child.status === 0 && !child.signal;
  // And the deadline itself is not a field. `spawnSync` reports its own timeout
  // as `error.code === "ETIMEDOUT"`, with `status: null` and `signal: "SIGTERM"` —
  // the same shape a *passing* run has, because the deadline kills the editor as
  // designed. Reading a `timedOut` property that nothing sets is how this branch
  // first shipped and never fired, which the end-to-end run caught and the unit
  // tests could not: they were handing it the field they believed in.
  const timedOut =
    !!child && (child.timedOut === true || child.error?.code === "ETIMEDOUT");
  if (exitedCleanly) {
    return {
      kind: "handover",
      sentence:
        "never created — the shell exited 0 without reaching setup, which is what a\n" +
        "             window handover looks like: another Ksav is already running",
      advice:
        "  A clean exit is not a webview fault. `tauri-plugin-single-instance` hands a\n" +
        "  second launch to the first one and exits 0, so the probe never drew anything.\n" +
        "  Close the running Ksav (nothing here is wrong with the build) and run this\n" +
        "  again. A `dpr-probe` build no longer registers the plugin at all (#196), so\n" +
        "  meeting this line means an older shell was built — `cargo clean -p app`, or\n" +
        "  rebuild, and it goes away.\n",
    };
  }
  // The deadline case, and it is the one this check meets most often — a run that
  // is still alive when the answer is missing. `timedOut` is the fact to read:
  // `status` is null in every timed-out run *and* in every passing one, because
  // the deadline kills the editor as designed, so `status: null` alone says
  // nothing.
  //
  // What is known here is only that the shell did not record a window in the time
  // it had. "The webview did not start" is a further claim — a cause named from an
  // absence — and #189 is what that sentence cost: three rounds of investigation
  // went looking for a webview fault in a process that was still alive. So this
  // says what was measured, and the advice says where to look next.
  if (timedOut) {
    return {
      kind: "stalled",
      sentence:
        "never created — the shell was still running at the deadline and never\n" +
        "             reached setup, so no window record was written",
      advice:
        "  The process is alive, so this is neither a crash nor a handover: either the\n" +
        "  webview never started, or it started and the shell stalled before recording\n" +
        "  it. Nothing in this run tells those apart — the app's own output above is the\n" +
        "  record, and `KSAV_RENDER_KEEP=<dir>` keeps it when this happens again.\n",
    };
  }
  return {
    kind: "no-webview",
    sentence: "never created — the webview did not start",
    advice: "",
  };
}

/**
 * Which side of the window a silent run points at, in a sentence.
 * *
 * Three states and three different fixes, and the check used to name one of
 * them — "the page loaded and did not run the probe" — whichever had happened,
 * which sends a reader to the frontend for a window the shell never had (#188).
 * Exported so the three answers are fenced by `test/rendercheck.test.mjs`: each
 * one is a claim about which half of the program to open next.
 *
 * @param {string[]|null} labels  window labels the shell recorded, or `null`
 * @param {string} asked          the label the probe asked for
 */
export function whyNoAnswer(labels, asked) {
  if (labels === null) {
    return (
      "  No window record was written, so the shell did not reach its setup: the\n" +
      "  webview did not start. That points at the shell and its build, not at\n" +
      "  the page.\n"
    );
  }
  if (!labels.includes(asked)) {
    return (
      `  The shell has no window labelled ${JSON.stringify(asked)}; the ones it has are\n` +
      `  ${JSON.stringify(labels)}. So nothing was ever asked of the page, and the\n` +
      "  page is not the side to look at.\n\n" +
      "  The label is declared in src-tauri/tauri.conf.json and asked for in\n" +
      "  src-tauri/src/lib.rs (`render_probe::WINDOW_LABEL` and `get_webview_window`);\n" +
      "  the two have to be the same name.\n"
    );
  }
  return (
    "  The window exists and the probe was evaluated into it, so the page is the\n" +
    "  side to look at: the command is registered, the page loaded, and nothing\n" +
    "  came back.\n"
  );
}

// The check runs only when this file is the program.
//
// `test/rendercheck.test.mjs` imports `whyNoAnswer` to fence the three answers a
// silent run can give. An import must not open a window: it did, and the test
// paid two minutes of cargo and a live webview for a string function — and then
// failed, because the check it had not asked for ran against whatever was in the
// tree.
const invokedDirectly =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  // A display is the whole premise. Failing loudly is deliberate: a check that
  // quietly reports success without one is worse than no check, and this file
  // exists because nothing measured any of this.
  //
  // What counts as a display is `displayPresent`'s decision rather than this
  // file's, because it is wrong in one direction that is easy to write and hard
  // to notice: Windows and macOS have a display and no `DISPLAY` variable, and
  // this test refused to start there for want of a name those systems do not
  // use (#193).
  // This is the one caller that means *this* machine on purpose: the check
  // measures the webview it is running on (#192).
  if (!displayPresent({ env: process.env, platform: process.platform })) {
    fail(
      "no display. `DISPLAY` and `WAYLAND_DISPLAY` are both unset, so there is no\n" +
        "  window to render and nothing to measure.\n\n" +
        "  On a desktop session this check runs as-is. Headless, run it under a\n" +
        "  virtual display:\n\n" +
        "      xvfb-run -a node tools/gate.mjs shell-render   (in ksav/)\n\n" +
        "  Note that Xvfb is X11, which is the backend that already worked — it\n" +
        "  will not exercise the native Wayland path where the defect appears.",
    );
  }

  // The webview is served from `dist/`, so a shell built without it has no page to
  // measure and would report a failure that is really a missing build step.
  if (!existsSync(path.join(APP, "dist", "index.html"))) {
    console.log("→ dist/ is missing, building the frontend first");
    run(["npm", "run", "build"], APP);
  }

  // A record that the shell reached `setup`, which runs only once a window and its
  // webview exist. Without it, "the page never answered" cannot tell a webview
  // that failed to start from a page that started and never ran the probe — and
  // those are different bugs with different fixes (#171).
  const dir = mkdtempSync(path.join(tmpdir(), "ksav-render-"));
  const answer = path.join(dir, "measurement.json");
  const boot = path.join(dir, "boot.json");
  // Named before the first thing that can fail, so a `fail()` at any point below
  // has a record to keep (#190). The render decisions are added once they are
  // made, four lines down.
  recorded.scratch = dir;
  recorded.facts = {
    at: new Date().toISOString(),
    platform: process.platform,
    display: process.env.DISPLAY ?? null,
    waylandDisplay: process.env.WAYLAND_DISPLAY ?? null,
    binary: null,
    child: null,
    answerMs: ANSWER_BY_MS,
  };

  // What this machine can render with, decided before the window is asked.
  const nodes = renderNodes();
  const { env, cleared, notes } = renderEnv({
    display: process.env.DISPLAY,
    waylandDisplay: process.env.WAYLAND_DISPLAY,
    renderNodes: nodes,
    platform: process.platform,
  });
  for (const note of notes) console.log(`→ ${note}`);
  recorded.facts = { ...recorded.facts, renderNodes: nodes, env, cleared, notes };
  const childEnv = { ...process.env, ...env, KSAV_DPR_OUT: answer, KSAV_DPR_BOOT: boot };
  for (const key of cleared) delete childEnv[key];

  /** What a timeout means here, in the runner's own terms. */
  function whySilent(child) {
    const facts = [
      `  display:   DISPLAY=${process.env.DISPLAY ?? "(unset)"}, ` +
        `WAYLAND_DISPLAY=${cleared.includes("WAYLAND_DISPLAY") ? "(pinned to X11)" : (process.env.WAYLAND_DISPLAY ?? "(unset)")}`,
      `  rendering: ${nodes.length ? nodes.join(", ") : "no DRM render node — software path"}` +
        (Object.keys(env).length ? ` (${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(" ")})` : ""),
    `  window:    ${
      existsSync(boot)
        ? `created; present ${JSON.stringify(labelsOf(readJson(boot)))}, probe asks for ${JSON.stringify(askedOf(readJson(boot)))}`
        : whyNoWindow(child).sentence
    }`,
      `  exit:      ${child.status === null ? "still running when the deadline passed" : `status ${child.status}`}, ` +
        `signal ${child.signal ?? "none"}`,
      "",
      "  The shell's own output:",
      tail(child.stdout),
      tail(child.stderr),
    ].join("\n");
    return facts;
  }

  try {
    // The crate's own target directory, not a throwaway one. A private
    // `--target-dir` makes every run a cold build of Typst and WebKitGTK — over
    // fifteen minutes, measured — which is not a cost a pre-push check can ask for
    // twice. Sharing it costs nothing: cargo keys its cache on the feature set, so
    // the probe build and the production build sit beside each other and neither
    // disturbs the other.
    console.log("→ building the shell with the render probe");
    run(["cargo", "build", "--features", "dpr-probe,tauri/custom-protocol"], SHELL);

    const binary = path.join(SHELL, "target", "debug", shellBinary({ platform: process.platform }));
    if (!existsSync(binary)) fail(`expected a binary at ${binary} and there is none`);

    console.log("→ asking the page what it thinks the display is");
    // Output is captured rather than inherited so a failure can quote the app.
    // On a pass there is nothing here worth showing; on a timeout it is the only
    // evidence in the run about what the webview did.
    //
    // X11 and Wayland get a `bash -c exec` wrapper, which is what the Linux
    // investigation was written against. Windows has no `bash` on a plain
    // machine, and the wrapper buys nothing there — `exec` is what a direct
    // spawn already is — so the binary is started directly (#193).
    // The spawn in one place, so the retry below starts the same program the run
    // started rather than a second description of it.
    const startChild = (extra = {}) => {
      const options = {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: ANSWER_BY_MS,
        env: { ...childEnv, ...extra },
      };
      return process.platform === "win32"
        ? spawnSync(binary, [], options)
        : spawnSync("bash", ["-c", `exec ${JSON.stringify(binary)}`], options);
    };
    const child = startChild();
    // The whole of what the app said, kept rather than tail-ed. The message below
    // still shows the last lines, because a message has to stay readable; this is
    // the record (#190).
    recorded.streams = {
      "app.out.log": child.stdout ?? "",
      "app.err.log": child.stderr ?? "",
    };
    recorded.facts.binary = binary;
    recorded.facts.child = {
      status: child.status,
      signal: child.signal ?? null,
      timedOut: child.error?.code === "ETIMEDOUT",
    };

    // A timeout is the expected end: the application is an editor, and nothing
    // asks it to quit. `SIGTERM` from `timeout` is a pass, not a crash.
    if (child.error && child.error.code !== "ETIMEDOUT") {
      fail(`could not start the application: ${child.error.message}`);
    }

    if (!existsSync(answer)) {
      // The webview's own words, collected by the run that failed rather than by
      // the person reading it later.
      //
      // WebKitGTK says nothing at its default verbosity — which is why every
      // attempt at #189 came back with one AT-SPI warning line and no more
      // information than "the window was never created". Turning its logging on
      // has to happen in the child's environment, so it cannot be decided after
      // the fact; the honest place is here, on the failure path.
      //
      // The cost is one more ANSWER_BY_MS on a run that has already failed, and
      // it is not paid on a pass. Against that: a push-and-read round trip is the
      // alternative, and that is what this replaces.
      console.log("→ the page never answered; asking the webview what it thinks");
      const verbose = startChild({ WEBKIT_DEBUG: "all", G_MESSAGES_DEBUG: "all" });
      const debugLog = `${verbose.stdout ?? ""}${verbose.stderr ?? ""}`;
      recorded.streams["app.err.debug.log"] = debugLog;
      recorded.facts.child.debug = {
        status: verbose.status,
        signal: verbose.signal ?? null,
        bytes: debugLog.length,
        answered: existsSync(answer),
      };

      // `whyNoAnswer` names which half of the program to open next, and it is the
      // right paragraph for two of the three no-window states. In the third the
      // shell never should have quit, so its paragraph would contradict the line
      // above it (#196).
      const noWindow = whyNoWindow(child);
      const said = recorded.facts.child.debug;
      fail(
        `the application ran and the page never answered (${ANSWER_BY_MS}ms).\n\n` +
          "  Nothing was written to the measurement file. What the run looked like:\n\n" +
          whySilent(child) +
            "\n\n" +
          (noWindow.kind === "no-webview"
            ? whyNoAnswer(
                labelsOf(existsSync(boot) ? readJson(boot) : null),
                askedOf(existsSync(boot) ? readJson(boot) : null),
              )
            : noWindow.advice) +
            "\n\n" +
            (said
              ? `  WebKit was asked to explain itself and said ${said.bytes} bytes ` +
                `(status ${said.status ?? "none"}${said.answered ? ", and the page answered on the retry" : ""}).\n` +
                "  That output is `app.err.debug.log` beside this run's evidence."
              : "  WebKit's own log was not collected."),
      );
    }

    const m = JSON.parse(readFileSync(answer, "utf8"));
    const problems = [];
    if (!(m.devicePixelRatio > 0)) {
      problems.push(
        `devicePixelRatio is ${m.devicePixelRatio}, which is not positive.\n` +
          "    A negative scale is what the WebKitGTK/Wayland defect looks like\n" +
          "    from inside the page (#103); a plausible-but-wrong one would be a\n" +
          "    different bug.",
      );
    }
    if (!(m.innerWidth > 0) || !(m.innerHeight > 0)) {
      problems.push(
        `the viewport is ${m.innerWidth}×${m.innerHeight}, which has no area to draw in.\n` +
          `    The window itself is ${m.outerWidth}×${m.outerHeight}.`,
      );
    }
    if (!m.appChildren) {
      problems.push(
        `#app has no children, so the editor never mounted.\n` +
          `    The document has ${m.bodyChildren} elements and is at ${m.href}`,
      );
    }
    // The chrome's own geometry, which is how #103 presented: a ribbon whose
    // group captions were drawn on top of one another. A negative scale is the
    // cause this check was built for; these are the shape of the damage, and a
    // check that reports only the cause would pass a layout that is broken for a
    // different reason.
    if (!(m.ribbonGroups > 0)) {
      problems.push(
        `the ribbon has no command groups at all, so the toolbar is empty.\n` +
          "    A registry that resolved empty renders as a shorter ribbon with no\n" +
          "    explanation (#105); this is the desktop build, where that is a live\n" +
          "    possibility rather than a theoretical one.",
      );
    }
    if (m.ribbonOverlaps?.length) {
      problems.push(
        `ribbon groups overlap: ${m.ribbonOverlaps.join(", ")}\n` +
          "    The group captions overprinting one another is what #103 looked like\n" +
          "    from inside the page.",
      );
    }
    if (m.ribbonOutsideHeader?.length) {
      problems.push(
        `ribbon groups are drawn outside the header: ${m.ribbonOutsideHeader.join(", ")}\n` +
          "    A row taller than the bar it belongs to is the same collapse seen\n" +
          "    from the other side.",
      );
    }
    if (m.preview && m.preview.scrollWidth > m.preview.clientWidth + 1) {
      problems.push(
        `the preview is ${m.preview.scrollWidth}px wide inside a ${m.preview.clientWidth}px pane.\n` +
          "    The page overflows its pane, which is the clipping #103 reported.",
      );
    }

    if (problems.length) {
      fail(
        `the application rendered into a viewport it cannot use:\n\n` +
          problems.map((p) => `  - ${p}`).join("\n\n"),
      );
    }

    // The measurement is part of the record even on a pass: the numbers are what
    // a later run is compared against, and "it was 1.25 last week" is the only
    // way to know a scale regression from a scale that was always like that.
    recorded.facts.measurement = m;
    const keptOnPass = saveEvidence("passed");
    if (keptOnPass) console.log(`→ the record of this run was kept in ${keptOnPass}`);

    console.log(
      `\n✓ the page reports dPR ${m.devicePixelRatio}, ` +
        `viewport ${m.innerWidth}×${m.innerHeight}, ` +
        `header ${m.headerHeight}px, #app with ${m.appChildren} children, ` +
        `ribbon ${m.ribbonGroups} groups with no overlap`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
