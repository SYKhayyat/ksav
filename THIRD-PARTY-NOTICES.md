# Third-party notices

Ksav itself is dual-licensed MIT OR Apache-2.0 (see `LICENSE`). This file covers
everything else that ships inside a Ksav binary or installer.

It exists because it has to. Six font files and two word lists are embedded in
the engine with `include_bytes!` and `include_str!`, so they are *in* every
`ksav` binary, every `.msi`, every `.dmg`, every `.AppImage` and every `.deb`
that `.github/workflows/release.yml` publishes. Three of the licences involved —
the SIL Open Font License, the GUST Font License and the English Speller
Database's — require their notice to accompany redistribution. Shipping any of
them without these notices would be a licence violation on every download.

The licence texts referenced below are in `licenses/`.

---

## Embedded fonts

These are compiled into the engine (`ksav/engine/src/lib.rs`) so that Ksav's
output is self-contained and does not depend on what happens to be installed on
the reader's machine.

### Frank Ruhl Hofshi — Regular, Bold

- Files: `ksav/engine/assets/fonts/FrankRuhlHofshi-Regular.otf`,
  `FrankRuhlHofshi-Bold.otf`
- Copyright 2015 The Frank Ruhl Hofshi Project Authors.
- Licence: SIL Open Font License, Version 1.1 — `licenses/OFL-1.1.txt`
- Reserved Font Name: "Frank Ruhl Hofshi"

Ksav's default Hebrew text face, and the reason Hebrew documents come out
looking like seforim rather than like a word processor's guess.

### David Libre — Regular, Bold

- Files: `ksav/engine/assets/fonts/DavidLibre-Regular.ttf`, `DavidLibre-Bold.ttf`
- Copyright (c) 2003–2016 The David Libre Project Authors.
- Licence: SIL Open Font License, Version 1.1 — `licenses/OFL-1.1.txt`
- Reserved Font Name: "David Libre"

### Cascadia Mono

- File: `ksav/engine/assets/fonts/CascadiaMono.ttf`
- Copyright (c) 2020 Microsoft Corporation.
- Licence: SIL Open Font License, Version 1.1 — `licenses/OFL-1.1.txt`
- Upstream: https://github.com/microsoft/cascadia-code

A note on this one, because the font file disagrees with itself. Its embedded
`name` table carries Microsoft's generic "Microsoft supplied font" string in the
licence-description record (ID 13) while the licence-URL record (ID 14) points
at `https://scripts.sil.org/OFL`. The upstream project ships Cascadia under the
SIL OFL 1.1 and that is the licence relied on here; the ID 13 string is stale
build metadata, not a separate grant.

### New Computer Modern Math

- File: `ksav/engine/assets/fonts/NewCMMath-Regular.otf`
- Copyright (C) 2019–2026 Antonis Tsolomitis.
- Licence: GUST Font License v1.0 — `licenses/GUST-FONT-LICENSE.txt`, which
  distributes under the LaTeX Project Public License 1.3c or later —
  `licenses/LPPL-1.3c.txt`
- Upstream: https://ctan.org/pkg/newcomputermodern

The largest single thing Ksav bundles (1.3 MB) and the only reason `#נוסחה`
works out of the box: Typst's maths layout needs a font carrying an OpenType
MATH table, and no Hebrew text face has one.

The GUST licence *requests* — but does not legally require — that derived works
rename the fonts. Ksav redistributes this font unmodified, so no rename applies.

---

## The lexicons

### Ksav Hebrew lexicon

- Files: `ksav/engine/assets/lexicon-he.txt`,
  `ksav/engine/assets/lexicon-he-supplement.txt`
- Built from Public Domain texts (Sefaria, Project Ben-Yehuda).
- Licence: MIT OR Apache-2.0 — Ksav's own.
- Built from Public Domain sources by `ksav/engine/tools/build_lexicon.py`,
  which documents the provenance of every corpus that went into it, including
  which ones were deliberately left out and why.

`ksav/engine/assets/lexicon-he-supplement.txt` is original work by the Ksav
authors and is covered by Ksav's own licence.

Nothing under the GNU AGPL is bundled. Hspell — the only other open Hebrew
spelling dictionary in existence — is deliberately not included; see the module
comment at the top of `ksav/engine/src/spell/hebrew.rs` for the licence
reasoning and for the measurements that ruled it out on quality grounds as well.

### English Speller Database (SCOWL)

- Files: `ksav/engine/assets/lexicon-en.txt`,
  `ksav/engine/assets/lexicon-en-supplement.txt`
- Copyright 2000–2026 Kevin Atkinson; Australian data © 2016 Benjamin Titze
- Licence: the English Speller Database licence — `licenses/ESDB.txt`
- Upstream: https://wordlist.aspell.net

Most of that file is a word list generated from the English Speller Database
(ESDB, formerly SCOWL) — the same data behind `wamerican`, Aspell and most open
spell checkers. Its licence is permissive but explicitly covers "word lists
created from it" and requires the copyright and permission notice to appear in
all copies. So the notice is carried three ways: the full text in
`licenses/ESDB.txt`, a copy in the header of `lexicon-en.txt` itself — where a
build step cannot separate it from the data — and rendered in the app under
Settings → About, because the web build has no installer to put a text file
beside. `engine/tests/spell_en.rs` fails if the header notice ever goes missing.

The rest of that file is drawn from Public Domain English translations on
Sefaria (the JPS 1917 Tanakh and the public-domain Mishnah translations), for
the biblical proper nouns a general word list does not carry. See
`ksav/engine/tools/build_english_lexicon.py`.

`ksav/engine/assets/lexicon-en-supplement.txt` — the transliterated Hebrew,
Aramaic and Yiddish vocabulary — is original work by the Ksav authors and is
covered by Ksav's own licence. Nothing in it is derived from any copyrighted
word list.

---

## Rust and npm dependencies

The Typst compiler (`typst`, `typst-layout`, `typst-pdf`, `typst-svg`,
`typst-html`, `typst-as-lib`), the CodeMirror editor packages, Tauri, and the
rest of the dependency tree carry their own licences — overwhelmingly MIT,
Apache-2.0 and BSD. They are linked, not vendored, and their licence texts come
from their own crates and packages.

To regenerate a full, machine-checked inventory:

```sh
cargo install cargo-about && cargo about generate about.hbs   # Rust
npx license-checker --production --summary                    # npm
```
