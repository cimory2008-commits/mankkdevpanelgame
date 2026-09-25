// MANKKDEV CONTROL PANEL V1 - Backend (Express + JWT + Axios proxy ke Roblox Open Cloud)
const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-ubah-di-produksi';
const RBX = 'https://apis.roblox.com/cloud/v2/universes';

// ---------- Database: Upstash Redis (persisten, cocok untuk Vercel) atau memori (lokal) ----------
let db = { users: [], games: [] };
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const DB_KEY = 'mankkdev:db';
const redis = (cmd) => axios.post(REDIS_URL, cmd, { headers: { Authorization: 'Bearer ' + REDIS_TOKEN } }).then((r) => r.data.result);
const seedAdmin = () => ({
  id: 'u_admin', username: process.env.ADMIN_USER || 'mankkdev',
  passwordHash: bcrypt.hashSync(process.env.ADMIN_PASS || 'admin123', 10),
  role: 'admin', active: true, expiresAt: null,
});
async function save() { if (REDIS_URL) await redis(['SET', DB_KEY, JSON.stringify(db)]); }
async function load() {
  if (REDIS_URL) { const raw = await redis(['GET', DB_KEY]); db = raw ? JSON.parse(raw) : { users: [], games: [] }; }
  if (!db.users.some((u) => u.role === 'admin')) { db.users.push(seedAdmin()); await save(); }
}
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 10);
const mask = (k) => (k ? k.slice(0, 4) + '••••••••' + k.slice(-4) : '');

const app = express();
app.use(express.json());

// ---------- Halaman statis: index (pengenalan), /admin, /reseller ----------
const page = (file) => (req, res) => res.sendFile(path.join(__dirname, file));
app.get('/', page('index.html'));
app.get('/admin', page('admin.html'));
app.get('/reseller', page('reseller.html'));
app.get('/logo.png', page('logo.png'));
app.get('/assets/style.css', page('assets/style.css'));
app.get('/assets/app.js', page('assets/app.js'));
app.get('/admin.js', page('admin.js'));
app.get('/reseller.js', page('reseller.js'));

// Muat data di awal setiap request API; simpan otomatis setelah request yang mengubah data
app.use('/api', async (req, res, next) => {
  try {
    await load();
    if (req.method !== 'GET') { const send = res.json.bind(res); res.json = async (body) => { await save().catch(() => {}); return send(body); }; }
    next();
  } catch (e) { res.status(500).json({ error: 'Database tidak dapat diakses: ' + e.message }); }
});

// ---------- Auth middleware ----------
const isExpired = (u) => u.expiresAt && new Date(u.expiresAt) < new Date();

function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.users.find((u) => u.id === payload.id);
    if (!user || !user.active) return res.status(401).json({ error: 'Akun nonaktif atau tidak ditemukan.' });
    if (user.role !== 'admin' && isExpired(user)) return res.status(403).json({ error: 'Masa sewa akun sudah habis.' });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: 'Sesi tidak valid. Silakan login ulang.' }); }
}
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Khusus Super Admin.' });
const resellerOnly = (req, res, next) =>
  req.user.role === 'reseller' ? next() : res.status(403).json({ error: 'Khusus akun Reseller.' });

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, active: u.active, expiresAt: u.expiresAt });

// Login dipakai bersama, tapi tiap halaman (/admin, /reseller) menolak role yang tidak cocok di sisi frontend
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash))
    return res.status(401).json({ error: 'Username atau password salah.' });
  if (!user.active) return res.status(403).json({ error: 'Akun dinonaktifkan.' });
  if (user.role !== 'admin' && isExpired(user)) return res.status(403).json({ error: 'Masa sewa akun sudah habis.' });
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: publicUser(user) });
});
app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

// ---------- Super Admin: kelola reseller ----------
app.get('/api/admin/resellers', auth, adminOnly, (req, res) => {
  res.json(db.users.filter((u) => u.role === 'reseller').map((u) => ({
    ...publicUser(u), games: db.games.filter((g) => g.ownerId === u.id).length, expired: !!isExpired(u),
  })));
});
app.post('/api/admin/resellers', auth, adminOnly, (req, res) => {
  const { username, password, days } = req.body || {};
  if (!username || !password || password.length < 6) return res.status(400).json({ error: 'Username wajib, password minimal 6 karakter.' });
  if (db.users.some((u) => u.username === username)) return res.status(409).json({ error: 'Username sudah dipakai.' });
  const expiresAt = new Date(Date.now() + (Number(days) || 30) * 864e5).toISOString();
  const u = { id: uid('u'), username, passwordHash: bcrypt.hashSync(password, 10), role: 'reseller', active: true, expiresAt };
  db.users.push(u);
  res.status(201).json(publicUser(u));
});
app.patch('/api/admin/resellers/:id', auth, adminOnly, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id && x.role === 'reseller');
  if (!u) return res.status(404).json({ error: 'Reseller tidak ditemukan.' });
  if (typeof req.body.active === 'boolean') u.active = req.body.active;
  if (req.body.extendDays) {
    const base = isExpired(u) ? new Date() : new Date(u.expiresAt);
    u.expiresAt = new Date(base.getTime() + Number(req.body.extendDays) * 864e5).toISOString();
  }
  res.json(publicUser(u));
});
app.delete('/api/admin/resellers/:id', auth, adminOnly, (req, res) => {
  const i = db.users.findIndex((x) => x.id === req.params.id && x.role === 'reseller');
  if (i < 0) return res.status(404).json({ error: 'Reseller tidak ditemukan.' });
  db.users.splice(i, 1);
  db.games = db.games.filter((g) => g.ownerId !== req.params.id);
  res.json({ ok: true });
});

// ---------- Super Admin: kelola game & kredensial reseller (Universe ID + API Key) ----------
// Reseller TIDAK bisa membuat/menghapus/mengganti kredensial game sendiri - hanya admin.
app.get('/api/admin/resellers/:id/games', auth, adminOnly, (req, res) => {
  const list = db.games.filter((g) => g.ownerId === req.params.id)
    .map((g) => ({ id: g.id, label: g.label, universeId: g.universeId, apiKeyMasked: mask(g.apiKey) }));
  res.json(list);
});
app.post('/api/admin/games', auth, adminOnly, (req, res) => {
  const { resellerId, label, universeId, apiKey } = req.body || {};
  const owner = db.users.find((u) => u.id === resellerId && u.role === 'reseller');
  if (!owner) return res.status(404).json({ error: 'Reseller tidak ditemukan.' });
  if (!/^\d+$/.test(universeId || '') || !apiKey) return res.status(400).json({ error: 'Universe ID harus angka dan API Key wajib diisi.' });
  const g = { id: uid('g'), ownerId: resellerId, label: label || 'Game ' + universeId, universeId, apiKey };
  db.games.push(g);
  res.status(201).json({ id: g.id, label: g.label, universeId, apiKeyMasked: mask(apiKey) });
});
app.patch('/api/admin/games/:id', auth, adminOnly, (req, res) => {
  const g = db.games.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Game tidak ditemukan.' });
  if (typeof req.body.label === 'string' && req.body.label) g.label = req.body.label;
  if (typeof req.body.universeId === 'string' && req.body.universeId) {
    if (!/^\d+$/.test(req.body.universeId)) return res.status(400).json({ error: 'Universe ID harus angka.' });
    g.universeId = req.body.universeId;
  }
  if (typeof req.body.apiKey === 'string' && req.body.apiKey) g.apiKey = req.body.apiKey;
  res.json({ id: g.id, label: g.label, universeId: g.universeId, apiKeyMasked: mask(g.apiKey) });
});
app.delete('/api/admin/games/:id', auth, adminOnly, (req, res) => {
  const i = db.games.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Game tidak ditemukan.' });
  db.games.splice(i, 1);
  res.json({ ok: true });
});

// ---------- Reseller: hanya melihat & mengontrol game yang sudah disetel admin (terisolasi per ownerId) ----------
const myGame = (req) => db.games.find((g) => g.id === req.params.id && g.ownerId === req.user.id);

app.get('/api/games', auth, resellerOnly, (req, res) => {
  // API Key tidak pernah dikirim balik ke browser
  res.json(db.games.filter((g) => g.ownerId === req.user.id).map(({ apiKey, ownerId, ...g }) => g));
});

// ---------- Proxy ke Roblox Open Cloud ----------
const rbx = (g, method, url, data, params) =>
  axios({ method, url, data, params, headers: { 'x-api-key': g.apiKey, 'Content-Type': 'application/json' }, timeout: 15000 });
const rbxError = (res, e) => {
  const status = e.response?.status || 502;
  res.status(status).json({ error: e.response?.data?.message || e.response?.data?.error || 'Gagal menghubungi Roblox: ' + e.message });
};

app.get('/api/games/:id/info', auth, resellerOnly, async (req, res) => {
  const g = myGame(req); if (!g) return res.status(404).json({ error: 'Game tidak ditemukan.' });
  try {
    const { data } = await rbx(g, 'get', `${RBX}/${g.universeId}`);
    res.json({ name: data.displayName, description: data.description, visibility: data.visibility });
  } catch (e) { rbxError(res, e); }
});

// Restart semua server -> POST /cloud/v2/universes/{id}:restartServers
app.post('/api/games/:id/restart', auth, resellerOnly, async (req, res) => {
  const g = myGame(req); if (!g) return res.status(404).json({ error: 'Game tidak ditemukan.' });
  try {
    await rbx(g, 'post', `${RBX}/${g.universeId}:restartServers`, {});
    res.json({ ok: true });
  } catch (e) { rbxError(res, e); }
});

// Ubah nama / deskripsi / visibility -> PATCH /cloud/v2/universes/{id}?updateMask=...
app.patch('/api/games/:id', auth, resellerOnly, async (req, res) => {
  const g = myGame(req); if (!g) return res.status(404).json({ error: 'Game tidak ditemukan.' });
  const body = {}, m = [];
  if (typeof req.body.name === 'string') { body.displayName = req.body.name; m.push('displayName'); }
  if (typeof req.body.description === 'string') { body.description = req.body.description; m.push('description'); }
  if (['PUBLIC', 'PRIVATE'].includes(req.body.visibility)) { body.visibility = req.body.visibility; m.push('visibility'); }
  if (!m.length) return res.status(400).json({ error: 'Tidak ada perubahan.' });
  try {
    const { data } = await rbx(g, 'patch', `${RBX}/${g.universeId}`, body, { updateMask: m.join(',') });
    res.json({ name: data.displayName, description: data.description, visibility: data.visibility });
  } catch (e) { rbxError(res, e); }
});

if (require.main === module) app.listen(PORT, () => console.log(`MANKKDEV Control Panel berjalan di http://localhost:${PORT}`));
module.exports = app;
