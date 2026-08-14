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

import { el, fieldRow, textField, checkField } from "./dom";
import { t, tf, getLang } from "./i18n";
import { panelHead } from "./panels";
import * as git from "./git";
import * as review from "./review";
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
        const name = textField("");
        const email = textField("");
        block.push(
          el("p", { class: "git-why", "data-git": "no-identity" }, [t(section.empty ?? "git.whoNeeded")]),
          fieldRow(t("git.whoName"), name),
          fieldRow(t("git.whoEmail"), email),
          gitButton(view, t("git.whoSet"), () => act.run("who", { name: name.value, email: email.value })),
          el("p", { class: "set-hint" }, [t("git.whoLocal")]),
        );
        break;
      }
      case "commit": {
        const message = textField("", t("git.message"));
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
        const branchName = textField("", t("git.branchName"));
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
        const remoteName = textField("origin", t("git.remoteName"));
        const remoteUrl = textField("", t("git.remoteUrl"));
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
  reviewer.addEventListener("input", () => act.setReviewer(reviewer.value));

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
 * arrangement), then notes, bands, streams and marks.
 */
export const STYLE_SECTIONS: readonly StyleSection[] = [
  { kind: "headings", heading: "styleHeadings", note: null, scope: ["kindHeading", "kindHeadingOne"] },
  { kind: "lists", heading: "styleLists", note: null, scope: ["kindList", "kindListOne"] },
  { kind: "tables", heading: "styleTables", note: null, scope: ["kindTable", "kindTableOne"] },
  // No scope selector, and that is not an omission: a channel is a note stream
  // for the whole document, so "this one" names nothing.
  { kind: "channels", heading: "styleChannels", note: "styleChannelsNote", scope: null },
  { kind: "notes", heading: "styleNotes", note: "styleNotesNote", scope: ["kindNote", "kindNoteOne"] },
  { kind: "bands", heading: "styleBands", note: "styleBandsNote", scope: ["kindBand", "kindBandOne"] },
  { kind: "streams", heading: "styleStreams", note: "styleStreamsNote", scope: ["kindStream", "kindStreamOne"] },
  { kind: "marks", heading: "styleMarks", note: "styleMarksNote", scope: ["kindMark", "kindMarkOne"] },
];

/**
 * A section's frame: its heading, its note, and its scope selector.
 *
 * The rows themselves stay in the shell, and that is stated rather than
 * quietly true. Behind these eight sections are 650 lines of controls — 
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
