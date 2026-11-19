"""Sync a YouTube Music playlist into the player's local inbox.

Setup: install yt-dlp + ffmpeg (winget or scoop). They do not need to be on
PATH — the script looks in the usual Windows install locations when `where`
fails, because IDE-launched dev servers often have a reduced PATH.
Usage: paste the playlist URL into playlist.txt (or use the app UI), then run:
    python scripts/sync_playlist.py

Only new video IDs are downloaded; already-synced IDs are kept in
downloaded_ids.json. Progress/errors are written to sync_status.json, which the
dev-server bridge exposes at GET /api/sync/status.
"""
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# the console/log stream is cp1252 on Windows, but YouTube titles are not
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
URL_FILE = HERE / "playlist.txt"
STATE_FILE = HERE / "downloaded_ids.json"
STATUS_FILE = HERE / "sync_status.json"
LYRICS_FILE = HERE / "lyrics.json"
INBOX = ROOT / "public" / "inbox"
INBOX.mkdir(parents=True, exist_ok=True)

PERCENT_RE = re.compile(r"\[download\]\s+(\d+(?:\.\d+)?)%")
_last_status_write = 0.0
# yt-dlp/ffmpeg are console apps; without this each call flashes a console window
# when the dev-server bridge launches Python detached (no console to inherit).
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def find_binary(name, patterns):
    """PATH first, then the usual Windows install spots.

    IDEs (Antigravity, VS Code) often launch the dev server with a PATH that
    lacks winget/scoop shims, so resolving by name alone is not enough.
    """
    found = shutil.which(name)
    if found:
        return found
    for pattern in patterns:
        for candidate in sorted(glob.glob(pattern), reverse=True):
            if Path(candidate).is_file():
                return candidate
    return ""


_L = os.environ.get("LOCALAPPDATA", "")
_U = os.environ.get("USERPROFILE", "")
YT_DLP = find_binary("yt-dlp", [
    str(Path(_L) / "Microsoft" / "WinGet" / "Links" / "yt-dlp.exe"),
    str(Path(_L) / "Microsoft" / "WinGet" / "Packages" / "yt-dlp.yt-dlp_*" / "yt-dlp.exe"),
    str(Path(_U) / "scoop" / "shims" / "yt-dlp.exe"),
    str(Path(_L) / "Programs" / "Python" / "Python*" / "Scripts" / "yt-dlp.exe"),
])
FFMPEG = find_binary("ffmpeg", [
    str(Path(_L) / "Microsoft" / "WinGet" / "Links" / "ffmpeg.exe"),
    str(Path(_L) / "Microsoft" / "WinGet" / "Packages" / "Gyan.FFmpeg_*" / "ffmpeg-*" / "bin" / "ffmpeg.exe"),
    str(Path(_U) / "scoop" / "shims" / "ffmpeg.exe"),
])


def write_status(running, percent=0.0, current="", done=0, total=0, error=""):
    global _last_status_write
    payload = {
        "running": running,
        "percent": round(float(percent), 1),
        "current": current,
        "done": int(done),
        "total": int(total),
        "error": error,
    }
    tmp = STATUS_FILE.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, STATUS_FILE)
        _last_status_write = time.monotonic()
    except OSError:
        pass


def read_url():
    for line in URL_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            return line
    return ""


def run(args):
    return subprocess.run(
        args, capture_output=True, text=True, encoding="utf-8", errors="replace",
        creationflags=NO_WINDOW,
    )


def list_entries(url):
    proc = run(
        [YT_DLP, "--flat-playlist", "--dump-json", "--skip-download",
         "--no-warnings", url]
    )
    items = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        vid = data.get("id")
        if vid:
            items.append({
                "id": vid,
                "title": data.get("title") or vid,
                "artist": data.get("artist") or data.get("uploader") or "",
                "album": data.get("album") or "",
                "duration": data.get("duration") or 0,
            })
    return items, proc.stderr[-500:].strip()


LRCLIB = "https://lrclib.net/api"
TITLE_NOISE = re.compile(
    r"\s*[(\[](official|lyrics?|audio|video|visuali[sz]er|m/v|mv)[^)\]]*[)\]]",
    re.I,
)


def load_lyrics_cache():
    try:
        data = json.loads(LYRICS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_lyrics_cache(cache):
    try:
        LYRICS_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def lrclib_json(url):
    request = urllib.request.Request(
        url, headers={"User-Agent": "msc-local-player (personal use)"}
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize(text):
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def artist_matches(wanted, candidate):
    w, c = normalize(wanted), normalize(candidate)
    if not w or not c:
        return False
    return w in c or c in w


def fetch_lyrics(title, artist, duration):
    """Synced lyrics from LRCLIB. '' = not found, None = lookup failed (retry later)."""
    clean_title = TITLE_NOISE.sub("", title).strip() or title
    clean_artist = re.sub(r"\s*-\s*topic$", "", artist or "", flags=re.I).strip()
    seconds = int(round(duration)) if duration else 0

    if seconds and clean_artist:
        params = {
            "track_name": clean_title, "artist_name": clean_artist,
            "duration": seconds,
        }
        try:
            data = lrclib_json(f"{LRCLIB}/get?{urllib.parse.urlencode(params)}")
            lrc = (data.get("syncedLyrics") or "").strip()
            if lrc:
                return lrc
        except urllib.error.HTTPError as error:
            if error.code >= 500:
                return None
        except Exception:
            return None

    # YouTube channel names ("SaintEtienneOfficial") rarely match, so search by
    # title and keep the version whose length is closest to the video
    try:
        results = lrclib_json(
            f"{LRCLIB}/search?" + urllib.parse.urlencode({"q": clean_title})
        )
    except Exception:
        return None
    if not isinstance(results, list):
        return None

    def rank(item):
        item_duration = item.get("duration") or 0
        delta = abs(item_duration - seconds) if seconds and item_duration else 999
        return (
            0 if (item.get("syncedLyrics") or "").strip() else 1,
            delta,
            0 if artist_matches(clean_artist, item.get("artistName")) else 1,
        )

    for item in sorted(results, key=rank):
        lrc = (item.get("syncedLyrics") or "").strip()
        if not lrc:
            continue
        item_duration = item.get("duration") or 0
        # same song, not a remix/extended version with different timing
        if seconds and item_duration and abs(item_duration - seconds) > 5:
            continue
        same_song = normalize(clean_title) == normalize(item.get("trackName"))
        # wrong lyrics are worse than no lyrics: a same-title song by another
        # artist only counts when it has the exact same length
        if not artist_matches(clean_artist, item.get("artistName")) and not (
            same_song and item_duration and abs(item_duration - seconds) <= 1
        ):
            continue
        return lrc
    return ""


def attach_lyrics(entries, percent, done, total, only_missing=True):
    cache = load_lyrics_cache()
    pending = [
        e for e in entries
        if not (only_missing and e["id"] in cache)
    ]
    if not pending:
        return cache
    for index, entry in enumerate(pending, 1):
        write_status(True, percent, f"Mencari lirik {index}/{len(pending)}", done, total)
        result = fetch_lyrics(entry["title"], entry["artist"], entry["duration"])
        if result is None:
            continue  # network hiccup / rate limit: try again next sync
        cache[entry["id"]] = result
        time.sleep(0.15)
        if index % 10 == 0:
            save_lyrics_cache(cache)
    save_lyrics_cache(cache)
    return cache


RETRY_FLAGS = [
    "--retries", "10", "--fragment-retries", "10",
    "--retry-sleep", "5", "--extractor-retries", "3",
]


def error_text(lines):
    # yt-dlp can print "ERROR:" alone and put the message on the next line
    start = next(
        (i for i in range(len(lines) - 1, -1, -1) if "ERROR" in lines[i]),
        max(len(lines) - 2, 0),
    )
    text = " ".join(lines[start:])
    return text.replace(str(INBOX) + "\\", "").strip()[:300]


def spawn_download(args, entry, base_count, total, report):
    proc = subprocess.Popen(
        args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", bufsize=1,
        creationflags=NO_WINDOW,
    )
    tail = []
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            tail.append(line)
            del tail[:-8]
        match = PERCENT_RE.search(line)
        if report and match and total:
            if time.monotonic() - _last_status_write >= 0.3:
                frac = float(match.group(1)) / 100
                overall = ((base_count + frac) / total) * 100
                write_status(True, min(overall, 99.9), entry["title"],
                             base_count, total)
    return proc.wait(), tail


def download(entry, base_count, total):
    vid = entry["id"]
    args = [
        YT_DLP, "--no-playlist", "--newline", "--no-warnings", *RETRY_FLAGS,
        "-x", "--audio-format", "mp3", "--audio-quality", "0", "--add-metadata",
        "-o", str(INBOX / "%(id)s.%(ext)s"),
    ]
    if FFMPEG:
        args += ["--ffmpeg-location", str(Path(FFMPEG).parent)]
    url = f"https://www.youtube.com/watch?v={vid}"

    code, tail = spawn_download(
        args + ["--embed-thumbnail", url], entry, base_count, total, True
    )
    if code != 0 and "403" in " ".join(tail):
        # YouTube 403s thumbnail fetches during long syncs; audio itself is fine
        code, tail = spawn_download(args + [url], entry, base_count, total, False)

    for path in INBOX.glob(f"{vid}.*"):
        if path.suffix.lower() != ".mp3":
            path.unlink(missing_ok=True)

    audio = INBOX / f"{vid}.mp3"
    if code == 0:
        return True, ""
    if audio.exists() and audio.stat().st_size > 0:
        return True, ""  # audio landed, only the cover art failed
    return False, error_text(tail) or f"yt-dlp exit {code}"


def write_manifest(entries, url, lyrics):
    manifest = []
    for entry in entries:
        audio = INBOX / f"{entry['id']}.mp3"
        if audio.exists():
            manifest.append({
                "id": entry["id"],
                "file": audio.name,
                "size": audio.stat().st_size,
                "duration": entry.get("duration") or 0,
                "title": entry["title"],
                "artist": entry["artist"],
                "album": entry["album"],
                "lyrics": lyrics.get(entry["id"], ""),
                # which playlist this file came from, so the app can rebuild
                # playlist membership from disk without asking the bridge
                "source": url,
            })

    # a run only knows its own playlist, but the app restores the whole library
    # from this file, so tracks from earlier playlists must survive
    fresh = {item["id"] for item in manifest}
    try:
        previous = json.loads((INBOX / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previous = []
    for old in previous if isinstance(previous, list) else []:
        path = INBOX / str(old.get("file", ""))
        if old.get("id") in fresh or not path.is_file():
            continue
        old["size"] = path.stat().st_size
        manifest.append(old)

    (INBOX / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # which tracks belong to the playlist that just ran, so the app can put
    # them in that playlist instead of guessing from the whole inbox
    (INBOX / "playlist.json").write_text(
        json.dumps({"url": url, "ids": sorted(fresh)}, ensure_ascii=False),
        encoding="utf-8",
    )
    return manifest


def main():
    url = read_url()
    if not url:
        write_status(False, error="Link playlist masih kosong")
        print("Paste your YouTube Music playlist URL into scripts/playlist.txt")
        return 1

    if not YT_DLP:
        write_status(
            False,
            error="yt-dlp tidak ditemukan. Install: winget install yt-dlp.yt-dlp",
        )
        return 1
    if not FFMPEG:
        write_status(
            False,
            error="ffmpeg tidak ditemukan. Install: winget install Gyan.FFmpeg",
        )
        return 1

    # a cancelled run leaves partial downloads behind; never let those reach
    # the manifest (a 0-byte .mp3 would import as an unplayable track)
    for stale in INBOX.iterdir():
        if stale.name not in ("manifest.json", "playlist.json") and (
            stale.suffix.lower() != ".mp3" or stale.stat().st_size == 0
        ):
            stale.unlink(missing_ok=True)

    done = set()
    if STATE_FILE.exists():
        try:
            done = set(json.loads(STATE_FILE.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            done = set()

    entries, list_error = list_entries(url)
    if not entries:
        write_status(False, error=f"Gagal baca playlist: {list_error or 'kosong'}")
        print("No entries found in playlist", file=sys.stderr)
        return 1

    total = len(entries)
    fresh = [e for e in entries if e["id"] not in done]
    already = total - len(fresh)
    write_status(True, already / total * 100, "", already, total)

    failed = []
    for index, entry in enumerate(fresh):
        base_count = already + index
        write_status(True, base_count / total * 100, entry["title"],
                     base_count, total)
        print("downloading:", entry["title"])
        ok, error = download(entry, base_count, total)
        if ok:
            done.add(entry["id"])
            STATE_FILE.write_text(json.dumps(sorted(done), indent=2),
                                  encoding="utf-8")
        else:
            failed.append(f"{entry['title']}: {error}")
            print("  failed:", error, file=sys.stderr)
        write_status(True, (base_count + 1) / total * 100, entry["title"],
                     base_count + 1, total)

    lyrics = attach_lyrics(entries, 100.0, total, total)
    manifest = write_manifest(entries, url, lyrics)
    if failed:
        playlist_done = sum(1 for e in entries if e["id"] in done)
        message = f"{len(failed)} lagu gagal diunduh. " + " | ".join(failed[:2])
        write_status(
            False, playlist_done / total * 100, "", playlist_done, total, message
        )
        print(message, file=sys.stderr)
        return 1

    write_status(False, 100.0, "", total, total, "")
    print(f"Synced {len(manifest)}/{total} tracks -> {INBOX}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        import traceback
        traceback.print_exc()
        write_status(False, error=traceback.format_exc().strip().splitlines()[-1])
        sys.exit(1)
