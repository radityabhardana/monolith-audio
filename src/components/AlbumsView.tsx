import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Clock,
  Disc,
  FolderPlus,
  Play,
  Queue,
  VinylRecord,
} from '@phosphor-icons/react';
import { Track } from '../types/music';
import { formatTime, formatDuration } from '../utils/id3';
import { CoverArtRenderer } from './CoverArtRenderer';

export interface AlbumItem {
  name: string;
  artist: string;
  coverUrl: string | null;
  accentColor: [number, number, number];
  count: number;
  firstTrack: Track;
}

interface AlbumsViewProps {
  albums: AlbumItem[];
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (track: Track) => void;
  onSelectAlbum: (albumName: string) => void;
  onAddFolder: () => void;
  onViewAllTracks: () => void;
}

type AlbumSortMode = 'default' | 'alpha' | 'tracks' | 'runtime';

interface EnrichedAlbum {
  album: AlbumItem;
  albumTracks: Track[];
  trackCount: number;
  totalDuration: number;
}

const SORT_OPTIONS: { id: AlbumSortMode; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'alpha', label: 'A-Z' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'runtime', label: 'Runtime' },
];

export const AlbumsView: React.FC<AlbumsViewProps> = ({
  albums,
  tracks,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onSelectAlbum,
  onAddFolder,
  onViewAllTracks,
}) => {
  const [sortBy, setSortBy] = useState<AlbumSortMode>('default');

  const totalRuntimeSec = useMemo(
    () =>
      tracks.reduce(
        (sum, t) => sum + (Number.isFinite(t.duration) ? t.duration : 0),
        0
      ),
    [tracks]
  );

  const enrichedAlbums = useMemo<EnrichedAlbum[]>(() => {
    const grouped = new Map<string, Track[]>();
    for (const track of tracks) {
      const existing = grouped.get(track.album);
      if (existing) {
        existing.push(track);
      } else {
        grouped.set(track.album, [track]);
      }
    }

    return albums.map((album) => {
      const matched = grouped.get(album.name);
      const albumTracks =
        matched && matched.length > 0 ? matched : [album.firstTrack];
      const totalDuration = albumTracks.reduce(
        (sum, t) => sum + (Number.isFinite(t.duration) ? t.duration : 0),
        0
      );

      return {
        album,
        albumTracks,
        trackCount: matched ? matched.length : album.count,
        totalDuration,
      };
    });
  }, [albums, tracks]);

  const sortedAlbums = useMemo(() => {
    if (sortBy === 'default') return enrichedAlbums;
    const copy = [...enrichedAlbums];
    if (sortBy === 'alpha') {
      copy.sort((a, b) => a.album.name.localeCompare(b.album.name));
    } else if (sortBy === 'tracks') {
      copy.sort(
        (a, b) =>
          b.trackCount - a.trackCount ||
          a.album.name.localeCompare(b.album.name)
      );
    } else if (sortBy === 'runtime') {
      copy.sort(
        (a, b) =>
          b.totalDuration - a.totalDuration ||
          a.album.name.localeCompare(b.album.name)
      );
    }
    return copy;
  }, [enrichedAlbums, sortBy]);

  const featured = useMemo(() => {
    if (sortedAlbums.length === 0) return null;
    if (isPlaying && currentTrack) {
      const playingMatch = sortedAlbums.find(
        (entry) => entry.album.name === currentTrack.album
      );
      if (playingMatch) return playingMatch;
    }
    return sortedAlbums[0];
  }, [sortedAlbums, isPlaying, currentTrack]);

  const isFeaturedPlaying = Boolean(
    featured &&
      isPlaying &&
      currentTrack &&
      currentTrack.album === featured.album.name
  );

  return (
    <div className="w-full space-y-5 pb-6">
      {/* Full-Width Crate Header Bar */}
      <div className="smoked-glass rounded-2xl px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl glass-inner-card flex items-center justify-center text-zinc-200 shrink-0">
              <VinylRecord size={20} />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Albums
            </h1>
          </div>

          <span className="font-mono text-[11px] text-zinc-300 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] tabular-nums">
            {albums.length} {albums.length === 1 ? 'Album' : 'Albums'} ·{' '}
            {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'} ·{' '}
            {formatTime(totalRuntimeSec)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Sort albums"
            className="flex items-center gap-0.5 p-1 rounded-full bg-black/35 border border-white/[0.08]"
          >
            {SORT_OPTIONS.map((opt) => {
              const active = sortBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSortBy(opt.id)}
                  className={`px-3 py-1 rounded-full font-mono text-[11px] transition ${
                    active
                      ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
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
            <Queue size={14} />
            <span>View Tracks</span>
          </button>

          <button
            type="button"
            onClick={onAddFolder}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full glass-pill-btn text-xs font-medium text-zinc-100 transition active:scale-[0.98]"
          >
            <FolderPlus size={14} />
            <span>Add Folder</span>
          </button>
        </div>
      </div>

      {albums.length === 0 ? (
        /* Vinyl Crate Empty Gallery */
        <div className="smoked-glass rounded-3xl p-8 sm:p-12 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.06),transparent_65%)]" />

          <div className="relative z-10 max-w-xl mx-auto flex flex-col items-center text-center">
            {/* 3 Staggered Angled Sleeve Silhouettes */}
            <div className="relative h-44 sm:h-48 w-full flex items-center justify-center mb-6 select-none">
              {/* Left Sleeve Silhouette */}
              <div className="-rotate-12 -translate-x-16 sm:-translate-x-20 translate-y-2 w-28 h-28 sm:w-32 sm:h-32 rounded-2xl smoked-glass border border-white/15 p-3 flex flex-col justify-between opacity-70">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-zinc-500">#01</span>
                  <span className="w-2 h-2 rounded-full bg-white/15" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-1.5 w-3/4 rounded-full bg-white/15" />
                  <div className="h-1.5 w-1/2 rounded-full bg-white/10" />
                </div>
              </div>

              {/* Right Sleeve Silhouette */}
              <div className="rotate-12 translate-x-16 sm:translate-x-20 translate-y-2 w-28 h-28 sm:w-32 sm:h-32 rounded-2xl smoked-glass border border-white/15 p-3 flex flex-col justify-between opacity-70">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-zinc-500">#03</span>
                  <span className="w-2 h-2 rounded-full bg-white/15" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-1.5 w-2/3 rounded-full bg-white/15" />
                  <div className="h-1.5 w-1/2 rounded-full bg-white/10" />
                </div>
              </div>

              {/* Center Featured Sleeve Silhouette with Vinyl Disc Peek */}
              <div className="relative z-10 flex items-center">
                <div className="absolute -right-7 top-1/2 -translate-y-1/2 w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#07070a] border border-white/15 shadow-2xl flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border border-white/[0.07] flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-zinc-900 border border-white/20" />
                  </div>
                </div>
                <div className="relative z-10 w-32 h-32 sm:w-36 sm:h-36 rounded-2xl smoked-glass-elevated border border-white/25 p-3.5 flex flex-col justify-between shadow-[0_24px_50px_rgba(0,0,0,0.85)]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] tracking-widest text-zinc-400">
                      CRATE
                    </span>
                    <span className="font-mono text-[9px] text-zinc-500">
                      33⅓
                    </span>
                  </div>
                  <div className="flex items-center justify-center text-zinc-300">
                    <VinylRecord size={34} />
                  </div>
                  <div className="space-y-1">
                    <div className="h-1.5 w-4/5 rounded-full bg-white/25" />
                    <div className="h-1 w-1/2 rounded-full bg-white/12" />
                  </div>
                </div>
              </div>
            </div>

            <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-zinc-400 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.1]">
              ALBUM CRATE // INDEX
            </span>

            <h2 className="mt-4 text-xl sm:text-2xl font-bold tracking-tight text-white">
              Your sleeve crate is ready to index
            </h2>

            <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-md">
              Scan a local music folder to extract embedded ID3 and FLAC cover
              artwork, group releases by album tag, and flip through sleeves by
              track count or runtime.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={onAddFolder}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-bold transition shadow-lg"
              >
                <FolderPlus size={15} weight="bold" />
                <span>Scan Music Folder</span>
              </motion.button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Featured Album Showcase Card */}
          {featured && (
            <section className="smoked-glass rounded-3xl overflow-hidden relative p-5 sm:p-7">
              {/* Atmospheric Obsidian Backdrop */}
              {featured.album.coverUrl && (
                <div
                  className="pointer-events-none absolute inset-0 opacity-25"
                  style={{
                    maskImage:
                      'radial-gradient(ellipse at 65% 45%, rgba(0,0,0,0.95) 12%, transparent 78%)',
                    WebkitMaskImage:
                      'radial-gradient(ellipse at 65% 45%, rgba(0,0,0,0.95) 12%, transparent 78%)',
                  }}
                >
                  <img
                    src={featured.album.coverUrl}
                    alt=""
                    className="w-full h-full object-cover grayscale-[20%] scale-105"
                  />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#09090c]/90 via-[#09090c]/55 to-[#09090c]/85" />

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-7 items-center">
                {/* Left: Square Jacket Sleeve + Peeking Dark Vinyl Disc */}
                <div className="lg:col-span-4 xl:col-span-3 flex justify-center lg:justify-start">
                  <button
                    type="button"
                    onClick={() => onSelectAlbum(featured.album.name)}
                    aria-label={`Open ${featured.album.name}`}
                    className="group relative w-44 h-44 sm:w-48 sm:h-48 shrink-0 mr-8 sm:mr-10 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-2xl"
                  >
                    {/* Peeking Vinyl Disc */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 -right-8 sm:-right-10 w-40 h-40 sm:w-44 sm:h-44 rounded-full bg-[#09090c] border border-white/15 shadow-[0_14px_34px_rgba(0,0,0,0.92)] flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                        isFeaturedPlaying
                          ? 'translate-x-2'
                          : 'group-hover:translate-x-2.5'
                      }`}
                    >
                      <motion.div
                        animate={isFeaturedPlaying ? { rotate: 360 } : { rotate: 0 }}
                        transition={
                          isFeaturedPlaying
                            ? { repeat: Infinity, duration: 9, ease: 'linear' }
                            : { duration: 0.4 }
                        }
                        className="relative w-full h-full rounded-full flex items-center justify-center"
                      >
                        <div className="absolute inset-2.5 rounded-full border border-white/[0.06]" />
                        <div className="absolute inset-6 rounded-full border border-white/[0.08]" />
                        <div className="absolute inset-10 rounded-full border border-white/[0.05]" />
                        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/20 flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-[#07070a] border border-white/30" />
                        </div>
                      </motion.div>
                    </div>

                    {/* Foreground Sleeve */}
                    <div className="relative z-10 w-full h-full rounded-2xl overflow-hidden border border-white/20 shadow-[0_22px_48px_rgba(0,0,0,0.88)]">
                      <CoverArtRenderer
                        coverUrl={featured.album.coverUrl}
                        title={featured.album.name}
                        mode="hd"
                        accentColor={featured.album.accentColor}
                        size={220}
                        className="w-full h-full rounded-2xl"
                      />
                    </div>
                  </button>
                </div>

                {/* Middle: Metadata & Controls */}
                <div className="lg:col-span-4 xl:col-span-5 min-w-0 space-y-3 text-center lg:text-left">
                  <div className="flex items-center justify-center lg:justify-start flex-wrap gap-2">
                    <span className="font-mono text-[10px] tracking-[0.18em] uppercase px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-zinc-200">
                      FEATURED RELEASE
                    </span>
                    <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-zinc-300">
                      {featured.album.firstTrack.format}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-black/40 border border-white/10 text-zinc-300 tabular-nums">
                      <Clock size={11} />
                      <span>{formatDuration(featured.totalDuration)}</span>
                    </span>
                    {isFeaturedPlaying && (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white text-zinc-950 font-semibold">
                        <Disc size={11} className="animate-spin" />
                        <span>Spinning</span>
                      </span>
                    )}
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight line-clamp-2">
                    {featured.album.name}
                  </h2>

                  <p className="text-sm text-zinc-300 truncate">
                    <span>{featured.album.artist}</span>
                    <span className="text-zinc-500"> · </span>
                    <span className="font-mono text-xs text-zinc-400">
                      {featured.trackCount}{' '}
                      {featured.trackCount === 1 ? 'track' : 'tracks'}
                    </span>
                  </p>

                  <div className="pt-1 flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => onPlayTrack(featured.album.firstTrack)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-bold transition shadow-lg"
                    >
                      <Play size={14} weight="fill" />
                      <span>Play Album</span>
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => onSelectAlbum(featured.album.name)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full glass-pill-btn text-xs font-semibold text-zinc-100 transition"
                    >
                      <span>Browse Tracklist</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>

                {/* Right: Inline Mini Tracklist (Up to 4 Tracks) */}
                <div className="lg:col-span-4 xl:col-span-4 min-w-0">
                  <div className="glass-inner-card rounded-2xl p-2.5 space-y-1">
                    <div className="flex items-center justify-between px-2.5 py-1 border-b border-white/[0.06] font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                      <span>SIDE A // TRACKLIST</span>
                      <span>{featured.trackCount} TOTAL</span>
                    </div>

                    {featured.albumTracks.slice(0, 4).map((track, idx) => {
                      const isActiveTrack = currentTrack?.id === track.id;
                      const isActivePlaying = isActiveTrack && isPlaying;
                      return (
                        <button
                          key={track.id}
                          type="button"
                          onClick={() => onPlayTrack(track)}
                          className={`group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-left transition ${
                            isActiveTrack
                              ? 'bg-white/[0.12] border-white/20 text-white'
                              : 'border-transparent hover:bg-white/[0.06] text-zinc-200'
                          }`}
                        >
                          <span className="w-5 text-center font-mono text-[10px] text-zinc-400 shrink-0 tabular-nums">
                            {isActivePlaying ? (
                              <span
                                className="font-bold animate-pulse"
                                style={{
                                  color: `rgb(${featured.album.accentColor.join(',')})`,
                                }}
                              >
                                ⣶
                              </span>
                            ) : (
                              <>
                                <span className="group-hover:hidden">
                                  {String(idx + 1).padStart(2, '0')}
                                </span>
                                <Play
                                  size={11}
                                  weight="fill"
                                  className="hidden group-hover:inline-block text-white"
                                />
                              </>
                            )}
                          </span>

                          <span className="min-w-0 flex-1 text-xs font-medium truncate">
                            {track.title}
                          </span>

                          <span className="font-mono text-[10px] text-zinc-400 tabular-nums shrink-0">
                            {formatTime(track.duration)}
                          </span>
                        </button>
                      );
                    })}

                    {featured.trackCount > 4 && (
                      <button
                        type="button"
                        onClick={() => onSelectAlbum(featured.album.name)}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-white/[0.06] font-mono text-[10px] text-zinc-400 hover:text-white transition"
                      >
                        <span>+{featured.trackCount - 4} more tracks</span>
                        <ArrowRight size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Multi-Column Vinyl Sleeve Grid */}
          <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedAlbums.map((entry, idx) => {
              const { album, trackCount, totalDuration } = entry;
              const isAlbumPlaying = Boolean(
                isPlaying && currentTrack && currentTrack.album === album.name
              );

              return (
                <article
                  key={album.name}
                  className="group smoked-glass rounded-2xl p-3 flex flex-col gap-3 hover:border-white/25 transition relative"
                >
                  {/* Sleeve Wrapper with Hover Vinyl Peek & Floating Play Button */}
                  <div className="relative aspect-square w-full">
                    {/* Vinyl Disc Peek Layer */}
                    <div
                      className={`pointer-events-none absolute top-1.5 bottom-1.5 right-0 w-[92%] rounded-full bg-[#08080b] border border-white/15 shadow-lg transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex items-center justify-center ${
                        isAlbumPlaying
                          ? 'translate-x-2'
                          : 'translate-x-0 group-hover:translate-x-2'
                      }`}
                    >
                      <div className="absolute inset-3 rounded-full border border-white/[0.06]" />
                      <div className="w-7 h-7 rounded-full bg-zinc-900 border border-white/15" />
                    </div>

                    {/* Clickable Album Cover */}
                    <button
                      type="button"
                      onClick={() => onSelectAlbum(album.name)}
                      className="relative z-10 w-full h-full rounded-xl overflow-hidden border border-white/15 bg-zinc-950 block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    >
                      <CoverArtRenderer
                        coverUrl={album.coverUrl}
                        title={album.name}
                        mode="hd"
                        accentColor={album.accentColor}
                        size={240}
                        className="w-full h-full group-hover:scale-[1.03] transition duration-500"
                      />

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/75 to-transparent" />

                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 font-mono text-[10px] font-medium text-zinc-200 tabular-nums">
                        #{String(idx + 1).padStart(2, '0')}
                      </span>

                      {isAlbumPlaying && (
                        <span
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-md"
                          title="Now playing"
                        >
                          <Disc size={12} className="animate-spin" />
                        </span>
                      )}
                    </button>

                    {/* Floating Play Overlay Button */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayTrack(album.firstTrack);
                      }}
                      aria-label={`Play ${album.name}`}
                      title={`Play ${album.name}`}
                      className={`absolute bottom-2.5 right-2.5 z-20 w-9 h-9 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 flex items-center justify-center shadow-[0_8px_20px_rgba(0,0,0,0.65)] transition duration-200 ${
                        isAlbumPlaying
                          ? 'opacity-100 translate-y-0'
                          : 'opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 focus:opacity-100 focus:translate-y-0'
                      }`}
                    >
                      <Play size={14} weight="fill" />
                    </motion.button>
                  </div>

                  {/* Sleeve Metadata */}
                  <button
                    type="button"
                    onClick={() => onSelectAlbum(album.name)}
                    className="min-w-0 text-left flex-1 flex flex-col justify-between focus:outline-none"
                  >
                    <div className="min-w-0 w-full">
                      <p className="text-xs sm:text-sm font-semibold text-white truncate">
                        {album.name}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {album.artist}
                      </p>
                    </div>

                    <div className="w-full mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-zinc-400 tabular-nums truncate">
                        {trackCount} {trackCount === 1 ? 'track' : 'tracks'} ·{' '}
                        {formatTime(totalDuration)}
                      </span>
                      <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-zinc-300 shrink-0">
                        {album.firstTrack.format}
                      </span>
                    </div>
                  </button>
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
};
