//! What Ksav redistributes, and the notice each redistribution owes.
//!
//! # Why this is a Rust module and not a Markdown file
//!
//! Six font files and four word lists are pulled into the engine with
//! `include_bytes!`/`include_str!` (`lib.rs:46-55`, `spell/*.rs`). That is what
//! creates the obligation: they are *in* every `ksav` binary, every installer
//! `.github/workflows/release.yml` publishes, and the ~23 MB wasm module a
//! browser tab downloads. The SIL OFL, the GUST licence and the English Speller
//! Database's each require their notice to travel with the copy.
//!
//! So the fact "this thing is embedded, under this licence, with this notice"
//! had three homes and no fence between them: `THIRD-PARTY-NOTICES.md` (for the
//! source tree), `licenses/*` (the texts), and a fourth hand-kept copy in
//! `app/src/main.ts` (for the About panel, which is the only notice a web build
//! can show — it has no installer to put a text file beside). Nothing tied them
//! together, so embedding a seventh font would have been a licence violation on
//! every download and a green test suite.
//!
//! The table below is the one home. `app/src/engine.gen.ts` is generated from it
//! so the About panel cannot drift, and the tests at the foot of this file tie it
//! to the bytes on one side and to `THIRD-PARTY-NOTICES.md` on the other. Adding
//! a font without a notice is now a failing `cargo test`, which is the only kind
//! of reminder that works.

use serde::Serialize;

/// What sort of thing is embedded — the About panel groups by this.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum NoticeKind {
    Font,
    Lexicon,
}

#[derive(Serialize, Clone, Copy)]
pub struct Notice {
    pub kind: NoticeKind,
    /// The name as a reader would recognise it. For a font this is the family
    /// name Typst resolves, which is why `BUNDLED_FONTS` on the app side can be
    /// derived from this table rather than typed again.
    pub name: &'static str,
    /// The copyright line, verbatim, as the licence requires it to appear.
    pub copyright: &'static str,
    /// The licence as it is named to a human.
    pub licence: &'static str,
    /// Where the licence text lives in the repository, relative to its root.
    /// Empty for the one asset whose licence is Ksav's own.
    pub licence_file: &'static str,
    pub url: &'static str,
    /// The embedded files, relative to `engine/`. Checked against the
    /// `include_bytes!`/`include_str!` lines that actually embed them.
    pub files: &'static [&'static str],
    /// A text face a writer may choose in the font menu.
    ///
    /// False for the maths font: NewCM Math carries an OpenType MATH table and
    /// no Hebrew text, so offering it in the font list would be offering a way
    /// to typeset a sefer in a font with no letters in it. It is still notified,
    /// because it is still redistributed.
    pub selectable: bool,
}

pub static NOTICES: &[Notice] = &[
    Notice {
        kind: NoticeKind::Font,
        name: "Frank Ruhl Hofshi",
        copyright: "Copyright 2015 The Frank Ruhl Hofshi Project Authors",
        licence: "SIL Open Font License 1.1",
        licence_file: "licenses/OFL-1.1.txt",
        url: "https://openfontlicense.org",
        files: &[
            "assets/fonts/FrankRuhlHofshi-Regular.otf",
            "assets/fonts/FrankRuhlHofshi-Bold.otf",
        ],
        selectable: true,
    },
    Notice {
        kind: NoticeKind::Font,
        name: "David Libre",
        copyright: "Copyright (c) 2003–2016 The David Libre Project Authors",
        licence: "SIL Open Font License 1.1",
        licence_file: "licenses/OFL-1.1.txt",
        url: "https://openfontlicense.org",
        files: &[
            "assets/fonts/DavidLibre-Regular.ttf",
            "assets/fonts/DavidLibre-Bold.ttf",
        ],
        selectable: true,
    },
    Notice {
        kind: NoticeKind::Font,
        name: "Cascadia Mono",
        copyright: "Copyright (c) 2020 Microsoft Corporation",
        licence: "SIL Open Font License 1.1",
        licence_file: "licenses/OFL-1.1.txt",
        url: "https://github.com/microsoft/cascadia-code",
        files: &["assets/fonts/CascadiaMono.ttf"],
        selectable: true,
    },
    Notice {
        kind: NoticeKind::Font,
        name: "New Computer Modern Math",
        copyright: "Copyright (C) 2019–2026 Antonis Tsolomitis",
        licence: "GUST Font License 1.0 (LPPL 1.3c)",
        licence_file: "licenses/GUST-FONT-LICENSE.txt",
        url: "https://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt",
        files: &["assets/fonts/NewCMMath-Regular.otf"],
        selectable: false,
    },
    Notice {
        kind: NoticeKind::Lexicon,
        name: "English Speller Database (SCOWL)",
        copyright: "Copyright 2000–2026 Kevin Atkinson; Australian data © 2016 Benjamin Titze",
        licence: "ESDB licence",
        licence_file: "licenses/ESDB.txt",
        url: "https://wordlist.aspell.net",
        files: &["assets/lexicon-en.txt", "assets/lexicon-en-supplement.txt"],
        selectable: false,
    },
    Notice {
        kind: NoticeKind::Lexicon,
        name: "Ksav Hebrew lexicon",
        copyright: "Built from Public Domain texts (Sefaria, Project Ben-Yehuda)",
        licence: "MIT OR Apache-2.0",
        licence_file: "",
        url: "https://github.com/SYKhayyat/ksav",
        files: &["assets/lexicon-he.txt", "assets/lexicon-he-supplement.txt"],
        selectable: false,
    },
];

/// The font families a writer may pick, in menu order.
///
/// Derived rather than listed: the font menu and the licence notice are the same
/// set of files seen from two ends, and typing them twice is how the app came to
/// offer a font the engine did not bundle.
pub fn selectable_fonts() -> Vec<&'static str> {
    NOTICES
        .iter()
        .filter(|n| n.kind == NoticeKind::Font && n.selectable)
        .map(|n| n.name)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::path::Path;

    const ENGINE: &str = env!("CARGO_MANIFEST_DIR");

    fn repo_root() -> &'static Path {
        // `engine/` → `ksav/` → the repository root, where `licenses/` and
        // `THIRD-PARTY-NOTICES.md` live. The licence texts sit above the crate
        // because they cover the whole distribution, not the engine alone.
        Path::new(ENGINE)
            .parent()
            .and_then(Path::parent)
            .expect("engine sits two levels below the repository root")
    }

    /// Every embedded byte string is a redistribution, and every redistribution
    /// is notified.
    ///
    /// Read out of the source rather than listed here, in both directions: a
    /// seventh font added with `include_bytes!` and no notice fails, and a
    /// notice for a file the engine stopped embedding fails too. The second half
    /// matters as much as the first — a stale notice claims a licence obligation
    /// that no longer exists, which is how a notice file becomes fiction.
    #[test]
    fn every_embedded_asset_is_notified() {
        let mut embedded: BTreeSet<String> = BTreeSet::new();
        for (source, prefix) in [
            (include_str!("lib.rs"), "../"),
            (include_str!("spell/english.rs"), "../../"),
            (include_str!("spell/hebrew.rs"), "../../"),
        ] {
            for line in source.lines() {
                for macro_name in ["include_bytes!(\"", "include_str!(\""] {
                    let Some(i) = line.find(macro_name) else {
                        continue;
                    };
                    let rest = &line[i + macro_name.len()..];
                    let Some(end) = rest.find('"') else { continue };
                    let path = &rest[..end];
                    // Only the two asset trees. The prelude, the CSP, the web
                    // index and the test fixtures are Ksav's own files, under
                    // Ksav's own licence, and owe nobody a notice.
                    let Some(rel) = path.strip_prefix(prefix) else {
                        continue;
                    };
                    if rel.starts_with("assets/") {
                        embedded.insert(rel.to_string());
                    }
                }
            }
        }

        let notified: BTreeSet<String> = NOTICES
            .iter()
            .flat_map(|n| n.files.iter().map(|f| f.to_string()))
            .collect();

        assert!(
            embedded.len() >= 8,
            "the include scan found only {} embedded assets — it has stopped \
             parsing the source it reads, which would make this test pass by \
             finding nothing",
            embedded.len()
        );
        assert_eq!(
            embedded, notified,
            "every embedded asset must carry a notice in NOTICES, and every \
             notice must name an asset the engine still embeds"
        );
    }

    /// The files exist, and so do the licence texts they point at.
    #[test]
    fn the_notices_point_at_files_that_are_there() {
        for n in NOTICES {
            for f in n.files {
                let p = Path::new(ENGINE).join(f);
                assert!(p.exists(), "{}: {} is not on disk", n.name, f);
            }
            if !n.licence_file.is_empty() {
                let p = repo_root().join(n.licence_file);
                assert!(
                    p.exists(),
                    "{}: the licence text {} is not in the repository, so the \
                     notice points at nothing",
                    n.name,
                    n.licence_file
                );
            }
        }
    }

    /// `THIRD-PARTY-NOTICES.md` says the same thing as this table.
    ///
    /// The Markdown is the notice a source tree and an installer carry; this
    /// table is the notice the running app shows. They are two renderings of one
    /// obligation, and the way they went wrong was not that one was false — it
    /// was that one grew a line the other never learned.
    #[test]
    fn the_notices_file_names_every_embedded_asset() {
        let md = include_str!("../../../THIRD-PARTY-NOTICES.md");
        for n in NOTICES {
            assert!(
                md.contains(n.name),
                "THIRD-PARTY-NOTICES.md does not name {}, which the engine embeds",
                n.name
            );
            assert!(
                md.contains(n.copyright),
                "THIRD-PARTY-NOTICES.md does not carry {}'s copyright line \
                 verbatim — the two notices have drifted:\n  {}",
                n.name,
                n.copyright
            );
            for f in n.files {
                let base = f.rsplit('/').next().expect("a file name");
                assert!(
                    md.contains(base),
                    "THIRD-PARTY-NOTICES.md does not mention {base}, which {} embeds",
                    n.name
                );
            }
        }
    }

    /// The font menu offers exactly the text faces that are bundled.
    #[test]
    fn the_selectable_fonts_are_the_bundled_text_faces() {
        assert_eq!(
            selectable_fonts(),
            vec!["Frank Ruhl Hofshi", "David Libre", "Cascadia Mono"],
            "the font menu is derived from NOTICES; if this changed on purpose, \
             regenerate app/src/engine.gen.ts"
        );
    }
}
