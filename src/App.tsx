import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Broadcast,
  Browsers,
  Check,
  ClockCounterClockwise,
  Disc,
  DownloadSimple,
  Equalizer,
  FileAudio,
  FolderPlus,
  Heart,
  House,
  ListChecks,
  ListPlus,
  MagnifyingGlass,
  Minus,
  Moon,
  Pause,
  PencilSimple,
  Play,
  Plus,
  Queue,
  Repeat,
  RepeatOnce,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  Trash,
  User,
  YoutubeLogo,
} from '@phosphor-icons/react';
import { AlbumsView } from './components/AlbumsView';
import { ArtistsView } from './components/ArtistsView';
import { AsciiVisualizer } from './components/AsciiVisualizer';
import { AudioFxPanel } from './components/AudioFxPanel';
import { CollectionBanner, CollectionKind } from './components/CollectionBanner';
import { CommandPalette } from './components/CommandPalette';
import { ConfirmModal } from './components/ConfirmModal';
import { CoverArtRenderer } from './components/CoverArtRenderer';
import { DevaultArtworkCanvas } from './components/DevaultArtworkCanvas';
import { ImportYouTubeModal } from './components/ImportYouTubeModal';
import { KawarpBackdrop } from './components/KawarpBackdrop';
import { LyricsPanel } from './components/LyricsPanel';
import { MetadataEditorModal } from './components/MetadataEditorModal';
import { PlaylistSource } from './components/PlaylistSource';
import { QueuePanel } from './components/QueuePanel';
import { TopDynamicIsland } from './components/TopDynamicIsland';
import { ZenModeOverlay } from './components/ZenModeOverlay';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useDevicePopup } from './hooks/useDevicePopup';
import {
  CoverRenderMode,
  HistoryEntry,
  LyricLine,
  NavSection,
  Playlist,
  RightDrawerTab,
  SortMode,
  Track,
  TrackMetadataOverride,
  UserPreferences,
  VisualizerMode,
} from './types/music';
import { fetchInboxManifest, listIdOf, syncInbox } from './utils/inboxSync';
import {
  collectDroppedItems,
  ImportedFileItem,
  normalizeInputFiles,
} from './utils/folderImport';
import {
  extractDominantColor,
  formatDuration,
  formatTime,
  getAudioDuration,
  parseAudioFile,
  parseLrc,
} from './utils/id3';
import {
  DEFAULT_AUDIO_FX,
  hasMeaningfulPreferences,
  hasOnlyDefaultPlaylists,
  hasSavedLocalPreferences,
  isLocalOriginMigrated,
  isUntouchedDefaultPlaylist,
  loadDiskPlayback,
  loadDiskPreferences,
  loadLocalFilesFromDB,
  loadPlayback,
  loadPreferences,
  markLocalOriginMigrated,
  mergePreferences,
  removeLocalFileFromDB,
  saveDiskPlayback,
  saveDiskPreferences,
  saveLocalFilesToDB,
  savePlayback,
  savePreferences,
  StoredLocalFile,
} from './utils/storage';

const AUDIO_EXTENSIONS = /\.(mp3|flac|wav|ogg|m4a|aac|opus|webm)$/i;
const COVER_MODES: { id: CoverRenderMode; label: string }[] = [
  { id: 'braille', label: 'BRAILLE' },
  { id: 'ascii', label: 'ASCII' },
  { id: 'dither', label: 'DITHER' },
  { id: 'halftone', label: 'HALFTONE' },
  { id: 'orbit', label: 'ORBIT 3D' },
  { id: 'hd', label: 'ORIGINAL' },
];
const VIS_MODES: VisualizerMode[] = ['ascii-bars', 'dot-matrix', 'oscilloscope'];

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
}

function revokeTrackUrls(track: Track): void {
  if (track.fileUrl.startsWith('blob:')) URL.revokeObjectURL(track.fileUrl);
  if (track.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(track.coverUrl);
}

export function App() {
  const initialHasLocalPrefs = useMemo(() => hasSavedLocalPreferences(), []);
  const initialPrefs = useMemo(() => loadPreferences(), []);
  const asciiTunerRef = useRef(initialPrefs.asciiTuner);

  const [diskStateReady, setDiskStateReady] = useState(false);
  const diskStateReadyRef = useRef(false);
  diskStateReadyRef.current = diskStateReady;
  const diskAvailableRef = useRef(false);
  const diskExistedRef = useRef(false);
  const lastSavedPrefsJsonRef = useRef<string>('');
  const pendingDiskPrefsRef = useRef<UserPreferences | null>(null);
  const diskSaveTimerRef = useRef<number | null>(null);
  const lastSavedPlaybackKeyRef = useRef<string>('');

  const [tracks, setTracks] = useState<Track[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  // latest tracks for callbacks that can run while init is still loading files
  const tracksRef = useRef<Track[]>(tracks);
  tracksRef.current = tracks;
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [likedKeys, setLikedKeys] = useState<string[]>(initialPrefs.likedKeys);
  const [hiddenDemoKeys, setHiddenDemoKeys] = useState<string[]>(
    initialPrefs.hiddenDemoKeys
  );
  const [playlists, setPlaylists] = useState<Playlist[]>(initialPrefs.playlists);
  const playlistsRef = useRef<Playlist[]>(playlists);
  playlistsRef.current = playlists;
  const [playbackContext, setPlaybackContext] = useState<
    | { kind: 'playlist'; playlistId: string; keys: string[] }
    | { kind: 'list'; keys: string[] }
    | null
  >(null);
  const [customLyrics, setCustomLyrics] = useState<Record<string, LyricLine[]>>(
    initialPrefs.customLyrics
  );
  const [lyricOffsets, setLyricOffsets] = useState<Record<string, number>>(
    initialPrefs.lyricOffsets ?? {}
  );
  const [metadataOverrides, setMetadataOverrides] = useState<
    Record<string, TrackMetadataOverride>
  >(initialPrefs.metadataOverrides);
  const [history, setHistory] = useState<HistoryEntry[]>(initialPrefs.history);

  const [navSection, setNavSection] = useState<NavSection>('library');
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);
  const [artistFilter, setArtistFilter] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [playCounts, setPlayCounts] = useState<Record<string, number>>(initialPrefs.playCounts || {});
  const [rightTab, setRightTab] = useState<RightDrawerTab>('lyrics');
  const [searchQuery, setSearchQuery] = useState('');
  const [coverMode, setCoverMode] = useState<CoverRenderMode>(initialPrefs.coverMode);
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>(
    initialPrefs.visualizerMode
  );
  const asciiOverlayEnabled = false;

  const [zenOpen, setZenOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  } | null>(null);
  const devicePopup = useDevicePopup();
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [bulkPlaylistMenuOpen, setBulkPlaylistMenuOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    secondaryLabel?: string;
    onConfirm: () => void;
    onSecondaryConfirm?: () => void;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [importingCount, setImportingCount] = useState(0);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [playlistMenuTrackKey, setPlaylistMenuTrackKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2600);
  }, []);

  const hydratedTracks = useMemo(() => {
    const likedSet = new Set(likedKeys);
    return tracks.map((t) => {
      const ov = metadataOverrides[t.key];
      return {
        ...t,
        title: ov?.title ?? t.title,
        artist: ov?.artist ?? t.artist,
        album: ov?.album ?? t.album,
        liked: likedSet.has(t.key),
        lyrics: customLyrics[t.key] ?? t.lyrics,
      };
    });
  }, [tracks, likedKeys, customLyrics, metadataOverrides]);

  // YouTube-synced songs belong to their playlist; the Home/Albums/Artists
  // library views only list songs the user added themselves
  const libraryTracks = useMemo(
    () => hydratedTracks.filter((t) => !t.key.startsWith('yt::')),
    [hydratedTracks]
  );

  const currentTrack = useMemo(() => {
    if (hydratedTracks.length === 0) return null;
    return hydratedTracks.find((t) => t.id === currentTrackId) ?? hydratedTracks[0];
  }, [hydratedTracks, currentTrackId]);

  const handleSelectTrack = useCallback((track: Track) => {
    setCurrentTrackId(track.id);
  }, []);

  const handleTrackStarted = useCallback((track: Track) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.key !== track.key);
      return [{ key: track.key, playedAt: Date.now() }, ...filtered].slice(0, 50);
    });
    setPlayCounts((prev) => ({
      ...prev,
      [track.key]: (prev[track.key] || 0) + 1,
    }));
  }, []);

  const playbackTracks = useMemo(() => {
    if (!playbackContext) return hydratedTracks;
    const byKey = new Map(hydratedTracks.map((t) => [t.key, t]));
    if (playbackContext.kind === 'playlist') {
      const pl = playlists.find((p) => p.id === playbackContext.playlistId);
      if (!pl) return hydratedTracks;
      const memberSet = new Set(pl.trackKeys);
      const orderedKeys = [
        ...playbackContext.keys.filter((k) => memberSet.has(k)),
        ...pl.trackKeys.filter((k) => !playbackContext.keys.includes(k)),
      ];
      const resolved = orderedKeys
        .map((k) => byKey.get(k))
        .filter((t): t is Track => Boolean(t));
      return resolved.length > 0 ? resolved : hydratedTracks;
    }
    const resolved = playbackContext.keys
      .map((k) => byKey.get(k))
      .filter((t): t is Track => Boolean(t));
    return resolved.length > 0 ? resolved : hydratedTracks;
  }, [playbackContext, hydratedTracks, playlists]);

  const engine = useAudioEngine({
    tracks: playbackTracks,
    allTracks: hydratedTracks,
    currentTrack,
    onSelectTrack: handleSelectTrack,
    onTrackStarted: handleTrackStarted,
    onAutoRadioPick: (track: Track) =>
      showToast(`Auto-Radio: ${track.title} — ${track.artist}`),
    onPlaybackError: (track: Track) =>
      showToast(`Gagal memutar "${track.title}" — file-nya rusak, coba Sinkronkan ulang`),
    initialVolume: initialPrefs.volume,
    initialEqGains: initialPrefs.eqGains,
    initialEqPreamp: initialPrefs.eqPreamp,
    initialEqEnabled: initialPrefs.eqEnabled,
    initialAudioFx: initialPrefs.audioFx,
  });

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(
        e as unknown as {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
        }
      );
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const playFromList = useCallback(
    (track: Track, list: Track[], playlistId?: string | null) => {
      setPlaybackContext(
        playlistId
          ? { kind: 'playlist', playlistId, keys: list.map((t) => t.key) }
          : { kind: 'list', keys: list.map((t) => t.key) }
      );
      void engine.playTrack(track);
    },
    [engine]
  );

  // remember where the user was so a refresh keeps the song + position, paused
  const engineHydrateRef = useRef({
    setVolume: engine.setVolume,
    setEqEnabled: engine.setEqEnabled,
    setEqPreamp: engine.setEqPreamp,
    setEqGains: engine.setEqGains,
    setAudioFx: engine.setAudioFx,
  });
  engineHydrateRef.current = {
    setVolume: engine.setVolume,
    setEqEnabled: engine.setEqEnabled,
    setEqPreamp: engine.setEqPreamp,
    setEqGains: engine.setEqGains,
    setAudioFx: engine.setAudioFx,
  };

  const applyPreferences = useCallback((prefs: UserPreferences) => {
    setLikedKeys(prefs.likedKeys);
    setHiddenDemoKeys(prefs.hiddenDemoKeys);
    setPlaylists(prefs.playlists);
    playlistsRef.current = prefs.playlists;
    setCustomLyrics(prefs.customLyrics);
    setLyricOffsets(prefs.lyricOffsets ?? {});
    setMetadataOverrides(prefs.metadataOverrides);
    setHistory(prefs.history);
    setPlayCounts(prefs.playCounts || {});
    setVisualizerMode(prefs.visualizerMode);
    setCoverMode(prefs.coverMode);
    asciiTunerRef.current = prefs.asciiTuner;
    engineHydrateRef.current.setVolume(prefs.volume);
    engineHydrateRef.current.setEqEnabled(prefs.eqEnabled);
    engineHydrateRef.current.setEqPreamp(prefs.eqPreamp);
    engineHydrateRef.current.setEqGains(prefs.eqGains);
    engineHydrateRef.current.setAudioFx(prefs.audioFx);
  }, []);

  const loadPausedRef = useRef(engine.loadPaused);
  loadPausedRef.current = engine.loadPaused;
  const playbackRef = useRef<{ key: string; time: number; playlistId?: string }>({
    key: '',
    time: 0,
  });
  playbackRef.current = {
    key: currentTrack?.key || playbackRef.current.key,
    time: engine.currentTime,
    playlistId: playbackContext?.kind === 'playlist' ? playbackContext.playlistId : undefined,
  };

  useEffect(() => {
    const persist = (isUnload: boolean) => {
      if (!diskStateReadyRef.current) return;
      const { key, time, playlistId } = playbackRef.current;
      if (!key) return;
      const sig = `${key}|${Math.floor(time)}|${playlistId ?? ''}`;
      if (sig === lastSavedPlaybackKeyRef.current) return;
      lastSavedPlaybackKeyRef.current = sig;
      const payload = { key, time, playlistId };
      savePlayback(payload);
      if (diskAvailableRef.current) {
        void saveDiskPlayback(payload, { beacon: isUnload });
      }
    };
    const onUnload = () => persist(true);
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    const timer = window.setInterval(() => persist(false), 3000);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const rgb = currentTrack?.accentColor ?? [228, 228, 231];
    document.documentElement.style.setProperty('--accent-rgb', rgb.join(', '));
  }, [currentTrack]);

  useEffect(() => {
    if (!diskStateReady) return;
    const nextPrefs: UserPreferences = {
      likedKeys,
      hiddenDemoKeys,
      playlists,
      customLyrics,
      lyricOffsets,
      metadataOverrides,
      history,
      playCounts,
      eqGains: engine.eqBands.map((b) => b.gain),
      eqPreamp: engine.eqPreamp,
      eqEnabled: engine.eqEnabled,
      audioFx: engine.audioFx,
      visualizerMode,
      coverMode,
      asciiTuner: asciiTunerRef.current,
      volume: engine.volume,
      asciiOverlayEnabled,
    };
    savePreferences(nextPrefs);

    if (!diskAvailableRef.current) return;
    const jsonStr = JSON.stringify(nextPrefs);
    if (jsonStr === lastSavedPrefsJsonRef.current) return;

    pendingDiskPrefsRef.current = nextPrefs;
    if (diskSaveTimerRef.current !== null) {
      window.clearTimeout(diskSaveTimerRef.current);
    }
    diskSaveTimerRef.current = window.setTimeout(() => {
      diskSaveTimerRef.current = null;
      const toSave = pendingDiskPrefsRef.current;
      if (!toSave) return;
      pendingDiskPrefsRef.current = null;
      void saveDiskPreferences(toSave).then((ok) => {
        if (ok) {
          lastSavedPrefsJsonRef.current = jsonStr;
          diskExistedRef.current = true;
        }
      });
    }, 350);
  }, [
    diskStateReady,
    likedKeys,
    hiddenDemoKeys,
    playlists,
    customLyrics,
    lyricOffsets,
    metadataOverrides,
    history,
    playCounts,
    engine.eqBands,
    engine.eqPreamp,
    engine.eqEnabled,
    engine.audioFx,
    engine.volume,
    visualizerMode,
    coverMode,
    asciiOverlayEnabled,
  ]);

  useEffect(() => {
    const flushPendingDiskPrefs = () => {
      if (!diskAvailableRef.current || !pendingDiskPrefsRef.current) return;
      if (diskSaveTimerRef.current !== null) {
        window.clearTimeout(diskSaveTimerRef.current);
        diskSaveTimerRef.current = null;
      }
      const prefs = pendingDiskPrefsRef.current;
      pendingDiskPrefsRef.current = null;
      lastSavedPrefsJsonRef.current = JSON.stringify(prefs);
      diskExistedRef.current = true;
      void saveDiskPreferences(prefs, { keepalive: true });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPendingDiskPrefs();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushPendingDiskPrefs);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushPendingDiskPrefs);
    };
  }, []);

  const buildTrackFromFile = useCallback(
    async (
      file: File,
      key: string,
      addedAt: number,
      lrcMap?: Map<string, LyricLine[]>
    ): Promise<Track> => {
      const fileUrl = URL.createObjectURL(file);
      const [meta, duration] = await Promise.all([
        parseAudioFile(file),
        getAudioDuration(fileUrl),
      ]);
      const accentColor = await extractDominantColor(meta.coverUrl);
      const matchedLrc = lrcMap?.get(stripExtension(file.name)) ?? [];

      return {
        id: `local-${key}`,
        key,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration,
        fileUrl,
        coverUrl: meta.coverUrl,
        accentColor,
        format: meta.format,
        bitrate: meta.bitrate,
        lyrics: matchedLrc.length > 0 ? matchedLrc : meta.embeddedLyrics,
        liked: false,
        addedAt,
        fileName: file.name,
      };
    },
    []
  );

  const handleSynced = useCallback(
    async (playlistId: string, ids: string[]) => {
      const synced = await syncInbox(
        new Set(tracksRef.current.map((t) => t.key)),
        buildTrackFromFile
      );
      if (synced.length > 0) {
        setTracks((prev) => {
          // init may have loaded the same files while this ran; never list twice
          const known = new Set(prev.map((t) => t.key));
          const unique: Track[] = [];
          for (const t of synced) {
            if (known.has(t.key)) {
              revokeTrackUrls(t);
            } else {
              known.add(t.key);
              unique.push(t);
            }
          }
          return unique.length > 0 ? [...unique, ...prev] : prev;
        });
        setCurrentTrackId((prev) => prev ?? synced[0]?.id ?? null);
      }

      // ids come from the run that just finished, so they belong to this playlist
      if (ids.length > 0) {
        const keys = ids.map((id) => `yt::${id}`);
        setPlaylists((prev) =>
          prev.map((pl) =>
            pl.id === playlistId
              ? { ...pl, trackKeys: [...new Set([...pl.trackKeys, ...keys])] }
              : pl
          )
        );
      }

      if (synced.length > 0) {
        showToast(`${synced.length} track baru dari playlist`);
        return;
      }
      showToast(
        ids.length > 0 ? `Playlist siap — ${ids.length} lagu` : 'Playlist selesai, belum ada track baru'
      );
    },
    [buildTrackFromFile, showToast]
  );

  const handleImportModalComplete = useCallback(
    async (
      ids: string[],
      target: {
        type: 'new' | 'existing' | 'inbox';
        name?: string;
        playlistId?: string;
        url: string;
      }
    ) => {
      const synced = await syncInbox(
        new Set(tracksRef.current.map((t) => t.key)),
        buildTrackFromFile
      );
      if (synced.length > 0) {
        setTracks((prev) => {
          const known = new Set(prev.map((t) => t.key));
          const unique: Track[] = [];
          for (const t of synced) {
            if (known.has(t.key)) {
              revokeTrackUrls(t);
            } else {
              known.add(t.key);
              unique.push(t);
            }
          }
          return unique.length > 0 ? [...unique, ...prev] : prev;
        });
        setCurrentTrackId((prev) => prev ?? synced[0]?.id ?? null);
      }

      const keys = ids.map((id) => `yt::${id}`);
      if (target.type === 'new') {
        const createdId = `pl-${Date.now()}`;
        const created: Playlist = {
          id: createdId,
          name: target.name || 'YouTube Import',
          source: target.url,
          trackKeys: Array.from(new Set(keys)),
          createdAt: Date.now(),
        };
        setPlaylists((prev) => [...prev, created]);
        setNavSection('playlist');
        setActivePlaylistId(createdId);
      } else if (target.type === 'existing' && target.playlistId) {
        setPlaylists((prev) =>
          prev.map((pl) =>
            pl.id === target.playlistId
              ? {
                  ...pl,
                  source: pl.source || target.url,
                  trackKeys: Array.from(new Set([...pl.trackKeys, ...keys])),
                }
              : pl
          )
        );
        setNavSection('playlist');
        setActivePlaylistId(target.playlistId);
      }

      showToast(
        synced.length > 0
          ? `Berhasil mengimpor ${synced.length} lagu baru!`
          : `Import selesai — ${ids.length} lagu siap diputar`
      );
    },
    [buildTrackFromFile, showToast]
  );

  const handlePlaylistSource = useCallback((playlistId: string, url: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => (pl.id === playlistId ? { ...pl, source: url } : pl))
    );
  }, []);

  const handleRenamePlaylist = useCallback((playlistId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPlaylists((prev) =>
      prev.map((pl) => (pl.id === playlistId ? { ...pl, name: trimmed } : pl))
    );
  }, []);

  const handlePlaylistCover = useCallback(
    (playlistId: string, file: File) => {
      void (async () => {
        const url = URL.createObjectURL(file);
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = url;
          });
          // square crop down to 700px so the data URL fits in localStorage
          const size = 700;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const side = Math.min(img.width, img.height);
          ctx.drawImage(
            img,
            (img.width - side) / 2,
            (img.height - side) / 2,
            side,
            side,
            0,
            0,
            size,
            size
          );
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setPlaylists((prev) =>
            prev.map((pl) => (pl.id === playlistId ? { ...pl, coverUrl: dataUrl } : pl))
          );
          showToast('Cover playlist diperbarui');
        } catch {
          showToast('Gagal membaca gambar');
        } finally {
          URL.revokeObjectURL(url);
        }
      })();
    },
    [showToast]
  );

  useEffect(() => {
    let cancelled = false;
    setLibraryLoading(true);
    const init = async () => {
      const [diskState, diskPlayback] = await Promise.all([
        loadDiskPreferences(),
        loadDiskPlayback(),
      ]);
      if (cancelled) return;

      diskAvailableRef.current = diskState.available;
      diskExistedRef.current = diskState.exists;

      let activePrefs = initialPrefs;
      if (diskState.available && diskState.exists && diskState.prefs) {
        if (
          !isLocalOriginMigrated() &&
          initialHasLocalPrefs &&
          hasMeaningfulPreferences(initialPrefs)
        ) {
          activePrefs = mergePreferences(diskState.prefs, initialPrefs);
          applyPreferences(activePrefs);
          savePreferences(activePrefs);
          const ok = await saveDiskPreferences(activePrefs);
          if (cancelled) return;
          if (ok) markLocalOriginMigrated();
          showToast('Playlist & preferensi dari port ini digabungkan ke proyek');
        } else {
          activePrefs = diskState.prefs;
          applyPreferences(activePrefs);
          savePreferences(activePrefs);
          markLocalOriginMigrated();
        }
        lastSavedPrefsJsonRef.current = JSON.stringify(activePrefs);
      } else if (diskState.available && !diskState.exists) {
        if (initialHasLocalPrefs && hasMeaningfulPreferences(initialPrefs)) {
          const ok = await saveDiskPreferences(initialPrefs);
          if (cancelled) return;
          if (ok) {
            diskExistedRef.current = true;
            markLocalOriginMigrated();
            showToast('Playlist & preferensi disinkronkan ke proyek lokal');
          }
        }
        lastSavedPrefsJsonRef.current = JSON.stringify(activePrefs);
      }

      setDiskStateReady(true);

      const stored = await loadLocalFilesFromDB();
      if (cancelled) return;

      // pooled restore: 98 sequential mp3 decodes kept the library empty for ~33s
      const restored: (Track | null)[] = new Array(stored.length).fill(null);
      let cursor = 0;
      const restoreWorker = async () => {
        while (!cancelled) {
          const index = cursor++;
          if (index >= stored.length) return;
          const item = stored[index];
          const track = await buildTrackFromFile(item.file, item.key, item.addedAt);
          if (cancelled) {
            revokeTrackUrls(track);
            return;
          }
          // unreadable metadata means a corrupt/partial blob: drop the DB entry
          // so syncInbox re-imports it from the inbox manifest
          if (!Number.isFinite(track.duration) || track.duration <= 0) {
            revokeTrackUrls(track);
            await removeLocalFileFromDB(item.key);
            continue;
          }
          restored[index] = track;
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(6, stored.length) }, () => restoreWorker())
      );
      if (cancelled) {
        for (const t of restored) {
          if (t) revokeTrackUrls(t);
        }
        return;
      }

      const combined = restored.filter((t): t is Track => t !== null);
      const manifest = await fetchInboxManifest();
      if (cancelled) {
        for (const t of combined) revokeTrackUrls(t);
        return;
      }
      const manifestByKey = new Map(
        manifest.map((entry) => [`yt::${entry.id}`, entry])
      );
      const storedSizes = new Map(stored.map((item) => [item.key, item.file.size]));
      const existing = new Set(combined.map((t) => t.key));
      // a cancelled/early import can leave a partial mp3 in IndexedDB; if the
      // stored size no longer matches the inbox, import it again
      for (const [key, entry] of manifestByKey) {
        const want = entry.size;
        if (want && storedSizes.has(key) && storedSizes.get(key) !== want) {
          existing.delete(key);
        }
      }
      const kept: Track[] = [];
      for (const t of combined) {
        if (existing.has(t.key)) kept.push(t);
        else revokeTrackUrls(t);
      }
      const synced = await syncInbox(
        existing,
        buildTrackFromFile,
        () => cancelled
      );
      if (cancelled) {
        for (const t of kept) revokeTrackUrls(t);
        for (const t of synced) revokeTrackUrls(t);
        return;
      }
      // the manifest carries the real titles from YouTube, so they survive a
      // reload even when the id3 tags come back empty
      const all = [...synced, ...kept].map((track) => {
        const entry = manifestByKey.get(track.key);
        if (!entry) return track;
        return {
          ...track,
          title: entry.title || track.title,
          artist: entry.artist || track.artist,
          album: entry.album || track.album,
          duration: entry.duration || track.duration,
          lyrics: entry.lyrics ? parseLrc(entry.lyrics) : track.lyrics,
        };
      });
      setTracks((prev) => {
        if (prev.length === 0) return all;
        const loadedKeys = new Set(all.map((t) => t.key));
        const extra = prev.filter((t) => !loadedKeys.has(t.key));
        return extra.length > 0 ? [...extra, ...all] : all;
      });
      setLibraryLoading(false);
      // membership comes from the inbox itself: a sync that finished while this
      // tab was closed never reached handleSynced, so its playlist would stay
      // empty even though the files are already in the library
      const known = new Set(all.map((t) => t.key));
      const keysByList = new Map<string, string[]>();
      const sourceUrlByList = new Map<string, string>();
      for (const entry of manifest) {
        const listId = listIdOf(entry.source);
        const key = `yt::${entry.id}`;
        if (!listId || !known.has(key)) continue;
        if (entry.source && !sourceUrlByList.has(listId)) {
          sourceUrlByList.set(listId, entry.source);
        }
        const keys = keysByList.get(listId) ?? [];
        keys.push(key);
        keysByList.set(listId, keys);
      }
      if (keysByList.size > 0) {
        const shouldRecoverFromManifest =
          hasOnlyDefaultPlaylists(playlistsRef.current) ||
          (!diskExistedRef.current &&
            !playlistsRef.current.some((pl) => Boolean(listIdOf(pl.source))));
        if (shouldRecoverFromManifest) {
          const baseTs = Date.now();
          const entries = Array.from(keysByList.entries());
          const recovered: Playlist[] = entries.map(([listId, keys], idx) => ({
            id: `pl-yt-${listId}`,
            name:
              entries.length === 1
                ? 'YouTube Playlist'
                : `YouTube Playlist ${idx + 1}`,
            source: sourceUrlByList.get(listId),
            trackKeys: Array.from(new Set(keys)),
            createdAt: baseTs + idx,
          }));
          if (!diskExistedRef.current) {
            const nextSnapshot = [
              ...playlistsRef.current.filter((p) => !isUntouchedDefaultPlaylist(p)),
              ...recovered,
            ];
            lastSavedPrefsJsonRef.current = JSON.stringify({
              ...activePrefs,
              playlists: nextSnapshot,
            });
          }
          setPlaylists((prev) => {
            if (!hasOnlyDefaultPlaylists(prev) && prev.some((pl) => Boolean(listIdOf(pl.source)))) {
              return prev;
            }
            return [
              ...prev.filter((p) => !isUntouchedDefaultPlaylist(p)),
              ...recovered,
            ];
          });
        } else {
          setPlaylists((prev) => {
            let changed = false;
            const next = prev.map((pl) => {
              const extra = keysByList.get(listIdOf(pl.source) ?? '');
              if (!extra) return pl;
              const merged = new Set([...pl.trackKeys, ...extra]);
              if (merged.size === pl.trackKeys.length) return pl;
              changed = true;
              return { ...pl, trackKeys: [...merged] };
            });
            return changed ? next : prev;
          });
        }
      }
      const saved = diskPlayback.playback ?? loadPlayback();
      if (saved) {
        lastSavedPlaybackKeyRef.current = `${saved.key}|${Math.floor(saved.time)}|${saved.playlistId ?? ''}`;
      }
      const resume = saved ? all.find((t) => t.key === saved.key) : undefined;
      setCurrentTrackId((prev) => prev ?? resume?.id ?? all[0]?.id ?? null);
      if (saved && resume) {
        loadPausedRef.current(resume, saved.time);
        const targetPlaylistId =
          saved.playlistId ??
          (() => {
            const owners = playlistsRef.current.filter((p) => p.trackKeys.includes(resume.key));
            return owners.length === 1 ? owners[0].id : undefined;
          })();
        if (targetPlaylistId) {
          setPlaybackContext((prev) =>
            prev ?? { kind: 'playlist', playlistId: targetPlaylistId, keys: [] }
          );
        }
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [
    applyPreferences,
    buildTrackFromFile,
    initialHasLocalPrefs,
    initialPrefs,
    showToast,
  ]);

  const ingestImportedItems = useCallback(
    async (items: ImportedFileItem[]) => {
      if (items.length === 0) return;

      const audioItems = items.filter((item) => AUDIO_EXTENSIONS.test(item.file.name));
      const lrcItems = items.filter((item) => /\.lrc$/i.test(item.file.name));

      const lrcMap = new Map<string, LyricLine[]>();
      const newCustomLyrics: Record<string, LyricLine[]> = {};

      for (const lrcItem of lrcItems) {
        const text = await lrcItem.file.text();
        const parsed = parseLrc(text);
        if (parsed.length > 0) {
          lrcMap.set(stripExtension(lrcItem.file.name), parsed);
        }
      }

      if (audioItems.length === 0 && lrcItems.length > 0) {
        let matchedCount = 0;
        for (const [baseName, lines] of lrcMap.entries()) {
          const match = tracksRef.current.find(
            (t) => t.fileName && stripExtension(t.fileName) === baseName
          );
          if (match) {
            newCustomLyrics[match.key] = lines;
            matchedCount++;
          } else if (currentTrack && lrcMap.size === 1) {
            newCustomLyrics[currentTrack.key] = lines;
            matchedCount++;
          }
        }
        if (matchedCount > 0) {
          setCustomLyrics((prev) => ({ ...prev, ...newCustomLyrics }));
          showToast(`Synced ${matchedCount} lyric file(s)`);
        } else {
          showToast('No matching track found for .lrc file');
        }
        return;
      }

      if (audioItems.length === 0) {
        showToast('No supported audio files found');
        return;
      }

      setImportingCount(audioItems.length);
      const existingKeys = new Set(tracksRef.current.map((t) => t.key));
      const addedTracks: Track[] = [];
      const toStore: StoredLocalFile[] = [];
      const folderGroups = new Map<string, string[]>();

      for (const item of audioItems) {
        const { file, folderName } = item;
        const key = `${file.name}::${file.size}`;

        if (folderName) {
          const group = folderGroups.get(folderName) ?? [];
          if (!group.includes(key)) group.push(key);
          folderGroups.set(folderName, group);
        }

        if (existingKeys.has(key)) {
          const paired = lrcMap.get(stripExtension(file.name));
          if (paired && paired.length > 0) {
            newCustomLyrics[key] = paired;
          }
          continue;
        }
        existingKeys.add(key);
        const now = Date.now();
        const track = await buildTrackFromFile(file, key, now, lrcMap);
        addedTracks.push(track);
        toStore.push({ key, file, addedAt: now });

        if (track.lyrics.length > 0 && lrcMap.has(stripExtension(file.name))) {
          newCustomLyrics[key] = track.lyrics;
        }
      }

      if (Object.keys(newCustomLyrics).length > 0) {
        setCustomLyrics((prev) => ({ ...prev, ...newCustomLyrics }));
      }
      if (toStore.length > 0) {
        await saveLocalFilesToDB(toStore);
      }

      if (addedTracks.length > 0) {
        setTracks((prev) => {
          const known = new Set(prev.map((t) => t.key));
          const unique: Track[] = [];
          for (const t of addedTracks) {
            if (known.has(t.key)) {
              revokeTrackUrls(t);
            } else {
              known.add(t.key);
              unique.push(t);
            }
          }
          return unique.length > 0 ? [...unique, ...prev] : prev;
        });
        setCurrentTrackId(addedTracks[0].id);
      }

      if (folderGroups.size > 0) {
        const nowTs = Date.now();
        let idxCounter = 0;
        const plannedIds = new Map<string, string>();
        let firstPlaylistId: string | null = null;
        let firstFolderName = '';

        for (const [folderName] of folderGroups.entries()) {
          const existing = playlistsRef.current.find(
            (p) => p.name.toLowerCase() === folderName.toLowerCase()
          );
          const id = existing ? existing.id : `pl-dir-${nowTs}-${idxCounter++}`;
          plannedIds.set(folderName, id);
          if (!firstPlaylistId) {
            firstPlaylistId = id;
            firstFolderName = existing ? existing.name : folderName;
          }
        }

        setPlaylists((prev) => {
          const updated = [...prev];
          for (const [folderName, keys] of folderGroups.entries()) {
            const existingIdx = updated.findIndex(
              (p) => p.name.toLowerCase() === folderName.toLowerCase()
            );

            if (existingIdx !== -1) {
              const existing = updated[existingIdx];
              const merged = Array.from(new Set([...existing.trackKeys, ...keys]));
              updated[existingIdx] = { ...existing, trackKeys: merged };
            } else {
              updated.push({
                id: plannedIds.get(folderName) ?? `pl-dir-${nowTs}-${idxCounter++}`,
                name: folderName,
                trackKeys: keys,
                createdAt: nowTs,
              });
            }
          }
          return updated;
        });

        window.setTimeout(() => {
          if (firstPlaylistId) {
            setNavSection('playlist');
            setActivePlaylistId(firstPlaylistId);
            setAlbumFilter(null);
          }
        }, 0);

        const folderCount = folderGroups.size;
        showToast(
          folderCount === 1
            ? `Playlist "${firstFolderName}" ready (${folderGroups.get(firstFolderName)?.length ?? 0} tracks)`
            : `Created ${folderCount} folder playlists`
        );
      } else if (addedTracks.length > 0) {
        showToast(`Added ${addedTracks.length} local track(s)`);
      } else {
        showToast('Tracks already in library');
      }

      setImportingCount(0);
    },
    [currentTrack, buildTrackFromFile, showToast]
  );

  const handleToggleLike = useCallback((trackKey: string) => {
    setLikedKeys((prev) =>
      prev.includes(trackKey)
        ? prev.filter((k) => k !== trackKey)
        : [...prev, trackKey]
    );
  }, []);

  const handleSaveCustomLyrics = useCallback(
    (trackKey: string, lyrics: LyricLine[]) => {
      setCustomLyrics((prev) => ({ ...prev, [trackKey]: lyrics }));
      showToast('Lyrics saved locally');
    },
    [showToast]
  );

  const adjustLyricOffset = useCallback((trackKey: string, delta: number) => {
    setLyricOffsets((prev) => {
      const next = Math.round(((prev[trackKey] ?? 0) + delta) * 100) / 100;
      const out = { ...prev };
      if (Math.abs(next) < 0.001) delete out[trackKey];
      else out[trackKey] = next;
      return out;
    });
  }, []);

  const handleSaveMetadata = useCallback(
    (trackKey: string, override: TrackMetadataOverride) => {
      setMetadataOverrides((prev) => ({ ...prev, [trackKey]: override }));
      showToast('Track info updated');
    },
    [showToast]
  );

  const deleteTracksFromLibrary = useCallback(
    async (targetTracks: Track[]) => {
      if (targetTracks.length === 0) return;
      const targetIds = new Set(targetTracks.map((t) => t.id));
      const targetKeys = new Set(targetTracks.map((t) => t.key));
      const demoKeysToHide: string[] = [];

      for (const track of targetTracks) {
        if (track.isDemo) {
          demoKeysToHide.push(track.key);
        } else {
          await removeLocalFileFromDB(track.key);
        }
        URL.revokeObjectURL(track.fileUrl);
        if (track.coverUrl) URL.revokeObjectURL(track.coverUrl);
      }

      if (demoKeysToHide.length > 0) {
        setHiddenDemoKeys((prev) => Array.from(new Set([...prev, ...demoKeysToHide])));
      }

      setTracks((prev) => prev.filter((t) => !targetIds.has(t.id)));
      setLikedKeys((prev) => prev.filter((k) => !targetKeys.has(k)));
      setHistory((prev) => prev.filter((h) => !targetKeys.has(h.key)));
      setPlayCounts((prev) => {
        const next = { ...prev };
        targetKeys.forEach((k) => {
          delete next[k];
        });
        return next;
      });
      setPlaylists((prev) =>
        prev.map((pl) => ({
          ...pl,
          trackKeys: pl.trackKeys.filter((k) => !targetKeys.has(k)),
        }))
      );
      setSelectedTrackIds((prev) => prev.filter((id) => !targetIds.has(id)));
      setSelectMode(false);
      showToast(
        targetTracks.length === 1
          ? `Deleted "${targetTracks[0].title}"`
          : `Deleted ${targetTracks.length} tracks`
      );
    },
    [showToast]
  );

  const removeTracksFromPlaylist = useCallback(
    (playlistId: string, targetTracks: Track[]) => {
      const keySet = new Set(targetTracks.map((t) => t.key));
      const idSet = new Set(targetTracks.map((t) => t.id));
      setPlaylists((prev) =>
        prev.map((pl) =>
          pl.id === playlistId
            ? { ...pl, trackKeys: pl.trackKeys.filter((k) => !keySet.has(k)) }
            : pl
        )
      );
      setSelectedTrackIds((prev) => prev.filter((id) => !idSet.has(id)));
      setSelectMode(false);
      showToast(
        targetTracks.length === 1
          ? `Removed "${targetTracks[0].title}" from playlist`
          : `Removed ${targetTracks.length} tracks from playlist`
      );
    },
    [showToast]
  );

  const requestDeleteTracks = useCallback(
    (targetTracks: Track[]) => {
      if (targetTracks.length === 0) return;
      const inPlaylist = navSection === 'playlist' && activePlaylistId;
      const playlistName =
        playlists.find((p) => p.id === activePlaylistId)?.name ?? 'playlist';
      const count = targetTracks.length;
      const singleTitle = count === 1 ? `"${targetTracks[0].title}"` : `${count} selected tracks`;

      if (inPlaylist && activePlaylistId) {
        const plId = activePlaylistId;
        setConfirmDialog({
          title: `Remove ${singleTitle}?`,
          message: `Remove ${singleTitle} from "${playlistName}" only, or delete permanently from your local library?`,
          secondaryLabel: 'Remove from Playlist',
          confirmLabel: 'Delete Permanently',
          onSecondaryConfirm: () => {
            removeTracksFromPlaylist(plId, targetTracks);
            setConfirmDialog(null);
          },
          onConfirm: () => {
            void deleteTracksFromLibrary(targetTracks);
            setConfirmDialog(null);
          },
        });
        return;
      }

      setConfirmDialog({
        title: `Delete ${singleTitle}?`,
        message: `Are you sure you want to delete ${singleTitle} from your local library? This also removes them from liked songs and playlists.`,
        confirmLabel: count === 1 ? 'Delete Track' : `Delete ${count} Tracks`,
        onConfirm: () => {
          void deleteTracksFromLibrary(targetTracks);
          setConfirmDialog(null);
        },
      });
    },
    [navSection, activePlaylistId, playlists, removeTracksFromPlaylist, deleteTracksFromLibrary]
  );

  const requestDeletePlaylist = useCallback(
    (pl: Playlist) => {
      setConfirmDialog({
        title: `Delete playlist "${pl.name}"?`,
        message: `This removes "${pl.name}" (${pl.trackKeys.length} tracks). Your songs remain safe in Library.`,
        confirmLabel: 'Delete Playlist',
        onConfirm: () => {
          setPlaylists((prev) => prev.filter((p) => p.id !== pl.id));
          if (activePlaylistId === pl.id) {
            setNavSection('library');
            setActivePlaylistId(null);
          }
          setConfirmDialog(null);
          showToast(`Deleted playlist "${pl.name}"`);
        },
      });
    },
    [activePlaylistId, showToast]
  );

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;
    const pl: Playlist = {
      id: `pl-${Date.now()}`,
      name: trimmed,
      trackKeys: [],
      createdAt: Date.now(),
    };
    setPlaylists((prev) => [...prev, pl]);
    setNewPlaylistName('');
    setCreatingPlaylist(false);
    setNavSection('playlist');
    setActivePlaylistId(pl.id);
    setAlbumFilter(null);
    setArtistFilter(null);
    showToast(`Created "${pl.name}"`);
  };

  const handleToggleTrackInPlaylist = (playlistId: string, trackKey: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const exists = pl.trackKeys.includes(trackKey);
        return {
          ...pl,
          trackKeys: exists
            ? pl.trackKeys.filter((k) => k !== trackKey)
            : [...pl.trackKeys, trackKey],
        };
      })
    );
  };

  const cycleCoverMode = useCallback(() => {
    setCoverMode((prev) => {
      const idx = COVER_MODES.findIndex((m) => m.id === prev);
      const next = COVER_MODES[(idx + 1) % COVER_MODES.length];
      showToast(`Artwork mode: ${next.label}`);
      return next.id;
    });
  }, [showToast]);

  const cycleVisualizerMode = useCallback(() => {
    setVisualizerMode((prev) => {
      const next = VIS_MODES[(VIS_MODES.indexOf(prev) + 1) % VIS_MODES.length];
      showToast(
        `Visualizer: ${
          next === 'ascii-bars'
            ? 'ASCII Bars'
            : next === 'dot-matrix'
            ? 'Dot Matrix'
            : 'Oscilloscope'
        }`
      );
      return next;
    });
  }, [showToast]);

  const toggleSlowedReverb = useCallback(() => {
    const active = engine.audioFx.speed < 0.95 && engine.audioFx.reverbMix >= 0.2;
    if (active) {
      engine.setAudioFx(DEFAULT_AUDIO_FX);
      showToast('Slowed + Reverb: Off');
    } else {
      engine.setAudioFx({
        ...engine.audioFx,
        speed: 0.85,
        preservesPitch: false,
        reverbMix: 0.35,
      });
      showToast('Slowed + Reverb: On');
    }
  }, [engine, showToast]);

  const slowedActive = engine.audioFx.speed < 0.95 && engine.audioFx.reverbMix >= 0.2;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (e.key === 'Escape') {
        if (confirmDialog) setConfirmDialog(null);
        else if (paletteOpen) setPaletteOpen(false);
        else if (editingTrack) setEditingTrack(null);
        else if (zenOpen) setZenOpen(false);
        return;
      }
      if (isTyping) return;

      if (e.code === 'Space') {
        e.preventDefault();
        void engine.togglePlay();
      } else if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key.toLowerCase() === 'm') {
        engine.toggleMute();
      } else if (e.key.toLowerCase() === 'z') {
        setZenOpen((z) => !z);
      } else if (e.key.toLowerCase() === 'd') {
        cycleCoverMode();
      } else if (e.key.toLowerCase() === 'v') {
        cycleVisualizerMode();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zenOpen, paletteOpen, editingTrack, confirmDialog, engine, cycleCoverMode, cycleVisualizerMode]);

  const displayedTracks = useMemo(() => {
    let list =
      navSection === 'playlist' || navSection === 'library' || navSection === 'liked'
        ? hydratedTracks
        : libraryTracks;
    // Home and Liked Songs span both local files and synced playlists;
    // Albums and Artists stay curated to user-added local files
    if (navSection === 'liked') {
      list = list.filter((t) => t.liked);
    } else if (navSection === 'history') {
      // synced YouTube tracks are playable too, so resolve history against all tracks
      const map = new Map(hydratedTracks.map((t) => [t.key, t]));
      list = history
        .map((h) => map.get(h.key))
        .filter((t): t is Track => Boolean(t));
    } else if (navSection === 'playlist' && activePlaylistId) {
      const pl = playlists.find((p) => p.id === activePlaylistId);
      const set = new Set(pl?.trackKeys ?? []);
      list = list.filter((t) => set.has(t.key));
    }

    if (albumFilter) {
      list = list.filter((t) => t.album === albumFilter);
    }

    if (artistFilter) {
      list = list.filter((t) => t.artist === artistFilter);
    }

    if (formatFilter) {
      list = list.filter((t) => t.format.toUpperCase() === formatFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
      );
    }

    if (sortMode !== 'recent') {
      const sorted = [...list];
      if (sortMode === 'title') {
        sorted.sort((a, b) => a.title.localeCompare(b.title));
      } else if (sortMode === 'artist') {
        sorted.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
      } else if (sortMode === 'duration') {
        sorted.sort((a, b) => b.duration - a.duration);
      } else if (sortMode === 'plays') {
        sorted.sort((a, b) => (playCounts[b.key] || 0) - (playCounts[a.key] || 0));
      }
      return sorted;
    }

    return list;
  }, [
    hydratedTracks,
    libraryTracks,
    navSection,
    history,
    activePlaylistId,
    playlists,
    albumFilter,
    artistFilter,
    formatFilter,
    searchQuery,
    sortMode,
    playCounts,
  ]);

  const artists = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        coverUrl: string | null;
        accentColor: [number, number, number];
        count: number;
        totalDuration: number;
      }
    >();
    for (const t of libraryTracks) {
      const name = t.artist || 'Unknown Artist';
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
        existing.totalDuration += t.duration;
        if (!existing.coverUrl && t.coverUrl) existing.coverUrl = t.coverUrl;
      } else {
        map.set(name, {
          name,
          coverUrl: t.coverUrl,
          accentColor: t.accentColor,
          count: 1,
          totalDuration: t.duration,
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  }, [libraryTracks]);

  const topPlayedTracks = useMemo(() => {
    return [...libraryTracks]
      .sort(
        (a, b) =>
          (playCounts[b.key] || 0) - (playCounts[a.key] || 0) ||
          b.addedAt - a.addedAt
      )
      .slice(0, 5);
  }, [libraryTracks, playCounts]);

  const availableFormats = useMemo(() => {
    const set = new Set<string>();
    for (const t of libraryTracks) {
      if (t.format) set.add(t.format.toUpperCase());
    }
    return Array.from(set).sort();
  }, [libraryTracks]);

  const totalDurationSec = useMemo(
    () => hydratedTracks.reduce((acc, t) => acc + (Number.isFinite(t.duration) ? t.duration : 0), 0),
    [hydratedTracks]
  );

  // Unique Albums for bottom "Albums" strip (matching screenshot's "New Album" row)
  const albums = useMemo(() => {
    const map = new Map<
      string,
      { name: string; artist: string; coverUrl: string | null; accentColor: [number, number, number]; count: number; firstTrack: Track }
    >();
    for (const t of libraryTracks) {
      const existing = map.get(t.album);
      if (existing) {
        existing.count += 1;
        if (!existing.coverUrl && t.coverUrl) existing.coverUrl = t.coverUrl;
      } else {
        map.set(t.album, {
          name: t.album,
          artist: t.artist,
          coverUrl: t.coverUrl,
          accentColor: t.accentColor,
          count: 1,
          firstTrack: t,
        });
      }
    }
    return Array.from(map.values());
  }, [libraryTracks]);

  useEffect(() => {
    setSelectedTrackIds([]);
    setSelectMode(false);
    setBulkPlaylistMenuOpen(false);
  }, [navSection, activePlaylistId, albumFilter, artistFilter, formatFilter]);

  const selectedTrackSet = useMemo(() => new Set(selectedTrackIds), [selectedTrackIds]);
  const selectedDisplayedTracks = useMemo(
    () => displayedTracks.filter((t) => selectedTrackSet.has(t.id)),
    [displayedTracks, selectedTrackSet]
  );
  const allDisplayedSelected =
    displayedTracks.length > 0 &&
    displayedTracks.every((t) => selectedTrackSet.has(t.id));
  const someDisplayedSelected =
    selectedDisplayedTracks.length > 0 && !allDisplayedSelected;

  const toggleSelectTrack = useCallback((trackId: string) => {
    setSelectedTrackIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]
    );
  }, []);

  const toggleSelectAllDisplayed = useCallback(() => {
    const displayedIds = displayedTracks.map((t) => t.id);
    if (allDisplayedSelected) {
      const set = new Set(displayedIds);
      setSelectedTrackIds((prev) => prev.filter((id) => !set.has(id)));
    } else {
      setSelectedTrackIds((prev) => Array.from(new Set([...prev, ...displayedIds])));
      setSelectMode(true);
    }
  }, [displayedTracks, allDisplayedSelected]);

  const handleBulkAddToPlaylist = useCallback(
    (playlistId: string) => {
      const keys = selectedDisplayedTracks.map((t) => t.key);
      if (keys.length === 0) return;
      setPlaylists((prev) =>
        prev.map((pl) =>
          pl.id === playlistId
            ? { ...pl, trackKeys: Array.from(new Set([...pl.trackKeys, ...keys])) }
            : pl
        )
      );
      setBulkPlaylistMenuOpen(false);
      showToast(`Added ${keys.length} track(s) to playlist`);
    },
    [selectedDisplayedTracks, showToast]
  );

  const queueTracks = useMemo(() => {
    const map = new Map(hydratedTracks.map((t) => [t.id, t]));
    return engine.queueIds
      .map((id) => map.get(id))
      .filter((t): t is Track => Boolean(t));
  }, [engine.queueIds, hydratedTracks]);

  const upNextAutoTracks = useMemo(() => {
    if (!currentTrack) return playbackTracks;
    const idx = playbackTracks.findIndex((t) => t.id === currentTrack.id);
    if (idx === -1) return playbackTracks;
    return [...playbackTracks.slice(idx + 1), ...playbackTracks.slice(0, idx)];
  }, [playbackTracks, currentTrack]);

  const activePlaylist = useMemo(
    () => playlists.find((p) => p.id === activePlaylistId) ?? null,
    [playlists, activePlaylistId]
  );

  const isHomeOverview = navSection === 'library' && !albumFilter && !artistFilter;

  const collectionMeta = useMemo<{
    kind: CollectionKind;
    title: string;
    subtitle: string;
  }>(() => {
    if (artistFilter) {
      return {
        kind: 'artist',
        title: artistFilter,
        subtitle: 'Artist discography & all matching local tracks',
      };
    }
    if (albumFilter) {
      return {
        kind: 'album',
        title: albumFilter,
        subtitle: `${displayedTracks[0]?.artist ?? 'Local Release'} · Album release tracklist`,
      };
    }
    if (navSection === 'liked') {
      return {
        kind: 'liked',
        title: 'Liked Songs',
        subtitle: 'Favorites curated across your offline music vault',
      };
    }
    if (navSection === 'history') {
      return {
        kind: 'history',
        title: 'Recently Played',
        subtitle: 'Chronological session playback log & replay counters',
      };
    }
    return {
      kind: 'playlist',
      title: activePlaylist?.name ?? 'Playlist',
      subtitle: 'Custom local playlist · Folder & curated tracks',
    };
  }, [artistFilter, albumFilter, navSection, activePlaylist, displayedTracks]);

  const accent = currentTrack?.accentColor ?? [228, 228, 231];
  const progressPct =
    engine.duration > 0
      ? Math.min(100, (engine.currentTime / engine.duration) * 100)
      : 0;

  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-[#0a0a0d] text-zinc-100 flex flex-col select-none"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepthRef.current++;
        setIsDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragging(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);
        const items = await collectDroppedItems(e.dataTransfer);
        if (items.length > 0) {
          void ingestImportedItems(items);
        }
      }}
    >
      {/* Calm Monochrome Sculptural Glass Backdrop — stays mounted across Zen transitions */}
      <KawarpBackdrop
        coverUrl={currentTrack?.coverUrl ?? null}
        accentColor={accent}
        isPlaying={engine.isPlaying}
        asciiOverlayEnabled={asciiOverlayEnabled}
        getFrequencyData={engine.getFrequencyData}
      />

      {/* Hidden File Pickers */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            void ingestImportedItems(normalizeInputFiles(e.target.files));
          }
          e.target.value = '';
        }}
      />
      <input
        ref={filesInputRef}
        type="file"
        multiple
        accept="audio/*,.lrc,.mp3,.flac,.wav,.ogg,.m4a,.aac,.opus"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            void ingestImportedItems(normalizeInputFiles(e.target.files));
          }
          e.target.value = '';
        }}
      />

      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-24 right-6 z-50 px-4 py-2 rounded-full smoked-glass-elevated font-mono text-[11px] text-white"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag & Drop Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <div className="smoked-glass-elevated rounded-3xl border-dashed border-2 border-white/30 max-w-md w-full p-12 text-center space-y-2">
              <p className="font-mono text-sm tracking-widest uppercase text-white">
                [ Drop Local Audio Folder or .LRC ]
              </p>
              <p className="text-xs text-zinc-400">
                Folders automatically turn into Playlists · MP3 · FLAC · WAV · LRC
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Unified Smoked-Glass Shell */}
      <div
        className={`relative z-10 w-full h-full glass-window overflow-hidden flex flex-col transition-[transform,border-radius] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          zenOpen
            ? 'scale-[0.985] rounded-2xl pointer-events-none'
            : 'scale-100'
        }`}
      >
        {/* Upper App Shell (Left Sidebar + Main View) */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Frosted Sidebar */}
          <aside className="hidden md:flex w-[244px] shrink-0 glass-sidebar flex-col justify-between p-4 min-h-0">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Brand */}
              <div className="flex items-center justify-between pb-5 px-2 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-950 font-mono text-sm font-bold"
                    style={{ backgroundColor: `rgb(${accent.join(',')})` }}
                  >
                    ⣿
                  </div>
                  <span className="text-base font-bold tracking-tight text-white">
                    monolith
                  </span>
                </div>
                <span className="font-mono text-[11px] text-zinc-500">LOCAL</span>
              </div>

              {/* MENU Section */}
              <p className="px-2 pb-2 font-mono text-[11px] tracking-[0.16em] uppercase text-zinc-500 shrink-0">
                MENU
              </p>
              <div className="space-y-0.5 shrink-0">
                {[
                  { id: 'library' as const, label: 'Home', icon: House, count: hydratedTracks.length },
                  { id: 'albums' as const, label: 'Albums', icon: Disc, count: albums.length },
                  { id: 'artists' as const, label: 'Artists', icon: User, count: artists.length },
                  { id: 'liked' as const, label: 'Liked Songs', icon: Heart, count: hydratedTracks.filter((t) => t.liked).length },
                  { id: 'history' as const, label: 'Recent', icon: ClockCounterClockwise, count: history.length },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = navSection === item.id && !albumFilter && !artistFilter;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setNavSection(item.id);
                        setActivePlaylistId(null);
                        setAlbumFilter(null);
                        setArtistFilter(null);
                      }}
                      className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        active
                          ? 'text-white bg-white/[0.06]'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }`}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                          style={{ backgroundColor: `rgb(${accent.join(',')})` }}
                        />
                      )}
                      <span className="flex items-center gap-2.5">
                        <Icon size={18} weight={active ? 'fill' : 'regular'} />
                        {item.label}
                      </span>
                      {typeof item.count === 'number' && (
                        <span className="font-mono text-[11px] text-zinc-500">
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* PLAYLIST + Section */}
              <div className="pt-5 pb-2 px-2 flex items-center justify-between shrink-0">
                <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-zinc-500">
                  PLAYLIST
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setImportModalOpen(true)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 hover:text-red-300 font-mono text-[10px] transition"
                    title="Import Song / Playlist from YouTube"
                  >
                    <YoutubeLogo size={12} weight="fill" />
                    <span>Import</span>
                  </button>
                  <button
                    onClick={() => setCreatingPlaylist((c) => !c)}
                    className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
                    title="New Playlist"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {creatingPlaylist && (
                <form onSubmit={handleCreatePlaylist} className="px-1 pb-2 flex gap-1.5 shrink-0">
                  <input
                    autoFocus
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Playlist name"
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-black/45 border border-white/15 text-xs text-white focus:outline-none focus:border-white/30"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-semibold"
                  >
                    +
                  </button>
                </form>
              )}

              <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
                {playlists.map((pl) => {
                  const active = navSection === 'playlist' && activePlaylistId === pl.id;
                  const ownsCurrent = currentTrack ? pl.trackKeys.includes(currentTrack.key) : false;
                  return (
                    <div
                      key={pl.id}
                      onClick={() => {
                        setNavSection('playlist');
                        setActivePlaylistId(pl.id);
                        setAlbumFilter(null);
                        setArtistFilter(null);
                      }}
                      className={`relative group flex items-center justify-between px-3 py-2 rounded-xl text-[13px] cursor-pointer transition ${
                        active
                          ? 'bg-white/[0.07] text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }`}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                          style={{ backgroundColor: `rgb(${accent.join(',')})` }}
                        />
                      )}
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-3.5 shrink-0 flex items-center justify-center"
                          title={ownsCurrent ? 'Sedang diputar dari playlist ini' : undefined}
                        >
                          {ownsCurrent && (
                            <Equalizer
                              size={12}
                              weight={engine.isPlaying ? 'bold' : 'regular'}
                              className={engine.isPlaying ? 'animate-pulse' : 'text-zinc-500'}
                              style={
                                engine.isPlaying
                                  ? { color: `rgb(${accent.join(',')})` }
                                  : undefined
                              }
                              role="img"
                              aria-label="Sedang diputar dari playlist ini"
                            />
                          )}
                        </span>
                        <span className="truncate">{pl.name}</span>
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDeletePlaylist(pl);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition"
                          title="Delete playlist"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Sidebar Volume + Command Palette */}
            <div className="pt-3 border-t border-white/[0.07] space-y-3 shrink-0">
              <div className="flex items-center gap-2 px-1">
                <button
                  onClick={engine.toggleMute}
                  className="text-zinc-400 hover:text-white transition"
                  title="Mute [M]"
                >
                  {engine.muted || engine.volume === 0 ? (
                    <SpeakerSlash size={15} />
                  ) : (
                    <SpeakerHigh size={15} />
                  )}
                </button>
                <div className="relative flex-1 flex items-center">
                  <div className="w-full h-1 rounded-full bg-white/20 overflow-hidden pointer-events-none">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(engine.muted ? 0 : engine.volume) * 100}%`,
                        backgroundColor: `rgb(${accent.join(',')})`,
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={engine.muted ? 0 : engine.volume}
                    onChange={(e) => engine.setVolume(parseFloat(e.target.value))}
                    aria-label="Volume"
                    className="absolute inset-0 w-full clean-range h-4 opacity-90"
                  />
                </div>
              </div>

              <div className="rounded-xl glass-inner-card p-2.5 space-y-1.5 shrink-0">
                <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  <span>Local Vault</span>
                  <span className="text-zinc-300">{hydratedTracks.length} tracks</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-0.5 text-center">
                  <div className="rounded-lg bg-black/25 px-1.5 py-1 border border-white/[0.05]">
                    <p className="font-mono text-[11px] font-semibold text-white tabular-nums">
                      {albums.length}
                    </p>
                    <p className="font-mono text-[9px] text-zinc-500 uppercase">Albums</p>
                  </div>
                  <div className="rounded-lg bg-black/25 px-1.5 py-1 border border-white/[0.05]">
                    <p className="font-mono text-[11px] font-semibold text-white tabular-nums">
                      {artists.length}
                    </p>
                    <p className="font-mono text-[9px] text-zinc-500 uppercase">Artists</p>
                  </div>
                  <div className="rounded-lg bg-black/25 px-1.5 py-1 border border-white/[0.05]">
                    <p className="font-mono text-[11px] font-semibold text-white tabular-nums">
                      {formatDuration(totalDurationSec)}
                    </p>
                    <p className="font-mono text-[9px] text-zinc-500 uppercase">Time</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Main Area (Top Nav Bar + Content Grid) */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Top Header inside Window */}
            <header className="h-[3.75rem] px-5 flex items-center justify-between gap-3 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  onClick={() => {
                    setNavSection('library');
                    setActivePlaylistId(null);
                    setAlbumFilter(null);
                    setArtistFilter(null);
                    setFormatFilter(null);
                  }}
                  className={`text-sm font-medium transition ${
                    navSection === 'library' && !albumFilter && !artistFilter
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Library
                </button>
                <button
                  onClick={() => setNavSection('fx')}
                  className={`hidden sm:inline text-sm font-medium transition ${
                    navSection === 'fx'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Equalizer
                </button>

                {/* Sleek Search Bar */}
                <div className="relative flex-1 sm:w-44 lg:w-48">
                  <MagnifyingGlass
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                  />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (
                        navSection === 'fx' ||
                        navSection === 'albums' ||
                        navSection === 'artists'
                      ) {
                        setNavSection('library');
                      }
                    }}
                    placeholder="Search... [/]"
                    className="w-full pl-9 pr-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.09] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/25 transition"
                  />
                </div>
              </div>

              {(importingCount > 0 ||
                installPrompt !== null ||
                engine.sleepRemainingSec !== null ||
                engine.sleepAfterTrack) && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {installPrompt && (
                    <button
                      onClick={async () => {
                        try {
                          await installPrompt.prompt();
                          const choice = await installPrompt.userChoice;
                          if (choice.outcome === 'accepted') {
                            setInstallPrompt(null);
                            showToast('Monolith Audio berhasil diinstal ke Desktop!');
                          }
                        } catch {
                          setInstallPrompt(null);
                        }
                      }}
                      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 font-mono text-[11px] text-white transition"
                      title="Install Monolith Audio as a Standalone Desktop App"
                    >
                      <DownloadSimple size={13} weight="bold" />
                      <span>Install App</span>
                    </button>
                  )}
                  {importingCount > 0 && (
                    <span className="font-mono text-xs text-zinc-300 animate-pulse mr-1">
                      +{importingCount}...
                    </span>
                  )}
                  {(engine.sleepRemainingSec !== null || engine.sleepAfterTrack) && (
                    <button
                      onClick={() => setNavSection('fx')}
                      className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/12 border border-white/15 font-mono text-[11px] text-white"
                      title="Sleep Timer Active"
                    >
                      <Moon size={13} weight="fill" />
                      <span>
                        {engine.sleepAfterTrack
                          ? 'END'
                          : formatTime(engine.sleepRemainingSec ?? 0)}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </header>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {navSection === 'fx' ? (
                <AudioFxPanel
                  enabled={engine.eqEnabled}
                  preamp={engine.eqPreamp}
                  bands={engine.eqBands}
                  audioFx={engine.audioFx}
                  isPlaying={engine.isPlaying}
                  sleepAfterTrack={engine.sleepAfterTrack}
                  sleepRemainingSec={engine.sleepRemainingSec}
                  accentColor={accent}
                  getFrequencyData={engine.getFrequencyData}
                  getWaveformData={engine.getWaveformData}
                  onToggleEnabled={() => engine.setEqEnabled((e) => !e)}
                  onChangePreamp={engine.setEqPreamp}
                  onChangeBand={engine.setEqBandGain}
                  onApplyPreset={engine.applyEqPreset}
                  onChangeAudioFx={engine.setAudioFx}
                  onSetSleepTimer={engine.setSleepTimerMinutes}
                />
              ) : (
                <div className="space-y-5">
                  {/* Mobile Nav Pills */}
                  <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-1">
                    {[
                      { id: 'library' as const, label: 'Home' },
                      { id: 'albums' as const, label: 'Albums' },
                      { id: 'artists' as const, label: 'Artists' },
                      { id: 'liked' as const, label: 'Liked' },
                      { id: 'history' as const, label: 'Recent' },
                      { id: 'fx' as const, label: 'Audio FX' },
                    ].map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          setNavSection(n.id);
                          setAlbumFilter(null);
                          setArtistFilter(null);
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                          navSection === n.id && !albumFilter && !artistFilter
                            ? 'bg-white text-zinc-950'
                            : 'bg-white/10 text-zinc-200'
                        }`}
                      >
                        {n.label}
                      </button>
                    ))}
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        onClick={() => {
                          setNavSection('playlist');
                          setActivePlaylistId(pl.id);
                          setAlbumFilter(null);
                          setArtistFilter(null);
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                          navSection === 'playlist' && activePlaylistId === pl.id
                            ? 'bg-white text-zinc-950'
                            : 'bg-white/10 text-zinc-200'
                        }`}
                      >
                        {pl.name}
                      </button>
                    ))}
                  </div>

                  {navSection === 'albums' ? (
                    <AlbumsView
                      albums={albums}
                      tracks={libraryTracks}
                      currentTrack={currentTrack}
                      isPlaying={engine.isPlaying}
                      onPlayTrack={(t) => playFromList(t, libraryTracks)}
                      onSelectAlbum={(albumName) => {
                        setNavSection('library');
                        setActivePlaylistId(null);
                        setArtistFilter(null);
                        setAlbumFilter(albumName);
                      }}
                      onAddFolder={() => folderInputRef.current?.click()}
                      onViewAllTracks={() => {
                        setNavSection('library');
                        setAlbumFilter(null);
                        setArtistFilter(null);
                      }}
                    />
                  ) : navSection === 'artists' ? (
                    <ArtistsView
                      artists={artists}
                      tracks={libraryTracks}
                      playCounts={playCounts}
                      currentTrack={currentTrack}
                      onPlayTrack={(t) => playFromList(t, libraryTracks)}
                      onSelectArtist={(artistName) => {
                        setNavSection('library');
                        setActivePlaylistId(null);
                        setAlbumFilter(null);
                        setArtistFilter(artistName);
                      }}
                      onAddFolder={() => folderInputRef.current?.click()}
                      onViewAllTracks={() => {
                        setNavSection('library');
                        setAlbumFilter(null);
                        setArtistFilter(null);
                      }}
                    />
                  ) : (
                  /* Asymmetric Desktop Split on Home, or Full-Width Stage on Collections */
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                    {/* Left 8/12 on Home, Full 12/12 on Liked / Recent / Playlist / Detail */}
                    <div
                      className={
                        isHomeOverview
                          ? 'xl:col-span-8 space-y-5 min-w-0'
                          : 'xl:col-span-12 space-y-5 min-w-0'
                      }
                    >
                      {isHomeOverview ? (
                      /* Hero Card (Monochrome Smoked Glass Style + Devault Art) */
                      <div className="smoked-glass rounded-2xl overflow-hidden relative min-h-[196px] p-5 sm:p-6 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6">
                        {/* Blended background artwork on right */}
                        {currentTrack?.coverUrl && (
                          <div
                            className="pointer-events-none absolute inset-y-0 right-0 w-2/3 opacity-35"
                            style={{
                              maskImage:
                                'linear-gradient(to left, rgba(0,0,0,0.9) 15%, transparent 90%)',
                              WebkitMaskImage:
                                'linear-gradient(to left, rgba(0,0,0,0.9) 15%, transparent 90%)',
                            }}
                          >
                            <img
                              src={currentTrack.coverUrl}
                              alt=""
                              className="w-full h-full object-cover grayscale-[25%]"
                            />
                          </div>
                        )}

                        <div className="relative z-10 flex-1 min-w-0 text-center sm:text-left space-y-2.5">
                          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                            <span className="font-mono text-[10px] tracking-[0.16em] uppercase px-2.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-zinc-200">
                              {currentTrack
                                ? `${currentTrack.format} · ${currentTrack.bitrate}`
                                : 'LOCAL AUDIO'}
                            </span>
                          </div>

                          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white truncate">
                            {currentTrack ? currentTrack.title : 'Your Local Music'}
                          </h1>

                          <p className="text-xs sm:text-sm text-zinc-300 truncate">
                            {currentTrack ? (
                              <>
                                <span>{currentTrack.artist} · {currentTrack.album}</span>
                                <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">
                                  {' · '}
                                  {playCounts[currentTrack.key] || 0} plays · {hydratedTracks.length} in vault
                                </span>
                              </>
                            ) : (
                              'Add a folder or drag audio files to start listening'
                            )}
                          </p>

                          <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                            <motion.button
                              whileTap={{ scale: 0.96 }}
                              onClick={() => void engine.togglePlay()}
                              className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-bold transition shadow-md"
                            >
                              {engine.isPlaying ? (
                                <>
                                  <Pause size={14} weight="fill" />
                                  <span>Pause</span>
                                </>
                              ) : (
                                <>
                                  <Play size={14} weight="fill" />
                                  <span>Play</span>
                                </>
                              )}
                            </motion.button>

                            <button
                              onClick={() => {
                                const pool = displayedTracks.length > 0 ? displayedTracks : libraryTracks;
                                if (pool.length === 0) return;
                                if (!engine.shuffle) engine.toggleShuffle();
                                const pick = pool[Math.floor(Math.random() * pool.length)];
                                playFromList(pick, pool);
                              }}
                              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full font-mono text-[11px] transition ${
                                engine.shuffle
                                  ? 'bg-white/18 border border-white/30 text-white'
                                  : 'glass-pill-btn text-zinc-100'
                              }`}
                              title="Shuffle library"
                            >
                              <Shuffle size={13} />
                              <span>Shuffle</span>
                            </button>

                            <button
                              onClick={() => {
                                if (selectMode || selectedTrackIds.length > 0) {
                                  setSelectMode(false);
                                  setSelectedTrackIds([]);
                                } else {
                                  setSelectMode(true);
                                }
                              }}
                              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border font-mono text-[11px] transition ${
                                selectMode || selectedTrackIds.length > 0
                                  ? 'bg-white text-zinc-950 border-white font-semibold'
                                  : 'glass-pill-btn text-zinc-100'
                              }`}
                            >
                              <ListChecks size={14} />
                              <span>{selectMode || selectedTrackIds.length > 0 ? 'Done' : 'Select'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Interactive Devault ASCII/Braille/Dither Artwork Card */}
                        <div className="relative z-10 shrink-0">
                          <DevaultArtworkCanvas
                            coverUrl={currentTrack?.coverUrl ?? null}
                            title={currentTrack?.title ?? 'No track'}
                            mode={coverMode}
                            accentColor={accent}
                            isPlaying={engine.isPlaying}
                            tuner={initialPrefs.asciiTuner}
                            getFrequencyData={engine.getFrequencyData}
                            onClick={cycleCoverMode}
                            className="w-36 h-36 sm:w-40 sm:h-40 rounded-2xl"
                          />
                        </div>
                      </div>
                      ) : (
                        <CollectionBanner
                          kind={collectionMeta.kind}
                          title={collectionMeta.title}
                          subtitle={collectionMeta.subtitle}
                          tracks={displayedTracks}
                          playCounts={playCounts}
                          accentColor={displayedTracks[0]?.accentColor ?? accent}
                          isShuffle={engine.shuffle}
                          isCurrent={
                            !!currentTrack &&
                            (collectionMeta.kind === 'playlist' && activePlaylist
                              ? activePlaylist.trackKeys.includes(currentTrack.key)
                              : displayedTracks.some((t) => t.key === currentTrack.key))
                          }
                          isPlaying={engine.isPlaying}
                          onTogglePlay={() => void engine.togglePlay()}
                          onPlayFirst={() => {
                            if (displayedTracks[0]) {
                              playFromList(
                                displayedTracks[0],
                                displayedTracks,
                                navSection === 'playlist' ? activePlaylistId : null
                              );
                            }
                          }}
                          onShufflePlay={() => {
                            if (displayedTracks.length === 0) return;
                            if (!engine.shuffle) engine.toggleShuffle();
                            const pick =
                              displayedTracks[
                                Math.floor(Math.random() * displayedTracks.length)
                              ];
                            playFromList(
                              pick,
                              displayedTracks,
                              navSection === 'playlist' ? activePlaylistId : null
                            );
                          }}
                          onBackHome={
                            albumFilter
                              ? () => {
                                  setAlbumFilter(null);
                                  setNavSection('albums');
                                }
                              : artistFilter
                              ? () => {
                                  setArtistFilter(null);
                                  setNavSection('artists');
                                }
                              : undefined
                          }
                          coverUrl={collectionMeta.kind === 'playlist' ? activePlaylist?.coverUrl : undefined}
                          onRename={
                            collectionMeta.kind === 'playlist' && activePlaylist
                              ? (name) => handleRenamePlaylist(activePlaylist.id, name)
                              : undefined
                          }
                          onChangeCover={
                            collectionMeta.kind === 'playlist' && activePlaylist
                              ? (file) => handlePlaylistCover(activePlaylist.id, file)
                              : undefined
                          }
                        />
                      )}

                      {/* Track List Section */}
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <h2 className="text-sm font-semibold text-white truncate">
                              {artistFilter
                                ? artistFilter
                                : albumFilter
                                ? albumFilter
                                : navSection === 'playlist' && activePlaylist
                                ? activePlaylist.name
                                : navSection === 'liked'
                                ? 'Liked Songs'
                                : navSection === 'history'
                                ? 'Recently Played'
                                : 'Tracks'}
                            </h2>
                            <span className="font-mono text-[10px] text-zinc-400 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08]">
                              {displayedTracks.length}
                            </span>
                            {(artistFilter || albumFilter || formatFilter) && (
                              <button
                                onClick={() => {
                                  setAlbumFilter(null);
                                  setArtistFilter(null);
                                  setFormatFilter(null);
                                }}
                                className="font-mono text-[10px] text-zinc-300 hover:text-white px-2 py-0.5 rounded-full bg-white/10 border border-white/15 transition"
                              >
                                Reset ×
                              </button>
                            )}
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5">
                            {availableFormats.length > 1 && (
                              <div className="hidden sm:flex items-center gap-1 p-0.5 rounded-full bg-black/30 border border-white/[0.07]">
                                <button
                                  onClick={() => setFormatFilter(null)}
                                  className={`px-2 py-0.5 rounded-full font-mono text-[10px] transition ${
                                    !formatFilter
                                      ? 'bg-white text-zinc-950 font-semibold'
                                      : 'text-zinc-400 hover:text-white'
                                  }`}
                                >
                                  All
                                </button>
                                {availableFormats.map((fmt) => (
                                  <button
                                    key={fmt}
                                    onClick={() =>
                                      setFormatFilter((prev) => (prev === fmt ? null : fmt))
                                    }
                                    className={`px-2 py-0.5 rounded-full font-mono text-[10px] transition ${
                                      formatFilter === fmt
                                        ? 'bg-white text-zinc-950 font-semibold'
                                        : 'text-zinc-400 hover:text-white'
                                    }`}
                                  >
                                    {fmt}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-black/30 border border-white/[0.07]">
                              {(
                                [
                                  { id: 'recent', label: 'Recent' },
                                  { id: 'title', label: 'A-Z' },
                                  { id: 'plays', label: 'Top' },
                                  { id: 'duration', label: 'Time' },
                                ] as const
                              ).map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => setSortMode(s.id)}
                                  className={`px-2 py-0.5 rounded-full font-mono text-[10px] transition ${
                                    sortMode === s.id
                                      ? 'bg-white/15 text-white'
                                      : 'text-zinc-400 hover:text-white'
                                  }`}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>

                            <button
                              onClick={toggleSelectAllDisplayed}
                              className="font-mono text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 transition"
                            >
                              {allDisplayedSelected ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                        </div>

                        {/* Bulk Selection Action Bar */}
                        <AnimatePresence>
                          {(selectMode || selectedDisplayedTracks.length > 0) && (
                            <motion.div
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              className="glass-inner-card rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={toggleSelectAllDisplayed}
                                  className="flex items-center gap-2 text-xs font-medium text-white"
                                >
                                  <span
                                    className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition ${
                                      allDisplayedSelected || someDisplayedSelected
                                        ? 'bg-white border-white text-zinc-950'
                                        : 'border-white/35 bg-white/5'
                                    }`}
                                  >
                                    {allDisplayedSelected ? (
                                      <Check size={11} weight="bold" />
                                    ) : someDisplayedSelected ? (
                                      <Minus size={11} weight="bold" />
                                    ) : null}
                                  </span>
                                  <span>
                                    {selectedDisplayedTracks.length} of {displayedTracks.length} selected
                                  </span>
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                {selectedDisplayedTracks.length > 0 && (
                                  <>
                                    <div className="relative">
                                      <button
                                        onClick={() => setBulkPlaylistMenuOpen((o) => !o)}
                                        className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-pill-btn text-xs text-white"
                                      >
                                        <ListPlus size={13} />
                                        <span>Add to Playlist</span>
                                      </button>

                                      {bulkPlaylistMenuOpen && (
                                        <div className="absolute right-0 top-9 z-30 w-48 smoked-glass-elevated rounded-xl p-1.5 space-y-0.5">
                                          {playlists.map((pl) => (
                                            <button
                                              key={pl.id}
                                              onClick={() => handleBulkAddToPlaylist(pl.id)}
                                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs text-zinc-200 truncate"
                                            >
                                              + {pl.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <button
                                      onClick={() => requestDeleteTracks(selectedDisplayedTracks)}
                                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/85 hover:bg-red-500 text-white text-xs font-semibold transition"
                                    >
                                      <Trash size={13} weight="bold" />
                                      <span>Delete ({selectedDisplayedTracks.length})</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {navSection === 'playlist' && activePlaylist && (
                          <div className="pt-1">
                            <PlaylistSource
                              key={activePlaylist.id}
                              playlistId={activePlaylist.id}
                              source={activePlaylist.source}
                              onSourceChange={(url) =>
                                handlePlaylistSource(activePlaylist.id, url)
                              }
                              onSynced={handleSynced}
                            />
                          </div>
                        )}

                        {displayedTracks.length === 0 ? (
                          <div className="smoked-glass rounded-2xl p-6 space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
                                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-200">
                                    {tracks.length === 0
                                      ? libraryLoading
                                        ? 'Memuat library...'
                                        : 'Audio Vault Ready'
                                      : navSection === 'liked'
                                      ? 'No Liked Songs Yet'
                                      : navSection === 'history'
                                      ? 'No Listening History Yet'
                                      : navSection === 'playlist'
                                      ? 'Playlist Is Empty'
                                      : 'No Matching Tracks'}
                                  </p>
                                </div>
                                <p className="text-xs text-zinc-400">
                                  {tracks.length === 0
                                    ? 'Drop folders or local audio anywhere onto this glass window to build playlists.'
                                    : navSection === 'liked'
                                    ? 'Tap the heart button on any song to save it to this collection.'
                                    : navSection === 'history'
                                    ? 'Play tracks in your library to record chronological listening activity.'
                                    : navSection === 'playlist'
                                    ? 'Use Select All or the track menu (+) to add songs to this playlist.'
                                    : 'Try clearing search or filter pills to view your indexed collection.'}
                                </p>
                              </div>

                              {tracks.length === 0 ? null : (
                                <button
                                  onClick={() => {
                                    setSearchQuery('');
                                    setAlbumFilter(null);
                                    setArtistFilter(null);
                                    setFormatFilter(null);
                                  }}
                                  className="px-3.5 py-1.5 rounded-full glass-pill-btn text-xs font-medium text-white"
                                >
                                  Clear Filters
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <button
                                onClick={() => folderInputRef.current?.click()}
                                className="group glass-inner-card rounded-xl p-4 text-left hover:border-white/30 transition space-y-2"
                              >
                                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white group-hover:scale-105 transition">
                                  <FolderPlus size={16} />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-white">Add Music Folder</p>
                                  <p className="text-[11px] text-zinc-400 mt-0.5">
                                    Auto-creates playlists per folder
                                  </p>
                                </div>
                              </button>

                              <button
                                onClick={() => filesInputRef.current?.click()}
                                className="group glass-inner-card rounded-xl p-4 text-left hover:border-white/30 transition space-y-2"
                              >
                                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white group-hover:scale-105 transition">
                                  <FileAudio size={16} />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-white">Import Audio & .LRC</p>
                                  <p className="text-[11px] text-zinc-400 mt-0.5">
                                    MP3 · FLAC · WAV · M4A · OGG
                                  </p>
                                </div>
                              </button>

                              <button
                                onClick={() => setNavSection('fx')}
                                className="group glass-inner-card rounded-xl p-4 text-left hover:border-white/30 transition space-y-2"
                              >
                                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white group-hover:scale-105 transition">
                                  <Equalizer size={16} />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-white">
                                    Tune 5-Band EQ
                                  </p>
                                  <p className="text-[11px] text-zinc-400 mt-0.5">
                                    Adjust spatial reverb & speed
                                  </p>
                                </div>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="smoked-glass rounded-2xl p-2 space-y-1">
                            <div className="flex items-center gap-3 px-3 py-1.5 border-b border-white/[0.06] font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                              <span className="w-4 shrink-0" />
                              <span className="w-6 text-center shrink-0">#</span>
                              <span className="flex-1 min-w-0">Title</span>
                              <span className="hidden md:block text-right">Album · Fmt</span>
                              <span className="w-[116px] hidden sm:block shrink-0" />
                              <span className="w-11 text-right shrink-0">Time</span>
                            </div>
                            {displayedTracks.map((track, idx) => {
                              const isCurrent = currentTrack?.id === track.id;
                              const isSelected = selectedTrackSet.has(track.id);
                              return (
                                <div
                                  key={`${track.id}-${idx}`}
                                  onClick={() => {
                                    if (selectMode) {
                                      toggleSelectTrack(track.id);
                                    } else {
                                      playFromList(
                                        track,
                                        displayedTracks,
                                        navSection === 'playlist' ? activePlaylistId : null
                                      );
                                    }
                                  }}
                                  className={`group flex items-center gap-3 px-3 py-2 rounded-xl transition cursor-pointer ${
                                    isSelected
                                      ? 'bg-white/[0.14] border border-white/25'
                                      : isCurrent
                                      ? 'glass-inner-card'
                                      : 'hover:bg-white/[0.06] border border-transparent'
                                  }`}
                                >
                                  {/* Checkbox */}
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSelectTrack(track.id);
                                    }}
                                    className="shrink-0"
                                  >
                                    <button
                                      type="button"
                                      aria-label={`Select ${track.title}`}
                                      className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition ${
                                        isSelected
                                          ? 'bg-white border-white text-zinc-950 opacity-100'
                                          : selectMode || selectedTrackIds.length > 0
                                          ? 'border-white/35 bg-white/5 opacity-100 hover:border-white'
                                          : 'border-white/25 bg-white/5 opacity-0 group-hover:opacity-100 hover:border-white'
                                      }`}
                                    >
                                      {isSelected && <Check size={10} weight="bold" />}
                                    </button>
                                  </div>

                                  {/* Index / Equalizer Pulse */}
                                  <div className="w-6 text-center font-mono text-xs shrink-0">
                                    {isCurrent && engine.isPlaying ? (
                                      <span
                                        className="font-bold animate-pulse"
                                        style={{ color: `rgb(${accent.join(',')})` }}
                                      >
                                        ⣶
                                      </span>
                                    ) : (
                                      <span className="text-zinc-500 group-hover:hidden">
                                        {idx + 1}
                                      </span>
                                    )}
                                    {!(isCurrent && engine.isPlaying) && (
                                      <Play
                                        size={12}
                                        weight="fill"
                                        className="hidden group-hover:inline-block text-white"
                                      />
                                    )}
                                  </div>

                                  <CoverArtRenderer
                                    coverUrl={track.coverUrl}
                                    title={track.title}
                                    mode="hd"
                                    accentColor={track.accentColor}
                                    size={38}
                                    className="w-9.5 h-9.5 rounded-lg shrink-0"
                                  />

                                  <div className="min-w-0 flex-1">
                                    <p
                                      className={`text-sm font-medium truncate ${
                                        isCurrent ? 'text-white' : 'text-zinc-100'
                                      }`}
                                    >
                                      {track.title}
                                    </p>
                                    <p className="text-xs text-zinc-400 truncate">
                                      {track.artist}
                                    </p>
                                  </div>

                                  <span className="hidden md:block text-xs text-zinc-500 truncate max-w-[140px]">
                                    {track.album}
                                  </span>

                                  {(playCounts[track.key] || 0) > 0 && (
                                    <span
                                      className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] text-zinc-400 tabular-nums shrink-0"
                                      title="Play count"
                                    >
                                      {playCounts[track.key]}×
                                    </span>
                                  )}

                                  <span className="hidden lg:inline-block font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-zinc-400 shrink-0">
                                    {track.format}
                                  </span>

                                  <div
                                    className="flex items-center gap-0.5 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => {
                                        engine.enqueueTrack(track.id);
                                        showToast(`Queued "${track.title}"`);
                                      }}
                                      className="p-1.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition opacity-0 group-hover:opacity-100"
                                      title="Add to Queue"
                                    >
                                      <Queue size={14} />
                                    </button>

                                    <button
                                      onClick={() => setEditingTrack(track)}
                                      className="p-1.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition opacity-0 group-hover:opacity-100"
                                      title="Edit track info"
                                    >
                                      <PencilSimple size={14} />
                                    </button>

                                    <button
                                      onClick={() => handleToggleLike(track.key)}
                                      className="p-1.5 rounded-full hover:bg-white/10 transition"
                                      title="Like"
                                    >
                                      <Heart
                                        size={14}
                                        weight={track.liked ? 'fill' : 'regular'}
                                        style={
                                          track.liked
                                            ? { color: `rgb(${track.accentColor.join(',')})` }
                                            : undefined
                                        }
                                        className={track.liked ? '' : 'text-zinc-500 hover:text-zinc-200'}
                                      />
                                    </button>

                                    <div className="relative">
                                      <button
                                        onClick={() =>
                                          setPlaylistMenuTrackKey((k) =>
                                            k === track.key ? null : track.key
                                          )
                                        }
                                        className="p-1.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-zinc-200 transition opacity-0 group-hover:opacity-100"
                                        title="Add to playlist"
                                      >
                                        <ListPlus size={14} />
                                      </button>

                                      {playlistMenuTrackKey === track.key && (
                                        <div className="absolute right-0 top-8 z-30 w-44 smoked-glass-elevated rounded-xl p-1.5 space-y-0.5">
                                          {playlists.map((pl) => {
                                            const inPl = pl.trackKeys.includes(track.key);
                                            return (
                                              <button
                                                key={pl.id}
                                                onClick={() => {
                                                  handleToggleTrackInPlaylist(pl.id, track.key);
                                                  setPlaylistMenuTrackKey(null);
                                                }}
                                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs flex items-center justify-between text-zinc-200"
                                              >
                                                <span className="truncate">{pl.name}</span>
                                                <span className="font-mono">{inPl ? '✓' : '+'}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    <button
                                      onClick={() => requestDeleteTracks([track])}
                                      className="p-1.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                                      title="Delete track"
                                    >
                                      <Trash size={14} />
                                    </button>

                                    <span className="font-mono text-[11px] text-zinc-400 tabular-nums w-11 text-right">
                                      {formatTime(track.duration)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Bottom "Albums" Card Row (only on Home Overview) */}
                      {isHomeOverview && (
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center justify-between px-1">
                            <h2 className="text-sm font-semibold text-white">Albums</h2>
                            {albums.length > 0 && (
                              <button
                                onClick={() => {
                                  if (albumFilter) {
                                    setAlbumFilter(null);
                                  } else {
                                    setNavSection('albums');
                                    setActivePlaylistId(null);
                                    setArtistFilter(null);
                                  }
                                }}
                                className="text-xs text-zinc-400 hover:text-white"
                              >
                                {albumFilter ? 'Clear album' : 'See all'}
                              </button>
                            )}
                          </div>

                          {albums.length > 0 ? (
                            <div className="flex gap-3.5 overflow-x-auto pb-2">
                              {albums.map((alb) => {
                                const active = albumFilter === alb.name;
                                return (
                                  <button
                                    key={alb.name}
                                    onClick={() => {
                                      setNavSection('library');
                                      setActivePlaylistId(null);
                                      setArtistFilter(null);
                                      setAlbumFilter(active ? null : alb.name);
                                    }}
                                    className={`group relative w-36 h-36 rounded-2xl overflow-hidden shrink-0 border transition text-left ${
                                      active
                                        ? 'border-white/50 shadow-lg'
                                        : 'border-white/15 hover:border-white/30'
                                    }`}
                                  >
                                    <CoverArtRenderer
                                      coverUrl={alb.coverUrl}
                                      title={alb.name}
                                      mode="hd"
                                      accentColor={alb.accentColor}
                                      size={144}
                                      className="w-full h-full"
                                    />
                                    <div className="absolute inset-x-0 bottom-0 p-2.5 bg-black/60 backdrop-blur-md border-t border-white/10">
                                      <p className="text-xs font-semibold text-white truncate">
                                        {alb.name}
                                      </p>
                                      <p className="font-mono text-[10px] text-zinc-300 truncate">
                                        {alb.count} {alb.count === 1 ? 'track' : 'tracks'}
                                      </p>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                {
                                  title: 'Folder Albums',
                                  sub: 'Drop folder -> Auto-index',
                                  onClick: () => folderInputRef.current?.click(),
                                },
                                {
                                  title: 'Embedded Covers',
                                  sub: 'Reads ID3 & FLAC artwork',
                                  onClick: () => filesInputRef.current?.click(),
                                },
                              ].map((slot) => (
                                <button
                                  key={slot.title}
                                  onClick={slot.onClick}
                                  className="smoked-glass rounded-2xl p-3.5 text-left hover:border-white/25 transition space-y-1.5"
                                >
                                  <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-zinc-200">
                                    <Disc size={14} />
                                  </div>
                                  <p className="text-xs font-semibold text-white truncate">
                                    {slot.title}
                                  </p>
                                  <p className="font-mono text-[10px] text-zinc-400 truncate">
                                    {slot.sub}
                                  </p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right 4/12: Lyrics/Queue/Top Card + Artists Grid + Audio Matrix (Home Only) */}
                    {isHomeOverview && (
                    <div className="xl:col-span-4 min-w-0 flex flex-col gap-3 xl:sticky xl:top-0 xl:h-[calc(100dvh-11.5rem)] xl:self-start xl:overflow-y-auto">
                      {/* Card 1: Synced Lyrics, Queue & Top Songs */}
                      <div className="smoked-glass rounded-2xl p-3.5 flex-1 min-h-[14.25rem] flex flex-col">
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-black/30 border border-white/[0.06] mb-2 shrink-0">
                          {[
                            { id: 'lyrics' as const, label: 'Lyrics' },
                            { id: 'queue' as const, label: `Queue (${queueTracks.length})` },
                            { id: 'top' as const, label: 'Top Song' },
                          ].map((t) => {
                            const active = rightTab === t.id;
                            return (
                              <button
                                key={t.id}
                                onClick={() => setRightTab(t.id)}
                                className={`relative flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  active
                                    ? 'text-zinc-950 font-semibold'
                                    : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {active && (
                                  <motion.div
                                    layoutId="rightTabPill"
                                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                    className="absolute inset-0 rounded-lg bg-white"
                                  />
                                )}
                                <span className="relative z-10">{t.label}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col">
                          {rightTab === 'lyrics' ? (
                            <LyricsPanel
                              track={currentTrack}
                              currentTime={engine.currentTime}
                              duration={engine.duration}
                              onSeek={engine.seek}
                              onSaveCustomLyrics={handleSaveCustomLyrics}
                              offset={lyricOffsets[currentTrack?.key ?? ''] ?? 0}
                              onAdjustOffset={(delta) =>
                                currentTrack && adjustLyricOffset(currentTrack.key, delta)
                              }
                              compact
                            />
                          ) : rightTab === 'queue' ? (
                            <QueuePanel
                              currentTrack={currentTrack}
                              queueTracks={queueTracks}
                              upNextTracks={upNextAutoTracks}
                              autoRadio={engine.autoRadio}
                              onToggleAutoRadio={() => {
                                engine.toggleAutoRadio();
                                showToast(
                                  !engine.autoRadio
                                    ? 'Auto-Radio aktif — musik berlanjut otomatis saat playlist selesai'
                                    : 'Auto-Radio dimatikan'
                                );
                              }}
                              onPlayTrack={(t) => void engine.playTrack(t)}
                              onMoveQueue={engine.moveQueueItem}
                              onRemoveQueue={engine.removeFromQueue}
                              onClearQueue={engine.clearQueue}
                            />
                          ) : (
                            <div className="flex-1 min-h-0 flex flex-col justify-between gap-1.5 overflow-y-auto pr-0.5">
                              {topPlayedTracks.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
                                  Play tracks to rank your top songs.
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {topPlayedTracks.map((t, i) => {
                                    const active = currentTrack?.id === t.id;
                                    const plays = playCounts[t.key] || 0;
                                    return (
                                      <button
                                        key={t.id}
                                        onClick={() => playFromList(t, topPlayedTracks)}
                                        className={`w-full flex items-center gap-2 p-1.5 rounded-xl border text-left transition ${
                                          active
                                            ? 'glass-inner-card border-white/25'
                                            : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.07]'
                                        }`}
                                      >
                                        <span
                                          className={`font-mono text-[11px] w-5 text-center shrink-0 ${
                                            i === 0 ? 'text-white font-bold' : 'text-zinc-500'
                                          }`}
                                        >
                                          #{i + 1}
                                        </span>
                                        <CoverArtRenderer
                                          coverUrl={t.coverUrl}
                                          title={t.title}
                                          mode="hd"
                                          accentColor={t.accentColor}
                                          size={32}
                                          className="w-8 h-8 rounded-lg shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-medium text-white truncate">
                                            {t.title}
                                          </p>
                                          <p className="text-[11px] text-zinc-400 truncate">
                                            {t.artist}
                                          </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="font-mono text-[10px] text-zinc-300 tabular-nums">
                                            {formatTime(t.duration)}
                                          </p>
                                          <p className="font-mono text-[9px] text-zinc-500 tabular-nums">
                                            {plays} plays
                                          </p>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              <button
                                onClick={() => {
                                  setSortMode('plays');
                                  setNavSection('library');
                                }}
                                className="w-full py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] font-mono text-[10px] text-zinc-400 hover:text-white transition shrink-0"
                              >
                                Sort Library by Most Played →
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card 2: Artists 3x2 Visual Avatar Grid */}
                      {artists.length > 0 && (
                      <div className="smoked-glass rounded-2xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-white">
                            Local Artists
                          </span>
                          <button
                            onClick={() => {
                              setNavSection('artists');
                              setAlbumFilter(null);
                              setArtistFilter(null);
                            }}
                            className="text-xs text-zinc-400 hover:text-white transition"
                          >
                            See all
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {artists.slice(0, 6).map((art) => {
                              const active = artistFilter === art.name;
                              return (
                                <button
                                  key={art.name}
                                  onClick={() => {
                                    setNavSection('library');
                                    setActivePlaylistId(null);
                                    setAlbumFilter(null);
                                    setArtistFilter(active ? null : art.name);
                                  }}
                                  className={`group relative h-[78px] rounded-xl overflow-hidden border text-left transition ${
                                    active
                                      ? 'border-white/55 shadow-md'
                                      : 'border-white/15 hover:border-white/30'
                                  }`}
                                  title={`${art.name} (${art.count} ${art.count === 1 ? 'track' : 'tracks'})`}
                                >
                                  <CoverArtRenderer
                                    coverUrl={art.coverUrl}
                                    title={art.name}
                                    mode="hd"
                                    accentColor={art.accentColor}
                                    size={112}
                                    className="w-full h-full group-hover:scale-105 transition duration-500"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent p-1.5 flex flex-col justify-end">
                                    <p className="text-[10px] font-semibold text-white truncate leading-tight">
                                      {art.name}
                                    </p>
                                    <p className="font-mono text-[9px] text-zinc-300 leading-tight">
                                      {art.count}×
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                      </div>
                      )}

                      {/* Card 3: Live ASCII / Pixel Spectrum Visualizer + Quick DSP, pinned to the bottom of the column */}
                      <div className="smoked-glass rounded-2xl p-3.5 space-y-2.5 mt-auto">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-white">
                            Audio Matrix
                          </span>
                          <button
                            onClick={cycleVisualizerMode}
                            className="font-mono text-[10px] px-2.5 py-1 rounded-full glass-pill-btn text-zinc-200"
                          >
                            {visualizerMode === 'ascii-bars'
                              ? 'ASCII Bars'
                              : visualizerMode === 'dot-matrix'
                              ? 'Pixel Dots'
                              : 'Oscilloscope'}
                          </button>
                        </div>

                        <div className="rounded-xl bg-black/35 border border-white/[0.06] p-2">
                          <AsciiVisualizer
                            mode={visualizerMode}
                            isPlaying={engine.isPlaying}
                            accentColor={accent}
                            getFrequencyData={engine.getFrequencyData}
                            getWaveformData={engine.getWaveformData}
                            height={82}
                          />
                        </div>

                        <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
                          <button
                            onClick={() => {
                              const nextSpeed =
                                Math.abs(engine.audioFx.speed - 1) < 0.05
                                  ? 1.15
                                  : engine.audioFx.speed > 1.05
                                  ? 0.85
                                  : 1;
                              engine.setAudioFx((fx) => ({ ...fx, speed: nextSpeed }));
                              showToast(`Speed: ${nextSpeed.toFixed(2)}×`);
                            }}
                            className="px-2.5 py-1 rounded-full glass-pill-btn font-mono text-[11px] text-zinc-200"
                            title="Cycle playback speed"
                          >
                            Speed {engine.audioFx.speed.toFixed(2)}×
                          </button>

                          <button
                            onClick={toggleSlowedReverb}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[11px] transition ${
                              engine.audioFx.speed < 0.95 && engine.audioFx.reverbMix >= 0.2
                                ? 'bg-white text-zinc-950 font-semibold'
                                : 'glass-pill-btn text-zinc-200'
                            }`}
                          >
                            <Sparkle size={11} />
                            <span>Slowed+Rev</span>
                          </button>

                          <button
                            onClick={() => {
                              if (engine.sleepRemainingSec !== null || engine.sleepAfterTrack) {
                                engine.setSleepTimerMinutes(null);
                                showToast('Sleep timer cancelled');
                              } else {
                                engine.setSleepTimerMinutes(15);
                                showToast('Sleep timer: 15 min');
                              }
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[11px] transition ${
                              engine.sleepRemainingSec !== null || engine.sleepAfterTrack
                                ? 'bg-white text-zinc-950 font-semibold'
                                : 'glass-pill-btn text-zinc-200'
                            }`}
                          >
                            <Moon size={11} />
                            <span>
                              {engine.sleepRemainingSec !== null
                                ? `${Math.ceil(engine.sleepRemainingSec / 60)}m`
                                : engine.sleepAfterTrack
                                ? '1 Track'
                                : '15m'}
                            </span>
                          </button>

                          <button
                            onClick={() => setNavSection('fx')}
                            className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full glass-pill-btn font-mono text-[11px] text-zinc-300 hover:text-white"
                            title="Open Audio FX & 5-Band EQ"
                          >
                            <Equalizer size={11} />
                            <span>EQ</span>
                          </button>
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-Width Bottom Glass Player Bar with Razor-Sharp Top Progress Line */}
        <footer
          onClick={(event) => {
            // empty space or track identity in the player bar opens the fullscreen player
            if ((event.target as HTMLElement).closest('button, a, input, [data-seek]')) return;
            setZenOpen(true);
          }}
          className="relative h-[4.85rem] shrink-0 bg-[#09090d]/82 backdrop-blur-2xl border-t border-white/[0.1] shadow-[0_-12px_36px_rgba(0,0,0,0.55)] px-5 flex items-center justify-between gap-4 cursor-pointer"
        >
          {/* Interactive Full-Width Top Progress Strip */}
          <div
            onClick={(e) => {
              if (!engine.duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              engine.seek(ratio * engine.duration);
            }}
            title="Seek"
            data-seek="true"
            className="absolute -top-[2px] inset-x-0 h-[4px] bg-white/10 cursor-pointer group z-20"
          >
            <div
              className="h-full transition-all duration-100"
              style={{
                width: `${progressPct}%`,
                backgroundColor: `rgb(${accent.join(',')})`,
              }}
            />
            <span
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md group-hover:scale-125 group-hover:opacity-95 transition-all pointer-events-none ${
                progressPct > 0 || engine.isPlaying ? 'opacity-95' : 'opacity-0'
              }`}
              style={{
                left: `clamp(6px, ${progressPct}%, calc(100% - 6px))`,
                boxShadow: `0 0 10px rgba(${accent.join(',')}, 0.9)`,
              }}
            />
          </div>

          {/* Left: Track Identity */}
          <div className="flex items-center gap-3 min-w-0 w-1/3">
            <CoverArtRenderer
              coverUrl={currentTrack?.coverUrl ?? null}
              title={currentTrack?.title ?? 'No track'}
              mode={coverMode}
              accentColor={accent}
              tuner={initialPrefs.asciiTuner}
              size={44}
              className="w-11 h-11 rounded-xl shrink-0"
            />
            <div className="min-w-0 hidden sm:block">
              <p className="text-sm font-semibold text-white truncate">
                {currentTrack?.title ?? 'Ready to play'}
              </p>
              <p className="text-xs text-zinc-400 truncate">
                {currentTrack?.artist ?? 'Drop local audio'}
              </p>
            </div>
            {currentTrack && (
              <div className="hidden sm:flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => handleToggleLike(currentTrack.key)}
                  className="p-1.5 rounded-full hover:bg-white/10 transition"
                  title="Like"
                >
                  <Heart
                    size={16}
                    weight={currentTrack.liked ? 'fill' : 'regular'}
                    style={
                      currentTrack.liked
                        ? { color: `rgb(${accent.join(',')})` }
                        : undefined
                    }
                    className={currentTrack.liked ? '' : 'text-zinc-400'}
                  />
                </button>
                </div>
            )}
          </div>

          {/* Center: Clean Playback Controls */}
          <div className="flex items-center gap-3.5 shrink-0">
            <button
              onClick={engine.prevTrack}
              className="p-2 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition"
              title="Previous"
            >
              <SkipBack size={20} weight="fill" />
            </button>

            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => void engine.togglePlay()}
              className="w-11 h-11 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 flex items-center justify-center transition shadow-lg"
              title="Play / Pause [Space]"
            >
              {engine.isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
            </motion.button>

            <button
              onClick={engine.nextTrack}
              className="p-2 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition"
              title="Next"
            >
              <SkipForward size={20} weight="fill" />
            </button>
          </div>

          {/* Right: Timestamps & Modes */}
          <div className="flex items-center justify-end gap-2 w-1/3">
            <span className="hidden sm:inline font-mono text-xs text-zinc-400 tabular-nums mr-1">
              {formatTime(engine.currentTime)} / {formatTime(engine.duration)}
            </span>

            <button
              onClick={engine.toggleShuffle}
              className={`p-1.5 rounded-full transition ${
                engine.shuffle ? 'text-white bg-white/15' : 'text-zinc-400 hover:text-white'
              }`}
              title="Shuffle"
            >
              <Shuffle size={17} weight={engine.shuffle ? 'bold' : 'regular'} />
            </button>

            <button
              onClick={engine.cycleRepeat}
              className={`p-1.5 rounded-full transition ${
                engine.repeat !== 'off' ? 'text-white bg-white/15' : 'text-zinc-400 hover:text-white'
              }`}
              title={`Repeat: ${engine.repeat}`}
            >
              {engine.repeat === 'one' ? <RepeatOnce size={17} weight="bold" /> : <Repeat size={17} />}
            </button>

            <button
              onClick={() => {
                engine.toggleAutoRadio();
                showToast(
                  !engine.autoRadio
                    ? 'Auto-Radio aktif — memutar lagu acak saat antrean habis'
                    : 'Auto-Radio dimatikan'
                );
              }}
              className={`p-1.5 rounded-full transition ${
                engine.autoRadio ? 'text-white bg-white/15' : 'text-zinc-400 hover:text-white'
              }`}
              title={`Auto-Radio: ${engine.autoRadio ? 'On' : 'Off'}`}
            >
              <Broadcast size={17} weight={engine.autoRadio ? 'fill' : 'regular'} />
            </button>

            <button
              onClick={() => void devicePopup.togglePopup()}
              className={`p-1.5 rounded-full transition ${
                devicePopup.isOpen ? 'text-white bg-white/15' : 'text-zinc-400 hover:text-white'
              }`}
              title="Floating Mini-Player (Picture-in-Picture)"
            >
              <Browsers size={17} weight={devicePopup.isOpen ? 'fill' : 'regular'} />
            </button>
          </div>
        </footer>
      </div>

      {/* Always-on-Top Mini-Player Portal */}
      <TopDynamicIsland
        pipOnly
        track={currentTrack}
        isPlaying={engine.isPlaying}
        currentTime={engine.currentTime}
        duration={engine.duration}
        coverMode={coverMode}
        tuner={initialPrefs.asciiTuner}
        getFrequencyData={engine.getFrequencyData}
        onTogglePlay={() => void engine.togglePlay()}
        onPrev={engine.prevTrack}
        onNext={engine.nextTrack}
        onSeek={engine.seek}
        onOpenZen={() => setZenOpen(true)}
        pipContainer={devicePopup.container}
        onCloseDevicePopup={devicePopup.closePopup}
      />

      {/* Global YouTube Import Modal */}
      <ImportYouTubeModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        playlists={playlists}
        activePlaylistId={activePlaylistId}
        onImportComplete={handleImportModalComplete}
      />

      {/* Fullscreen Zen Overlay */}
      <ZenModeOverlay
        open={zenOpen}
        track={currentTrack}
        isPlaying={engine.isPlaying}
        currentTime={engine.currentTime}
        duration={engine.duration}
        shuffle={engine.shuffle}
        repeat={engine.repeat}
        coverMode={coverMode}
        visualizerMode={visualizerMode}
        tuner={initialPrefs.asciiTuner}
        asciiOverlayEnabled={asciiOverlayEnabled}
        getFrequencyData={engine.getFrequencyData}
        getWaveformData={engine.getWaveformData}
        slowedActive={slowedActive}
        onClose={() => setZenOpen(false)}
        onTogglePlay={() => void engine.togglePlay()}
        onPrev={engine.prevTrack}
        onNext={engine.nextTrack}
        onSeek={engine.seek}
        onToggleShuffle={engine.toggleShuffle}
        onCycleRepeat={engine.cycleRepeat}
        onToggleLike={handleToggleLike}
        onChangeCoverMode={setCoverMode}
        onCycleVisualizerMode={cycleVisualizerMode}
        onToggleSlowed={toggleSlowedReverb}
        onSaveCustomLyrics={handleSaveCustomLyrics}
        lyricOffset={lyricOffsets[currentTrack?.key ?? ''] ?? 0}
        onAdjustLyricOffset={(delta) =>
          currentTrack && adjustLyricOffset(currentTrack.key, delta)
        }
      />

      {/* Spotlight Command Palette (Ctrl+K) */}
      <CommandPalette
        open={paletteOpen}
        tracks={hydratedTracks}
        onClose={() => setPaletteOpen(false)}
        onPlayTrack={(t) => {
          if (playbackTracks.some((x) => x.id === t.id)) {
            void engine.playTrack(t);
            return;
          }
          const owners = playlists.filter((p) => p.trackKeys.includes(t.key));
          if (owners.length === 1) {
            const ownerSet = new Set(owners[0].trackKeys);
            playFromList(
              t,
              hydratedTracks.filter((x) => ownerSet.has(x.key)),
              owners[0].id
            );
            return;
          }
          playFromList(t, hydratedTracks);
        }}
        onOpenFx={() => setNavSection('fx')}
        onToggleZen={() => setZenOpen((z) => !z)}
        onCycleCoverMode={cycleCoverMode}
        onToggleSlowedReverb={toggleSlowedReverb}
        onSetSleep15={() => {
          engine.setSleepTimerMinutes(15);
          showToast('Sleep timer: 15 min');
        }}
        onOpenImportYouTube={() => setImportModalOpen(true)}
        onToggleMiniPlayer={() => void devicePopup.togglePopup()}
        onToggleAutoRadio={() => {
          engine.toggleAutoRadio();
          showToast(
            !engine.autoRadio
              ? 'Auto-Radio aktif — memutar lagu acak saat antrean habis'
              : 'Auto-Radio dimatikan'
          );
        }}
      />

      {/* Track Metadata Editor Modal */}
      <MetadataEditorModal
        track={editingTrack}
        onClose={() => setEditingTrack(null)}
        onSave={handleSaveMetadata}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        secondaryLabel={confirmDialog?.secondaryLabel}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => confirmDialog?.onConfirm()}
        onSecondaryConfirm={confirmDialog?.onSecondaryConfirm}
      />
    </div>
  );
}

export default App;
