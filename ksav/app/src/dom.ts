// Building DOM without a framework.
//
// Ksav's chrome is constructed in code rather than templated, which is a
// defensible choice for an app whose entire UI flips between two languages and
// two text directions — but it needs one small, honest helper rather than three
// hundred lines of `document.createElement` scattered through a single file.
//
// Everything here is presentation-agnostic: no app state, no i18n, no editor. It
// is the layer every other module can depend on without depending on anything.

type Props = Record<string, unknown>;

/**
 * An element with properties and children.
 *
 * `on…` keys become listeners, `class` and `style` are set directly, and
 * everything else becomes an attribute — which is what makes `aria-label`,
 * `role` and `data-*` as easy to set as `id`, and is why the chrome could grow
 * accessible names without a rewrite.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    // `v != null` here as well as below. Every other attribute drops out when it
    // is null — the idiom the whole file is written in — and `class` alone did
    // not, so a conditional class spelled the ordinary way put the literal
    // string `null` in the attribute and a `.null` rule one CSS file away from
    // being real.
    if (k === "class") { if (v != null) n.className = v as string; }
    else if (k === "style") n.setAttribute("style", v as string);
    else if (k.startsWith("on") && typeof v === "function")
      n.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v != null) n.setAttribute(k, String(v));
  }
  for (const c of children) n.append(c);
  return n;
}

/**
 * The stack that persistent failure banners live in.
 *
 * There is more than one thing that can go durably wrong — storage refusing a
 * save, the command registries failing to load — and each announces itself with
 * a banner pinned to the bottom of the window. Pinned individually they occupied
 * the *same* few pixels and the later one simply hid the earlier, so the writer
 * could be told their toolbar was empty and never told their work was not being
 * saved. One fixed container, stacked as a column, means every notice is
 * visible; each banner is an ordinary block inside it and positions nothing
 * itself.
 */
export function noticeHost(): HTMLElement {
  const existing = document.getElementById("notices");
  if (existing) return existing;
  const host = el("div", { id: "notices", class: "notices" });
  (document.getElementById("app") ?? document.body).append(host);
  return host;
}

/**
 * An icon button that has a name.
 *
 * The name is not optional, and that is the point. Every button in this app is a
 * glyph; a `title` tooltip is not an accessible name, so a screen reader used to
 * announce the toolbar as "†, button", "⁑, button", "▤, button". The glyph is
 * `aria-hidden` because the button already carries the same meaning as its
 * label — otherwise a reader says "dagger, Footnote".
 */
export function iconBtn(
  label: string,
  title: string,
  onClick: () => void,
  cls = "",
  // What this button *is*, for anything that has to find it without reading it.
  //
  // Every control in this chrome is a glyph with a localised tooltip, so until
  // now the only way to identify one from outside was `title*="…"` — a string
  // that changes when the interface language changes, which is a selector that
  // works in Hebrew and silently matches nothing in English. `data-command` (the
  // Hebrew registry name it inserts) and `data-action` (the `ACTIONS` id it
  // runs) are the two vocabularies this app already has; neither is new, and
  // both are stable across languages. `.github/scripts/acceptance.mjs` is the
  // caller, and it fails loudly rather than skipping when one is missing.
  data: Record<string, string> = {},
): HTMLElement {
  // `disabled` in the class list means disabled.
  //
  // It did not. `previewSideToggle` passed `"chip disabled"`, `styles.css` gave
  // `.chip.disabled` an `opacity: .4` and no `pointer-events`, and this
  // constructor had no notion of the state at all — so the control looked greyed,
  // clicked, saved a setting, fired a full chrome rebuild, and announced itself
  // to a screen reader as enabled. The ribbon, the menus and the hydra all set
  // the real attribute; two conventions lived in one file and the cosmetic one
  // was in the constructor every header chip goes through.
  //
  // Read off the class rather than added as a parameter because that is the
  // spelling twelve call sites already use, and a parameter would have left them
  // all still lying.
  // Split, not `\bdisabled\b`: a regex word boundary sits either side of a
  // hyphen, so `is-disabled-looking` would have counted. A class list is a list
  // of tokens and has to be read as one.
  const off = cls.split(/\s+/).includes("disabled");
  return glyphBtn(label, title, onClick, `tb-btn ${cls}`, data, off);
}

/**
 * A glyph button that has a name, on whatever class list the caller needs.
 *
 * `iconBtn` is this with `tb-btn` on the front, and until this existed that was
 * the *only* way to get a named button — so every surface whose buttons are not
 * ribbon buttons had to build its own, and did, and forgot the name.
 *
 * `paneHead` was the whole of it: eleven controls per pane, built with a bare
 * `el("button", { class: "pane-btn", title }, [glyph])`. Text content wins over
 * `title` in accessible-name computation, so the accessibility tree of a
 * two-pane window read `[button] "⇅"`, `[button] "◫"`, `[button] "⊟"`,
 * `[button] "⋯"` — which is the exact failure `iconBtn`'s own docstring says was
 * closed ("a screen reader announced the toolbar as '†, button' … forty-two of
 * them, page-wide, with zero `aria-label`"), surviving one module over, in the
 * surface a writer uses to arrange their window.
 *
 * The strip's own comment anticipated something adjacent and stopped short:
 * *"Each control names itself. The strip is the one place in the application
 * whose buttons are pure glyph, so the only other thing that could identify them
 * is the `title`."* That is a statement that they are **not** named, written as
 * though it were a fix.
 */
export function glyphBtn(
  label: string,
  name: string,
  onClick: (e: Event) => void,
  cls = "",
  data: Record<string, string> = {},
  off = cls.split(/\s+/).includes("disabled"),
): HTMLElement {
  return el(
    "button",
    {
      class: cls,
      title: name,
      // The one line this whole helper exists for.
      "aria-label": name,
      type: "button",
      ...data,
      ...(off ? { disabled: "", "aria-disabled": "true" } : {}),
      onClick: off ? () => {} : onClick,
    },
    // `aria-hidden`, because the button already carries this meaning in its
    // label — otherwise a reader says "dagger, Footnote".
    [el("span", { "aria-hidden": "true" }, [label])],
  );
}

/** One labelled ribbon group: the buttons, plus the caption that names them. */
export function tbGroup(label: string, buttons: Node[]): HTMLElement {
  return el("div", { class: "tb-group", role: "group", "aria-label": label }, [
    el("div", { class: "tb-group-row" }, buttons),
    el("span", { class: "tb-group-label", "aria-hidden": "true" }, [label]),
  ]);
}

/** A labelled row holding one control — settings, modals and the review panel. */
export function fieldRow(label: string, control: Node): HTMLElement {
  return el("label", { class: "set-row" }, [el("span", {}, [label]), control]);
}

export function textField(value = "", placeholder = ""): HTMLInputElement {
  return el("input", { type: "text", value, placeholder }) as HTMLInputElement;
}

export function numberField(value: string, min: number, max: number, step = 1): HTMLInputElement {
  return el("input", { type: "number", value, min, max, step }) as HTMLInputElement;
}

export function checkField(checked = false): HTMLInputElement {
  return el("input", {
    type: "checkbox",
    ...(checked ? { checked: "checked" } : {}),
  }) as HTMLInputElement;
}

/** Hand a blob to the browser as a download. */
export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: name });
  a.click();
  // Revoke on the next tick, not synchronously: Firefox starts the download
  // asynchronously after click(), and revoking the URL in the same turn can abort
  // it before it begins, so nothing is saved.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Escape a string for use inside a double-quoted HTML attribute. */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------- file picking

/** Ask the browser for a file. Resolves to null if the picker was dismissed. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = el("input", { type: "file", accept, style: "display:none" });
    let settled = false;
    const finish = (f: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    // A dismissed picker fires no event in most browsers; releasing on the next
    // window focus keeps the promise from hanging forever.
    window.addEventListener("focus", () => setTimeout(() => finish(null), 800), { once: true });
    document.body.append(input);
    input.click();
  });
}

export function readAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

/** A size a person can read, for the messages that refuse an attachment. */
export function humanSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
