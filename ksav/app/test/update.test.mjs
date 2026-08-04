// "There is a newer Ksav" — the comparison and the once-a-day rule.
//
// The whole feature is one question with a yes/no answer, and it is the kind of
// question that is easy to get subtly backwards: an app that says "you are out
// of date" to somebody running the newest build is worse than one that says
// nothing, because it sends them to download what they already have.

import { check, ok, notOk } from "./harness.mjs";
import { compareVersions, isNewer, latestRelease, dueForCheck, markChecked } from "../.tmp-test/update.mjs";

/** A localStorage stand-in, so the day rule can be tested without one. */
function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

export function run() {
  // ------------------------------------------------------------- comparison
  ok("a bigger patch is newer", compareVersions("0.1.1", "0.1.0") > 0);
  ok("a bigger minor is newer", compareVersions("0.2.0", "0.1.9") > 0);
  ok("a bigger major is newer", compareVersions("1.0.0", "0.99.99") > 0);
  check("the same version is the same", compareVersions("1.2.3", "1.2.3"), 0);
  ok("an older version is older", compareVersions("1.2.3", "1.2.4") < 0);

  // Ten is greater than nine, which a string comparison gets wrong — and would
  // get wrong permanently, since a project only ever passes 0.10 once.
  ok("0.10.0 is newer than 0.9.0", compareVersions("0.10.0", "0.9.0") > 0);
  ok("1.0.10 is newer than 1.0.9", compareVersions("1.0.10", "1.0.9") > 0);

  // GitHub tags carry a leading v and the running version does not.
  check("a leading v is not part of the number", compareVersions("v1.2.3", "1.2.3"), 0);
  check("…on either side", compareVersions("1.2.3", "V1.2.3"), 0);

  // Missing components are zero, so 1.2 and 1.2.0 are one version.
  check("a short version is padded with zeroes", compareVersions("1.2", "1.2.0"), 0);
  ok("…and still compares", compareVersions("1.3", "1.2.9") > 0);

  // A pre-release suffix is ignored rather than parsed. Stated in the source as
  // the honest limit of what this needs to do.
  check("a pre-release suffix is dropped", compareVersions("1.2.3-beta.2", "1.2.3"), 0);
  // Garbage compares as zeroes rather than NaN — NaN would make every
  // comparison false and silently disable the whole check.
  check("nonsense is zero, not NaN", compareVersions("banana", "0.0.0"), 0);

  ok("a newer release is newer", isNewer("2.0.0", "1.0.0"));
  notOk("the same one is not", isNewer("1.0.0", "1.0.0"));
  notOk("and an older one is certainly not", isNewer("0.9.0", "1.0.0"));

  // ---------------------------------------------------------------- fetching
  return (async () => {
    const ok200 = (body) => async () => ({ ok: true, json: async () => body });

    {
      const r = await latestRelease(ok200({ tag_name: "v0.2.0", html_url: "https://x", body: "notes" }));
      check("the tag is the version", r.version, "0.2.0");
      check("…with the link", r.url, "https://x");
    }

    // Every way this can fail is the same answer, because every one of them is
    // indistinguishable from "there is no update" as far as the writer can act.
    check("a rate-limited response is silence", await latestRelease(async () => ({ ok: false })), null);
    check(
      "a release with no tag is silence",
      await latestRelease(ok200({ html_url: "https://x" })),
      null,
    );
    check(
      "being offline is silence",
      await latestRelease(async () => { throw new Error("network"); }),
      null,
    );
    check(
      "so is a body that is not JSON",
      await latestRelease(async () => ({ ok: true, json: async () => { throw new Error("bad"); } })),
      null,
    );

    // ------------------------------------------------------------ the day rule
    const DAY = 24 * 60 * 60 * 1000;
    {
      const store = fakeStore();
      ok("never checked means due", dueForCheck(1_000_000, store));
      markChecked(1_000_000, store);
      notOk("just checked is not due", dueForCheck(1_000_000 + 60_000, store));
      notOk("nor an hour later", dueForCheck(1_000_000 + DAY / 2, store));
      ok("a day later is due again", dueForCheck(1_000_000 + DAY + 1, store));
    }
    // A private window with no storage checks every launch rather than never:
    // a wasted request beats a feature that silently does nothing forever.
    ok("no storage means always due", dueForCheck(Date.now(), null));
    // …and marking is allowed to be a no-op there.
    markChecked(Date.now(), null);
  })();
}
