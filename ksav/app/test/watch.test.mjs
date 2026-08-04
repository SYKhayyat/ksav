// Noticing that the file changed underneath you.
//
// The hole this closes: `save.ts` writes to the bound file on a thirty-second
// timer, and nothing ever asked whether that file still held what Ksav last put
// there. Dropbox pulling an older copy down, a second window, a `git checkout` —
// in every case the next autosave silently overwrote somebody's work with no
// error and nothing in the log.
//
// The decision under test is the *direction of the default*. "Cannot tell" is
// reported as unchanged, not as changed, and that is deliberate: a false
// "changed" means a prompt on every save on any platform that cannot stamp,
// which teaches the writer to dismiss the prompt without reading it. A prompt
// nobody reads is worse than no prompt at all, because it also gives everyone
// the impression the problem is handled.

import { check, ok, notOk } from "./harness.mjs";
import { sameStamp, checkFile, markInSync, forget, believedStamp } from "../.tmp-test/watch.mjs";

export function run() {
  // ------------------------------------------------------------ the comparison
  const at = (mtime, size) => ({ mtime, size });

  ok("the same stamp is the same file", sameStamp(at(1000, 42), at(1000, 42)));
  notOk("a later modification time is a change", sameStamp(at(1000, 42), at(1001, 42)));
  // Size as well as time, because a file can be rewritten inside one
  // filesystem timestamp tick — which on Windows is not a rare event, it is
  // roughly every 15ms.
  notOk("a different size is a change even at the same time", sameStamp(at(1000, 42), at(1000, 43)));

  ok("a missing stamp on one side cannot tell, so does not claim a conflict", sameStamp(null, at(1, 1)));
  ok("nor on the other", sameStamp(at(1, 1), null));
  ok("nor on both", sameStamp(null, null));

  // ------------------------------------------------------------- the verdicts
  //
  // A fake binding whose stamp the test controls. The `handle` tier is used
  // because that is the one `files.fileStamp` reads synchronously from an
  // object, and a fake handle is enough to drive the whole path.
  let disk = { lastModified: 1000, size: 10 };
  const binding = {
    kind: "handle",
    name: "sefer.ksav",
    handle: { getFile: async () => ({ lastModified: disk.lastModified, size: disk.size }) },
  };

  return (async () => {
    check("a document nobody synchronised cannot tell", await checkFile("doc1", binding), "unknown");
    check("nor can one with no binding at all", await checkFile("doc1", null), "unknown");

    await markInSync("doc1", binding);
    check("Ksav believes what it just read", believedStamp("doc1"), { mtime: 1000, size: 10 });
    check("and nothing has changed", await checkFile("doc1", binding), "unchanged");

    disk = { lastModified: 2000, size: 10 };
    check("somebody else wrote the file", await checkFile("doc1", binding), "changed");

    // Saving over it, or taking the disk's copy, both end with Ksav agreeing
    // with the file again — and the verdict has to go back to unchanged, or the
    // writer is warned about a conflict they already resolved.
    await markInSync("doc1", binding);
    check("agreeing again clears the conflict", await checkFile("doc1", binding), "unchanged");

    // Two documents do not share a verdict.
    await markInSync("doc2", binding);
    disk = { lastModified: 3000, size: 10 };
    check("doc1 sees the change", await checkFile("doc1", binding), "changed");
    check("and so does doc2, independently", await checkFile("doc2", binding), "changed");

    forget("doc1");
    check("a forgotten document cannot tell again", await checkFile("doc1", binding), "unknown");
    check("and does not forget its neighbour", await checkFile("doc2", binding), "changed");

    // A binding with nothing to stamp — the download tier, which never wrote a
    // file anywhere Ksav can find. It must not be reported as a conflict on
    // every save forever.
    const noFile = { kind: "download", name: "sefer.ksav" };
    await markInSync("doc3", noFile);
    check("an unstampable binding cannot tell", await checkFile("doc3", noFile), "unknown");

    // A file that has been deleted or unplugged: `getFile` throws. Not a
    // conflict — there is nothing to be in conflict with.
    const gone = {
      kind: "handle",
      name: "gone.ksav",
      handle: { getFile: async () => { throw new Error("NotFoundError"); } },
    };
    await markInSync("doc4", gone);
    check("a file that has vanished is not a conflict", await checkFile("doc4", gone), "unknown");
  })();
}
