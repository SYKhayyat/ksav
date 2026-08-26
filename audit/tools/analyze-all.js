const fs = require('fs');
const dir = 'C:/Users/Administrator/Videos/Ksav-audit/out/';
let R = '';
const P = (s) => { R += s + '\n'; };
const read = (f) => fs.readFileSync(dir + f + '.probe.txt', 'utf8');

function sections(f) {
  const t = read(f);
  const idx = [...t.matchAll(/──────── page (\d+) ────────/g)].map(m => [m.index, parseInt(m[1])]);
  const parts = [];
  for (let i = 0; i < idx.length; i++) {
    const end = i + 1 < idx.length ? idx[i + 1][0] : t.length;
    parts.push({ n: idx[i][1], text: t.slice(idx[i][0], end) });
  }
  return parts;
}
function lines(part) {
  return part.text.split('\n').filter(l => l.startsWith('y=')).map(l => {
    const m = l.match(/y=\s*([\d.]+)\s+x=\s*([\d.]+)\s+\[([\d.]+)\]\s?(.*)/);
    return m ? { y: parseFloat(m[1]), x: parseFloat(m[2]), size: parseFloat(m[3]), text: m[4] } : null;
  }).filter(Boolean);
}

// ---- 01 footnote balance: numbering continuity + notes at foot ----
P('===== 01-fn-balance =====');
{
  const parts = sections('01-fn-balance');
  P('pages: ' + parts.length);
  // collect marker digits at end of body runs and note-body first words
  const nums = [];
  for (const p of parts) {
    for (const l of lines(p)) {
      const m = l.text.match(/(\d+)\s*$/); if (m && l.size >= 12) nums.push([p.n, parseInt(m[1])]);
    }
    const footNotes = lines(p).filter(l => l.size < 12 && l.y > 600);
    P(`page ${p.n}: bodyLines=${lines(p).filter(l => l.size >= 12).length} footRuns=${footNotes.length} footY=[${footNotes.map(x => Math.round(x.y)).join(',')}]`);
  }
}
// find the footnote entries (size ~<12) and check each body's first token present
P('note bodies found: ' + ['ראשונה','שנייה','שלישית','פנימית','רביעית','חמישית','שישית','שביעית','שמינית','תשיעית','עשירית'].map(w => w + '=' + (read('01-fn-balance').includes(w) ? 'Y' : 'MISSING')).join(' '));

// ---- 02 sidenote alignment: compare marker-line y vs note-run y ----
P('\n===== 02-sn-align =====');
{
  const parts = sections('02-sn-align');
  P('pages: ' + parts.length);
  for (const p of parts) {
    for (const l of lines(p)) {
      if (/^צד [א-ו]:/.test(l.text)) P(`  note @ y=${l.y.toFixed(1)} x=${l.x.toFixed(1)} sz=${l.size} :: ${l.text.slice(0, 30)}`);
    }
  }
  for (const p of parts) {
    for (const l of lines(p)) {
      if (/מרקר|המילה\.?$|לגמרי/.test(l.text)) { /* marker anchor lines */ }
    }
  }
  // body lines carrying the anchors
  const anchors = ['בראשה', 'בעומק', 'הגמור', 'מהזוג', 'אחרונה'];
  const t = read('02-sn-align');
}

// ---- 03 dense: every note printed? nothing below page number? ----
P('\n===== 03-sn-dense =====');
{
  const t = read('03-sn-dense');
  const parts = sections('03-sn-dense');
  P('pages: ' + parts.length);
  const miss = [];
  for (let i = 1; i <= 18; i++) { const w = 'צד' + String(i).padStart(2, '0'); if (!t.includes(w)) miss.push(w); }
  P('missing tokens: ' + (miss.join(',') || 'none'));
  for (const p of parts) {
    const ls = lines(p);
    const maxNoteY = Math.max(...ls.filter(l => /צד\d\d/.test(l.text)).map(l => l.y), 0);
    P(`page ${p.n}: maxY(note ink)=${maxNoteY.toFixed(1)}  (page number line: ${Math.max(...ls.map(l => l.y)).toFixed(1)})`);
  }
}

// ---- 07 clip mark presence ----
P('\n===== 07a/07b clip mark =====');
for (const f of ['07a-clip-mark', '07b-clip-quiet']) {
  const t = read(f);
  P(`${f}: ellipsis-mark count=${(t.split('…').length - 1)} | tokens 01-40 present: ${['01','10','20','30','40'].map(n => 'מילה' + n + '=' + (t.includes('מילה' + n) ? 'Y' : 'N')).join(' ')}`);
}

// ---- 08 slots: lower-region ink same y on both pages ----
P('\n===== 08-slots =====');
{
  const parts = sections('08-slots');
  P('pages: ' + parts.length);
  for (const p of parts) {
    for (const l of lines(p)) {
      if (/^ת\d/.test(l.text.trim()) || /^ע2/.test(l.text.trim())) P(`page ${p.n}: region entry @ y=${l.y.toFixed(1)} :: ${l.text.slice(0, 24)}`);
    }
  }
}

// ---- 09 no-reserve: does ink leave the sheet? ----
P('\n===== 09-no-reserve =====');
{
  const parts = sections('09-no-reserve');
  P('pages: ' + parts.length);
  for (const p of parts) {
    for (const l of lines(p)) P(`  y=${l.y.toFixed(2)} x=${l.x.toFixed(1)} sz=${l.size} :: ${l.text.slice(0, 40)}`);
  }
  P('(A4 sheet height = 841.89)');
}

// ---- 10 deferred vs inline twin ----
P('\n===== 10a vs 10b coordinate equality =====');
{
  const norm = (f) => lines(...sections(f));
  const A = sections('10a-deferred').flatMap(s => lines(s).map(l => ({ p: s.n, ...l })));
  const B = sections('10b-inline-twin').flatMap(s => lines(s).map(l => ({ p: s.n, ...l })));
  P(`runs: deferred=${A.length} inline=${B.length}`);
  if (A.length === B.length) {
    let diffs = 0;
    for (let i = 0; i < A.length; i++) {
      if (Math.abs(A[i].y - B[i].y) > 0.05 || Math.abs(A[i].x - B[i].x) > 0.05 || A[i].text !== B[i].text || A[i].p !== B[i].p) {
        diffs++; P(`  diff #${i}: p${A[i].p}/y${A[i].y}/x${A[i].x} "${A[i].text.slice(0, 25)}" vs p${B[i].p}/y${B[i].y}/x${B[i].x} "${B[i].text.slice(0, 25)}"`);
      }
    }
    P(diffs === 0 ? 'IDENTICAL layout (all runs same page/x/y/text)' : `${diffs} differences`);
  }
}

// ---- 11 perf: endnote dump really rendered? ----
P('\n===== 11-perf-120 =====');
{
  const t = read('11-perf-120');
  const parts = sections('11-perf-120');
  P('pages: ' + parts.length);
  let bodies = 0;
  for (let i = 1; i <= 40; i++) { if (t.includes('גוף ההערה הראשונה של הפסקה ' + i)) bodies++; if (t.includes('גוף ההערה השנייה של הפסקה ' + i)) bodies++; }
  P(`endnote bodies present in output: ${bodies}/80`);
  const lastPart = parts[parts.length - 1];
  P(`last page ${lastPart.n}: first lines:`);
  for (const l of lines(lastPart).slice(0, 6)) P(`   y=${l.y.toFixed(1)} :: ${l.text.slice(0, 50)}`);
}

fs.writeFileSync(dir + 'analysis.txt', R, 'utf8');
console.log('written', R.length, 'chars');
