// When something throws that nobody caught.
//
// typstify has `ui/crash_report.go`: recover from the panic, show the stack,
// offer a restart. The shape is right and the priority is not — for a Go
// desktop editor the stack is the point, and for a writing tool it is a distant
// second to **the text**. A bochur who has just lost an evening of writing does
// not want a stack trace; he wants his words.
//
// So this does three things, strictly in this order:
//
//   1. Put the document somewhere it will survive, synchronously, before
//      anything else is attempted. `localStorage.setItem` is the only write in
//      the browser that completes before the next line runs — IndexedDB is
//      asynchronous, and an app that is already in an unknown state may not live
//      long enough to see the transaction commit.
//   2. Offer it as a download, one click, no questions.
//   3. Show what happened, for the bug report.
//
// The panel appears once. A broken render loop can throw sixty times a second,
// and a crash reporter that stacks sixty dialogs is a second crash.

const RECOVERY_KEY = "ksav.recovery";

export interface Recovery {
  /** When it was rescued, so a stale one can be recognised. */
  at: number;
  /** The document's title, for the offer to say which document it is. */
  title: string;
  body: string;
  /**
   * Which document it was, so the next session can ask whether the rescue is
   * worth anything.
   *
   * Without this the offer could only compare the rescued text against the
   * document that happened to be open when the app started, and the crash's
   * document is very often not that one. The reported symptom is exactly what
   * that produces: a crash notice on opening a document that then loads
   * perfectly, because autosave had already written the text and nothing here
   * was in a position to know.
   */
  id?: string;
}

/** Stash the text where a reload can find it. Synchronous, on purpose. */
export function stash(title: string, body: string, id?: string): boolean {
  if (!body) return false;
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ at: Date.now(), title, body, id }));
    return true;
  } catch {
    // Quota, or a private window. The download offer below is the fallback, and
    // it is the reason this is not the only rescue.
    return false;
  }
}

/** A rescued document from a previous session, if there is one. */
export function recovery(): Recovery | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Recovery;
    return typeof value?.body === "string" && value.body ? value : null;
  } catch {
    return null;
  }
}

/**
 * Whether a rescue is worth putting in front of a writer.
 *
 * It is not, if the text it holds is already somewhere they can reach — and
 * that is the usual case, because autosave nearly always won the race with the
 * crash. Offering it anyway is the reported *"crash notice on opening a
 * document which then loads correctly"*: a true notice about a real crash,
 * about text that was never in danger, arriving on every launch until somebody
 * accepted a duplicate document to make it stop.
 *
 * `known` is whatever copies the caller can cheaply lay hands on — the open
 * document, and the document the rescue names. Not the whole library: reading
 * every document out of storage on boot to answer this would cost more than
 * the question is worth, and the two that matter cover it.
 */
export function worthOffering(r: Recovery | null, known: (string | null | undefined)[]): boolean {
  const text = r?.body.trim();
  if (!text) return false;
  return !known.some((k) => (k ?? "").trim() === text);
}

export function clearRecovery(): void {
  try {
    localStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Nothing to do, and nothing lost: a leftover recovery offer is harmless.
  }
}

/**
 * A one-line description of what went wrong, and the detail beneath it.
 *
 * Kept apart because they go to different places: the sentence goes on screen
 * where a writer reads it, the detail goes into a `<pre>` they can copy into an
 * issue. Gluing the two together is the mistake `sources.test.mjs` exists to
 * prevent, and a crash panel is the most tempting place to make it.
 */
export function describe(error: unknown): { said: string; detail: string } {
  if (error instanceof Error) {
    return { said: error.message || error.name, detail: error.stack ?? String(error) };
  }
  if (typeof error === "string") return { said: error, detail: error };
  try {
    return { said: String(error), detail: JSON.stringify(error, null, 2) };
  } catch {
    return { said: "unknown error", detail: "unknown error" };
  }
}

type Reporter = (error: unknown, detail: string) => void;

let reported = false;

/**
 * Catch what nobody else did.
 *
 * `text()` is called at the moment of the crash rather than held onto, because
 * the whole point is to rescue what is in the editor *now*. It must not throw:
 * a crash handler that crashes is how an application stops being able to tell
 * anybody anything.
 */
export function install(
  text: () => { title: string; body: string; id?: string },
  show: Reporter,
): () => void {
  const handle = (error: unknown) => {
    if (reported) return;
    reported = true;
    try {
      const { title, body, id } = text();
      stash(title, body, id);
    } catch {
      // Even the rescue failed. Still show the panel — the writer at least
      // learns that something is wrong before they type another paragraph into
      // an editor that is not saving it.
    }
    const { detail } = describe(error);
    try {
      show(error, detail);
    } catch {
      // Last resort. If the panel itself cannot be drawn there is nothing left
      // to do in-process, and the stash above already happened.
    }
  };

  const onError = (e: ErrorEvent) => handle(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => handle(e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/** Reset, for tests. */
export function _resetReported(): void {
  reported = false;
}
