# YouTube Music -> local inbox

Personal-use sync: new tracks from a YT Music playlist are downloaded as MP3
(with title/artist/cover embedded) and imported into the player automatically.

## Requirements

Already installed on this machine: Python 3.11, `yt-dlp`, `ffmpeg`.

`yt-dlp`/`ffmpeg` tidak perlu ada di PATH: script mencari di PATH dulu, lalu di
lokasi instalasi winget/scoop/Python Scripts. Ini perlu karena dev server yang
dijalankan dari IDE (Antigravity, VS Code) sering dapat PATH yang lebih sempit.
Kalau dua-duanya tetap tidak ketemu, kartu UI menampilkan pesan install-nya.

## Cara pakai (utama)

1. Jalankan app dengan **Vite dev server**:

   ```
   npm run dev
   ```

   Bridge API lokal (`/api/playlist`, `/api/sync/status`) cuma jalan lewat Vite,
   jadi jangan buka `dist/` langsung lewat server statis lain.

2. Buka salah satu **playlist** di sidebar (bukan Library). Kartu **YouTube
   Music Playlist** cuma muncul di tampilan playlist. Tempel link playlist, klik
   **Simpan & Unduh**. Kartu menampilkan progress persen,
   jumlah track, dan judul lagu yang sedang diunduh. Tombol **Batal** menghentikan
   unduhan (proses `yt-dlp`/`ffmpeg` ikut dimatikan); lagu yang sudah selesai
   tetap masuk library, run berikutnya melanjutkan sisanya. Begitu selesai, track
   yang ada di playlist itu masuk ke playlist tersebut (juga tersimpan di
   IndexedDB, jadi bisa diputar tanpa sinyal).

   Kalau satu lagu gagal (YouTube sering balas 403/503 saat sync panjang), itu
   tidak menghentikan sisanya: error aslinya muncul di kartu, dan klik
   **Sinkronkan** lagi cuma mengunduh yang belum berhasil.

   Lagu hasil sync **cuma muncul di playlist itu** — Home, Albums, Artists, dan
   Liked tetap berisi lagu yang lo tambah sendiri. Kalau browser di-refresh,
   lagu terakhir dipulihkan di posisi terakhir dalam keadaan pause.

   Playlist kosong tetap terisi walau semua lagunya sudah pernah diunduh: satu
   klik **Sinkronkan** memindahkan daftar lagu dari run yang selesai ke playlist
   itu (status berakhir "Playlist siap — N lagu"). Selama sync, urutannya:
   "Mengambil daftar lagu…" → "Mengunduh n%" → "Menyiapkan lirik & daftar
   lagu…" (kalau tidak ada yang perlu diunduh).

3. Link **per playlist**: tiap playlist punya cantolannya sendiri. Link yang
   sudah disimpan tetap tertaut di kartu playlist itu — buka app lagi, kartunya
   menampilkan "Playlist tertaut" + tombol **Sinkronkan** (tanpa paste ulang)
   dan **Ganti link** kalau mau playlist lain. Link ikut tersimpan di
   preferensi browser (`localStorage`), jadi tetap ada walau browser di-refresh
   atau dev server di-restart. Cuma video ID baru yang diunduh.

4. **Lirik otomatis.** Setelah unduhan, tiap lagu dicari lirik tersinkronnya di
   [LRCLIB](https://lrclib.net) (gratis, tanpa API key). Hasilnya disimpan di
   `scripts/lyrics.json` (cache per video ID, jadi tidak dicari ulang) dan
   ditulis ke `manifest.json`, lalu dipasang app saat import/restore. Lagu yang
   tidak ada di LRCLIB (rilis underground, remix, edit) tampil tanpa lirik —
   panel lirik masih bisa diisi manual lewat editor yang sudah ada.
   Pencarian judul tidak cukup: nama artis harus cocok (boleh sebagian, jadi
   `cutback! - Topic` cocok dengan `cutback!`), atau judulnya persis sama dan
   durasinya beda ≤ 1 detik. Tanpa syarat itu, lagu berjudul sama milik artis
   lain ikut kepakai (contoh: "Love Somebody" dapat lirik punya Moncrieff).
   Lirik yang salah lebih buruk daripada tidak ada, jadi yang tidak lolos
   dibiarkan kosong. Kalau lirik terasa bergeser sedikit (video YouTube beda
   edit dengan master LRCLIB), pakai tombol `−` / `+` di header panel lirik —
   offset disimpan per lagu.

## Auto-sync via Task Scheduler (opsional)

Kalau mau download jalan sendiri tanpa buka app, daftarin job Windows:

```powershell
$a = New-ScheduledTaskAction `
  -Execute "C:\Users\rexna\AppData\Local\Programs\Python\Python311\python.exe" `
  -Argument "C:\projects\website\msc\scripts\sync_playlist.py" `
  -WorkingDirectory "C:\projects\website\msc"
$t = New-ScheduledTaskTrigger -Daily -At 07:00
Register-ScheduledTask -TaskName "monolith-yt-sync" -Action $a -Trigger $t -Force
```

Kartu UI tetap jalan buat nambah/ganti link; Task Scheduler tinggal mengunduh
perubahan terbaru sesuai jadwal.

## Catatan / batas

- Identitas track = YouTube video ID (`yt::<id>`), jadi gak bakal dobel.
- `yt-dlp` bisa rusak kalau YouTube ubah player; refresh pakai
  `winget upgrade yt-dlp`.
- Download YouTube melanggar ToS; ini murni pemakaian pribadi/offline.
- Kalau job UI dan job Task Scheduler kebetulan bersamaan, dua proses bisa
  nulis manifest bareng — sebaiknya jangan jalankan keduanya di menit yang sama.
- Kalau ada unduhan gagal, pesan aslinya muncul di kartu UI. Log mentah ada di
  `scripts/sync.log`, status terkini di `scripts/sync_status.json`.
