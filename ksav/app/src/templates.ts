// ---------------------------------------------------------------- templates
//
// The menu's half of starting well: the engine's template registry, the
// writer's own saved templates, and the two doors that put one on screen.
// `api.ts` owns what a TemplateDef *is*; this orders, stores and applies.
//
// This file refuses to answer for: the document set the template may open
// into (`docswitch.ts` — `loadBody` and `enterDoc` are its verbs) and the
// settings write a template's direction arrives through (main's setting
// mutations, wired at boot).

import * as runtime from "./runtime";
import { makeWiring } from "./wiring";
import { setStatus, closeMenus, rerenderChrome } from "./runtime";
import { t, getLang } from "./i18n";
import { docTextOf } from "./spans";
import { flushSaves } from "./save";
import * as docs from "./docs";
import { enterDoc } from "./tabstrip";
import { loadBody } from "./docswitch";
import { askText } from "./formmodal";
import { docConfig, type Field, type ValueOf } from "./settings";
import type { TemplateDef } from "./api";

/**
 * What a template borrows from the shell: the setting write a template's
 * direction arrives through (`setSetting` reconfigures the editor's own text
 * direction — assignment alone would leave preview and source disagreeing).
 */
export interface TemplatesWiring {
  setSetting<K extends Field>(key: K, value: ValueOf<K>): void;
}

const W = makeWiring<TemplatesWiring>("wireTemplates");
export const wireTemplates = W.wire;
export const templatesWiring = W.get;
/**
 * A template, into a document rather than over one.
 *
 * The sharpest member of *"opening a document replaces the one I had open"*,
 * and it was not an `openDoc` call at all: picking a template dispatched the
 * whole template body over the open document's text. On an empty new document
 * that is exactly right and is what the menu is for; on a sefer in progress it
 * is the text replaced, undoable and not obviously so.
 *
 * So the emptiness of what is on screen decides. An empty document takes the
 * template in place — no new tab, no second untitled document in the library
 * for a writer who opened the application and picked a template, which is the
 * first thing a new writer does. Anything else gets a document of its own,
 * placed by `openIn` like every other way in.
 */
export async function startFromTemplate(body: string, title?: string) {
  closeMenus();
  if (runtime.docText().trim() === "") {
    loadBody(body);
    return;
  }
  await flushSaves();
  const doc = await docs.createDoc(title?.trim() || t("untitled"), body);
  await enterDoc(doc.id);
}
/**
 * Load a template, and put the document in the direction it was written for.
 *
 * The direction is not decoration here. An English letter loaded into a
 * right-to-left document sets flush right with its date on the wrong side —
 * correct for the setting, wrong for the letter, and confusing enough that a
 * writer would reasonably conclude English is not supported. Picking a template
 * is a deliberate act, and the direction control in the toolbar visibly moves
 * with it, so this is a change the writer can see and undo rather than a hidden
 * one.
 *
 * `lang` is absent on templates coming from an older engine build, in which case
 * the direction is left alone: guessing would be worse than doing nothing.
 */
export async function loadTemplate(tpl: TemplateDef) {
  // The document first, the direction after: `setSetting` writes the page setup
  // of the document *on screen*, so setting it before a template that starts a
  // new document would flip the direction of the sefer being left behind and
  // leave the arriving one with whatever the new-document default is.
  await startFromTemplate(tpl.body, getLang() === "he" ? tpl.he : tpl.en);
  const wanted = tpl.lang === "en" ? "ltr" : tpl.lang === "he" ? "rtl" : null;
  if (wanted && docConfig().dir !== wanted) {
    // Through `setSetting`, not by assignment: the direction also reconfigures
    // the editor's own text direction, and setting the field alone would leave
    // the preview and the source pane disagreeing about which way the page runs.
    templatesWiring().setSetting("dir", wanted);
    rerenderChrome();
  }
}

/**
 * The templates, with the ones in the interface's own language first.
 *
 * Not filtered — a Hebrew speaker writing an English letter, and an English
 * speaker who wants the siddur, both exist and neither should have to go
 * looking. Ordered, because the first thing in a menu is what a menu is telling
 * you to use.
 */
export function templatesForMenu(): TemplateDef[] {
  const lang = getLang();
  return [...runtime.templatesReg].sort((a, b) => {
    const mine = (t: TemplateDef) => (t.lang === lang ? 0 : 1);
    return mine(a) - mine(b);
  });
}

interface UserTemplate {
  id: string;
  name: string;
  body: string;
}
export function userTemplates(): UserTemplate[] {
  try {
    return JSON.parse(localStorage.getItem("ksav.userTemplates") || "[]");
  } catch {
    return [];
  }
}
function saveUserTemplates(list: UserTemplate[]): boolean {
  // A template holds a whole document, so this is the one storage write outside
  // the careful save story that can plausibly hit the localStorage quota. It used
  // to throw straight through the caller; now it reports the failure instead of
  // letting an uncaught exception abandon a half-updated menu.
  try {
    localStorage.setItem("ksav.userTemplates", JSON.stringify(list));
    return true;
  } catch (e) {
    console.warn("saving templates failed:", e);
    setStatus(t("templateSaveFailed"), "error");
    return false;
  }
}
export async function saveAsTemplate() {
  closeMenus();
  const name = await askText(t("templateName"));
  if (!name) return;
  const list = userTemplates();
  list.push({ id: "u" + performance.now().toString(36), name, body: docTextOf(runtime.view.state.doc) });
  if (saveUserTemplates(list)) rerenderChrome();
}
export function deleteUserTemplate(id: string) {
  if (saveUserTemplates(userTemplates().filter((u) => u.id !== id))) rerenderChrome();
}