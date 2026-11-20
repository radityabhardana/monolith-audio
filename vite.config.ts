import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { extname, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';

const PLAYLIST_FILE = resolve(process.cwd(), 'scripts', 'playlist.txt');
const SYNC_SCRIPT = resolve(process.cwd(), 'scripts', 'sync_playlist.py');
const STATUS_FILE = resolve(process.cwd(), 'scripts', 'sync_status.json');
const LOG_FILE = resolve(process.cwd(), 'scripts', 'sync.log');
const INBOX_DIR = resolve(process.cwd(), 'public', 'inbox');
const PLAYLIST_JSON = resolve(INBOX_DIR, 'playlist.json');
const STATE_FILE = resolve(process.cwd(), 'scripts', 'app_state.json');
const PLAYBACK_FILE = resolve(process.cwd(), 'scripts', 'playback_state.json');
const MAX_STATE_BYTES = 25 * 1024 * 1024;
const MAX_PLAYBACK_BYTES = 16 * 1024;

const INBOX_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.json': 'application/json; charset=utf-8',
  '.lrc': 'text/plain; charset=utf-8',
};

interface SyncStatus {
  running: boolean;
  percent: number;
  current: string;
  done: number;
  total: number;
  error: string;
}

// Lets the UI hand a playlist URL to the local Python downloader and read its progress.
function playlistBridge(): Plugin {
  let running = false;
  let lastError = '';
  let activeChild: ChildProcess | null = null;
  let cancelled = false;
  let currentRunId = 0;
  // ids of the run that just finished; memory-only so a restarted bridge
  // never hands an old run's tracks to a playlist
  let lastIds: string[] = [];

  const readUrl = (): string => {
    try {
      return (
        readFileSync(PLAYLIST_FILE, 'utf8')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith('#')) ?? ''
      );
    } catch {
      return '';
    }
  };

  const writeStatus = (status: SyncStatus) => {
    try {
      writeFileSync(STATUS_FILE, JSON.stringify(status), 'utf8');
    } catch {
      // status file is best-effort
    }
  };

  const readStatus = (): Partial<SyncStatus> => {
    try {
      return JSON.parse(readFileSync(STATUS_FILE, 'utf8')) as Partial<SyncStatus>;
    } catch {
      return {};
    }
  };

  // playlist.json is written at the end of the run, so its ids are the ones the
  // app should put into the playlist that started this run
  const readRunIds = (url: string): string[] => {
    try {
      const data = JSON.parse(readFileSync(PLAYLIST_JSON, 'utf8')) as {
        url?: string;
        ids?: unknown;
      };
      if (data.url !== url || !Array.isArray(data.ids)) return [];
      return data.ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
    } catch {
      return [];
    }
  };

  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data));
  };

  const writeJsonAtomic = (filePath: string, data: unknown) => {
    const tmpPath = `${filePath}.tmp`;
    try {
      writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
      renameSync(tmpPath, filePath);
    } catch (error) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // ignore cleanup failure
      }
      throw error;
    }
  };

  const readJsonBody = (
    req: IncomingMessage,
    maxBytes: number,
    onDone: (
      result:
        | { ok: true; data: unknown }
        | { ok: false; status: number; error: string }
    ) => void
  ) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;
    let settled = false;
    const finish = (
      result:
        | { ok: true; data: unknown }
        | { ok: false; status: number; error: string }
    ) => {
      if (settled) return;
      settled = true;
      onDone(result);
    };
    req.on('data', (chunk: Buffer | string) => {
      if (tooLarge || settled) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(buf);
    });
    req.on('error', () => {
      finish({ ok: false, status: 400, error: 'Gagal membaca body request' });
    });
    req.on('end', () => {
      if (tooLarge) {
        finish({ ok: false, status: 413, error: 'Payload terlalu besar' });
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        finish({ ok: true, data: JSON.parse(raw) });
      } catch {
        finish({ ok: false, status: 400, error: 'JSON tidak valid' });
      }
    });
  };

  const handler = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    const path = (req.url ?? '').split('?')[0];

    // Vite 6 caches `public/` at startup when watcher ignores `public/inbox/**`,
    // so newly downloaded MP3s would otherwise fall through to index.html.
    if (path.startsWith('/inbox/') && (req.method === 'GET' || req.method === 'HEAD')) {
      let rel = '';
      try {
        rel = decodeURIComponent(path.slice('/inbox/'.length));
      } catch {
        res.statusCode = 400;
        res.end();
        return;
      }
      if (!rel || rel.includes('/') || rel.includes('\\') || rel.includes('..') || rel.includes('\0')) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const filePath = resolve(INBOX_DIR, rel);
      if (!existsSync(filePath)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      try {
        const stat = statSync(filePath);
        if (!stat.isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const mime = INBOX_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-store');

        const rangeHeader = req.headers.range;
        let start = 0;
        let end = stat.size - 1;
        let statusCode = 200;

        if (rangeHeader) {
          const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
          if (!match || stat.size === 0 || (!match[1] && !match[2])) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            res.end();
            return;
          }
          if (match[1] === '') {
            const suffix = Number(match[2]);
            if (!Number.isFinite(suffix) || suffix <= 0) {
              res.statusCode = 416;
              res.setHeader('Content-Range', `bytes */${stat.size}`);
              res.end();
              return;
            }
            start = Math.max(0, stat.size - suffix);
            end = stat.size - 1;
          } else {
            start = Number(match[1]);
            end = match[2] === '' ? stat.size - 1 : Math.min(Number(match[2]), stat.size - 1);
          }
          if (
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            start < 0 ||
            start >= stat.size ||
            start > end
          ) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            res.end();
            return;
          }
          statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        }

        const chunkSize = stat.size === 0 ? 0 : end - start + 1;
        res.statusCode = statusCode;
        res.setHeader('Content-Length', chunkSize);
        if (req.method === 'HEAD' || chunkSize === 0) {
          res.end();
          return;
        }
        const stream =
          statusCode === 206
            ? createReadStream(filePath, { start, end })
            : createReadStream(filePath);
        stream.on('error', () => {
          if (!res.headersSent) {
            res.removeHeader('Content-Length');
            res.removeHeader('Content-Range');
            res.statusCode = 500;
            res.end();
          } else {
            res.destroy();
          }
        });
        res.on('close', () => {
          if (!stream.destroyed) stream.destroy();
        });
        stream.pipe(res);
      } catch {
        res.statusCode = 500;
        res.end();
      }
      return;
    }

    if (path === '/api/playlist' && req.method === 'GET') {
      json(res, 200, { url: readUrl() });
      return;
    }

    if (path === '/api/playlist' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer | string) => {
        if (body.length < 8192) body += chunk.toString();
      });
      req.on('end', () => {
        let url = '';
        try {
          url = String(JSON.parse(body).url ?? '');
        } catch {
          // malformed body -> validation below rejects it
        }
        if (!/^https?:\/\/(?:www\.)?(?:music\.)?youtube\.com\//i.test(url)) {
          json(res, 400, { ok: false, error: 'Link playlist YouTube tidak valid' });
          return;
        }
        if (running || activeChild !== null) {
          json(res, 409, { ok: false, error: 'Masih ada unduhan yang berjalan' });
          return;
        }
        try {
          writeFileSync(PLAYLIST_FILE, `# dikelola dari UI\n${url}\n`, 'utf8');
        } catch (error) {
          json(res, 500, { ok: false, error: String(error) });
          return;
        }

        const myRunId = ++currentRunId;
        running = true;
        cancelled = false;
        lastError = '';
        writeStatus({
          running: true,
          percent: 0,
          current: 'Menyiapkan…',
          done: 0,
          total: 0,
          error: '',
        });
        lastIds = [];

        let logFd: number | null = null;
        try {
          logFd = openSync(LOG_FILE, 'w');
        } catch {
          logFd = null;
        }
        const child = spawn('python', [SYNC_SCRIPT], {
          cwd: process.cwd(),
          detached: true,
          // detached + hidden: keeps the download alive across page reloads
          // without flashing a console window
          windowsHide: true,
          stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'],
        });
        if (logFd !== null) closeSync(logFd);
        activeChild = child;

        const finalize = (code: number | null) => {
          if (myRunId !== currentRunId) return;
          activeChild = null;
          const file = readStatus();
          lastError = cancelled
            ? 'Dibatalkan'
            : (typeof file.error === 'string' && file.error) ||
              (code ? `downloader exit ${code}` : '');
          writeStatus({
            running: false,
            percent: typeof file.percent === 'number' ? file.percent : 0,
            current: '',
            done: typeof file.done === 'number' ? file.done : 0,
            total: typeof file.total === 'number' ? file.total : 0,
            error: lastError,
          });
          lastIds = cancelled ? [] : readRunIds(url);
          // only after the finished status is on disk, so the UI never reads
          // "done" without the playlist ids that belong to the run
          running = false;
        };
        child.on('error', (error) => {
          if (myRunId !== currentRunId) return;
          running = false;
          activeChild = null;
          lastError = String(error);
          writeStatus({
            running: false,
            percent: 0,
            current: '',
            done: 0,
            total: 0,
            error: lastError,
          });
        });
        child.on('exit', (code) => finalize(code));

        json(res, 200, { ok: true, running: true });
      });
      return;
    }

    if (path === '/api/sync/cancel' && req.method === 'POST') {
      const pid = activeChild?.pid;
      if (!running || !pid) {
        json(res, 200, { ok: false, error: 'Tidak ada unduhan yang berjalan' });
        return;
      }
      cancelled = true;
      lastIds = [];
      // shortcut: Windows-only (taskkill /T). On other OSes kill the process group instead.
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.on('error', () => {
        activeChild?.kill();
      });
      const file = readStatus();
      writeStatus({
        running: false,
        percent: typeof file.percent === 'number' ? file.percent : 0,
        current: '',
        done: typeof file.done === 'number' ? file.done : 0,
        total: typeof file.total === 'number' ? file.total : 0,
        error: 'Dibatalkan',
      });
      running = false;
      lastError = 'Dibatalkan';
      json(res, 200, { ok: true });
      return;
    }

    if (path === '/api/sync/status' && req.method === 'GET') {
      const file = readStatus();
      // the bridge owns the run state: the script's own "done" write lands a
      // moment before the bridge appends the run's playlist ids. A dev-server
      // restart loses `running`, so the script's own flag keeps polling alive.
      const active = running || file.running === true;
      json(res, 200, {
        running: active,
        url: readUrl(),
        percent: typeof file.percent === 'number' ? file.percent : 0,
        current: typeof file.current === 'string' ? file.current : '',
        done: typeof file.done === 'number' ? file.done : 0,
        total: typeof file.total === 'number' ? file.total : 0,
        error: (typeof file.error === 'string' && file.error) || lastError,
        ids: lastIds,
      });
      return;
    }

    if (path === '/api/state' && req.method === 'GET') {
      if (!existsSync(STATE_FILE)) {
        json(res, 200, { exists: false, prefs: null });
        return;
      }
      try {
        const parsed: unknown = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          json(res, 200, { exists: true, prefs: parsed });
        } else {
          json(res, 200, { exists: false, prefs: null });
        }
      } catch {
        json(res, 200, { exists: false, prefs: null });
      }
      return;
    }

    if (path === '/api/state' && req.method === 'POST') {
      readJsonBody(req, MAX_STATE_BYTES, (result) => {
        if (!result.ok) {
          json(res, result.status, { ok: false, error: result.error });
          return;
        }
        const data = result.data;
        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          !Array.isArray((data as Record<string, unknown>).playlists)
        ) {
          json(res, 400, { ok: false, error: 'Payload state tidak valid' });
          return;
        }
        try {
          writeJsonAtomic(STATE_FILE, data);
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 500, { ok: false, error: String(error) });
        }
      });
      return;
    }

    if (path === '/api/playback' && req.method === 'GET') {
      if (!existsSync(PLAYBACK_FILE)) {
        json(res, 200, { playback: null });
        return;
      }
      try {
        const parsed: unknown = JSON.parse(readFileSync(PLAYBACK_FILE, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          json(res, 200, { playback: parsed });
        } else {
          json(res, 200, { playback: null });
        }
      } catch {
        json(res, 200, { playback: null });
      }
      return;
    }

    if (path === '/api/playback' && req.method === 'POST') {
      readJsonBody(req, MAX_PLAYBACK_BYTES, (result) => {
        if (!result.ok) {
          json(res, result.status, { ok: false, error: result.error });
          return;
        }
        const raw = result.data;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          json(res, 400, { ok: false, error: 'Payload playback tidak valid' });
          return;
        }
        const obj = raw as Record<string, unknown>;
        const key = obj.key;
        const time = obj.time;
        const playlistId =
          typeof obj.playlistId === 'string' && obj.playlistId ? obj.playlistId : undefined;
        if (
          typeof key !== 'string' ||
          key.length === 0 ||
          typeof time !== 'number' ||
          !Number.isFinite(time) ||
          time < 0
        ) {
          json(res, 400, { ok: false, error: 'Payload playback tidak valid' });
          return;
        }
        try {
          writeJsonAtomic(PLAYBACK_FILE, {
            key,
            time,
            ...(playlistId ? { playlistId } : {}),
          });
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 500, { ok: false, error: String(error) });
        }
      });
      return;
    }

    next();
  };

  return {
    name: 'playlist-bridge',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), playlistBridge()],
  // downloader writes these on every sync; a Vite full-reload would reset the UI
  server: { watch: { ignored: ['**/public/inbox/**', '**/scripts/**'] } },
});
