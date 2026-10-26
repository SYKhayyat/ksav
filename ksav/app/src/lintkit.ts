// ---------------------------------------------------------------- lintkit
//
// The glue every source-backed lint re-derived: read the text, ask the backend
// for a scan, and stand down if the document changed while the scan was in
// flight — the writer typed since, and the recorded offsets are a claim about
// a document that is not there.
//
// The glue was verbatim in three lints (deferred-editor, numbering, bracket);
// the audit counted the copies and this file is the count spent. The *models*
// stay in their own files — this owns only the guard.

import { linter, type Diagnostic } from "@codemirror/lint";
import { docTextOf } from "./spans";
import { scanForBackend } from "./scanmemo";
import * as runtime from "./runtime";

/**
 * A CodeMirror linter whose diagnostics come from one backend scan.
 *
 * `build` receives the document text and the scan; it returns the diagnostics.
 * If the document changed while the scan was in flight, the offsets are stale
 * and the answer is nothing — the next keystroke schedules the lint again.
 */
type Scan = Awaited<ReturnType<typeof scanForBackend>>;

export function scanLinter(
  build: (text: string, spans: Scan) => Diagnostic[],
  options?: Parameters<typeof linter>[1],
): ReturnType<typeof linter> {
  return linter(async (view) => {
    const doc = view.state.doc;
    const text = docTextOf(doc);
    const spans = await scanForBackend(runtime.backend, text);
    if (view.state.doc !== doc) return [];
    return build(text, spans);
  }, options);
}
