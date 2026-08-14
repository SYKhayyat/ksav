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
import { gitPanel, keysPanel, reviewPanel, STYLE_SECTIONS, styleSection } from "../.tmp-test/panelviews.mjs";
import { face } from "../.tmp-test/git.mjs";
import { setLang, t } from "../.tmp-test/i18n.mjs";

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
  } finally {
    chrome.restore();
  }
}
