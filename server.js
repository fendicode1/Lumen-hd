// Lumen HD - server tanpa dependensi (Node 18+). Jalankan: node server.js
// API key disimpan di server supaya tidak terlihat di browser.
const http = require('http'), fs = require('fs'), path = require('path');

const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'https://api.jerexd.my.id/api/tools/hd3';
const API_KEY = process.env.API_KEY || 'HzFep3FTTppPIVlR';
const MAX_BODY = 30 * 1024 * 1024;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const toDataUrl = (buf, type) => `data:${type || 'image/png'};base64,${Buffer.from(buf).toString('base64')}`;

// Cari URL / base64 gambar di dalam respons JSON apa pun bentuknya.
function findImage(o) {
  if (typeof o === 'string') {
    if (/^data:image\//.test(o) || /^https?:\/\//.test(o)) return o;
    if (o.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(o)) return 'data:image/png;base64,' + o.replace(/\s/g, '');
    return null;
  }
  if (o && typeof o === 'object') for (const v of Object.values(o)) { const r = findImage(v); if (r) return r; }
  return null;
}

async function readResult(res) {
  const type = res.headers.get('content-type') || '';
  if (type.startsWith('image/')) return toDataUrl(await res.arrayBuffer(), type);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { throw new Error(text.slice(0, 160) || 'respons kosong'); }
  const found = findImage(json);
  if (!found) throw new Error(json.message || json.error || JSON.stringify(json).slice(0, 160));
  if (found.startsWith('data:')) return found;
  const img = await fetch(found);
  if (!img.ok) throw new Error('Gagal mengunduh hasil (' + img.status + ')');
  return toDataUrl(await img.arrayBuffer(), img.headers.get('content-type'));
}

// Beberapa format permintaan dicoba berurutan sampai ada yang berhasil.
async function upscale(buf, mime, name, scale) {
  const url = `${API_URL}?apikey=${encodeURIComponent(API_KEY)}`;
  const multipart = field => () => {
    const f = new FormData();
    f.append(field, new Blob([buf], { type: mime }), name);
    f.append('scale', scale);
    return fetch(url, { method: 'POST', body: f });
  };
  const asJson = key => () => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: toDataUrl(buf, mime), scale })
  });
  const attempts = [multipart('image'), multipart('file'), asJson('image'), asJson('base64')];
  let lastErr = 'tidak ada respons';
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (res.status === 401 || res.status === 403) throw new Error('API key ditolak (' + res.status + ')');
      if (!res.ok) { lastErr = 'API error ' + res.status; continue; }
      return await readResult(res);
    } catch (e) { lastErr = e.message; if (/API key/.test(lastErr)) break; }
  }
  throw new Error(lastErr);
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { fail(new Error('Ukuran foto terlalu besar')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/upscale') {
    try {
      const { image, scale = '3', name = 'foto.jpg' } = JSON.parse((await readBody(req)).toString());
      const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(image || '');
      if (!m) return send(res, 400, { ok: false, error: 'Format foto tidak valid' });
      const out = await upscale(Buffer.from(m[2], 'base64'), m[1], name, String(scale));
      send(res, 200, { ok: true, image: out });
    } catch (e) { send(res, 502, { ok: false, error: e.message }); }
    return;
  }
  const file = path.join(PUB, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Lumen HD berjalan di http://localhost:${PORT}`));
