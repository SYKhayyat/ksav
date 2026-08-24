import fs from "fs";
const prelude = fs.readFileSync("../engine/typst/ksav.typ", "utf8");
const bodies = [...prelude.matchAll(/^#let\s+([^\(\s=]+)[^=]*=\s*(.+(?:\n(?![#let]).*)*)/gmu)].map(m => [m[1], m[2]]);
const order = [];
const produces = new Set();
for (let grew = true; grew;) {
  grew = false;
  for (const [name, body] of bodies) {
    if (produces.has(name)) continue;
    const hit = ["heading", ...produces].find(h => new RegExp(`(?<![A-Za-z0-9֐-׿_])${h}\\(`, "u").test(body));
    if (hit !== undefined) { produces.add(name); order.push(`${name} <- ${hit}`); grew = true; }
  }
}
console.log(order.filter(l => l.startsWith("_cfg_strict") || l.includes("<- _cfg_strict") || /אזור|region |show_region/.test(l)).slice(0,8));