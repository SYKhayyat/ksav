// Girsa, as an editor surface: the citation plumbing between the prose in hand
// and the library that knows where it is from.
// Owns: `linkifySelection` (spec.md §10.5), the refresh rows and their normal
// `Refreshing` state (`refreshShowing`, `showRefreshed`, `takeRefreshed`), the
// mekoros popup and its keyboard, `askForMekor` and the lint's way in
// (`attachRefToNote`), the drop-into-Girsa door, and the courtesy call
// `tellGirsaWhereItIs`.
// Defers: what a citation *is* to `citation.ts`, and the single insertion path
// to `runtime.ts`'s hook until its own wave gives this module a direct import;
// a refusal is an answer — the prose is left exactly as written.
// Refuses: deciding which places a phrase could be — that is Girsa's answer,
// printed citation and all. This module chooses which one is highlighted and
// where the mekor is inserted, and nothing else.

import type { EditorView } from "@codemirror/view";
import * as runtime from "./runtime";
import { sourcesOf, type Mekoros, type Mekor, type Refreshed, type Refreshing } from "./api";
import { troubleSaid } from "./diagnostics";
import { setStatus } from "./runtime";
import { docTextOf, bodyAt, scanDoc } from "./spans";
import { citationMarkup } from "./citation";
import { t, tf } from "./i18n";
import { el } from "./dom";
import { openPanel, closePanel, mountPanel, isPanelOpen } from "./panels";
import { scheduleCompile } from "./compile";

// ------------------------------------------------------------------- cite on selection
//
// spec.md §10.4: highlight a phrase, the first mekor appears, Tab cycles the
// rest, and **if none fits you drop into full Girsa search**. The last part is
// not a fallback, it is the point: a citation nobody could settle is not a
// citation to guess at.
//
// Everything about *which* places these are is the library's answer, printed
// citation and all. This file chooses which one is highlighted and where the
// mekor is inserted, and nothing else.

/**
 * Turn the citations in the selection into live refs (spec.md §10.5).
 *
 * Girsa finds them and `girsa-ksav` writes them — nothing here decides what a
 * citation is. **High-confidence only**: what comes back is the same prose
 * with the certain ones wrapped, and everything else untouched.
 */
export async function linkifySelection(): Promise<void> {
  const sel = runtime.view.state.selection.main;
  const prose = runtime.view.state.sliceDoc(sel.from, sel.to);
  if (!prose.trim()) {
    setStatus(t("selectAPhrase"), "");
    return;
  }
  const girsa = sourcesOf(runtime.backend);
  if (!girsa) {
    // Not a failure: this build has no way to reach Girsa. The prose is left
    // exactly as written, which is what spec.md §10.5 asks for anyway.
    setStatus(t("girsaNeedsApp"), "");
    return;
  }
  setStatus(t("askingGirsa"), "");
  try {
    const linked = await girsa.linkify(prose);
    if (linked === prose) {
      setStatus(t("nothingCertain"), "");
      return;
    }
    runtime.view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: linked },
      selection: { anchor: sel.from + linked.length },
    });
    setStatus(t("citationsLinked"), "ok");
    scheduleCompile();
  } catch (e) {
    const bad = troubleSaid(e, "linkify");
    setStatus(bad.said, "err", bad.detail);
  }
}

/**
 * Ask the library for every citation in this document again (spec.md §10.2).
 *
 * *"A whole sefer can be switched from abbreviated to full-form citations, or
 * every quote regenerated against a corrected edition, without touching a word
 * of the prose. No paste-based workflow can do that, which is the whole
 * argument for the pairing."*
 *
 * The errand behind that sentence — `POST /refresh` — is named in Girsa's own
 * `post.rs` as **the clearest of them**, the one the loopback earns itself on,
 * and in this repository's README as *"the errand that pays for the loopback"*.
 * It had a generated client, a generated table row, and **no caller in
 * `src/`**. The service that justifies the process boundary had no way in.
 *
 * # Rows, and the writer says yes
 *
 * What comes back is one row per citation and not a rewritten document, and
 * that is the design rather than an unfinished half of it: a correction
 * somebody else made silently changing the words in the sefer you are writing
 * is the one surprise this arrangement exists to avoid. A correction is a claim
 * somebody made, not a fact about the sefer.
 *
 * So each row shows what the library says now, and each row that **differs from
 * what is in the document** offers to put it in. A row that could not be looked
 * up says why and offers nothing — the other thirty-nine still refresh, and
 * that decision was made once, in Girsa.
 */
export async function refreshSources(): Promise<void> {
  const girsa = sourcesOf(runtime.backend);
  if (!girsa) {
    setStatus(t("girsaNeedsApp"), "");
    return;
  }
  const markup = docTextOf(runtime.view.state.doc);
  setStatus(t("askingGirsa"), "");
  let got: Refreshing;
  try {
    got = await girsa.refresh(markup);
  } catch (e) {
    const bad = troubleSaid(e, "reach_girsa");
    setStatus(bad.said, "err", bad.detail);
    return;
  }
  const rows = got.quotes;
  if (!rows.length) {
    setStatus(t("refreshNone"), "");
    return;
  }
  showRefreshed(rows, got);
  const moved = rows.filter((r) => !r.trouble && !markup.includes(r.text)).length;
  setStatus(tf("refreshedCount", rows.length, moved), moved ? "warn" : "ok");
}

/**
 * The marei mekomos the library re-segmented, and the one button that fixes
 * them.
 *
 * Not a row per citation, deliberately: this is one fact about the document —
 * *N of your names are stale* — and offering it N times would make a writer
 * click N times to accept a change they either want or do not. The rows below
 * are about **words** and are one decision each; this is about **names** and is
 * one decision total.
 *
 * The rewritten document comes from the engine (`girsa_ksav::retargeted`), so
 * the scanner that finds a citation is the one both applications compile and
 * nothing here matches a ref by string.
 */
function movedRow(got: Refreshing): HTMLElement | null {
  if (!got.moved.length || !got.retargeted) return null;
  const line = el("div", { class: "refresh-row refresh-moved" }, [
    el("b", {}, [tf("refreshMoved", got.moved.length)]),
    el(
      "div",
      { class: "refresh-text" },
      got.moved.map((m) => el("div", {}, [`${m.from} → ${m.to.join(", ")}`])),
    ),
  ]);
  line.append(
    el(
      "button",
      {
        class: "sc-key",
        onClick: () => {
          const doc = runtime.view.state.doc;
          runtime.view.dispatch({
            changes: { from: 0, to: doc.length, insert: got.retargeted ?? "" },
          });
          setStatus(t("refreshRetargeted"), "ok");
        },
      },
      [t("refreshRetarget")],
    ),
  );
  return line;
}

/** The rows, each with what to do about it. */
/**
 * The rows the panel is currently showing, and the header row's source.
 *
 * Kept so that accepting one row can re-render *the list*, rather than
 * replacing it. `takeRefreshed` used to end with `showRefreshed([row])`, which
 * threw away every other row: a reader working down forty refreshed citations
 * lost the other thirty-nine the moment they accepted one.
 */
let refreshShowing: { rows: Refreshed[]; got?: Refreshing } = { rows: [] };

function showRefreshed(rows: Refreshed[], got?: Refreshing): void {
  refreshShowing = { rows, got: got ?? refreshShowing.got };
  const list = document.getElementById("refresh-list");
  if (!list) return;
  const doc = docTextOf(runtime.view.state.doc);
  const moved = got ? movedRow(got) : null;
  // How many earlier rows name the same place.
  //
  // A sefer that cites the same place twice — routine — produces two rows with
  // one `ref` between them, and `takeRefreshed` located its citation with
  // `doc.indexOf(row.ref)`, which finds the first one always. So the second
  // citation was never reachable: the panel offered the row again, with the same
  // button, which now edited the already-corrected first one.
  const seen = new Map<string, number>();
  list.replaceChildren(
    ...(moved ? [moved] : []),
    ...rows.map((row) => {
      const nth = seen.get(row.ref) ?? 0;
      seen.set(row.ref, nth + 1);
      // A row is "moved" when the words the library has now are not in the
      // document. Compared against the whole buffer rather than against a
      // parsed citation, deliberately: the writer may have edited the quote,
      // and a diff of *their* words against the library's is exactly what they
      // want to see rather than something this file guessed at.
      const here = !row.trouble && doc.includes(row.text);
      const line = el("div", { class: "refresh-row" }, [
        el("b", {}, [row.display || row.ref]),
        el("div", { class: "refresh-text" }, [row.text || ""]),
      ]);
      if (row.trouble) {
        line.append(el("div", { class: "is-trouble" }, [row.trouble]));
      } else if (!here) {
        line.append(
          el(
            "button",
            {
              class: "sc-key",
              onClick: () => takeRefreshed(row, nth),
            },
            [t("refreshTake")],
          ),
        );
      } else {
        line.append(el("div", { class: "refresh-same" }, [t("refreshSame")]));
      }
      return line;
    }),
  );
  openPanel("refresh-panel");
}

/**
 * Put one refreshed quote into the document.
 *
 * The mekor is found by its **ref**, which is the whole reason the ref is
 * stored: `#מראה_מקום(מקור: "girsa:…")[…]` names the place, so the citation to
 * update can be found without parsing prose or trusting a position that the
 * writer may have moved since the rows were asked for.
 */
function takeRefreshed(row: Refreshed, nth = 0): void {
  const doc = docTextOf(runtime.view.state.doc);
  // The `nth` occurrence, not the first. See the counter in `showRefreshed`.
  let at = -1;
  for (let i = 0; i <= nth; i++) {
    at = doc.indexOf(row.ref, at + 1);
    if (at < 0) break;
  }
  if (at < 0) {
    setStatus(t("refreshGone"), "warn");
    return;
  }
  // The citation's **body**, found through the scanner rather than by counting
  // brackets here. A first version of this walked the string itself and
  // `spans.test.mjs` refused it by name — bracket depth is one question with
  // one answer, and a second counter is how `brackets.ts` came to delete a
  // call's real closing paren over a `)` inside a string.
  //
  // The ref is what locates it, which is the whole reason the ref is stored:
  // `#מראה_מקום(מקור: "girsa:…")[…]` names the place, so the citation to update
  // is found without parsing prose or trusting a position the writer may have
  // moved since the rows were asked for.
  const body = bodyAt(scanDoc(runtime.view.state.doc), at);
  if (!body) {
    setStatus(t("refreshGone"), "warn");
    return;
  }
  runtime.view.dispatch({
    changes: { from: body.from, to: body.to, insert: row.display || row.text },
  });
  setStatus(t("refreshTook"), "ok");
  scheduleCompile();
  // The whole list again, recomputed against the document as it now stands —
  // which is what marks the accepted row as matching, and leaves every other row
  // exactly where the reader left it.
  showRefreshed(refreshShowing.rows, refreshShowing.got);
}

/**
 * Tell Girsa where a document now lives (spec.md §10.4).
 *
 * *Standing on a passage, see which of **your own documents** cite it.* Girsa's
 * registry, its `who_cites` query and its tests were all built and **nothing
 * ever sent it a path** — so the query walked `personal/ksav/`, the documents
 * written in Girsa's own toy editor, and a `.ksav` written in the real Ksav
 * answered *nothing cites this*. The reader's actual work, in the actual
 * editor, was invisible to the feature it exists for.
 *
 * There is nowhere for Girsa to walk instead: a reader's documents live
 * wherever they keep documents, and a library application has no business
 * enumerating a disk.
 *
 * Only a **real path** is worth telling it about. The browser's handle tier has
 * no path Girsa could open, and a download is not a place at all — those are
 * the two tiers `files.canWriteBack` already distinguishes.
 *
 * Never awaited by a save and never able to fail one: the library being closed
 * is the ordinary case, and this is a courtesy to it rather than a step in
 * saving.
 */
export function tellGirsaWhereItIs(forget = false): void {
  const binding = runtime.currentBinding;
  const girsa = sourcesOf(runtime.backend);
  if (!girsa || binding?.kind !== "tauri" || !binding.path) return;
  void girsa.savedHere(binding.path, runtime.currentDoc?.title || binding.name, forget).catch(() => {
    // Deliberately silent. Girsa not being open is the ordinary case, and a
    // line about it on every save would be noise about a courtesy the writer
    // never asked for.
  });
}

function closeMekoros(): void {
  closePanel("mekoros");
}

/**
 * Attach a ref to the source note at `at` — the lint's own way in.
 *
 * `askForMekor` works on the selection, which is the right shape for the
 * gesture a writer makes (highlight a phrase, ask where it is from). The lint
 * has a *note* rather than a selection, so it selects the note's printed text
 * and asks about that: the printed text is precisely the phrase whose place is
 * wanted, and it is already in the document.
 */
export function attachRefToNote(view: EditorView, at: number): void {
  const body = bodyAt(scanDoc(view.state), at);
  if (!body) {
    setStatus(t("selectAPhrase"), "");
    return;
  }
  view.dispatch({ selection: { anchor: body.from, head: body.to } });
  view.focus();
  void askForMekor();
}

export async function askForMekor(): Promise<void> {
  const sel = runtime.view.state.selection.main;
  const phrase = runtime.view.state.sliceDoc(sel.from, sel.to).trim();
  if (!phrase) {
    setStatus(t("selectAPhrase"), "");
    return;
  }
  const girsa = sourcesOf(runtime.backend);
  if (!girsa) {
    setStatus(t("girsaNeedsApp"), "");
    return;
  }
  setStatus(t("askingGirsa"), "");
  const answer = await girsa.mekoros(phrase).catch((e: unknown) => ({
    phrase,
    total: 0,
    is_a_quotation: false,
    said: "",
    places: [],
    // The shape `mekoros` returns carries a message a reader will see, so it
    // gets the reader's sentence and not the transport's.
    error: troubleSaid(e, "reach_girsa").said,
  }));
  if (answer.error) {
    // The engine's `error` field carries whatever `girsa-post` said, in English,
    // so it goes through the same rephrasing as a thrown one. A resolved response
    // that reports a failure is still a failure being reported.
    const bad = troubleSaid(answer.error, "reach_girsa");
    setStatus(bad.said, "err", bad.detail);
    return;
  }
  setStatus(answer.said, "");
  showMekoros(sel.to, phrase, answer);
}

function showMekoros(at: number, phrase: string, answer: Mekoros): void {
  const box = el("div", { class: "spell-menu mekoros" }, []);
  mountPanel("mekoros", box, document.body);

  // Placed under the caret, which is where the reader is looking.
  const where = runtime.view.coordsAtPos(at);
  if (where) {
    box.style.left = `${Math.min(where.left, window.innerWidth - 320)}px`;
    box.style.top = `${where.bottom + 6}px`;
  }

  let chosen = 0;
  const rows: HTMLElement[] = [];

  const take = (place: Mekor): void => {
    // The citation goes in as a mekor footnote — the ref travels with it,
    // because that is what makes it re-printable later (spec.md §10.2). The
    // markup is `citation.ts`'s, which is also where the account lives of how
    // long that sentence was false: this was `#מראה_מקום[${place.display}]`,
    // and `place.ref` was read by nothing.
    //
    // **Through `insertSnippet`, not a raw dispatch.** `citation.ts` is a single
    // producer for the *markup* — its own test sweeps `src/*.ts` to keep it the
    // only one — and it then handed its output to the one insertion path the app
    // is forbidden to use. So `deferNoteBodies`, honoured by the toolbar, the
    // palette, the keyboard and the modal, was not honoured by the source
    // citation panel: the most sefer-specific note in the product was the one
    // that ignored the preference.
    runtime.view.dispatch({ selection: { anchor: at } });
    runtime.insertSnippet(citationMarkup(place));
    closeMekoros();
    runtime.view.focus();
    setStatus(place.display, "ok");
    scheduleCompile();
  };

  const said = el("div", { class: "spell-word" }, [answer.said]);
  box.append(said);

  if (!answer.is_a_quotation && answer.total > 0) {
    // Counted, and **not** offered as a source. The list is still shown,
    // because the reader may recognise one; nothing is preselected.
    box.append(el("div", { class: "spell-none" }, [t("phraseNotQuotation")]));
  }

  for (const [i, place] of answer.places.entries()) {
    const row = el("button", { class: "spell-item mekor-item", onClick: () => take(place) }, [
      el("b", {}, [place.display || place.he_title]),
      // Already windowed on the match by the library, with its elisions marked;
      // slicing it here from the start is what put the wrong 90 characters on
      // screen (B16).
      el("span", { class: "mekor-text", title: `${place.characters} תווים` }, [place.shown]),
    ]);
    rows.push(row);
    box.append(row);
    if (i === 0 && answer.is_a_quotation) row.classList.add("sel");
  }

  box.append(el("div", { class: "menu-sep" }, []));
  box.append(
    el("button", { class: "spell-item spell-add", onClick: () => void dropIntoGirsa(phrase) }, [
      t("noneFitSearch"),
    ]),
  );

  const move = (by: number): void => {
    if (rows.length === 0) return;
    rows[chosen]?.classList.remove("sel");
    chosen = (chosen + by + rows.length) % rows.length;
    rows[chosen]?.classList.add("sel");
    rows[chosen]?.scrollIntoView({ block: "nearest" });
  };

  box.addEventListener("keydown", (e) => onMekorosKey(e, move, () => rows[chosen]?.click()));
  window.addEventListener("keydown", mekorosKeys, true);
  function mekorosKeys(e: KeyboardEvent): void {
    // Asking the registry rather than a module-level handle to the node: the
    // list can now be dismissed by Escape, by a click outside it, or by another
    // popup opening over it, and a stale local would keep this listener alive
    // through all three.
    if (!isPanelOpen("mekoros")) {
      window.removeEventListener("keydown", mekorosKeys, true);
      return;
    }
    onMekorosKey(e, move, () => rows[chosen]?.click());
  }
}

/** Tab cycles, Enter takes, Escape gives up — and giving up is a real answer. */
function onMekorosKey(e: KeyboardEvent, move: (by: number) => void, take: () => void): void {
  if (e.key === "Tab") {
    e.preventDefault();
    move(e.shiftKey ? -1 : 1);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    move(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    move(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    take();
  } else if (e.key === "Escape") {
    closeMekoros();
  }
}

async function dropIntoGirsa(phrase: string): Promise<void> {
  closeMekoros();
  const girsa = sourcesOf(runtime.backend);
  if (!girsa) {
    setStatus(t("girsaNeedsApp"), "");
    return;
  }
  await girsa.searchInGirsa(phrase).catch(() => {});
  setStatus(t("openedInGirsa"), "");
}

