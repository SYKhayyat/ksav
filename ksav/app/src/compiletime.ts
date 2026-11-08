// How long a compile is allowed to take, as every build learns it.
//
// # The finding (#109)
//
// `transports.ts` held `const COMPILE_TIMEOUT_MS = 20_000` under a comment that
// said it was *"mirroring the server's"*. It mirrored the server's **default**
// and nothing else: `server.rs`'s `compile_deadline()` reads
// `KSAV_COMPILE_TIMEOUT_MS`, so an operator who raised the budget for a large
// sefer got a server that waits sixty seconds and a client that gives up at
// twenty — and the client is the one that decides, in the wasm and desktop
// builds, because it does its own waiting. The comment was a belief, not a
// check, which is exactly the shape #109 named.
//
// The value now travels instead of being repeated:
//
//   - the engine serves its budget to the page it serves, as
//     `<meta name="ksav-compile-timeout-ms">` (`server.rs`'s `page_for_run`);
//   - the desktop shell sets `window.__ksavCompileTimeoutMs` from the same
//     `compile_deadline()` at startup (`src-tauri/src/lib.rs`);
//   - the offline wasm build has no server and no environment, so it keeps the
//     default — stated here rather than implied.

/** What a build uses when nothing told it otherwise. */
export const DEFAULT_COMPILE_TIMEOUT_MS = 20_000;

/** Where the desktop shell leaves the budget it read from the environment. */
const GLOBAL_KEY = "__ksavCompileTimeoutMs";

/** The meta the served page carries. */
const META = 'meta[name="ksav-compile-timeout-ms"]';

type Scope = {
  [GLOBAL_KEY]?: unknown;
  querySelector?: (q: string) => { getAttribute(k: string): string | null } | null;
};

/** A positive, finite number of milliseconds, or `undefined`. */
function usable(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The compile deadline for this build, in milliseconds.
 *
 * Read at the moment of each compile rather than once at module load, because
 * the desktop shell's value arrives during startup and a module constant would
 * have been evaluated before it.
 */
export function compileDeadlineMs(scope: Scope | undefined = globalThis as Scope): number {
  const fromShell = usable(scope?.[GLOBAL_KEY]);
  if (fromShell !== undefined) return fromShell;
  const el = scope?.querySelector?.(META);
  const fromPage = usable(el?.getAttribute("content"));
  if (fromPage !== undefined) return fromPage;
  return DEFAULT_COMPILE_TIMEOUT_MS;
}
