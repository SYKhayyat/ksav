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
        { class: "mini", type: "button", "data-key-clear": row.id, title: t("keysClear") },
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
