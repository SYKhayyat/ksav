import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const DIST="/home/shaul/ksav/ksav/app/dist";
const T={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".svg":"image/svg+xml",".png":"image/png",".woff2":"font/woff2"};
const srv=createServer(async(rq,rs)=>{const p=normalize(decodeURIComponent(new URL(rq.url,"http://x").pathname));
 for(const f of [join(DIST,p),join(DIST,"index.html")]){try{const b=await readFile(f);rs.writeHead(200,{"content-type":T[extname(f)]??"application/octet-stream"});return rs.end(b);}catch{}}
 rs.writeHead(404);rs.end();});
await new Promise(d=>srv.listen(0,"127.0.0.1",d));
const b=await chromium.launch({headless:true,args:["--no-sandbox","--disable-gpu"]});
const pg=await b.newPage();
await pg.goto(`http://127.0.0.1:${srv.address().port}/`,{waitUntil:"networkidle"});
await pg.waitForTimeout(2500);
await pg.getByLabel("שפה").click(); await pg.waitForTimeout(1400);
console.log(JSON.stringify(await pg.evaluate(()=>{
  const WANT=["כתב עברי","ברוכים הבאים"];
  const out=[];
  for(const e of document.querySelectorAll("*")){
    if(![...e.children].some(c=>c.textContent===e.textContent)){
      const own=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(" ").trim();
      if(!own || !WANT.some(w=>own.includes(w))) continue;
      const chain=[]; let n=e;
      for(let i=0;i<5&&n;i++){ chain.push(n.tagName+(n.className?("."+String(n.className).split(" ").filter(Boolean).slice(0,2).join(".")):"")); n=n.parentElement; }
      out.push({text:own.slice(0,28), chain:chain.join(" < "), attrs:[...e.attributes].map(a=>a.name).join(",")});
    } }
  return out;
}),null,1));
await b.close(); srv.close();
