// The version-control drawer: git's face, drawn from the git service.
//
// Owns: the drawer's whole state (status, said, busy, the three lists), one
// whole-repo scope for the history list, `gitForHeader` (what the chipbar is
// told), and the three commit verbs (compare / restore / revert).
// Defers: `git.ts` owns what git means (standing, face, health, position),
// `panelviews.ts` owns what the drawer looks like, and the shell's modal and
// body swap arrive as the registered wiring. Refuses: a second wording for
// git's own sentences — git's words are shown, never rephrased.

import { t, tf, getLang } from "./i18n";
import { makeWiring } from "./wiring";
import * as git from "./git";
import { ask } from "./formmodal";
import * as api from "./api";
import * as panelviews from "./panelviews";
import * as runtime from "./runtime";
import { setStatus, rerenderChrome } from "./runtime";
import { closeMenus, isPanelOpen, openPanel } from "./panels";
import { voidAction } from "./asyncaction";
import { takeSnapshot } from "./snapshots";
import { setBaseline } from "./changes";
import * as header from "./header";

// # The wiring
//
// Compare/restore/revert reach two verbs the drawer borrows rather than
// rebuilds: the shell's modal question and the body swap (the editor's own
// dispatch, closeMenus and focus). Registered from main.ts's boot.
export interface GitWiring {
  /** Swap the editor's whole body (the restore of a commit's text). The modal
   *  question is a direct import from formmodal — the wiring for it was pure
   *  indirection, no cycle anywhere. */
  loadBody(body: string): void;
}

const W = makeWiring<GitWiring>("wireGit");
export const wireGit = W.wire;
export const gitWiring = W.get;

// ---------------------------------------------------------------- version control
//
// The drawer over `engine/src/git.rs`. Three rules run through all of it:
//
//   * **Every unavailable state says which one it is.** `git.standing` returns
//     one of three reasons and each has its own sentence — save the document,
//     use the installed application, install git. A drawer that greys out with
//     no explanation is the fault this repository is named after.
//   * **git's own words are shown, never rephrased.** "Permission denied
//     (publickey)" is the one string a reader can search for.
//   * **The comparison is the change gutter.** "Compare with now" sets the same
//     baseline the snapshot history sets, so a git commit and a snapshot are
//     read the same way, by one diff, in the margin the writer already knows.
//     A second diff view over `git diff`'s unified text would be a second
//     opinion about what changed in one document, in one application.

/** What the drawer last learned, so a redraw does not restart a subprocess. */
let gitState: api.GitStatus | null = null;
/** The last thing git said, shown until the next operation replaces it. */
let gitSaid = "";
/** An operation is in flight; the buttons are disabled and say so. */
let gitBusy = false;
/** `true` while the history list is showing the whole repository. */
let gitWholeRepo = false;
let gitCommits: api.GitCommit[] = [];
let gitBranches: api.GitBranch[] = [];
let gitRemotes: api.GitRemote[] = [];

/** Where version control stands for the document that is open now. */
function gitStanding(): git.Standing {
  return git.standing(runtime.currentBinding, runtime.backend?.kind ?? "");
}

/**
 * Ask git one thing.
 *
 * Returns `null` when this document cannot be asked about at all, which the
 * callers treat as "the drawer already says why" rather than as a failure —
 * every one of them is reached from a button that only exists once `standing`
 * is `ready`.
 */
async function askGit(op: git.GitOp, extra: Record<string, unknown> = {}): Promise<api.GitAnswer | null> {
  const where = gitStanding();
  if (where.kind !== "ready" || !runtime.backend) return null;
  gitBusy = true;
  renderGitPanel();
  try {
    return await runtime.backend.git(op, where.path, extra);
  } catch (e) {
    // A transport that threw is not git refusing: the engine went away, or the
    // desktop command failed. Shown as it arrived, for the same reason git's
    // own sentences are.
    return { ok: false, git: null, root: null, error: String((e as Error)?.message ?? e) };
  } finally {
    gitBusy = false;
  }
}

/**
 * Re-read the whole state and redraw.
 *
 * One `status` and, when there is a repository, the three lists beside it.
 * Asked together rather than lazily per section: they are four short
 * subprocesses on a local directory, and a drawer that fills in section by
 * section as each returns is a drawer that is wrong three times on the way to
 * being right.
 */
export async function refreshGit(): Promise<void> {
  const where = gitStanding();
  if (where.kind !== "ready") {
    gitState = null;
    renderGitPanel();
    rerenderChrome();
    return;
  }
  const status = (await askGit("status")) as api.GitStatus | null;
  gitState = status;
  if (status?.root) {
    const [log, branches, remotes] = await Promise.all([
      askGit("log", { scope: gitWholeRepo ? "repo" : "file", limit: 50 }),
      askGit("branches"),
      askGit("remotes"),
    ]);
    gitCommits = log?.commits ?? [];
    gitBranches = branches?.branches ?? [];
    gitRemotes = remotes?.remotes ?? [];
  } else {
    gitCommits = [];
    gitBranches = [];
    gitRemotes = [];
  }
  renderGitPanel();
  // The chip reports what the drawer found. Without this the state is only
  // visible while the drawer is open, which is the opposite of what a chip is
  // for.
  rerenderChrome();
}

/** Run an operation, show what git said, and re-read everything. */
export async function runGit(op: git.GitOp, extra: Record<string, unknown> = {}): Promise<api.GitAnswer | null> {
  const answer = await askGit(op, extra);
  const said = git.outcome(answer);
  gitSaid = said.said;
  await refreshGit();
  return answer;
}

export function openGit() {
  closeMenus();
  openPanel("git-panel");
}

export function isGitOpen(): boolean {
  return isPanelOpen("git-panel");
}

/**
 * Throw away what git said about the *previous* document.
 *
 * Called when the open document changes and when it is saved to a new file.
 * The state here is about one path on disk, and keeping it across a switch
 * would leave the chip reporting a branch and a change count belonging to a
 * sefer that is no longer on screen. Re-asked immediately when the drawer is
 * open, because a drawer that empties and waits for a click is its own small
 * lie.
 */
export function forgetGit(): void {
  gitState = null;
  gitSaid = "";
  gitCommits = [];
  gitBranches = [];
  gitRemotes = [];
  if (isGitOpen()) voidAction("general", () => refreshGit());
}

/** The file on disk changed under version control's feet: re-read, if open. */
export function gitMayHaveChanged(): void {
  if (isGitOpen()) voidAction("general", () => refreshGit());
}

/**
 * What the chipbar is told.
 *
 * `undefined` until something has actually asked git, because "not asked" and
 * "clean" are different states and a chip that reads clean before a `git
 * status` has run is the interface lying about what it displays.
 */
export function gitForHeader(): header.HeaderState["vcs"] {
  if (!gitState) return undefined;
  const h = git.health(gitState);
  return {
    health: h,
    branch: gitState.root ? git.position(gitState).branch : "",
    changes: git.changed(gitState).length,
  };
}

/**
 * The drawer.
 *
 * Rebuilt whole on every change rather than patched, like every other panel
 * here: the alternative is a set of update paths that each have to remember
 * which of six sections a `git merge` can change, and the answer is all of
 * them.
 *
 * **Which sections there are is `git.face`'s decision, not this function's.**
 * That split is not tidiness. The assembled run drives a browser against
 * `ksav serve`, where a document is bound through a file handle and therefore
 * has no path — so everything below the first `switch` is unreachable by the
 * one test in this product that looks at the screen. Every state a writer
 * actually uses this drawer in could have been wrong and the suite would have
 * been green. `git.face` can be driven with a status nothing had to produce,
 * and `git.test.mjs` does.
 */

export function renderGitPanel(): void {
  const box = document.getElementById("git-body");
  if (!box) return;
  const fresh = panelviews.gitPanel(
      {
        face: git.face(gitStanding(), gitState, gitCommits, gitBranches, gitRemotes),
        status: gitState,
        commits: gitCommits,
        branches: gitBranches,
        remotes: gitRemotes,
        said: gitSaid,
        busy: gitBusy,
        wholeRepo: gitWholeRepo,
      },
      {
        run: (op, extra) => voidAction("general", () => runGit(op, extra)),
        compare: (c) => voidAction("general", () => compareWithCommit(c)),
        restore: (c) => voidAction("save_file", () => restoreCommit(c)),
        revert: (c) => voidAction("save_file", () => revertCommit(c)),
        setScope: (whole) => {
          gitWholeRepo = whole;
          voidAction("general", () => refreshGit());
        },
      },
    );
  // The panel view remains a pure builder, but its status rows have semantic
  // identities. Reuse unchanged rows across a refresh so a focused action or a
  // row-level selection survives; changed rows are replaced with fresh
  // listeners and content rather than retaining stale closures.
  reuseGitRows(box, fresh);
  box.replaceChildren(...fresh);
}

function reuseGitRows(previous: HTMLElement, fresh: Node[]): void {
  const old = new Map<string, HTMLElement>();
  previous.querySelectorAll<HTMLElement>("[data-git-row]").forEach((row) => {
    const key = row.getAttribute("data-git-row");
    if (key) old.set(key, row);
  });
  const visit = (node: Node): void => {
    if (!(node instanceof HTMLElement)) return;
    const key = node.getAttribute("data-git-row");
    if (key) {
      const prior = old.get(key);
      if (prior && prior.getAttribute("data-git-signature") === node.getAttribute("data-git-signature")) {
        node.replaceWith(prior);
      }
      return;
    }
    [...node.children].forEach(visit);
  };
  fresh.forEach(visit);
}
/**
 * Compare the document with how it was at a commit.
 *
 * The change gutter's baseline, which is the same mechanism the snapshot
 * history uses — one diff, one set of marks in the margin, one thing to learn.
 * It holds until the next snapshot resets it, which is what `refreshBaseline`
 * already does and is worth saying rather than leaving to be discovered.
 */
async function compareWithCommit(c: api.GitCommit): Promise<void> {
  const answer = await askGit("show", { rev: c.hash });
  if (!answer || answer.ok === false || typeof answer.text !== "string") {
    gitSaid = git.outcome(answer).said;
    renderGitPanel();
    return;
  }
  runtime.view.dispatch({ effects: setBaseline.of(answer.text) });
  setStatus(`${t("git.compare")} · ${c.short}`, "ok");
}

async function restoreCommit(c: api.GitCommit): Promise<void> {
  const stamp = git.when(c.when, getLang());
  if (!(await ask(tf("git.confirmRestore", stamp), { danger: true }))) return;
  // A snapshot first, exactly as restoring a snapshot takes one: whatever is in
  // the editor now must survive being replaced.
  await takeSnapshot(true);
  const answer = await askGit("show", { rev: c.hash });
  if (!answer || answer.ok === false || typeof answer.text !== "string") {
    gitSaid = git.outcome(answer).said;
    renderGitPanel();
    return;
  }
  gitWiring().loadBody(answer.text);
  setStatus(tf("git.restored", stamp), "ok");
  await refreshGit();
}

async function revertCommit(c: api.GitCommit): Promise<void> {
  if (!(await ask(tf("git.confirmRevert", c.subject || c.short), { danger: true }))) return;
  await runGit("revert", { rev: c.hash });
}
