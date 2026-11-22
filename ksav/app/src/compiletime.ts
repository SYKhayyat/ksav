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
  // **The writer's own number first** (#213), and only when they set one. An
  // unset box is not a zero and not the default: it means *ask this build*, which
  // is what the two sources below answer. So a deployment's raised budget still
  // reaches a writer who never touched the setting, and a writer who did touch it
  // outranks both.
  const chosen = chosenSeconds();
  if (chosen !== undefined) return chosen * 1000;
  const fromShell = usable(scope?.[GLOBAL_KEY]);
  if (fromShell !== undefined) return fromShell;
  const el = scope?.querySelector?.(META);
  const fromPage = usable(el?.getAttribute("content"));
  if (fromPage !== undefined) return fromPage;
  return DEFAULT_COMPILE_TIMEOUT_MS;
}

/**
 * The seconds the writer asked for, or `undefined`.
 *
 * Read through a function rather than imported, for one reason: `settings.ts`
 * imports this application's whole store — `api`, `runtime`, `wiring` — and this
 * module is imported by `transports.ts`, which `api.ts` describes. A direct
 * import would close that loop. `settings.ts` calls {@link budgetFromSettings}
 * at module load, which happens before any compile can be asked for.
 *
 * Refused rather than clamped on the way in: a box left in a state the writer
 * cannot mean (zero, negative, NaN — a cleared number input reads as `NaN`) falls
 * back to the build's number instead of abandoning every compile instantly.
 */
let settingsReader: (() => unknown) | null = null;

/** Point the reader at the live settings. Called once, from `settings.ts`. */
export function budgetFromSettings(read: () => unknown): void {
  settingsReader = read;
}

function chosenSeconds(): number | undefined {
  const raw = settingsReader?.();
  const n = usable(raw);
  // A number of *seconds*, so the floor is one second rather than one
  // millisecond: `usable` is already refusing everything that is not positive.
  return n === undefined ? undefined : n;
}
