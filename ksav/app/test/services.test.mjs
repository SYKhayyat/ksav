// One registry, three transports — and every method has to reach it.
//
// This is the fence for the failure the service registry was written to end.
// Adding one engine function used to mean editing eight files at eleven sites,
// of which one was visible to a compiler. Four of the silent ten had already
// been forgotten:
//
//   - `sefarim` reached the wasm worker under a name the worker had no entry
//     for. The lookup was `undefined`, the call threw, `sefarim.ts` caught it,
//     and citation autocomplete was dead in the offline build for a month.
//   - The Vite dev proxy carried five of twelve routes, so click-to-jump and
//     the sefer catalogue 404'd against Vite itself under `npm run dev`.
//
// Neither was a typo, and neither could have been caught by testing a backend
// against itself: each transport agreed with its own copy of the list. So the
// assertions here are all of one shape — *drive the real method, and check the
// name or path it asked for is one the engine actually answers*.
//
// The registry itself lives in `engine/src/services.rs`; `services.gen.ts` is
// generated from it and `npm test` fails if it is stale, so "the engine has this
// service" and "this table has this service" are the same sentence here.

import { check, ok } from "./harness.mjs";
import { HttpBackend, TauriBackend, WasmBackend } from "../.tmp-test/api.mjs";
import { SERVICES, SERVICE_PATH } from "../.tmp-test/services.gen.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const APP = path.resolve(HERE, "..");

const NAMES = new Set(SERVICES.map((s) => s.name));

/** A response object shaped like the one each method reads back. */
const answer = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

/**
 * Every call each backend makes, with what the engine would have answered.
 *
 * One row per method of `Backend` and `Sources` — if a method is added and not
 * listed here, the count assertion at the end fails, because the point of this
 * file is *every* door and not the ones somebody remembered.
 */
const CALLS = [
  ["compile", (b) => b.compile("שלום", {}), { ok: true, pages_svg: [], diagnostics: [] }],
  ["jump", (b) => b.jump("שלום", {}, { page: 0, x_pt: 1, y_pt: 1 }), { line: 1 }],
  ["reveal", (b) => b.reveal("שלום", {}, { line: 1 }), { points: [] }],
  ["spell", (b) => b.spell("שלום", ""), { misspellings: [] }],
  ["suggest", (b) => b.suggest("שלום", ""), { suggestions: [] }],
  ["commands", (b) => b.commands(), []],
  ["templates", (b) => b.templates(), []],
  ["sefarim", (b) => b.sefarim(), { sefarim: [] }],
  ["inbox", (b) => b.inbox(), []],
  ["mekoros", (b) => b.mekoros("דברי רש\"י"), { hits: [] }],
  ["mekoros", (b) => b.searchInGirsa("דברי רש\"י"), { opened: true }],
  ["linkify", (b) => b.linkify("טקסט"), { text: "טקסט" }],
];

export async function run() {
  // ------------------------------------------------------- the HTTP build
  //
  // The URL is the assertion: these were twelve string literals in `api.ts`,
  // beside twelve more in `server.rs` and five in `vite.config.ts`.
  {
    const asked = [];
    const realFetch = globalThis.fetch;
    for (const [service, drive, body] of CALLS) {
      globalThis.fetch = async (url) => {
        asked.push({ service, url });
        return answer(body);
      };
      try {
        await drive(new HttpBackend());
      } catch (e) {
        ok(`http ${service} completes`, false, String(e));
      }
    }
    globalThis.fetch = realFetch;
    check("every HTTP call goes to a service the engine serves", asked.length, CALLS.length);
    for (const { service, url } of asked) {
      check(`http ${service} → ${SERVICE_PATH[service]}`, url, SERVICE_PATH[service]);
    }
  }

  // ---------------------------------------------------- the desktop build
  //
  // One command, and the service is an argument. Thirteen `#[tauri::command]`s
  // used to be listed twice each — once as a function and once in
  // `generate_handler!`, where forgetting the second is a runtime rejection.
  {
    const asked = [];
    for (const [service, drive, body] of CALLS) {
      const backend = new TauriBackend();
      backend.invoke = async (cmd, args) => {
        asked.push({ service, cmd, name: args?.name, input: args?.input });
        return JSON.stringify(body);
      };
      await drive(backend);
    }
    check("every desktop call is made", asked.length, CALLS.length);
    for (const a of asked) {
      check(`desktop ${a.service} goes through one command`, a.cmd, "ksav_call");
      check(`desktop ${a.service} names its service`, a.name, a.service);
      ok(`desktop ${a.service} names a service the engine has`, NAMES.has(a.name));
    }
    // The one that shared a service with a sibling: `searchInGirsa` had its own
    // Tauri command while the server answered it as a flag on `/mekoros`. One
    // service, two questions, and the flag is in the body where it always was.
    const search = asked.find((a) => a.input?.includes("\"search\":true"));
    ok("asking Girsa to search is the mekoros service with a flag", !!search);
  }

  // ----------------------------------------------------- the browser build
  //
  // The worker takes a name and hands it to one wasm export. This is the build
  // where the drift actually shipped, so the assertion is the name on the wire.
  {
    const asked = [];
    for (const [service, drive, body] of CALLS) {
      const backend = new WasmBackend();
      // Injected rather than spawned: `spawn()` needs Vite's worker plugin, and
      // what is under test is the message, not the bundler.
      backend.worker = {
        postMessage: (msg) => {
          asked.push({ service, call: msg.call });
          backend.pending.get(msg.id)?.resolve(JSON.stringify(body));
          backend.pending.delete(msg.id);
        },
        terminate: () => {},
      };
      try {
        await drive(backend);
      } catch {
        // `WasmBackend` has no `Sources` half — a tab cannot reach the loopback
        // — so the three Girsa services have no method here. That is the design,
        // and the generated table says which three they are; see below.
      }
    }
    for (const a of asked) {
      ok(`browser ${a.service} names a service the engine has`, NAMES.has(a.call));
      check(`browser ${a.service} names its service`, a.call, a.service);
    }
    const reached = new Set(asked.map((a) => a.call));
    const shareable = SERVICES.filter((s) => !s.nativeOnly).map((s) => s.name);
    for (const name of shareable) {
      ok(`browser build can reach ${name}`, reached.has(name));
    }
    // The bug, stated as a test: this is the service that was in three of the
    // four registries and missing from the fourth.
    ok("citation autocomplete is reachable in the offline build", reached.has("sefarim"));
  }

  // --------------------------------------------- nobody re-spells the list
  //
  // A prohibition, swept over the files that used to carry copies. A regex can
  // enforce "any line of this shape is the bug" perfectly, and these three files
  // are exactly where the copies lived.
  {
    const api = await readFile(path.join(APP, "src", "api.ts"), "utf8");
    const literals = [...api.matchAll(/fetch\(\s*(?:this\.base\s*\+\s*)?"\/\w+"/g)];
    check("api.ts forms no URL of its own", literals.length, 0);

    const worker = await readFile(path.join(APP, "src", "wasm-worker.ts"), "utf8");
    ok("the worker dispatches through one export", worker.includes("engine.ksav_call("));
    check(
      "the worker keeps no table of engine functions",
      /engine\.ksav_(?!call)/.test(worker),
      false,
    );

    const vite = await readFile(path.join(APP, "vite.config.ts"), "utf8");
    ok("the dev proxy is built from the registry", vite.includes("SERVICES.map"));
    check("the dev proxy names no route of its own", /"\/\w+":\s*engine/.test(vite), false);
    // The policy was three strings and a comment claiming they were one. The
    // comment is gone; so is any way to write a fourth.
    check("no policy is spelled out in the config", vite.includes("default-src"), false);
  }

  // ------------------------------------------------- and neither do the docs
  //
  // The README's API section was a fourth copy of the list, and it had the same
  // five routes the dev proxy had. Prose compiles no matter what it says, which
  // is exactly why it is worth one assertion.
  {
    const readme = await readFile(path.resolve(APP, "..", "README.md"), "utf8");
    for (const s of SERVICES) {
      ok(`the README documents ${s.path}`, readme.includes(`${s.method} ${s.path}`));
    }
  }

  // ------------------------------------------------------------ the policy
  {
    const policy = (await readFile(path.resolve(APP, "..", "policy", "csp.txt"), "utf8")).trim();
    ok("the policy is one line", !policy.includes("\n"));
    ok("the update check has somewhere to ask", policy.includes("https://api.github.com"));
    const conf = JSON.parse(
      await readFile(path.join(APP, "src-tauri", "tauri.conf.json"), "utf8"),
    );
    check("the desktop app delivers that policy", conf.app.security.csp, policy);
  }
}
