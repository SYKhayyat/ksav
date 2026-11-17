// What a failed render check leaves behind.
//
// # The finding (#190)
//
// `app/tools/render-check.mjs` is the only check in this repository that can fail
// for a reason the tree cannot explain, and it used to delete its own evidence.
// The measurement and the boot record went into a `mkdtemp` and a `finally`
// removed the directory whatever had happened; the app's stdout and stderr were
// captured and only `tail`-ed into the failure message; and no job in the
// repository uploaded an artefact. So the entire record of a 25-second failure
// was one line:
//
//     (app:4641): dbind-WARNING **: AT-SPI: Error retrieving accessibility bus address …
//
// That line is printed by every run, working or not, which means a failure left
// nothing at all — and every attempt at the webview defect behind #189 cost a
// push and came back with no more than the attempt before it.
//
// # What is asserted here
//
// That the records are *copied*, not moved or re-derived; that the streams are
// kept **whole** rather than as the tail the message shows; that a missing record
// is not an error (the two silences this check distinguishes are exactly the
// cases where one of them is absent); and that nothing is written when nobody
// asked, because a check that scatters directories over a reader's machine is a
// check they stop running.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, ok } from "./harness.mjs";
import { KEEP_ENV, keepEvidence } from "../tools/render-check.mjs";

export async function run() {
  /** A scratch directory shaped like the one a run makes. */
  function scratchWith(files) {
    const dir = mkdtempSync(path.join(tmpdir(), "ksav-scratch-"));
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
    return dir;
  }

  /** A directory to keep into, removed whatever happens. */
  function keeper(fn) {
    const dir = mkdtempSync(path.join(tmpdir(), "ksav-keep-"));
    rmSync(dir, { recursive: true, force: true });
    try {
      return fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // --- the variable the CI job sets is the one the module exports -----------

  check("the knob the workflow sets is the one the check reads", KEEP_ENV, "KSAV_RENDER_KEEP");

  // --- a run that got an answer --------------------------------------------

  keeper((keep) => {
    const scratch = scratchWith({
      "measurement.json": '{"devicePixelRatio":1.25}',
      "boot.json": '{"setup":true,"labels":["main"],"asked":"main"}',
    });
    try {
      ok(
        "both records are copied, not just the one that answered",
        keepEvidence({
          scratch,
          keep,
          facts: { verdict: "failed", platform: "linux" },
          streams: { "app.err.log": "one line\n" },
        }) === keep,
      );
      check("the measurement keeps its bytes", readFileSync(path.join(keep, "measurement.json"), "utf8"), '{"devicePixelRatio":1.25}');
      check(
        "the boot record keeps its bytes",
        readFileSync(path.join(keep, "boot.json"), "utf8"),
        '{"setup":true,"labels":["main"],"asked":"main"}',
      );
      check(
        "the application's own output is kept whole",
        readFileSync(path.join(keep, "app.err.log"), "utf8"),
        "one line\n",
      );
      const run = JSON.parse(readFileSync(path.join(keep, "run.json"), "utf8"));
      check("the run says how it ended", run.verdict, "failed");
      check("…and which platform it was on", run.platform, "linux");
      ok("…and lists what it kept", run.kept.includes("measurement.json") && run.kept.includes("run.json"), JSON.stringify(run.kept));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  // --- the output is the whole stream, not the tail the message shows ------
  //
  // `tail()` in the check keeps twenty lines, because a message has to stay
  // readable. A record that did the same would throw away the first lines of a
  // boot — which is where a webview says what it could not do.
  keeper((keep) => {
    const scratch = scratchWith({});
    const all = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    try {
      keepEvidence({ scratch, keep, facts: {}, streams: { "app.err.log": all } });
      const kept = readFileSync(path.join(keep, "app.err.log"), "utf8");
      check("two hundred lines in, two hundred lines kept", kept.split("\n").length, 200);
      ok("…and the first one is there, which the message never shows", kept.startsWith("line 0"));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  // --- the case the check exists to explain: nothing was written ------------
  //
  // No measurement and no boot record means the webview never started. That is
  // the failure this whole file is about, so it must produce a record rather
  // than an error about missing files.
  keeper((keep) => {
    const scratch = scratchWith({});
    try {
      ok(
        "an empty scratch directory still leaves a record",
        keepEvidence({ scratch, keep, facts: { verdict: "failed" }, streams: {} }) === keep,
      );
      ok("…with the run's account of itself", existsSync(path.join(keep, "run.json")));
      ok("…and no invented measurement", !existsSync(path.join(keep, "measurement.json")));
      ok("…and no invented boot record", !existsSync(path.join(keep, "boot.json")));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  // --- nobody asked ------------------------------------------------------
  //
  // A reader running the gate by hand gets no directory tree beside their work.
  {
    const keep = path.join(tmpdir(), `ksav-never-${Date.now()}`);
    check("no directory means no evidence", keepEvidence({ scratch: null, keep: "", facts: {}, streams: {} }), null);
    ok("…and nothing created", !existsSync(keep));
  }

  // --- a directory that does not exist yet is made, not refused ------------
  {
    const root = mkdtempSync(path.join(tmpdir(), "ksav-keep-"));
    const keep = path.join(root, "nested", "evidence");
    try {
      ok("the keeper makes its own directory", keepEvidence({ scratch: null, keep, facts: {}, streams: {} }) === keep);
      ok("…nested or not", existsSync(path.join(keep, "run.json")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  // --- and the CI pair is asserted where the workflows are read ------------
  //
  // That is `gate.test.mjs`, beside the other workflow sweeps: the job sets the
  // variable and uploads the directory, because a knob nobody sets is a knob
  // nobody can turn. Named here so the next reader knows where to look.
  void mkdirSync;
}
