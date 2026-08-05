import { check, ok, notOk } from "./harness.mjs";
import { unrendered, addDump } from "../.tmp-test/apparatus.mjs";

// Notes collected and never rendered — the quietest failure in the product.
// The document compiles, the page looks finished, and the prose is gone.

export async function run() {

// ---------------------------------------------------------------- endnotes

{
  const d = "בראשית#הערתסיום[עיין שם] ברא.\n";
  const p = unrendered(d);
  check("an endnote with no dump is reported", p.length, 1);
  check("with the call that would fix it", p[0].fix, "#הערות_בסוף()");
  check("and the stream it collects into", p[0].stream, "הערות");
}

{
  const d = "בראשית#הערתסיום[עיין שם] ברא.\n\n#הערות_בסוף()\n";
  check("a dump after it satisfies it", unrendered(d).length, 0);
}

{
  // Order matters: a dump renders what came *before* it.
  const d = "#הערות_בסוף()\n\nבראשית#הערתסיום[עיין שם] ברא.\n";
  check("a dump before it does not", unrendered(d).length, 1);
}

{
  // Several sections, one dump each — the arrangement the chooser suggests.
  const d =
    "פרק א#הערתסיום[א] סוף.\n\n#הערות_בסוף()\n\nפרק ב#הערתסיום[ב] סוף.\n\n#הערות_בסוף()\n";
  check("every note has a dump after it", unrendered(d).length, 0);
}

// ---------------------------------------------------------------- streams

{
  const d = 'ראש#הערתסיום(זרם: "מקורות")[רש״י] סוף.\n\n#הערות_בסוף()\n';
  check("a dump of a different stream does not cover it", unrendered(d).length, 1);
  check("and the fix names the stream", addDump(d, unrendered(d)[0]).text.includes('זרם: "מקורות"'), true);
}

{
  const d = 'ראש#הערתסיום(זרם: "מקורות")[רש״י] סוף.\n\n#הערות_בסוף(זרם: "מקורות")\n';
  check("the matching stream covers it", unrendered(d).length, 0);
}

{
  const d =
    'ראש#הערתסיום(זרם: "מקורות")[רש״י] סוף.\n\n#הערות_בסוף_צד(זרמים: ("הערות", "מקורות"))\n';
  check("a side-by-side dump listing the stream covers it", unrendered(d).length, 0);
}

// ---------------------------------------------------------------- bands

{
  const d = "ראש#מדור_א[פירוש] סוף.\n";
  const p = unrendered(d);
  check("a band with no dump is reported", p.length, 1);
  check("with its own fix", p[0].fix, "#הערות_מדורגות()");
  check("bands have no stream", p[0].stream, undefined);
}

{
  const d = "ראש#מדור_א[פירוש]#מדור_ב[הערה] סוף.\n\n#הערות_מדורגות()\n";
  check("one dump covers every tier", unrendered(d).length, 0);
}

// ---------------------------------------------------------------- what is not a problem

{
  // The five that render on their own — verified by rendering, not assumed.
  for (const cmd of ["מדף_א", "הערת_גיליון", "הערת_ימין", "הערת_תוכן", "הערת_מקור"]) {
    check(`#${cmd} needs no dump`, unrendered(`ראש#${cmd}[טקסט] סוף.\n`).length, 0);
  }
}

{
  check("a plain footnote is not a problem", unrendered("ראש#הערה[טקסט] סוף.\n").length, 0);
  check("an empty document is not a problem", unrendered("").length, 0);
}

{
  // A command inside a comment is not a command.
  check("line comment", unrendered("// #הערתסיום[טקסט]\n").length, 0);
  check("block comment", unrendered("/* #הערתסיום[טקסט] */\n").length, 0);
}

{
  // A longer name that merely begins with a collector's name.
  check("no false match on a longer name", unrendered("ראש#הערתסיוםX[טקסט]\n").length, 0);
}

// ---------------------------------------------------------------- English

{
  const d = "Text#endnote[see there] here.\n";
  check("English collectors are found too", unrendered(d).length, 1);
  const d2 = "Text#endnote[see there] here.\n\n#endnotes()\n";
  check("and English dumps satisfy them", unrendered(d2).length, 0);
}

// ---------------------------------------------------------------- the fix

{
  const d = "בראשית#הערתסיום[עיין שם] ברא.\n";
  const r = addDump(d, unrendered(d)[0]);
  ok("the fix writes the dump call", r.text.includes("#הערות_בסוף()"));
  check("and the document is clean afterwards", unrendered(r.text).length, 0);
  ok("the writer's text is untouched", r.text.includes("בראשית#הערתסיום[עיין שם] ברא."));
  notOk("no blank-line pile-up", /\n{3,}/.test(r.text));
}

}
