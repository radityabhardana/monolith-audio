import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowsClockwise,
  CheckCircle,
  FolderSimplePlus,
  Plus,
  Stop,
  WarningCircle,
  X,
  YoutubeLogo,
} from '@phosphor-icons/react';
import { Playlist } from '../types/music';

interface ImportYouTubeModalProps {
  open: boolean;
  onClose: () => void;
  playlists: Playlist[];
  activePlaylistId: string | null;
  onImportComplete: (
    ids: string[],
    target: { type: 'new' | 'existing' | 'inbox'; name?: string; playlistId?: string; url: string }
  ) => Promise<void>;
}

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

const YOUTUBE_URL_REGEX = /^https?:\/\/(?:www\.)?(?:music\.)?youtube\.com\//i;
const SHORT_URL_REGEX = /^https?:\/\/youtu\.be\//i;

export const ImportYouTubeModal: React.FC<ImportYouTubeModalProps> = ({
  open,
  onClose,
  playlists,
  activePlaylistId,
  onImportComplete,
}) => {
  const [url, setUrl] = useState('');
  const [targetType, setTargetType] = useState<'new' | 'existing' | 'inbox'>('new');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(activePlaylistId || (playlists[0]?.id ?? ''));

  const [phase, setPhase] = useState<'idle' | 'running' | 'cancelling' | 'done' | 'error'>('idle');
  const [percent, setPercent] = useState(0);
  const [currentTrackName, setCurrentTrackName] = useState('');
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // Reset modal state when opened
  useEffect(() => {
    if (open) {
      setUrl('');
      setPhase('idle');
      setPercent(0);
      setCurrentTrackName('');
      setDoneCount(0);
      setTotalCount(0);
      setErrorMessage('');
      setTargetType('new');
      setNewPlaylistName('');
      if (activePlaylistId) {
        setSelectedPlaylistId(activePlaylistId);
      } else if (playlists.length > 0) {
        setSelectedPlaylistId(playlists[0].id);
      }
    } else {
      stopPolling();
    }
  }, [open, activePlaylistId, playlists, stopPolling]);

  const isValidUrl = YOUTUBE_URL_REGEX.test(url.trim()) || SHORT_URL_REGEX.test(url.trim());

  const pollStatus = useCallback(() => {
    stopPolling();
    pollTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/sync/status', { cache: 'no-store' });
        if (!res.ok) {
          pollStatus();
          return;
        }
        const data = (await res.json()) as SyncStatus;
        if (data.running) {
          setPhase('running');
          setPercent(data.percent ?? 0);
          setCurrentTrackName(data.current ?? '');
          setDoneCount(data.done ?? 0);
          setTotalCount(data.total ?? 0);
          pollStatus();
          return;
        }

        // Finished running
        const ids = Array.isArray(data.ids) ? data.ids : [];
        if (data.error && data.error !== 'Dibatalkan') {
          setPhase('error');
          setErrorMessage(data.error);
        } else if (data.error === 'Dibatalkan') {
          setPhase('idle');
          setCurrentTrackName('Unduhan dibatalkan');
        } else {
          setPhase('done');
          setPercent(100);
          await onImportComplete(ids, {
            type: targetType,
            name: newPlaylistName.trim() || 'YouTube Import',
            playlistId: selectedPlaylistId,
            url: url.trim(),
          });
          setTimeout(() => {
            onClose();
          }, 1500);
        }
      } catch {
        pollStatus();
      }
    }, 800);
  }, [stopPolling, onImportComplete, targetType, newPlaylistName, selectedPlaylistId, url, onClose]);

  const handleStartImport = async () => {
    if (!isValidUrl || phase === 'running') return;
    setPhase('running');
    setPercent(0);
    setCurrentTrackName('Memulai pengunduhan…');
    setErrorMessage('');

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPhase('error');
        setErrorMessage(data.error || 'Gagal memulai unduhan');
        return;
      }
      pollStatus();
    } catch (err) {
      setPhase('error');
      setErrorMessage(String(err));
    }
  };

  const handleCancel = async () => {
    if (phase !== 'running') return;
    setPhase('cancelling');
    try {
      await fetch('/api/sync/cancel', { method: 'POST' });
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (phase !== 'running') onClose();
          }}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg rounded-2xl bg-[#0e0e12] border border-white/[0.09] shadow-2xl p-6 overflow-hidden flex flex-col gap-5 text-white select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
                <YoutubeLogo size={22} weight="fill" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-white">
                  Import from YouTube
                </h3>
                <p className="text-xs text-zinc-400">
                  Unduh lagu atau playlist langsung ke library lokal
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (phase !== 'running') onClose();
              }}
              disabled={phase === 'running'}
              className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition disabled:opacity-30"
            >
              <X size={18} />
            </button>
          </div>

          {/* URL Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono tracking-wider uppercase text-zinc-400">
              YouTube / Music URL
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="https://music.youtube.com/playlist?list=... atau link video"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={phase === 'running' || phase === 'cancelling'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 disabled:opacity-50 transition"
              />
              {url && isValidUrl && (
                <CheckCircle
                  size={16}
                  weight="fill"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-400"
                />
              )}
            </div>
          </div>

          {/* Target Destination Choice */}
          <div className="space-y-2">
            <label className="text-xs font-mono tracking-wider uppercase text-zinc-400">
              Simpan Ke
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTargetType('new')}
                disabled={phase === 'running'}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition ${
                  targetType === 'new'
                    ? 'bg-white/10 border-white/30 text-white font-semibold'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <FolderSimplePlus size={18} className="mb-1" />
                Playlist Baru
              </button>

              <button
                type="button"
                onClick={() => setTargetType('existing')}
                disabled={phase === 'running'}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition ${
                  targetType === 'existing'
                    ? 'bg-white/10 border-white/30 text-white font-semibold'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Plus size={18} className="mb-1" />
                Playlist Ada
              </button>

              <button
                type="button"
                onClick={() => setTargetType('inbox')}
                disabled={phase === 'running'}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition ${
                  targetType === 'inbox'
                    ? 'bg-white/10 border-white/30 text-white font-semibold'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <YoutubeLogo size={18} className="mb-1" />
                Library Saja
              </button>
            </div>

            {targetType === 'new' && (
              <input
                type="text"
                placeholder="Nama playlist baru (opsional)"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                disabled={phase === 'running'}
                className="w-full mt-2 px-3.5 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 transition"
              />
            )}

            {targetType === 'existing' && (
              <select
                value={selectedPlaylistId}
                onChange={(e) => setSelectedPlaylistId(e.target.value)}
                disabled={phase === 'running'}
                className="w-full mt-2 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-white/30 transition"
              >
                {playlists.map((pl) => (
                  <option key={pl.id} value={pl.id} className="bg-zinc-900 text-white">
                    {pl.name} ({pl.trackKeys.length} lagu)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Progress / Status display */}
          {(phase === 'running' || phase === 'cancelling' || phase === 'done' || phase === 'error') && (
            <div className="space-y-2 p-3.5 rounded-xl bg-black/40 border border-white/[0.08]">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {phase === 'running' && (
                    <ArrowsClockwise size={14} className="animate-spin text-white shrink-0" />
                  )}
                  {phase === 'done' && (
                    <CheckCircle size={14} weight="fill" className="text-emerald-400 shrink-0" />
                  )}
                  {phase === 'error' && (
                    <WarningCircle size={14} weight="fill" className="text-red-400 shrink-0" />
                  )}
                  <span className="font-mono truncate text-zinc-300">
                    {phase === 'done'
                      ? 'Sinkronisasi selesai! Menambahkan ke koleksi…'
                      : phase === 'error'
                      ? errorMessage
                      : currentTrackName || 'Mengunduh…'}
                  </span>
                </div>
                {totalCount > 0 && (
                  <span className="font-mono text-[11px] text-zinc-400 shrink-0 tabular-nums ml-2">
                    {doneCount} / {totalCount}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {phase === 'running' ? (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-semibold text-red-300 transition"
              >
                <Stop size={14} weight="fill" />
                <span>Batal Unduh</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-zinc-300 transition"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleStartImport}
                  disabled={!isValidUrl || phase === 'done'}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  <YoutubeLogo size={15} weight="fill" />
                  <span>Mulai Download</span>
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
