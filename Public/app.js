const $ = s => document.querySelector(s);
const st = { items: [], sel: null, scale: 3, zoom: 1, busyTick: null };
const OK = ['image/jpeg', 'image/png', 'image/webp'], MAX = 10 * 1024 * 1024;
let uid = 0;
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = b => b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(2) + ' MB';
const cur = () => st.items.find(i => i.id === st.sel);

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 4200);
}
function dims(url) {
  return new Promise(r => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r([0, 0]); im.src = url; });
}
function readDataUrl(file) {
  return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Foto tidak bisa dibaca')); r.readAsDataURL(file); });
}

async function addFiles(files) {
  let added = 0;
  for (const f of files) {
    if (!OK.includes(f.type)) { toast(`${f.name}: format tidak didukung`); continue; }
    if (f.size > MAX) { toast(`${f.name}: lebih dari 10 MB`); continue; }
    const it = { id: ++uid, file: f, name: f.name, url: URL.createObjectURL(f), size: f.size, status: 'idle' };
    st.items.push(it); added++;
    dims(it.url).then(([w, h]) => { it.w = w; it.h = h; if (st.sel === it.id) meta(); });
    if (!st.sel) st.sel = it.id;
  }
  if (added) toast(`${added} foto ditambahkan`);
  render(); show();
}

async function run(it) {
  if (it.status === 'busy') return;
  Object.assign(it, { status: 'busy', error: '', t0: Date.now(), scaleUsed: st.scale });
  render(); show();
  try {
    const image = await readDataUrl(it.file);
    const r = await fetch('/api/upscale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, scale: String(st.scale), name: it.name }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'Server error ' + r.status);
    const blob = await (await fetch(j.image)).blob();
    if (it.result) URL.revokeObjectURL(it.result);
    it.result = URL.createObjectURL(blob); it.rsize = blob.size; it.rtype = blob.type;
    [it.rw, it.rh] = await dims(it.result);
    it.status = 'done'; toast(`${it.name} selesai`);
  } catch (e) { it.status = 'error'; it.error = e.message; toast(`Gagal: ${e.message}`); }
  render(); show();
}
async function runAll() {
  const q = st.items.filter(i => i.status !== 'done' && i.status !== 'busy');
  if (!q.length) return toast('Semua foto sudah selesai');
  await Promise.all([0, 1].map(async () => { while (q.length) await run(q.shift()); }));
}

function render() {
  const l = $('#list');
  l.innerHTML = st.items.length ? '' : '<p class="empty">Belum ada foto. Tambahkan foto untuk memulai.</p>';
  for (const it of st.items) {
    const d = document.createElement('div');
    d.className = 'item' + (it.id === st.sel ? ' sel' : ''); d.dataset.id = it.id;
    const sec = it.t0 ? Math.round((Date.now() - it.t0) / 1000) : 0;
    const status = { idle: fmt(it.size) + ' · siap', busy: `Memproses… ${sec} dtk`, done: `HD ${it.scaleUsed}x · ${it.rw}×${it.rh}`, error: it.error }[it.status];
    d.innerHTML = `<img src="${it.result || it.url}" alt=""><div><div class="n">${esc(it.name)}</div><div class="s ${it.status === 'error' ? 'err' : ''}" title="${esc(it.error || '')}">${esc(status)}</div>${it.status === 'busy' ? '<div class="prog"></div>' : ''}</div>
      <div class="acts">${it.status === 'busy' ? '' : `<button data-a="run" title="${it.status === 'done' ? 'Ulangi' : 'Jernihkan'}">${it.status === 'done' ? '↻' : '✦'}</button>`}${it.status === 'done' ? '<button data-a="dl" title="Unduh">↓</button>' : ''}<button data-a="rm" title="Hapus">×</button></div>`;
    l.append(d);
  }
  const done = st.items.some(i => i.status === 'done');
  $('#zipAll').disabled = !done; $('#clear').disabled = !st.items.length;
  clearInterval(st.busyTick);
  if (st.items.some(i => i.status === 'busy')) st.busyTick = setInterval(render, 1000);
}

function meta() {
  const it = cur(); if (!it) return ($('#meta').textContent = '');
  $('#meta').textContent = it.status === 'done'
    ? `${it.w}×${it.h} (${fmt(it.size)}) → ${it.rw}×${it.rh} (${fmt(it.rsize)})`
    : it.w ? `${it.w}×${it.h} · ${fmt(it.size)}` : '';
}

let pos = 50;
function show() {
  const it = cur(), s = $('#stage');
  $('#dl').disabled = !(it && it.status === 'done'); meta();
  if (!it) { s.innerHTML = '<p class="empty">Pilih foto dari daftar untuk melihat hasilnya.</p>'; return; }
  if (it.status === 'done') {
    s.innerHTML = `<div class="zw" id="zw"><img src="${it.result}" alt="Hasil HD"><img class="before" src="${it.url}" alt="Foto asli"></div><span class="chip l">Asli</span><span class="chip r">HD ${it.scaleUsed}x</span><div class="handle" id="hd"></div>`;
  } else {
    s.innerHTML = `<div class="zw" id="zw"><img src="${it.url}" alt="Foto asli"></div>${it.status === 'busy' ? '<div class="busy-layer">Sedang dijernihkan…</div>' : ''}`;
  }
  setPos(pos); setZoom(st.zoom);
}
function setPos(p) { pos = Math.max(0, Math.min(100, p)); $('#stage').style.setProperty('--p', pos + '%'); }
function setZoom(z) {
  st.zoom = Math.max(1, Math.min(6, z));
  $('#stage').style.setProperty('--z', st.zoom); $('#zl').textContent = st.zoom + 'x';
}

// Slider before/after + zoom ikut posisi kursor
const stage = $('#stage'); let drag = false;
const xPct = e => { const r = stage.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; };
stage.addEventListener('pointerdown', e => { if (cur()?.status === 'done') { drag = true; stage.setPointerCapture(e.pointerId); setPos(xPct(e)); } });
stage.addEventListener('pointermove', e => {
  if (drag) return setPos(xPct(e));
  if (st.zoom > 1) { const r = stage.getBoundingClientRect(); stage.style.setProperty('--ox', (e.clientX - r.left) / r.width * 100 + '%'); stage.style.setProperty('--oy', (e.clientY - r.top) / r.height * 100 + '%'); }
});
stage.addEventListener('pointerup', () => drag = false);
stage.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') setPos(pos - 4); if (e.key === 'ArrowRight') setPos(pos + 4); });
stage.addEventListener('wheel', e => { if (e.ctrlKey || e.shiftKey) { e.preventDefault(); setZoom(st.zoom + (e.deltaY < 0 ? 1 : -1)); } }, { passive: false });
$('#zi').onclick = () => setZoom(st.zoom + 1); $('#zo').onclick = () => setZoom(st.zoom - 1);

// Unduh
const outName = it => it.name.replace(/\.\w+$/, '') + `_hd${it.scaleUsed}x.` + (it.rtype === 'image/jpeg' ? 'jpg' : it.rtype === 'image/webp' ? 'webp' : 'png');
function download(it) { const a = document.createElement('a'); a.href = it.result; a.download = outName(it); a.click(); }
$('#dl').onclick = () => { const it = cur(); if (it?.status === 'done') download(it); };
$('#zipAll').onclick = async () => {
  const done = st.items.filter(i => i.status === 'done');
  if (!window.JSZip) { done.forEach(download); return toast('JSZip tidak termuat, foto diunduh satuan'); }
  const zip = new JSZip();
  for (const it of done) zip.file(outName(it), await (await fetch(it.result)).blob());
  const a = document.createElement('a'); a.href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
  a.download = 'lumen-hd.zip'; a.click(); toast(`${done.length} foto diunduh dalam ZIP`);
};

// Daftar
$('#list').addEventListener('click', e => {
  const row = e.target.closest('.item'); if (!row) return;
  const it = st.items.find(i => i.id == row.dataset.id), a = e.target.closest('button')?.dataset.a;
  if (a === 'run') return run(it);
  if (a === 'dl') return download(it);
  if (a === 'rm') { URL.revokeObjectURL(it.url); it.result && URL.revokeObjectURL(it.result); st.items = st.items.filter(i => i !== it); if (st.sel === it.id) st.sel = st.items[0]?.id || null; render(); return show(); }
  st.sel = it.id; render(); show();
});
$('#runAll').onclick = runAll;
$('#clear').onclick = () => { st.items.forEach(i => { URL.revokeObjectURL(i.url); i.result && URL.revokeObjectURL(i.result); }); st.items = []; st.sel = null; render(); show(); };
$('#scale').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.scale = +b.dataset.s; document.querySelectorAll('#scale button').forEach(x => x.classList.toggle('on', x === b)); };

// Input: klik, drag & drop, tempel
const drop = $('#drop');
$('#file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } };
['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || e.target === document.documentElement) drop.classList.remove('over'); }));
window.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
window.addEventListener('paste', e => addFiles([...e.clipboardData.files]));
