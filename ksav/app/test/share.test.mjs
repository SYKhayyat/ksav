// A document that travels inside its own link.
//
// Two properties matter and nothing else does: what goes in comes out, and what
// is not a Ksav link never blows up. The second is the one that would actually
// hurt — a link pasted into WhatsApp and wrapped at some width nobody controls
// arrives truncated, and an app that throws on that shows a blank page to
// somebody who was trying to read a sefer.

import { check, ok, notOk } from "./harness.mjs";
import { encodeShare, decodeShare, shareLink, TOO_LONG } from "../.tmp-test/share.mjs";
import { APP, SRC } from "../tools/paths.mjs";

export function run() {
  return (async () => {
    // ------------------------------------------------------------ round trip
    {
      const doc = { title: "קונטרס הביאורים", body: "בראשית ברא #הערה[עיין רש״י]", dir: "rtl" };
      const back = await decodeShare("#" + (await encodeShare(doc)));
      check("the title survives", back.title, doc.title);
      check("the body survives", back.body, doc.body);
      check("the direction survives", back.dir, doc.dir);
      notOk("and a read link is not a review link", back.review);
    }
    {
      const back = await decodeShare("#" + (await encodeShare({ title: "x", body: "y", review: true })));
      ok("a review link says so", back.review);
    }
    {
      // Every character that would be mangled by a naive encoding: markup, both
      // gershayim, nikud, an emoji outside the basic plane, and a newline.
      const body = 'שָׁלוֹם ״עולם״ #הערה[a]b] $x$ 🕎\n\nשורה שניה\tטאב';
      const back = await decodeShare("#" + (await encodeShare({ title: "", body })));
      check("awkward characters survive intact", back.body, body);
    }
    {
      // The URL-safe alphabet has to be used *and* reversed. Plain base64's `+`
      // and `/` would be re-interpreted by whatever the link passes through.
      const fragment = await encodeShare({ title: "t", body: "ב".repeat(500) });
      ok("the fragment is URL-safe", /^ksav=[A-Za-z0-9_-]+$/.test(fragment));
    }

    // ------------------------------------------------------- what is not a link
    check("plain text is not a link", await decodeShare("#hello"), null);
    check("an empty fragment is not a link", await decodeShare(""), null);
    check("a bare hash is not a link", await decodeShare("#"), null);
    check("someone else's fragment is not a link", await decodeShare("#section-3"), null);
    // A truncated link — the realistic failure, and the one that must not throw.
    {
      const fragment = await encodeShare({ title: "t", body: "בראשית ברא אלקים ".repeat(50) });
      const cut = fragment.slice(0, Math.floor(fragment.length * 0.6));
      check("a truncated link decodes to nothing rather than throwing", await decodeShare("#" + cut), null);
    }
    check("valid base64 that is not ours is nothing", await decodeShare("#ksav=aGVsbG8"), null);

    // ------------------------------------------------------------ compression
    //
    // Not a nicety. Ksav markup repeats itself constantly and Hebrew is three
    // bytes a character in UTF-8, so without deflate a chapter would not fit in
    // a link at all.
    {
      const body = "#הערה[עיין שם]\n".repeat(400);
      const fragment = await encodeShare({ title: "", body });
      ok(
        `repetitive markup compresses hard (${fragment.length} for ${body.length})`,
        fragment.length < body.length / 4,
      );
    }

    // ------------------------------------------------------------- the link
    {
      const link = await shareLink("https://ksav.app/", { title: "t", body: "שלום" });
      ok("the link is absolute", link.url.startsWith("https://ksav.app/#ksav="));
      notOk("a short one is not too long", link.tooLong);
      // A link made from a page that was itself opened from a link must not
      // accumulate fragments.
      const again = await shareLink(link.url, { title: "t", body: "שלום" });
      check("fragments do not accumulate", (again.url.match(/#/g) || []).length, 1);
      check("…and it round-trips from there", (await decodeShare("#" + again.url.split("#")[1])).body, "שלום");
    }
    {
      // Past the limit it says so rather than handing over a link that will
      // arrive truncated and decode to garbage.
      // Incompressible on purpose. A repeated string would deflate to nothing
      // and never reach the limit, so the test would pass by never testing it —
      // and `getRandomValues` refuses anything over 64 KB, which is less than
      // this needs.
      // Genuinely random, in 32 KB chunks — `getRandomValues` refuses more than
      // 64 KB at a time. A pseudo-random generator was tried first and deflate
      // saw straight through it, compressing 300,000 characters to 19,000 and
      // quietly not testing the limit at all.
      let noise = "";
      const chunk = new Uint8Array(32_768);
      while (noise.length < 160_000) {
        crypto.getRandomValues(chunk);
        for (const b of chunk) noise += String.fromCharCode(32 + (b % 95));
      }
      const huge = { title: "t", body: noise };
      const link = await shareLink("https://example.invalid/", huge);
      ok(`an enormous document is refused (${link.length} chars)`, link.tooLong);
      ok("…and the limit is the stated one", link.length > TOO_LONG);
    }

    // -------------------------------------------------- and a base that exists
    //
    // This module was never the problem: it takes the base as an argument
    // precisely so it cannot invent one. Its caller invented one. `main.ts`
    // read `"https://ksav.app/"` for every desktop and `file:` build — a domain
    // with no deploy job, no workflow and no mention anywhere else in this
    // repository — and reported "Link copied" over it.
    //
    // The base now comes from `__PUBLIC_BASE__`, which `deploy.yml` sets to the
    // URL it actually published to, and an empty one is a refusal rather than a
    // guess. These are the assertions that stop a literal creeping back: a host
    // named in source is not checkable by anything else, which is exactly how
    // the last one survived.
    {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const main = await readFile(join(SRC, "main.ts"), "utf8");
      const shareFn = main.slice(main.indexOf("async function copyShareLink"));
      const body = shareFn.slice(0, shareFn.indexOf("\n}\n"));
      check(
        "the share link names no host of its own",
        /(?<!\/\/[^\n]*)https?:\/\/[a-z]/.test(body.replace(/^\s*\/\/.*$/gm, "")),
        false,
      );
      ok("it reads the base the build was published to", body.includes("__PUBLIC_BASE__"));
      ok("and refuses when there is not one", body.includes("shareNoHost"));

      // The other half: a build with no host must still be buildable, so the
      // constant has to be defined unconditionally rather than only in CI.
      const vite = await readFile(join(APP, "vite.config.ts"), "utf8");
      ok("the build always defines it", vite.includes("__PUBLIC_BASE__"));
      ok("it comes from the environment", vite.includes("VITE_PUBLIC_BASE"));
      // And it is the *same* value the assets are built against, or a link can
      // point at a copy of the app that is not there.
      ok("the asset base is derived from it", vite.includes("new URL(publicBase).pathname"));
    }
  })();
}
