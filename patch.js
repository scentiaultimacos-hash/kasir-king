// ═══════════════════════════════════════════════════════════════
// PARFUMKU POS v5.4 — SELF-CONTAINED PATCH
// TIDAK butuh bridge, TIDAK butuh edit kasirku.html
// Cukup: pastikan <script src="patch.js"></script> ada sebelum </body>
// ═══════════════════════════════════════════════════════════════
(function() {
'use strict';

const DB_KEY = 'pos_parfum_db_v5_2';
const SESSION_KEY = 'pos_parfum_session';
const DEVICE_KEY = 'pos_parfum_device_id';
const CFG = { PUSH_DEBOUNCE_MS: 2000, PUSH_MIN_INTERVAL_MS: 5000, HEARTBEAT_MS: 60000 };

function getDb() { try { return JSON.parse(localStorage.getItem(DB_KEY)) || null; } catch(e) { return null; } }
function saveDb(d) { try { localStorage.setItem(DB_KEY, JSON.stringify(d)); } catch(e) {} }
function getUser() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { const s = JSON.parse(raw); const d = getDb(); return (d?.users||[]).find(u => u.id === s.userId) || null; } catch(e) { return null; }
}
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}
function fmtRp(n) { return 'Rp ' + Number(n||0).toLocaleString('id-ID'); }

let _sb = null;
function getSupabase() {
  if (_sb) return _sb;
  const cfg = window.PARFUMKU_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || typeof supabase === 'undefined') return null;
  try { _sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } }); } catch(e) { return null; }
  return _sb;
}

function toast(msg, type, duration) {
  type = type || 'success'; duration = duration || 2500;
  const bg = { success:'#00C9A7', error:'#ef4444', info:'#3b82f6', warning:'#f59e0b' }[type] || '#00C9A7';
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:80px;right:12px;left:12px;z-index:99999;padding:12px 16px;border-radius:12px;color:#fff;font-size:14px;font-weight:500;background:${bg};box-shadow:0 4px 16px rgba(0,0,0,0.15)`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.transition='all .3s'; el.style.opacity='0'; setTimeout(()=>el.remove(),300); }, duration);
}

let _ccb = null;
function showConfirm(title, msg, onYes) {
  let m = document.getElementById('_pcConfirm');
  if (!m) {
    m = document.createElement('div');
    m.id = '_pcConfirm';
    m.className = 'fixed inset-0 z-[9998] hidden items-center justify-center modal-backdrop';
    m.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-sm mx-4 animate-slide-up shadow-2xl"><div class="p-6 text-center"><h3 id="_pcT" class="font-bold text-lg mb-2"></h3><p id="_pcM" class="text-sm text-slate-500 mb-6 whitespace-pre-line"></p><div class="flex gap-3"><button id="_pcNo" class="flex-1 py-3 rounded-xl border border-app-border text-sm font-medium">Batal</button><button id="_pcYes" class="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-bold">Ya</button></div></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#_pcNo').onclick = () => { m.classList.add('hidden'); m.classList.remove('flex'); _ccb = null; };
    m.querySelector('#_pcYes').onclick = () => { const cb = _ccb; m.classList.add('hidden'); m.classList.remove('flex'); _ccb = null; try { cb?.(); } catch(e) { console.error(e); } };
  }
  m.querySelector('#_pcT').textContent = title;
  m.querySelector('#_pcM').textContent = msg;
  _ccb = onYes;
  m.classList.remove('hidden'); m.classList.add('flex');
}
function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

const PAGE_GROUPS = {
  'Utama': [{id:'dashboard',label:'Dashboard',icon:'📊'},{id:'kasir',label:'Kasir (POS)',icon:'🛒'},{id:'pending',label:'Pending Order',icon:'⏸️'}],
  'Produk & Stok': [{id:'produk',label:'Produk',icon:'📦'},{id:'inventori',label:'Inventori',icon:'🏭'},{id:'opname',label:'Stock Opname',icon:'📋'},{id:'supplier',label:'Supplier & PO',icon:'🚚'}],
  'Pelanggan': [{id:'pelanggan',label:'Pelanggan',icon:'👥'},{id:'kasbon',label:'Kasbon',icon:'💳'},{id:'voucher',label:'Voucher',icon:'🎁'}],
  'Laporan': [{id:'laporan-penjualan',label:'Lap. Penjualan',icon:'📈'},{id:'laporan-kasir',label:'Lap. Per Kasir',icon:'👤'},{id:'laporan-retur',label:'Lap. Retur',icon:'🔄'},{id:'laporan-stok',label:'Lap. Stok',icon:'📦'},{id:'laporan-keuangan',label:'Lap. Keuangan',icon:'💰'},{id:'rfm',label:'RFM Analysis',icon:'🎯'}],
  'Karyawan': [{id:'karyawan',label:'Karyawan',icon:'👨‍💼'},{id:'absensi',label:'Absensi',icon:'📸'},{id:'payroll',label:'Payroll',icon:'💵'},{id:'laporan-karyawan',label:'Lap. Karyawan',icon:'📊'},{id:'hak-akses',label:'Hak Akses',icon:'🔐'},{id:'shift-history',label:'Riwayat Shift',icon:'⏰'}],
  'Sistem': [{id:'master',label:'Master Pengaturan',icon:'⚙️'}],
};

// ═══════════════════════════════════════════════════════════════
// SYNC
// ═══════════════════════════════════════════════════════════════
let pushTimer = null, lastPushAt = 0, isPushing = false, realtimeChannel = null;

function setSyncStatus(s) {
  const el = document.getElementById('syncBadge'); if (!el) return;
  el.classList.remove('connected','syncing','offline');
  if (s === 'connected') { el.textContent = '● ONLINE'; el.classList.add('connected'); }
  else if (s === 'syncing') { el.textContent = '⟳ SYNC'; el.classList.add('syncing'); }
  else { el.textContent = '● OFFLINE'; el.classList.add('offline'); }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const now = Date.now();
    if (now - lastPushAt < CFG.PUSH_MIN_INTERVAL_MS) setTimeout(pushToCloud, CFG.PUSH_MIN_INTERVAL_MS - (now - lastPushAt));
    else pushToCloud();
  }, CFG.PUSH_DEBOUNCE_MS);
}

async function pushToCloud() {
  if (isPushing) return;
  const sb = getSupabase(); if (!sb) return;
  const u = getUser(); if (!u) return;
  isPushing = true; lastPushAt = Date.now(); setSyncStatus('syncing');
  try {
    const { data: cd } = await sb.from('pos_data').select('version').eq('user_id', u.username).maybeSingle();
    const v = (cd?.version || 0) + 1;
    const { error } = await sb.from('pos_data').upsert({ user_id: u.username, data: getDb(), device_id: getDeviceId(), version: v, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    setSyncStatus('connected');
  } catch(e) { setSyncStatus('offline'); } finally { isPushing = false; }
}

async function pullFromCloud(silent) {
  const sb = getSupabase(); if (!sb) return;
  const u = getUser(); if (!u) return;
  try {
    setSyncStatus('syncing');
    const { data: cd, error } = await sb.from('pos_data').select('data,device_id,version').eq('user_id', u.username).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (!cd?.data) { setSyncStatus('connected'); return; }
    if (cd.device_id === getDeviceId()) { setSyncStatus('connected'); return; }
    const conflict = detectConflict(getDb(), cd.data);
    if (conflict.hasConflict) { setSyncStatus('connected'); showConflictModal(cd, conflict); }
    else {
      const merged = mergeData(getDb(), cd.data, 'cloud');
      ensureDefaults(merged); saveDb(merged); setSyncStatus('connected');
      if (!silent) { toast('☁️ Data disinkronkan', 'info'); setTimeout(() => location.reload(), 800); }
    }
  } catch(e) { setSyncStatus('offline'); }
}

function detectConflict(local, cloud) {
  const r = { hasConflict:false, details:{} };
  const lT = new Set((local?.transaksi||[]).map(t=>t.id));
  const cT = new Set((cloud?.transaksi||[]).map(t=>t.id));
  const lo = (local?.transaksi||[]).filter(t=>!cT.has(t.id));
  const co = (cloud?.transaksi||[]).filter(t=>!lT.has(t.id));
  if (lo.length && co.length) { r.hasConflict = true; r.details.transaksi = { localOnly:lo.length, cloudOnly:co.length, localSum:lo.reduce((s,t)=>s+t.total,0), cloudSum:co.reduce((s,t)=>s+t.total,0) }; }
  const lA = new Set((local?.absensi||[]).map(a=>a.karyawan_id+'_'+a.tanggal));
  const cA = new Set((cloud?.absensi||[]).map(a=>a.karyawan_id+'_'+a.tanggal));
  const loA = (local?.absensi||[]).filter(a=>!cA.has(a.karyawan_id+'_'+a.tanggal));
  const coA = (cloud?.absensi||[]).filter(a=>!lA.has(a.karyawan_id+'_'+a.tanggal));
  if (loA.length && coA.length) { r.hasConflict = true; r.details.absensi = { localOnly:loA.length, cloudOnly:coA.length }; }
  return r;
}

function mergeData(local, cloud, pref) {
  const merged = JSON.parse(JSON.stringify(local || {}));
  const mergeById = (a1,a2) => {
    const m = new Map();
    [...(a1||[]),...(a2||[])].forEach(i => {
      const k = i.id || (i.karyawan_id+'_'+i.tanggal) || JSON.stringify(i);
      const ex = m.get(k);
      if (!ex) { m.set(k,i); return; }
      const t1 = new Date(ex.updated_at || ex.created_at || 0).getTime();
      const t2 = new Date(i.updated_at || i.created_at || 0).getTime();
      if (t2 > t1) m.set(k,i);
    });
    return Array.from(m.values());
  };
  ['transaksi','absensi','produk','pelanggan','karyawan','vouchers','pending_orders','suppliers','purchase_orders','shifts','returns','opname_sessions','kasbon','payroll','kategori','aroma','ukuran','jabatan'].forEach(k => { merged[k] = mergeById(local?.[k], cloud?.[k]); });
  if (pref === 'cloud') { merged.master = cloud.master || merged.master; merged.company = cloud.company || merged.company; }
  return merged;
}

function ensureDefaults(d) {
  d = d || getDb(); if (!d) return;
  if (!Array.isArray(d.jabatan)) d.jabatan = [{id:'j1',nama:'Owner'},{id:'j2',nama:'Manager'},{id:'j3',nama:'Kasir'},{id:'j4',nama:'Gudang'},{id:'j5',nama:'Admin'},{id:'j6',nama:'Borongan'},{id:'j7',nama:'Security'}];
  (d.users||[]).forEach(u => { if (!Array.isArray(u.permissions)) u.permissions = (u.username === 'admin') ? ['*'] : []; });
  d.master = d.master || {}; d.master.absensi = d.master.absensi || {};
  if (d.master.absensi.auto_delete_foto === undefined) d.master.absensi.auto_delete_foto = 'nonaktif';
}

function showConflictModal(cd, conflict) {
  let m = document.getElementById('_pcConflict');
  if (!m) {
    m = document.createElement('div');
    m.id = '_pcConflict';
    m.className = 'fixed inset-0 z-[9997] hidden items-center justify-center modal-backdrop';
    m.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-md mx-4 animate-slide-up shadow-2xl max-h-[90vh] flex flex-col"><div class="p-5 border-b border-app-border flex justify-between items-center"><h3 class="font-bold">⚠️ Tabrakan Data</h3><button onclick="document.getElementById('_pcConflict').classList.add('hidden');document.getElementById('_pcConflict').classList.remove('flex')" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">✕</button></div><div id="_pcCBody" class="p-5 overflow-y-auto flex-1 space-y-3"></div></div>`;
    document.body.appendChild(m);
  }
  const body = document.getElementById('_pcCBody');
  let h = `<div class="p-3 rounded-lg bg-amber-50 text-xs text-amber-800">Data berbeda dengan device lain. Pilih tindakan:</div>`;
  if (conflict.details.transaksi) { const d = conflict.details.transaksi; h += `<div class="p-3 rounded-lg border border-app-border"><div class="font-semibold text-sm mb-2">📊 Transaksi</div><div class="text-xs space-y-1"><div class="flex justify-between"><span>Device ini</span><span class="text-blue-600 font-semibold">${d.localOnly} (${fmtRp(d.localSum)})</span></div><div class="flex justify-between"><span>Device lain</span><span class="text-amber-600 font-semibold">${d.cloudOnly} (${fmtRp(d.cloudSum)})</span></div></div></div>`; }
  if (conflict.details.absensi) { const d = conflict.details.absensi; h += `<div class="p-3 rounded-lg border border-app-border"><div class="font-semibold text-sm mb-2">📸 Absensi</div><div class="text-xs space-y-1"><div class="flex justify-between"><span>Device ini</span><span class="text-blue-600 font-semibold">${d.localOnly}</span></div><div class="flex justify-between"><span>Device lain</span><span class="text-amber-600 font-semibold">${d.cloudOnly}</span></div></div></div>`; }
  h += `<div class="space-y-2 pt-2"><button id="_pcMerge" class="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm">✅ Gabungkan (Aman)</button><button id="_pcLocal" class="w-full py-3 rounded-xl bg-blue-500 text-white font-bold text-sm">📱 Pakai Lokal</button><button id="_pcCloud" class="w-full py-3 rounded-xl bg-amber-500 text-white font-bold text-sm">☁️ Pakai Cloud</button></div>`;
  body.innerHTML = h;
  m.classList.remove('hidden'); m.classList.add('flex');
  const resolve = (choice) => {
    m.classList.add('hidden'); m.classList.remove('flex');
    let merged;
    if (choice === 'merge') merged = mergeData(getDb(), cd.data, 'cloud');
    else if (choice === 'local') merged = getDb();
    else merged = cd.data;
    ensureDefaults(merged); saveDb(merged);
    const sb = getSupabase(); const u = getUser();
    if (sb && u) sb.from('conflict_log').insert({ user_id:u.username, device_id:getDeviceId(), conflict_type:Object.keys(conflict.details).join(','), resolution:choice, details:conflict.details }).then(()=>{}).catch(()=>{});
    toast('✅ Konflik diselesaikan', 'success'); setTimeout(() => location.reload(), 800);
  };
  document.getElementById('_pcMerge').onclick = () => resolve('merge');
  document.getElementById('_pcLocal').onclick = () => resolve('local');
  document.getElementById('_pcCloud').onclick = () => resolve('cloud');
}

function startRealtime() {
  const sb = getSupabase(); if (!sb) return;
  const u = getUser(); if (!u) return;
  if (realtimeChannel) { try { sb.removeChannel(realtimeChannel); } catch(e) {} }
  realtimeChannel = sb.channel('pos_sync_' + u.username)
    .on('postgres_changes', { event:'*', schema:'public', table:'pos_data', filter:'user_id=eq.' + u.username }, (payload) => {
      if (payload.new && payload.new.device_id !== getDeviceId()) setTimeout(() => pullFromCloud(true), 300);
    })
    .subscribe(s => { if (s === 'SUBSCRIBED') setSyncStatus('connected'); else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setSyncStatus('offline'); });
}

// ═══════════════════════════════════════════════════════════════
// STORAGE FOTO
// ═══════════════════════════════════════════════════════════════
async function uploadFoto(base64, prefix) {
  const sb = getSupabase(); if (!sb || !base64) return null;
  try {
    const res = await fetch(base64); const blob = await res.blob();
    const fn = `absensi/${getDeviceId()}/${Date.now()}_${prefix||'foto'}.jpg`;
    const { error } = await sb.storage.from('photos').upload(fn, blob, { contentType:'image/jpeg', upsert:false });
    if (error) throw error;
    const { data } = sb.storage.from('photos').getPublicUrl(fn);
    return { path: fn, url: data.publicUrl };
  } catch(e) { return null; }
}
async function deleteFoto(path) {
  const sb = getSupabase(); if (!sb || !path) return false;
  try { await sb.storage.from('photos').remove([path]); return true; } catch(e) { return false; }
}
async function cleanOldPhotos() {
  const d = getDb(); if (!d) return;
  const s = d?.master?.absensi?.auto_delete_foto;
  if (!s || s === 'nonaktif') return;
  const m = Number(s); if (!m) return;
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - m);
  const cISO = cutoff.toISOString().slice(0,10);
  let n = 0;
  for (const a of (d.absensi||[])) {
    if (a.tanggal >= cISO) continue;
    if (a.foto_masuk_path) { await deleteFoto(a.foto_masuk_path); a.foto_masuk_path = null; }
    if (a.foto_keluar_path) { await deleteFoto(a.foto_keluar_path); a.foto_keluar_path = null; }
    if (a.foto_masuk?.startsWith?.('data:')) a.foto_masuk = null;
    if (a.foto_keluar?.startsWith?.('data:')) a.foto_keluar = null;
    n++;
  }
  if (n > 0) saveDb(d);
}

// ═══════════════════════════════════════════════════════════════
// FITUR: HAPUS FOTO ABSENSI (Owner)
// ═══════════════════════════════════════════════════════════════
window.hapusFotoAbsensi = async function(absId) {
  const u = getUser(); if (!u || u.role !== 'owner') return toast('Hanya owner', 'error');
  const d = getDb();
  const abs = (d.absensi||[]).find(a => a.id === absId); if (!abs) return;
  showConfirm('Hapus Foto Absensi', 'Foto akan dihapus permanen.\n\nData jam masuk/keluar tetap ada.', async () => {
    if (abs.foto_masuk_path) { await deleteFoto(abs.foto_masuk_path); abs.foto_masuk_path = null; }
    if (abs.foto_keluar_path) { await deleteFoto(abs.foto_keluar_path); abs.foto_keluar_path = null; }
    abs.foto_masuk = null; abs.foto_keluar = null;
    saveDb(d); toast('✅ Foto dihapus');
    if (window.loadAbsensi) window.loadAbsensi();
    schedulePush();
  });
};

// ═══════════════════════════════════════════════════════════════
// FITUR: PAYROLL EDIT + SLIP
// ═══════════════════════════════════════════════════════════════
window.editPayrollItem = function(pid) {
  const u = getUser(); if (!u || !['owner','manager'].includes(u.role)) return toast('Hanya owner/manager', 'error');
  const d = getDb();
  const item = (d.payroll||[]).find(p => p.id === pid); if (!item) return;
  document.getElementById('formTitle').textContent = '✏️ Edit Payroll: ' + item.karyawan_nama;
  document.getElementById('formBody').innerHTML = `
    <div class="p-3 rounded-lg bg-primary-soft text-xs mb-2"><div class="flex justify-between"><span>Periode</span><span class="font-semibold">${item.periode}</span></div><div class="flex justify-between"><span>Karyawan</span><span class="font-semibold">${item.karyawan_nama}</span></div></div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="text-xs font-medium text-slate-600 block mb-1">Gaji Pokok</label><input type="number" id="pePokok" value="${item.gaji_pokok||0}" class="w-full px-3 py-2 rounded-lg border border-app-border text-sm"></div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">Tunjangan</label><input type="number" id="peTunjangan" value="${item.tunjangan||0}" class="w-full px-3 py-2 rounded-lg border border-app-border text-sm"></div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">Lembur (jam)</label><input type="number" id="peLemburJam" value="${item.lembur_jam||0}" step="0.5" class="w-full px-3 py-2 rounded-lg border border-app-border text-sm"></div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">Tarif/jam</label><input type="number" id="peLemburTarif" value="${item.lembur_tarif||0}" class="w-full px-3 py-2 rounded-lg border border-app-border text-sm"></div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">Bonus</label><input type="number" id="peBonus" value="${item.bonus||0}" class="w-full px-3 py-2 rounded-lg border border-app-border text-sm"></div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">Potongan</label><input type="number" id="pePotongan" value="${item.potongan||0}" class="w-full px-3 py-2 rounded-lg border border-app-border text-sm"></div>
    </div>
    <div><label class="text-xs font-medium text-slate-600 block mb-1">Catatan</label><textarea id="peCatatan" rows="2" class="w-full px-3 py-2 rounded-lg border border-app-border text-sm">${item.catatan||''}</textarea></div>
    <div class="p-3 rounded-lg bg-primary-soft text-sm"><div class="flex justify-between font-bold"><span>Total</span><span id="peTotal">${fmtRp(0)}</span></div></div>`;
  const upd = () => {
    const p = Number(document.getElementById('pePokok').value)||0;
    const t = Number(document.getElementById('peTunjangan').value)||0;
    const l = (Number(document.getElementById('peLemburJam').value)||0) * (Number(document.getElementById('peLemburTarif').value)||0);
    const b = Number(document.getElementById('peBonus').value)||0;
    const po = Number(document.getElementById('pePotongan').value)||0;
    document.getElementById('peTotal').textContent = fmtRp(p+t+l+b-po);
  };
  setTimeout(() => { ['pePokok','peTunjangan','peLemburJam','peLemburTarif','peBonus','pePotongan'].forEach(id => document.getElementById(id)?.addEventListener('input', upd)); upd(); }, 100);
  document.getElementById('formSubmitBtn').onclick = () => {
    item.gaji_pokok = Number(document.getElementById('pePokok').value)||0;
    item.tunjangan = Number(document.getElementById('peTunjangan').value)||0;
    item.lembur_jam = Number(document.getElementById('peLemburJam').value)||0;
    item.lembur_tarif = Number(document.getElementById('peLemburTarif').value)||0;
    item.bonus = Number(document.getElementById('peBonus').value)||0;
    item.potongan = Number(document.getElementById('pePotongan').value)||0;
    item.catatan = document.getElementById('peCatatan').value;
    item.total = item.gaji_pokok + item.tunjangan + (item.lembur_jam*item.lembur_tarif) + item.bonus - item.potongan;
    item.updated_at = new Date().toISOString();
    saveDb(d); closeModal('modalForm'); toast('✅ Payroll diperbarui');
    if (window.loadPayroll) window.loadPayroll();
    schedulePush();
  };
  openModal('modalForm');
};

window.generateSlipGaji = function(pid) {
  const d = getDb();
  const item = (d.payroll||[]).find(p => p.id === pid); if (!item) return toast('Tidak ditemukan', 'error');
  if (!window.jspdf) return toast('PDF belum siap', 'warning');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4', compress:true });
  const W = doc.internal.pageSize.getWidth();
  const t = d.master.toko;
  doc.setFillColor(0,201,167); doc.rect(0,0,W,30,'F');
  doc.setTextColor(255); doc.setFontSize(18); doc.setFont('helvetica','bold'); doc.text(t.nama||'Parfumku',14,15);
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.text((t.alamat||'')+' • '+(t.telepon||''),14,23);
  doc.setTextColor(31,41,55); doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text('SLIP GAJI',14,45);
  const bln = new Date(item.periode+'-01').toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(107,114,128); doc.text('Periode: '+bln,14,51);
  doc.setFillColor(245,247,250); doc.roundedRect(14,58,W-28,28,2,2,'F');
  doc.setTextColor(31,41,55); doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text(item.karyawan_nama,20,68);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  const k = (d.karyawan||[]).find(x => x.id === item.karyawan_id);
  doc.text('Jabatan: '+(k?.jabatan||'-'),20,75); doc.text('Telepon: '+(k?.telepon||'-'),20,81);
  const lm = (item.lembur_jam||0) * (item.lembur_tarif||0);
  doc.autoTable({ startY:95, theme:'plain', styles:{fontSize:9,cellPadding:2.5},
    body: [['Gaji Pokok', {content:fmtRp(item.gaji_pokok||0), styles:{halign:'right'}}],['Tunjangan', {content:fmtRp(item.tunjangan||0), styles:{halign:'right'}}],['Lembur', {content:fmtRp(lm), styles:{halign:'right'}}],['Bonus', {content:fmtRp(item.bonus||0), styles:{halign:'right'}}],['Potongan', {content:'-'+fmtRp(item.potongan||0), styles:{halign:'right'}}]],
    columnStyles: { 0:{cellWidth:120}, 1:{cellWidth:W-28-120} }, margin: { left:14, right:14 } });
  const y = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(0,201,167); doc.roundedRect(14,y,W-28,18,2,2,'F');
  doc.setTextColor(255); doc.setFontSize(11); doc.text('GAJI BERSIH',20,y+11);
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text(fmtRp(item.total||0),W-20,y+12,{align:'right'});
  doc.save(`SlipGaji_${item.karyawan_nama.replace(/\s/g,'')}_${item.periode}.pdf`);
  toast('📄 Slip gaji di-download');
};

// ═══════════════════════════════════════════════════════════════
// FITUR: ATUR AKSES
// ═══════════════════════════════════════════════════════════════
let _aturAksesId = null;

window.openAturAkses = function(userId) {
  const d = getDb();
  const u = (d.users||[]).find(x => x.id === userId); if (!u) return;
  _aturAksesId = userId;
  const isAdmin = u.username === 'admin';
  const cur = Array.isArray(u.permissions) ? u.permissions : [];
  const hasAll = cur.includes('*');
  document.getElementById('formTitle').textContent = '🔐 Atur Akses: ' + u.nama;
  document.getElementById('formBody').innerHTML = `
    <div class="p-3 rounded-lg bg-blue-50 text-xs text-blue-800 mb-2"><b>ℹ️</b> Centang halaman yang bisa diakses <b>${u.nama}</b>.</div>
    ${isAdmin ? '<div class="p-3 rounded-lg bg-red-50 text-xs text-red-700 mb-2">👑 Owner: selalu semua akses.</div>' : ''}
    <div class="flex gap-2 mb-3"><button type="button" onclick="window._toggleAllAkses(true)" class="flex-1 py-2 rounded-lg bg-primary-soft text-primary text-xs font-semibold" ${isAdmin?'disabled':''}>✓ Semua</button><button type="button" onclick="window._toggleAllAkses(false)" class="flex-1 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold" ${isAdmin?'disabled':''}>✗ Kosongkan</button></div>
    <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
      ${Object.entries(PAGE_GROUPS).map(([g, pages]) => `<div class="border border-app-border rounded-xl overflow-hidden"><div class="px-3 py-2 bg-slate-50 flex items-center justify-between"><div class="font-semibold text-xs text-slate-700">${g}</div><button type="button" onclick="window._toggleGroup('${g}', true)" class="text-[10px] text-primary" ${isAdmin?'disabled':''}>Pilih semua</button></div><div class="p-2 grid grid-cols-2 gap-1">${pages.map(p => `<label class="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"><input type="checkbox" class="akses-cb w-4 h-4 accent-primary" data-page="${p.id}" data-group="${g}" ${hasAll||cur.includes(p.id)?'checked':''} ${isAdmin?'disabled':''}><span class="text-sm">${p.icon} ${p.label}</span></label>`).join('')}</div></div>`).join('')}
    </div>
    <div class="mt-3 p-3 rounded-lg bg-primary-soft text-xs"><b>📊 Terpilih:</b> <span id="aksesCounter">0</span> halaman</div>`;
  document.getElementById('formSubmitBtn').textContent = 'Simpan Akses';
  document.getElementById('formSubmitBtn').onclick = window._submitAturAkses;
  openModal('modalForm');
  window._updateAksesCounter();
  setTimeout(() => document.querySelectorAll('.akses-cb').forEach(cb => cb.addEventListener('change', window._updateAksesCounter)), 50);
};

window._updateAksesCounter = function() {
  const c = document.querySelectorAll('.akses-cb:checked').length;
  const t = document.querySelectorAll('.akses-cb').length;
  const el = document.getElementById('aksesCounter'); if (el) el.textContent = `${c} / ${t}`;
};
window._toggleAllAkses = function(s) { document.querySelectorAll('.akses-cb').forEach(cb => { if (!cb.disabled) cb.checked = s; }); window._updateAksesCounter(); };
window._toggleGroup = function(g, s) { document.querySelectorAll(`.akses-cb[data-group="${g}"]`).forEach(cb => { if (!cb.disabled) cb.checked = s; }); window._updateAksesCounter(); };

window._submitAturAkses = function() {
  const d = getDb();
  const u = (d.users||[]).find(x => x.id === _aturAksesId); if (!u) return;
  u.permissions = u.username === 'admin' ? ['*'] : [...document.querySelectorAll('.akses-cb:checked')].map(cb => cb.dataset.page);
  saveDb(d);
  closeModal('modalForm');
  document.getElementById('formSubmitBtn').textContent = 'Simpan';
  document.getElementById('formSubmitBtn').onclick = window.submitForm;
  toast('✅ Akses ' + u.nama + ' diperbarui');
  schedulePush();
  const cur = getUser();
  if (cur && cur.id === u.id) location.reload();
};

// ═══════════════════════════════════════════════════════════════
// LOG KONFLIK
// ═══════════════════════════════════════════════════════════════
window.loadLogKonflik = async function() {
  const el = document.getElementById('logKonflikList'); if (!el) return;
  const sb = getSupabase();
  if (!sb) { el.innerHTML = '<div class="text-center text-slate-400 text-sm py-6">Supabase belum siap</div>'; return; }
  el.innerHTML = '<div class="text-center text-slate-400 text-sm py-6">Memuat...</div>';
  try {
    const u = getUser();
    const { data, error } = await sb.from('conflict_log').select('*').eq('user_id', u.username).order('created_at', { ascending:false }).limit(50);
    if (error) throw error;
    if (!data?.length) { el.innerHTML = '<div class="text-center text-slate-400 text-sm py-6">Belum ada konflik 🎉</div>'; return; }
    el.innerHTML = data.map(l => `<div class="p-3 rounded-lg border border-app-border text-xs"><div class="flex justify-between mb-2"><span class="font-semibold">${l.conflict_type||'N/A'}</span><span class="px-2 py-0.5 rounded-full ${l.resolution==='merge'?'bg-primary-soft text-primary':l.resolution==='local'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'} font-semibold uppercase">${l.resolution}</span></div><div class="text-slate-500">Device: ${l.device_id||'-'}</div><div class="text-slate-500">${new Date(l.created_at).toLocaleString('id-ID')}</div></div>`).join('');
  } catch(e) { el.innerHTML = '<div class="text-center text-red-400 text-sm py-6">Error: '+e.message+'</div>'; }
};

// ═══════════════════════════════════════════════════════════════
// DOM INJECTIONS
// ═══════════════════════════════════════════════════════════════
function hideLoginDemo() {
  const lf = document.getElementById('loginForm'); if (!lf) return;
  lf.querySelectorAll('div.mt-6').forEach(d => { if (d.textContent.includes('Login Demo Cepat') || d.textContent.includes('Login default')) d.remove(); });
  const em = document.getElementById('loginEmail'); if (em && em.value === 'admin') em.value = '';
  const pw = document.getElementById('loginPassword'); if (pw && pw.value === 'admin123') pw.value = '';
  const rm = document.getElementById('rememberMe'); if (rm) rm.checked = false;
}

function injectMasterTabs() {
  const tabBar = document.querySelector('#page-master .border-b.border-app-border .flex');
  const panelContainer = document.querySelector('#page-master .p-4.md\\:p-6, #page-master .p-4');
  if (!tabBar || !panelContainer || tabBar.querySelector('[data-tab="jabatan"]')) return;
  [{tab:'jabatan',label:'👔 Jabatan'},{tab:'absen-setting',label:'📸 Absensi'},{tab:'log-konflik',label:'🔀 Log Konflik'}].forEach(({tab,label}) => {
    const b = document.createElement('button');
    b.className = 'master-tab px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 smooth';
    b.dataset.tab = tab; b.textContent = label;
    tabBar.appendChild(b);
  });
  const panels = {
    'jabatan': `<div><div class="flex justify-between mb-3 max-w-2xl"><h3 class="font-semibold text-sm">👔 Jabatan</h3><button onclick="window._tambahJabatan()" class="px-3 py-1.5 rounded-lg bg-primary text-white text-xs">+ Tambah</button></div><ul id="listJabatan" class="space-y-2 max-w-2xl"></ul></div>`,
    'absen-setting': `<div class="max-w-md space-y-4"><div><label class="text-xs font-medium text-slate-600 block mb-2">🗑️ Auto-Hapus Foto Absensi</label><select id="mAutoDelFoto" class="w-full px-3 py-2 rounded-lg border border-app-border text-sm"><option value="nonaktif">Nonaktif</option><option value="1">1 Bulan</option><option value="2">2 Bulan</option><option value="3">3 Bulan</option><option value="6">6 Bulan</option><option value="12">1 Tahun</option></select></div><button onclick="window._simpanAbsenSetting()" class="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold">💾 Simpan</button></div>`,
    'log-konflik': `<div><div class="flex justify-between mb-3"><h3 class="font-semibold text-sm">🔀 Log Konflik</h3><button onclick="window.loadLogKonflik()" class="px-3 py-1.5 rounded-lg bg-primary-soft text-primary text-xs font-semibold">⟳ Refresh</button></div><div id="logKonflikList" class="space-y-2"></div></div>`,
  };
  Object.entries(panels).forEach(([tab, html]) => {
    const div = document.createElement('div');
    div.className = 'master-panel hidden'; div.dataset.panel = tab; div.innerHTML = html;
    panelContainer.appendChild(div);
  });
}

function injectHapusFotoButtons() {
  const u = getUser(); if (!u || u.role !== 'owner') return;
  const list = document.getElementById('absensiList'); if (!list) return;
  list.querySelectorAll('[data-injected-foto]').forEach(x => x.remove());
  list.querySelectorAll(':scope > div').forEach((row, idx) => {
    if (row.querySelector('[data-injected-foto]')) return;
    const btn = document.createElement('button');
    btn.dataset.injectedFoto = '1';
    btn.className = 'ml-2 p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100';
    btn.title = 'Hapus foto';
    btn.textContent = '🗑️';
    btn.onclick = (e) => {
      e.stopPropagation();
      const tgl = document.getElementById('absensiTanggal')?.value || new Date().toISOString().slice(0,10);
      const d = getDb();
      const list2 = (d.absensi||[]).filter(a => a.tanggal === tgl);
      const abs = list2[idx];
      if (abs) window.hapusFotoAbsensi(abs.id);
    };
    row.querySelector('.flex-1')?.appendChild(btn);
  });
}

function injectPayrollEditButtons() {
  const tbody = document.getElementById('payrollTableBody'); if (!tbody) return;
  tbody.querySelectorAll('[data-injected-pay]').forEach(x => x.remove());
  tbody.querySelectorAll('tr').forEach(row => {
    if (row.querySelector('[data-injected-pay]')) return;
    const kid = row.querySelector('button')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (!kid) return;
    const d = getDb();
    const pay = (d.payroll||[]).find(p => p.karyawan_id === kid);
    const td = row.querySelector('td:last-child'); if (!td) return;
    const wrap = document.createElement('div');
    wrap.dataset.injectedPay = '1'; wrap.className = 'flex gap-1 justify-center';
    if (pay) wrap.innerHTML = `<button onclick="window.editPayrollItem('${pay.id}')" class="text-xs px-2 py-1 rounded bg-primary-soft text-primary font-medium">✏️ Edit</button><button onclick="window.generateSlipGaji('${pay.id}')" class="text-xs px-2 py-1 rounded bg-red-50 text-red-600 font-medium">📄 Slip</button>`;
    else wrap.innerHTML = `<span class="text-[10px] text-slate-400">Generate dulu</span>`;
    td.innerHTML = ''; td.appendChild(wrap);
  });
}

function injectAturAksesButtons() {
  if (!getUser()) return;
  const tbody = document.getElementById('masterUsersBody'); if (!tbody) return;
  tbody.querySelectorAll('tr').forEach(row => {
    if (row.querySelector('[data-injected-akses]')) return;
    const username = row.querySelector('.font-mono')?.textContent?.trim()?.split(' ')[0];
    if (!username) return;
    const d = getDb();
    const usr = (d.users||[]).find(x => x.username === username); if (!usr) return;
    const tdAksi = row.querySelector('td:last-child'); if (!tdAksi) return;
    const btn = document.createElement('button');
    btn.dataset.injectedAkses = '1';
    btn.className = 'p-1.5 rounded hover:bg-primary-soft text-primary';
    btn.title = 'Atur Akses'; btn.textContent = '🛡️';
    btn.onclick = (e) => { e.stopPropagation(); window.openAturAkses(usr.id); };
    tdAksi.insertBefore(btn, tdAksi.firstChild);
  });
}

window.renderJabatanList = function() {
  const el = document.getElementById('listJabatan'); if (!el) return;
  const d = getDb();
  const list = d.jabatan || [];
  el.innerHTML = list.length ? list.map((j,i) => `<li class="flex items-center gap-3 p-3 rounded-lg bg-slate-50"><span class="flex-1 text-sm font-medium">👔 ${j.nama}</span><button onclick="window._hapusJabatan(${i})" class="p-1 rounded hover:bg-red-50 text-red-500">🗑️</button></li>`).join('') : '<li class="text-center text-slate-400 text-sm py-4">Belum ada</li>';
};
window._tambahJabatan = function() {
  const nama = prompt('Nama jabatan baru:'); if (!nama) return;
  const d = getDb(); d.jabatan = d.jabatan || [];
  d.jabatan.push({ id: 'j_'+Date.now(), nama });
  saveDb(d); window.renderJabatanList(); toast('✅ Ditambahkan'); schedulePush();
};
window._hapusJabatan = function(idx) {
  showConfirm('Hapus Jabatan', 'Yakin?', () => {
    const d = getDb(); d.jabatan.splice(idx,1);
    saveDb(d); window.renderJabatanList(); toast('Dihapus', 'info'); schedulePush();
  });
};
window._simpanAbsenSetting = function() {
  const v = document.getElementById('mAutoDelFoto')?.value || 'nonaktif';
  const d = getDb(); d.master.absensi = d.master.absensi || {};
  d.master.absensi.auto_delete_foto = v;
  saveDb(d); toast('✅ Setting disimpan'); schedulePush(); cleanOldPhotos();
};

// ═══════════════════════════════════════════════════════════════
// HOOK SAVE via storage event + polling
// ═══════════════════════════════════════════════════════════════
window.addEventListener('storage', (e) => { if (e.key === DB_KEY) schedulePush(); });
let _lastDbStr = localStorage.getItem(DB_KEY);
setInterval(() => { const c = localStorage.getItem(DB_KEY); if (c !== _lastDbStr) { _lastDbStr = c; schedulePush(); } }, 3000);

// Master tab click handler
document.addEventListener('click', (e) => {
  if (e.target.classList?.contains('master-tab')) {
    document.querySelectorAll('.master-tab').forEach(b => { b.classList.remove('bg-primary','text-white'); b.classList.add('text-slate-600'); });
    e.target.classList.add('bg-primary','text-white'); e.target.classList.remove('text-slate-600');
    const tab = e.target.dataset.tab;
    document.querySelectorAll('.master-panel').forEach(p => p.classList.add('hidden'));
    document.querySelector(`.master-panel[data-panel="${tab}"]`)?.classList.remove('hidden');
    if (tab === 'jabatan') window.renderJabatanList();
    if (tab === 'log-konflik') window.loadLogKonflik();
  }
});

function applyInjections() {
  hideLoginDemo(); injectMasterTabs(); injectHapusFotoButtons(); injectPayrollEditButtons(); injectAturAksesButtons();
  if (document.getElementById('listJabatan') && !document.getElementById('listJabatan').children.length) window.renderJabatanList();
  const sel = document.getElementById('mAutoDelFoto');
  if (sel) { const d = getDb(); sel.value = d?.master?.absensi?.auto_delete_foto || 'nonaktif'; }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    applyInjections();
    const u = getUser();
    if (u) { startRealtime(); setSyncStatus('connected'); setTimeout(() => pullFromCloud(true), 1500); setTimeout(cleanOldPhotos, 3000); }
  }, 800);
  new MutationObserver(() => { if (getUser()) applyInjections(); }).observe(document.body, { childList:true, subtree:true });
  setInterval(() => { if (getUser()) applyInjections(); }, 2500);
});

setInterval(() => { if (getUser()) pullFromCloud(true); }, CFG.HEARTBEAT_MS);

setTimeout(() => {
  applyInjections();
  const u = getUser();
  if (u) { startRealtime(); setSyncStatus('connected'); setTimeout(() => pullFromCloud(true), 1500); }
}, 2000);

console.log('%c🔌 Self-Contained Patch loaded — no bridge needed', 'color:#00C9A7;font-size:14px;font-weight:bold');
console.log('%c📱 Device: ' + getDeviceId(), 'color:#00A88E;font-size:11px');

})();