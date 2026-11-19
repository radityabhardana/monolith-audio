import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  ClockCounterClockwise,
  Disc,
  Heart,
  Pause,
  PencilSimple,
  Play,
  Queue,
  Shuffle,
  User,
} from '@phosphor-icons/react';
import { Track } from '../types/music';
import { formatDuration } from '../utils/id3';
import { CoverArtRenderer } from './CoverArtRenderer';

export type CollectionKind = 'liked' | 'history' | 'playlist' | 'album' | 'artist';

interface CollectionBannerProps {
  kind: CollectionKind;
  title: string;
  subtitle: string;
  tracks: Track[];
  playCounts: Record<string, number>;
  accentColor: [number, number, number];
  isShuffle: boolean;
  onPlayFirst: () => void;
  onShufflePlay: () => void;
  onBackHome?: () => void;
  /** this collection owns the playing track */
  isCurrent?: boolean;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  /** custom playlist artwork (data URL) */
  coverUrl?: string;
  onRename?: (name: string) => void;
  onChangeCover?: (file: File) => void;
}

const COLLECTION_META: Record<
  CollectionKind,
  {
    eyebrow: string;
    Icon: React.ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'bold' }>;
  }
> = {
  liked: { eyebrow: 'LIKED COLLECTION', Icon: Heart },
  history: { eyebrow: 'LISTENING LOG', Icon: ClockCounterClockwise },
  playlist: { eyebrow: 'PLAYLIST', Icon: Queue },
  album: { eyebrow: 'ALBUM', Icon: Disc },
  artist: { eyebrow: 'ARTIST', Icon: User },
};

export const CollectionBanner: React.FC<CollectionBannerProps> = ({
  kind,
  title,
  subtitle,
  tracks,
  playCounts,
  accentColor,
  isShuffle,
  onPlayFirst,
  onShufflePlay,
  onBackHome,
  coverUrl,
  onRename,
  onChangeCover,
  isCurrent = false,
  isPlaying = false,
  onTogglePlay,
}) => {
  const accentRgb = accentColor.join(',');
  const liveControls = isCurrent && !!onTogglePlay;
  const leadCoverUrl = tracks[0]?.coverUrl ?? null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftTitle, setDraftTitle] = useState(title);
  const [editingTitle, setEditingTitle] = useState(false);
  const renameHandled = useRef(false);

  // one shot per edit session: Enter/unmount must not also fire the blur save
  const finishRename = (save: boolean) => {
    if (renameHandled.current) return;
    renameHandled.current = true;
    setEditingTitle(false);
    const next = draftTitle.trim();
    if (save && next && next !== title) onRename?.(next);
  };

  const mosaicTracks = useMemo(() => {
    const seen = new Set<string>();
    const unique: Track[] = [];
    for (const track of tracks) {
      if (track.coverUrl && !seen.has(track.coverUrl)) {
        seen.add(track.coverUrl);
        unique.push(track);
        if (unique.length === 4) break;
      }
    }
    return unique;
  }, [tracks]);

  const telemetry = useMemo(() => {
    let totalDuration = 0;
    let totalPlays = 0;
    const formatSet = new Set<string>();

    for (const track of tracks) {
      if (Number.isFinite(track.duration) && track.duration > 0) {
        totalDuration += track.duration;
      }
      totalPlays += playCounts[track.key] || 0;
      if (track.format) {
        formatSet.add(track.format.toUpperCase());
      }
    }

    return {
      totalDuration,
      totalPlays,
      formats: Array.from(formatSet).sort(),
    };
  }, [tracks, playCounts]);

  const { eyebrow, Icon: EyebrowIcon } = COLLECTION_META[kind];

  const renderEmblem = () => {
    if (kind === 'playlist') {
      return (
        <div className="w-28 h-28 sm:w-32 sm:h-32 shrink-0 rounded-2xl overflow-hidden border border-white/15 bg-[#09090d] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_16px_36px_-12px_rgba(0,0,0,0.85)] relative">
          {coverUrl ? (
            <img src={coverUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px bg-white/[0.08] rounded-2xl overflow-hidden">
              {[0, 1, 2, 3].map((slot) => {
                const slotTrack = mosaicTracks[slot];
                if (slotTrack) {
                  return (
                    <CoverArtRenderer
                      key={`${slotTrack.id}-${slot}`}
                      coverUrl={slotTrack.coverUrl}
                      title={slotTrack.title}
                      mode="hd"
                      accentColor={slotTrack.accentColor}
                      size={64}
                      className="w-full h-full border-0"
                    />
                  );
                }
                return (
                  <div
                    key={`fallback-${slot}`}
                    className="w-full h-full bg-zinc-950/85 backdrop-blur-md flex items-center justify-center"
                  >
                    {mosaicTracks.length > 0 && (
                      <Queue size={16} className="text-zinc-500/80" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!coverUrl && mosaicTracks.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[2px]">
              <div className="w-12 h-12 rounded-xl glass-inner-card flex items-center justify-center">
                <Queue size={26} className="text-zinc-200" />
              </div>
            </div>
          )}
          {onChangeCover && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onChangeCover(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Ganti gambar playlist"
                title="Ganti gambar playlist"
                className="absolute bottom-1.5 right-1.5 p-1.5 rounded-full bg-black/60 border border-white/25 text-white backdrop-blur-sm hover:bg-black/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <Camera size={13} />
              </button>
            </>
          )}
        </div>
      );
    }

    if (kind === 'liked') {
      return (
        <div
          className="w-28 h-28 sm:w-32 sm:h-32 shrink-0 rounded-2xl glass-inner-card relative overflow-hidden flex items-center justify-center border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_36px_-12px_rgba(0,0,0,0.85)]"
          style={{
            background: `radial-gradient(circle at 50% 45%, rgba(${accentRgb}, 0.28), rgba(10, 10, 14, 0.94) 72%)`,
          }}
        >
          <div className="pointer-events-none absolute inset-2 rounded-xl border border-white/[0.08]" />
          <Heart
            size={40}
            weight="fill"
            className="relative z-10"
            style={{
              color: `rgb(${accentRgb})`,
              filter: `drop-shadow(0 0 18px rgba(${accentRgb}, 0.65))`,
            }}
          />
        </div>
      );
    }

    if (kind === 'history') {
      return (
        <div
          className="w-28 h-28 sm:w-32 sm:h-32 shrink-0 rounded-2xl glass-inner-card relative overflow-hidden flex items-center justify-center border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_36px_-12px_rgba(0,0,0,0.85)]"
          style={{
            background: `radial-gradient(circle at 50% 45%, rgba(${accentRgb}, 0.16), rgba(9, 9, 13, 0.95) 75%)`,
          }}
        >
          <div className="scanline-overlay absolute inset-0 opacity-45" />
          <ClockCounterClockwise
            size={40}
            className="relative z-10 text-zinc-100"
            style={{
              filter: `drop-shadow(0 0 14px rgba(${accentRgb}, 0.35))`,
            }}
          />
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/65 border border-white/15 font-mono text-[9px] tracking-[0.16em] uppercase text-zinc-200">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: `rgb(${accentRgb})` }}
            />
            LOG
          </span>
        </div>
      );
    }

    if (kind === 'artist') {
      return (
        <div className="w-28 h-28 sm:w-32 sm:h-32 shrink-0 relative">
          <div
            className="pointer-events-none absolute -inset-1 rounded-full opacity-45 blur-md"
            style={{
              background: `radial-gradient(circle, rgba(${accentRgb}, 0.35), transparent 70%)`,
            }}
          />
          <CoverArtRenderer
            coverUrl={leadCoverUrl}
            title={title}
            mode="hd"
            accentColor={accentColor}
            size={128}
            className="w-full h-full rounded-full border-white/20 shadow-[0_16px_36px_-12px_rgba(0,0,0,0.85)]"
          />
        </div>
      );
    }

    return (
      <div className="w-28 h-28 sm:w-32 sm:h-32 shrink-0 relative">
        <CoverArtRenderer
          coverUrl={leadCoverUrl}
          title={title}
          mode="hd"
          accentColor={accentColor}
          size={128}
          className="w-full h-full rounded-2xl border-white/15 shadow-[0_16px_36px_-12px_rgba(0,0,0,0.85)]"
        />
      </div>
    );
  };

  return (
    <section
      aria-label={title}
      className="smoked-glass rounded-2xl p-6 relative overflow-hidden"
    >
      {/* Subtle radial smoked-glass sheen */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 12% 28%, rgba(${accentRgb}, 0.14), transparent 56%)`,
        }}
      />

      {/* Diffused background artwork glow when lead track has coverUrl */}
      {leadCoverUrl && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-3/4 opacity-30"
          style={{
            maskImage: 'linear-gradient(to left, rgba(0,0,0,0.9) 12%, transparent 88%)',
            WebkitMaskImage:
              'linear-gradient(to left, rgba(0,0,0,0.9) 12%, transparent 88%)',
          }}
        >
          <img
            src={leadCoverUrl}
            alt=""
            className="w-full h-full object-cover scale-110 blur-xl grayscale-[25%]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#09090d]/85 via-[#09090d]/35 to-transparent" />
        </div>
      )}

      <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-center gap-5 sm:gap-6">
        <div
          className="relative shrink-0"
          style={
            isCurrent
              ? { filter: `drop-shadow(0 0 16px rgba(${accentRgb}, 0.45))` }
              : undefined
          }
        >
          {renderEmblem()}
          {isCurrent && (
            <span
              title={isPlaying ? 'Sedang diputar' : 'Dijeda'}
              className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 w-9 h-9 rounded-full border border-white/25 bg-[#0a0a0e] grid place-items-center shadow-[0_6px_16px_-4px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.18)]"
            >
              <span
                className={`absolute inset-[3px] rounded-full ${
                  isPlaying
                    ? 'animate-spin [animation-duration:3.2s] motion-reduce:animate-none'
                    : ''
                }`}
                style={{
                  background:
                    'repeating-radial-gradient(circle at 50% 50%, #16161c 0 1px, #08080b 1px 3px)',
                }}
              >
                <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-white/45 blur-[1px]" />
                <span
                  className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full ring-1 ring-black/60"
                  style={{ backgroundColor: `rgb(${accentRgb})` }}
                />
              </span>
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 w-full text-center sm:text-left space-y-2.5">
          {/* Eyebrow Pill + Optional Back Drill-Down Button */}
          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            {onBackHome && (
              <button
                type="button"
                onClick={onBackHome}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full glass-pill-btn font-mono text-[10px] tracking-[0.14em] uppercase text-zinc-200 hover:text-white transition active:scale-[0.98]"
              >
                <ArrowLeft size={11} weight="bold" />
                <span>Back</span>
              </button>
            )}

            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase px-2.5 py-0.5 rounded-full bg-white/10 border border-white/12 text-zinc-200">
              <EyebrowIcon
                size={11}
                weight={kind === 'liked' ? 'fill' : 'regular'}
              />
              <span>{eyebrow}</span>
            </span>

            {isCurrent && (
              <span
                className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase px-2.5 py-0.5 rounded-full border"
                style={{
                  backgroundColor: `rgba(${accentRgb}, 0.16)`,
                  borderColor: `rgba(${accentRgb}, 0.45)`,
                  color: `rgb(${accentRgb})`,
                }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full bg-current ${
                    isPlaying ? 'animate-pulse' : 'opacity-40'
                  }`}
                />
                <span>{isPlaying ? 'Now Playing' : 'Paused'}</span>
              </span>
            )}
          </div>

          {/* Title & Subtitle */}
          <div className="space-y-1 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 min-w-0 group/title">
              {editingTitle ? (
                <input
                  autoFocus
                  aria-label="Nama playlist"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishRename(true);
                    if (e.key === 'Escape') finishRename(false);
                  }}
                  onBlur={() => finishRename(true)}
                  className="w-full max-w-md min-w-0 bg-transparent border-b border-white/35 text-3xl sm:text-4xl font-extrabold tracking-tight text-white focus:outline-none focus:border-white/70"
                />
              ) : (
                <>
                  <h1
                    title={title}
                    className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white truncate"
                  >
                    {title}
                  </h1>
                  {onRename && (
                    <button
                      type="button"
                      onClick={() => {
                        renameHandled.current = false;
                        setDraftTitle(title);
                        setEditingTitle(true);
                      }}
                      aria-label="Ganti nama playlist"
                      title="Ganti nama playlist"
                      className="shrink-0 p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      <PencilSimple size={13} />
                    </button>
                  )}
                </>
              )}
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 truncate">{subtitle}</p>
          </div>

          {/* Telemetry Strip */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1 font-mono text-[11px] text-zinc-400 tabular-nums">
            <span className="text-zinc-200 font-medium">
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <span>{formatDuration(telemetry.totalDuration)}</span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <span>
              {telemetry.totalPlays} {telemetry.totalPlays === 1 ? 'play' : 'plays'}
            </span>
            {telemetry.formats.length > 0 && (
              <>
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[10px] tracking-wider text-zinc-300">
                  {telemetry.formats.join(' / ')}
                </span>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <button
              type="button"
              onClick={liveControls ? onTogglePlay : onPlayFirst}
              disabled={tracks.length === 0}
              aria-label={
                liveControls
                  ? isPlaying
                    ? `Pause ${title}`
                    : `Resume ${title}`
                  : `Play all of ${title}`
              }
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold transition shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {liveControls && isPlaying ? (
                <Pause size={14} weight="fill" />
              ) : (
                <Play size={14} weight="fill" />
              )}
              <span>
                {liveControls ? (isPlaying ? 'Pause' : 'Resume') : 'Play All'}
              </span>
            </button>

            <button
              type="button"
              onClick={onShufflePlay}
              disabled={tracks.length === 0}
              aria-pressed={isShuffle}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-mono text-[11px] transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                isShuffle
                  ? 'bg-white/18 border border-white/30 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]'
                  : 'glass-pill-btn text-zinc-100'
              }`}
            >
              <Shuffle size={13} weight={isShuffle ? 'bold' : 'regular'} />
              <span>Shuffle</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
