import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  FolderPlus,
  Headphones,
  MusicNote,
  Play,
  Shuffle,
  Sparkle,
  User,
} from '@phosphor-icons/react';
import { Track } from '../types/music';
import { formatTime, formatDuration } from '../utils/id3';
import { CoverArtRenderer } from './CoverArtRenderer';

export interface ArtistItem {
  name: string;
  coverUrl: string | null;
  accentColor: [number, number, number];
  count: number;
  totalDuration: number;
}

interface ArtistsViewProps {
  artists: ArtistItem[];
  tracks: Track[];
  playCounts: Record<string, number>;
  currentTrack: Track | null;
  onPlayTrack: (track: Track) => void;
  onSelectArtist: (artistName: string) => void;
  onAddFolder: () => void;
  onViewAllTracks: () => void;
}

type ArtistSortMode = 'tracks' | 'plays' | 'alpha';

const SORT_OPTIONS: { id: ArtistSortMode; label: string }[] = [
  { id: 'tracks', label: 'Most Tracks' },
  { id: 'plays', label: 'Most Played' },
  { id: 'alpha', label: 'A-Z' },
];

export const ArtistsView: React.FC<ArtistsViewProps> = ({
  artists,
  tracks,
  playCounts,
  currentTrack,
  onPlayTrack,
  onSelectArtist,
  onAddFolder,
  onViewAllTracks,
}) => {
  const [sortMode, setSortMode] = useState<ArtistSortMode>('tracks');

  const { tracksByArtist, artistPlaysMap, totalPlaysLogged } = useMemo(() => {
    const grouped = new Map<string, Track[]>();
    const plays = new Map<string, number>();
    let totalPlays = 0;

    for (const track of tracks) {
      const artistName = track.artist || 'Unknown Artist';
      const list = grouped.get(artistName);
      if (list) {
        list.push(track);
      } else {
        grouped.set(artistName, [track]);
      }

      const trackPlays = playCounts[track.key] || 0;
      totalPlays += trackPlays;
      plays.set(artistName, (plays.get(artistName) || 0) + trackPlays);
    }

    return {
      tracksByArtist: grouped,
      artistPlaysMap: plays,
      totalPlaysLogged: totalPlays,
    };
  }, [tracks, playCounts]);

  const sortedArtists = useMemo(() => {
    const copy = [...artists];
    if (sortMode === 'alpha') {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'plays') {
      copy.sort(
        (a, b) =>
          (artistPlaysMap.get(b.name) || 0) - (artistPlaysMap.get(a.name) || 0) ||
          b.count - a.count ||
          a.name.localeCompare(b.name)
      );
    } else {
      copy.sort(
        (a, b) =>
          b.count - a.count ||
          (artistPlaysMap.get(b.name) || 0) - (artistPlaysMap.get(a.name) || 0) ||
          a.name.localeCompare(b.name)
      );
    }
    return copy;
  }, [artists, sortMode, artistPlaysMap]);

  const spotlight = sortedArtists[0] ?? null;

  const spotlightTracks = useMemo(() => {
    if (!spotlight) return [];
    const list = tracksByArtist.get(spotlight.name) ?? [];
    return [...list].sort(
      (a, b) =>
        (playCounts[b.key] || 0) - (playCounts[a.key] || 0) ||
        b.addedAt - a.addedAt
    );
  }, [spotlight, tracksByArtist, playCounts]);

  const spotlightTopTracks = useMemo(
    () => spotlightTracks.slice(0, 3),
    [spotlightTracks]
  );

  const handlePlaySpotlightMix = () => {
    if (spotlightTracks.length === 0) return;
    const pool =
      spotlightTracks.length > 1 && currentTrack
        ? spotlightTracks.filter((t) => t.id !== currentTrack.id)
        : spotlightTracks;
    const candidates = pool.length > 0 ? pool : spotlightTracks;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    onPlayTrack(pick);
  };

  return (
    <div className="w-full space-y-5">
      {/* Full-Width Directory Masthead */}
      <section className="smoked-glass rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase px-2.5 py-0.5 rounded-full bg-white/10 border border-white/12 text-zinc-200">
                <User size={11} weight="fill" />
                <span>DIRECTORY</span>
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-black/35 border border-white/[0.08] text-zinc-300 tabular-nums">
                <Headphones size={12} className="text-zinc-400" />
                <span>
                  {artists.length} {artists.length === 1 ? 'Artist' : 'Artists'} ·{' '}
                  {totalPlaysLogged} {totalPlaysLogged === 1 ? 'Play' : 'Plays'} Logged
                </span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Artists
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-full bg-black/35 border border-white/[0.08]">
              {SORT_OPTIONS.map((opt) => {
                const active = sortMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSortMode(opt.id)}
                    className={`px-3 py-1 rounded-full font-mono text-[11px] transition ${
                      active
                        ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onViewAllTracks}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full glass-pill-btn text-xs font-medium text-zinc-100 transition active:scale-[0.98]"
            >
              <span>View All Tracks</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {artists.length === 0 ? (
        /* Editorial Artist Directory Empty Showcase */
        <section className="smoked-glass rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                'radial-gradient(circle at 50% 28%, rgba(228, 228, 231, 0.12), transparent 62%)',
            }}
          />

          <div className="relative z-10 max-w-xl mx-auto flex flex-col items-center space-y-6">
            {/* Circular Halo Portrait Placeholders */}
            <div className="flex items-center justify-center -space-x-4 pt-1">
              <div className="w-20 h-20 rounded-full border border-dashed border-white/20 bg-white/[0.03] backdrop-blur-md flex flex-col items-center justify-center text-zinc-500">
                <span className="font-mono text-xs tracking-widest text-zinc-400">01</span>
                <MusicNote size={14} className="mt-0.5 text-zinc-500" />
              </div>

              <div className="relative z-10 w-28 h-28 rounded-full p-1.5 border border-white/25 bg-black/45 shadow-[0_0_40px_-8px_rgba(255,255,255,0.22)]">
                <div className="w-full h-full rounded-full border border-dashed border-white/30 bg-white/[0.06] backdrop-blur-xl flex flex-col items-center justify-center text-zinc-200">
                  <User size={28} weight="regular" className="text-zinc-200" />
                  <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-zinc-400 mt-1">
                    ROSTER
                  </span>
                </div>
              </div>

              <div className="w-20 h-20 rounded-full border border-dashed border-white/20 bg-white/[0.03] backdrop-blur-md flex flex-col items-center justify-center text-zinc-500">
                <span className="font-mono text-xs tracking-widest text-zinc-400">M·A</span>
                <Headphones size={14} className="mt-0.5 text-zinc-500" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-zinc-400">
                ARTIST DIRECTORY EMPTY
              </p>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                No Artists Indexed in Vault
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400">
                Artists appear automatically from audio metadata and folders
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onAddFolder}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-bold transition shadow-md active:scale-[0.98]"
              >
                <FolderPlus size={15} weight="bold" />
                <span>Scan Folder</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        spotlight && (
          <>
            {/* Featured Artist Spotlight Banner */}
            <section className="smoked-glass rounded-2xl p-5 sm:p-6 relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  background: `radial-gradient(circle at 14% 50%, rgba(${spotlight.accentColor.join(
                    ','
                  )}, 0.18), transparent 55%)`,
                }}
              />

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                {/* Left Side: Circular Halo Portrait + Identity + Actions */}
                <div className="lg:col-span-7 flex flex-col sm:flex-row items-center sm:items-center gap-5 min-w-0 text-center sm:text-left">
                  <div className="relative shrink-0">
                    <div
                      className="pointer-events-none absolute -inset-3 rounded-full blur-xl opacity-55"
                      style={{
                        background: `radial-gradient(circle, rgba(${spotlight.accentColor.join(
                          ','
                        )}, 0.65) 0%, transparent 72%)`,
                      }}
                    />
                    <div
                      className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 border border-white/20 bg-black/45"
                      style={{
                        boxShadow: `0 0 36px -10px rgba(${spotlight.accentColor.join(',')}, 0.65)`,
                      }}
                    >
                      <CoverArtRenderer
                        coverUrl={spotlight.coverUrl}
                        title={spotlight.name}
                        mode="hd"
                        accentColor={spotlight.accentColor}
                        size={128}
                        className="w-full h-full rounded-full"
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-zinc-100">
                      <Sparkle size={11} weight="fill" />
                      <span>ARTIST SPOTLIGHT</span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white truncate">
                      {spotlight.name}
                    </h2>

                    <p className="font-mono text-[11px] text-zinc-300 tabular-nums">
                      {spotlight.count} {spotlight.count === 1 ? 'track' : 'tracks'} ·{' '}
                      {formatDuration(spotlight.totalDuration)} ·{' '}
                      {artistPlaysMap.get(spotlight.name) || 0}{' '}
                      {(artistPlaysMap.get(spotlight.name) || 0) === 1 ? 'play' : 'plays'}
                    </p>

                    <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <button
                        type="button"
                        onClick={handlePlaySpotlightMix}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-bold transition shadow-md active:scale-[0.98]"
                      >
                        <Shuffle size={14} weight="bold" />
                        <span>Play Mix</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectArtist(spotlight.name)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full glass-pill-btn text-xs font-medium text-zinc-100 transition active:scale-[0.98]"
                      >
                        <span>Open Discography</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Side: Inline Top 3 Tracks by Spotlight Artist */}
                <div className="lg:col-span-5 glass-inner-card rounded-2xl p-3.5 space-y-2 min-w-0">
                  <div className="flex items-center justify-between px-1 pb-0.5">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase text-zinc-300">
                      <MusicNote size={12} weight="fill" />
                      <span>Top Tracks</span>
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {spotlightTopTracks.length} of {spotlightTracks.length}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {spotlightTopTracks.map((track, idx) => {
                      const isCurrent = currentTrack?.id === track.id;
                      const trackPlays = playCounts[track.key] || 0;
                      return (
                        <button
                          key={track.id}
                          type="button"
                          onClick={() => onPlayTrack(track)}
                          className={`group w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition ${
                            isCurrent
                              ? 'bg-white/[0.14] border-white/25'
                              : 'bg-black/25 border-white/[0.06] hover:bg-white/[0.08] hover:border-white/15'
                          }`}
                        >
                          <span className="w-5 text-center font-mono text-[11px] shrink-0">
                            {isCurrent ? (
                              <span
                                className="font-bold"
                                style={{ color: `rgb(${spotlight.accentColor.join(',')})` }}
                              >
                                ●
                              </span>
                            ) : (
                              <>
                                <span className="text-zinc-500 group-hover:hidden">
                                  0{idx + 1}
                                </span>
                                <Play
                                  size={11}
                                  weight="fill"
                                  className="hidden group-hover:inline-block text-white"
                                />
                              </>
                            )}
                          </span>

                          <CoverArtRenderer
                            coverUrl={track.coverUrl}
                            title={track.title}
                            mode="hd"
                            accentColor={track.accentColor}
                            size={36}
                            className="w-9 h-9 rounded-lg shrink-0"
                          />

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white truncate">
                              {track.title}
                            </p>
                            <p className="text-[11px] text-zinc-400 truncate">
                              {track.album}
                            </p>
                          </div>

                          <div className="text-right shrink-0 space-y-0.5">
                            <p className="font-mono text-[10px] text-zinc-300 tabular-nums">
                              {formatTime(track.duration)}
                            </p>
                            {trackPlays > 0 && (
                              <p className="font-mono text-[9px] text-zinc-500 tabular-nums">
                                {trackPlays} {trackPlays === 1 ? 'play' : 'plays'}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* Circular Roster Grid */}
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-white">
                  Roster ({sortedArtists.length})
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {SORT_OPTIONS.find((s) => s.id === sortMode)?.label}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {sortedArtists.map((art) => {
                  const artistPlays = artistPlaysMap.get(art.name) || 0;
                  const isSpotlit = art.name === spotlight.name;
                  return (
                    <button
                      key={art.name}
                      type="button"
                      onClick={() => onSelectArtist(art.name)}
                      className="group smoked-glass rounded-2xl p-4 text-center hover:border-white/25 transition flex flex-col items-center gap-3 relative overflow-hidden"
                    >
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-0 group-hover:opacity-65 transition duration-500"
                        style={{
                          background: `radial-gradient(circle at 50% 0%, rgba(${art.accentColor.join(
                            ','
                          )}, 0.22), transparent 72%)`,
                        }}
                      />

                      <div className="relative z-10">
                        <div
                          className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full p-1 bg-black/40 border transition duration-300 ${
                            isSpotlit
                              ? 'border-white/30'
                              : 'border-white/15 group-hover:border-white/30'
                          }`}
                          style={{
                            boxShadow: `0 12px 28px -12px rgba(${art.accentColor.join(',')}, 0.45)`,
                          }}
                        >
                          <CoverArtRenderer
                            coverUrl={art.coverUrl}
                            title={art.name}
                            mode="hd"
                            accentColor={art.accentColor}
                            size={112}
                            className="w-full h-full rounded-full"
                          />
                        </div>

                        <span className="absolute bottom-0.5 right-0.5 w-7 h-7 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition">
                          <Play size={12} weight="fill" />
                        </span>
                      </div>

                      <div className="relative z-10 min-w-0 w-full space-y-1">
                        <p className="text-sm font-semibold text-white truncate">
                          {art.name}
                        </p>
                        <p className="font-mono text-[10px] text-zinc-400 tabular-nums">
                          {art.count} {art.count === 1 ? 'track' : 'tracks'} ·{' '}
                          {formatDuration(art.totalDuration)}
                        </p>
                      </div>

                      <span className="relative z-10 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full glass-inner-card font-mono text-[10px] text-zinc-300 tabular-nums">
                        <Headphones size={10} className="text-zinc-400" />
                        <span>
                          {artistPlays} {artistPlays === 1 ? 'play' : 'plays'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
};
