# Two numbers under one noun

**2026-08-16**

A full pass on the five pages a person arrives at — `README.md`,
`ksav/README.md`, `CONTRIBUTING.md`, `docs/start-here.md` and
`ksav/editors/emacs/README.md` — read as somebody with no context rather than as
their author.

Two things came out of it. One is a hole in the route in; the other is a fence
enforcing a number the application contradicts.

## The page that never said how to get it

`README.md`'s first table sends *"You are here to… **use it**"* to
`docs/start-here.md`. That page opens:

> ## The first document
>
> It opens with one. Type into it.

Every word after that is good, and all of it assumes the reader already has Ksav
in front of them. There was no install line, and no mention that Ksav runs three
ways — a desktop application, an engine binary that carries the editor inside it
and opens in a browser, and an Emacs package. A reader who followed the link
that says *use it* was told what to type before being told what to type it into.

It has *Getting it in front of you* now: three rows, one line each, each linking
to the page that has the detail rather than repeating it. The detail stays where
it was — the installers and the four sentences about the unsigned first launch
are the front door's, the Emacs install is the package's.

## The fence that enforced the wrong number

`docs/start-here.md` said:

> There are 124 commands. `#` in the editor offers all of them.

The registry declares 124. `commands.available` drops the deprecated ones before
anything is offered — in one place, for the palette and the `#` completion —
`main.ts` applies the same rule to the Insert menu, and the Emacs package's
`ksav-commands` to its own. The editor offers **122**.

So the sentence was wrong by two, and `ksav/README.md`'s *"searches all 124
commands"* and the generated shortcut card's *"There are 124 of them"* were
wrong the same way. Worse than wrong: the count fence was **holding them there**.
`docfacts.mjs` measured one fact called `commands` and asserted it into three
sentences about what a reader can reach.

That is this repository's own bug family — the surface contradicting the
mechanism — with the test on the surface's side, which is the version that
survives longest.

`offeredCount()` is the second fact. The claims about what the editor offers use
it; the claims about what the registry declares keep the first. `card.mjs`
counts what `#` offers, because that is what its sentence is about.

### One noun, two facts

The backward sweep reads *a number standing beside a fenced noun* and requires
it to be declared. Both facts are called "commands" in English, and inventing a
second noun to disambiguate would be prose written for the fence — so `NOUNS`
maps the noun to *both*, and a claim is accepted when it matches a declaration
for either, in that file. Still per file and per number: what widened is which
fact a sentence may be about, never which numbers a page may state.

Mutated to `offers all 130 of them` and watched the forward claim fail with the
sentence it wanted.

## What was already right

The other four pages hold up as onboarding. `README.md` routes by intent and is
honest about the unsigned installers in the same breath as the download.
`CONTRIBUTING.md` opens with the one bug this codebase keeps having and says
plainly that a prose-only change can fail the gate. `ksav/README.md` is the
architecture and reads like it. The Emacs README got its second half earlier
today, with every service and the key that reaches it.
