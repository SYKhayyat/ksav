# #80 — `reledmac` + `reledpar`, verified: the forwarded claims are false, and the capability is mostly already built

**Date:** 2026-10-02
**Issue:** #80 — *Research: reledmac + reledpar for Hebrew RTL text-critical editions*
**Verdict:** **Do not adopt.** Six of seven forwarded claims are false, the seventh is not a documented rule, and of the two capabilities the research names as worth having, **one is already in Ksav and fenced**, and the other is a LaTeX-only construct with no Typst spelling.

This is the report #80 asked for. It is not an implementation, and there is no
prototype: a sprint that cannot end in "no" is not a sprint, and this one ends in
"no" on evidence rather than on taste.

---

## 1. The claims, one by one

Every claim below was checked against **primary sources** — the CTAN package page,
the official `reledmac.pdf` (v2.44.4) and `reledpar.pdf` (v2.25.10) manuals, the
package source (`reledmac.dtx`, 22,852 lines), the three official example files,
and TeX StackExchange. Not blogs, not summaries.

| # | Claim as forwarded | Verdict |
|---|---|---|
| 1 | Must compile with XeLaTeX; LuaLaTeX struggles with bidi + macro nesting | **FALSE** — inverted |
| 2 | reledmac and bidi both hijack the line-measuring macro level, so raw reledmac breaks in RTL | **FALSE** — contradicted by the manual |
| 3 | `! Undefined control sequence` on Hebrew in `\edtext`, fixed by `\texthebrew` / `\RTLpair` | question **EXISTS**; diagnosis and fix **FALSE** |
| 4 | Backward lemma brackets, fixed by `\Xledmacinit` / `\Xbeforelemma` / `\Xafterlemma` | **FALSE** — none of the three commands exist |
| 5 | `\Xfootdir{\bodydir}` forces footnote registers to the writing direction | **FALSE** — `\Xfootdir` does not exist |
| 6 | Load order: polyglossia, then reledmac, then bidi last | **FALSE as a prescription**; never documented |
| 7 | The blueprint compiles | requirements reported; every named command except `\edtext`/`\Afootnote` would error |

### Claim 1 is backwards

The manual's only engine statement is the *opposite* of the claim (manual §6.3.4,
p. 33):

> "Due to some internal limits of XETEX, `\sameword` does not work with
> right-to-left text with this engine. If you need to use `\sameword` with
> right-to-left text, you must use LuaTEX."

And the package's own error message says it in as many words:

> "You can't use `\sameword` with XeLaTeX when typesetting RTL text. Please use
> LuaTeX instead."

reledmac ships **three** official examples; the RTL one opens with *"In this
example, we use Lua\LaTeX."* So the engine advice is not merely unsupported, it
points the wrong way. Nesting — the thing the claim says LuaLaTeX "struggles" with
— is a documented, supported feature with a worked nested-`\edtext` example
(§6.2.1).

### Claim 2, the central claim, is contradicted by the manual

This is the one the issue called *"the central claim and the most valuable thing in
the text"*, and it is the one that would have carried a decision to adopt a second
typesetting engine. It is false in the specific way that matters: reledmac has
**deliberate, maintained bidi/polyglossia integration**, and each of the three
symptoms the claim enumerates is handled automatically.

- **RTL is read, not inferred.** Manual §II.6 (p. 82): *"`\if@RTL` is defined by
  the bidi package, which is sometimes loaded by polyglossia. But we define it as
  well if the bidi package is not loaded."*
- **Lemma brackets flip by themselves.** Manual §7.5.1, footnote 22 (p. 47):
  *"For polyglossia, when the lemma is RTL, the bracket automatically switches to
  a left bracket."* So the defect Claim 4 calls a bug is **the fixed behaviour**,
  and the remedy it prescribes is the defect.
- **Footnote direction is automatic and per note.** `\footnotelang@poly` records
  `\footnote@dir`, `\footnote@lang` and LuaTeX's `\footnote@luatextextdir` per
  note; `\ledsetnormalparstuff@common` applies it. There is no macro to call.
- **Documented override hooks exist** for the cases that do need steering —
  `\Xwrapcomponents{\LR}`, `\Xwraplemma{\RL}`, `\Xwrapcontent`, `\Xbeforeinserting`
  (§7.7, §7.9.3).
- **reledpar has an entire manual section on it** — §XIII, *"Fixing babel and
  polyglossia"*.
- **A decade of bidi fixes** in the changelog: *"Fix incompatibility of paragraphed
  footnotes with bidi v17.9"*, *"Fix bug with critical footnotes when typesetting
  Arabic text with polyglossia"*, *"Fix a bug when using a `\edtext` in two lines
  or more in right-to-left"*, and more.

The claim's stated mechanism — that both packages *"hijack the macro level at
which text lines are measured"* — appears nowhere in the manual or the changelog,
and is mechanically implausible: reledmac measures lines in the
`\pstart`/`\pend`/`\autopar` layer, which is a different layer from bidi's.

The manual's **entire** documented Hebrew requirement is one sentence (§5.2.6,
p. 19): *"If you use languages written right to left with LuaLATEX or XELATEX, you
must switch text direction before the `\pstart` command."*

### Four of the named commands do not exist

Counted in `reledmac.dtx` and `reledpar.dtx`:

| Command | Occurrences |
|---|---|
| `\Xbeforelemma` | **0** — the 7 near-hits are all `\Xbeforelemmaseparator` |
| `\Xafterlemma` | **0** — likewise `\Xafterlemmaseparator` |
| `\Xledmacinit` | **0** |
| `\Xfootdir` | **0** |
| `\RTLpair` | **0** |
| `\texthebrew` | **0** (it is a polyglossia-generated macro, not reledmac's) |

The real commands are `\Xlemmaseparator`, `\Xbeforelemmaseparator`,
`\Xafterlemmaseparator` (§7.5). **Every one of these would produce
`! Undefined control sequence`**, which means the forwarded blueprint — offered as
the thing to test — cannot have been written against this package.

### Claim 3's question is real; its explanation is not

TeX.SE **#630018**, *"Hebrew text with Polyglossia and reledmac: undefined control
sequence"* (2022-01-13) exists, with an accepted answer. The cause was a
stray diacritic pasted onto the macro name — the asker's own source reads
`\edtextּ{עמי}`, with U+05BC (DAGESH) stuck to the `t`. The answer:

> "The error is actually due to a typo… Removing the diacritic yields the
> functioning code."

A typographical slip, fixed by deleting one character. `\texthebrew` and
`\RTLpair` are mentioned nowhere in the question or the answer.

### Claim 6's load order is not documented, and the official example inverts it

The manual documents load order for `floatrow`, `biblatex` and `footmisc` and
**nothing** for bidi or polyglossia. reledpar's mechanism is a `\AtBeginDocument`
probe, written to be order-agnostic. The official RTL example loads **reledmac
first**, the bidi-bearing package second. And TeX.SE #707565's accepted answer is
the opposite of the claim's first half:

> "polyglossia is loading bidi and reledmac is loading ragged2e so the error is
> asking you load polyglossia later in the preamble."

"Bidi last" is a genuine **bidi** rule, quoted in bidi's own manual — but it is a
constraint on bidi, not a reledmac-documented three-step ordering, and polyglossia
loads bidi for you.

---

## 2. What reledmac actually is — and the part that is genuinely good news

A decade of careful work on a hard problem: numbered paragraphs, automatic line
numbers, `lemmata` anchors, and **five built-in footnote registers** (`\Afootnote`
… `\Efootnote`, plus `\Aendnote`…`\Eendnote` and familiar `\footnoteA`…`\footnoteE`,
extendable with `\newseries`), each independently arranged (`twocol`, `threecol`,
`paragraph`), independently ordered (`\seriesatbegin`), and interleavable
(`\fnpos`). Version 2.44.4 (2026-03-06); reledpar 2.25.10 (2025-05-13).

It is good work. It is also **LaTeX**.

---

## 3. The two capabilities the issue names — measured against Ksav

### "Several independent footnote registers on one page" — **already built, and fenced**

This was the issue's *"most transferable claim"*. It is already the case.
`ksav/engine/src/lib.rs:5207` `footnote_streams`:

```typst
#הגדרות_זרמים(פריסה: "צד", זרמים: ("תוכן", "מקורות"),
             מספור: ("מקורות": "א"),
             כותרות: ("תוכן": [ביאורים], "מקורות": [מקורות]))
```

Two registers side by side, each with its **own independent numbering** (`מספור` is
per-stream) and its own heading, and the test asserts they *converge* — that the
per-page layout is reached without a diagnostic. `endnote_streams_side_by_side`
covers three endnote streams in three columns.

So "A for the main text, B for lower commentary on one page" is not a port from
`reledpar`. It is a spelling exercise against a facility this repository already
has and fences.

### "Line numbers and lemmata" — the residue, and why it is not a port

Grepping the prelude:

- **line numbers** — nothing. `#הגדרות_מספר_שורות` does not exist. (`שורה`/`שורות` at
  `ksav.typ:253` is *height in lines* for a band, not a printed line address.)
- **lemmata** — nothing. `rg -i lemmat` over the whole repository returns one hit,
  and it is this file.

So the genuinely-absent residue is exactly two features. Neither is a reledmac
idea to copy: **both are a consequence of Typst having no notion of the line being
typeset.** reledmac numbers lines because it owns `\pstart`/`\pend` and can count
them; Ksav does not, and cannot, without either a post-pass over laid-out frames
(the engine already walks frames in `jump.rs`) or a writer-supplied address. That
is a design question about Ksav's engine, and reledmac does not answer it —
reledmac's answer is *"we are the text engine"*, which is the second typesetting
stack the issue's option 2 names.

---

## 4. The licence, for the record

`lppl1.3`. Mechanically it is aggregation-friendly (LPPL clause 11), so depending
on a TeX distribution — which ships reledmac under its own terms — would leave
Ksav's MIT/Apache-2.0 untouched. **Vendoring the `.sty` is a different question**
and clause 6(c) is real friction next to a blanket support statement in Ksav's own
`COPYRIGHT`. This is a reason not to vendor; it is **not** a reason for the verdict,
which rests on the claims being false and the capability being present.

---

## 5. Verdict, and what it costs to be wrong

**Do not adopt. Not "not yet" — the case for it does not survive contact with the
package.**

1. **The premise is unsound.** The research presented as motivation is 6/7 false,
   including the load-bearing claim, and names five macros that do not exist. A
   decision taken on the forwarded text would have been taken on a fabrication.
2. **The capability is already here.** Multiple independent per-page registers with
   independent numbering, headings and endnote variants are built and tested.
   #77 already settled the parallel-stream half.
3. **The residue is not a port.** Line numbers and lemmata follow from owning the
   line — which is a question about Ksav's engine, not about LaTeX packages.
4. **The cost of the wrong answer is the worst kind.** Option 2 is a second
   typesetting engine: its own fonts, hyphenation, line-breaking and a 59 ms budget,
   and a third party in the one area a typesetting application most needs to
   control. "A layout engine's page-breaking is exactly the thing a typesetting
   app most needs to control, and delegating it to a package is how a bug becomes
   unfixable-in-place" is the objection from #73, and it was never answered,
   because it never needed to be.

### What is worth keeping

Nothing is thrown away. Three transfers out of reledmac, none requiring a
dependency:

- **The five-register model with per-register arrangement** is the right shape for
  a Torah apparatus, and Ksav's `זרמים` is already it. `\fnpos`-style interleaving
  is the one idea worth a look if Ksav ever needs a register to sit *between* two
  others rather than below both.
- **Lemma anchoring semantics** — a critical note that addresses a *span of source
  text* rather than a position — are worth reading before building lemmata, and
  reledmac's handling of overlapping-but-unnested notes (§6.2.1) names a real edge
  case Ksav would hit.
- **Its RTL changelog is a bug list for free**: each entry is a way text direction
  has broken someone else's typesetting. That is worth reading even without the
  package, and it argues for our own corpus.

### If the text-critical half is wanted

It is worth having, and it is a **Ksav** question rather than an adoption one.
Two features, in this order:

1. **Line numbers** — a post-pass over laid-out frames, or a writer-supplied
   address. The first is automatic and honest; the second is cheaper and is what a
   sefer actually wants (a lemma is *chosen*, not *counted*).
2. **Lemmata** — anchored to the address line numbers produce, so doing lemmata
   first would build the hard half twice.

Both belong in issues of their own with a measurement attached, in the style of
#70. **Neither is blocked on this issue, and neither should wait for it.**

---

## Sources

| | |
|---|---|
| CTAN package page | <https://ctan.org/pkg/reledmac> |
| CTAN metadata (version, licence) | <https://ctan.org/json/2.0/pkg/reledmac> |
| Official manual, v2.44.4 | `mirrors.ctan.org/macros/latex/contrib/reledmac/reledmac.pdf` |
| reledpar manual, v2.25.10 | `mirrors.ctan.org/macros/latex/contrib/reledmac/reledpar.pdf` |
| Package source | `mirrors.ctan.org/macros/latex/contrib/reledmac/reledmac.dtx` |
| Official RTL example | `…/reledmac/examples/2-reledmac-right-to-left.tex` |
| Official critical-notes example | `…/reledmac/examples/1-criticalnotes.tex` |
| Official reledpar MWE | `…/reledmac/examples/3-reledpar_mwe.tex` |
| Source repository | <https://github.com/maieul/ledmac> |
| TeX.SE 630018 — the one real question | <https://tex.stackexchange.com/questions/630018/> |
| TeX.SE 707565 — load order | <https://tex.stackexchange.com/questions/707565/> |
| LPPL 1.3 text | <https://www.latex-project.org/lppl.txt> |

**A correction to the issue.** It cites "a real TeX.SE question" and the forwarded
text referenced a repository that does not exist (`jopDesignated/reledmac` → 404).
The canonical repository is **`maieul/ledmac`**, and the issue is the only TeX.SE
question of its kind that exists. Both are recorded here so the next person does
not repeat the search.

---

## Related

- **#73** — the same discipline applied to a *Typst* package, where adoption is
  cheap and MIT. Also settled by measurement, and in the same direction.
- **#77** — the measurement that Ksav's multi-stream layout already exists.
- **#70** — the pattern this report follows: report the measurement, then decide.