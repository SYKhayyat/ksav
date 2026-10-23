// ---------------------------------------------------------------- the bound file
//
// The file's UI half: Open, Save, Save as, reload-from-disk, the crash panel
// and the recovery offer, the update check, the importers, the share links,
// the service worker, and the autosave timer's tick. `files.ts` reads and
// writes bindings; `save.ts` owns the save story's rules; this is the shell's
// dialogs, questions and status line around them — it deliberately does not
// re-derive the decision.
//
// This file refuses to answer for: what a binding *is* and what writing one
// means (`files.ts`), the save routes and their tests (`save.ts`), and the
// document lifecycle the doors open into (`docswitch.ts`).

import * as files from "./files";
import * as save from "./save";
import { flushSaves } from "./save";
import * as docs from "./docs";
import * as watch from "./watch";
import * as crash from "./crash";
import * as update from "./update";
import * as interchange from "./interchange";
import * as docx from "./docx";
import * as org from "./org";
import * as share from "./share";
import * as runtime from "./runtime";
import { setStatus, closeMenus } from "./runtime";
import { t, tf } from "./i18n";
import { el } from "./dom";
import { settings, ownPageSetup, docConfig } from "./settings";
import { troubleSaid } from "./diagnostics";
import { enterDoc } from "./tabstrip";
import { loadBody, updateTitleBar } from "./docswitch";
import { ask, askText } from "./formmodal";
import { showChromeNotice, clearChromeNotice } from "./ribbon";
import { takeSnapshot } from "./snapshots";
import { gitMayHaveChanged, forgetGit } from "./gitui";
import { tellGirsaWhereItIs } from "./girsa";
/**
 * A document already bound to this exact file, if there is one.
 *
 * Only when the identity is certain — a Tauri path, or a File System Access
 * handle that reports itself the same entry. A "download"-tier binding has no
 * durable file identity, so it is always treated as new rather than guessed at.
 */
export async function docBoundTo(binding: files.FileBinding): Promise<string | null> {
  if (binding.kind === "download") return null;
  // Every binding in one transaction rather than one transaction per library
  // entry — this runs on every Open, and the loop below used to wait for a
  // separate IndexedDB round trip per document in the library.
  const bindings = await files.recallBindings(docs.library().map((e) => e.id));
  for (const entry of docs.library()) {
    const other = bindings.get(entry.id);
    if (!other || other.kind !== binding.kind) continue;
    if (binding.kind === "tauri" && binding.path && other.path === binding.path) return entry.id;
    if (binding.kind === "handle" && binding.handle && other.handle) {
      try {
        if (await binding.handle.isSameEntry(other.handle)) return entry.id;
      } catch {
        /* an unusable handle simply isn't a match */
      }
    }
  }
  return null;
}

export async function openFile() {
  closeMenus();
  const opened = await files.openFile();
  if (!opened) return;
  await flushSaves();
  // Opening the same file twice used to make a second document bound to the same
  // path, filling the library with duplicates of one sefer. If one is already
  // open, switch to it instead of cloning it.
  const existing = await docBoundTo(opened.binding);
  if (existing) {
    await openBound(existing, opened);
    return;
  }
  const stripExt = opened.binding.name.replace(/\.[^.]+$/, "");
  const parsed = docs.parseDoc(opened.text, stripExt || t("untitled"));
  // `?? {}` and not `?? undefined`: a `.ksav` that carries no page setup has
  // *said* it is laid out the shipped way, and a file has to open the same way
  // on every machine. Leaving it absent would hand it the reader's own
  // new-document default, which is the thing B26 exists to stop.
  const doc = await docs.createDoc(
    parsed.title,
    parsed.body,
    parsed.assets,
    parsed.customCommands,
    parsed.config ?? {},
  );
  await docs.setFileName(doc.id, opened.binding.name);
  await files.rememberBinding(doc.id, opened.binding);
  await enterDoc(doc.id);
}

/**
 * Open a document already bound to the file the writer just picked.
 *
 * **This is where the conflict was not missed but *erased*.** The old path read
 * the file, found the library entry bound to that path, **discarded the text it
 * had just read**, opened the IndexedDB copy, and — inside `openDoc` — called
 * `watch.markInSync`, stamping the file's *current* mtime as agreed. So the one
 * moment Ksav was holding both versions in its hands was the moment it threw
 * one away and recorded that they matched.
 *
 * `watch.ts:5-9` names Dropbox syncing an older copy down, a second Ksav window,
 * a text editor open on the same file and `git checkout` as the reason it
 * exists. Every one of them reaches the writer through Open, and after Open the
 * thirty-second autosave overwrote the file with no error, no prompt and
 * nothing in the log.
 *
 * The stamp cannot answer this question, and that is why the comparison is on
 * content: `known` is a per-session map, so on a fresh launch there is no stamp
 * to compare against and `checkFile` correctly says `unknown`. Here there is
 * something better than a stamp — both texts.
 */
export async function openBound(id: string, opened: { text: string; binding: files.FileBinding }) {
  const stored = await docs.getDoc(id);
  const onDisk = docs.parseDoc(opened.text, "");
  if (stored && stored.body !== onDisk.body) {
    if (await ask(tf("fileChangedSinceOpen", opened.binding.name))) {
      // Take the file. The library entry keeps its identity, its history and its
      // binding — this is the same document, with what is actually on disk in it.
      await docs.putDoc({
        ...stored,
        body: onDisk.body,
        assets: onDisk.assets,
        customCommands: onDisk.customCommands,
        ...(onDisk.config ? { config: onDisk.config } : {}),
      });
      await enterDoc(id);
      setStatus(t("loadedFromDisk"), "ok");
      return;
    }
    // Keep Ksav's copy — but the two are known to differ, and the next save has
    // to say so rather than silently winning.
    await enterDoc(id);
    watch.markConflicted(id);
    setStatus(t("keptEditorCopy"), "warn");
    return;
  }
  await enterDoc(id);
}

export async function fileText(): Promise<string> {
  await flushSaves();
  // Pass the app-wide custom commands as the fallback so a local document that
  // uses one is written to disk self-contained, compiling for whoever opens it.
  return docs.serializeDoc(runtime.currentDoc, settings.customCommands);
}

/**
 * Save: to the bound file, or to a file the writer picks, or to the library.
 *
 * Which of the three is `save.saveRoute`, where the rule is written down and
 * tested. This is the shell's half — the dialogs, the conflict question and the
 * status line — and it deliberately does not re-derive the decision.
 */
export async function saveFile() {
  closeMenus();
  await takeSnapshot(true);
  const text = await fileText();
  const route = save.saveRoute(runtime.currentBinding, files.supportsRealFiles());
  if (route === "writeBack" && runtime.currentBinding) {
    if (!(await files.ensureWritable(runtime.currentBinding, confirmWriteWords()))) {
      // Refused, and *now* it is a refusal: `ensureWritable` asked, natively,
      // and the writer said no. Before, this line reported a permission the
      // system had never been asked for.
      //
      // And it routes rather than stopping, which is what `files.ts:359` has
      // always claimed happens — *"a `false` here is what routes it to
      // `saveFileAs`, which is the dialog that re-admits the path"* — while this
      // printed the error and returned. Two statements about one path, in two
      // files, and the one in the comment was the better design. A writer who
      // declines the confirmation and is then shown Save-As can still put the
      // document somewhere; a writer who is shown an error can do nothing.
      setStatus(t("permissionDenied"), "warn");
      await saveFileAs();
      return;
    }
    // Somebody else changed the file since Ksav last agreed with it. A manual
    // Save *may* resolve that — the writer is here and can decide — but it has
    // to be their decision and not a silent overwrite.
    if ((await watch.checkFile(runtime.currentDoc.id, runtime.currentBinding)) === "changed") {
      if (!(await ask(tf("fileChangedOnDisk", runtime.currentBinding.name)))) {
        setStatus(t("saveCancelled"), "warn");
        return;
      }
    }
    let written = false;
    try {
      written = await files.saveTo(runtime.currentBinding, text);
    } catch (e) {
      const bad = troubleSaid(e, "save_file");
      setStatus(`${t("saveFailed")} — ${bad.said}`, "err", bad.detail);
      return;
    }
    if (written) {
      save.markFileSaved();
      save.clearConflict();
      await watch.markInSync(runtime.currentDoc.id, runtime.currentBinding);
      tellGirsaWhereItIs();
      // The document on disk just moved out from under `git status`. Re-read
      // it, if anybody is looking.
      gitMayHaveChanged();
      setStatus(tf("savedTo", runtime.currentBinding.name), "ok");
      return;
    }
    // The binding no longer authorises a write — a desktop path from a previous
    // session, or a handle whose permission lapsed. Ask where to put it, which
    // is what `pickAFile` would have said had the route been computed after the
    // attempt rather than before it.
    await saveFileAs();
    return;
  }
  // A platform that has files, and a document not bound to one. It is already
  // kept — `fileText` above flushed it to the library, which is the document's
  // home inside the app — so a plain Save acknowledges that rather than forcing
  // a file dialog. Popping "choose a name" on a document the writer opened from
  // the library, that already has a title and a home, is the reported nuisance:
  // *"the first save prompts for a name even though the doc exists."* Binding the
  // document to a file on disk is a deliberate act with its own door — File →
  // Save as… — and is not what Ctrl+S is for.
  if (route === "pickAFile") {
    setStatus(t("savedToLibrary"), "ok", t("savedToLibraryWhy"));
    return;
  }
  // And where there are no writable files, Ctrl+S is **not** a download. The
  // text is already kept — `fileText` above flushed it to the library, which is
  // where a document in this browser lives — so Save says so, with the route to
  // an actual file on the hover instead of in the downloads folder. See
  // `save.saveRoute` for the whole of why.
  setStatus(t("savedInBrowser"), "ok", t("savedInBrowserWhy"));
}

/**
 * Take the file's version, losing what is in the editor.
 *
 * Offered when the file has changed underneath, and it snapshots first —
 * "reload" is a destructive act and the version history is the only thing that
 * makes it a reversible one.
 */
export async function reloadFromDisk() {
  const binding = runtime.currentBinding;
  if (!binding) return;
  if (!(await ask(t("confirmReloadFromDisk"), { danger: true }))) return;
  await takeSnapshot(true);
  const opened = await files.reread(binding);
  if (opened === null) {
    setStatus(t("rereadFailed"), "err");
    return;
  }
  loadBody(opened);
  await watch.markInSync(runtime.currentDoc.id, binding);
  save.markFileSaved();
  save.clearConflict();
  clearChromeNotice();
  setStatus(tf("reloadedFrom", binding.name), "ok");
}

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
 * Read a file in, as a new document.
 *
 * Always a *new* document, never over the open one — importing is not a thing
 * anybody does to the sefer they are in the middle of writing, and getting that
 * wrong once costs somebody an evening.
 *
 * One function for every way in rather than one per format. This was
 * `importWord`, and the shape of it — pick a file, say "importing", convert,
 * name the document after the file, write the direction onto its page setup,
 * open it, and say in one sentence what did not come across — is not about Word
 * at all. Org arriving as the second route is what made that visible, and the
 * half that would have been copied is the last step: an import that quietly
 * loses the pictures, or the property drawers, is the kind of thing somebody
 * discovers at the printer.
 */
export async function importAs(
  extension: string,
  convert: (file: File) => Promise<interchange.ImportResult>,
) {
  closeMenus();
  const picked = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extension;
    input.style.display = "none";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    // A dismissed picker fires no event in most browsers.
    window.addEventListener("focus", () => setTimeout(() => resolve(null), 800), { once: true });
    document.body.append(input);
    input.click();
  });
  if (!picked) return;
  setStatus(t("importing"), "");
  let result;
  try {
    result = await convert(picked);
  } catch (e) {
    const bad = troubleSaid(e, "general");
    setStatus(`${t("importFailed")} — ${bad.said}`, "err", bad.detail);
    return;
  }
  const title = picked.name.replace(new RegExp(`\\${extension}$`, "i"), "") || t("untitled");
  const created = await docs.createDoc(title, result.body);
  // The direction is read off the text rather than guessed, and written onto the
  // document's own page setup — where it belongs since B26.
  await docs.rememberConfig(created.id, { dir: result.dir });
  await enterDoc(created.id);
  setStatus(
    result.dropped.length ? tf("importedWithGaps", title, result.dropped.join(", ")) : tf("imported", title),
    result.dropped.length ? "warn" : "ok",
  );
}

export const importWord = async () => {
  try {
    await importAs(".docx", async (f) => docx.importDocx(new Uint8Array(await f.arrayBuffer())));
  } catch (e) {
    const bad = troubleSaid(e, "general");
    setStatus(`${t("importFailed")} — ${bad.said}`, "err", bad.detail);
  }
};

export const importOrg = async () => {
  try {
    await importAs(".org", async (f) => org.fromOrg(await f.text()));
  } catch (e) {
    const bad = troubleSaid(e, "general");
    setStatus(`${t("importFailed")} — ${bad.said}`, "err", bad.detail);
  }
};

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

/**
 * Open a document that arrived in the link.
 *
 * Always as a *new* document, never over whatever is open — a link is something
 * somebody else sent, and it must not be able to replace this person's work. The
 * fragment is cleared afterwards so a reload does not create it a second time.
 */
export async function openSharedIfLinked() {
  const shared = await share.decodeShare(location.hash);
  if (!shared) return;
  // `window.history`, not `history`: CodeMirror's undo extension is imported
  // under that name and shadows the global here.
  window.history.replaceState(null, "", location.pathname + location.search);
  // The writer's own commands travel with the document, or the link produces a
  // compile error at the far end for a document that compiles perfectly at this
  // one. Same for the page it was set on: `docs.createDoc` takes both, and this
  // was the one of the five definitions of "a document" that had not learned it.
  const doc = await docs.createDoc(
    shared.title || t("untitled"),
    shared.body,
    [],
    shared.customCommands,
    shared.config as never,
  );
  const setup = { ...(shared.config ?? {}), ...(shared.dir ? { dir: shared.dir } : {}) };
  if (Object.keys(setup).length) await docs.rememberConfig(doc.id, setup as never);
  await enterDoc(doc.id);
  setStatus(shared.review ? t("openedForReview") : t("openedFromLink"), "ok");
}

/**
 * Copy a link that carries this document.
 *
 * The document travels in the URL *fragment*, which is never sent to a server —
 * so nobody's unpublished chiddushim pass through whoever happens to be hosting
 * the static files. The cost is a length limit, and it is stated up front rather
 * than discovered: a link that nearly works decodes to garbage at the far end,
 * which is worse than being told to send the file.
 */
export async function copyShareLink(forReview: boolean) {
  closeMenus();
  await flushSaves();
  // A desktop build has no useful URL of its own — `tauri://localhost` works on
  // precisely one machine — so the link has to name the hosted copy. Which
  // means there has to *be* one. This read `"https://ksav.app/"`, a literal
  // that appeared nowhere else in the repository: no deploy job, no workflow,
  // no DNS, nothing. Every reviewer link a desktop build ever produced pointed
  // at a host that has never existed, under a status line saying "Link copied".
  //
  // `__PUBLIC_BASE__` is what `deploy.yml` actually published to, or empty.
  // Empty is a refusal, not a fallback: a link that nearly works is the failure
  // mode this whole feature was written to avoid (see `share.TOO_LONG`), and a
  // link to a dead host does not even nearly work.
  const hosted = __PUBLIC_BASE__;
  const local = runtime.backend?.kind === "desktop" || location.protocol === "file:";
  if (local && !hosted) {
    setStatus(t("shareNoHost"), "err");
    return;
  }
  const base = local ? hosted : location.href;
  const link = await share.shareLink(base, {
    title: runtime.currentDoc?.title ?? "",
    body: runtime.docText(),
    dir: docConfig().dir,
    review: forReview,
    // Everything a `.ksav` file carries, because a link is a document and the
    // two had drifted: a `#let` of the writer's own, and the page setup this
    // document was written on rather than whatever the reader's settings say.
    customCommands: runtime.currentDoc?.customCommands ?? settings.customCommands,
    config: ownPageSetup(runtime.currentDoc?.config) as unknown as Record<string, unknown>,
  });
  if (link.tooLong) {
    setStatus(tf("shareTooLong", Math.round(link.length / 1000)), "err");
    return;
  }
  try {
    await navigator.clipboard.writeText(link.url);
    setStatus(t("shareCopied"), "ok");
  } catch {
    // Clipboard permission, or an insecure context. Falling back to a prompt is
    // ugly and it is also the only thing that still works there.
    await askText(t("shareCopyManually"), link.url);
  }
}

/**
 * What the shell's native "may Ksav save here?" dialog says.
 *
 * Here rather than in `files.ts` because this is where the writer's language is
 * known — `files.ts` reads and writes files and has never held a word of either
 * language. See `files.ConfirmWords`.
 */
export function confirmWriteWords(): files.ConfirmWords {
  return {
    title: t("confirmWriteTitle"),
    message: t("confirmWriteMessage"),
    ok: t("confirmWriteOk"),
    cancel: t("cancel"),
  };
}

export async function saveFileAs() {
  closeMenus();
  const text = await fileText();
  const binding = await files.saveAs(runtime.currentDoc.title || "document", text);
  if (!binding) return;
  runtime.setCurrentBinding(binding);
  await docs.setFileName(runtime.currentDoc.id, binding.name);
  await files.rememberBinding(runtime.currentDoc.id, binding);
  save.markFileSaved();
  save.clearConflict();
  await watch.markInSync(runtime.currentDoc.id, binding);
  tellGirsaWhereItIs();
  updateTitleBar();
  // A Save-As binds the document to a *different* place on disk, which may be a
  // different repository or none at all.
  forgetGit();
  setStatus(
    files.canWriteBack(binding) ? tf("savedTo", binding.name) : tf("savedCopy", binding.name),
    "ok",
  );
}

/**
 * Keep the bound file up to date on its own, the way the library copy is.
 *
 * Manual-only file saving means the .ksav on disk drifts behind the document
 * every session, and the writer discovers it at the worst moment — when they
 * open the file somewhere else. Only ever writes to a binding that can actually
 * be written back to and whose permission is already granted: prompting for
 * filesystem access out of a background timer would be its own bug.
 */
export const FILE_AUTOSAVE_MS = 30_000;

export async function autosaveToFile() {
  const name = runtime.currentBinding?.name ?? "";
  if (await save.autosaveToFile(settings.autosaveFile !== false, fileText)) {
    setStatus(tf("autosavedTo", name), "ok");
  }
}