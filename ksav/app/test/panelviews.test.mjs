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
  notesPanel,
  pickAfterDestination,
  pickedDestination,
  regionPanel,
} from "../.tmp-test/panelviews.mjs";
import { face } from "../.tmp-test/git.mjs";
import { setLang, t } from "../.tmp-test/i18n.mjs";
import {
  DESTINATIONS,
  DESTINATION_IDS,
  PRESETS,
  REGION_KNOBS,
  regionSettingsOf,
  writeRegion,
} from "../.tmp-test/channels.mjs";

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
      check("the sections, in order", kinds, [
        // The writer's own styles first: each one edited from beside its own
        // name, with a chord of its own. There was no such list anywhere, which
        // is why "edit styles" could only ever mean *all of them at once*.
        "mine",
        "headings", "lists", "tables", "destinations",
        // The look every note apparatus falls back to, above the six that fall
        // back to it — a writer setting "the notes" should meet the control
        // that means all of them before the six that mean one each.
        "noteText",
        "notes", "bands", "streams",
        // The back matter, which had no section at all and, until it had one,
        // no ink knobs in the engine either.
        "endnotes",
        "tiers", "sidenotes", "marks",
      ]);
      // A scope selector is what lets a writer style *this* heading differently
      // from the rest. Every kind that can be scoped has one, and the one that
      // cannot says so by having none: a destination is a document-wide stream,
      // so "this one" names nothing.
      const unscoped = STYLE_SECTIONS.filter((s) => !s.scope).map((s) => s.kind);
      // Four, and each for the same reason: there is no single element for
      // "this one" to name. A destination is a document-wide stream, a custom
      // style is a `#let` at the top of the file, the shared note style is what
      // six apparatuses fall back to, and the endnote section is a section.
      check("the four kinds with no this-one have no scope selector", unscoped, [
        "mine", "destinations", "noteText", "endnotes",
      ]);
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
      // By name and not by index: the first draft indexed into the table, and
      // the two sections added for the style-editing rebuild moved every index
      // in this block by one. A fence that has to be renumbered when the thing
      // it guards grows is a fence that gets renumbered wrongly.
      const byKind = (k) => STYLE_SECTIONS.find((s) => s.kind === k);
      const built = [styleSection(byKind("headings"), ["SCOPE"], ["ROW"])];
      check("the section is named", withAttr(built, "data-style")[0]["data-style"], "headings");
      const said = words(built);
      check("its heading, then its scope, then its rows", said, [t("styleHeadings"), "SCOPE", "ROW"]);
      const withNote = [styleSection(byKind("notes"), [], [])];
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
// usually already made.
//
// It asks one question now, because there is one: **where should this note
// print?** What is held here is not the layout but the questioning — that the
// six destinations are all offered, that a caveat appears *in words* under the
// pick it is about, that "a region" expands to "which region" off the document's
// own list, that a preset is a pick and shows as one, and that nothing is
// written until the writer presses the button.

function notesRecorder() {
  const done = [];
  return {
    done,
    pick: (p) => done.push(["pick", p.dest, p.region]),
    usePreset: (id) => done.push(["preset", id]),
    use: () => done.push(["use"]),
    preview: (host, p) => done.push(["preview", p.dest]),
  };
}

const notesView = (over = {}) => ({
  pick: over.pick ?? { dest: "foot", region: null },
  regions: over.regions ?? [],
  caveats: over.caveats ?? [],
  preset: over.preset ?? null,
});

/** The `data-` values of the nodes carrying an attribute, in document order. */
const marked = (nodes, attr) =>
  all(nodes)
    .filter((n) => n[attr] !== undefined)
    .map((n) => n[attr]);

/**
 * Is this the class, rather than a class with these letters in it?
 *
 * `className.includes("on")` is true of `nq-option` and of `note-quick`, which is
 * how the first draft of the check below reported five pre-answered buttons on a
 * panel where nothing was answered at all.
 */
const isOn = (n) => (n?.className ?? "").split(" ").includes("on");

function notesChooser() {
  setLang("en");

  // ------------------------------------------------- one question, six answers

  {
    const acts = notesRecorder();
    const built = notesPanel(notesView(), acts);
    check("every destination is offered", marked(built, "data-dest"), [...DESTINATION_IDS]);
    // Exactly one is answered, and it is the everyday one. There is no
    // "unanswered" state any more — a note always has a destination, and opening
    // this panel to write an ordinary footnote should find the question already
    // answered the way it usually is.
    check(
      "exactly one is in force",
      all(built).filter((n) => n["data-dest"] && isOn(n)).map((n) => n["data-dest"]),
      ["foot"],
    );
    check("…and it is the one the shell says", pickedDestination(notesView()), "foot");
    // Only the pick is previewed. Six compiles to open a modal is not a preview,
    // it is a stall.
    check("only the pick is set from the writer's own document", acts.done, [["preview", "foot"]]);
    check("one card is shown, not fourteen", marked(built, "data-note-card"), ["foot"]);
    // And nothing has gone into the document: the button is a button.
    const use = buttons(built).find((b) => b["data-note-use"] !== undefined);
    ok("there is a button that writes it", !!use);
    use.click();
    check("pressing it writes the pick", acts.done.at(-1), ["use"]);
  }

  // Pressing a destination answers the question and nothing else.
  {
    const acts = notesRecorder();
    const built = notesPanel(notesView(), acts);
    buttons(built).find((b) => b["data-dest"] === "end").click();
    check("pressing a destination picks it", acts.done.at(-1), ["pick", "end", null]);
  }

  // ------------------------------------------------- "a region" is "which region"

  {
    // A document with no regions says so, and says where they are made. A panel
    // that offers an empty list is a panel that looks broken.
    const built = notesPanel(notesView({ pick: { dest: "region", region: null } }), notesRecorder());
    check("with no regions, the list is a sentence", marked(built, "data-nq"), [
      "presets",
      "destinations",
      "no-regions",
    ]);
    ok("…which says where regions come from", words(built).includes(t("notesNoRegions")));
    check("no region is offered", marked(built, "data-region"), []);
  }
  {
    const acts = notesRecorder();
    const view = notesView({
      pick: { dest: "region", region: "shaar" },
      regions: ["shaar", "mekoros"],
    });
    const built = notesPanel(view, acts);
    check("the regions offered are the document's own", marked(built, "data-region"), [
      "shaar",
      "mekoros",
    ]);
    check(
      "…and the one in force is marked",
      all(built).filter((n) => n["data-region"] && isOn(n)).map((n) => n["data-region"]),
      ["shaar"],
    );
    buttons(built).find((b) => b["data-region"] === "mekoros").click();
    check("pressing one picks it", acts.done.at(-1), ["pick", "region", "mekoros"]);
    ok("the card names the region, not just the destination", words(built).includes("shaar"));
  }

  // A change of destination drops a region name rather than carrying it across
  // unexamined, and a change *to* a region takes the first one the document has.
  check("a region name is meaningless elsewhere", pickAfterDestination("end", ["a"], "a"), {
    dest: "end",
    region: null,
  });
  check("moving to a region takes one the document has", pickAfterDestination("region", ["a", "b"], null), {
    dest: "region",
    region: "a",
  });
  check("…keeping the held one when it still exists", pickAfterDestination("region", ["a", "b"], "b"), {
    dest: "region",
    region: "b",
  });
  check("…and inventing nothing when there are none", pickAfterDestination("region", [], "b"), {
    dest: "region",
    region: null,
  });

  // ------------------------------------------------- a refusal says why, in words

  {
    // The grid put its reasons in a `title` attribute, which is a tooltip:
    // absent on a touch screen, absent to anyone not hovering, absent to a
    // screen reader reading the button's text. Here there is room for the
    // sentence itself.
    const built = notesPanel(
      notesView({ caveats: [{ why: "whySecondFootIsABox", blocks: false }] }),
      notesRecorder(),
    );
    check("the reason is on the panel", marked(built, "data-caveat"), ["whySecondFootIsABox"]);
    ok("…as a sentence", words(built).includes(t("whySecondFootIsABox")));
    const use = buttons(built).find((b) => b["data-note-use"] !== undefined);
    ok("…and the note can still be written", !use.disabled);
  }
  {
    // A blocking caveat is different from a costly one, and the button has to
    // say which. Writing `#הערה(אזור: "")` would name a region that cannot exist.
    const acts = notesRecorder();
    const built = notesPanel(
      notesView({
        pick: { dest: "region", region: null },
        caveats: [{ why: "whyRegionNeedsAName", blocks: true }],
      }),
      acts,
    );
    ok("a blocking reason is said too", words(built).includes(t("whyRegionNeedsAName")));
    const use = buttons(built).find((b) => b["data-note-use"] !== undefined);
    check("…and the button refuses", use.disabled, "disabled");
    // …and the preview is not run either: there is nothing to compile.
    check("nothing was asked of the document", acts.done, []);
  }

  // ------------------------------------------------- presets are picks

  {
    const acts = notesRecorder();
    const built = notesPanel(notesView(), acts);
    check("every preset is offered", marked(built, "data-note-preset"), PRESETS.map((p) => p.id));
    buttons(built).find((b) => b["data-note-preset"] === "shaarhatziyun").click();
    check("pressing one sets its pick", acts.done.at(-1), ["preset", "shaarhatziyun"]);
    // A preset in force is shown as in force, and the destination row shows what
    // it set — which is what makes taking it apart an obvious thing to do rather
    // than a thing a writer has to guess is possible.
    const held = notesPanel(
      notesView({
        preset: "shaarhatziyun",
        pick: { dest: "region", region: "shaar" },
        regions: ["shaar"],
      }),
      notesRecorder(),
    );
    check(
      "the preset in force is marked",
      all(held).filter((n) => n["data-note-preset"] && isOn(n)).map((n) => n["data-note-preset"]),
      ["shaarhatziyun"],
    );
    check(
      "…and the destination it set is marked with it",
      all(held).filter((n) => n["data-dest"] && isOn(n)).map((n) => n["data-dest"]),
      ["region"],
    );
    ok("…and the panel says it can be taken apart", words(held).includes(t("notesTakeApart")));
  }

  // ------------------------------------------------- the sketches survived

  {
    // The small page diagrams are the one thing the eleven cards got right, and
    // the new screen needs them more, not less: a pick has to show what it
    // builds.
    //
    // Asked of **the button itself**, not of the panel. Written the loose way it
    // was an `ONLY_AT_TOP`: four of the six sketches are also drawn by a preset
    // or by the picked card, so deleting the destination row's diagram outright
    // failed for `section` and `file` and passed for the other four. A fence
    // four of six instances can hide behind is a fence for two instances.
    const built = notesPanel(notesView(), notesRecorder());
    for (const d of DESTINATIONS) {
      const button = all(built).find((n) => n["data-dest"] === d.id);
      ok(`${d.id}: it has a button`, !!button, d.id);
      ok(
        `${d.id}: whose page sketch is on it`,
        words([button]).join("\n").includes(d.sketch.join("\n")),
        d.id,
      );
    }
    // And every preset shows the page its pick builds, for the same reason.
    for (const p of PRESETS) {
      const button = all(built).find((n) => n["data-note-preset"] === p.id);
      const sketch = DESTINATIONS.find((d) => d.id === p.pick.dest).sketch;
      ok(
        `preset ${p.id}: shows what it builds`,
        words([button]).join("\n").includes(sketch.join("\n")),
        p.id,
      );
    }
  }

  // ------------------------------------------------- the wall it replaced

  {
    const built = notesPanel(notesView(), notesRecorder());
    // Six destinations, five presets and one button that writes it. The count is
    // asserted loosely and deliberately — what matters is the order of magnitude
    // against the fifty-odd controls this replaced, not an exact number that
    // goes stale the first time a preset is added.
    ok(
      "opening the panel presses far fewer buttons on a person than the card wall did",
      buttons(built).length < 20,
      String(buttons(built).length),
    );
  }

  // ------------------------------------------------- in Hebrew too

  {
    setLang("he");
    const built = notesPanel(notesView({ caveats: [{ why: "whySecondFootIsABox", blocks: false }] }), notesRecorder());
    const said = words(built).join(" ");
    ok("the chooser speaks Hebrew", /[֐-׿]/.test(said), said.slice(0, 60));
    notOk(
      "…and prints no i18n keys",
      /\b(notes[A-Z][a-zA-Z]*|dest\.[a-z]+|destDesc\.[a-z]+|preset\.[a-z]+|presetDesc\.[a-z]+|why[A-Z][a-zA-Z]*)\b/.test(
        said,
      ),
      said,
    );
    setLang("en");
  }
  // ------------------------------------------------- the region's own controls
  //
  // **Pressed, and the Typst they write read back.** The knob table and the
  // writer were already tested; what was not is the thing between them, and it
  // is the half that can be wrong in a way nobody sees — a box wired to the
  // neighbouring knob, a `<select>` whose options are labels where the engine
  // wants words, a tuple built in the order the boxes were ticked rather than
  // the order the engine tries them.
  //
  // So each of these builds the panel, presses one control the way a writer
  // does, hands what the shell was asked for to `writeRegion`, and reads the
  // line that lands in the document. Nothing is asserted about the callback in
  // isolation: the claim is *press this and the sefer says that*.
  {
    const chrome = installChrome();

    /** The panel, plus the last edit it asked for. */
    const panel = (doc, name = "צר") => {
      const asked = [];
      const built = regionPanel(
        { name, held: regionSettingsOf(doc, name) },
        { set: (fields) => asked.push(fields) },
      );
      return { built, asked, doc, name };
    };
    /** What the document says after the panel's last request. */
    const written = (p) => writeRegion(p.doc, p.name, p.asked.at(-1) ?? {}).text.split("\n")[0];
    /** The control in one knob's row. */
    const rowFor = (built, key) => all(built).find((n) => n["data-knob"] === key);
    /** Fire a `<select>` the way a browser does. */
    const choose = (node, value) => {
      const box = all([node]).find((n) => n.tagName === "SELECT");
      box.value = value;
      for (const fn of box.listeners?.change ?? []) fn({ target: box });
    };
    /** Type into a field and leave it. */
    const type = (node, value) => {
      const box = all([node]).find((n) => n.tagName === "INPUT" && n.type === "text");
      box.value = value;
      for (const fn of box.listeners?.change ?? []) fn({ target: box });
    };
    /** Tick or untick one member of a set. */
    const tick = (node, member, on) => {
      const label = all([node]).find((n) => n["data-member"] === member);
      const box = (label.children ?? []).find((c) => c && c.tagName === "INPUT");
      box.checked = on;
      for (const fn of box.listeners?.change ?? []) fn({ target: box });
    };

    {
      // Every key has a row, and every row is labelled in words.
      const p = panel("");
      const missing = REGION_KNOBS.filter((k) => !rowFor(p.built, k.key));
      check("regions: every knob is drawn", missing.map((k) => k.key), []);
      const said = words(p.built).join(" ");
      notOk(
        "regions: …and the panel prints no i18n keys",
        /\b(region[A-Z][a-zA-Z]*|regionValue\.[a-z_]+|flag[A-Z][a-zA-Z]*)\b/.test(said),
        said.slice(0, 120),
      );
    }
    {
      // A text field. The height goes in bare, because a length is not a string.
      const p = panel('#אזור("צר", מיקום: "רגל")\nגוף');
      type(rowFor(p.built, "height"), "2cm");
      check(
        "regions: typing a height writes it bare",
        written(p),
        '#אזור("צר", מיקום: "רגל", גובה: 2cm)',
      );
    }
    {
      // A choice. The eighteenth key, and the one a writer could not reach at
      // all: a region's placement was written once by the preset that made it
      // and was changeable nowhere.
      const p = panel('#אזור("צר", מיקום: "רגל", גובה: 1.2cm)\nגוף');
      choose(rowFor(p.built, "placement"), "סוף");
      check(
        "regions: moving a region to the back of the sefer writes it",
        written(p),
        '#אזור("צר", מיקום: "סוף", גובה: 1.2cm)',
      );
    }
    {
      // …and back to the default, which is a different edit from any value.
      const p = panel('#אזור("צר", מיקום: "רגל", חריגה: "סירוב")\nגוף');
      choose(rowFor(p.built, "overflow"), "");
      check(
        "regions: choosing the default clears the key",
        written(p),
        '#אזור("צר", מיקום: "רגל")',
      );
    }
    {
      // A switch, and three states rather than two: a key the document has not
      // mentioned takes the prelude's default, which for this one is `true`.
      const p = panel('#אזור("צר", מיקום: "רגל")\nגוף');
      choose(rowFor(p.built, "keepsPlace"), "false");
      check(
        "regions: a switch goes in bare, not quoted",
        written(p),
        '#אזור("צר", מיקום: "רגל", שומר_מקום: false)',
      );
    }
    {
      // A set, ticked in the wrong order on purpose. For `גלישה` the order **is**
      // the policy — the moves are tried in the order they are listed — so a box
      // ticked last must not become the move tried last.
      const p = panel('#אזור("צר", מיקום: "רגל", גלישה: ("עמוד_הבא",))\nגוף');
      tick(rowFor(p.built, "spill"), "הקטנה", true);
      check(
        "regions: ticking a move writes the tuple in the engine's order",
        written(p),
        '#אזור("צר", מיקום: "רגל", גלישה: ("הקטנה", "עמוד_הבא"))',
      );
      check(
        "regions: …and the box that was already ticked is still ticked",
        regionSettingsOf(writeRegion(p.doc, p.name, p.asked.at(-1)).text, "צר").spill,
        "הקטנה,עמוד_הבא",
      );
    }
    {
      // Down to one, where the comma is the whole difference between a tuple and
      // a parenthesised string — a region that shrinks and one that does nothing
      // and says nothing about it.
      const p = panel('#אזור("צר", מיקום: "רגל", גלישה: ("הקטנה", "עמוד_הבא"))\nגוף');
      tick(rowFor(p.built, "spill"), "עמוד_הבא", false);
      check(
        "regions: unticking down to one keeps the comma",
        written(p),
        '#אזור("צר", מיקום: "רגל", גלישה: ("הקטנה",))',
      );
    }
    {
      // And down to none, which is a fixed box that stays fixed — a real thing
      // to want, and the only behaviour there was before the moves existed.
      const p = panel('#אזור("צר", מיקום: "רגל", גלישה: ("הקטנה",))\nגוף');
      tick(rowFor(p.built, "spill"), "הקטנה", false);
      check(
        "regions: unticking the last one is a box that stays fixed",
        written(p),
        '#אזור("צר", מיקום: "רגל", גלישה: ())',
      );
    }
    {
      // One knob at a time. A panel that writes one control and wipes the
      // seventeen beside it is the failure `writeRegion` states its rule against,
      // and the rule is only worth anything if the panel goes through it.
      const doc =
        '#אזור("צר", מיקום: "רגל", גובה: 1.2cm, גלישה: ("הקטנה",), חריגה: "צמצום", שומר_מקום: false)\nגוף';
      const p = panel(doc);
      type(rowFor(p.built, "seam"), "20");
      check(
        "regions: writing one knob leaves the rest where they were",
        written(p),
        '#אזור("צר", מיקום: "רגל", גובה: 1.2cm, גלישה: ("הקטנה",), ' +
          'חריגה: "צמצום", שומר_מקום: false, תפר: 20)',
      );
    }
    {
      // In Hebrew, and the words are words.
      setLang("he");
      const built = regionPanel({ name: "צר", held: {} }, { set: () => {} });
      const said = words(built).join(" ");
      ok("regions: the panel speaks Hebrew", /[֐-׿]/.test(said), said.slice(0, 60));
      notOk(
        "regions: …and prints no i18n keys in Hebrew either",
        /\b(region[A-Z][a-zA-Z]*|regionValue\.[a-z_]+|flag[A-Z][a-zA-Z]*)\b/.test(said),
        said.slice(0, 120),
      );
      setLang("en");
    }

    chrome.restore();
  }

}
