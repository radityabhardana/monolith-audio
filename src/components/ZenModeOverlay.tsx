import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowsInSimple,
  Heart,
  Pause,
  Play,
  Repeat,
  RepeatOnce,
  Shuffle,
  SkipBack,
  SkipForward,
} from '@phosphor-icons/react';
import {
  AsciiTunerSettings,
  CoverRenderMode,
  LyricLine,
  RepeatMode,
  Track,
  VisualizerMode,
} from '../types/music';
import { formatTime } from '../utils/id3';
import { AsciiVisualizer } from './AsciiVisualizer';
import { DevaultArtworkCanvas } from './DevaultArtworkCanvas';
import { KawarpBackdrop } from './KawarpBackdrop';
import { LyricsPanel } from './LyricsPanel';

interface ZenModeOverlayProps {
  open: boolean;
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  coverMode: CoverRenderMode;
  visualizerMode: VisualizerMode;
  tuner: AsciiTunerSettings;
  asciiOverlayEnabled: boolean;
  slowedActive: boolean;
  getFrequencyData: (target: Uint8Array<ArrayBuffer>) => boolean;
  getWaveformData: (target: Uint8Array<ArrayBuffer>) => boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLike: (trackKey: string) => void;
  onChangeCoverMode: (mode: CoverRenderMode) => void;
  onCycleVisualizerMode: () => void;
  onToggleSlowed: () => void;
  onSaveCustomLyrics: (trackKey: string, lyrics: LyricLine[]) => void;
  lyricOffset: number;
  onAdjustLyricOffset: (delta: number) => void;
}

const ART_STYLES: { id: CoverRenderMode; label: string }[] = [
  { id: 'braille', label: 'Braille' },
  { id: 'ascii', label: 'ASCII' },
  { id: 'dither', label: 'Dither' },
  { id: 'halftone', label: 'Halftone' },
  { id: 'orbit', label: 'Orbit 3D' },
  { id: 'hd', label: 'Original' },
];

export const ZenModeOverlay: React.FC<ZenModeOverlayProps> = ({
  open,
  track,
  isPlaying,
  currentTime,
  duration,
  shuffle,
  repeat,
  coverMode,
  visualizerMode,
  tuner,
  asciiOverlayEnabled,
  slowedActive,
  getFrequencyData,
  getWaveformData,
  onClose,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onToggleShuffle,
  onCycleRepeat,
  onToggleLike,
  onChangeCoverMode,
  onCycleVisualizerMode,
  onToggleSlowed,
  onSaveCustomLyrics,
  lyricOffset,
  onAdjustLyricOffset,
}) => {
  const accent = track?.accentColor ?? [161, 161, 170];
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const styleLabel = ART_STYLES.find((s) => s.id === coverMode)?.label ?? coverMode;
  const vizLabel =
    visualizerMode === 'ascii-bars' ? 'ASCII' : visualizerMode === 'dot-matrix' ? 'Pixel' : 'Scope';
  const nextCoverMode = () => {
    const i = ART_STYLES.findIndex((s) => s.id === coverMode);
    onChangeCoverMode(ART_STYLES[(i + 1) % ART_STYLES.length].id);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-40 bg-[#070709] flex flex-col justify-between p-6 md:p-10 pt-18 overflow-hidden"
        >
          {/* Fullscreen WebGL Kawarp + Optional ASCII Overlay */}
          <KawarpBackdrop
            coverUrl={track?.coverUrl ?? null}
            accentColor={accent}
            isPlaying={isPlaying}
            asciiOverlayEnabled={asciiOverlayEnabled}
            getFrequencyData={getFrequencyData}
          />

          {/* Top Bar */}
          <div className="relative z-10 flex items-center justify-between gap-4 max-w-6xl w-full mx-auto">
            <span className="text-xs font-mono text-zinc-300/80">
              ZEN // {track?.format ?? 'AUDIO'} · {track?.bitrate ?? 'LOCAL'}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={onToggleSlowed}
                aria-pressed={slowedActive}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                  slowedActive
                    ? 'bg-white text-zinc-950 border-white'
                    : 'smoked-glass text-zinc-200 hover:bg-white/10'
                }`}
              >
                Slowed
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full smoked-glass text-xs text-zinc-200 hover:bg-white/10 transition"
              >
                <ArrowsInSimple size={14} />
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Center Split */}
          <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 my-6 min-h-0 max-w-6xl w-full mx-auto items-center">
            <div className="lg:col-span-5 flex flex-col items-center lg:items-start gap-5">
              <button
                type="button"
                onClick={nextCoverMode}
                aria-label={`Ganti gaya cover (sekarang ${styleLabel})`}
                title={`Gaya cover: ${styleLabel}`}
                className="block cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <DevaultArtworkCanvas
                  coverUrl={track?.coverUrl ?? null}
                  title={track?.title ?? 'No track'}
                  mode={coverMode}
                  accentColor={accent}
                  isPlaying={isPlaying}
                  tuner={tuner}
                  getFrequencyData={getFrequencyData}
                  className="w-64 h-64 sm:w-80 sm:h-80 rounded-2xl shadow-2xl"
                />
              </button>

              <div className="w-full max-w-xs text-center lg:text-left">
                <div className="flex items-center justify-center lg:justify-between gap-3">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white truncate">
                    {track?.title ?? 'Ready to play'}
                  </h1>
                  {track && (
                    <button
                      onClick={() => onToggleLike(track.key)}
                      className="p-2 rounded-full hover:bg-white/10 transition shrink-0"
                    >
                      <Heart
                        size={20}
                        weight={track.liked ? 'fill' : 'regular'}
                        style={track.liked ? { color: `rgb(${accent.join(',')})` } : undefined}
                        className={track.liked ? '' : 'text-zinc-300'}
                      />
                    </button>
                  )}
                </div>
                <p className="text-sm text-zinc-300/80 mt-1 truncate">
                  {track ? `${track.artist} · ${track.album}` : 'Local Audio'}
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col gap-4 h-full min-h-0">
              <div className="flex-1 smoked-glass rounded-2xl p-6 min-h-[220px] overflow-hidden flex flex-col">
                <LyricsPanel
                  track={track}
                  currentTime={currentTime}
                  duration={duration}
                  onSeek={onSeek}
                  onSaveCustomLyrics={onSaveCustomLyrics}
                  offset={lyricOffset}
                  onAdjustOffset={onAdjustLyricOffset}
                />
              </div>
              <button
                type="button"
                onClick={onCycleVisualizerMode}
                aria-label={`Ganti visualizer (sekarang ${vizLabel})`}
                title={`Visualizer: ${vizLabel}`}
                className="smoked-glass rounded-2xl p-4 shrink-0 w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <AsciiVisualizer
                  mode={visualizerMode}
                  isPlaying={isPlaying}
                  accentColor={accent}
                  getFrequencyData={getFrequencyData}
                  getWaveformData={getWaveformData}
                  height={92}
                />
              </button>
            </div>
          </div>

          {/* Transport */}
          <div className="relative z-10 max-w-2xl w-full mx-auto space-y-3">
            <div className="flex items-center gap-3 font-mono text-xs text-zinc-300">
              <span className="tabular-nums w-11 text-right">{formatTime(currentTime)}</span>
              <div
                onClick={(e) => {
                  if (!duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  onSeek(ratio * duration);
                }}
                className="flex-1 h-1.5 rounded-sm bg-white/15 overflow-hidden cursor-pointer"
              >
                <div
                  className="h-full transition-all duration-100"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: `rgb(${accent.join(',')})`,
                  }}
                />
              </div>
              <span className="tabular-nums w-11">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={onToggleShuffle}
                className={`p-2 rounded-full transition ${
                  shuffle ? 'text-white bg-white/15' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Shuffle size={17} weight={shuffle ? 'bold' : 'regular'} />
              </button>
              <button
                onClick={onPrev}
                className="p-2 rounded-full text-zinc-200 hover:bg-white/10 transition"
              >
                <SkipBack size={21} weight="fill" />
              </button>
              <button
                onClick={onTogglePlay}
                className="w-12 h-12 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 flex items-center justify-center shadow-lg transition active:scale-95"
              >
                {isPlaying ? <Pause size={21} weight="fill" /> : <Play size={21} weight="fill" />}
              </button>
              <button
                onClick={onNext}
                className="p-2 rounded-full text-zinc-200 hover:bg-white/10 transition"
              >
                <SkipForward size={21} weight="fill" />
              </button>
              <button
                onClick={onCycleRepeat}
                className={`p-2 rounded-full transition ${
                  repeat !== 'off' ? 'text-white bg-white/15' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {repeat === 'one' ? <RepeatOnce size={17} weight="bold" /> : <Repeat size={17} />}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
