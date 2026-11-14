# Lumen HD

Website penjernih foto (HD upscale) dengan tampilan glassmorphism hitam-putih.

## Cara menjalankan
1. Pasang Node.js versi 18 atau lebih baru.
2. Di folder ini jalankan: `node server.js`
3. Buka http://localhost:3000

Tidak perlu `npm install`. API key ada di `server.js` (atau set `API_KEY` dan `API_URL` lewat environment) sehingga tidak terlihat di browser.

## Fitur
- Tarik & lepas, pilih file, atau tempel (Ctrl+V), banyak foto sekaligus
- Skala 2x, 3x, 4x
- Slider banding Asli vs HD, zoom 1x-6x (ikut kursor), geser pakai panah keyboard
- Proses satu per satu atau semua (2 foto paralel), ulangi, hapus
- Unduh satu foto atau semua dalam ZIP
