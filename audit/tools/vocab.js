const fs = require('fs');
const t = fs.readFileSync('C:/Users/Administrator/Videos/Ksav/ksav/engine/typst/ksav.typ', 'utf8').split('\n');
let R = '';
// 1. page-break family
t.forEach((l, i) => { if (/#let\s+(מעבר|פסק)[\S]*\(/.test(l)) R += 'BREAK ' + (i + 1) + ': ' + l.trim().slice(0, 90) + '\n'; });
// 2. region keys / placements: find _rg_own and placement vocabulary lines
t.forEach((l, i) => { if (/מיקום/.test(l) && /(רגל|סוף|צד|ראש|על)/.test(l)) R += 'PLACE ' + (i + 1) + ': ' + l.trim().slice(0, 130) + '\n'; });
fs.writeFileSync('C:/Users/Administrator/Videos/Ksav-audit/out/vocab.txt', R, 'utf8');
console.log('lines:', R.split('\n').length);
