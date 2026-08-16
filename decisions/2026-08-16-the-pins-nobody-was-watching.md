# The pins nobody was watching

**2026-08-16**

The remote was green. Every job on it carried this, on every run, for weeks:

> Node.js 20 is deprecated. The following actions target Node.js 20 but are
> being forced to run on Node.js 24: `actions/checkout@v4`,
> `actions/setup-node@v4`, `jetli/wasm-pack-action@v0.4.0`.

An annotation rather than a failure, which is why nothing in this repository
ever mentioned it. It is a red workflow on a date GitHub picks: the forcing is
a compatibility shim being kept alive until it is not, and on the day it is
withdrawn every job here stops at its first step, in all three workflows, with
an error about a runtime rather than about anything in this tree.

## What moved

`actions/checkout` and `actions/setup-node` to `v7`, which is where they are
rather than `v5`, which is only where the deprecation stops. The behaviour
changes between those majors — `setup-node` v5 caches automatically when
`package.json` names a package manager, v6 narrows that to npm, `checkout` v6
persists credentials to a separate file and v7 refuses fork checkouts under
`pull_request_target` — and none of them touches this repository: every
`setup-node` here passes `cache` and `cache-dependency-path` explicitly, and no
workflow uses `pull_request_target` or `workflow_run`.

`node-version: 20` did **not** move, and that is the point of it. The action's
runtime and the Node this project is built against are two different facts that
happen to share a number. CI pins 20 because that is the floor the editor
claims; the local machine runs 26, which is why `HANDOFF.md` says green here is
not evidence.

The Pages actions in `deploy.yml` moved too — `configure-pages@v6`,
`upload-pages-artifact@v5`, `deploy-pages@v5` — on the same reasoning. They were
not in the annotation because **`deploy.yml` has never run**: it triggers on
tags, and the one tag this repository has predates the file. Worth writing down
separately, and it is now in `HANDOFF.md`: the browser build has a publishing
workflow that has never been executed once.

## The one that could not be bumped

`jetli/wasm-pack-action@v0.4.0` is a JavaScript action pinned to the Node 20
runtime whose newest release is from 2023. There is no version of it that is not
deprecated. What it does underneath is run wasm-pack's own installer script, so
that is what the two jobs that need it do now — the same install, one fewer
third party in the chain, and one fewer thing that can be abandoned upstream.

## The class, and why it is not a test

The instance is three stale pins. The class is that an action pin is a
hand-kept list — the shape `HANDOFF.md` names as the thing that goes stale — and
this one cannot be swept from inside the repository. Whether `actions/checkout@v4`
is behind is a fact about GitHub's releases, not about this checkout, and the
gate has no network.

So the sweep is delegated to the one thing that does have that fact:
`.github/dependabot.yml`, weekly, grouped into a single pull request. Only
`github-actions` — the npm and cargo trees are pinned by lockfiles that CI
already builds from and that a person updates deliberately, and the failure
being guarded against here is specifically a pin that is fine until a runtime
somewhere else is switched off.

## What was checked

That the remote was green before any of this, because the report that prompted
it said otherwise: `ci` had passed on the last three pushes, and all seven
checks were green on the tip commit. The deprecation annotation is the only mark
on that page that is not a tick, and it is the thing this record is about.
