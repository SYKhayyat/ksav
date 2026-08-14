// What version control amounts to for the document in front of you.
//
// The engine drives git (`engine/src/git.rs`); `api.ts` carries the wire
// shapes; `main.ts` draws the drawer. What is left — and what is worth having
// on its own — is the *reading*: can this build ask at all, and if it can, what
// does a status add up to.
//
// # Why the availability check is per document and not per build
//
// The obvious place for it is beside `sourcesOf`, which answers "does this
// build have a Girsa half" once, off the registry's own `nativeOnly` column.
// Git does not fit there, and forcing it would have cost a real sentence.
//
// A build either can or cannot reach Girsa. Version control is not like that:
// the desktop application can do it, and *cannot do it for a document that has
// never been saved*, because there is no folder for a repository to be in. A
// browser tab cannot do it at all, and for a second reason — the File System
// Access API hands back a handle and never a path, so even a real file the
// writer picked has no name git can be given.
//
// That is three different things to tell a reader, and each of them is
// actionable in a different way: save the document; use the installed
// application; there is no git on this machine. A single "not available" would
// have covered all three, and the standing rule here is that a broken feature
// is the finding and the missing sentence is a subordinate clause. So
// [`standing`] returns which one it is, and the drawer says so in words.

import type { GitAnswer, GitFile, GitStatus } from "./api";
import type { FileBinding } from "./files";
import { GIT_OPS, type GitOp } from "./services.gen";

export type { GitOp };
export { GIT_OPS };

/**
 * Whether this document can be put under version control, and why not.
 *
 * `ready` carries the path because every operation needs one and there is
 * exactly one place it can be obtained from — which means no call site has to
 * repeat the check that produced it.
 */
export type Standing =
  | { kind: "ready"; path: string }
  /** A browser build: the service itself refuses, and says so. */
  | { kind: "no-build" }
  /** The document has never been saved anywhere. */
  | { kind: "no-file" }
  /** A real file, reached through a handle that carries no path. */
  | { kind: "no-path" };

/** The i18n key that explains each refusal. One per reason, by construction. */
export const WHY: Readonly<Record<Exclude<Standing["kind"], "ready">, string>> = {
  "no-build": "git.noBuild",
  "no-file": "git.noFile",
  "no-path": "git.noPath",
};

/**
 * Can this document be asked about, and if not, which of the three reasons is
 * it.
 *
 * `backendKind` is `Backend.kind` — `"wasm"` is the one that cannot ask at all.
 * Everything else turns on the binding, because a path on disk is the whole
 * requirement.
 */
export function standing(binding: FileBinding | null | undefined, backendKind: string): Standing {
  if (backendKind === "wasm") return { kind: "no-build" };
  if (!binding) return { kind: "no-file" };
  // The download tier never wrote a file anywhere Ksav can find again, and the
  // handle tier has a real file with no path — `canWriteBack` already draws
  // this line for saving, and it is the same line.
  if (binding.kind !== "tauri" || !binding.path) return { kind: "no-path" };
  return { kind: "ready", path: binding.path };
}

/**
 * What a repository is in the middle of, in one word.
 *
 * Ordered by what a writer needs to be told first rather than by severity in
 * the abstract: a conflict is work stopped in the document, and it outranks
 * everything, including the fact that there are also uncommitted changes —
 * there always are, during a merge.
 */
export type Health =
  /** git is not installed. */
  | "no-git"
  /** A folder that is not a repository. The one state with an offer attached. */
  | "no-repo"
  /** Mid-merge, with markers in files. */
  | "conflicted"
  /** Changes that are not committed. */
  | "changed"
  /** Committed, and not on the host yet. */
  | "ahead"
  /** The host has commits this copy does not. */
  | "behind"
  | "clean";

export function health(s: GitStatus | null | undefined): Health {
  if (!s || !s.git) return "no-git";
  if (!s.root) return "no-repo";
  if (s.merging || (s.files ?? []).some((f) => f.kind === "unmerged")) return "conflicted";
  if (changed(s).length) return "changed";
  if ((s.ahead ?? 0) > 0) return "ahead";
  if ((s.behind ?? 0) > 0) return "behind";
  return "clean";
}

/**
 * The files a commit would be about.
 *
 * Untracked files are included, and that is a decision rather than an
 * oversight: a sefer that has just been written into a repository is untracked,
 * and a version-control drawer that reports *nothing to commit* about the
 * document the writer is looking at would be worse than not being there.
 */
export function changed(s: GitStatus | null | undefined): GitFile[] {
  return (s?.files ?? []).filter((f) => f.staged !== "." || f.worktree !== ".");
}

/** Is the open document one of them? */
export function documentChanged(s: GitStatus | null | undefined): boolean {
  const t = s?.this;
  if (!t) return false;
  return !t.tracked || t.staged !== "." || t.worktree !== ".";
}

/**
 * The i18n key naming a file's state — never the letter.
 *
 * `M`, `A`, `D`, `R`, `?` are git's alphabet and they are not English, let
 * alone Hebrew. A drawer that prints the letter has handed the reader a lookup
 * table to memorise; the letters mean six things and there are six words.
 */
export function stateKey(f: GitFile): string {
  if (f.kind === "unmerged") return "git.st.conflicted";
  if (f.kind === "untracked") return "git.st.new";
  if (f.kind === "renamed") return "git.st.renamed";
  const letter = f.worktree !== "." ? f.worktree : f.staged;
  switch (letter) {
    case "A":
      return "git.st.added";
    case "D":
      return "git.st.deleted";
    case "M":
      return "git.st.modified";
    default:
      return "git.st.modified";
  }
}

/** Is this file staged — the index differs from HEAD? */
export function isStaged(f: GitFile): boolean {
  return f.staged !== "." && f.staged !== "?";
}

/**
 * A commit's time, as a reader reads times.
 *
 * `Intl` with the interface's own language, because the whole chrome flips and
 * a date in the wrong direction beside a Hebrew subject is a line that reads
 * two ways at once.
 */
export function when(seconds: number, lang: string): string {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  return new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/**
 * The branch line: which branch, and how far from the host.
 *
 * Returned as parts rather than as a sentence, so the caller composes it in the
 * reader's language — `header.ts` gives the reason.
 */
export function position(s: GitStatus): { branch: string; ahead: number; behind: number; upstream: string | null } {
  return {
    branch: s.detached ? (s.head ?? "").slice(0, 7) : (s.branch ?? ""),
    ahead: s.ahead ?? 0,
    behind: s.behind ?? 0,
    upstream: s.upstream ?? null,
  };
}

/**
 * Did that operation work, and what did git say about it.
 *
 * The one place the third ending is read. `merge` answers `ok: true, merged:
 * false` when it stopped on conflicts — git did exactly what it was asked and
 * the writer now has work to do — so a caller checking `ok` alone would report
 * a successful merge over a document full of markers, and a caller checking
 * `merged` alone would report a failure for every other operation, none of
 * which sets it.
 */
export function outcome(a: GitAnswer | null | undefined): {
  ok: boolean;
  conflicted: boolean;
  said: string;
} {
  if (!a) return { ok: false, conflicted: false, said: "" };
  const conflicted = a.merged === false && (a.conflicts?.length ?? 0) > 0;
  return {
    ok: a.ok !== false,
    conflicted,
    said: (a.error ?? a.said ?? "").trim(),
  };
}

/**
 * Every operation this client can name, checked against the engine's list.
 *
 * `GIT_OPS` is generated from `engine/src/git.rs`'s `OPERATIONS`, so this is a
 * `tsc` error rather than a runtime refusal — the same guarantee `ServiceName`
 * gives one level up. It exists as a function so that a caller building an
 * operation name from a string (a menu row, a saved shortcut) has somewhere to
 * check it that is not `as GitOp`.
 */
export function isOp(name: string): name is GitOp {
  return (GIT_OPS as readonly string[]).includes(name);
}
