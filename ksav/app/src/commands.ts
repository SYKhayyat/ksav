// What commands does *this document* have?
//
// # One function, because there were two readers of one value
//
// `compile.ts` states the intent and does the right thing:
//
//     runtime.currentDoc?.customCommands ?? settings.customCommands
//
// > *"A document that carries its own custom commands (opened from a file that
// > embedded them) uses those, so a shared sefer compiles for its reader."*
//
// And `main.ts`'s `userCommandNames` read `settings.customCommands` **only**. So
// open a shared sefer and `#` completion offered **your** commands, not the
// document's — and if you happened to have a global `#דגש` meaning something else,
// the editor offered yours while the compiler ran theirs. Two readers of one value,
// disagreeing, in the family this project's sibling repo bans outright.
//
// Worse: `userCommandNames` had exactly **one** caller. The command palette never
// called it at all, so a user-defined command was invisible there in every case —
// yours *and* the document's.
//
// So: one function that answers the question, read by the compiler, the completions
// and the palette. Nothing else may look at `customCommands`.

import type { CommandDef } from "./api";
import * as runtime from "./runtime";
import { settings } from "./settings";

/** One command a writer can type, from wherever it came from. */
export interface Available {
  /** The name as typed after `#`. */
  name: string;
  /** What to insert; `|` marks the caret. */
  insert: string;
  /** Where it came from, because that is worth showing in a palette row. */
  from: "registry" | "document" | "yours";
  /** The bilingual description, for the registry's own. */
  desc_he?: string;
  desc_en?: string;
  /** The English alias, for the registry's own. */
  en?: string;
  /** The registry's category key, for the palette's group chip. */
  category?: string;
}

/** A `#let` preamble, and whose it is. */
export interface Preamble {
  text: string;
  from: "document" | "yours";
}

/**
 * The `#let` preamble in force for the open document.
 *
 * The document's own if it carries any, otherwise the app-wide set. **The one
 * impure function here, and the only place `customCommands` is read** — everything
 * else takes a `Preamble`, which is what makes it testable without an editor and
 * what stops a second reader of this value appearing again.
 */
export function preambleInForce(): Preamble {
  const own = runtime.currentDoc?.customCommands;
  if (own?.trim()) return { text: own, from: "document" };
  return { text: settings.customCommands ?? "", from: "yours" };
}

/**
 * The names a `#let` preamble defines.
 *
 * Both `#let` and a bare `let`, because a preamble is prepended to the document and
 * a writer reasonably writes either. Hebrew letters are in the identifier class,
 * which is the whole point of the language.
 */
export function definedIn(preamble: string): string[] {
  return [...preamble.matchAll(/#?let\s+([A-Za-z֐-׿_][\w֐-׿]*)/gu)].map((m) => m[1]);
}

/** The writer's own commands, from a preamble and where it came from. */
export function ownCommands(own: Preamble = preambleInForce()): Available[] {
  const { text, from } = own;
  return definedIn(text).map((name) => ({
    name,
    // `#name[|]` is the shape every command in the registry has, so a
    // user-defined one behaves the same way when it is picked.
    insert: `#${name}[|]`,
    from,
  }));
}

/**
 * Everything a writer can type, registry first.
 *
 * Registry first because those are the 115 that are documented and always there;
 * the writer's own come after, and say where they came from.
 *
 * **Memoised on its inputs.** This is pure over the registry and the preamble,
 * and the palette asked for it once per character typed — a fresh registry
 * mapping and a preamble regex scan every keystroke for an answer that changes
 * only when the preamble does. One cached answer; a preamble edit or a
 * different document misses it.
 */
let availableCache: {
  reg: readonly CommandDef[];
  text: string;
  from: string;
  out: Available[];
} | null = null;

export function available(
  registry: readonly CommandDef[],
  preamble: Preamble = preambleInForce(),
): Available[] {
  if (
    availableCache &&
    availableCache.reg === registry &&
    availableCache.text === preamble.text &&
    availableCache.from === preamble.from
  ) {
    return availableCache.out;
  }
  // Deprecated commands drop out here, which removes them from the palette and
  // the `#` completion in one place. They still compile — they are in documents
  // — they are simply no longer *offered*, which is the distinction between
  // breaking somebody's sefer and no longer pointing a new writer at the wrong
  // thing. See `CommandDef.deprecated`.
  const out: Available[] = registry
    .filter((c) => !c.deprecated)
    .map((c) => ({
    name: c.he,
    insert: c.insert,
    from: "registry",
    desc_he: c.desc_he,
    desc_en: c.desc_en,
    en: c.en,
    category: c.category,
  }));

  // A user-defined command that shadows a registry name is the writer's, and it is
  // the one the compiler will run — so it replaces rather than duplicating.
  for (const own of ownCommands(preamble)) {
    const at = out.findIndex((c) => c.name === own.name);
    if (at >= 0) out[at] = { ...out[at], ...own };
    else out.push(own);
  }
  availableCache = { reg: registry, text: preamble.text, from: preamble.from, out };
  return out;
}

/** Whether a query matches a command, over every field a writer might recall. */
export function matches(command: Available, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    command.name.toLowerCase().includes(q) ||
    (command.en ?? "").toLowerCase().includes(q) ||
    (command.desc_he ?? "").includes(q) ||
    (command.desc_en ?? "").toLowerCase().includes(q)
  );
}
