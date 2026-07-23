#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build Ksav's English lexicon.

Why this exists
---------------
Ksav is Hebrew-first, but `dir: "ltr"` has always been a real setting and an
English document typesets correctly. Until this file existed the checker simply
*skipped* every word containing a Latin letter, so an English page with three
typos in it came back clean — and nothing in the interface said so. A silence
that reads as a clean bill of health is worse than a missing feature.

The English half of the problem is the mirror image of the Hebrew half, which is
why it needs a different answer. For Hebrew there is essentially one open
dictionary (Hspell) and it does not know Torah Hebrew, so Ksav builds its own
word list from Torah corpora. For English there is an excellent open word list —
Kevin Atkinson's English Speller Database, the source of SCOWL, `wamerican` and
Aspell's own dictionaries — and it is missing exactly one thing: the vocabulary
this product's writers use in every paragraph. A checker that underlines
*Shabbos*, *gemara*, *chavrusa* and *Rashi* is the same useless checker Hspell is
for Hebrew, arrived at from the other direction.

So there are three ingredients:

* **ESDB / SCOWL** (size 60, US + British + Canadian + Australian spellings) for
  general English. Size 60 is Aspell's own default for spell checking. Measured
  miss rates on running prose, with this script's morphology: 1.5% on
  *Pride and Prejudice*, 2.7% on *War and Peace* (mostly transliterated Russian
  names), 3.1% on the JPS 1917 Torah. Size 70 buys about half a point of that at
  60% more entries, and every entry added past 60 is another obscure word for a
  real typo to hide behind.
* **Public Domain Judaic English** — the JPS 1917 Tanakh and the PD Mishnah
  translations on Sefaria — for the biblical proper nouns a general list does not
  carry: Abimelech, Shechem, Nahor, Ephron, Mamre. These are the Genesis misses
  above, and they are words, not typos.
* **A hand-curated supplement** (`assets/lexicon-en-supplement.txt`) for
  contemporary transliterated Hebrew and Aramaic, which no public-domain corpus
  contains because the writing that uses it is all in copyright. That file is
  original work and is edited by hand; this script never touches it.

Usage
-----
    python tools/build_english_lexicon.py             # fetch + rebuild
    python tools/build_english_lexicon.py --offline   # rebuild from the cache
    python tools/build_english_lexicon.py --size 70   # a different SCOWL size

The generated file is committed, so a normal build never touches the network.

Licence
-------
ESDB's licence is permissive but does require its notice to travel with any word
list derived from it. This script writes that notice into the head of the
generated file, `THIRD-PARTY-NOTICES.md` records it, `licenses/ESDB.txt` carries
the full text, and the app renders it in Settings → About — the same treatment
the bundled fonts get, for the same reason: the word list is compiled *into*
every binary and every wasm module Ksav ships.
"""

import argparse
import collections
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
CACHE = os.path.join(HERE, ".corpus-cache")
OUT = os.path.join(ENGINE, "assets", "lexicon-en.txt")

# The ESDB word-list generator. `special` is deliberately absent: its optional
# lists are hacker jargon and roman numerals, neither of which belongs in a
# checker for seforim.
ESDB = "http://app.aspell.net/create"
ESDB_PARAMS = [
    ("max_variant", "1"),          # Aspell's default: common variants, not every one
    ("diacritic", "both"),         # café and cafe both spelled correctly
    ("download", "wordlist"),
    ("encoding", "utf-8"),
    ("format", "inline"),
]
# Every English-speaking spelling a Ksav writer might use. A bochur in Gateshead
# writes "recognise" and one in Lakewood writes "recognize"; flagging either is
# the checker being wrong about a document it was not asked to have an opinion
# on. The cost is that it cannot catch a mixed-spelling document, which is a
# style question and not a spelling one.
SPELLINGS = ["US", "GBs", "GBz", "CA", "AU"]

SEFARIA = "https://www.sefaria.org/api/v3/texts/"

# Public Domain English translations, verified through Sefaria's own version
# metadata — the same rule the Hebrew builder follows, and for the same reason:
# nothing whose licence has to be argued about goes into a shipped asset.
#
# The JPS 1917 Tanakh is the whole of it that matters. The Mishnah and Avot
# translations are thin (Sefaria has only fragments of the PD ones digitised) but
# they cost one request each and they carry Mishnaic vocabulary the Tanakh does
# not.
TANAKH = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "I_Samuel", "II_Samuel", "I_Kings", "II_Kings",
    "Isaiah", "Jeremiah", "Ezekiel",
    "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
    "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
    "Psalms", "Proverbs", "Job", "Song_of_Songs", "Ruth", "Lamentations",
    "Ecclesiastes", "Esther", "Daniel", "Ezra", "Nehemiah",
    "I_Chronicles", "II_Chronicles",
]
JPS = "The Holy Scriptures: A New Translation (JPS 1917)"

SOURCES = [(ref, JPS, "Biblical proper nouns and archaic English") for ref in TANAKH] + [
    ("Mishnah_Berakhot", "Eighteen Treatises from the Mishna", "Mishnaic English"),
    ("Pirkei_Avot", "The Saying of the Jewish Fathers: Gorfinkle 1913", "Mishnaic English"),
]

TAGS = re.compile(r"<[^>]+>")
# A "word": Latin letters, optionally carrying accents, with an internal
# apostrophe (don't, Israel's). Hyphens split — the checker checks the halves of
# a compound separately, so a corpus entry for the whole is wasted.
WORD = re.compile(r"[A-Za-zÀ-ɏ]+(?:'[A-Za-zÀ-ɏ]+)*")


def fold(s):
    """Fold what the checker folds, so the list is stored the way it is looked up.

    Only the curly apostrophe: it is what every word processor and every web
    corpus produces, and without folding it *every* contraction and possessive
    in a pasted paragraph — don't, it's, Israel's — is a miss. That measured as
    0.1–0.3 points of miss rate on running prose, all of it noise.
    """
    return unicodedata.normalize("NFC", s).replace("’", "'").replace("ʼ", "'")


# ------------------------------------------------------------------- ESDB

def fetch_esdb(size, offline):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"esdb-{size}-{'-'.join(SPELLINGS)}.txt")
    if os.path.exists(path):
        with open(path, encoding="utf8") as f:
            return f.read()
    if offline:
        sys.exit(f"no cached ESDB list at {path} — run once without --offline")
    url = ESDB + "?" + urllib.parse.urlencode(
        [("max_size", str(size))] + [("spelling", s) for s in SPELLINGS] + ESDB_PARAMS
    )
    req = urllib.request.Request(url, headers={"User-Agent": "ksav-lexicon-builder"})
    with urllib.request.urlopen(req, timeout=180) as r:
        text = r.read().decode("utf8")
    with open(path, "w", encoding="utf8", newline="\n") as f:
        f.write(text)
    return text


def split_esdb(text):
    """The header (which is the licence) and the words, split on the `---` line."""
    head, _, body = text.partition("\n---\n")
    if not body:
        sys.exit("ESDB response has no `---` delimiter — did the service change?")
    words = [fold(w.strip()) for w in body.splitlines() if w.strip()]
    return head.strip().splitlines(), words


def drop_recoverable_possessives(words):
    """Drop `X's` where `X` is present: the checker strips the possessive itself.

    Worth doing on size alone — a third of ESDB's entries are possessives — but
    it also keeps the list honest about what it contains. Anything the morphology
    can derive is the morphology's job.
    """
    have = set(words)
    kept = [w for w in words if not (w.endswith("'s") and w[:-2] in have)]
    return kept


# ------------------------------------------------------------------- Sefaria

def fetch_sefaria(ref, version, offline):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9_]", "_", ref + "__en__" + version) + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf8") as f:
            return json.load(f)
    if offline:
        raise RuntimeError("not cached")
    url = SEFARIA + urllib.parse.quote(ref) + "?version=" + urllib.parse.quote("english|" + version)
    req = urllib.request.Request(url, headers={"User-Agent": "ksav-lexicon-builder"})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read().decode("utf8"))
    with open(path, "w", encoding="utf8") as f:
        json.dump(data, f)
    time.sleep(0.4)  # be a good citizen
    return data


def flatten(x, out):
    if isinstance(x, str):
        out.append(x)
    elif isinstance(x, list):
        for i in x:
            flatten(i, out)


def scan_corpus(offline):
    """Surface-form counts from the Public Domain English sources."""
    counts = collections.Counter()
    used = []
    for ref, version, _what in SOURCES:
        try:
            data = fetch_sefaria(ref, version, offline)
        except Exception as e:  # noqa: BLE001 - one missing source must not stop the build
            print(f"  skip {ref}: {e}", file=sys.stderr)
            continue
        versions = data.get("versions") or []
        if not versions:
            print(f"  skip {ref}: no versions returned", file=sys.stderr)
            continue
        v = versions[0]
        lic = (v.get("license") or "").strip()
        if lic != "Public Domain":
            print(f"  REFUSE {ref}: licence is {lic!r}, not Public Domain", file=sys.stderr)
            continue
        segs = []
        flatten(v.get("text"), segs)
        n = 0
        for seg in segs:
            for w in WORD.findall(fold(TAGS.sub(" ", seg))):
                counts[w] += 1
                n += 1
        used.append((ref, len(segs), n))
    return counts, used


# ------------------------------------------------------------ the morphology
#
# Duplicated from `engine/src/spell/english.rs` on purpose, and it is a small
# duplication: the builder has to know what the checker can already derive, or it
# stores thousands of forms that would have been accepted anyway. The Rust side
# is the authority; this is the filter, and `tests/spell_en.rs` asserts the two
# agree on the shipped file.

def known(word, lower, cased):
    return word.lower() in lower or word in cased.get(word.lower(), ())


def accepted(word, lower, cased):
    if known(word, lower, cased):
        return True
    return word.endswith("'s") and known(word[:-2], lower, cased)


def index(words):
    """`(all-lowercase entries, {lowercase: {forms that carry a capital}})`."""
    lower = set()
    cased = collections.defaultdict(set)
    for w in words:
        if w == w.lower():
            lower.add(w)
        else:
            cased[w.lower()].add(w)
            cased[w.lower()].add(w.upper())
    return lower, cased


# ------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="use only the cached sources")
    ap.add_argument("--size", type=int, default=60,
                    help="ESDB/SCOWL size (default 60, Aspell's own default for "
                         "spell checking; 70 is a word-game list)")
    ap.add_argument("--min-count", type=int, default=3,
                    help="a corpus word must appear at least this many times "
                         "(default 3), so one scanning error in a source does not "
                         "become a 'correct' spelling")
    args = ap.parse_args()

    print(f"ESDB size {args.size}, spellings {'+'.join(SPELLINGS)}")
    notice, esdb = split_esdb(fetch_esdb(args.size, args.offline))
    print(f"  {len(esdb)} entries")
    esdb = drop_recoverable_possessives(esdb)
    print(f"  {len(esdb)} after dropping possessives the checker can derive")

    lower, cased = index(esdb)
    print("corpus:")
    counts, used = scan_corpus(args.offline)

    # Group surface forms by their lowercase key. A word seen in lowercase
    # anywhere is stored lowercase, which accepts every capitalisation of it; one
    # only ever seen capitalised is a proper noun and is stored as written, so
    # that `abimelech` still reads as wrong.
    by_key = collections.defaultdict(collections.Counter)
    for form, n in counts.items():
        by_key[form.lower()][form] += n

    extra = []
    for key, forms in by_key.items():
        if len(key) < 3 or sum(forms.values()) < args.min_count:
            continue
        # Letters only. A corpus possessive is derivable, a corpus contraction is
        # already in ESDB, and what is left carrying an apostrophe is a scanning
        # artefact — the JPS text yields `fathers'houses` and `days'journey`
        # where a space was lost, and those are not words.
        if not key.isalpha():
            continue
        if any(accepted(f, lower, cased) for f in forms):
            continue
        lc = forms.get(key, 0)
        extra.append(key if lc >= args.min_count else forms.most_common(1)[0][0])
    extra = sorted(set(extra))
    print(f"  {len(counts)} distinct forms, {len(extra)} new entries kept "
          f"(min-count {args.min_count})")

    words = sorted(set(esdb) | set(extra), key=lambda w: (w.lower(), w))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8", newline="\n") as f:
        f.write("# Ksav English lexicon - generated by tools/build_english_lexicon.py\n")
        f.write("# Do not edit by hand: rerun the builder. Hand additions belong in\n")
        f.write("# lexicon-en-supplement.txt.\n")
        f.write(f"# {len(words)} entries. Case is significant: an all-lowercase entry\n")
        f.write("# accepts any capitalisation of itself, a capitalised entry does not\n")
        f.write("# accept the lowercase form. See engine/src/spell/english.rs.\n")
        f.write("#\n")
        f.write(f"# Sources: the English Speller Database (size {args.size}, "
                f"{'+'.join(SPELLINGS)} spellings), whose licence follows and\n")
        f.write("# requires this notice; and Public Domain English translations from\n")
        f.write("# Sefaria (JPS 1917 Tanakh, PD Mishnah) for biblical proper nouns.\n")
        f.write("#\n")
        for line in notice:
            f.write(("# " + line).rstrip() + "\n")
        f.write("#\n")
        for w in words:
            f.write(w + "\n")

    print(f"\nwrote {OUT} ({os.path.getsize(OUT)} bytes, {len(words)} entries)")
    print("\nPublic Domain corpus used:")
    for ref, segs, n in used:
        print(f"  {ref:22s} {segs:6d} segments {n:8d} words")


if __name__ == "__main__":
    main()
