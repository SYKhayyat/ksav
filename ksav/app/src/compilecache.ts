// ---------------------------------------------------------------- the caches
//
// What one engine session already has, so a request can leave it out: asset
// bytes it holds, and rendered pages this client is still showing.
//
// Two caches, one file, because they answer the same question about the same
// engine from the same place — the compile path is where both are consulted, and
// the two were split from `api.ts` together. One per backend instance: the asset
// cache lives in that engine's process/worker, so a fresh backend (or a
// respawned worker) starts with nothing confirmed. When the engine reports a
// hash it no longer has, that hash is forgotten and its bytes go out again,
// which keeps the two sides honest without either trusting the other's memory
// across a restart.
//
// This file refuses to answer for: which services talk to which routes
// (transports.ts), or the scan memo the lints share (scanmemo.ts).

import type { CompileResult, RequestAsset, RequestAssets } from "./api";

/** One slot per page the engine reports: a string, or `null` for a page this
 *  client still holds (and the engine therefore leaves out of the answer). */
type WirePages = (string | null)[];

/**
 * The rendered pages this client is holding, by fingerprint.
 *
 * A one-character edit in a 48-page document leaves 47 pages byte-identical: 9.7
 * MB was serialised, sent, parsed and written into the DOM on every pause in
 * typing to deliver 40 KB of actual change. So the client tells the engine which
 * pages it still has, and gets back `null` for those.
 *
 * The engine keeps no matching state — it answers only against the list on the
 * request — so this cache can never desynchronise it. The worst it can do to
 * itself is forget a page it claimed, which is caught and costs one extra
 * round trip.
 */
class PageStore {
  private held = new Map<string, string>();
  private bytes = 0;
  /** Roughly three copies of a very long document. Enough that a session's own
   *  pages stay resident; bounded so a long editing session cannot grow without
   *  end. */
  private static readonly CAP = 32 * 1024 * 1024;

  /** The fingerprints to tell the engine about. */
  have(): string[] {
    return [...this.held.keys()];
  }

  /** Remember the pages of a response that landed. */
  keep(pages: string[], hashes: string[] | undefined) {
    if (!hashes) return;
    for (let i = 0; i < pages.length && i < hashes.length; i++) {
      const h = hashes[i];
      if (!h || this.held.has(h)) continue;
      this.held.set(h, pages[i]);
      this.bytes += pages[i].length;
    }
    // A Map iterates in insertion order, and the document on screen was inserted
    // last, so evicting from the front drops the oldest pages first.
    for (const [h, svg] of this.held) {
      if (this.bytes <= PageStore.CAP) break;
      this.held.delete(h);
      this.bytes -= svg.length;
    }
  }

  /**
   * Put back the pages the engine left out.
   *
   * `null` — not a half-filled result — when a page we claimed to hold is not
   * actually here. The caller asks again for the whole document rather than
   * showing a gap, which is the one thing this must never do.
   */
  expand(res: CompileResult): CompileResult | null {
    if (!Array.isArray(res.pages_svg)) return res; // an html export carries none
    const wire = res.pages_svg as unknown as WirePages;
    if (!res.pages_hash) return res; // an engine that does not name its pages
    const pages: string[] = [];
    for (let i = 0; i < wire.length; i++) {
      const own = wire[i];
      if (typeof own === "string") {
        pages.push(own);
        continue;
      }
      const kept = this.held.get(res.pages_hash[i]);
      if (kept === undefined) return null;
      pages.push(kept);
    }
    return { ...res, pages_svg: pages };
  }
}

/**
 * What this engine session already has, so a request can leave it out: asset
 * bytes it holds, and rendered pages this client is still showing.
 *
 * One per backend instance — the asset cache lives in that engine's
 * process/worker, so a fresh backend (or a respawned worker) starts with nothing
 * confirmed. When the engine reports a hash it no longer has, that hash is
 * forgotten and its bytes go out again, which keeps the two sides honest without
 * either trusting the other's memory across a restart.
 */
export class CompileCache {
  private confirmed = new Set<string>();
  private pages = new PageStore();
  /** Unknown until the first response; legacy means keep sending bytes. */
  private assetCache: "unknown" | "sha256" | "legacy" = "unknown";

  /** The engine lost its asset cache (a worker died). Pages are unaffected: the
   *  engine holds no page state to lose. */
  reset() {
    this.confirmed.clear();
    this.assetCache = "unknown";
  }

  /** The wire form of `assets`, with bytes dropped for anything already cached,
   *  plus the hashes whose bytes this request does carry (to confirm on success). */
  private prepare(assets: RequestAssets): { wire: RequestAssets; sent: string[] } {
    const sent: string[] = [];
    const strip = (list: RequestAsset[]): RequestAsset[] =>
      list.map((a) => {
        if (this.assetCache === "sha256" && a.hash && this.confirmed.has(a.hash)) {
          return { name: a.name, hash: a.hash };
        }
        if (a.hash) sent.push(a.hash);
        return a; // carries data
      });
    return { wire: { ...assets, assets: strip(assets.assets), fonts: strip(assets.fonts) }, sent };
  }

  /**
   * Run a compile with the bytes and the pages the engine already has left out,
   * asking again for whatever turns out not to be there.
   *
   * At most one retry, and it asks for everything: a second guess after a wrong
   * one is how a cache turns a saving into a hang.
   */
  async compile(
    send: (payload: Record<string, unknown>) => Promise<CompileResult>,
    assets: RequestAssets,
  ): Promise<CompileResult> {
    const first = this.prepare(assets);
    let res = await send({ ...first.wire, have_pages: this.pages.have() });
    let sent = first.sent;
    let full = this.pages.expand(res);
    const lostAssets = res.missing_assets?.length ? res.missing_assets : null;

    // A current engine advertises SHA-256 on every compile response. An older
    // engine silently ignores the new digest and cannot populate its old cache
    // from it; treating the missing capability as legacy avoids confirming a
    // hash that will miss on the next request forever. If a server is swapped
    // underneath a live client, a missing response while in SHA mode is the
    // same downgrade signal, but only after the engine has had a chance to
    // identify itself.
    if (res.asset_cache === "sha256") {
      this.assetCache = "sha256";
    } else if (this.assetCache === "unknown" || lostAssets) {
      this.assetCache = "legacy";
      this.confirmed.clear();
    }

    if (lostAssets || !full) {
      if (lostAssets) for (const h of lostAssets) this.confirmed.delete(h);
      const retry = this.prepare(assets);
      // Nothing claimed on the retry when a page went missing: get the document
      // whole rather than guess a second time.
      res = await send({ ...retry.wire, have_pages: full ? this.pages.have() : [] });
      sent = retry.sent;
      // Still short is not possible with an empty claim, but if it ever were, no
      // pages beats wrong pages — `runCompile` leaves the last good preview up.
      full = this.pages.expand(res) ?? { ...res, pages_svg: [] };
    }

    if (this.assetCache === "sha256") for (const h of sent) this.confirmed.add(h);
    this.pages.keep(full.pages_svg, res.pages_hash);
    return full;
  }
}
