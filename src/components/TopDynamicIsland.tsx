import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowsOutSimple,
  Pause,
  Play,
  PushPin,
  SkipBack,
  SkipForward,
  X,
} from '@phosphor-icons/react';
import { AsciiTunerSettings, CoverRenderMode, Track } from '../types/music';
import { formatTime } from '../utils/id3';
import { CoverArtRenderer } from './CoverArtRenderer';

interface TopDynamicIslandProps {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  coverMode: CoverRenderMode;
  tuner: AsciiTunerSettings;
  getFrequencyData: (target: Uint8Array<ArrayBuffer>) => boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onOpenZen: () => void;
  pipContainer: HTMLElement | null;
  onCloseDevicePopup: () => void;
}

const BRAILLE_METER = ['⠀', '⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿'];

function MiniBrailleMeter({
  isPlaying,
  accentColor,
  getFrequencyData,
}: {
  isPlaying: boolean;
  accentColor: [number, number, number];
  getFrequencyData: (target: Uint8Array<ArrayBuffer>) => boolean;
}) {
  const [glyphs, setGlyphs] = useState<string>('⣀⣀⣀⣀⣀⣀');

  useEffect(() => {
    const freq = new Uint8Array(new ArrayBuffer(128));
    let timer = 0;

    const tick = () => {
      if (isPlaying && getFrequencyData(freq)) {
        let out = '';
        for (let i = 0; i < 6; i++) {
          const val = freq[i * 5 + 2] || 0;
          const idx = Math.min(7, Math.max(1, Math.round((val / 255) * 7)));
          out += BRAILLE_METER[idx];
        }
        setGlyphs(out);
      } else {
        setGlyphs('⣀⣀⣀⣀⣀⣀');
      }
      timer = window.setTimeout(tick, 75);
    };

    tick();
    return () => clearTimeout(timer);
  }, [isPlaying, getFrequencyData]);

  return (
    <span
      className="font-mono text-xs tracking-[0.08em] select-none shrink-0"
      style={{ color: `rgb(${accentColor.join(',')})` }}
    >
      {glyphs}
    </span>
  );
}

export const TopDynamicIsland: React.FC<TopDynamicIslandProps> = ({
  track,
  isPlaying,
  currentTime,
  duration,
  coverMode,
  tuner,
  getFrequencyData,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onOpenZen,
  pipContainer,
  onCloseDevicePopup,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const autoExpandTimerRef = useRef<number | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!track) return;
    if (lastTrackIdRef.current && lastTrackIdRef.current !== track.id) {
      setExpanded(true);
      if (autoExpandTimerRef.current) window.clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = window.setTimeout(() => {
        if (!pinned) setExpanded(false);
      }, 3200);
    }
    lastTrackIdRef.current = track.id;
  }, [track, pinned]);

  useEffect(() => {
    return () => {
      if (autoExpandTimerRef.current) window.clearTimeout(autoExpandTimerRef.current);
    };
  }, []);

  const activeLyric = useMemo(() => {
    if (!track || track.lyrics.length === 0) return null;
    let found: string | null = null;
    for (const line of track.lyrics) {
      if (currentTime >= line.time) found = line.text;
      else break;
    }
    return found;
  }, [track, currentTime]);

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const filledBlocks = Math.round(progress * 20);
  const asciiBar = '█'.repeat(filledBlocks) + '░'.repeat(20 - filledBlocks);

  const accent = track?.accentColor ?? [161, 161, 170];
  const isOpen = expanded || pinned;

  return (
    <>
      {/* In-App Top-Center Dynamic Island (centered over main content header slot) */}
      <div
        className="fixed top-2.5 left-1/2 md:left-[calc(50%+122px)] -translate-x-1/2 z-50 flex flex-col items-center pointer-events-auto"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => {
          if (!pinned) setExpanded(false);
        }}
      >
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className={`dynamic-island-glass overflow-hidden ${
            isOpen
              ? 'w-[min(92vw,440px)] rounded-2xl px-4 py-3'
              : 'w-[min(86vw,296px)] rounded-full px-3.5 py-2'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CoverArtRenderer
              coverUrl={track?.coverUrl ?? null}
              title={track?.title ?? 'Idle'}
              mode="hd"
              accentColor={accent}
              tuner={tuner}
              size={isOpen ? 40 : 26}
              className={`${isOpen ? 'w-10 h-10 rounded-xl' : 'w-6.5 h-6.5 rounded-full'} shrink-0`}
            />

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">
                {track ? track.title : 'Ready to play'}
              </p>
              {isOpen && track && (
                <p className="text-[11px] text-zinc-400 truncate">{track.artist}</p>
              )}
            </div>

            <MiniBrailleMeter
              isPlaying={isPlaying}
              accentColor={accent}
              getFrequencyData={getFrequencyData}
            />
          </div>

          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="mt-3 pt-2.5 border-t border-white/10 space-y-2.5"
              >
                {activeLyric && (
                  <p className="text-xs text-zinc-300 truncate bg-white/[0.04] rounded-lg px-2.5 py-1.5">
                    {activeLyric}
                  </p>
                )}

                <div
                  onClick={(e) => {
                    if (!duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    onSeek(ratio * duration);
                  }}
                  title="Click to seek"
                  className="flex items-center justify-between gap-2 cursor-pointer font-mono text-[10px] text-zinc-400 hover:text-zinc-200 select-none"
                >
                  <span className="text-zinc-300">[{asciiBar}]</span>
                  <span className="tabular-nums shrink-0">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={onPrev}
                      className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300 transition"
                    >
                      <SkipBack size={14} weight="fill" />
                    </button>
                    <button
                      onClick={onTogglePlay}
                      className="p-1.5 px-3 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 transition"
                    >
                      {isPlaying ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}
                    </button>
                    <button
                      onClick={onNext}
                      className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300 transition"
                    >
                      <SkipForward size={14} weight="fill" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPinned((p) => !p)}
                      className={`p-1.5 rounded-full border text-xs transition ${
                        pinned
                          ? 'bg-white/15 border-white/25 text-white'
                          : 'border-white/10 text-zinc-400 hover:text-white'
                      }`}
                      title={pinned ? 'Unpin' : 'Pin'}
                    >
                      <PushPin size={13} weight={pinned ? 'fill' : 'regular'} />
                    </button>
                    <button
                      onClick={onOpenZen}
                      className="p-1.5 rounded-full border border-white/10 text-zinc-400 hover:text-white transition"
                      title="Zen Mode"
                    >
                      <ArrowsOutSimple size={13} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Device-Level Always-on-Top Floating Pop-up Portal */}
      {pipContainer &&
        createPortal(
          <div
            className="w-full h-full rounded-2xl dynamic-island-glass p-3 flex flex-col justify-between text-zinc-100"
            style={{
              background: `radial-gradient(circle at 12% 20%, rgba(${accent.join(',')}, 0.24), rgba(11,11,14,0.96) 68%)`,
            }}
          >
            <div className="flex items-center gap-3">
              <CoverArtRenderer
                coverUrl={track?.coverUrl ?? null}
                title={track?.title ?? 'Idle'}
                mode={coverMode}
                accentColor={accent}
                tuner={tuner}
                size={46}
                className="w-11.5 h-11.5 rounded-xl shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">
                  {track ? track.title : 'Ready to play'}
                </p>
                <p className="text-xs text-zinc-400 truncate">
                  {activeLyric || track?.artist || 'Local Audio'}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onPrev}
                  className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300"
                >
                  <SkipBack size={14} weight="fill" />
                </button>
                <button
                  onClick={onTogglePlay}
                  className="p-2 rounded-full bg-white text-zinc-950 hover:bg-zinc-200"
                >
                  {isPlaying ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                </button>
                <button
                  onClick={onNext}
                  className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300"
                >
                  <SkipForward size={14} weight="fill" />
                </button>
                <button
                  onClick={onCloseDevicePopup}
                  className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"
                  title="Close"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
                {formatTime(currentTime)}
              </span>
              <div
                onClick={(e) => {
                  if (!duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  onSeek(ratio * duration);
                }}
                className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden cursor-pointer"
              >
                <div
                  className="h-full transition-all duration-150"
                  style={{
                    width: `${progress * 100}%`,
                    backgroundColor: `rgb(${accent.join(',')})`,
                  }}
                />
              </div>
              <MiniBrailleMeter
                isPlaying={isPlaying}
                accentColor={accent}
                getFrequencyData={getFrequencyData}
              />
            </div>
          </div>,
          pipContainer
        )}
    </>
  );
};
