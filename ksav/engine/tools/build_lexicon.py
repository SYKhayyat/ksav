#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build Ksav's Torah lexicon from public-domain sources.

Why this exists
---------------
The only open Hebrew spelling dictionary in existence is Hspell (last released
2017), and it does not know Torah Hebrew. Measured against real text it flags
roughly 8-10% of Shulchan Arukh and 26% of Gemara Aramaic — the *correct* words —
and rejects the entire everyday citation apparatus (ע"א, שו"ע, עיי"ש, ודו"ק,
תוס'). A checker that underlines one correct word in four in the passage a bochur
is quoting does not help them; it teaches them to ignore the squiggles. It is
also AGPLv3, which is a poor fit for a bundled binary.

So Ksav owns its lexicon instead: a wordlist built from public-domain texts that
are actually representative of what Ksav's users write. Individual words are not
copyrightable, but we only draw from Public Domain versions regardless, so there
is no licence question to argue about.

Two corpora, because they cover opposite halves of the language
---------------------------------------------------------------
* **Sefaria** (Mishnah, Shulchan Arukh, Mishnah Berurah, Rashi) supplies Torah
  Hebrew: the vocabulary and citation apparatus a general dictionary rejects.
* **Project Ben-Yehuda** — 26,000 public-domain Hebrew literary works — supplies
  general Hebrew. Without it the lexicon is excellent on a citation and poor on
  ordinary prose: measured at 19.8% missed words on modern Torah writing, versus
  2.9% once Ben-Yehuda is folded in. That is the mirror image of Hspell's problem
  and it needed the same treatment.

Usage
-----
    python tools/build_lexicon.py             # fetch + rebuild assets/lexicon-he.txt
    python tools/build_lexicon.py --offline   # rebuild from the cached corpus only
    python tools/build_lexicon.py --benyehuda path/to/txt_stripped.zip

The Ben-Yehuda dump is a 246 MB download, so it is not fetched automatically;
pass it explicitly the first time and it is cached as a word-count file. Get it
from https://github.com/projectbenyehuda/public_domain_dump/releases (the
`txt_stripped.zip` asset — its LICENSE is a plain "Public domain").

The generated file is committed, so a normal build never touches the network.
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
OUT = os.path.join(ENGINE, "assets", "lexicon-he.txt")
# Word counts extracted from the Ben-Yehuda dump, so the 246 MB zip is needed
# only once. Committed? No — it is large and derivable; the built lexicon is what
# ships.
BY_COUNTS = os.path.join(CACHE, "benyehuda-counts.json")

API = "https://www.sefaria.org/api/v3/texts/"

# Every source here is a Public Domain version, verified through Sefaria's own
# version metadata. Talmud Bavli is deliberately absent: Sefaria carries no PD
# Hebrew version of it (the William Davidson edition is CC-BY-NC and Wikisource
# is CC-BY-SA). Rashi and Mishnah Berurah quote the Gemara constantly, so a good
# deal of Talmudic vocabulary and Aramaic arrives through them anyway.
SOURCES = [
    # (Sefaria ref, version title, what it contributes)
    ("Mishnah_Berakhot", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Shabbat", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Eruvin", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Pesachim", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Yoma", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Sukkah", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Rosh_Hashanah", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Megillah", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Ketubot", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Nedarim", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Gittin", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Kiddushin", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Bava_Kamma", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Bava_Metzia", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Bava_Batra", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Sanhedrin", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Avot", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Chullin", "Torat Emet 357", "Mishnaic Hebrew"),
    ("Mishnah_Niddah", "Torat Emet 357", "Mishnaic Hebrew"),
    # Halachic Hebrew, and the citation/abbreviation apparatus.
    ("Shulchan_Arukh,_Orach_Chayim", "Maginei Eretz: Shulchan Aruch Orach Chaim, Lemberg, 1893", "Halachic Hebrew"),
    ("Shulchan_Arukh,_Yoreh_De'ah", "Ashlei Ravrevei: Shulchan Aruch Yoreh Deah, Lemberg, 1888", "Halachic Hebrew"),
    ("Shulchan_Arukh,_Even_HaEzer", "Apei Ravrevei: Shulchan Aruch Even HaEzer, Lemberg, 1886", "Halachic Hebrew"),
    ("Shulchan_Arukh,_Choshen_Mishpat", "Shulhan Arukh, Hoshen ha-Mishpat, Lemberg, 1898", "Halachic Hebrew"),
    ("Mishnah_Berurah", "On Your Way", "Modern halachic Hebrew + abbreviations"),
    # Rashi: Torah vocabulary, Aramaic quotation, and the ד\"ה style.
    ("Rashi_on_Genesis", "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934", "Rashi"),
    ("Rashi_on_Exodus", "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934", "Rashi"),
    ("Rashi_on_Leviticus", "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934", "Rashi"),
    ("Rashi_on_Numbers", "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann -- corrected vocalization", "Rashi"),
    ("Rashi_on_Deuteronomy", "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934", "Rashi"),
]

NIKUD = re.compile(r"[֑-ׇ]")
TAGS = re.compile(r"<[^>]+>")
# A "word" for our purposes: Hebrew letters, optionally carrying gershayim or a
# geresh, which is how every abbreviation and many acronyms are written.
WORD = re.compile(r"[א-ת]+(?:[\"'׳״][א-ת]*)*")


def normalize(s):
    """Strip nikud/te'amim and fold Hebrew punctuation to its ASCII twin.

    The checker normalizes exactly the same way, so the lexicon must be stored
    normalized or nothing would ever match: a writer typing גרשיים as U+05F4
    must hit an entry stored with `"`.
    """
    s = unicodedata.normalize("NFC", s)
    s = NIKUD.sub("", s)
    return s.replace("״", '"').replace("׳", "'").replace("”", '"').replace("’", "'")


def fetch(ref, version):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9_]", "_", ref + "__" + version) + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf8") as f:
            return json.load(f)
    url = API + urllib.parse.quote(ref) + "?version=" + urllib.parse.quote("hebrew|" + version)
    req = urllib.request.Request(url, headers={"User-Agent": "ksav-lexicon-builder"})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read().decode("utf8"))
    with open(path, "w", encoding="utf8") as f:
        json.dump(data, f)
    time.sleep(0.4)  # be a good citizen
    return data


def scan_benyehuda(zip_path):
    """Word counts from the Ben-Yehuda public-domain dump."""
    import zipfile

    counts = collections.Counter()
    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if n.endswith(".txt")]
        print(f"  Ben-Yehuda: scanning {len(names)} works")
        for n in names:
            try:
                text = z.read(n).decode("utf8", "ignore")
            except Exception:  # noqa: BLE001 - one bad file must not stop the scan
                continue
            for w in WORD.findall(normalize(text)):
                if len(w) >= 2:
                    counts[w] += 1
    return counts


def load_benyehuda(zip_path):
    if zip_path:
        counts = scan_benyehuda(zip_path)
        os.makedirs(CACHE, exist_ok=True)
        with open(BY_COUNTS, "w", encoding="utf8") as f:
            json.dump(counts, f)
        return counts
    if os.path.exists(BY_COUNTS):
        with open(BY_COUNTS, encoding="utf8") as f:
            return collections.Counter(json.load(f))
    print("  Ben-Yehuda: no dump given and no cache — general Hebrew will be thin",
          file=sys.stderr)
    return collections.Counter()


# --------------------------------------------------------------------- bands
#
# The counts below were computed on every previous run of this script and thrown
# away: line 230 reduced both counters to sets on a threshold and wrote the
# result alphabetically. So the suggestion menu ranked one-edit candidates by
# distance, transposition, and then **alphabetical order** — which put הלכה
# twelfth for `הלכח`, ברכה thirteenth for `ברכח` and שבת sixteenth for `שבתת`,
# in a menu that shows five. Measured: the intended word came first 7 times in
# 200 and appeared at all 45 times in 200.
#
# `spell/common.rs` declined to rank Hebrew and gave an honest reason — that
# guessing at a frequency order would be the invented-evidence problem, in the
# language this project is for. It was right about the principle and wrong about
# this repository: these are not guesses, they are counts over the very corpus
# the lexicon was built from, and they are *better* provenance than the
# hand-typed 200-word English list that file already ships.
#
# The two corpora are banded separately and Torah Hebrew wins, which is an
# editorial position and is stated rather than smuggled in: Ksav is for writing
# seforim, so when a Torah word and a literary word are equally close to a typo,
# the Torah one is offered first. Ranking Torah Hebrew by general-literature
# frequency is the failure `common.rs` was actually warning about.

UNRANKED = 7  # must equal spell::common::BANDS - 1

# The bands, in order, each a cut on **rank position** within one corpus. A cut
# on the raw count would mean something different for each corpus and would move
# every time a source is added; a rank position means the same thing always.
#
# Read the order as a sentence: the commonest six thousand words of the seforim
# come first, then the commonest six thousand words of general Hebrew, then
# whatever else the seforim use. The Torah preference lives in bands 0-2, which
# is where it decides anything — and general Hebrew's top six thousand is placed
# *above* the tail of the Torah corpus deliberately, because "in the commonest
# six thousand words of twenty-six thousand books" is stronger evidence of what
# somebody meant than "appears twice in Shulchan Arukh".
#
# `None` means "everything else in this corpus". The tail of the general corpus
# is left off the list on purpose: it would be the last band, it would sort after
# every other band exactly as unranked does, and writing it would add two bytes
# to 200,000 lines of a file that is compiled into the wasm bundle for no
# ordering it changes.
BAND_PASSES = [
    ("torah", 0, 500),
    ("torah", 1, 2000),
    ("torah", 2, 6000),
    ("general", 3, 6000),
    ("torah", 4, None),
]


def assign_bands(kept, torah_counts, general_counts):
    """Map each kept word to a frequency band, or leave it unranked.

    Only words that survived the min-count thresholds are banded, because a word
    the lexicon does not contain can never be suggested.
    """
    pos = {}
    for name, counts in (("torah", torah_counts), ("general", general_counts)):
        ordered = sorted(
            (w for w in counts if w in kept),
            key=lambda w: (-counts[w], w),  # count desc, then alphabetical for ties
        )
        pos[name] = {w: nth for nth, w in enumerate(ordered)}

    bands = {}
    for w in kept:
        for corpus, band, upto in BAND_PASSES:
            p = pos[corpus].get(w)
            if p is not None and (upto is None or p < upto):
                bands[w] = band
                break
    return bands


def flatten(x, out):
    if isinstance(x, str):
        out.append(x)
    elif isinstance(x, list):
        for i in x:
            flatten(i, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="use only the cached corpus")
    ap.add_argument("--min-count", type=int, default=2,
                    help="a Sefaria word must appear at least this many times "
                         "(default 2), so a single scanning typo in a source does "
                         "not become a 'correct' spelling")
    ap.add_argument("--benyehuda", metavar="ZIP",
                    help="path to Project Ben-Yehuda's txt_stripped.zip")
    ap.add_argument("--benyehuda-min-count", type=int, default=10,
                    help="a Ben-Yehuda word must appear at least this many times "
                         "across 26,000 works (default 10). This is the size/quality "
                         "dial: 3 gives 1.5%% missed words at 7.8 MB, 10 gives 2.9%% "
                         "at 3.5 MB, 50 gives 6.3%% at 1.4 MB.")
    args = ap.parse_args()

    counts = {}
    used = []
    for ref, version, _what in SOURCES:
        try:
            data = fetch(ref, version) if not args.offline else fetch(ref, version)
        except Exception as e:  # noqa: BLE001 - a missing source must not stop the build
            print(f"  skip {ref}: {e}", file=sys.stderr)
            continue
        versions = data.get("versions") or []
        if not versions:
            print(f"  skip {ref}: no versions returned", file=sys.stderr)
            continue
        v = versions[0]
        lic = (v.get("license") or "").strip()
        if lic != "Public Domain":
            # Refuse anything that is not unambiguously public domain, rather
            # than quietly folding a licensed text into a shipped asset.
            print(f"  REFUSE {ref}: licence is {lic!r}, not Public Domain", file=sys.stderr)
            continue
        segs = []
        flatten(v.get("text"), segs)
        n = 0
        for seg in segs:
            for w in WORD.findall(normalize(TAGS.sub(" ", seg))):
                if len(w) < 2:
                    continue  # single letters are always accepted by the checker
                counts[w] = counts.get(w, 0) + 1
                n += 1
        used.append((ref, v.get("versionTitle"), len(segs), n))
        print(f"  {ref}: {len(segs)} segments, {n} words")

    words = {w for w, c in counts.items() if c >= args.min_count}
    by = load_benyehuda(args.benyehuda)
    general = {w for w, c in by.items() if c >= args.benyehuda_min_count}
    print(f"  Ben-Yehuda: {len(by)} distinct forms, {len(general)} kept "
          f"(min-count {args.benyehuda_min_count})")
    kept = words | general
    bands = assign_bands(kept, counts, by)
    ranked = sum(1 for w in kept if bands.get(w, UNRANKED) != UNRANKED)
    words = sorted(kept)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8", newline="\n") as f:
        f.write("# Ksav Hebrew lexicon — generated by tools/build_lexicon.py\n")
        f.write("# Built from Public Domain texts only: Sefaria (Mishnah, Shulchan Arukh,\n")
        f.write("# Mishnah Berurah, Rashi) for Torah Hebrew, and Project Ben-Yehuda for\n")
        f.write("# general Hebrew. See that script for the source list and the reasoning.\n")
        f.write("# Do not edit by hand: rerun the builder. Hand additions belong in\n")
        f.write("# lexicon-he-supplement.txt.\n")
        f.write("#\n")
        f.write("# A line may carry a tab-separated frequency band, 0 (commonest) to 4.\n")
        f.write("# A line without one is UNRANKED, which is not the same as rare. See\n")
        f.write("# assign_bands() in the builder for what each band means, and\n")
        f.write("# examples/suggestrate.rs for what they are worth, measured.\n")
        f.write(f"# {len(words)} entries, {ranked} banded, "
                f"normalized (no nikud, ASCII gershayim).\n")
        for w in words:
            b = bands.get(w, UNRANKED)
            f.write(w + "\n" if b == UNRANKED else f"{w}\t{b}\n")

    print(f"\n{len(counts)} distinct forms seen, {len(words)} kept (min-count {args.min_count})")
    print(f"{ranked} carry a frequency band")
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
    print("\nsources used:")
    for ref, title, segs, n in used:
        print(f"  {ref:45s} {title[:40]:42s} {segs:6d} segs {n:8d} words")


if __name__ == "__main__":
    main()
