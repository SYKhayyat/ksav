// The token `ksav serve` gave this page, read back out of the page itself.
//
// # The finding (#108)
//
// `KSAV_TOKEN` made `X-Ksav-Token` mandatory on seven `Native` services
// (`engine/src/server.rs`'s `native_allowed`), and no client in any build could
// send it. The desktop build talks in-process and never notices; a browser
// client hits the gated services and is refused with an error naming a header
// it was never given. So an operator who set the token to protect a shared box
// — the exact scenario the server's own comment describes — silently broke git,
// the Girsa inbox, mekoros, linkify, refresh, clipboard-source and saved-here
// for every browser user, while their own desktop install looked fine.
//
// The fix is the other half of the same handshake: the server holds the token,
// so the page it serves is served *with* it, as
// `<meta name="ksav-token" content="…">` (see `server.rs`'s `page_with_token`).
// The token is not a build-time `VITE_*` value — a secret baked into a public
// bundle is not a secret. It is a per-run value the served page is allowed to
// know, under the same loopback/CORS rules as every other answer.
//
// A foreign page cannot read the meta: the server sends no
// `Access-Control-Allow-Origin` to a foreign origin, and a `<script>` or
// `<img>` cannot read a body. Only the served editor itself can.

/** The token this page was served with, or "" when none was set. */
export function tokenFromPage(
  root: { querySelector(q: string): Element | null } | null | undefined,
): string {
  if (!root || typeof root.querySelector !== "function") return "";
  const el = root.querySelector('meta[name="ksav-token"]');
  return el?.getAttribute("content") ?? "";
}

/**
 * The header the gated services demand, when there is a token to send.
 *
 * Attached to every request rather than only the seven `nativeOnly` ones: the
 * server only checks it there, so carrying it always is harmless, and it keeps
 * one request path instead of two.
 */
export function tokenHeader(token: string): Record<string, string> {
  return token ? { "X-Ksav-Token": token } : {};
}
