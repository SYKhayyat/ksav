// The fallback editor's script, in its own file rather than inline.
//
// It was an inline `<script>`, and that single fact bought a hole in the live
// security policy: `script-src 'self'` blocks inline script, so `serve_static`
// answered this page with **no** `Content-Security-Policy` header at all — the
// one response the engine emitted with no policy on it, in the one build that
// serves documents somebody else wrote.
//
// The carve-out was never about this editor being unimportant. It was about a
// `<script>` tag being in the wrong place. Moved out, `'self'` covers it, and
// the policy is now attached to every HTML response without exception. The
// inline `<style>` stays: the policy already allows `'unsafe-inline'` for
// styles, deliberately and for the built app too.

const STARTER = `#שער[ברוכים הבאים לכְּתָב]
#תת_שער[כתיבה עברית על גבי Typst אמיתי]

#קו_מפריד

#כותרת1[מבוא]

זהו עורך #הדגשה[כְּתָב]. כל פקודה כאן היא פונקציית Typst אמיתית, ולכן #נטוי[הקינון בלתי מוגבל] עובד מאליו.

#רשימה(
  פריט[פריט פשוט.],
  פריט[פריט עם הערת שוליים#הערה[הערה יכולה להכיל רשימות, טבלאות וכותרות.]],
)

#כותרת2[טבלה]

#טבלה(
  עמודות: 2,
  כותרת_תא[מונח], כותרת_תא[פירוש],
  תא[קינון], תא[מבנה בתוך מבנה],
)
`;

const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const statusEl = document.getElementById('status');
const diagEl = document.getElementById('diagnostics');
const fontEl = document.getElementById('font');
const sizeEl = document.getElementById('size');
const marginEl = document.getElementById('margin');
let lastPdfB64 = null;

editor.value = STARTER;

function cfg() {
  return {
    body: editor.value,
    font: fontEl.value,
    size_pt: parseFloat(sizeEl.value) || 12,
    margin_cm: parseFloat(marginEl.value) || 2.5,
    dir: "rtl",
  };
}

let timer = null;
function scheduleCompile() {
  clearTimeout(timer);
  timer = setTimeout(runCompile, 200);
}

async function runCompile() {
  statusEl.textContent = 'מרנדר…'; statusEl.className = '';
  const t0 = performance.now();
  try {
    const res = await fetch('/compile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg()),
    });
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);
    lastPdfB64 = data.pdf_base64 || null;

    if (data.pages_svg && data.pages_svg.length) {
      preview.innerHTML = data.pages_svg.map(s => `<div class="page">${s}</div>`).join('');
    }
    const errs = (data.diagnostics || []).filter(d => d.severity === 'error');
    if (data.ok) {
      statusEl.textContent = `✓ ${data.pages_svg.length} עמ' · ${ms}ms`;
      statusEl.className = 'status-ok';
      diagEl.textContent = (data.diagnostics || []).map(d => d.message).join('\n');
    } else {
      statusEl.textContent = `✗ שגיאת קומפילציה`;
      statusEl.className = 'status-err';
      diagEl.textContent = errs.map(d => d.message).join('\n');
    }
  } catch (e) {
    statusEl.textContent = '✗ שגיאת רשת'; statusEl.className = 'status-err';
    diagEl.textContent = String(e);
  }
}

// Toolbar: wrap selection in a Hebrew command, or insert a snippet.
document.getElementById('toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const s = editor.selectionStart, en = editor.selectionEnd, val = editor.value;
  if (btn.dataset.wrap) {
    const cmd = btn.dataset.wrap, sel = val.slice(s, en);
    const ins = `#${cmd}[${sel}]`;
    editor.value = val.slice(0, s) + ins + val.slice(en);
    editor.selectionStart = editor.selectionEnd = s + cmd.length + 2 + sel.length;
  } else if (btn.dataset.insert) {
    const ins = btn.dataset.insert.replace(/\\n/g, '\n');
    editor.value = val.slice(0, s) + ins + val.slice(en);
    editor.selectionStart = editor.selectionEnd = s + ins.length;
  }
  editor.focus();
  scheduleCompile();
});

document.getElementById('download').addEventListener('click', () => {
  if (!lastPdfB64) return;
  const bytes = Uint8Array.from(atob(lastPdfB64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = 'ksav.pdf'; a.click();
  URL.revokeObjectURL(url);
});

editor.addEventListener('input', scheduleCompile);
[fontEl, sizeEl, marginEl].forEach(el => el.addEventListener('change', scheduleCompile));
runCompile();
