import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowsClockwise, CaretDown, WarningCircle, YoutubeLogo } from '@phosphor-icons/react';

interface PlaylistSourceProps {
  playlistId: string;
  source?: string;
  onSourceChange: (url: string) => void;
  onSynced: (playlistId: string, ids: string[]) => void | Promise<void>;
}

type SyncPhase = 'idle' | 'downloading' | 'cancelling' | 'done' | 'error';

type SyncStatus = {
  running?: boolean;
  url?: string;
  percent?: number;
  current?: string;
  done?: number;
  total?: number;
  error?: string;
  ids?: string[];
};

const YOUTUBE_URL = /^https?:\/\/(music\.)?youtube\.com\//i;
const POLL_MS = 800;

function samePlaylistUrl(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  try {
    const listA = new URL(a).searchParams.get('list');
    const listB = new URL(b).searchParams.get('list');
    if (listA && listB) return listA === listB;
  } catch {
    // fallback to trimmed string comparison
  }
  return a.trim() === b.trim();
}

const DOT_STYLES: Record<SyncPhase, string> = {
  idle: 'bg-zinc-500',
  downloading: 'bg-white animate-pulse',
  cancelling: 'bg-zinc-400',
  done: 'bg-emerald-400',
  error: 'bg-red-400',
};

export const PlaylistSource: React.FC<PlaylistSourceProps> = ({
  playlistId,
  source,
  onSourceChange,
  onSynced,
}) => {
  const [url, setUrl] = useState(source ?? '');
  const [savedUrl, setSavedUrl] = useState(source ?? '');
  const [editing, setEditing] = useState(false);
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [message, setMessage] = useState(
    source ? 'Tersambung — siap sync' : 'Tempel link playlist untuk mulai',
  );
  const [percent, setPercent] = useState(0);
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const pollTimerRef = useRef<number | null>(null);
  const cancellingRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const applyRunningStatus = useCallback((data: SyncStatus) => {
    if (!cancellingRef.current) setPercent(data.percent ?? 0);
    setCurrent(data.current ?? '');
    setDone(data.done ?? 0);
    setTotal(data.total ?? 0);
  }, []);

  const pollStatus = useCallback(() => {
    pollTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/sync/status', { cache: 'no-store' });
        const data = (await res.json()) as SyncStatus;
        if (data.running) {
          applyRunningStatus(data);
          pollStatus();
          return;
        }
        cancellingRef.current = false;
        // running:false = selesai. Sebagian track mungkin sudah masuk walau ada error.
        await onSynced(playlistId, Array.isArray(data.ids) ? data.ids : []);
        if (data.error === 'Dibatalkan') {
          setCurrent('');
          setDone(data.done ?? 0);
          setTotal(data.total ?? 0);
          setPhase('idle');
          setMessage(
            data.total ? `Dibatalkan — ${data.done ?? 0}/${data.total} lagu tersimpan` : 'Dibatalkan',
          );
          return;
        }
        if (data.error) {
          setCurrent('');
          setPhase('error');
          setMessage(data.error);
          return;
        }
        setPhase('done');
        setMessage('Selesai');
      } catch {
        setPhase('error');
        setMessage('Tidak bisa menghubungi bridge lokal');
      }
    }, POLL_MS);
  }, [applyRunningStatus, onSynced, playlistId]);

  // Re-attach progress bar & polling if this playlist's download is already running
  // (e.g. after switching playlists or refreshing the page).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/sync/status', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const data = (await res.json()) as SyncStatus;
        if (!active || !data.running) return;
        if (savedUrl && (!data.url || samePlaylistUrl(data.url, savedUrl))) {
          setPhase('downloading');
          applyRunningStatus(data);
          pollStatus();
        }
      } catch {
        // ignore if bridge is unavailable
      }
    })();
    return () => {
      active = false;
    };
  }, [applyRunningStatus, pollStatus, savedUrl]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = (savedUrl && !editing ? savedUrl : url).trim();
    if (!YOUTUBE_URL.test(value)) {
      setPhase('error');
      setMessage('Link harus dari youtube.com atau music.youtube.com');
      return;
    }

    stopPolling();
    cancellingRef.current = false;
    setPhase('downloading');
    setMessage('');
    setPercent(0);
    setCurrent('');
    setDone(0);
    setTotal(0);

    try {
      const res = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (res.status === 409) {
          try {
            const statusRes = await fetch('/api/sync/status', { cache: 'no-store' });
            const statusData = (await statusRes.json()) as SyncStatus;
            if (statusData.running && (!statusData.url || samePlaylistUrl(statusData.url, value))) {
              setPhase('downloading');
              applyRunningStatus(statusData);
              pollStatus();
              return;
            }
          } catch {
            // fall through to error message
          }
        }
        setPhase('error');
        setMessage(data.error || 'Gagal memulai unduhan');
        return;
      }
      setUrl(value);
      setSavedUrl(value);
      onSourceChange(value);
      setEditing(false);
      pollStatus();
    } catch {
      setPhase('error');
      setMessage('Tidak bisa menghubungi bridge lokal');
    }
  };

  const handleCancel = async () => {
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    setPhase('cancelling');
    try {
      const res = await fetch('/api/sync/cancel', { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean };
      if (res.ok && data.ok) return;
    } catch {
      // biarkan polling yang mengoreksi status
    }
    cancellingRef.current = false;
    setPhase((p) => (p === 'cancelling' ? 'downloading' : p));
  };

  const busy = phase === 'downloading' || phase === 'cancelling';
  // total is still 0 while the playlist is being listed, so this is the check step
  const checking = phase === 'downloading' && total === 0;
  // every id is already downloaded: the run only attaches lyrics/manifest
  const finishing = phase === 'downloading' && total > 0 && done >= total;
  const linked = Boolean(savedUrl);
  const dotClass = phase === 'idle' && linked ? 'bg-emerald-400' : DOT_STYLES[phase];
  const statusText =
    phase === 'cancelling'
      ? 'Membatalkan…'
      : checking
        ? 'Mengambil daftar lagu…'
        : finishing
          ? 'Menyiapkan lirik & daftar lagu…'
          : phase === 'downloading'
          ? `Mengunduh ${Math.round(percent)}%${total > 0 ? ` · ${done}/${total}` : ''}`
          : message;
  const [open, setOpen] = useState(false);

  return (
    <form onSubmit={handleSubmit} className="glass-inner-card rounded-xl">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="playlist-source-fields"
          className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition hover:bg-white/[0.05]"
        >
          <div className="w-8 h-8 shrink-0 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white">
            <YoutubeLogo size={16} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">YouTube Music Playlist</p>
            <p
              className={`flex items-center gap-1.5 text-[11px] ${
                phase === 'error' ? 'text-red-300' : 'text-zinc-400'
              }`}
              aria-live="polite"
              title={statusText}
            >
              <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${dotClass}`} />
              <span className="truncate">
                {phase === 'error' && <WarningCircle size={11} className="inline -mt-0.5 mr-1" />}
                {statusText}
              </span>
            </p>
            {current && !checking && (
              <p className="mt-0.5 text-[10px] text-zinc-500 truncate" title={current}>
                {current}
              </p>
            )}
          </div>

          <span className="hidden sm:inline shrink-0 font-mono text-[11px] text-zinc-300">
            {open ? 'Tutup' : linked ? 'Kelola' : 'Isi link'}
          </span>
          <CaretDown
            size={14}
            className={`shrink-0 text-zinc-300 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {busy && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={phase === 'cancelling'}
            aria-label="Batalkan unduhan playlist"
            className="mr-1 shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-medium text-zinc-200 transition hover:bg-white/[0.08] hover:text-white active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none"
          >
            Batal
          </button>
        )}
      </div>

      <div className="h-[3px]">
        {busy && (
          <div className="h-full w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      {open && (
        <div
          id="playlist-source-fields"
          className="flex flex-col gap-2 px-3 pt-3 pb-3 border-t border-white/[0.08]"
        >
          {linked && !editing ? (
            <>
              <div className="min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Playlist tertaut
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-300" title={savedUrl}>
                  {savedUrl}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="submit"
                  disabled={busy}
                  aria-label="Sinkronkan playlist tertaut"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full glass-pill-btn text-xs font-medium text-white transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <ArrowsClockwise size={13} weight="bold" />
                  <span>Sinkronkan</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUrl(savedUrl);
                    setEditing(true);
                  }}
                  disabled={busy}
                  aria-label="Ganti link playlist tertaut"
                  className="shrink-0 rounded-full px-2.5 py-2 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
                >
                  Ganti link
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  disabled={busy}
                  aria-label="Link playlist YouTube Music"
                  placeholder="https://music.youtube.com/playlist?list=…"
                  className="w-full min-w-0 px-3.5 py-2 rounded-full bg-white/[0.06] border border-white/12 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/35 transition disabled:opacity-60"
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full glass-pill-btn text-xs font-medium text-white transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shrink-0"
                >
                  <ArrowDown size={13} weight="bold" />
                  <span>Simpan & Unduh</span>
                </button>
              </div>

              {linked && (
                <button
                  type="button"
                  onClick={() => {
                    setUrl(savedUrl);
                    setEditing(false);
                  }}
                  disabled={busy}
                  aria-label="Batal ganti link, kembali ke playlist tertaut"
                  className="self-start rounded-full px-1 py-0.5 text-[11px] text-zinc-400 transition hover:text-white disabled:opacity-50 disabled:pointer-events-none"
                >
                  Batal ganti
                </button>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
};