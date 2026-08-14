# The Girsa wave and the tail of the inventory — 14 August 2026

Fourteen chunks, `ef75abb` through `1ded125`. Every finding relayed from Girsa is
closed, and every item left in the marked-up UI inventory is built except two
that were held back for a decision and one that is reported below with its
evidence.

## The pass, measured

Run at `1ded125`, on this machine, `node tools/gate.mjs`:

| check | |
|---|---|
| engine formatting, browser engine formatting, desktop shell formatting | green |
| editor typecheck | green |
| editor suite | **5,641 assertions across 90 files** |
| engine lints (`clippy -D warnings`, all targets) | green |
| engine tests | **642** |
| desktop shell lints, desktop shell tests | green |

And the two things the gate deliberately does not run, because they need a
toolchain and a browser:

- the assembled application — **442 checks**, green;
- the parse oracle's corpus — **3,401 documents**, each compared against Typst's
  own parser.

Those numbers are in `README.md` and `documentation.test.mjs` holds them there. A
count in a living page that nothing measures is the thing that file exists to
forbid, which is why this record states them once, dated, and the page states
them as facts about now.

## What the wave actually changed about the checks

The findings were about defects. What they left behind is a suite that can see
more kinds of thing than it could:

- **It looks at the screen.** Four claims per surface — a non-zero box, an
  effective opacity computed *through the ancestors*, nothing hidden in that
  chain, a box inside the viewport — over surfaces derived from `panels.ts`
  rather than listed. Playwright's own actionability check passes an element at
  `opacity: 0`, so eight steps of clicking had proved nothing about it.
- **It refuses to lie about its own setup.** A keypress shaped in a way no
  browser sends is refused with the spelling to use instead; a server binary
  older than `app/dist` exits rather than testing yesterday's build. Both were
  paid for: thirteen shortcuts were filed as broken on the strength of the
  driver, and withdrawn.
- **It measures the state a reader starts in.** Every list surface with nothing
  in it must say something, in words rather than by printing its own i18n key.
- **It asserts classes rather than sizes.** No test pins the exact size of a
  registry any more, and the prohibition is repo-wide and every-language.

## The one item reported rather than finished

Vim text objects for a note (`in`/`an`) and a heading's section (`ih`/`ah`).
Written, registered, and driven in a real browser: `dah` deletes a **single
character**. `mapCommand(keys, "motion", …, { context: "operatorPending" })`
accepts the binding and vim then reads the pair the motion returns as one
position. `@replit/codemirror-vim` ships minified with its identifiers renamed,
so the shape it wants cannot be read off the package, and each guess costs a full
rebuild.

Shipping it would mean `dah` quietly eating one letter of a sefer, which is worse
than not having it. `keymodes.bridge.units` stays: the arithmetic — where this
note begins and ends, where this heading's section does — is right and is what
the next attempt needs. What is missing is the registration.

Everything else asked of the modes is in: the takeover, `:`/`M-x` over the whole
registry, `]]`/`[[`, the leader, `x` that takes a pointed letter with its marks,
and written answers for Escape and for the two macro systems.

## Two held for a decision

`#27` (git built into Ksav) and `#34` (Ksav as an Emacs mode) are product
decisions rather than defects, and were held back deliberately. Neither is
started.

*Both were decided and built the same day; see
[The two that were held](2026-08-14-the-two-that-were-held.md). The paragraph
above is left as it was written — a record is a record of a moment.*
