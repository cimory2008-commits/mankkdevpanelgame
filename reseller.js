// Halaman /reseller - hanya untuk role 'reseller'. Universe ID & API Key hanya bisa disetel Admin.
let me = null;
let games = [];
let current = null;
let info = null;

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('#loginErr').classList.add('hidden');
  try {
    const d = await api('/login', 'POST', { username: $('#lu').value.trim(), password: $('#lp').value });
    if (d.user.role !== 'reseller') throw new Error('Akun ini bukan akun Reseller. Gunakan halaman login Admin.');
    localStorage.setItem(TOKEN_KEY, d.token);
    await boot();
  } catch (err) {
    localStorage.removeItem(TOKEN_KEY);
    $('#loginErr').textContent = err.message;
    $('#loginErr').classList.remove('hidden');
  }
};

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  me = null;
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}
$('#logout').onclick = logout;
$('#menuBtn').onclick = () => $('#side').classList.toggle('hidden');

function applyResponsive() {
  const mobile = window.innerWidth < 900;
  $('#topbar').style.display = mobile ? 'flex' : 'none';
  $('#side').style.display = mobile ? 'none' : 'flex';
}
window.addEventListener('resize', applyResponsive);

async function boot() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try { me = await api('/me'); } catch { return logout(); }
  if (me.role !== 'reseller') { toast('Akun ini bukan Reseller.', true); return logout(); }

  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  applyResponsive();
  $('#who').textContent = `${me.username} · Reseller` + (me.expiresAt ? ` · aktif s/d ${fmtDate(me.expiresAt)}` : '');
  $('#nav').innerHTML = `<button class="nav on" data-k="dashboard">Dashboard Game</button>`;
  $('#nav').onclick = (e) => { const b = e.target.closest('.nav'); if (b) viewDashboard(); };
  games = await api('/games');
  if (!games.find((g) => g.id === current)) current = games[0]?.id || null;
  viewDashboard();
}

async function viewDashboard() {
  if (!games.length) {
    $('#view').innerHTML = head('Dashboard Game', 'Belum ada game yang disetel untuk akun Anda.') +
      `<p style="color:#8f8567">Hubungi Admin MANKKDEV untuk menambahkan Universe ID dan API Key game Anda. Pengaturan koneksi hanya bisa dilakukan oleh Admin.</p>`;
    return;
  }
  $('#view').innerHTML = head('Dashboard Game', 'Kontrol game langsung lewat Roblox Open Cloud.') + `
  <div style="max-width:360px;margin-bottom:1.5rem"><label>Game aktif</label>
    <select id="gsel" class="input">${games.map((g) => `<option value="${g.id}" ${g.id === current ? 'selected' : ''}>${esc(g.label)} (${esc(g.universeId)})</option>`).join('')}</select>
  </div>
  <div id="cards" style="color:#8f8567">Memuat data game…</div>`;
  $('#gsel').onchange = (e) => { current = e.target.value; viewDashboard(); };

  try { info = await api(`/games/${current}/info`); }
  catch (err) { $('#cards').innerHTML = `<div class="panel" style="padding:1.2rem;color:#ffb0b0">Gagal memuat game: ${esc(err.message)}. Data koneksi (Universe ID/API Key) hanya bisa diperbaiki oleh Admin.</div>`; return; }

  const pub = info.visibility === 'PUBLIC';
  $('#cards').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.2rem">
    <div class="panel" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">
      <h3 class="brand gold-text" style="font-size:1.5rem;font-weight:700;margin:0">Status game</h3>
      <div><p style="font-size:1.15rem;font-weight:700;margin:0">${esc(info.name)}</p><p style="font-size:.9rem;color:#b9ad8c;margin-top:.3rem;white-space:pre-line">${esc(info.description) || 'Belum ada deskripsi.'}</p></div>
      <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid #2a2311;padding-top:1rem">
        <div><p style="font-weight:700;margin:0">${pub ? 'Public' : 'Private'}</p><p style="font-size:.75rem;color:#8f8567;margin:.2rem 0 0">${pub ? 'Semua pemain bisa masuk.' : 'Hanya Anda yang bisa masuk.'}</p></div>
        <button id="visSw" class="switch ${pub ? 'on' : ''}" role="switch" aria-checked="${pub}" aria-label="Ubah status Public atau Private"></button>
      </div>
    </div>
    <div class="panel" style="padding:1.5rem;display:flex;flex-direction:column;justify-content:space-between;gap:1.2rem">
      <div><h3 class="brand gold-text" style="font-size:1.5rem;font-weight:700;margin:0">Server</h3><p style="font-size:.9rem;color:#b9ad8c;margin-top:.3rem">Restart semua server yang berjalan agar pemain masuk ke versi terbaru.</p></div>
      <button id="restart" class="btn-gold" style="font-size:1.05rem;padding:1.1rem">Restart All Servers</button>
    </div>
    <form id="meta" class="panel" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">
      <h3 class="brand gold-text" style="font-size:1.5rem;font-weight:700;margin:0">Nama dan deskripsi</h3>
      <div><label>Nama game</label><input name="name" class="input" value="${esc(info.name)}" maxlength="50" required></div>
      <div><label>Deskripsi game</label><textarea name="description" rows="4" class="input">${esc(info.description)}</textarea></div>
      <button class="btn-gold">Save Changes</button>
    </form>
    <div class="panel" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">
      <h3 class="brand gold-text" style="font-size:1.5rem;font-weight:700;margin:0">Ikon dan thumbnail</h3>
      <label id="drop" for="file" style="display:block;border:1px dashed #8a6414;border-radius:12px;padding:2rem;text-align:center;cursor:pointer">
        <img id="prev" class="hidden" style="max-height:150px;border-radius:8px;margin:0 auto 0.8rem;display:block">
        <span id="dropTxt">Seret gambar ke sini atau klik untuk memilih (PNG/JPG)</span>
        <input id="file" type="file" accept="image/png,image/jpeg" class="hidden">
      </label>
      <button id="upload" class="btn-line" disabled>Unggah gambar</button>
      <p style="font-size:.75rem;color:#8f8567;margin:0">Pratinjau saja: Roblox Open Cloud belum menyediakan endpoint resmi untuk mengganti ikon game.</p>
    </div></div>`;

  $('#visSw').onclick = async () => {
    const next = info.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    if (!(await confirmBox('Ubah status game?', `Game akan diubah menjadi ${next === 'PUBLIC' ? 'Public' : 'Private'}.`))) return;
    try { await api('/games/' + current, 'PATCH', { visibility: next }); toast('Status game diperbarui.'); viewDashboard(); }
    catch (e) { toast(e.message, true); }
  };
  $('#restart').onclick = async (e) => {
    if (!(await confirmBox('Restart semua server?', 'Apakah Anda yakin ingin merestart semua server untuk update?'))) return;
    e.target.disabled = true;
    try { await api(`/games/${current}/restart`, 'POST'); toast('Perintah restart terkirim.'); }
    catch (err) { toast(err.message, true); }
    e.target.disabled = false;
  };
  $('#meta').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('/games/' + current, 'PATCH', f); toast('Perubahan disimpan.'); viewDashboard(); }
    catch (err) { toast(err.message, true); }
  };
  const pick = (f) => { if (!f || !f.type.startsWith('image/')) return; $('#prev').src = URL.createObjectURL(f); $('#prev').classList.remove('hidden'); $('#dropTxt').textContent = f.name; $('#upload').disabled = false; };
  $('#file').onchange = (e) => pick(e.target.files[0]);
  $('#drop').ondragover = (e) => e.preventDefault();
  $('#drop').ondrop = (e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); };
  $('#upload').onclick = () => toast('Unggah gambar belum tersedia di Open Cloud.', true);
}

boot();
