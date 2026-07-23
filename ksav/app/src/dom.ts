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
    if (k === "class") n.className = v as string;
    else if (k === "style") n.setAttribute("style", v as string);
    else if (k.startsWith("on") && typeof v === "function")
      n.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v != null) n.setAttribute(k, String(v));
  }
  for (const c of children) n.append(c);
  return n;
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
export function iconBtn(label: string, title: string, onClick: () => void, cls = ""): HTMLElement {
  return el(
    "button",
    { class: `tb-btn ${cls}`, title, "aria-label": title, type: "button", onClick },
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
  URL.revokeObjectURL(url);
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
