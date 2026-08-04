// Which other documents this one needs, to be compiled.
//
// A sefer is chapters, and `#כלול("פרק ג")` names one by its title. The engine
// does the splicing (`engine/src/include.rs`); this side's only job is to work
// out *which* documents to put on the request, and to do it without sending the
// whole library on every keystroke — a writer with forty documents open would
// otherwise pay for all forty on every pause in typing.
//
// Pure, and deliberately: "which parts does this need" is a graph walk with a
// cycle in it waiting to happen, and it is much easier to be sure of that here
// than by opening forty documents and looking.

/** One document as the request carries it. */
export interface Part {
  name: string;
  body: string;
}

/**
 * The names a body includes, directly.
 *
 * Whole lines only, and the regex is the same rule the engine applies — a
 * `#כלול` in the middle of a sentence is prose about the command, not the
 * command. The two implementations have to agree, and the cost of them not
 * agreeing is a chapter that the client never sends and the engine then reports
 * as missing.
 */
export function referenced(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split("\n")) {
    const m = /^\s*#(?:כלול|include_part)\(\s*(?:"([^"]*)"|'([^']*)')\s*\)\s*$/u.exec(line);
    const name = (m?.[1] ?? m?.[2])?.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** How deep to follow the chain. Matches the engine's own cap. */
const MAX_DEPTH = 8;

/**
 * Every document this one needs, following inclusions through inclusions.
 *
 * `lookup` returns a body by title, or null. The `seen` set is what makes a
 * cycle terminate here rather than in the engine: a loop is still *reported* by
 * the engine, which can see the whole picture, but this walk must not hang
 * before the request is even built.
 */
export function collect(
  body: string,
  lookup: (name: string) => string | null,
): Part[] {
  const parts: Part[] = [];
  const seen = new Set<string>();
  const walk = (text: string, depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const name of referenced(text)) {
      if (seen.has(name)) continue;
      seen.add(name);
      const found = lookup(name);
      // A name nothing answers to is *not* dropped from the walk — `seen` still
      // holds it — but nothing is sent for it. The engine reports it, once, with
      // a marker on the page, which is the right place for that message: it is
      // the thing that knows the name could not be resolved.
      if (found === null) continue;
      parts.push({ name, body: found });
      walk(found, depth + 1);
    }
  };
  walk(body, 0);
  return parts;
}
