const fs = require('fs');
const dir = 'C:/Users/Administrator/Videos/Ksav-audit/fuzz/';
fs.mkdirSync(dir, { recursive: true });
const W = (name, buf) => fs.writeFileSync(dir + name, buf);
W('f01-empty.ksav', '');
W('f02-bom.ksav', Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('#מסמך[שלום עולם]', 'utf8')]));
W('f03-json-trunc.ksav', Buffer.from('{"format": "ksav-document", "body": "abc'));
W('f04-wrongmagic.ksav', Buffer.from('{"format": "nope", "body": "abc"}'));
W('f05-prose-brace.ksav', Buffer.from('{ just prose, not json'));
W('f06-huge-line.ksav', Buffer.from('x'.repeat(2 * 1024 * 1024)));
let deep = '#מסמך[';
for (let i = 0; i < 200; i++) deep += '#הערה[';
deep += 'תוכן';
for (let i = 0; i < 200; i++) deep += ']';
deep += ']\n';
W('f07-deep-nest.ksav', Buffer.from(deep, 'utf8'));
W('f08-binary.ksav', Buffer.from([0x00, 0xFF, 0xFE, 0x00, 0x80, 0xC3, 0x28, 0xE2, 0x82, 0xAC, 0xED, 0xA0, 0x80]));
W('f09-nulbytes.ksav', Buffer.concat([Buffer.from('#מסמך[שלום', 'utf8'), Buffer.from([0x00, 0x00]), Buffer.from(' עולם]', 'utf8')]));
W('f10-crlf.ksav', Buffer.from('#מסמך[שלום\r\nעוד שורה\r\n]', 'utf8'));
W('f11-unclosed.ksav', Buffer.from('#מסמך[never closed and going on and on', 'utf8'));
W('f12-unknown-cmd.ksav', Buffer.from('text #לא_קיים[ב] more', 'utf8'));
W('f13-bad-region-ref.ksav', Buffer.from('טקסט#הערה(אזור: "לא_מוגדר")[ביאור] סוף.', 'utf8'));
// T2#2: note into a DECLARED side-placed-at-foot region, no explicit reserve, אזור: spelling only
W('r01-region-note-noreserve.ksav', Buffer.from('#מסמך[\n#אזור("ב", מיקום: "רגל", גובה: 2cm)\nפתיחה לגוף.\n\nטקסט ראשון#הערה(אזור: "ב")[ביאור אחד ובו כמה מילים.] סוף.\n]', 'utf8'));
// T2#1: channel+region together on one note, region dumped at סוף
W('r02-chan-plus-region.ksav', Buffer.from('#מסמך[\n#אזור("R", מיקום: "סוף")\n#ערוץ("C")\nפתיחה לגוף.\n\nטקסט#הערה(ערוץ: "C", אזור: "R")[הביאור שחייב להופיע איפשהו בעולם.] סוף.\n\n#הצג_אזור("R")\n]', 'utf8'));
console.log('written', fs.readdirSync(dir).length, 'files');
