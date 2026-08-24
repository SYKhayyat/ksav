// The panels `main.ts` used to draw, built where a test can build them.
//
// # Why this file exists
//
// `panels.ts` owns the *frame* of every surface — the `open` class, the ×, the
// backdrop, the Escape sweep — and it says at the top that the contents are
// deliberately not there. That was right about the settings drawer, which is
// two hundred lines of fields about this application. It was wrong about three
// panels whose contents are a **reading of the document or of the machine**:
//
//   - the version-control drawer, 243 lines;
//   - the styles panel, 171;
//   - the review panel, 91.
//
// Five hundred lines of decisions in a file no test imports, and each of them
// is the same three decisions the chipbar was making before `header.ts`:
// what does this state look like, what is it called, and is it available.
//
// The version-control drawer is the one that made the cost concrete. The
// assembled run drives a browser against `ksav serve`, where a document is
// bound through a file handle and therefore has no path — so `git.standing` is
// never `ready` there and **every populated state of that drawer is unreachable
// by the one test in this product that looks at the screen**. It could have
// been wrong in every state a writer actually uses it in, in both languages,
// and the suite would have been green. That is not a hypothetical: it is where
// this file came from.
//
// # The shape
//
// Each builder takes what it is drawing plus an `actions` object of callbacks,
// and returns `Node[]`. It holds no state, reads no globals and dispatches
// nothing: the shell owns all of that and passes it in. A test can therefore
// build a panel from a fabricated status, walk the result, and press things —
// counting what the shell was asked to do without an application under it.
//
// `panelrows.ts` is the neighbour and not the same thing: it decides *rows* for
// the four list surfaces `drawList` renders. This decides whole panels that are
// not lists.

import { keyHint } from "./bindings";
import { el, fieldRow, textField, checkField } from "./dom";
import { t, tf, getLang } from "./i18n";
import { panelHead } from "./panels";
import * as git from "./git";
import * as review from "./review";
import {
  DESTINATIONS,
  PRESETS,
  REGION_KNOBS,
  destinationOf,
  englishValue,
  type Caveat,
  type DestinationId,
  type NotePick,
  type RegionSettings,
} from "./channels";
import type { GitBranch, GitCommit, GitRemote, GitStatus } from "./api";

// ---------------------------------------------------------------- git

/** Everything the version-control drawer draws itself from. */
export interface GitView {
  /** Which blocks there are — `git.face`'s decision, made elsewhere. */
  face: git.Face;
  status: GitStatus | null;
  commits: readonly GitCommit[];
  branches: readonly GitBranch[];
  remotes: readonly GitRemote[];
  /** git's own last words, shown verbatim. */
  said: string;
  /** An operation is in flight, so every button is refused and says so. */
  busy: boolean;
  /** The history is showing the whole repository rather than this document. */
  wholeRepo: boolean;
}

/**
 * What pressing something does.
 *
 * Injected rather than imported, which is what makes this module testable at
 * all: a test passes its own recorder and finds out that *Push* asks for
 * `push` with the remote that is actually there, without a backend, a document
 * or a browser.
 */
export interface GitActions {
  run(op: git.GitOp, extra?: Record<string, unknown>): void;
  compare(c: GitCommit): void;
  restore(c: GitCommit): void;
  revert(c: GitCommit): void;
  setScope(wholeRepo: boolean): void;
}

/** A button that runs an operation, refused while one is already running. */
function gitButton(view: GitView, label: string, run: () => void, cls = "sc-key"): HTMLElement {
  return el(
    "button",
    { class: cls + (view.busy ? " disabled" : ""), disabled: view.busy || undefined, onClick: run },
    [label],
  );
}

/** git's own words, in a box that says they are git's. */
function gitSays(said: string): HTMLElement {
  return el("div", { class: "git-said", "data-git": "said" }, [
    el("strong", {}, [t("git.said")]),
    el("pre", {}, [said]),
  ]);
}

/**
 * What the writer has typed into the version-control drawer, kept across its
 * rebuilds. The drawer rebuilds whole on every change — the right call for six
 * blocks of mutable state — and without this, typing a commit message and
 * pressing Ctrl+S rebuilt the drawer mid-sentence and recreated every field
 * empty. Keyed by field; cleared by the action that consumed the draft.
 */
const gitDrafts = new Map<string, string>();

/** A text field whose value survives the drawer rebuilding around it. */
function gitField(key: string, placeholder = "", value = ""): HTMLInputElement {
  const input = textField(gitDrafts.get(key) ?? value, placeholder);
  input.addEventListener("input", () => gitDrafts.set(key, input.value));
  return input;
}

/**
 * The version-control drawer.
 *
 * Rebuilt whole on every change rather than patched, like every other panel
 * here: the alternative is a set of update paths that each have to remember
 * which of six blocks a `git merge` can change, and the answer is all of them.
 *
 * **Which blocks there are is `git.face`'s decision, not this function's.** It
 * walks them; it does not choose them.
 */
export function gitPanel(view: GitView, act: GitActions): Node[] {
  const { face } = view;
  const parts: Node[] = [
    panelHead("git-panel", "git.title"),
    el("p", { class: "styles-lede" }, [t("git.lede")]),
  ];

  // ---- the states with no repository behind them, each with its own answer ----
  switch (face.kind) {
    case "unavailable":
      parts.push(el("p", { class: "git-why", "data-git": "unavailable" }, [t(face.why)]));
      return parts;
    case "asking":
      parts.push(el("p", { class: "git-why", "data-git": "asking" }, [t("git.working")]));
      return parts;
    case "no-git":
      parts.push(
        el("p", { class: "git-why", "data-git": "no-git" }, [t("git.noGit")]),
        el("p", { class: "set-hint" }, [t("git.installGit")]),
      );
      return parts;
    case "no-repo":
      // The one unavailable state with an offer attached.
      parts.push(
        el("p", { class: "git-why", "data-git": "no-repo" }, [t("git.noRepo")]),
        gitButton(view, t("git.init"), () => act.run("init"), "sc-key git-init"),
      );
      if (view.said) parts.push(gitSays(view.said));
      return parts;
  }

  const state = view.status as GitStatus;
  const at = git.position(state);
  parts.push(
    el("div", { class: "git-where", "data-git": "where" }, [
      el("span", { class: "git-branch" }, [
        (state.detached ? t("git.detached") + " " : "") + (at.branch || "—"),
      ]),
      el("span", { class: "git-upstream" }, [
        at.upstream ? `${t("git.upstream")} ${at.upstream}` : t("git.upstreamNone"),
      ]),
      ...(at.ahead ? [el("span", { class: "git-count git-ahead" }, [tf("git.ahead", at.ahead)])] : []),
      ...(at.behind ? [el("span", { class: "git-count git-behind" }, [tf("git.behind", at.behind)])] : []),
    ]),
  );

  const upstreamBox = checkField(!at.upstream);

  for (const section of face.sections) {
    const block: Node[] = [];
    if (section.heading) block.push(el("h3", {}, [t(section.heading)]));

    // An empty block says what empty means, and the sentence is the one
    // `git.face` named. Every list surface in this application does this; the
    // difference here is that the *choice* of sentence is checked by a test
    // rather than being four literals in a file nothing imports.
    if (section.count === 0 && section.empty && section.id !== "identity") {
      block.push(
        el("p", { class: "outline-empty", "data-empty": `git-${section.id}` }, [t(section.empty)]),
      );
    }

    switch (section.id) {
      case "conflict": {
        const stuck = (state.files ?? []).filter((f) => f.kind === "unmerged");
        block.push(
          el("p", { class: "git-why", "data-git": "conflicted" }, [t("git.conflicted")]),
          el("ul", { class: "git-files" }, stuck.map((f) => el("li", { class: "git-file git-unmerged" }, [f.path]))),
          el("div", { class: "rv-tools" }, [
            gitButton(view, t("git.takeOurs"), () => act.run("resolve", { side: "ours" })),
            gitButton(view, t("git.takeTheirs"), () => act.run("resolve", { side: "theirs" })),
            gitButton(view, t("git.abortMerge"), () => act.run("merge-abort")),
          ]),
        );
        break;
      }
      case "changes": {
        const changed = git.changed(state);
        if (changed.length) {
          // The question the list cannot answer by itself: *is my sefer among
          // them?* Twelve dirty files and one writer scanning for their own
          // path is the reading this chip saves.
          const mine = git.documentChanged(view.status) ? view.status?.this?.path : null;
          block.push(
            el(
              "ul",
              { class: "git-files" },
              changed.map((f) =>
                el("li", { class: "git-file" }, [
                  el("span", { class: "git-state" }, [t(git.stateKey(f))]),
                  el("span", { class: "git-path" }, [f.path]),
                  ...(f.from ? [el("small", { class: "git-from" }, [f.from])] : []),
                  ...(git.isStaged(f) ? [el("small", { class: "git-staged" }, [t("git.readyToCommit")])] : []),
                  ...(mine && f.path === mine ? [el("small", { class: "git-this-doc" }, [t("git.thisDoc")])] : []),
                ]),
              ),
            ),
          );
        }
        break;
      }
      case "identity": {
        // Offered *before* the commit that would otherwise fail with git's own
        // nine-line lecture about `user.email`.
        const name = gitField("identity-name");
        const email = gitField("identity-email");
        block.push(
          el("p", { class: "git-why", "data-git": "no-identity" }, [t(section.empty ?? "git.whoNeeded")]),
          fieldRow(t("git.whoName"), name),
          fieldRow(t("git.whoEmail"), email),
          gitButton(view, t("git.whoSet"), () => {
            act.run("who", { name: name.value, email: email.value });
            gitDrafts.delete("identity-name");
            gitDrafts.delete("identity-email");
          }),
          el("p", { class: "set-hint" }, [t("git.whoLocal")]),
        );
        break;
      }
      case "commit": {
        const message = gitField("commit-message", t("git.message"));
        const all = checkField(false);
        block.push(
          el("div", { class: "git-commit" }, [
            message,
            fieldRow(t("git.commitAll"), all),
            gitButton(
              view,
              t("git.commit"),
              () => {
                // An empty message is refused here and not sent, because git's
                // own refusal for it is a paragraph about editors.
                const said = message.value.trim();
                if (!said) return;
                act.run("commit", { message: said, all: all.checked });
                gitDrafts.delete("commit-message");
              },
              "sc-key git-do-commit",
            ),
          ]),
        );
        break;
      }
      case "history": {
        const scope = checkField(view.wholeRepo);
        scope.addEventListener("change", () => act.setScope(scope.checked));
        // Before the list, because it is what the list is *of*.
        block.splice(1, 0, fieldRow(t("git.historyAll"), scope));
        if (view.commits.length) {
          block.push(
            el(
              "ul",
              { class: "git-log" },
              view.commits.map((c) =>
                el("li", { class: "git-commit-row" }, [
                  el("div", { class: "git-subject" }, [c.subject || c.short]),
                  el("div", { class: "git-meta" }, [`${c.author} · ${git.when(c.when, getLang())} · ${c.short}`]),
                  el("div", { class: "rv-actions" }, [
                    gitButton(view, t("git.compare"), () => act.compare(c), "rv-yes"),
                    gitButton(view, t("git.restore"), () => act.restore(c), "rv-yes"),
                    gitButton(view, t("git.revert"), () => act.revert(c), "rv-no"),
                  ]),
                ]),
              ),
            ),
          );
        }
        break;
      }
      case "branches": {
        if (view.branches.length) {
          block.push(
            el(
              "ul",
              { class: "git-branches" },
              view.branches.map((b) =>
                el("li", { class: "git-branch-row" + (b.current ? " current" : "") }, [
                  el("span", { class: "git-path" }, [b.name]),
                  el("small", { class: "git-meta" }, [b.upstream ?? ""]),
                  // No *switch to this branch* and no *merge this branch* on the
                  // one you are standing on: git refuses both, and a button
                  // whose only outcome is git's refusal is a button that lies
                  // about being available.
                  ...(b.current
                    ? []
                    : [
                        el("div", { class: "rv-actions" }, [
                          gitButton(view, t("git.switch"), () => act.run("switch", { name: b.name }), "rv-yes"),
                          gitButton(view, t("git.merge"), () => act.run("merge", { name: b.name }), "rv-yes"),
                        ]),
                      ]),
                ]),
              ),
            ),
          );
        }
        const branchName = gitField("branch-name", t("git.branchName"));
        block.push(
          el("div", { class: "git-new-branch" }, [
            branchName,
            gitButton(view, t("git.create"), () => {
              const name = branchName.value.trim();
              if (!name) return;
              act.run("switch", { name, create: true });
            }),
          ]),
        );
        break;
      }
      case "remotes": {
        if (view.remotes.length) {
          block.push(
            el(
              "ul",
              { class: "git-remotes" },
              view.remotes.map((r) =>
                el("li", { class: "git-remote-row" }, [
                  el("span", { class: "git-path" }, [r.name]),
                  el("small", { class: "git-meta" }, [r.url]),
                ]),
              ),
            ),
          );
        }
        const remoteName = gitField("remote-name", t("git.remoteName"), "origin");
        const remoteUrl = gitField("remote-url", t("git.remoteUrl"));
        const args = () => git.remoteArgs(state, view.remotes);
        block.push(
          el("details", { class: "git-add-remote" }, [
            el("summary", {}, [t("git.addRemote")]),
            fieldRow(t("git.remoteName"), remoteName),
            fieldRow(t("git.remoteUrl"), remoteUrl),
            gitButton(view, t("git.add"), () => {
              const url = remoteUrl.value.trim();
              if (!url) return;
              act.run("remote-add", { name: remoteName.value.trim() || "origin", url });
            }),
          ]),
          el("div", { class: "rv-tools" }, [
            gitButton(view, t("git.fetch"), () => act.run("fetch", args())),
            gitButton(view, t("git.pull"), () => act.run("pull", args())),
            gitButton(view, t("git.push"), () =>
              act.run("push", { ...args(), set_upstream: upstreamBox.checked }),
            ),
          ]),
          fieldRow(t("git.setUpstream"), upstreamBox),
        );
        break;
      }
    }
    parts.push(el("section", { class: "git-section", "data-git-section": section.id }, block));
  }

  if (view.said) parts.push(gitSays(view.said));
  return parts;
}

// ---------------------------------------------------------------- review

/** Everything the review panel draws itself from. */
export interface ReviewView {
  /** Every tracked change and editorial comment in the document. */
  marks: readonly review.ReviewMark[];
  /** Which of the three readings the document is set to. */
  reading: review.ReviewView;
  /** Whose name goes on a comment. */
  reviewer: string;
}

export interface ReviewActions {
  setReading(v: review.ReviewView): void;
  mark(kind: "insert" | "delete"): void;
  comment(): void;
  setReviewer(name: string): void;
  /** Put the caret on a mark, so "which one is this?" is answered by looking
   *  at the document rather than by guessing. */
  goTo(mark: review.ReviewMark): void;
  decide(mark: review.ReviewMark, decision: review.Decision): void;
  decideAll(decision: review.Decision): void;
}

const MARK_ICON: Record<review.MarkKind, string> = { insert: "＋", delete: "－", comment: "✎" };

/**
 * The review panel.
 *
 * A drawer rather than a modal for the reason `panels.ts` records: going
 * through changes means reading them against the text they are in, so the
 * document has to stay on screen.
 */
export function reviewPanel(view: ReviewView, act: ReviewActions): Node[] {
  const changes = view.marks.filter((m) => m.kind !== "comment").length;

  const reading = el(
    "div",
    { class: "style-presets" },
    (["markup", "final", "original"] as review.ReviewView[]).map((v) =>
      el(
        "button",
        {
          class: "style-preset" + (v === view.reading ? " active" : ""),
          "data-reading": v,
          onClick: () => act.setReading(v),
        },
        [t("rv." + v)],
      ),
    ),
  );

  const markRow = (m: review.ReviewMark) =>
    el("div", { class: `rv-item rv-${m.kind}`, "data-mark": m.kind }, [
      el(
        "button",
        { class: "rv-main", title: m.body, onClick: () => act.goTo(m) },
        [
          el("span", { class: "rv-kind" }, [MARK_ICON[m.kind] + " " + t("rv." + m.kind)]),
          el("span", { class: "rv-text" }, [review.excerpt(m.body) || "—"]),
          ...(m.author ? [el("span", { class: "rv-author" }, [m.author])] : []),
        ],
      ),
      el("div", { class: "rv-actions" }, [
        el("button", { class: "rv-yes", title: t("accept"), onClick: () => act.decide(m, "accept") }, [
          // A comment is not a change to accept: it is a note about the text,
          // and what you do with one is settle it.
          m.kind === "comment" ? t("resolve") : t("accept"),
        ]),
        ...(m.kind === "comment"
          ? []
          : [
              el("button", { class: "rv-no", title: t("reject"), onClick: () => act.decide(m, "reject") }, [
                t("reject"),
              ]),
            ]),
      ]),
    ]);

  const reviewer = textField(view.reviewer);
  // On `change`, not `input`: the setter persists settings, and a keystroke in
  // this field was serialising every preference to localStorage per letter.
  // The name is committed when the writer leaves the field or presses Enter.
  reviewer.addEventListener("change", () => act.setReviewer(reviewer.value));

  return [
    panelHead("review-panel", "reviewTitle"),
    el("p", { class: "styles-lede" }, [t("reviewLede")]),

    el("h3", {}, [t("reviewView")]),
    reading,

    el("h3", {}, [t("review")]),
    el("div", { class: "rv-tools" }, [
      el("button", { class: "sc-key", onClick: () => act.mark("insert") }, ["＋ " + t("markInsert")]),
      el("button", { class: "sc-key", onClick: () => act.mark("delete") }, ["－ " + t("markDelete")]),
      el("button", { class: "sc-key", onClick: () => act.comment() }, ["✎ " + t("addComment")]),
    ]),
    fieldRow(t("reviewerName"), reviewer),

    el("h3", {}, [tf("reviewCount", String(changes), String(view.marks.length - changes))]),
    ...(view.marks.length
      ? [
          el("div", { class: "rv-tools" }, [
            el("button", { class: "sc-key", onClick: () => act.decideAll("accept") }, [t("acceptAll")]),
            el("button", { class: "sc-key", onClick: () => act.decideAll("reject") }, [t("rejectAll")]),
          ]),
          ...view.marks.map(markRow),
        ]
      : [el("div", { class: "set-note", "data-empty": "review" }, [t("reviewEmpty")])]),
  ];
}

// ---------------------------------------------------------------- styles

/**
 * One section of the styles panel.
 *
 * The panel is eight of these and it was eight of them written out longhand:
 * a heading, an optional note, a scope selector naming the kind in both the
 * "all of them" and "just this one" phrasings, and then either the rows for one
 * scoped instance or the rows for the document's default.
 *
 * Written out, the shape of every mistake it can make is invisible. A section
 * missing its scope selector means a writer cannot style *this* heading
 * differently from the rest and nothing says so; a section whose instance
 * branch reaches for the wrong row builder shows the controls for bands under
 * the heading *Marks*. Both are exactly the class this repository is being
 * audited for — a working engine behind a surface that reports on it wrongly —
 * and neither is visible in a screenshot of a panel that looks full.
 *
 * As a table it is checkable, and `panelviews.test.mjs` checks it.
 */
export interface StyleSection {
  /** The style command this section is about, and the `data-style` attribute
   *  the shell puts on it: a heading is localised and this is not. */
  kind: string;
  /** The i18n key for its heading. */
  heading: string;
  /** The quieter sentence under it, when it has one. */
  note: string | null;
  /** The two phrasings the scope selector needs: *all the headings* and *this
   *  heading*. Both, because "this one" has to name the thing. */
  scope: [many: string, one: string] | null;
}

/**
 * The styles panel's sections, in order.
 *
 * Three kinds up front — headings, lists, tables — because they are what a
 * writer touches first and what a word processor would call styles at all. The
 * apparatus follows: channels (which are not scopeable, being a document-wide
 * arrangement), then notes, bands, streams, the section tiers, the side column,
 * and marks.
 */
export const STYLE_SECTIONS: readonly StyleSection[] = [
  // The writer's own styles, first, and first is the argument. They were on no
  // surface but the ribbon dropdown, where a style could be *applied* and its
  // formatting could be reached only by applying it to something and then
  // pressing the pencil. This section is the styles list every word processor
  // has: each style named, edited from beside its own name, and given a chord
  // of its own there.
  //
  // No scope selector: a custom style is a `#let` at the top of the document,
  // so "this one" would have to mean a single *use* of it — which is not a
  // thing the document says, and would need a per-use override the engine has
  // no argument for.
  { kind: "mine", heading: "styleMine", note: "styleMineNote", scope: null },
  { kind: "headings", heading: "styleHeadings", note: null, scope: ["kindHeading", "kindHeadingOne"] },
  { kind: "lists", heading: "styleLists", note: null, scope: ["kindList", "kindListOne"] },
  { kind: "tables", heading: "styleTables", note: null, scope: ["kindTable", "kindTableOne"] },
  // No scope selector, and that is not an omission: a destination is a note
  // stream for the whole document, so "this one" names nothing.
  { kind: "destinations", heading: "styleDestinations", note: "styleDestinationsNote", scope: null },
  // The layer under the six apparatus sections, and therefore above them on the
  // page: a writer setting the look of "the notes" should meet the one control
  // that means all of them before the six that mean one each. No scope
  // selector, for the same reason `channels` has none — there is no single
  // element for "this one" to name.
  { kind: "noteText", heading: "styleNoteText", note: "styleNoteTextNote", scope: null },
  { kind: "notes", heading: "styleNotes", note: "styleNotesNote", scope: ["kindNote", "kindNoteOne"] },
  { kind: "bands", heading: "styleBands", note: "styleBandsNote", scope: ["kindBand", "kindBandOne"] },
  { kind: "streams", heading: "styleStreams", note: "styleStreamsNote", scope: ["kindStream", "kindStreamOne"] },
  // The back matter, which had no section at all. Its numbering scheme was
  // reachable only by typing `#הגדרות_הערות_סיום`, and its ink was not
  // reachable at all because the engine had none to offer. No scope selector:
  // one endnote cannot be lettered while its neighbours are numbered — that is
  // two streams, and `#הערתסיום(זרם: …)` is how a document says so.
  { kind: "endnotes", heading: "styleEndnotes", note: "styleEndnotesNote", scope: null },
  { kind: "tiers", heading: "styleTiers", note: "styleTiersNote", scope: ["kindTier", "kindTierOne"] },
  { kind: "sidenotes", heading: "styleSidenotes", note: "styleSidenotesNote", scope: ["kindSidenote", "kindSidenoteOne"] },
  { kind: "marks", heading: "styleMarks", note: "styleMarksNote", scope: ["kindMark", "kindMarkOne"] },
];

/**
 * A section's frame: its heading, its note, and its scope selector.
 *
 * The rows themselves stay in the shell, and that is stated rather than
 * quietly true. Behind these ten sections are 800 lines of controls — 
 * `noteStyleRows` alone is 78 and `channelRows` 121 — every one of which reads
 * a Typst argument out of the open document and writes one back. Moving them
 * would mean an interface of some sixty values and sixty setters, which is a
 * project rather than a step, and what those controls *decide* is already held
 * by `styles.test.mjs`'s 140 assertions against `styles.ts`, which is the
 * module that actually writes the markup. What was **not** held anywhere is the
 * composition above, and that is what moved.
 */
export function styleSection(section: StyleSection, scopeRows: Node[], rows: Node[]): Node {
  return el("section", { class: "style-section", "data-style": section.kind }, [
    el("h3", {}, [t(section.heading)]),
    ...(section.note ? [el("p", { class: "styles-note" }, [t(section.note)])] : []),
    ...scopeRows,
    ...rows,
  ]);
}

// ---------------------------------------------------------------- the keys

/** One rebindable action, as the keys drawer needs it. */
export interface KeyRow {
  /** The action's id, so a press can name it back to the shell. */
  id: string;
  /** What it does, in words. Resolved by the shell — a structural operation
   *  names itself from its registry, a macro from its own title. */
  name: string;
  /** The chord it holds, or the empty string for none. */
  key: string;
  /** What it answers to under a mode: `makelist`, for `:makelist` and `M-x
   *  makelist`. Spelled by `keymodes.commandName`, which is the shell's. */
  command: string;
}

/** Everything the keys drawer draws itself from. */
export interface KeysView {
  rows: readonly KeyRow[];
  /** What the search box holds. */
  query: string;
  /**
   * A keyboard mode has the whole keyboard, so none of these chords is live.
   *
   * `null` when none has. When one has, the drawer prints what to type instead —
   * `:name` in vim, `M-x name` in Emacs — because a screen full of chords that
   * now do something else is worse than an empty column: a reader has no way to
   * tell. The naming is the shell's, since it is `keymodes` that decides it.
   */
  mode: { kind: "vim" | "emacs" } | null;
}

export interface KeysActions {
  /** The search box moved. */
  search(query: string): void;
  /** Take the next chord for this action. The button is passed because capture
   *  writes its progress into it — "press a key", then the key. */
  capture(id: string, button: HTMLElement): void;
  /** Leave this action with no chord at all. */
  clear(id: string): void;
  /** Every chord back to what it shipped as. */
  reset(): void;
}

/**
 * Does this row answer the search? Its words or its key, either way.
 *
 * `shown` is what the row actually prints — `Ctrl+K`, or `M-x palette` while a
 * mode holds the keyboard. Searching the *printed* text rather than the stored
 * chord is the difference between a box that finds what is on screen and one
 * that finds what used to be: under Emacs there is no `Ctrl+K` in this list to
 * find.
 */
function keyMatches(row: KeyRow, shown: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.name.toLowerCase().includes(q) ||
    shown.toLowerCase().includes(q) ||
    row.id.toLowerCase().includes(q)
  );
}

/**
 * The keyboard, as a surface of its own.
 *
 * Sixty-odd rows of key capture used to sit at the bottom of the settings
 * drawer, below the paper size, the margins, the dictionary and the asset list —
 * one scroll, two subjects. Inventory item 126 is about the half of that which
 * is a placement problem: *"what does each key do"* is a reference question, of
 * the same kind as the command list and the help page, and it is asked while
 * working rather than while setting the application up.
 *
 * Two things arrive with the move, and both are the reason it is not only a
 * move:
 *
 *   - **a search box.** Sixty rows in document order is a list you read rather
 *     than a list you use, and the question people actually bring to it is "what
 *     is the key for X" or "what has Ctrl+G". Both are answerable now, because
 *     the chord is searchable as well as the name.
 *   - **unbinding one action.** There was no way to take a key off a single
 *     action: capture assigns, and the only removal was the reset that discards
 *     every custom chord in the application. The row's `×` does exactly this
 *     one.
 */
export function keysPanel(view: KeysView, act: KeysActions): Node[] {
  const search = textField(view.query, t("keysSearch"));
  search.setAttribute("id", "keys-search");
  search.addEventListener("input", (e) => act.search((e.target as HTMLInputElement).value));

  // One spelling of a key, for the whole application, computed once per row and
  // used for both the search and the button. `keyHint` is what the menus, the
  // toolbar tooltips and the settings door all call, so this list cannot go on
  // being the only surface that knows a mode has taken the keyboard — which is
  // exactly what it was.
  const labelled = view.rows.map(
    (r) => [r, keyHint(r.key, view.mode?.kind ?? "default", r.command)] as const,
  );
  const shown = labelled.filter(([r, label]) => keyMatches(r, label, view.query));
  const out: Node[] = [
    el("div", { class: "set-note" }, [t("keysNote")]),
    fieldRow(t("keysSearch"), search),
  ];

  // What a mode has done to this list, said once at the top rather than implied
  // sixty times by a disabled button.
  if (view.mode) {
    out.push(
      el("div", { class: "set-note sc-key-mode-note", "data-mode": view.mode.kind }, [
        t(view.mode.kind === "vim" ? "keysTakenVim" : "keysTakenEmacs"),
      ]),
    );
  }

  out.push(
    el("div", { class: "set-note", id: "keys-count" }, [
      tf("keysShowing", shown.length, view.rows.length),
    ]),
  );

  // The empty state is a sentence, not an absence. A drawer that renders nothing
  // for a query with no answers reads as a drawer that is broken.
  if (!shown.length) {
    out.push(el("div", { class: "set-note", "data-empty": "keys" }, [t("keysNothing")]));
    return out;
  }

  for (const [row, hint] of shown) {
    const label = hint || "—";
    const button = el(
      "button",
      {
        class: "sc-key" + (view.mode ? " sc-key-mode" : ""),
        type: "button",
        "data-key-for": row.id,
        disabled: view.mode ? "true" : null,
      },
      [label],
    );
    if (!view.mode) button.addEventListener("click", () => act.capture(row.id, button));
    const kids: Node[] = [el("span", {}, [row.name]), button];
    // Offered only where there is something to take off, and never while a mode
    // holds the keyboard: unbinding a chord that is not in force would be a
    // control whose effect is invisible until the mode is turned off again.
    if (row.key && !view.mode) {
      const off = el(
        "button",
        {
          class: "mini",
          type: "button",
          "data-key-clear": row.id,
          title: t("keysClear"),
          "aria-label": t("keysClear"),
        },
        ["×"],
      );
      off.addEventListener("click", () => act.clear(row.id));
      kids.push(off);
    }
    out.push(el("label", { class: "set-row", "data-key-row": row.id }, kids));
  }

  const reset = el("button", { class: "sc-reset", type: "button", id: "keys-reset" }, [
    t("resetShortcuts"),
  ]);
  reset.addEventListener("click", () => act.reset());
  out.push(reset);
  return out;
}
// ---------------------------------------------------------------- notes chooser
//
// One question, and it is the only question: **where should this note print?**
//
// What was here was a thirty-cell `where` x `how` grid with eleven cards in it,
// three presentations of that grid, a body-placement block, and somewhere past
// fifty controls on one screen — all about a decision the person opening the
// panel has usually already made. Worse than the volume, the shape was wrong:
// the cells *were* the product, so an arrangement nobody had written a card for
// was unreachable even when the engine had shipped it.
//
// The model underneath is one axis (`channels.DESTINATIONS`), so the panel is
// one row of six. Everything else on this screen is derived from the pick:
//
//   - **the presets** are picks, not a parallel list. Pressing one sets a
//     destination and, where it needs one, a region — and leaves the writer
//     holding an ordinary pick they can take apart, which is the whole
//     difference between a preset and a cell.
//   - **the refusals** are `channels.caveatsFor`, in words, under the pick they
//     are about. Not a `title` tooltip: absent on a touch screen, absent to
//     anyone not hovering, absent to a screen reader.
//   - **the sketches** are the one thing the cards got right and are kept.
//
// Where the note's *prose* goes in the file is deliberately **not** here. It
// changes the file and never the page, so it is a document preference and lives
// with the document preferences; a writer choosing where a note prints should
// not have to walk past a question about their source to get there.

/** Everything the notes chooser draws itself from. */
export interface NotesView {
  /**
   * The pick in hand. Never null: there is always a destination, and the
   * everyday one is the foot of the page — which is what a person who opened
   * this panel wanting a footnote should find already answered.
   */
  pick: NotePick;
  /** The regions this document declared, in declaration order. */
  regions: readonly string[];
  /** What is wrong with this pick against this document. */
  caveats: readonly Caveat[];
  /** The preset the pick still matches, when it matches one. */
  preset: string | null;
}

export interface NotesActions {
  /** The writer answered the question. */
  pick(pick: NotePick): void;
  /** A preset was pressed: set its pick, and make its region if it needs one. */
  usePreset(id: string): void;
  /** Write a note at the caret with the pick in hand, and close. */
  use(): void;
  /**
   * Compile the pick against the writer's own opening and put the first page in
   * `host`.
   *
   * Injected because it needs a backend and the document, neither of which
   * belongs in a view. A test passes a recorder and finds out that exactly one
   * destination was asked to preview.
   */
  preview(host: HTMLElement, pick: NotePick): void;
}

/**
 * Which destination a pick names, for the row that has to look selected.
 *
 * Exported because the shell asks the same question — the preview is drawn from
 * it and `Enter` acts on it — and two functions deciding what "the current pick"
 * means is how the highlighted row and the button that writes it come apart.
 */
export function pickedDestination(view: NotesView): DestinationId {
  return view.pick.dest;
}

/**
 * The pick after a change of destination.
 *
 * A region name is meaningless under any other destination, so it is dropped
 * rather than carried across unexamined; moving *to* a region takes the first
 * one the document has, so the commonest case needs one press rather than two.
 * The shell calls this rather than deciding for itself, so the panel and the
 * state cannot disagree about what a change of destination means.
 */
export function pickAfterDestination(
  dest: DestinationId,
  regions: readonly string[],
  held: string | null,
): NotePick {
  if (dest !== "region") return { dest, region: null };
  return { dest, region: held && regions.includes(held) ? held : (regions[0] ?? null) };
}

/** The tiny page diagram, and the live page once one has been compiled. */
function destinationSketch(pick: NotePick, act: NotesActions, live: boolean): HTMLElement {
  const host = el("div", { class: "note-preview" }, [
    destinationOf(pick.dest).sketch.join("\n"),
  ]);
  if (live) act.preview(host, pick);
  return host;
}

/**
 * The presets, as one press each.
 *
 * **Derived, never a separate list.** Each of these is a *value* of the one axis
 * — a destination, and for two of them a region — so pressing one leaves the
 * writer in exactly the state they would have reached by hand, and the row of
 * destinations below shows which one they landed on. A preset that could not be
 * taken apart would be a cell wearing a friendlier name.
 */
function presetRow(view: NotesView, act: NotesActions): HTMLElement {
  return el(
    "div",
    { class: "note-quick-row", "data-nq": "presets" },
    PRESETS.map((p) =>
      el(
        "button",
        {
          class: "note-quick" + (view.preset === p.id ? " on" : ""),
          "data-note-preset": p.id,
          "aria-pressed": view.preset === p.id ? "true" : "false",
          onClick: () => act.usePreset(p.id),
        },
        [
          el("span", { class: "note-quick-sketch" }, [
            destinationOf(p.pick.dest).sketch.join("\n"),
          ]),
          el("span", {}, [
            el("b", {}, [t("preset." + p.id)]),
            el("span", {}, [t("presetDesc." + p.id)]),
          ]),
        ],
      ),
    ),
  );
}

/** The one question: six destinations, each showing what it builds. */
function destinationRow(view: NotesView, act: NotesActions): HTMLElement {
  return el(
    "div",
    { class: "nq-options nq-destinations", "data-nq": "destinations" },
    DESTINATIONS.map((d) =>
      el(
        "button",
        {
          class: "nq-option" + (view.pick.dest === d.id ? " on" : ""),
          "data-dest": d.id,
          "aria-pressed": view.pick.dest === d.id ? "true" : "false",
          onClick: () =>
            act.pick(pickAfterDestination(d.id, view.regions, view.pick.region)),
        },
        [
          el("span", { class: "nq-sketch" }, [d.sketch.join("\n")]),
          el("b", {}, [t("dest." + d.id)]),
          el("span", {}, [t("destDesc." + d.id)]),
        ],
      ),
    ),
  );
}

/**
 * *"A region"* expands to *"which region"*.
 *
 * The list is the **document's**, not a menu: regions are made and named by the
 * writer in the page-layout surface, which is where a general page-splitting
 * mechanism belongs. A document with none says so and says where to go — a panel
 * that offers an empty list is a panel that looks broken.
 */
function regionRow(view: NotesView, act: NotesActions): Node[] {
  if (view.pick.dest !== "region") return [];
  if (!view.regions.length) {
    return [
      el("p", { class: "nq-wait", "data-nq": "no-regions" }, [t("notesNoRegions")]),
    ];
  }
  return [
    el("h3", { class: "nq-ask" }, [t("notesRegionQ")]),
    el(
      "div",
      { class: "nq-options", "data-nq": "regions" },
      view.regions.map((name) =>
        el(
          "button",
          {
            class: "nq-option" + (view.pick.region === name ? " on" : ""),
            "data-region": name,
            "aria-pressed": view.pick.region === name ? "true" : "false",
            onClick: () => act.pick({ dest: "region", region: name }),
          },
          [el("b", {}, [name])],
        ),
      ),
    ),
  ];
}

/**
 * Why this pick costs something, or cannot be written at all — in words, under
 * the pick it is about.
 *
 * *"Two balanced apparatuses at the live page foot — Typst has one, so the
 * second becomes a box"* is a sentence, and a writer who is never shown it has
 * no way to tell a wrong question from a gap in the product. The grid this
 * replaced put its reasons in a `title` attribute and greyed the cell, which
 * says neither thing to anybody who is not hovering a mouse.
 */
function caveatRows(view: NotesView): Node[] {
  return view.caveats.map((c) =>
    el(
      "p",
      { class: "note-caveat" + (c.blocks ? " blocks" : ""), "data-caveat": c.why },
      [t(c.why)],
    ),
  );
}

/** The notes chooser, whole. */
export function notesPanel(view: NotesView, act: NotesActions): Node[] {
  const blocked = view.caveats.some((c) => c.blocks);
  return [
    panelHead("notes-chooser", "notesChooserTitle"),
    el("p", { class: "notes-lede" }, [t("notesChooserLede")]),
    el("h3", {}, [t("notesPresets")]),
    presetRow(view, act),
    el("p", { class: "notes-mix" }, [t("notesTakeApart")]),
    el("h3", { class: "nq-ask" }, [t("notesQ1")]),
    destinationRow(view, act),
    ...regionRow(view, act),
    ...caveatRows(view),
    // The answer, shown as the page it makes, with the button that writes it.
    // Measured in the assembled run: this used to land below the bottom of a
    // 1280x720 viewport, so a writer who had just answered was looking at the
    // space where their answer was not.
    el("div", { class: "note-card picked", "data-note-card": view.pick.dest }, [
      destinationSketch(view.pick, act, !blocked),
      el("div", { class: "note-body" }, [
        el("b", {}, [t("dest." + view.pick.dest)]),
        ...(view.pick.region ? [el("span", { class: "note-alias" }, [view.pick.region])] : []),
        el("div", { class: "note-actions" }, [
          el(
            "button",
            {
              class: "note-use",
              "data-note-use": view.pick.dest,
              ...(blocked ? { disabled: "disabled" } : {}),
              onClick: () => act.use(),
            },
            [t("useThis")],
          ),
        ]),
      ]),
    ]),
  ];
}

// ---------------------------------------------------------------- the region
//
// **A destination is a stream and a region is a place**, and the styles panel
// had four controls for the second out of eighteen keys. A destination owns its
// numbering and its type and `#ערוץ` is its line; a region is a place on the
// page — how tall it is, what it does when a note outgrows it, whether it holds
// its slot on a page it has nothing on — and `#אזור` is that one.
//
// Built here rather than in `main.ts` for the reason at the top of this file: a
// panel drawn where no test can build it is a panel that has never been built by
// anything. That is not a hypothetical for this one either. Its controls write
// Typst into the writer's document — a tuple whose *order is the policy*, a
// tuple of one whose comma decides whether the region does anything at all — and
// a control that writes the wrong thing is a sefer that lays out wrong, not a
// panel that looks odd.

/** Everything a region's own controls draw themselves from. */
export interface RegionView {
  /** The region's name, as the document wrote it. */
  name: string;
  /** What the document has already said about it, in the prelude's own words. */
  held: RegionSettings;
}

/** What pressing one of them asks the shell to do. */
export interface RegionActions {
  /**
   * Write these knobs onto the region's declaration.
   *
   * `undefined` keeps what the document said and `null` clears one, which is the
   * rule `writeRegion` states and the reason a panel that writes one knob does
   * not wipe the seventeen beside it.
   */
  set(fields: RegionSettings): void;
}

/**
 * One member of a region's vocabulary, said in the *interface's* language.
 *
 * Looked up through the English spelling, because that is the one thing both
 * languages agree on: the prelude's word is Hebrew, the reader may be reading
 * either, and a translation key made of Hebrew letters is a key nobody can grep
 * for.
 */
function regionWord(member: string): string {
  return t("regionValue." + (englishValue(member) ?? member));
}

/** A `<select>` over a fixed set, with the current member shown as chosen. */
function pickOne(
  options: [string, string][],
  current: string,
  onPick: (v: string) => void,
): HTMLElement {
  return el(
    "select",
    { onChange: (e: Event) => onPick((e.target as HTMLSelectElement).value) },
    options.map(([v, label]) =>
      el("option", { value: v, ...(current === v ? { selected: "selected" } : {}) }, [label]),
    ),
  );
}

/** The rows for one region's own settings, in the order the prelude lists them. */
export function regionPanel(view: RegionView, act: RegionActions): Node[] {
  const rows: Node[] = [
    el("h3", { style: "margin-top:18px" }, [t("regionSettings")]),
    el("p", { class: "styles-note" }, [t("regionSettingsNote")]),
  ];
  for (const knob of REGION_KNOBS) {
    const now = view.held[knob.key] ?? "";
    let control: Node;
    if (knob.kind === "set") {
      // A set is a box per member and not a text field: the writer is picking
      // several out of seven and wants the seven where they can be compared.
      const chosen = now === "" ? [] : now.split(",");
      control = el(
        "span",
        { class: "chan-actions" },
        (knob.choices ?? []).map((m) => {
          const box = checkField(chosen.includes(m));
          box.addEventListener("change", () => {
            const next = box.checked ? [...chosen, m] : chosen.filter((c) => c !== m);
            // Written back in the prelude's own order, and that is not tidiness:
            // for `גלישה` the order **is** the policy — the moves are tried in
            // the order they are listed — so a box ticked last must not become
            // the move tried last.
            act.set({
              [knob.key]: (knob.choices ?? []).filter((c) => next.includes(c)).join(","),
            });
          });
          return el("label", { class: "region-box", "data-member": m }, [box, regionWord(m)]);
        }),
      );
    } else if (knob.kind === "flag") {
      // Three states and not two. A switch the document has not mentioned is not
      // the same as one it set to `false`: the first takes the prelude's default,
      // which for `שומר_מקום` is `true`.
      control = pickOne(
        [
          ["", t("flagDefault")],
          ["true", t("flagYes")],
          ["false", t("flagNo")],
        ],
        now,
        (v) => act.set({ [knob.key]: v === "" ? null : v }),
      );
    } else if (knob.kind === "choice") {
      control = pickOne(
        [["", t("flagDefault")], ...(knob.choices ?? []).map((m) => [m, regionWord(m)] as [string, string])],
        now,
        (v) => act.set({ [knob.key]: v === "" ? null : v }),
      );
    } else {
      const field = textField(now, knob.hint);
      field.addEventListener("change", () =>
        act.set({ [knob.key]: field.value.trim() || null }),
      );
      control = field;
    }
    rows.push(el("div", { "data-knob": knob.key }, [fieldRow(t(knob.label), control)]));
    // Said once, beside the control it is about: three of the ten moves are not
    // on that list and cannot be, because they always apply. A writer looking for
    // clamping and not finding it should read why rather than conclude it is
    // missing.
    if (knob.key === "spill") rows.push(el("p", { class: "styles-note" }, [t("regionSpillNote")]));
  }
  return rows;
}
