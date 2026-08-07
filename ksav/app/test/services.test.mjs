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
import { SERVICE, SERVICES, SERVICE_PATH } from "../.tmp-test/services.gen.mjs";
import { HEADER_ONLY, metaPolicy } from "../../policy/meta.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const APP = path.resolve(HERE, "..");

const NAMES = new Set(SERVICES.map((s) => s.name));

/**
 * A response object shaped like the one each method reads back.
 *
 * `text()` as well as `json()`, because the HTTP backend reads the body as text
 * and parses it once — the same shape the wasm and desktop transports have
 * always had, which is what let the three of them collapse onto one client. A
 * fake that models a narrower `Response` than the code uses is a fake that fails
 * a correct refactor.
 */
const answer = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/**
 * Every call each backend makes, with what the engine would have answered.
 *
 * One row per method of `Backend` and `Sources`, and *"every door and not the
 * ones somebody remembered"* is now something this file checks rather than
 * something it says. It used to rest on `asked.length === CALLS.length`, which
 * compares the list to itself: it is true for any list, including one missing
 * half the interface. `every_backend_method_is_driven` at the end reads the two
 * interface declarations out of `api.ts` and asserts set equality with the
 * methods these rows actually call — so a method added and not listed here goes
 * red, which is what the paragraph above claimed for as long as it was wrong.
 */
const CALLS = [
  ["compile", (b) => b.compile("שלום", {}), { ok: true, pages_svg: [], diagnostics: [] }],
  ["assemble", (b) => b.assemble("שלום", {}), { ok: true, typst_source: "#let", diagnostics: [] }],
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
      globalThis.fetch = async (url, init) => {
        asked.push({ service, url, method: init?.method ?? "GET" });
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
    // And the **verb**, which this block asserted nothing about for as long as
    // it existed.
    //
    // "One registry" was true of the path and false of the method: `api.ts` took
    // the path from `SERVICE_PATH` and the verb from which of two private
    // helpers a call site happened to use — `ask` was hard-coded GET, `send` was
    // hard-coded POST. So `/inbox` moved to POST in `services.rs` for a stated
    // security reason, this file kept GETting it, and the check above went on
    // passing because the URL was still right. The server answered 404, the poll
    // swallows a failure by design, and the Girsa handoff was dead with both
    // ends correct. Found by a browser, in a console, at the first attempt.
    for (const { service, method } of asked) {
      check(`http ${service} is a ${SERVICE[service].method}`, method, SERVICE[service].method);
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

  // ------------------------------------ nor does the offline cache guess
  //
  // The fourth transport, and the one nobody counted: a service worker sitting
  // in front of all of them. It was cache-first for every same-origin GET that
  // was not a navigation, and `HttpBackend.ask` is a plain `fetch` GET — so on
  // `ksav serve` the worker cached `/inbox`, which is a queue that *drains when
  // it is read*. The first poll carrying a source from Girsa was replayed on
  // every poll after it, once a second, each one inserting that source into the
  // open document again.
  //
  // It is asserted here rather than in a file of its own because the bug was
  // not a caching bug. It was the same drift this whole file is the fence for:
  // a fifth place that had to know what a service is, and did not.
  {
    const { isCacheable, withinScope } = await import("../public/sw-cache.js");

    // Two hosts, one rule. `ksav serve` puts the engine at the origin root; a
    // project Pages site puts the whole app under `/ksav/`. The registry is
    // written in rooted paths, so a comparison that skipped this step would be
    // asking about the wrong string on one of the two — and it is the *Pages*
    // one where a worker is installed at all.
    check("at the root, a path is itself", withinScope("/inbox", "/"), "/inbox");
    check("under a subpath, the prefix comes off", withinScope("/ksav/inbox", "/ksav/"), "/inbox");
    check("assets too", withinScope("/ksav/assets/a.js", "/ksav/"), "/assets/a.js");
    check("the scope root is the app root", withinScope("/ksav/", "/ksav/"), "/");
    // A scope GitHub hands over without its trailing slash must not eat a
    // character off the path it is stripped from.
    check("a scope without its slash still works", withinScope("/ksav/inbox", "/ksav"), "/inbox");
    // And the composition, which is the thing that actually has to hold.
    check(
      "a service under a subpath is still refused",
      isCacheable(withinScope("/ksav/inbox", "/ksav/")),
      false,
    );
    ok(
      "an asset under a subpath is still cached",
      isCacheable(withinScope("/ksav/assets/index-a1b2.js", "/ksav/")),
    );

    // The bug, stated as a test. Every service, not just the one that hurt.
    for (const s of SERVICES) {
      check(`the cache refuses ${s.path}`, isCacheable(s.path), false);
    }
    // And the one that hurt, named, so a regression reads as itself.
    check("a drained queue is never replayed from cache", isCacheable("/inbox"), false);

    // The rule is closed by default: a service added to `services.rs` tomorrow
    // is refused before anybody edits the worker. This is that claim, driven
    // with a path that is in no registry anywhere.
    check("an unknown bare path is refused too", isCacheable("/not-a-service-yet"), false);
    check("a dot in a directory is not an extension", isCacheable("/v1.2/inbox"), false);

    // The second lock, driven on its own. Every path in the registry today is
    // a bare word, so the shape rule above refuses all of them and the registry
    // check never fires — verified by disabling it, which left every assertion
    // in this block green. So the registry is injected here, holding the one
    // shape that would slip past the shape rule: a service that looks like a
    // file. If the engine is ever given `/state.json`, this is what refuses it.
    check(
      "a service that looks like a file is refused by the registry",
      isCacheable("/state.json", new Set(["/state.json"])),
      false,
    );
    ok(
      "and the same path is cacheable when it is not a service",
      isCacheable("/state.json", new Set()),
    );

    // Which would be a worthless rule if it refused the assets as well — the
    // 9 MB wasm chunk is the entire reason there is a worker.
    ok("hashed assets are still cached", isCacheable("/assets/index-a1b2c3.js"));
    ok("the wasm module is still cached", isCacheable("/assets/ksav_wasm_bg-9f8e.wasm"));
    ok("the icon is still cached", isCacheable("/icons/icon-128.png"));
    ok("the manifest is still cached", isCacheable("/manifest.webmanifest"));

    // The worker's copy of the registry is generated, like the app's. A
    // hand-written list here would be the sixth place to forget a service.
    const sw = await readFile(path.join(APP, "public", "sw.js"), "utf8");
    ok("the worker imports the rule rather than restating it", sw.includes("./sw-cache.js"));
    check("the worker spells no service path of its own", /"\/(?:inbox|compile|spell)"/.test(sw), false);
    const rule = await readFile(path.join(APP, "public", "sw-cache.js"), "utf8");
    ok("the rule reads the generated registry", rule.includes("./sw-services.gen.js"));
    // A module worker, or the import above is a syntax error in the browser and
    // the whole worker fails to install.
    const mainTs = await readFile(path.join(APP, "src", "main.ts"), "utf8");
    ok("it is registered as a module worker", /register\([^)]*\{\s*type:\s*"module"\s*\}/s.test(mainTs));
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

    // The third delivery, and the one that cannot carry everything.
    //
    // A `<meta>` CSP discards `frame-ancestors` — header-only by specification —
    // and Chrome prints a warning about it on every page load. The built HTML
    // carried it anyway for the life of the tag, so the app shipped a console
    // warning that was never false and never read. `metaPolicy` drops it here,
    // deliberately and in one place, instead of leaving the browser to do it
    // silently.
    //
    // Asserted from both ends: what is dropped is exactly the header-only set,
    // and what is kept is byte-for-byte the rest of the same policy. A filter
    // that quietly dropped `object-src` would pass a check that only looked for
    // the absence of `frame-ancestors`.
    const meta = metaPolicy(policy);
    const directives = (s) => s.split(";").map((d) => d.trim()).filter(Boolean);
    ok("the meta policy drops frame-ancestors", !meta.includes("frame-ancestors"));
    check(
      "…and drops nothing else",
      directives(policy).filter((d) => !directives(meta).includes(d)),
      directives(policy).filter((d) => HEADER_ONLY.some((n) => d.startsWith(n))),
    );
    ok(
      "the header still says it — this is a delivery limit, not a weaker policy",
      policy.includes("frame-ancestors 'none'"),
    );
    // The whole reason the list is a list: adding a header-only directive to
    // `csp.txt` must not silently start being dropped from two of three
    // deliveries without anybody deciding that.
    check("the header-only set is the documented one", HEADER_ONLY, [
      "frame-ancestors",
      "report-uri",
      "sandbox",
    ]);
  }

  // ------------------------------------------- and every door is in the list
  //
  // The claim `CALLS` makes about itself, made checkable.
  //
  // For as long as this file existed, "one row per method" rested on
  // `asked.length === CALLS.length` — a list compared to itself, which is true
  // of any list, including one that has quietly stopped covering half the
  // interface. That is `ONLY_AT_TOP` in a different file: a check that cannot
  // fail for the reason it is written under. `Backend` and `Sources` are the
  // contract, so they are what the rows are compared against.
  //
  // Read out of the declaration rather than off a prototype, because a
  // prototype also carries `send`, `ask`, `call`, `ensure`, `spawn` and
  // `failAll` — and telling those from the real methods would need an exemption
  // list, which is the mistake this assertion exists to stop.
  {
    const api = await readFile(path.join(APP, "src", "api.ts"), "utf8");
    const declared = new Set();
    for (const name of ["Backend", "Sources"]) {
      const at = api.indexOf(`export interface ${name} {`);
      ok(`interface ${name} was found`, at >= 0);
      const block = api.slice(at, api.indexOf("\n}", at));
      for (const m of block.matchAll(/^ {2}(\w+)\(/gm)) declared.add(m[1]);
    }
    // What the rows actually call, taken from the rows themselves: each driver
    // is `(b) => b.method(…)`, so the method is in its own source.
    const driven = new Set(CALLS.map(([, drive]) => /\bb\.(\w+)\(/.exec(String(drive))?.[1]));
    check(
      "every method of Backend and Sources is driven here",
      [...declared].filter((m) => !driven.has(m)),
      [],
    );
    check(
      "and nothing is driven that the interfaces do not declare",
      [...driven].filter((m) => !declared.has(m)),
      [],
    );
    ok("the interfaces were really read", declared.size > 10);
  }
}
