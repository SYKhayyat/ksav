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
import * as interchange from "./interchange";
import * as docx from "./docx";
import * as org from "./org";
import * as share from "./share";
import * as runtime from "./runtime";
import { setStatus, closeMenus } from "./runtime";
import { t, tf } from "./i18n";
import { settings, ownPageSetup, docConfig } from "./settings";
import { troubleSaid } from "./diagnostics";
import { enterDoc } from "./tabstrip";
import { loadBody } from "./docswitch";
import { ask, askText } from "./formmodal";
import { clearChromeNotice } from "./ribbon";
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
  clearChromeNotice();
  setStatus(tf("reloadedFrom", binding.name), "ok");
}


/* function offerRecovery moved to applifecycle.ts */

/* function maybeCheckForUpdate moved to applifecycle.ts */

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

export const importWord = async () =>
  importAs(".docx", async (f) => docx.importDocx(new Uint8Array(await f.arrayBuffer())));

export const importOrg = async () => importAs(".org", async (f) => org.fromOrg(await f.text()));


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
  // The page setup travels once: `createDoc` persists what the link carries —
  // including the direction, merged here — so there is one durable write for
  // the fact, not two that could disagree. `rememberConfig` runs only when a
  // direction arrived, because that is the part a bare `#ערוץ`-less link
  // changes about the document's own defaults.
  const setup = { ...(shared.config ?? {}), ...(shared.dir ? { dir: shared.dir } : {}) };
  const doc = await docs.createDoc(
    shared.title || t("untitled"),
    shared.body,
    [],
    shared.customCommands,
    setup as never,
  );
  if (shared.dir) await docs.rememberConfig(doc.id, setup as never);
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
  await watch.markInSync(runtime.currentDoc.id, binding);
  tellGirsaWhereItIs();
  // The title bar is save's hook's job (`save.onUpdateTitleBar` fired above);
  // a second call here refreshed it twice under two ownership stories.
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
export async function autosaveToFile() {
  const name = runtime.currentBinding?.name ?? "";
  if (await save.autosaveToFile(settings.autosaveFile !== false, fileText)) {
    setStatus(tf("autosavedTo", name), "ok");
  }
}