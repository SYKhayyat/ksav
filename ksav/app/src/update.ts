// "There is a newer Ksav."
//
// The installers are downloaded from a GitHub release and nothing in the app
// ever calls home, which means an installed Ksav has no way at all to learn that
// a newer one exists. Every writer stays on whatever they first installed until
// somebody tells them in person. typstify has `ui/settings/update_check.go` for
// exactly this, and it is the cheapest of the four things worth taking from it.
//
// What is *not* here, deliberately: no auto-download, no auto-install, no
// telemetry, and nothing sent but the request itself — the GitHub releases
// endpoint is public and unauthenticated, so the check carries no identity, no
// document and no version string. It is a GET, and what comes back is a tag.

/** The version this build was compiled from, baked in by vite from package.json. */
export const CURRENT_VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

const RELEASES = "https://api.github.com/repos/SYKhayyat/ksav/releases/latest";

export interface Release {
  version: string;
  url: string;
  notes: string;
}

/**
 * Compare two dotted versions.
 *
 * Returns a positive number when `a` is newer. Only the numeric parts are
 * compared and a trailing `-beta.2` is ignored, which is the honest limit of
 * what this needs to do: the question is "is there a newer release", and a
 * pre-release tag that sorts wrong shows a banner one release early rather than
 * doing anything irreversible.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Is `latest` newer than what is running? */
export function isNewer(latest: string, current = CURRENT_VERSION): boolean {
  return compareVersions(latest, current) > 0;
}

/**
 * Ask GitHub for the newest release.
 *
 * `null` for every way this can fail — offline, rate-limited, the repository
 * moved, a draft release that the unauthenticated API cannot see. None of them
 * is worth interrupting a writer over, and all of them are indistinguishable
 * from "there is no update" as far as anything the writer can act on.
 */
export async function latestRelease(fetchImpl: typeof fetch = fetch): Promise<Release | null> {
  try {
    const res = await fetchImpl(RELEASES, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: string; html_url?: string; body?: string };
    if (!body?.tag_name) return null;
    return {
      version: body.tag_name.replace(/^v/i, ""),
      url: body.html_url ?? "https://github.com/SYKhayyat/ksav/releases",
      notes: body.body ?? "",
    };
  } catch {
    return null;
  }
}

/** A newer release, or null. Wraps the two halves so callers need only one. */
export async function checkForUpdate(fetchImpl: typeof fetch = fetch): Promise<Release | null> {
  const latest = await latestRelease(fetchImpl);
  return latest && isNewer(latest.version) ? latest : null;
}

const LAST_CHECK_KEY = "ksav.updateCheckedAt";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Has enough time passed to check again?
 *
 * Once a day. A check on every launch would be a request every time somebody
 * opens the app to look something up, which is both rude to GitHub's rate limit
 * and more network chatter than a release cadence measured in weeks deserves.
 */
export function dueForCheck(now = Date.now(), store: Storage | null = safeStorage()): boolean {
  if (!store) return true;
  const raw = store.getItem(LAST_CHECK_KEY);
  // *Never checked* is not *checked at the epoch*. Defaulting the missing value
  // to "0" made the two the same, so on a machine whose clock is anywhere near
  // 1970 — or in any test that picks a small `now` — a first launch reported
  // itself as having already checked, and the feature never ran once.
  if (raw === null) return true;
  const last = parseInt(raw, 10);
  return !Number.isFinite(last) || now - last > DAY_MS;
}

export function markChecked(now = Date.now(), store: Storage | null = safeStorage()): void {
  try {
    store?.setItem(LAST_CHECK_KEY, String(now));
  } catch {
    // A full or unavailable localStorage means the check runs again next launch,
    // which is a wasted request and not a bug worth reporting.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // A private window with storage disabled throws on *access*, not on use.
    return null;
  }
}
