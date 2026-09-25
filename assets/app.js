// Helper bersama dipakai oleh admin.js dan reseller.js
const $ = (s) => document.querySelector(s);
const TOKEN_KEY = 'mk_token';

async function api(path, method = 'GET', body) {
  const token = localStorage.getItem(TOKEN_KEY);
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body && JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); throw new Error(d.error || 'Sesi berakhir, silakan login ulang.'); }
  if (!r.ok) throw new Error(d.error || 'Terjadi kesalahan.');
  return d;
}

function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.borderColor = bad ? '#8a2b2b' : '#d4a72c';
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 3500);
}

function confirmBox(title, text) {
  return new Promise((resolve) => {
    $('#mTitle').textContent = title;
    $('#mText').textContent = text;
    $('#modal').classList.remove('hidden');
    const done = (v) => { $('#modal').classList.add('hidden'); resolve(v); };
    $('#mYes').onclick = () => done(true);
    $('#mNo').onclick = () => done(false);
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

function head(title, sub) {
  return `<div style="margin-bottom:1.5rem"><h2 class="brand gold-text" style="font-size:2.2rem;font-weight:700;margin:0">${title}</h2><p style="color:#8f8567;margin-top:.3rem">${sub}</p></div>`;
}
