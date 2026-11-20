import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileArrowUp, PencilSimple, X } from '@phosphor-icons/react';
import { LyricLine, Track } from '../types/music';
import { formatTime, parseLrc } from '../utils/id3';

interface LyricsPanelProps {
  track: Track | null;
  currentTime: number;
  duration?: number;
  onSeek: (time: number) => void;
  onSaveCustomLyrics: (trackKey: string, lyrics: LyricLine[]) => void;
  offset?: number;
  onAdjustOffset?: (delta: number) => void;
  compact?: boolean;
}

export const LyricsPanel: React.FC<LyricsPanelProps> = ({
  track,
  currentTime,
  duration = 0,
  onSeek,
  onSaveCustomLyrics,
  offset = 0,
  onAdjustOffset,
  compact = false,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftLrc, setDraftLrc] = useState('');
  const [textScale, setTextScale] = useState<'s' | 'm' | 'l'>('m');

  const lyrics = track?.lyrics ?? [];
  const shift = offset;

  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time + shift) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, currentTime, shift]);

  useEffect(() => {
    const list = listRef.current;
    const line = activeLineRef.current;
    if (!editing && line && list) {
      const targetTop =
        line.offsetTop - list.clientHeight / 2 + line.clientHeight / 2;
      list.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      });
    }
  }, [activeIndex, editing]);

  useEffect(() => {
    setEditing(false);
  }, [track?.id]);

  const handleOpenEditor = () => {
    if (!track) return;
    const serialized = track.lyrics
      .map((l) => `[${formatTime(l.time)}] ${l.text}`)
      .join('\n');
    setDraftLrc(
      serialized ||
        `[00:00.00] ${track.title}\n[00:04.00] Paste [mm:ss.xx] or <mm:ss.xx> enhanced lyrics here...`
    );
    setEditing(true);
  };

  const handleSaveDraft = () => {
    if (!track) return;
    const parsed = parseLrc(draftLrc);
    if (parsed.length > 0) {
      onSaveCustomLyrics(track.key, parsed);
    } else {
      const plainLines = draftLrc
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text, idx) => ({ time: idx * 4, text }));
      onSaveCustomLyrics(track.key, plainLines);
    }
    setEditing(false);
  };

  const handleLrcFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !track) return;
    const text = await file.text();
    const parsed = parseLrc(text);
    if (parsed.length > 0) {
      onSaveCustomLyrics(track.key, parsed);
    }
    e.target.value = '';
  };

  const sizeClass = compact
    ? textScale === 's'
      ? 'text-[13px]'
      : textScale === 'l'
      ? 'text-[17px]'
      : 'text-[15px]'
    : textScale === 's'
    ? 'text-lg'
    : textScale === 'l'
    ? 'text-2xl sm:text-3xl'
    : 'text-xl sm:text-2xl';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Lyrics</h3>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white/[0.07] text-zinc-400">
            SYNC
          </span>
        </div>

        {track && !editing && (
          <div className="flex items-center gap-1">
            {onAdjustOffset && (
              <>
                <button
                  onClick={() => onAdjustOffset(-0.5)}
                  aria-label="Geser lirik 0,5 detik lebih awal"
                  title="Geser lirik 0,5 detik lebih awal"
                  className="px-1.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] font-mono text-[11px] leading-none text-zinc-300 transition"
                >
                  −
                </button>
                <button
                  onClick={() => onAdjustOffset(-offset)}
                  aria-label="Reset offset lirik"
                  title="Reset offset lirik"
                  className={`py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border font-mono text-[10px] tabular-nums w-9 text-center transition ${
                    offset === 0
                      ? 'border-white/[0.08] text-zinc-500'
                      : 'border-white/20 text-zinc-100'
                  }`}
                >
                  {offset === 0 ? '0.0s' : `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`}
                </button>
                <button
                  onClick={() => onAdjustOffset(0.5)}
                  aria-label="Geser lirik 0,5 detik lebih lambat"
                  title="Geser lirik 0,5 detik lebih lambat"
                  className="px-1.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] font-mono text-[11px] leading-none text-zinc-300 transition"
                >
                  +
                </button>
              </>
            )}
            <button
              onClick={() =>
                setTextScale((s) => (s === 's' ? 'm' : s === 'm' ? 'l' : 's'))
              }
              className="px-2 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] font-mono text-[10px] text-zinc-300 transition"
              title="Toggle lyric font size"
            >
              {textScale.toUpperCase()}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".lrc,.txt"
              className="hidden"
              onChange={handleLrcFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-zinc-300 transition"
              title="Import .lrc file"
            >
              <FileArrowUp size={13} />
              <span className="hidden sm:inline">.lrc</span>
            </button>
            <button
              onClick={handleOpenEditor}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-zinc-300 transition"
              title="Edit lyrics"
            >
              <PencilSimple size={13} />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex-1 flex flex-col gap-2.5 pt-3 min-h-0">
          <textarea
            value={draftLrc}
            onChange={(e) => setDraftLrc(e.target.value)}
            placeholder="[00:12.00] Enter lyrics in .LRC or enhanced <00:12.50> word-sync format..."
            className="flex-1 w-full rounded-xl bg-black/45 border border-white/10 p-3 font-mono text-xs text-zinc-200 focus:outline-none focus:border-white/25 resize-none"
          />
          <div className="flex justify-end gap-2 shrink-0">
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/15 text-xs text-zinc-300 hover:bg-white/10"
            >
              <X size={13} /> Cancel
            </button>
            <button
              onClick={handleSaveDraft}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200"
            >
              <Check size={13} weight="bold" /> Save
            </button>
          </div>
        </div>
      ) : lyrics.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <p className="text-sm font-medium text-zinc-300">No lyrics yet</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-[26ch]">
            Drop a matching <code className="text-zinc-300">.lrc</code> file or click Edit to add timestamps.
          </p>
        </div>
      ) : (
        <div
          ref={listRef}
          className="relative flex-1 overflow-y-auto py-4 space-y-2.5 pr-1 scroll-smooth"
        >
          {lyrics.map((line, idx) => {
            const isActive = idx === activeIndex;
            const isPast = idx < activeIndex;
            const nextTime =
              idx + 1 < lyrics.length
                ? lyrics[idx + 1].time
                : Math.max(line.time + 4, duration || line.time + 5);

            // Word-by-word karaoke sweep for active line (Liner signature)
            const words = line.words?.length
              ? line.words.map((w) => ({ ...w, time: w.time + shift }))
              : line.text.split(/\s+/).map((word, wIdx, arr) => ({
                  text: word,
                  time:
                    line.time +
                    shift +
                    ((nextTime - line.time) * 0.88 * wIdx) / Math.max(1, arr.length),
                }));

            return (
              <button
                key={`${line.time}-${idx}`}
                ref={isActive ? activeLineRef : null}
                onClick={() => onSeek(Math.max(0, line.time + shift))}
                className={`w-full text-left px-3 py-2 rounded-xl transition-all duration-300 block ${
                  isActive ? 'glass-inner-card' : 'hover:bg-white/[0.05]'
                }`}
              >
                {isActive ? (
                  <span className={`block leading-snug font-bold ${sizeClass}`}>
                    {words.map((w, wIdx) => {
                      const lit = currentTime >= w.time;
                      return (
                        <span
                          key={wIdx}
                          className={`inline-block mr-[0.28em] transition-all duration-200 ${
                            lit
                              ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]'
                              : 'text-zinc-500/80'
                          }`}
                        >
                          {w.text}
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span
                    className={`block leading-snug transition-all duration-300 ${sizeClass} ${
                      isPast
                        ? 'text-zinc-500/75 font-medium'
                        : 'text-zinc-400/65 font-medium hover:text-zinc-200'
                    }`}
                  >
                    {line.text}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
