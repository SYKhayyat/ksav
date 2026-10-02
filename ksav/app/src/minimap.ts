// #89 — a minimap, opened rather than permanent.
//
// The *how much* beside the ruler's *where*: that a chapter went from three pages to
// forty, that the apparatus is now longer than the text it annotates, that the body of
// a sefer is all in the first third.
//
// # What it costs, and the answer I did not expect
//
// I filed this believing it needed a **second `EditorView`** over the same document,
// because `@replit/codemirror-minimap`'s own README builds one, and because a second
// view is the obvious way to put an editor-shaped thing in a panel. That would have
// meant a third editor per open document — this application already has two, via
// `makePaneView` and the mirror to every other source pane — and `scan()` is the
// expensive thing here.
//
// It does not. The package is a `ViewPlugin` that draws on a **canvas** and appends a
// container into the gutter of whatever view it is given; there is no `new EditorView`
// anywhere in it. So it goes in the **main** editor's extensions and there is no second
// copy of the document, ever — not when open, and certainly not when closed.
//
// Which answers the question that was asked, and better than I answered it: *"the
// minimap only exists and does this if it is open, so there is no loss, right?"* —
// **not quite, when open**, and it turns out not to need asking, because the cost while
// open is a canvas the size of a strip and a redraw per change rather than another
// parse of the sefer.
//
// # Two answers, taken as given
//
// **Shape by default, colours on request.** `displayText: "blocks"` is plain shape and
// `gutters` paints lines by mark type — so the setting is the package's own option
// rather than a reimplementation of it. The ruler keeps the six mark kinds it already
// carries; the minimap's job here is *how much*, and the ruler's is *where*.
//
// **Dockable or floating, and draggable.** The panel registry already decides whether a
// surface floats or sits in a pane (`settings.panelPlacement`), and the panel carries
// its own `×`, so this inherits both rather than growing a second mechanism.

import { showMinimap, type MinimapConfig } from "@replit/codemirror-minimap";
import { StateEffect, StateField } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";

/** What the writer chooses. `null` in `showMinimap` is what "closed" means. */
export interface MinimapOptions {
  on: boolean;
  /**
   * Paint problems and spellings, or leave the shape plain.
   *
   * Off by default, and the reason is the ruler's: a strip of ticks cannot become a
   * picture of the document without becoming a different thing, and the *where* of a
   * mark is already the ruler's job. Turning it on is one line of markup and no new
   * producer — every producer already knows its line numbers.
   */
  colors: boolean;
}

/**
 * Colours for the marks, keyed the way the editor keys its own.
 *
 * Deliberately **not** reading the six ruler kinds: a second producer list beside
 * `ruler.ts` is a list free to disagree with it, and this one would agree with the
 * ruler only on the day it was written. Where the two overlap, the ruler wins by
 * virtue of being the one that scrolls you there.
 */
const GUTTERS = [{ 1: "#c62828", 2: "#ef6c00" }];

/**
 * The extension. `read` is called per configuration, so toggling the setting
 * reconfigures rather than needing the view rebuilt.
 *
 * `create` returns an empty container — the package fills it — and CodeMirror puts it
 * in the editor's own gutter, which is the whole reason there is no second editor
 * anywhere in this file.
 */
/**
 * The options, **on the state**.
 *
 * `compute` takes slots — references to state — not closures, so the values have to
 * live somewhere the state can see. And they cannot be read in the field's `create`:
 * that runs inside `EditorState.create`, which for this application runs inside
 * `new EditorView` at module scope, so `read()` would hit the same temporal dead
 * zone that silently deleted the #84 plugin and CodeMirror reported nothing. Hence a
 * field defaulting to **off**, filled one frame later by the plugin below.
 */
const setMinimap = StateEffect.define<MinimapOptions>();

const minimapOptions = StateField.define<MinimapOptions>({
  create: () => ({ on: false, colors: false }),
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setMinimap)) return e.value;
    return v;
  },
});

/** A closed minimap is `null` to the facet, which is how it costs nothing. */
export function configFor(opts: MinimapOptions): MinimapConfig | null {
  if (!opts.on) return null;
  const config: MinimapConfig = {
    create: () => ({ dom: document.createElement("div") }),
    // `blocks` is shape; `characters` is the actual text, which at this width is
    // unreadable and is not what "shows everything in small" asked for.
    displayText: "blocks",
    showOverlay: "always",
  };
  if (opts.colors) config.gutters = GUTTERS;
  return config;
}

export function minimapExtension(read: () => MinimapOptions): Extension {
  return [
    minimapOptions,
    showMinimap.compute([minimapOptions], (state) => configFor(state.field(minimapOptions))),
    ViewPlugin.fromClass(
      class {
        constructor(view: EditorView) {
          // One frame later, for #84's reason: see the note on the field above.
          requestAnimationFrame(() => this.push(view));
        }
        push(view: EditorView) {
          const now = read();
          const cur = view.state.field(minimapOptions, false);
          if (cur && cur.on === now.on && cur.colors === now.colors) return;
          view.dispatch({ effects: setMinimap.of(now) });
        }
        update(u: ViewUpdate) {
          // Never dispatch from `update` — CodeMirror is mid-update and says so.
          requestAnimationFrame(() => this.push(u.view));
        }
      },
      {},
    ),
  ];
}
