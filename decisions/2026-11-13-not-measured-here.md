# A check this shell cannot build is not a verdict about the tree — #181

**2026-11-13.** The gate's `shell` group went red in the default dev shell, with
sixty lines of `pkg-config` transcript and no sentence anybody could act on. The
mechanism is a `needs` field on a check plus `--require`; the fences are in
`app/test/gate.test.mjs`.

## What was happening

The three shell checks that build (`shell-clippy`, `shell-tests`, `shell-render`)
link WebKitGTK. Those packages are declared in `flake.nix`'s `desktopPkgs` and
mounted only in the **`desktop`** shell; `nix develop` gives the default one.
Run the gate there and cargo fails its build script:

```
error: failed to run custom build command for `gdk-sys v0.18.2`
Package gdk-3.0 was not found in the pkg-config search path
```

Both halves of that are wrong, and neither is about the code:

- **nothing said which shell.** The way from that failure to
  `nix develop .#desktop` did not exist in the output; `flake.nix`'s banner
  printed only `cd ksav && node tools/gate.mjs`.
- **it was reported as a code failure.** The same commit is green on CI and green
  here under the right shell. A gate that is red for reasons that mean nothing
  teaches people to stop reading it — which is the finding `tools/gate.mjs`
  itself exists to fix, arriving through a different door.

## The fix

A check may declare what it needs from the machine:

```js
needs: { pkg: "gdk-3.0", shell: "desktop" }
```

Before anything runs, `pkg-config --exists` is asked — the same question the
cargo build asks four minutes later, answered in a millisecond. A check whose
library is absent is reported with a third mark and its own sentence:

```
– desktop shell lints              not measured here: gdk-3.0 is not in this shell

3 not measured here, and not a verdict on the tree:
  shell-clippy: nix develop .#desktop --command bash -c "cd ksav && node tools/gate.mjs shell"
```

Three marks because there are three facts: `✓` measured and passed, `✗` measured
and failed, `–` not measured at all. The summary counts only what was measured —
`4 of 12 checks passed, 3 not measured here` — and a run where *everything* was
skipped says `nothing was measured` rather than anything green.

`--require` turns a skip into a failure, and every workflow invocation now
passes it: a runner with no WebKitGTK is a broken runner and should say so, while
a desk with the wrong shell open is not.

The banner in `flake.nix` now says the same thing where a reader looks first —
in the default shell, one line naming `nix develop .#desktop` and the group; in
the desktop shell, nothing, because there it is not true.

## The fences

- `verdict(results, require)` is the exit code as a pure function, so the four
  cases (clean, skipped-and-not-required, skipped-and-required, failed) are
  asserted rather than described;
- `missingNeed` takes the `pkg-config` answer as an argument, so both answers are
  testable without a machine that lacks WebKitGTK;
- every `shell` check that builds must declare a `needs`, so a fourth one cannot
  arrive without one;
- every gate invocation in every workflow must carry `--require`, verified red by
  removing one.

## What this does not claim

The editor suite is also machine-shaped in one respect — `browserlang.test.mjs`
needs a browser, and outside the dev shell it reports "asserted nothing" — but
that failure names itself and the fix is a browser, not a shell. It was left as
it is; the rule established here is about system libraries a tree links, which
the gate can ask about before it starts.
