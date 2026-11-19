import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { closeSync, existsSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';

const PLAYLIST_FILE = resolve(process.cwd(), 'scripts', 'playlist.txt');
const SYNC_SCRIPT = resolve(process.cwd(), 'scripts', 'sync_playlist.py');
const STATUS_FILE = resolve(process.cwd(), 'scripts', 'sync_status.json');
const LOG_FILE = resolve(process.cwd(), 'scripts', 'sync.log');
const INBOX_DIR = resolve(process.cwd(), 'public', 'inbox');
const PLAYLIST_JSON = resolve(INBOX_DIR, 'playlist.json');

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
    res.end(JSON.stringify(data));
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
      if (!rel || rel.includes('/') || rel.includes('\\') || rel.includes('..')) {
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
        res.statusCode = 200;
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-store');
        res.end(req.method === 'HEAD' ? undefined : readFileSync(filePath));
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
        if (running) {
          json(res, 409, { ok: false, error: 'Masih ada unduhan yang berjalan' });
          return;
        }
        try {
          writeFileSync(PLAYLIST_FILE, `# dikelola dari UI\n${url}\n`, 'utf8');
        } catch (error) {
          json(res, 500, { ok: false, error: String(error) });
          return;
        }

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
          lastIds = readRunIds(url);
          // only after the finished status is on disk, so the UI never reads
          // "done" without the playlist ids that belong to the run
          running = false;
        };
        child.on('error', (error) => {
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
