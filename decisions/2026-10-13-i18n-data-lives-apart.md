# i18n data lives apart from its runtime

Issue #23 was an ergonomics problem, not a runtime-performance problem:
`app/src/i18n.ts` was a 3,094-line module whose executable part was only the
current-language state, dictionary selection, key lookup, and interpolation.
The Hebrew and English shelves made the runtime file noisy to review and made a
copy-only change look like an implementation change.

The dictionaries now live in `app/src/i18n-he.ts` and
`app/src/i18n-en.ts`. They remain TypeScript records rather than generated JSON:
the Hebrew shelf contains the existing `GIRSA` and `KSAV` names, and keeping
those interpolations in the shelf preserves the exact strings without adding a
loader or a second generation step to the browser build. The runtime API stays
in `i18n.ts`: `DICTS`, `setLang`, `getLang`, `hasKey`, `t`, `tf`, and
`isRtlUi` keep their existing exports and behavior.

`i18n-data.test.mjs` imports both shelf modules directly, so the source-module
test fence cannot let either file become untested. It also checks that both
languages have the same keys, every value is a non-empty string, and `DICTS`
exposes the same objects the runtime reads. The existing language and coverage
tests continue to exercise the application-facing contracts. There is no
generated artefact in this design, so no freshness fence is needed.
