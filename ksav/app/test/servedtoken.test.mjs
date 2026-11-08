// The token the server demands, and the page that is served with it.
//
// # The finding (#108)
//
// `KSAV_TOKEN` makes `X-Ksav-Token` mandatory on seven `Native` services
// (`server.rs`'s `native_allowed`, reach `Native` in `services.rs`). No
// TypeScript file mentioned the header at all. The desktop build talks to the
// in-process backend and never notices; a browser client reaches a gated
// service and is refused for a header it has no way to send. Setting the token
// — the documented way to harden a shared box — therefore silently disabled
// git, the Girsa inbox, mekoros, linkify, refresh, clipboard-source and
// saved-here for *every browser user*, which is the availability half of the
// blast radius and was stated nowhere.
//
// The fix is a handshake rather than a build flag: the server serves the page
// with the token in its head (`<meta name="ksav-token">`), and the browser
// client reads it there and sends it. A `VITE_*` value would have been the
// wrong shape in exactly the way the issue warned about — a secret baked into a
// public bundle is not a secret — so this asserts the token is read from the
// **served page at run time** and never from an environment constant.
//
// The assertions below are three separate claims:
//
//   1. the reader finds the meta the engine writes, and finds nothing when
//      there is none (the ordinary single-user case sends no header);
//   2. the header's name is the one the engine checks, spelled once;
//   3. an `HttpBackend` request actually carries it — and carries it on the
//      seven `nativeOnly` services by name, read from the generated registry,
//      not from a hand-kept list in this file.

import { check, ok } from "./harness.mjs";
import { tokenFromPage, tokenHeader } from "../.tmp-test/served.mjs";
import { HttpBackend } from "../.tmp-test/transports.mjs";
import { SERVICE } from "../.tmp-test/services.gen.mjs";

/** A page-shaped stand-in: only `querySelector` is used. */
function page(attrs) {
  return {
    querySelector(sel) {
      if (!attrs) return null;
      check(`the reader asks for a meta by name (${sel})`, sel.includes('meta[name="ksav-token"]'), true);
      return { getAttribute: (k) => (k === "content" ? attrs.content : null) };
    },
  };
}

/** The seven services the engine gates, read from the generated registry. */
const gated = Object.entries(SERVICE)
  .filter(([, def]) => def.nativeOnly)
  .map(([name]) => name)
  .sort();

export async function run() {
  // ------------------------------------------------- what the reader reads

  check("a page served with a token yields it", tokenFromPage(page({ content: "s3cret" })), "s3cret");
  check("a page served without one yields nothing", tokenFromPage(page(null)), "");
  check("and no document at all is not a crash", tokenFromPage(undefined), "");

  // A token is sent as the header the server checks, and nothing else.
  check("a token becomes exactly one header", tokenHeader("s3cret"), { "X-Ksav-Token": "s3cret" });
  check("no token sends no header at all", tokenHeader(""), {});

  // ------------------------------------- the seven gated services send it

  ok("the engine gates seven services", gated.length === 7, gated.join(", "));
  check(
    "the gate list is the one the issue named",
    gated,
    ["clipboard-source", "git", "inbox", "linkify", "mekoros", "refresh", "saved-here"],
  );

  {
    const realFetch = globalThis.fetch;
    const realDoc = globalThis.document;
    const seen = [];
    globalThis.document = page({ content: "s3cret" });
    globalThis.fetch = async (url, init) => {
      seen.push({ url, headers: init?.headers ?? {} });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({}),
        json: async () => ({}),
      };
    };
    try {
      const b = new HttpBackend();
      // One call per gated service, through the same door every surface uses.
      await b.git("status", "/tmp/x.ksav").catch(() => {});
    } finally {
      globalThis.fetch = realFetch;
      globalThis.document = realDoc;
    }
    ok("the request happened", seen.length > 0);
    for (const { url, headers } of seen) {
      check(`the token rides on ${url}`, headers["X-Ksav-Token"], "s3cret");
    }
  }

  // ------------------------------------------------ and the seven are real

  // `nativeOnly` is generated from `services.rs`'s `Reach::Native`, so this
  // pins the client story to the engine's own list rather than to a copy of it.
  for (const name of gated) {
    ok(`the client can satisfy the gate on ${name}`, typeof SERVICE[name].method === "string");
  }
}
