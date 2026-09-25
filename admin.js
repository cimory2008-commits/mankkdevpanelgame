// Halaman /admin - hanya untuk role 'admin'
let me = null;
let resellers = [];
let tab = null;

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('#loginErr').classList.add('hidden');
  try {
    const d = await api('/login', 'POST', { username: $('#lu').value.trim(), password: $('#lp').value });
    if (d.user.role !== 'admin') throw new Error('Akun ini bukan Super Admin. Gunakan halaman login Reseller.');
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
  if (me.role !== 'admin') { toast('Akun ini bukan Super Admin.', true); return logout(); }

  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  applyResponsive();
  $('#who').textContent = `${me.username} · Super Admin`;
  $('#nav').innerHTML = `<button class="nav" data-k="resellers">Kelola Reseller</button><button class="nav" data-k="games">Kelola Game</button>`;
  $('#nav').onclick = (e) => { const b = e.target.closest('.nav'); if (b) go(b.dataset.k); };
  await loadResellers();
  go('resellers');
}

async function loadResellers() { resellers = await api('/admin/resellers'); }

function go(k) {
  tab = k;
  document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
  if (window.innerWidth < 900) $('#side').style.display = 'none';
  ({ resellers: viewResellers, games: viewGames })[k]();
}

// ---------- Kelola Reseller ----------
function viewResellers() {
  const active = resellers.filter((r) => r.active && !r.expired).length;
  $('#view').innerHTML = head('Kelola Reseller', 'Buat akun baru, perpanjang masa sewa, atau nonaktifkan akun.') + `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem">
    <div class="panel" style="padding:1.2rem"><p style="color:#8f8567;font-size:.85rem;margin:0">Total reseller</p><p class="brand gold-text" style="font-size:2.2rem;font-weight:700;margin:.2rem 0 0">${resellers.length}</p></div>
    <div class="panel" style="padding:1.2rem"><p style="color:#8f8567;font-size:.85rem;margin:0">Reseller aktif</p><p class="brand gold-text" style="font-size:2.2rem;font-weight:700;margin:.2rem 0 0">${active}</p></div>
    <div class="panel" style="padding:1.2rem"><p style="color:#8f8567;font-size:.85rem;margin:0">Masa sewa habis</p><p class="brand gold-text" style="font-size:2.2rem;font-weight:700;margin:.2rem 0 0">${resellers.filter((r) => r.expired).length}</p></div>
  </div>
  <form id="newR" class="panel" style="padding:1.2rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.8rem;align-items:end;margin-bottom:1.5rem">
    <div><label>Username</label><input name="username" class="input" required></div>
    <div><label>Password</label><input name="password" type="password" minlength="6" class="input" required></div>
    <div><label>Masa sewa (hari)</label><input name="days" type="number" min="1" value="30" class="input"></div>
    <button class="btn-gold">Buat reseller</button>
  </form>
  <div class="panel" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.9rem">
    <thead style="text-align:left;color:#8f8567"><tr><th style="padding:1rem">Username</th><th>Status</th><th>Berakhir</th><th>Game</th><th style="padding:1rem;text-align:right">Aksi</th></tr></thead>
    <tbody>${resellers.map((r) => `<tr style="border-top:1px solid #2a2311">
      <td style="padding:1rem;font-weight:700">${esc(r.username)}</td>
      <td>${r.expired ? '<span style="color:#ff8c8c">Habis</span>' : r.active ? '<span style="color:#f7e08a">Aktif</span>' : '<span style="color:#8f8567">Nonaktif</span>'}</td>
      <td>${fmtDate(r.expiresAt)}</td><td>${r.games}</td>
      <td style="padding:1rem;text-align:right;white-space:nowrap"><div style="display:inline-flex;gap:.5rem">
        <button class="btn-line" data-a="ext" data-id="${r.id}">+30 hari</button>
        <button class="btn-line" data-a="tog" data-id="${r.id}" data-v="${r.active}">${r.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        <button class="btn-danger" data-a="del" data-id="${r.id}" data-n="${esc(r.username)}">Hapus</button></div></td></tr>`).join('') || '<tr><td colspan="5" style="padding:1.5rem;text-align:center;color:#8f8567">Belum ada reseller. Buat akun pertama di atas.</td></tr>'}
    </tbody></table></div>`;

  $('#newR').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('/admin/resellers', 'POST', f); toast('Reseller dibuat.'); await loadResellers(); viewResellers(); }
    catch (err) { toast(err.message, true); }
  };
  $('#view').querySelector('tbody').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.dataset.id;
    try {
      if (b.dataset.a === 'ext') await api('/admin/resellers/' + id, 'PATCH', { extendDays: 30 });
      if (b.dataset.a === 'tog') await api('/admin/resellers/' + id, 'PATCH', { active: b.dataset.v !== 'true' });
      if (b.dataset.a === 'del') {
        if (!(await confirmBox('Hapus reseller?', `Akun "${b.dataset.n}" beserta semua data game-nya akan dihapus permanen.`))) return;
        await api('/admin/resellers/' + id, 'DELETE');
      }
      toast('Berhasil disimpan.'); await loadResellers(); viewResellers();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- Kelola Game (Universe ID + API Key milik reseller, hanya admin yang atur) ----------
let selectedReseller = null;
let resellerGames = [];

async function viewGames() {
  if (!selectedReseller && resellers.length) selectedReseller = resellers[0].id;
  $('#view').innerHTML = head('Kelola Game Reseller', 'Setel Universe ID dan API Key untuk game milik masing-masing reseller. Reseller tidak bisa mengubah data ini sendiri.') + `
  <div style="max-width:360px;margin-bottom:1.2rem"><label>Pilih reseller</label>
    <select id="rsel" class="input">${resellers.map((r) => `<option value="${r.id}" ${r.id === selectedReseller ? 'selected' : ''}>${esc(r.username)}</option>`).join('') || '<option value="">Belum ada reseller</option>'}</select>
  </div>
  <div id="gwrap"></div>`;
  if (!resellers.length) { $('#gwrap').innerHTML = `<p style="color:#8f8567">Buat akun reseller dulu di menu Kelola Reseller.</p>`; return; }
  $('#rsel').onchange = (e) => { selectedReseller = e.target.value; renderGames(); };
  await renderGames();
}

async function renderGames() {
  $('#gwrap').innerHTML = `<p style="color:#8f8567">Memuat game...</p>`;
  resellerGames = await api(`/admin/resellers/${selectedReseller}/games`);
  $('#gwrap').innerHTML = `
  <form id="newG" class="panel" style="padding:1.2rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.8rem;align-items:end;margin-bottom:1.2rem">
    <div><label>Nama label</label><input name="label" class="input" placeholder="Game Client A"></div>
    <div><label>Universe ID</label><input name="universeId" inputmode="numeric" class="input" required></div>
    <div><label>Roblox API Key</label><input name="apiKey" type="password" class="input" autocomplete="off" required></div>
    <button class="btn-gold">Tambahkan game</button>
  </form>
  <div style="display:grid;gap:.8rem">${resellerGames.map((g) => `<div class="panel" style="padding:1.1rem;display:flex;flex-wrap:wrap;gap:.8rem;align-items:center;justify-content:space-between">
    <div><p style="font-weight:700;margin:0">${esc(g.label)}</p><p style="font-size:.85rem;color:#8f8567;margin:.2rem 0 0">Universe ${esc(g.universeId)} · Key ${esc(g.apiKeyMasked)}</p></div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap">
      <button class="btn-line" data-a="edit" data-id="${g.id}">Ganti Universe ID / API Key</button>
      <button class="btn-danger" data-a="del" data-id="${g.id}" data-n="${esc(g.label)}">Hapus</button>
    </div></div>`).join('') || '<p style="color:#8f8567">Reseller ini belum punya game. Tambahkan di atas.</p>'}</div>`;

  $('#newG').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('/admin/games', 'POST', { ...f, resellerId: selectedReseller }); toast('Game ditambahkan.'); await loadResellers(); await renderGames(); }
    catch (err) { toast(err.message, true); }
  };
  $('#gwrap').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'del') {
      if (!(await confirmBox('Hapus game?', `Game "${b.dataset.n}" beserta Universe ID dan API Key-nya akan dihapus.`))) return;
      try { await api('/admin/games/' + b.dataset.id, 'DELETE'); toast('Game dihapus.'); await loadResellers(); await renderGames(); }
      catch (err) { toast(err.message, true); }
    }
    if (b.dataset.a === 'edit') {
      const universeId = prompt('Universe ID baru (kosongkan jika tidak diubah):');
      const apiKey = prompt('API Key baru (kosongkan jika tidak diubah):');
      if (universeId === null && apiKey === null) return;
      const body = {};
      if (universeId) body.universeId = universeId;
      if (apiKey) body.apiKey = apiKey;
      if (!Object.keys(body).length) return;
      try { await api('/admin/games/' + b.dataset.id, 'PATCH', body); toast('Kredensial game diperbarui.'); await renderGames(); }
      catch (err) { toast(err.message, true); }
    }
  };
}

boot();
