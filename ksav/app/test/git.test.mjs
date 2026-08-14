// What version control amounts to — the readings, without a git.
//
// `engine/src/git.rs` drives real repositories and is tested against them. What
// is left on this side is a handful of decisions that decide what a reader is
// shown, and each of them has a way of being quietly wrong that a repository
// test would never reach:
//
//   * three different reasons this is unavailable, collapsed into one "not
//     available" — which is the shape of every finding in this application's
//     audit;
//   * a status that is *conflicted* read as *changed*, so the drawer offers a
//     commit while the sefer is full of merge markers;
//   * a merge that stopped on conflicts read as a failure, which tells a writer
//     nothing happened while their document says otherwise.

import { check, ok, notOk } from "./harness.mjs";
import * as git from "../.tmp-test/git.mjs";
import {
  GIT_OPS,
  changed,
  documentChanged,
  health,
  isOp,
  isStaged,
  outcome,
  position,
  remoteArgs,
  standing,
  stateKey,
  when,
  WHY,
} from "../.tmp-test/git.mjs";

/** A binding of each tier, as `files.ts` produces them. */
const DESKTOP = { kind: "tauri", name: "ברכות.ksav", path: "C:/seforim/ברכות.ksav" };
const HANDLE = { kind: "handle", name: "ברכות.ksav" };
const DOWNLOAD = { kind: "download", name: "ברכות.ksav" };

const file = (path, staged, worktree, kind = "ordinary", from) => ({
  path,
  staged,
  worktree,
  kind,
  ...(from ? { from } : {}),
});

export async function run() {
  // ------------------------------------------ the three ways it is unavailable

  check("a desktop document with a path is ready", standing(DESKTOP, "tauri"), {
    kind: "ready",
    path: "C:/seforim/ברכות.ksav",
  });
  check("a browser build cannot ask at all", standing(DESKTOP, "wasm").kind, "no-build");
  check("a document that was never saved has no folder", standing(null, "tauri").kind, "no-file");
  // The File System Access tier: a *real* file the writer picked, and no path
  // anywhere to hand git. Distinct from having no file, and the answer to the
  // reader is a different one.
  check("a handle is a file with no path", standing(HANDLE, "server").kind, "no-path");
  check("…and so is the download tier", standing(DOWNLOAD, "server").kind, "no-path");
  check("a tauri binding with no path is not ready", standing({ kind: "tauri", name: "x" }, "tauri").kind, "no-path");

  // Each reason has its own sentence. This is the assertion that would fail if
  // somebody folded three states into one: three keys, three strings, no
  // duplicates.
  {
    const keys = Object.values(WHY);
    check("every reason has a sentence of its own", keys.length, 3);
    check("…and no two share one", keys.filter((k, i) => keys.indexOf(k) !== i), []);
    for (const kind of ["no-build", "no-file", "no-path"]) {
      ok(`${kind} names a key`, typeof WHY[kind] === "string" && WHY[kind].startsWith("git."));
    }
  }

  // ------------------------------------------------------------------- health

  check("no git at all outranks everything", health({ ok: true, git: null, root: "/r" }), "no-git");
  check("a folder that is not a repository", health({ ok: true, git: "2.54", root: null }), "no-repo");
  check("nothing to say", health({ ok: true, git: "2.54", root: "/r", files: [] }), "clean");
  check(
    "an uncommitted change",
    health({ ok: true, git: "2.54", root: "/r", files: [file("a.ksav", ".", "M")] }),
    "changed",
  );
  // A conflict outranks the changes it comes with. During a merge there are
  // *always* uncommitted changes; reporting those instead would hide the one
  // thing the writer has to deal with.
  check(
    "a conflict outranks the changes it brings with it",
    health({
      ok: true,
      git: "2.54",
      root: "/r",
      merging: true,
      files: [file("a.ksav", "U", "U", "unmerged"), file("b.ksav", ".", "M")],
    }),
    "conflicted",
  );
  // …and it is read off the files as well as off MERGE_HEAD, because a
  // conflicted `git stash pop` leaves the second without the first.
  check(
    "an unmerged file is a conflict even with no merge in progress",
    health({ ok: true, git: "2.54", root: "/r", files: [file("a.ksav", "U", "U", "unmerged")] }),
    "conflicted",
  );
  check(
    "committed and not sent",
    health({ ok: true, git: "2.54", root: "/r", files: [], ahead: 2 }),
    "ahead",
  );
  check(
    "the host has something we do not",
    health({ ok: true, git: "2.54", root: "/r", files: [], behind: 1 }),
    "behind",
  );
  check("nothing asked yet reads as no git, not as clean", health(null), "no-git");

  // ------------------------------------------------------------- what changed

  {
    const s = {
      ok: true,
      git: "2.54",
      root: "/r",
      files: [
        file("ברכות.ksav", ".", "M"),
        file("חדש.ksav", ".", "?", "untracked"),
        file("שבת.ksav", "R", ".", "renamed", "מועד.ksav"),
      ],
    };
    // An untracked file counts. A sefer just written into a repository is
    // untracked, and a drawer that said "nothing to commit" about the document
    // on screen would be worse than no drawer.
    check("an untracked sefer is something to commit", changed(s).length, 3);
    check("the rename says where it came from", changed(s)[2].from, "מועד.ksav");
  }

  check(
    "an untouched document is not a change",
    changed({ ok: true, git: "2.54", root: "/r", files: [file("a.ksav", ".", ".")] }).length,
    0,
  );

  // The open document, specifically — which is what the chip and the commit
  // button are about.
  ok(
    "a document that has never been committed has changed",
    documentChanged({ ok: true, git: "2.54", root: "/r", this: { path: "a", tracked: false, staged: ".", worktree: ".", kind: "ordinary" } }),
  );
  notOk(
    "a committed, untouched document has not",
    documentChanged({ ok: true, git: "2.54", root: "/r", this: { path: "a", tracked: true, staged: ".", worktree: ".", kind: "ordinary" } }),
  );

  // --------------------------------------------- the letters are not a language

  {
    // git's alphabet is `M A D R ?` and it is neither English nor Hebrew. Every
    // state maps to a key, and no state maps to the letter itself.
    check("modified", stateKey(file("a", ".", "M")), "git.st.modified");
    check("added", stateKey(file("a", "A", ".")), "git.st.added");
    check("deleted", stateKey(file("a", ".", "D")), "git.st.deleted");
    check("untracked is new, not a question mark", stateKey(file("a", ".", "?", "untracked")), "git.st.new");
    check("renamed", stateKey(file("a", "R", ".", "renamed")), "git.st.renamed");
    check("unmerged", stateKey(file("a", "U", "U", "unmerged")), "git.st.conflicted");
    for (const f of [file("a", ".", "M"), file("a", "A", "."), file("a", ".", "?", "untracked")]) {
      const key = stateKey(f);
      ok(`${key} is a key and not a letter`, key.startsWith("git.st.") && key.length > 8);
    }
  }

  ok("a staged file says so", isStaged(file("a", "M", ".")));
  notOk("an untracked file is not staged", isStaged(file("a", "?", "?", "untracked")));
  notOk("an unchanged index is not staged", isStaged(file("a", ".", "M")));

  // ------------------------------------------------------------- where we are

  {
    const p = position({ ok: true, git: "2.54", root: "/r", branch: "main", upstream: "origin/main", ahead: 3, behind: 1 });
    check("the branch", p.branch, "main");
    check("ahead", p.ahead, 3);
    check("behind", p.behind, 1);
  }
  {
    // Detached: there is no branch, and the short hash is the only honest name
    // for where the writer is standing.
    const p = position({ ok: true, git: "2.54", root: "/r", detached: true, head: "abcdef1234567890" });
    check("a detached head is named by its hash", p.branch, "abcdef1");
    check("…and has no upstream", p.upstream, null);
  }

  // ------------------------------------------------------ the three endings

  {
    check("an ordinary success", outcome({ ok: true, said: "done" }), { ok: true, conflicted: false, said: "done" });
    check(
      "a refusal keeps git's own words",
      outcome({ ok: false, error: "Permission denied (publickey)" }),
      { ok: false, conflicted: false, said: "Permission denied (publickey)" },
    );
    // The third ending, and the one this function exists for. A merge that
    // stopped on conflicts answers `ok: true, merged: false`: git did what it
    // was asked, and the writer now has work to do.
    const stopped = outcome({ ok: true, merged: false, conflicts: ["ברכות.ksav"], said: "CONFLICT" });
    ok("a stopped merge is not a failure", stopped.ok);
    ok("…and is not an ordinary success either", stopped.conflicted);
    // Nothing else sets `merged`, so nothing else can be read as conflicted.
    notOk("a commit is never reported as conflicted", outcome({ ok: true, hash: "abc" }).conflicted);
    notOk("nor is a merge that went through", outcome({ ok: true, merged: true, conflicts: [] }).conflicted);
    check("no answer at all is not a success", outcome(null).ok, false);
  }

  // ------------------------------------------------------------------- times

  {
    // Formatted in the interface's own language, because the whole chrome flips
    // and a date in the wrong direction beside a Hebrew subject reads two ways
    // at once.
    const he = when(1700000000, "he");
    const en = when(1700000000, "en");
    ok("a commit time is rendered", he.length > 0 && en.length > 0, `${he} / ${en}`);
    ok("…differently per language", he !== en, `${he} / ${en}`);
    check("no time is no string", when(0, "en"), "");
  }

  // ------------------------------------------------------ what the drawer shows
  //
  // These are the assertions the assembled run cannot make. It drives a browser
  // against `ksav serve`, where a document is bound through a file handle and
  // has no path, so `standing` is never `ready` there and the whole populated
  // drawer is unreachable by the one test that looks at the screen. Every
  // section of it could be wrong and step 10 would still be green.

  const REPO = {
    ok: true,
    git: "2.54",
    root: "/seforim",
    branch: "main",
    files: [],
    who: { name: "פלוני", email: "p@x" },
  };
  const READY = { kind: "ready", path: "/seforim/ברכות.ksav" };
  const ids = (f) => (f.kind === "repo" ? f.sections.map((s) => s.id) : f.kind);

  {
    check("no file, no drawer", git.face(standing(null, "tauri"), null, [], [], []).kind, "unavailable");
    check("nothing asked yet is not clean", ids(git.face(READY, null, [], [], [])), "asking");
    check(
      "no git on the machine",
      ids(git.face(READY, { ok: true, git: null, root: null }, [], [], [])),
      "no-git",
    );
    check(
      "a folder that is not a repository",
      ids(git.face(READY, { ok: true, git: "2.54", root: null }, [], [], [])),
      "no-repo",
    );
  }

  {
    // The ordinary repository: five blocks, and no identity form because git
    // knows who is writing.
    check(
      "the ordinary repository's blocks, in order",
      ids(git.face(READY, REPO, [], [], [])).join(","),
      "changes,commit,history,branches,remotes",
    );
  }

  {
    // git has not been told who is writing. The form appears *before* the
    // commit box, because the alternative is a first commit failing with git's
    // own nine-line lecture about `user.email`, in English, in a drawer.
    const f = git.face(READY, { ...REPO, who: null }, [], [], []);
    const order = ids(f);
    ok("the identity form appears", order.includes("identity"), order.join(","));
    ok("…before the commit box", order.indexOf("identity") < order.indexOf("commit"), order.join(","));
  }

  {
    // A stopped merge comes first, before what would be committed. During a
    // merge there are always uncommitted changes; the markers in the document
    // are the thing to deal with.
    const conflicted = {
      ...REPO,
      merging: true,
      files: [file("ברכות.ksav", "U", "U", "unmerged")],
    };
    const order = ids(git.face(READY, conflicted, [], [], []));
    check("a conflict is the first block", order[0], "conflict");
    const block = git.face(READY, conflicted, [], [], []).sections[0];
    check("…and it counts the files that are stuck", block.count, 1);
  }

  {
    // The claim step 9 of the assembled run makes about the four list panels it
    // can reach, made here about the blocks it cannot: a section that can hold
    // nothing has a sentence for holding nothing.
    const f = git.face(READY, { ...REPO, who: null }, [], [], []);
    const speechless = f.sections.filter((s) => s.count === 0 && !s.empty && s.id !== "commit");
    check("every empty block says what empty means", speechless.map((s) => s.id), []);
    // …and the sentences are distinct. Four blocks that all said "nothing here"
    // would be four blanks with a shared caption.
    const said = f.sections.map((s) => s.empty).filter(Boolean);
    check("…and no two of them say the same thing", said.filter((k, i) => said.indexOf(k) !== i), []);
    for (const s of f.sections) {
      if (s.empty) ok(`${s.id}'s sentence is a key`, s.empty.startsWith("git."), s.empty);
      if (s.heading) ok(`${s.id}'s heading is a key`, s.heading.startsWith("git."), s.heading);
    }
  }

  {
    // The counts are what is actually there, so a block cannot claim to be
    // empty while holding rows.
    const f = git.face(READY, REPO, [{ hash: "a" }, { hash: "b" }], [{ name: "main" }], [{ name: "origin" }]);
    const by = Object.fromEntries(f.sections.map((s) => [s.id, s.count]));
    check("the history's count", by.history, 2);
    check("the branches' count", by.branches, 1);
    check("the remotes' count", by.remotes, 1);
  }

  // ------------------------------------------------- which remote gets pushed to

  {
    // The first remote, not the string "origin". `git clone --origin upstream`
    // and every fork workflow produce a repository where three buttons would
    // otherwise fail with git's own message about a remote that does not
    // exist — in a drawer listing the right name two inches above them.
    check(
      "the remote that is actually there",
      remoteArgs(REPO, [{ name: "upstream" }, { name: "origin" }]),
      { remote: "upstream", branch: "main" },
    );
    check("no remote is no argument", remoteArgs(REPO, []), { branch: "main" });
    check("no branch either, on a detached head", remoteArgs({ ...REPO, branch: null }, []), {});
  }

  // -------------------------------------------- the operations are the engine's

  {
    // `GIT_OPS` is generated from `engine/src/git.rs`'s `OPERATIONS`. This is
    // the same guarantee `ServiceName` gives one level up: a button wired to an
    // operation the engine does not answer cannot be written.
    ok("there are operations", GIT_OPS.length > 5, `${GIT_OPS.length}`);
    for (const op of ["status", "commit", "log", "show", "merge", "push"]) {
      ok(`${op} is one of them`, isOp(op));
    }
    notOk("and a name nobody answers is not", isOp("rebase"));
    notOk("nor is an empty one", isOp(""));
    const dupes = GIT_OPS.filter((op, i) => GIT_OPS.indexOf(op) !== i);
    check("no operation is listed twice", dupes, []);
  }
}
