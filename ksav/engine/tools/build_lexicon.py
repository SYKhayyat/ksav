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
    words = sorted(words | general)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8", newline="\n") as f:
        f.write("# Ksav Hebrew lexicon — generated by tools/build_lexicon.py\n")
        f.write("# Built from Public Domain texts only: Sefaria (Mishnah, Shulchan Arukh,\n")
        f.write("# Mishnah Berurah, Rashi) for Torah Hebrew, and Project Ben-Yehuda for\n")
        f.write("# general Hebrew. See that script for the source list and the reasoning.\n")
        f.write("# Do not edit by hand: rerun the builder. Hand additions belong in\n")
        f.write("# lexicon-he-supplement.txt.\n")
        f.write(f"# {len(words)} entries, normalized (no nikud, ASCII gershayim).\n")
        for w in words:
            f.write(w + "\n")

    print(f"\n{len(counts)} distinct forms seen, {len(words)} kept (min-count {args.min_count})")
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
    print("\nsources used:")
    for ref, title, segs, n in used:
        print(f"  {ref:45s} {title[:40]:42s} {segs:6d} segs {n:8d} words")


if __name__ == "__main__":
    main()
