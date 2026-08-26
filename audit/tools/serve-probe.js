const BASE = 'http://127.0.0.1:7899';
let R = '';
const P = (s) => { R += s + '\n'; };

async function req(method, path, body, ctype) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.body = body;
    opts.headers['Content-Type'] = ctype || 'application/json';
  }
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + path, opts);
    const txt = await r.text();
    return { status: r.status, ms: Date.now() - t0, len: txt.length, head: txt.slice(0, 220).replace(/\s+/g, ' ') };
  } catch (e) {
    return { status: 'ERR', ms: Date.now() - t0, err: String(e).slice(0, 120) };
  }
}

(async () => {
  // registry endpoints
  let r = await req('GET', '/commands');
  let n = 0;
  try { n = JSON.parse((await (await fetch(BASE + '/commands')).text())).commands.length; } catch (e) {}
  P(`GET /commands -> ${r.status} ${r.ms}ms len=${r.len} commands=${n}`);
  r = await req('GET', '/templates');
  P(`GET /templates -> ${r.status} ${r.ms}ms len=${r.len} head=${r.head.slice(0, 80)}`);
  r = await req('GET', '/nope');
  P(`GET /nope -> ${r.status} ${r.ms}ms head=${String(r.head).slice(0, 80)}`);
  r = await req('GET', '/');
  P(`GET / -> ${r.status} ${r.ms}ms len=${r.len}`);

  // compile endpoint variants
  for (const [label, body] of [
    ['empty-object', '{}'],
    ['body-empty-string', '{"body":""}'],
    ['body-wrong-type', '{"body":123}'],
    ['not-json', 'hello'],
    ['unknown-fields', '{"body":"שלום","fontX":"Nope","paperX":"zz"}'],
  ]) {
    r = await req('POST', '/compile', body);
    P(`POST /compile ${label} -> ${r.status} ${r.ms}ms len=${r.len} head=${String(r.head).slice(0, 110)}`);
  }
  // big body ~5MB
  const big = '#מסמך[' + 'מילה '.repeat(900000) + ']';
  r = await req('POST', '/compile', JSON.stringify({ body: big }));
  P(`POST /compile 4.7MB-body -> ${r.status} ${r.ms}ms len=${r.len}`);
  // spell malformed (E2#3 confirmation)
  r = await req('POST', '/spell', 'garbage-not-json');
  P(`POST /spell garbage -> ${r.status} ${r.ms}ms head=${String(r.head).slice(0, 140)}`);
  r = await req('POST', '/spell', '{"txet":"wrong field"}');
  P(`POST /spell wrong-field -> ${r.status} ${r.ms}ms head=${String(r.head).slice(0, 140)}`);
  r = await req('POST', '/spell', '{"text":"שלום שלום שלומ"}');
  P(`POST /spell valid -> ${r.status} ${r.ms}ms head=${String(r.head).slice(0, 200)}`);
  // mekoros malformed for contrast (registry claims loud refusal)
  r = await req('POST', '/mekoros', 'garbage');
  P(`POST /mekoros garbage -> ${r.status} ${r.ms}ms head=${String(r.head).slice(0, 160)}`);
  // girsa inbox with nothing running
  r = await req('GET', '/inbox');
  P(`GET /inbox -> ${r.status} ${r.ms}ms head=${String(r.head).slice(0, 100)}`);
  fs.writeFileSync('C:/Users/Administrator/Videos/Ksav-audit/fuzzout/serve-probes.txt', R, 'utf8');
  console.log('done');
})().catch(e => { console.error('FATAL', e); });
const fs = require('fs');
