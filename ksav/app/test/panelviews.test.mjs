// The version-control drawer, built and pressed.
//
// # Why this file is possible and was not
//
// These 240 lines lived in `main.ts`, which no test imports, and they were
// unreachable from the browser too: the assembled run drives `ksav serve`,
// where a document is bound through a file handle and therefore has no path, so
// `git.standing` is never `ready` there. Every populated state of this drawer —
// the branch line, the file list, the commit box, the history, the branches,
// the remotes, the conflict block — had never been built by anything, in any
// language, by any check in this repository.
//
// So this is the first test in the product that asserts what a panel actually
// *contains*. It is not a browser: `installChrome` gives a DOM stub whose
// elements are plain objects, which is enough to walk a tree and press a
// button, and is the same instrument `panels.test.mjs` uses to click its way
// out of every surface.

import { check, ok, notOk } from "./harness.mjs";
import { installChrome } from "./harness.mjs";
import {
  gitPanel,
  keysPanel,
  reviewPanel,
  STYLE_SECTIONS,
  styleSection,
  NOTES_CHOOSER_VIEWS,
  howAfterWhere,
  notesPanel,
  pickedChoice,
} from "../.tmp-test/panelviews.mjs";
import { face } from "../.tmp-test/git.mjs";
import { setLang, t } from "../.tmp-test/i18n.mjs";
import { NOTE_CHOICES, NOTE_HOW, NOTE_WHERE, choiceAt, whyNot } from "../.tmp-test/notes.mjs";

/** Every node in a built tree, depth first. */
function all(nodes) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  for (const n of nodes) walk(n);
  return out;
}

/** Every string of text in it, which is what a reader sees. */
function words(nodes) {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string") return out.push(n);
    if (!n || typeof n !== "object") return;
    for (const c of n.children ?? []) walk(c);
  };
  for (const n of nodes) walk(n);
  return out;
}

const withClass = (nodes, cls) => all(nodes).filter((n) => (n.className ?? "").split(" ").includes(cls));
const withAttr = (nodes, attr, value) =>
  all(nodes).filter((n) => n[attr] !== undefined && (value === undefined || n[attr] === value));
const buttons = (nodes) => all(nodes).filter((n) => n.tagName === "BUTTON");
const buttonSaying = (nodes, label) =>
  buttons(nodes).find((b) => (b.children ?? []).some((c) => c === label));

/** A recorder in place of the shell. */
function recorder() {
  const done = [];
  return {
    done,
    run: (op, extra) => done.push([op, extra]),
    compare: (c) => done.push(["compare", c.hash]),
    restore: (c) => done.push(["restore", c.hash]),
    revert: (c) => done.push(["revert", c.hash]),
    setScope: (whole) => done.push(["scope", whole]),
  };
}

const READY = { kind: "ready", path: "/seforim/ברכות.ksav" };
const REPO = {
  ok: true,
  git: "2.54",
  root: "/seforim",
  branch: "main",
  upstream: "origin/main",
  ahead: 2,
  behind: 0,
  files: [],
  who: { name: "פלוני", email: "p@x" },
  this: { path: "ברכות.ksav", tracked: true, staged: ".", worktree: ".", kind: "ordinary" },
};

function view(over = {}) {
  const status = over.status === undefined ? REPO : over.status;
  const commits = over.commits ?? [];
  const branches = over.branches ?? [];
  const remotes = over.remotes ?? [];
  return {
    face: face(over.where ?? READY, status, commits, branches, remotes),
    status,
    commits,
    branches,
    remotes,
    said: over.said ?? "",
    busy: over.busy ?? false,
    wholeRepo: over.wholeRepo ?? false,
  };
}

export async function run() {
  const chrome = installChrome();
  setLang("en");
  try {
    // -------------------------------------- the states with nothing behind them

    {
      const built = gitPanel(view({ where: { kind: "no-file" }, status: null }), recorder());
      const why = withClass(built, "git-why");
      check("an unsaved document gets one sentence", why.length, 1);
      check("…named as the state it is", why[0]["data-git"], "unavailable");
      ok("…with words in it", words(built).some((w) => w.length > 30), words(built).join(" | "));
      check("…and no buttons at all", buttons(built).length, 1, "only the panel head's ×");
    }

    {
      const built = gitPanel(view({ status: { ok: true, git: null, root: null } }), recorder());
      check("no git on the machine says so", withClass(built, "git-why")[0]["data-git"], "no-git");
      ok(
        "…and says where to get one",
        words(built).some((w) => w.includes("git-scm.com")),
        words(built).join(" | "),
      );
    }

    {
      // The one unavailable state with an offer attached.
      const act = recorder();
      const built = gitPanel(view({ status: { ok: true, git: "2.54", root: null } }), act);
      check("a folder that is not a repository", withClass(built, "git-why")[0]["data-git"], "no-repo");
      const make = buttonSaying(built, t("git.init"));
      ok("…offers to make one", !!make);
      make.click();
      check("…and pressing it asks for init", act.done, [["init", undefined]]);
    }

    // ------------------------------------------------------ the populated drawer

    {
      const built = gitPanel(view(), recorder());
      const said = words(built).join(" | ");
      ok("the branch is on screen", said.includes("main"), said);
      ok("…and where it stands against the host", said.includes("2 ahead"), said);
      // Every block `face` named is built, and each is addressable by what it
      // is rather than by a localised heading.
      const sections = withAttr(built, "data-git-section").map((n) => n["data-git-section"]);
      check("every block is built", sections, ["changes", "commit", "history", "branches", "remotes"]);
    }

    {
      // The empty states, which is the claim step 9 of the assembled run makes
      // about the four list panels it can reach and cannot make about this one.
      const built = gitPanel(view(), recorder());
      const empties = withAttr(built, "data-empty").map((n) => n["data-empty"]);
      check("each empty block says so", empties, ["git-changes", "git-history", "git-branches", "git-remotes"]);
      for (const node of withAttr(built, "data-empty")) {
        const text = words([node]).join("");
        ok(`${node["data-empty"]} says something`, text.trim().length > 0);
        // `t()` returns the key it was given when the dictionary has no entry,
        // so a missing string puts `git.noCommits` in front of a reader.
        notOk(`…and not its own i18n key`, /^git\.[A-Za-z]+$/.test(text.trim()), text);
      }
    }

    {
      // A file's state is a word, never git's letter.
      const built = gitPanel(
        view({
          status: {
            ...REPO,
            files: [
              { path: "ברכות.ksav", staged: ".", worktree: "M", kind: "ordinary" },
              { path: "חדש.ksav", staged: ".", worktree: "?", kind: "untracked" },
            ],
          },
        }),
        recorder(),
      );
      const states = withClass(built, "git-state").map((n) => words([n]).join(""));
      check("both files are described", states.length, 2);
      check("…in words", states, [t("git.st.modified"), t("git.st.new")]);
      for (const s of states) notOk(`"${s}" is not a git letter`, /^[MADRCU?]$/.test(s));
    }

    // ------------------------------------------------------------ what it asks

    {
      const act = recorder();
      const built = gitPanel(view(), act);
      const message = all(built).find((n) => n.tagName === "INPUT" && n.placeholder === t("git.message"));
      ok("there is a message box", !!message);
      const commit = buttonSaying(built, t("git.commit"));
      // Empty: refused here rather than sent, because git's own refusal for it
      // is a paragraph about editors.
      message.value = "   ";
      commit.click();
      check("an empty message asks for nothing", act.done, []);
      message.value = "פרק ראשון";
      commit.click();
      check("a written one commits it", act.done, [["commit", { message: "פרק ראשון", all: false }]]);
    }

    {
      // The finding this whole extraction exists for, made checkable: the three
      // network buttons address the remote that is *there*, not the string
      // "origin". `git clone --origin upstream` and every fork workflow produce
      // a repository where the other spelling fails with git's own message
      // about a remote that does not exist.
      const act = recorder();
      const built = gitPanel(view({ remotes: [{ name: "upstream", url: "https://x" }] }), act);
      buttonSaying(built, t("git.push")).click();
      check("push goes to the remote that is there", act.done, [
        ["push", { remote: "upstream", branch: "main", set_upstream: false }],
      ]);
    }

    {
      const act = recorder();
      const commits = [
        { hash: "aaaa", short: "aaa", author: "פלוני", email: "p@x", when: 1700000000, refs: "", subject: "פרק ראשון" },
      ];
      const built = gitPanel(view({ commits }), act);
      ok("the commit is listed", words(built).includes("פרק ראשון"));
      buttonSaying(built, t("git.compare")).click();
      buttonSaying(built, t("git.restore")).click();
      buttonSaying(built, t("git.revert")).click();
      check("each of the three does its own thing", act.done, [
        ["compare", "aaaa"],
        ["restore", "aaaa"],
        ["revert", "aaaa"],
      ]);
    }

    {
      // The branch you are standing on offers neither switch nor merge: git
      // refuses both, and a button whose only outcome is git's refusal is a
      // button that lies about being available.
      const built = gitPanel(
        view({
          branches: [
            { name: "main", upstream: "origin/main", current: true, short: "aaa", subject: "x" },
            { name: "hagahos", upstream: null, current: false, short: "bbb", subject: "y" },
          ],
        }),
        recorder(),
      );
      const rows = withClass(built, "git-branch-row");
      check("both branches are listed", rows.length, 2);
      check("the current one offers nothing to do to itself", buttons([rows[0]]).length, 0);
      check("…and the other one offers two", buttons([rows[1]]).length, 2);
    }

    // ------------------------------------------------------------ a stopped merge

    {
      const act = recorder();
      const built = gitPanel(
        view({
          status: {
            ...REPO,
            merging: true,
            files: [{ path: "ברכות.ksav", staged: "U", worktree: "U", kind: "unmerged" }],
          },
        }),
        act,
      );
      const sections = withAttr(built, "data-git-section").map((n) => n["data-git-section"]);
      check("the conflict comes first", sections[0], "conflict");
      const why = withAttr(built, "data-git", "conflicted");
      check("…and says what a conflict is", why.length, 1);
      ok("…in words", words(why).join("").length > 30);
      buttonSaying(built, t("git.takeOurs")).click();
      buttonSaying(built, t("git.abortMerge")).click();
      check("both ways out work", act.done, [
        ["resolve", { side: "ours" }],
        ["merge-abort", undefined],
      ]);
    }

    // -------------------------------------------------------------- while busy

    {
      const built = gitPanel(view({ busy: true }), recorder());
      const enabled = buttons(built).filter((b) => !(b.className ?? "").includes("disabled"));
      // The panel head's × stays: a drawer you cannot leave while a `git push`
      // is in flight is the hydra's bug, and it took a redesign to find.
      check("only the way out stays live while git is running", enabled.length, 1);
    }

    // --------------------------------------------------------- git's own words

    {
      const built = gitPanel(view({ said: "Permission denied (publickey)" }), recorder());
      const box = withAttr(built, "data-git", "said");
      check("what git said is shown", box.length, 1);
      ok(
        "…verbatim, because it is the one string a reader can search for",
        words(box).includes("Permission denied (publickey)"),
        words(box).join(" | "),
      );
    }


    // ------------------------------------------------------------- the review panel

    {
      const marks = [
        { kind: "insert", body: "מילה", from: 10, to: 20, author: "פלוני" },
        { kind: "delete", body: "אחרת", from: 30, to: 40 },
        { kind: "comment", body: "מה הכוונה?", from: 50, to: 60 },
      ];
      const act = [];
      const built = reviewPanel(
        { marks, reading: "final", reviewer: "פלוני" },
        {
          setReading: (v) => act.push(["reading", v]),
          mark: (k) => act.push(["mark", k]),
          comment: () => act.push(["comment"]),
          setReviewer: (n) => act.push(["reviewer", n]),
          goTo: (m) => act.push(["goTo", m.from]),
          decide: (m, d) => act.push(["decide", m.kind, d]),
          decideAll: (d) => act.push(["all", d]),
        },
      );
      const rows = withAttr(built, "data-mark").map((n) => n["data-mark"]);
      check("every mark is a row", rows, ["insert", "delete", "comment"]);

      // A comment is not a change to accept: it is a note *about* the text, so
      // it has one button and it says settle rather than accept.
      const rowOf = (kind) => withAttr(built, "data-mark", kind)[0];
      check("a change offers both answers", buttons([rowOf("insert")]).length, 3, "the row, accept, reject");
      check("a comment offers one", buttons([rowOf("comment")]).length, 2, "the row and resolve");
      ok(
        "…and calls it settling rather than accepting",
        words([rowOf("comment")]).includes(t("resolve")),
        words([rowOf("comment")]).join(" | "),
      );

      // Which reading the document is in is *shown*, not merely offered. A
      // panel with three buttons and no indication of which one you are in is
      // the chipbar's original fault in another surface.
      const active = withAttr(built, "data-reading").filter((n) =>
        (n.className ?? "").includes("active"),
      );
      check("the reading in force is marked", active.map((n) => n["data-reading"]), ["final"]);

      buttonSaying(built, t("acceptAll")).click();
      rowOf("delete").children[1].children[1].click();
      check("both kinds of decision reach the shell", act, [["all", "accept"], ["decide", "delete", "reject"]]);
    }

    {
      const built = reviewPanel({ marks: [], reading: "markup", reviewer: "" }, {
        setReading() {}, mark() {}, comment() {}, setReviewer() {}, goTo() {}, decide() {}, decideAll() {},
      });
      const empty = withAttr(built, "data-empty", "review");
      check("a document with nothing to review says so", empty.length, 1);
      ok("…in words", words(empty).join("").trim().length > 0);
      notOk("…and offers no accept-all over nothing", !!buttonSaying(built, t("acceptAll")));
    }

    // ------------------------------------------------------ the styles sections

    {
      const kinds = STYLE_SECTIONS.map((s) => s.kind);
      check("the eight sections, in order", kinds, [
        "headings", "lists", "tables", "channels", "notes", "bands", "streams", "marks",
      ]);
      // A scope selector is what lets a writer style *this* heading differently
      // from the rest. Every kind that can be scoped has one, and the one that
      // cannot says so by having none: a channel is a document-wide
      // arrangement, so "this one" names nothing.
      const unscoped = STYLE_SECTIONS.filter((s) => !s.scope).map((s) => s.kind);
      check("only channels have no scope selector", unscoped, ["channels"]);
      for (const s of STYLE_SECTIONS) {
        ok(`${s.kind}'s heading is a key`, s.heading.startsWith("style"), s.heading);
        if (s.note) ok(`${s.kind}'s note is a key`, s.note.endsWith("Note"), s.note);
        if (s.scope) {
          check(`${s.kind} names itself both ways`, s.scope.length, 2);
          // "all the headings" and "this heading" must be *different* strings,
          // or the selector offers a reader the same words twice.
          ok(`…and differently`, s.scope[0] !== s.scope[1], s.scope.join(" / "));
          ok(`…in the dictionary`, t(s.scope[0]) !== s.scope[0] && t(s.scope[1]) !== s.scope[1], s.scope.join(" / "));
        }
      }
      const kindSet = new Set(kinds);
      check("no kind appears twice", kinds.length, kindSet.size);
    }

    {
      // The frame each section is built in, so a section is addressable by what
      // it is rather than by a localised heading.
      const built = [styleSection(STYLE_SECTIONS[0], ["SCOPE"], ["ROW"])];
      check("the section is named", withAttr(built, "data-style")[0]["data-style"], "headings");
      const said = words(built);
      check("its heading, then its scope, then its rows", said, [t("styleHeadings"), "SCOPE", "ROW"]);
      const withNote = [styleSection(STYLE_SECTIONS[4], [], [])];
      ok("a section with a note shows it", words(withNote).includes(t("styleNotesNote")));
    }

    // ---------------------------------------------------------------- the keys
    //
    // Sixty-odd rows of key capture used to be built inside the settings drawer,
    // where nothing could reach them. What is asserted here is everything the
    // move was *for*: that the search answers both halves of the question people
    // bring to a key list, that a single action can be unbound without resetting
    // the application, and that a keyboard mode says so once at the top rather
    // than sixty times by implication.

    const ROWS = [
      { id: "palette", name: "Command palette", key: "Mod-k", command: "palette" },
      { id: "gitPanel", name: "Version control", key: "Mod-Alt-v", command: "gitpanel" },
      { id: "foldAll", name: "Fold everything", key: "", command: "foldall" },
      { id: "macro.m1a2b3", name: "בס\"ד at the top", key: "F7", command: "macrom1a2b3" },
    ];

    /** A recorder in place of the shell, for the keys drawer's four callbacks. */
    function keyActs() {
      const done = [];
      return {
        done,
        search: (q) => done.push(["search", q]),
        capture: (id) => done.push(["capture", id]),
        clear: (id) => done.push(["clear", id]),
        reset: () => done.push(["reset"]),
      };
    }

    const keysView = (over = {}) => ({
      rows: over.rows ?? ROWS,
      query: over.query ?? "",
      mode: over.mode ?? null,
    });

    {
      const acts = keyActs();
      const built = keysPanel(keysView(), acts);
      check("every action gets a row", withAttr(built, "data-key-row").length, ROWS.length);
      check(
        "an action with no chord shows an em-dash rather than a blank",
        (withAttr(built, "data-key-for", "foldAll")[0].children ?? [])[0],
        "—",
      );
      check(
        "a bound action shows the chord as a person would read it",
        (withAttr(built, "data-key-for", "palette")[0].children ?? [])[0],
        "Ctrl+K",
      );
      // A macro is an action like any other, and it is named by its own title.
      // A row reading `sc.macro.m1a2b3` is the "shipped unnamed" failure.
      ok("a macro is listed under its own name", words(built).includes('בס"ד at the top'));
      ok("and the count says how many of how many", words(built).includes("4 of 4"));
    }

    // The search, and it has to answer both questions: "what is the key for X"
    // and "what has Ctrl+G". A filter over names alone answers only the first,
    // and the second is the one asked with a finger already on the key.
    {
      const byName = keysPanel(keysView({ query: "version" }), keyActs());
      check("searching the words finds the action", withAttr(byName, "data-key-row").length, 1);
      check(
        "…and it is the right one",
        withAttr(byName, "data-key-row")[0]["data-key-row"],
        "gitPanel",
      );
      const byChord = keysPanel(keysView({ query: "ctrl+alt" }), keyActs());
      check("searching the chord finds it too", withAttr(byChord, "data-key-row").length, 1);
      const anyCase = keysPanel(keysView({ query: "VERSION" }), keyActs());
      check("and the search does not care about case", withAttr(anyCase, "data-key-row").length, 1);
      const none = keysPanel(keysView({ query: "zzzz" }), keyActs());
      check("nothing matching is nothing shown", withAttr(none, "data-key-row").length, 0);
      // In words. A drawer that renders an empty list for a query with no
      // answers reads as a drawer that is broken.
      ok("…and it says so", withAttr(none, "data-empty", "keys").length === 1);
      ok("in a sentence", words(none).includes(t("keysNothing")));
    }

    // Taking a chord off one action. There was no way to do this: capture
    // assigns, and the only removal was the reset that discards every custom
    // chord in the application.
    {
      const acts = keyActs();
      const built = keysPanel(keysView(), acts);
      check(
        "only the bound actions offer a way to unbind",
        withAttr(built, "data-key-clear").length,
        3,
      );
      withAttr(built, "data-key-clear", "palette")[0].click();
      check("and pressing it names the action", acts.done, [["clear", "palette"]]);
    }

    {
      const acts = keyActs();
      const built = keysPanel(keysView(), acts);
      withAttr(built, "data-key-for", "gitPanel")[0].click();
      check("pressing a chord asks for a new one", acts.done, [["capture", "gitPanel"]]);
      buttonSaying(built, t("resetShortcuts")).click();
      check("and reset asks for all of them", acts.done[1], ["reset"]);
    }

    // A mode has the whole keyboard. Said once, at the top, and every row shows
    // what to type instead — because a screen of chords that now do something
    // else is worse than an empty column: a reader cannot tell.
    {
      const acts = keyActs();
      const built = keysPanel(
        keysView({ mode: { kind: "emacs" } }),
        acts,
      );
      ok("the drawer says a mode has the keyboard", words(built).includes(t("keysTakenEmacs")));
      check(
        "a row shows what to type instead of a chord that is not live",
        (withAttr(built, "data-key-for", "palette")[0].children ?? [])[0],
        "M-x palette",
      );
      check("the chord buttons are refused", withAttr(built, "data-key-for", "palette")[0].disabled, "true");
      withAttr(built, "data-key-for", "palette")[0].click();
      check("…and pressing one asks for nothing", acts.done, []);
      // Unbinding is withdrawn too: taking a chord off while a mode holds the
      // keyboard is a control whose effect nobody can see until the mode is off.
      check("nor is there anything to unbind", withAttr(built, "data-key-clear").length, 0);
      const vim = keysPanel(keysView({ mode: { kind: "vim" } }), keyActs());
      check(
        "vim says it with vim's colon",
        (withAttr(vim, "data-key-for", "palette")[0].children ?? [])[0],
        ":palette",
      );
    }

    // ------------------------------------------------------------ in Hebrew too

    {
      setLang("he");
      const keys = keysPanel(keysView(), keyActs());
      const inHebrew = words(keys).join(" ");
      ok("the keys drawer speaks Hebrew", /[֐-׿]/.test(inHebrew), inHebrew.slice(0, 80));
      notOk("…and prints no i18n keys", /\bkeys[A-Z][a-zA-Z]*\b/.test(inHebrew), inHebrew);
      const built = gitPanel(view(), recorder());
      const said = words(built).join(" ");
      ok("the drawer speaks Hebrew", /[֐-׿]/.test(said), said.slice(0, 80));
      notOk("…and prints no i18n keys", /\bgit\.[a-zA-Z]+\b/.test(said), said);
      setLang("en");
    }

    notesChooser();
  } finally {
    chrome.restore();
  }
}

// ---------------------------------------------------------------- notes chooser
//
// The panel opened onto somewhere past fifty controls: two quick buttons, a
// body-placement block, a thirty-cell grid, and every one of the fourteen
// arrangements as a full card with a page sketch, a description, a caveat and up
// to three buttons — all of it about a decision the person opening the panel has
// usually already made. None of it was built by any test, in either language,
// which is the same hole `panelviews.ts` was created for and the reason a
// rewrite of it could not have been checked before it shipped.
//
// What is held here is not the layout but the *questioning*: that the ordinary
// view asks one question at a time, that the second question offers exactly the
// arrangements that can print where the first one landed and refuses the rest
// **in words**, that all three views reach the same fourteen arrangements, and
// that nothing writes into the document until both questions are answered.

function notesRecorder() {
  const done = [];
  return {
    done,
    setView: (v) => done.push(["view", v]),
    pickWhere: (w) => done.push(["where", w]),
    pickHow: (h) => done.push(["how", h]),
    use: (c, layer) => done.push(["use", c.id, layer]),
    setDefer: (on) => done.push(["defer", on]),
    deferAll: () => done.push(["deferAll"]),
    inlineAll: () => done.push(["inlineAll"]),
    sortDeferred: () => done.push(["sortDeferred"]),
    preview: (host, c) => done.push(["preview", c.id]),
  };
}

const notesView = (over = {}) => ({
  view: over.view ?? "guided",
  where: over.where ?? null,
  how: over.how ?? null,
  defer: over.defer ?? false,
});

/** The `data-` values of the nodes carrying an attribute, in document order. */
const marked = (nodes, attr) =>
  all(nodes)
    .filter((n) => n[attr] !== undefined)
    .map((n) => n[attr]);

/**
 * Is this the class, rather than a class with these letters in it?
 *
 * `className.includes("on")` is true of `nq-option` and of `defer-option`, which
 * is how the first draft of the check below reported five pre-answered buttons
 * on a panel where nothing was answered at all.
 */
const isOn = (n) => (n?.className ?? "").split(" ").includes("on");

function notesChooser() {
  setLang("en");

  // ------------------------------------------------- one question at a time

  {
    const built = notesPanel(notesView(), notesRecorder());
    check("the first question offers every place a note can print", marked(built, "data-where"), [
      ...NOTE_WHERE,
    ]);
    check(
      "…and none of them is pre-answered",
      all(built).filter((n) => n["data-where"] && isOn(n)).length,
      0,
    );
    // The second question exists as a question before it can be answered. A
    // heading with nothing under it reads as a panel that failed to draw.
    check("the second question is asked but waiting", marked(built, "data-nq"), [
      "views",
      "where",
      "wait",
      "unpicked",
    ]);
    ok("…and says what it is waiting for", words(built).includes(t("notesQ2Wait")));
    // The sentence under an unanswered second question names the gesture that
    // is on screen. "Pick a cell in the table" is true of the grid and sends a
    // reader of the guided view looking for a table that is not there.
    ok(
      "the line where the arrangement will go names a control this view has",
      words(built).includes(t("notesPickHow")),
      words(built).join(" | ").slice(-160),
    );
    ok(
      "…and the grid names its own",
      words(notesPanel(notesView({ view: "matrix" }), notesRecorder())).includes(t("notesPickCell")),
    );
    check("no arrangement is offered for use yet", marked(built, "data-note-use").length, 0);
    check("and nothing was asked of the document", notesRecorder().done, []);
  }

  // ------------------------------------------------- the second question narrows

  for (const where of NOTE_WHERE) {
    const built = notesPanel(notesView({ where }), notesRecorder());
    const offered = marked(built, "data-how");
    const refused = marked(built, "data-how-off");
    check(
      `${where}: the arrangements offered are the ones that can print there`,
      offered,
      NOTE_HOW.filter((how) => choiceAt(where, how)),
    );
    check(
      `${where}: and every other one is refused rather than missing`,
      [...offered, ...refused].sort(),
      [...NOTE_HOW].sort(),
    );
    // The reason, in words. The grid puts it in a `title`, which is a tooltip:
    // absent on a touch screen, absent to anyone not hovering, and absent to a
    // reader that is reading the button's text.
    const said = words(built);
    for (const how of refused) {
      ok(`${where} x ${how}: the refusal says why, in the panel`, said.includes(t(whyNot(where, how))), how);
    }
    ok(`${where}: at least one arrangement can print there`, offered.length > 0);
  }

  // ------------------------------------------------- the card, once both are in

  {
    const acts = notesRecorder();
    const built = notesPanel(notesView({ where: "page", how: "one" }), acts);
    const cards = marked(built, "data-note-card");
    check("one arrangement is shown, not fourteen", cards, ["footnote"]);
    check("…set from the writer's own document", acts.done, [["preview", "footnote"]]);
    check("…and it is the one the two answers name", pickedChoice(notesView({ where: "page", how: "one" })).id, "footnote");
    const use = buttons(built).find((b) => b["data-note-use"] === "footnote");
    ok("its use button is there", !!use);
    use.click();
    check("pressing it writes that arrangement's first layer", acts.done.at(-1), ["use", "footnote", 0]);
  }

  // A `how` that has no arrangement under this `where` names nothing, rather
  // than falling back to some other card.
  check("an impossible pair names no arrangement", pickedChoice(notesView({ where: "document", how: "fixed" })), null);

  // ------------------------------------------------- changing the first answer

  check("a second answer that survives the change is kept", howAfterWhere("document", "one"), "one");
  // `page` x `fixed` is an arrangement and `document` x `fixed` is a stated
  // refusal. Carried across unexamined, the panel would show a card for a cell
  // that the question above it has just greyed out.
  check("one that does not is dropped", howAfterWhere("document", "fixed"), null);
  check("and nothing is invented when there was no second answer", howAfterWhere("page", null), null);

  // ------------------------------------------------- all three views, one set

  {
    const reachable = new Set();
    for (const where of NOTE_WHERE) {
      for (const how of NOTE_HOW) {
        const built = notesPanel(notesView({ where, how }), notesRecorder());
        for (const id of marked(built, "data-note-card")) reachable.add(id);
      }
    }
    check(
      "every arrangement is reachable by asking the two questions",
      reachable.size,
      NOTE_CHOICES.length,
    );

    const cards = notesPanel(notesView({ view: "cards" }), notesRecorder());
    check(
      "…and every one of them is a card in the card view",
      marked(cards, "data-note-card").sort(),
      NOTE_CHOICES.map((c) => c.id).sort(),
    );

    const matrix = notesPanel(notesView({ view: "matrix" }), notesRecorder());
    const cells = [...marked(matrix, "data-cell"), ...marked(matrix, "data-cell-off")];
    check("the matrix has a cell for every pair", cells.length, NOTE_WHERE.length * NOTE_HOW.length);
    // The grid's width is a fact about `NOTE_HOW`, and the stylesheet is told it
    // rather than carrying its own count — which is what went stale when
    // `parallel-fixed` became a sixth column and the CSS still said five.
    const grid = withClass(matrix, "notes-matrix")[0];
    check("…and it tells the stylesheet how many columns that is", grid.style, `--nm-cols:${NOTE_HOW.length}`);

    check("every view is offered as a way of choosing", marked(matrix, "data-note-view"), [
      ...NOTES_CHOOSER_VIEWS,
    ]);
  }

  // ------------------------------------------------- the wall it replaced

  {
    const guided = notesPanel(notesView(), notesRecorder());
    const cards = notesPanel(notesView({ view: "cards" }), notesRecorder());
    ok(
      "opening the panel presses fewer buttons on a person than the card wall did",
      buttons(guided).length * 2 < buttons(cards).length,
      `${buttons(guided).length} against ${buttons(cards).length}`,
    );
    // The two everyday kinds keep their one click in every view: the complaint
    // this panel exists for is that somebody wanting a footnote was made to
    // choose a note system, and that is true of the questions too.
    for (const v of NOTES_CHOOSER_VIEWS) {
      const built = notesPanel(notesView({ view: v }), notesRecorder());
      check(`${v}: the everyday two are still one press`, marked(built, "data-note-quick"), [
        "footnote",
        "endnote",
      ]);
    }
  }

  // ------------------------------------------------- where the prose is written

  {
    const acts = notesRecorder();
    const built = notesPanel(notesView({ defer: true }), acts);
    const end = all(built).find((n) => n["data-defer"] === "end");
    ok("the org-mode arrangement is shown as the one in force", isOn(end));
    const inline = all(built).find((n) => n["data-defer"] === "inline");
    notOk("…and the other one is not", isOn(inline));
    inline.click();
    check("pressing it asks for inline bodies", acts.done.at(-1), ["defer", false]);
  }

  // ------------------------------------------------- in Hebrew too

  {
    setLang("he");
    for (const v of NOTES_CHOOSER_VIEWS) {
      const built = notesPanel(notesView({ view: v, where: "page", how: "one" }), notesRecorder());
      const said = words(built).join(" ");
      ok(`${v}: the chooser speaks Hebrew`, /[֐-׿]/.test(said), said.slice(0, 60));
      notOk(
        `${v}: …and prints no i18n keys`,
        /\b(notes[A-Z][a-zA-Z]*|where\.[a-z]+|how\.[a-z-]+|why[A-Z][a-zA-Z]*)\b/.test(said),
        said,
      );
    }
    setLang("en");
  }
}
