// The update feed's one address, and the policy that must allow it.
//
// # The finding (#113)
//
// The product's only outbound origin was written twice:
//
//   - `app/src/update.ts` — `https://api.github.com/repos/SYKhayyat/ksav/releases/latest`
//   - `policy/csp.txt` — `connect-src … https://api.github.com`
//
// in different files, with different owners and different fences. The CSP is
// fenced **three ways** (`src-tauri/build.rs`, `engine/src/policy.rs`,
// `services.test.mjs`) and every one of those asserts the three *copies* are
// equal — internal consistency, nothing about whether the origin the client
// calls is one of the allowed ones. So moving the feed was an edit to a
// machine-enforced file, and moving only the client killed the update check in
// every packaged build while `update.ts`'s own error handling absorbed the
// failure by design.
//
// `policy/feed.json` is now the source. `src/update.ts` imports it;
// `policy/meta.mjs` exports `checkFeedInCsp`, which `vite.config.ts` calls while
// it assembles the `<meta>` policy, so a policy that would block the feed stops
// the **build**. The serving side is held to the same file by
// `engine/src/policy.rs`'s own test.
//
// What this file asserts:
//
//   1. the endpoint the client fetches lives at the origin the policy allows;
//   2. `checkFeedInCsp` accepts the real policy and refuses a policy without
//      the origin — by name, not by returning false;
//   3. the client reads the shared file rather than restating the string, so
//      the equality has a single source.

import { readFileSync } from "node:fs";
import path from "node:path";
import { APP, ROOT } from "../tools/paths.mjs";
import { check, ok } from "./harness.mjs";
import { checkFeedInCsp, FEED_ORIGIN } from "../../policy/meta.mjs";
import feed from "../../policy/feed.json" with { type: "json" };

const csp = readFileSync(path.join(ROOT, "ksav/policy/csp.txt"), "utf8").trim();
const update = readFileSync(path.join(APP, "src/update.ts"), "utf8");

/** The tokens of the policy's `connect-src`, which is where an origin lives. */
function connectSrc(policy) {
  const d = policy.split(";").find((x) => x.trim().startsWith("connect-src")) ?? "";
  return d.trim().split(/\s+/u).slice(1);
}

export async function run() {
  // ------------------------------------------------ one value, two consumers

  check("the feed file is the only place the origin is written", feed.origin, FEED_ORIGIN);
  check(
    "the endpoint the client fetches is under that origin",
    new URL(feed.latest).origin,
    feed.origin,
  );
  check(
    "and the page a newer-Ksav banner opens is too",
    new URL(feed.releases).origin.replace("www.", ""),
    "https://github.com",
  );

  ok(
    "update.ts imports the shared file instead of holding the string",
    update.includes("policy/feed.json"),
  );
  ok(
    "and no longer contains the endpoint verbatim",
    !update.includes("api.github.com/repos"),
    "the literal endpoint would be the second answer this issue is about",
  );

  // ------------------------------------------------ the policy allows it

  ok(
    "connect-src names the origin the client dials",
    connectSrc(csp).includes(FEED_ORIGIN),
    connectSrc(csp).join(" "),
  );
  ok("the real policy passes the build-time check", checkFeedInCsp(csp) === csp);

  // A policy without the origin must be refused **loudly**: this is the check
  // `vite.config.ts` runs, and a silent `false` would let a build ship an update
  // check its own CSP blocks.
  let threw = "";
  try {
    checkFeedInCsp(csp.replace(FEED_ORIGIN, "https://feeds.example"));
  } catch (e) {
    threw = String(e.message ?? e);
  }
  ok("a policy that does not allow the feed is refused", threw.length > 0);
  ok("and the refusal names the origin", threw.includes(FEED_ORIGIN), threw);

  // The serving side is held to the same file by the engine's own test; this
  // just records that the tie exists, because a Rust test is not visible here.
  // (`engine/src/policy.rs` reads it too; a Rust test is not readable from
  // here, and the runner forbids this suite from parsing `.rs` files.)
}
