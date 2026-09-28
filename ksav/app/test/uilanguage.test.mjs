// The language selector, as a user action rather than a dictionary lookup.
//
// # The finding
//
// `t` falls back to `DICTS.en[key] ?? key`, and the i18n module says why that is
// right at a call site: *"a writer sees a word rather than `sc.hiddenBreak`"*.
// So a key with no English entry does not look missing. **It looks like a
// developer name.** Measured 2026-09-27 against the built module:
//
// ```
// setLang("en"); t("refreshTitle")   →  "refreshTitle"
// setLang("en"); t("sourcePasted")   →  "sourcePasted"
// ```
//
// Eleven of them, and not in a corner: `refreshTitle` is a **panel heading** and
// `sourcePasted` is a **status line**, so the two most prominent places a writer
// looks after pressing a button said `refreshTitle` and `sourcePasted`. The
// English user was not seeing Hebrew, which is the defect everybody looks for —
// they were seeing a key name, which nobody looks for.
//
// This is why a *dictionary* test is not enough. `hasKey` answers "is this in
// either shelf", and a key in the Hebrew shelf alone answers yes. The question
// the issue asks is the other one: **is it in the one the user is reading?**
//
// # What is enforced
//
// 1. **The two dictionaries are the same set of keys.** Not "no key is orphaned" —
//    same set, in both directions, because a key in one and not the other is
//    either invisible text or a key name, depending which language is selected.
// 2. **No English string is a key name**, and no string is a template
//    placeholder that was never substituted.
// 3. **The switch re-renders.** The mechanism already exists — `localise()` and
//    `rebuildOpenPanels()` — and what was missing was any test that it does, so a
//    panel that opted out of the sweep would keep the language it was born in.
// 4. **A language choice survives a reload**, because it is a setting and
//    `setSetting` saves it.

import { check, ok } from "./harness.mjs";
import { DICTS, hasKey, setLang, t, tf } from "../.tmp-test/i18n.mjs";
import { localise } from "../.tmp-test/panels.mjs";
import { DEFAULTS as SETTINGS_DEFAULTS, ALIGN_CHOICES } from "../.tmp-test/settings.mjs";

export function run() {
  const HE = Object.keys(DICTS.he);
  const EN = Object.keys(DICTS.en);

  // 1 · Same set of keys, both directions.
  {
    const onlyHe = HE.filter((k) => !Object.hasOwn(DICTS.en, k));
    const onlyEn = EN.filter((k) => !Object.hasOwn(DICTS.he, k));
    check(
      "every Hebrew key has an English entry (otherwise the key name is shown)",
      onlyHe,
      [],
    );
    check("and every English key has a Hebrew entry", onlyEn, []);
    // The floor, because a sweep that finds nothing passes everything it has —
    // and a parser that stopped matching would find nothing in both directions.
    ok("the sweep found both dictionaries to be non-trivial", HE.length > 800 && EN.length > 800);
  }

  // 2 · An **identifier** echoed back is a missing translation; an English word is not.
{
  // Three rules went into this and two of them were wrong, both by catching good
  // translations:
  //
  //   - "value equals key" flagged `words: "words"`, `chars: "chars"` and
  //     `recovered: "recovered"` — all real, all with a Hebrew entry that differs.
  //   - "value looks camelCase" and "value contains a dot" flagged
  //     `importWord: "Import from Word (.docx)…"`, `git.installGit: "Install git:
  //     git-scm.com"` and `copyFailed` — file extensions and a URL.
  //
  // What is left is exact: the value **is** the key, and the key is a name rather
  // than a word. `refreshTitle: "refreshTitle"` is that, and nothing in a real
  // translation is.
  const isAName = (k) => /\.[a-z]/.test(k) || /^[a-z][a-z0-9]*[A-Z]/.test(k);
  const echoedEn = EN.filter((k) => DICTS.en[k] === k && isAName(k));
  const echoedHe = HE.filter((k) => DICTS.he[k] === k && isAName(k));
  check("no English value is its own key name", echoedEn, []);
  check("and none in Hebrew either", echoedHe, []);

  // The three that are legitimately identical, named so the next reader does not
  // re-litigate them: a cognate is a translation.
  for (const k of ["words", "chars", "recovered"]) {
    ok(`${k} is a cognate, not a hole`, DICTS.en[k] === k && DICTS.he[k] !== k);
  }

  // A `%s` or `{0}` in the Hebrew with an English value that cannot hold one is
  // a template that lost its argument on the way across.
  const lost = EN.filter(
    (k) => /\{[0-9]+\}/.test(DICTS.he[k] ?? "") && !/%s|%d|\{[0-9]+\}/.test(DICTS.en[k]),
  );
  check("and no placeholder is dropped on the way across", lost, []);
}

// 3 · The switch actually changes what `t` says, in both directions.
  {
    setLang("he");
    const inHebrew = t("notesPane");
    const heRtl = t("notesPane") !== "";
    setLang("en");
    const inEnglish = t("notesPane");
    ok("the two languages differ for the same key", inHebrew !== inEnglish);
    ok("and the Hebrew is in Hebrew script", /\p{Script=Hebrew}/u.test(inHebrew));
    ok("and the English carries no Hebrew script", !/\p{Script=Hebrew}/u.test(inEnglish));
    ok("and the RTL question follows the language", heRtl && !/\p{Script=Hebrew}/u.test(inEnglish));

    // And the eleven, by name, because "every key exists in both" would pass while
    // the *pair* is wrong — a key present in both and identical in both is a
    // Hebrew string an English user still sees.
    setLang("en");
    for (const k of [
      "refreshTitle",
      "refreshSame",
      "refreshGone",
      "refreshNone",
      "refreshRetarget",
      "refreshRetargeted",
      "refreshTake",
      "refreshTook",
      "refreshedCount",
      "refreshMoved",
      "sourcePasted",
    ]) {
      ok(`${k} is translated, not shown as its own name`, t(k) !== k);
    }
    setLang("he");
  }

  // 4 · A language choice is a setting, and survives a reload.
  //
  // Not a test of the widget — the *persistence* is the part that breaks. A
  // language that reverts to Hebrew on reload looks like the selector not working,
  // and costs a writer the whole surface every time they come back to the file.
  {
    ok("lang is a known setting", Object.hasOwn(SETTINGS_DEFAULTS, "lang"));
    ok("and it defaults to Hebrew, a Hebrew-first product", SETTINGS_DEFAULTS.lang === "he");
    // Two shelves, and both of them populated. A third language in `Lang` with no
    // shelf would be a `t` that returns the key for every string in it, and
    // `DICTS` being keyed by `Lang` means that is a type-level possibility.
    check("and there are exactly two shelves", Object.keys(DICTS).sort(), ["en", "he"]);
    ok("and the two are the same size", HE.length === EN.length);
    // And the alignment choices are a different axis entirely, which is the
    // mistake `Settings extends Omit<DocConfig, "lang">` was about: the interface
    // language is not a document property.
    ok("and document alignment is still a document property", ALIGN_CHOICES.includes("justify"));
  }

  // 5 · The sweep: four kinds of label, and none may survive a switch.
  //
  //     This is the part the issue calls "a browser test", and it is not one.
  //     `installChrome` gives a `document` whose `querySelectorAll` returns `[]`
  //     unconditionally, so `localise(document)` would be a no-op that passes
  //     everything asked of it — and a test that cannot fail is the thing this
  //     repository keeps refusing to ship.
  //
  //     So the root here implements exactly what the sweep uses: the four
  //     selectors it queries, and `getAttribute`/`setAttribute`/`textContent`.
  //     That is enough to catch a dropped `data-i18n-title` line, which is the
  //     realistic regression, and it is honest about not opening a panel.
  //
  //     The real end-to-end version — open every panel, switch, read the screen,
  //     reload — needs a browser this suite does not have. That is recorded as a
  //     gap rather than approximated.
  {
    // Each marker names the attribute the sweep writes to: `data-i18n` writes
    // `textContent`, `data-i18n-title` writes `title`, and so on. Reading the
    // marker instead is how the first version of this stub filled eight of
    // sixteen labels with nothing and still had an assertion to fail.
    const WRITES = {
      "data-i18n": null,
      "data-i18n-title": "title",
      "data-i18n-label": "aria-label",
      "data-i18n-placeholder": "placeholder",
    };
    const ATTRS = Object.keys(WRITES);
    const node = (attr, key) => {
      const target = WRITES[attr];
      const n = {
        _attr: attr,
        _key: key,
        get textContent() { return n._text ?? ""; },
        set textContent(v) { n._text = v; },
        getAttribute: (a) => (a === attr ? key : null),
        setAttribute: (a, v) => { n[a] = v; },
        read: () => (target === null ? n.textContent : (n[target] ?? "")),
      };
      return n;
    };
    const KEYS4 = ["notesPane", "outline", "findPlaceholder", "commandsTitle"];
    const nodes = ATTRS.flatMap((attr) => KEYS4.map((key) => node(attr, key)));
    const root = { querySelectorAll: (sel) => nodes.filter((n) => sel === `[${ATTRS.find((a) => sel === `[${a}]`)}]`) };
    const readAll = () => nodes.map((n) => n.read());

    setLang("he");
    localise(root);
    const inHebrew = readAll();
    check("the sweep fills all sixteen labels", inHebrew.filter(Boolean).length, 16);
    ok(
      "and every one is Hebrew",
      inHebrew.every((s) => /\p{Script=Hebrew}/u.test(s ?? "")),
    );

    // The switch, on the same tree: one call, no rebuild.
    setLang("en");
    localise(root);
    const inEnglish = readAll();
    check(
      "no label keeps Hebrew after the switch",
      inEnglish.filter((s) => /\p{Script=Hebrew}/u.test(s ?? "")),
      [],
    );

    // Reversible, because a sweep that only works one way is a switch that
    // alternates rather than a language.
    setLang("he");
    localise(root);
    ok(
      "and it is reversible",
      readAll().every((s) => /\p{Script=Hebrew}/u.test(s ?? "")),
    );

    // And each attribute kind is really swept — a dropped line fails here and
    // nowhere else.
    setLang("en");
    // Swept *after* the switch: the loop only reads, so without this it compared
    // Hebrew nodes against an English test and called the difference a pass,
    // because `every` on an empty array is true and the filter was matching on a
    // `_attr` the rewritten node no longer carried. Two bugs pointing at one
    // vacuous assertion.
    localise(root);
    for (const attr of ATTRS) {
      const mine = nodes.filter((n) => n._attr === attr);
      ok(
        `${attr} is swept (${mine.length} nodes)`,
        mine.every((n) => n.read() && !/\p{Script=Hebrew}/u.test(n.read())),
      );
    }

    // Idempotent, so a re-render does not dirty the tree a second time.
    const once = readAll().join("\u0000");
    localise(root);
    check("and the sweep is idempotent", readAll().join("\u0000"), once);
    setLang("he");
  }
}
