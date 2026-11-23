// What a failing assertion says, measured as a process rather than as a function.
//
// `ok` and `notOk` were handed a detail by 842 call sites and printed none of it
// (`harness.mjs`, where the reasoning is written down). The failure a reader saw
// named the assertion and not the observation — `got false, wanted something
// truthy` — which is the difference between "the code is wrong" and "the fixture
// is", and nothing on the line said which.
//
// The fence cannot be a call inside this file: a deliberately failing assertion
// moves the suite's own tally, and the file would go red for checking that a red
// line looks right. So it is a **subprocess** — `process.execPath` running the
// real `harness.mjs` and printing what it printed. That is also the closest thing
// to the thing under test: `run.mjs` reads the same console output.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { check, ok } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Run the real harness in a child and return its printed lines and its tally. */
function assertionsInChild() {
  const script = `
    import { ok, notOk, check, counts } from ${JSON.stringify(pathToFileURL(join(HERE, "harness.mjs")).href)};
    const said = [];
    const real = console.log;
    console.log = (...a) => said.push(a.join(" "));
    ok("a false thing", false, "the slot said (network error)");
    notOk("a true thing", true, "the slot said (imported)");
    // A pass says nothing at all: the detail must not turn the suite's one line
    // per red file into one line per assertion.
    ok("a true thing with a detail", true, "nobody should read this");
    check("two against three", 2, 3);
    console.log = real;
    real(JSON.stringify({ said, counts: counts() }));
  `;
  const out = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
  });
  const lines = (out.stdout ?? "").trim().split("\n").filter(Boolean);
  let parsed = null;
  try {
    parsed = JSON.parse(lines[lines.length - 1] ?? "null");
  } catch {
    /* silent: reported as a failed assertion below, with the raw output */
  }
  return { parsed, stderr: out.stderr ?? "", raw: out.stdout ?? "" };
}

export async function run() {
  const { parsed, stderr, raw } = assertionsInChild();
  ok(
    "the harness runs as a child process and reports",
    parsed !== null,
    `stdout ${JSON.stringify(raw.slice(0, 200))} stderr ${JSON.stringify(stderr.slice(0, 200))}`,
  );
  if (!parsed) return;
  const { said, counts } = parsed;

  // The three reads below are the fence. The first two are the ones that were
  // missing; the third is that a pass stayed silent, which is what makes printing
  // the detail affordable.
  check("a failure line per failing assertion, not per pass", said.length, 3);
  ok(
    "a failing ok prints the detail it was handed",
    (said[0] ?? "").includes("the slot said (network error)"),
    said[0],
  );
  ok(
    "a failing notOk prints the detail it was handed",
    (said[1] ?? "").includes("the slot said (imported)"),
    said[1],
  );
  ok(
    "and both still say what the value was",
    (said[0] ?? "").includes("got false") && (said[1] ?? "").includes("got true"),
    `${said[0]} · ${said[1]}`,
  );
  ok(
    "a passing assertion prints nothing at all",
    !said.some((line) => line.includes("nobody should read this")),
    said.join(" | "),
  );
  // `check` printed both sides before this change and must still: it is the one
  // assertion whose message was already readable, and a refactor that lost it
  // would be a silent regression in the same class.
  ok(
    "check still prints both sides",
    (said[2] ?? "").includes("got  2") && (said[2] ?? "").includes("want 3"),
    said[2],
  );
  check("the child's tally counts what it printed", counts, { pass: 1, fail: 3 });
}
