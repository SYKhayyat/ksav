// ---------------------------------------------------------------- app lifecycle
//
// The four things that happen to the *application* rather than to a document:
// the crash panel and the recovery offer (a session that ended badly), the
// update check (a build that is not this one), and the service worker (a build
// that outlives the tab). They were fileui.ts's tenants until this file was
// carved out of it — the bound file and the app's own life are different wants.
//
// This file refuses to answer for: what a crash stashes and whether it is worth
// offering (`crash.ts`), what a newer release costs (`update.ts`), and the
// document set the recovery offer opens into (`docs.ts`, `docswitch.ts`).

import { el } from "./dom";
import { t, tf } from "./i18n";
import * as runtime from "./runtime";
import { showChromeNotice, clearChromeNotice } from "./ribbon";
import * as crash from "./crash";
import * as update from "./update";
import * as docs from "./docs";
import { settings } from "./settings";
import { enterDoc } from "./tabstrip";
import * as files from "./files";
/**
 * The panel that appears when something threw that nobody caught.
 *
 * The download button comes first and is the only one that matters: the writer's
 * text is already stashed, and this hands it to them as a file without asking
 * them to trust that the stash worked. The stack is underneath, collapsed,
 * because it is for the bug report and not for them.
 */
export function showCrashPanel(detail: string) {
  const body = runtime.docText();
  // Said in the panel rather than in the status bar. Every other file that
  // leaves says so on the status line, and this is the one moment that is
  // wrong: the writer is looking at a dialog covering the application, which
  // has just crashed, and the one thing they need to know is whether their
  // words reached the disk. The button answers itself.
  const rescue = el("button", { class: "primary", type: "button" }, [t("crashDownload")]);
  rescue.addEventListener("click", () => {
    const name = (runtime.currentDoc?.title || "ksav") + ".ksav";
    files.download(name, body);
    rescue.textContent = tf("exported", name);
  });
  const panel = el("div", { id: "crash-panel", role: "alertdialog" }, [
    el("h3", {}, [t("crashTitle")]),
    el("p", {}, [t("crashLede")]),
    el("div", { class: "crash-acts" }, [
      rescue,
      el("button", { type: "button", onClick: () => location.reload() }, [t("crashReload")]),
    ]),
    el("details", {}, [el("summary", {}, [t("crashDetails")]), el("pre", {}, [detail])]),
  ]);
  document.body.append(panel);
}

/**
 * Offer back a document rescued from a crash — if there is anything to offer.
 *
 * As a *new* document, never over the top of the open one. The rescued text is
 * from a session that ended badly, and the surest way to turn one lost evening
 * into two is to let it overwrite whatever is there now.
 *
 * # Why this was appearing over nothing
 *
 * Reported as *"a crash notice appears on opening a document, which then loads
 * correctly"* — and both halves were true. A crash really had happened, in some
 * earlier session; the document really was fine, because autosave had already
 * written it. The rescue was a duplicate of text the library already held, and
 * the offer had no way to find that out: it compared the rescued body against
 * the *open* document only, and the open document is usually not the one that
 * crashed. Then, having offered, it cleared the stash only when the writer said
 * yes — so a rescue nobody wanted was offered again on every launch, for ever.
 *
 * So the stash carries its document's id, this asks that document whether it
 * already has the text, and the offer a writer does get carries a way to say no.
 */
export async function offerRecovery() {
  const rescued = crash.recovery();
  if (!rescued) return;
  // The document it came from — a rescue with no id is from a build before the
  // id was stashed, and there is nothing to ask. The open document is checked
  // as well, and is what this used to check alone.
  const home = rescued.id ? await docs.getDoc(rescued.id) : null;
  if (!crash.worthOffering(rescued, [runtime.docText(), home?.body])) {
    crash.clearRecovery();
    return;
  }
  showChromeNotice(
    tf("recoveryOffer", rescued.title || t("untitled")),
    {
      label: t("recoveryOpen"),
      press: () =>
        void (async () => {
          const doc = await docs.createDoc(
            (rescued.title || t("untitled")) + " ‏(" + t("recovered") + ")",
            rescued.body,
          );
          crash.clearRecovery();
          clearChromeNotice();
          await enterDoc(doc.id);
        })(),
    },
    {
      // The other answer, which did not exist. Without it the only way to stop
      // being asked was to accept a document you did not want.
      label: t("recoveryDiscard"),
      press: () => {
        crash.clearRecovery();
        clearChromeNotice();
      },
    },
  );
}

/**
 * Ask GitHub whether there is a newer Ksav, at most once a day.
 *
 * Only where it can matter. A browser build updates itself the moment the page
 * is reloaded, so telling somebody there to go and download an installer would
 * be advice about a thing they do not have.
 */
export async function maybeCheckForUpdate() {
  if (runtime.backend?.kind !== "desktop") return;
  if (settings.checkUpdates === false) return;
  if (!update.dueForCheck()) return;
  update.markChecked();
  const release = await update.checkForUpdate();
  if (!release) return;
  showChromeNotice(tf("updateAvailable", release.version), {
    // Composed with a version, so it is text rather than a key.

    label: t("updateDownload"),
    press: () => window.open(release.url, "_blank", "noopener"),
  });
}

/**
 * Install the service worker, where there is any point in one.
 *
 * Not in the desktop build, which is already installed and has no network to be
 * offline from; not on the dev server, where a cache-first worker would serve
 * yesterday's bundle and cost an hour before anyone worked out why. The version
 * rides on the URL because a *changed URL* is what makes a browser treat this as
 * a new worker at all — and the worker takes its cache name from the same place,
 * so a release can never reuse the previous release's cache.
 *
 * `type: "module"` because the worker imports its caching rule and the engine's
 * generated service paths. That import is the fix for the worst bug this file
 * ever had: the worker was cache-first for every same-origin GET, `/inbox` is a
 * queue that drains when it is read, and the first arrival it cached was the
 * same arrival inserted into the document once a second thereafter. A worker
 * that cannot tell an engine service from a stylesheet should not be deciding
 * what to keep, so now it is told, from the one registry in `services.rs`.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (runtime.backend?.kind === "desktop") return;
  if (!import.meta.env.PROD) return;
  // …and **only the wasm build**, which is the one that can actually run
  // offline.
  //
  // The gate was `kind === "desktop"` and `PROD`, and neither is the question.
  // `ksav serve` is a production build served over HTTP with `HttpBackend`
  // behind it, so it installed a cache-first worker over an editor whose
  // *compiler is the server that just went away* — and `index.html` links
  // `rel="manifest"`, so it also offered to **install itself** in that state.
  // What comes back is a shell that boots, draws the chrome, and cannot
  // compile a document.
  //
  // `__WASM__` is the only build where "offline" means the whole product is
  // there, because the engine is in the tab. One line, and it is the line the
  // ambiguous status of the browser build cost.
  if (!__WASM__) return;
  void navigator.serviceWorker
    // `BASE_URL`, not `/`: on a project Pages site the app is served from
    // `/ksav/`, and a worker registered at the origin root would be refused —
    // a worker's scope cannot be broader than its own URL's directory.
    // `.` and not `+` between them: `URLSearchParams.get("v")` decodes `+` as a
    // space, so a `+` here names the cache `ksav-0.1.1 1955…` rather than the one
    // this line appears to write. It worked — a cache name is any string — and it
    // was wrong in the way only the DevTools cache list can show you.
    //
    // `?v=` carries the **version and this build's fingerprint**, because a
    // rebuild with no release does not move the version — and the worker's URL
    // is its identity. Same URL and same bytes means the browser installs
    // nothing, so a reader who came back after a push kept the worker, and the
    // cache, they already had: no `skipWaiting`, no `clients.claim`, and no
    // `activate`, which is the only thing that discards the `ksav-*` caches of
    // earlier builds. Both halves are here because each answers a different
    // question: the version says which release this is, the fingerprint says
    // whether anything under it changed.
    .register(`${import.meta.env.BASE_URL}sw.js?v=${update.CURRENT_VERSION}.${__BUILD_ID__}`, { type: "module" })
    .catch(() => {
      // Offline support is a bonus; failing to install it is not something to
      // interrupt a writer over, and every other consequence of a broken
      // network is already reported by whatever needed it.
    });
}