// Where things are, worked out once.
//
// # The finding
//
// `dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))`
// appeared **22 times** across `test/` and `tools/`, against 7 correct uses of
// `fileURLToPath` — and beside an unused `SRC_DIR` export written to prevent
// exactly that.
//
// It is not only untidy, it is wrong. A `file://` URL percent-encodes its path,
// and `.pathname` hands it back still encoded. So a checkout under a directory
// with a space in it — `C:\Users\Some One\Ksav` — resolves to `Some%20One`,
// every one of those 22 files fails to find `src/`, and the whole suite dies at
// import time with a path nobody can read. `fileURLToPath` decodes; the
// hand-rolled version was a partial reimplementation of it that got the drive
// letter right and the escapes wrong.
//
// The sweeps in `spans.test.mjs` and `enginefacts.test.mjs` read `src/`. They
// have never looked in `test/` or `tools/`, which is precisely where the
// duplication that survived is living.

import path from "node:path";
import { fileURLToPath } from "node:url";

/** The directory a module lives in, given its `import.meta.url`. */
export const dirOf = (url) => path.dirname(fileURLToPath(url));

/** `ksav/app` — everything below is relative to it. */
export const APP = path.resolve(dirOf(import.meta.url), "..");

/** The repository root. */
export const ROOT = path.resolve(APP, "..", "..");

/** `ksav/app/src` — the application. */
export const SRC = path.join(APP, "src");

/** `ksav/app/test` */
export const TEST = path.join(APP, "test");

/** `ksav/app/tools` */
export const TOOLS = path.join(APP, "tools");

/** `ksav/engine` */
export const ENGINE = path.resolve(APP, "..", "engine");

/** Where the test build puts the bundled modules. */
export const TMP_TEST = path.join(APP, ".tmp-test");
