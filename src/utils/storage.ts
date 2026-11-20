import { AsciiTunerSettings, AudioFxSettings, Playlist, UserPreferences } from '../types/music';

const PREFS_KEY = 'monolith_audio_prefs_v5';
const MIGRATED_KEY = 'monolith_disk_state_migrated_v1';
const DB_NAME = 'monolith_local_audio_db';
const DB_VERSION = 1;
const STORE_TRACKS = 'local_files';

export interface StoredLocalFile {
  key: string;
  file: File;
  addedAt: number;
}

export const DEFAULT_ASCII_TUNER: AsciiTunerSettings = {
  cellSize: 7,
  contrast: 1.2,
  colorMode: 'tint',
  audioReactive: 0.65,
  invert: false,
  scanlines: false,
};

export const DEFAULT_AUDIO_FX: AudioFxSettings = {
  speed: 1.0,
  preservesPitch: true,
  reverbMix: 0,
  pan: 0,
  bassBoost: 0,
  stereoWidth: 1,
  compressor: false,
  lowpassHz: 20000,
};

export const DEFAULT_PREFS: UserPreferences = {
  likedKeys: [],
  hiddenDemoKeys: [],
  playlists: [
    {
      id: 'pl-late-night',
      name: 'Late Night Mix',
      trackKeys: [],
      createdAt: Date.now(),
    },
  ],
  customLyrics: {},
  lyricOffsets: {},
  metadataOverrides: {},
  history: [],
  playCounts: {},
  eqGains: [0, 0, 0, 0, 0],
  eqPreamp: 1,
  eqEnabled: true,
  audioFx: DEFAULT_AUDIO_FX,
  visualizerMode: 'ascii-bars',
  coverMode: 'braille',
  asciiTuner: DEFAULT_ASCII_TUNER,
  volume: 0.8,
  asciiOverlayEnabled: false,
};

export function normalizePreferences(
  parsed: Partial<UserPreferences> | null | undefined
): UserPreferences {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFS;
  return {
    ...DEFAULT_PREFS,
    ...parsed,
    eqGains:
      Array.isArray(parsed.eqGains) && parsed.eqGains.length === 5
        ? parsed.eqGains.map((g) => (typeof g === 'number' && Number.isFinite(g) ? g : 0))
        : DEFAULT_PREFS.eqGains,
    eqPreamp:
      typeof parsed.eqPreamp === 'number' && Number.isFinite(parsed.eqPreamp)
        ? parsed.eqPreamp
        : DEFAULT_PREFS.eqPreamp,
    eqEnabled:
      typeof parsed.eqEnabled === 'boolean'
        ? parsed.eqEnabled
        : DEFAULT_PREFS.eqEnabled,
    volume:
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.max(0, Math.min(1, parsed.volume))
        : DEFAULT_PREFS.volume,
    playlists: Array.isArray(parsed.playlists)
      ? parsed.playlists
      : DEFAULT_PREFS.playlists,
    likedKeys: Array.isArray(parsed.likedKeys) ? parsed.likedKeys : [],
    hiddenDemoKeys: Array.isArray(parsed.hiddenDemoKeys)
      ? parsed.hiddenDemoKeys
      : [],
    history: Array.isArray(parsed.history) ? parsed.history : [],
    playCounts:
      parsed.playCounts && typeof parsed.playCounts === 'object'
        ? parsed.playCounts
        : {},
    customLyrics:
      parsed.customLyrics && typeof parsed.customLyrics === 'object'
        ? parsed.customLyrics
        : {},
    metadataOverrides:
      parsed.metadataOverrides && typeof parsed.metadataOverrides === 'object'
        ? parsed.metadataOverrides
        : {},
    lyricOffsets:
      parsed.lyricOffsets && typeof parsed.lyricOffsets === 'object'
        ? parsed.lyricOffsets
        : {},
    audioFx: {
      ...DEFAULT_AUDIO_FX,
      ...(parsed.audioFx || {}),
    },
    asciiTuner: {
      ...DEFAULT_ASCII_TUNER,
      ...(parsed.asciiTuner || {}),
    },
  };
}

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return normalizePreferences(parsed);
  } catch {
    return DEFAULT_PREFS;
  }
}

export function hasSavedLocalPreferences(): boolean {
  try {
    return localStorage.getItem(PREFS_KEY) !== null;
  } catch {
    return false;
  }
}

export function isLocalOriginMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLocalOriginMigrated(): void {
  try {
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    // Ignore storage quota errors
  }
}

export function hasMeaningfulPreferences(prefs: UserPreferences): boolean {
  if (prefs.playlists.length !== 1) return true;
  if (
    prefs.playlists.some(
      (pl) =>
        pl.id !== 'pl-late-night' ||
        pl.name !== 'Late Night Mix' ||
        pl.trackKeys.length > 0 ||
        Boolean(pl.source) ||
        Boolean(pl.coverUrl)
    )
  ) {
    return true;
  }
  if (
    prefs.likedKeys.length > 0 ||
    prefs.history.length > 0 ||
    Object.keys(prefs.playCounts).length > 0 ||
    Object.keys(prefs.customLyrics).length > 0 ||
    Object.keys(prefs.metadataOverrides).length > 0 ||
    Object.keys(prefs.lyricOffsets).length > 0
  ) {
    return true;
  }
  if (
    prefs.eqGains.some((g) => g !== 0) ||
    prefs.eqPreamp !== DEFAULT_PREFS.eqPreamp ||
    prefs.eqEnabled !== DEFAULT_PREFS.eqEnabled
  ) {
    return true;
  }
  return false;
}

function extractListId(url?: string): string | null {
  const match = /[?&]list=([\w-]+)/.exec(url ?? '');
  return match ? match[1] : null;
}

export function isUntouchedDefaultPlaylist(pl: Playlist): boolean {
  return (
    pl.id === 'pl-late-night' &&
    pl.name === 'Late Night Mix' &&
    pl.trackKeys.length === 0 &&
    !pl.source &&
    !pl.coverUrl
  );
}

export function hasOnlyDefaultPlaylists(playlists: Playlist[]): boolean {
  return playlists.length === 1 && isUntouchedDefaultPlaylist(playlists[0]);
}

export function mergePreferences(
  disk: UserPreferences,
  local: UserPreferences
): UserPreferences {
  const merged: Playlist[] = disk.playlists.map((p) => ({
    ...p,
    trackKeys: [...p.trackKeys],
  }));

  for (const lpl of local.playlists) {
    const hasOtherPlaylists = merged.some((p) => !isUntouchedDefaultPlaylist(p));
    if (isUntouchedDefaultPlaylist(lpl) && hasOtherPlaylists) continue;

    const localListId = extractListId(lpl.source);
    const existingIdx = merged.findIndex(
      (p) =>
        p.id === lpl.id ||
        (localListId !== null && extractListId(p.source) === localListId)
    );

    if (existingIdx !== -1) {
      const existing = merged[existingIdx];
      const combinedKeys = Array.from(
        new Set([...lpl.trackKeys, ...existing.trackKeys])
      );
      if (
        (existing.id.startsWith('pl-yt-') || isUntouchedDefaultPlaylist(existing)) &&
        !lpl.id.startsWith('pl-yt-') &&
        !isUntouchedDefaultPlaylist(lpl)
      ) {
        merged[existingIdx] = {
          ...existing,
          id: lpl.id,
          name: lpl.name,
          coverUrl: lpl.coverUrl ?? existing.coverUrl,
          source: lpl.source ?? existing.source,
          createdAt: lpl.createdAt,
          trackKeys: combinedKeys,
        };
      } else {
        merged[existingIdx] = {
          ...existing,
          trackKeys: combinedKeys,
          coverUrl: existing.coverUrl ?? lpl.coverUrl,
          source: existing.source ?? lpl.source,
        };
      }
    } else {
      merged.push({ ...lpl, trackKeys: [...lpl.trackKeys] });
    }
  }

  const finalPlaylists =
    merged.length > 1
      ? merged.filter((p) => !isUntouchedDefaultPlaylist(p))
      : merged;

  const likedKeys = Array.from(new Set([...disk.likedKeys, ...local.likedKeys]));
  const hiddenDemoKeys = Array.from(
    new Set([...disk.hiddenDemoKeys, ...local.hiddenDemoKeys])
  );
  const customLyrics = { ...local.customLyrics, ...disk.customLyrics };
  const lyricOffsets = { ...local.lyricOffsets, ...disk.lyricOffsets };
  const metadataOverrides = {
    ...local.metadataOverrides,
    ...disk.metadataOverrides,
  };

  const playCounts: Record<string, number> = { ...local.playCounts };
  for (const [key, count] of Object.entries(disk.playCounts)) {
    playCounts[key] = Math.max(playCounts[key] ?? 0, count);
  }

  const historyMap = new Map<string, number>();
  for (const entry of [...local.history, ...disk.history]) {
    if (!entry?.key) continue;
    const prevTime = historyMap.get(entry.key) ?? 0;
    if (entry.playedAt >= prevTime) historyMap.set(entry.key, entry.playedAt);
  }
  const history = Array.from(historyMap.entries())
    .map(([key, playedAt]) => ({ key, playedAt }))
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, 50);

  const shouldUseLocalEq =
    disk.eqGains.every((g) => g === 0) && local.eqGains.some((g) => g !== 0);

  return normalizePreferences({
    ...disk,
    playlists: finalPlaylists,
    likedKeys,
    hiddenDemoKeys,
    customLyrics,
    lyricOffsets,
    metadataOverrides,
    playCounts,
    history,
    ...(shouldUseLocalEq
      ? {
          eqGains: local.eqGains,
          eqPreamp: local.eqPreamp,
          eqEnabled: local.eqEnabled,
        }
      : {}),
  });
}

export async function loadDiskPreferences(): Promise<{
  available: boolean;
  exists: boolean;
  prefs: UserPreferences | null;
}> {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) {
      return { available: false, exists: false, prefs: null };
    }
    const data = (await res.json()) as {
      exists?: boolean;
      prefs?: Partial<UserPreferences> | null;
    };
    if (data.exists && data.prefs && typeof data.prefs === 'object') {
      return {
        available: true,
        exists: true,
        prefs: normalizePreferences(data.prefs),
      };
    }
    return { available: true, exists: false, prefs: null };
  } catch {
    return { available: false, exists: false, prefs: null };
  }
}

export async function saveDiskPreferences(
  prefs: UserPreferences,
  options?: { keepalive?: boolean }
): Promise<boolean> {
  try {
    const body = JSON.stringify(prefs);
    const useKeepalive =
      Boolean(options?.keepalive) &&
      new TextEncoder().encode(body).length <= 60_000;
    const res = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      ...(useKeepalive ? { keepalive: true } : {}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

const PLAYBACK_KEY = 'monolith_audio_playback_v1';

export interface StoredPlayback {
  key: string;
  time: number;
  playlistId?: string;
}

export function savePlayback(playback: StoredPlayback): void {
  try {
    localStorage.setItem(PLAYBACK_KEY, JSON.stringify(playback));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadPlayback(): StoredPlayback | null {
  try {
    const raw = localStorage.getItem(PLAYBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPlayback>;
    if (typeof parsed.key !== 'string' || !parsed.key) return null;
    return {
      key: parsed.key,
      time: Number(parsed.time) || 0,
      playlistId:
        typeof parsed.playlistId === 'string' && parsed.playlistId
          ? parsed.playlistId
          : undefined,
    };
  } catch {
    return null;
  }
}

export async function loadDiskPlayback(): Promise<{
  available: boolean;
  playback: StoredPlayback | null;
}> {
  try {
    const res = await fetch('/api/playback', { cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) {
      return { available: false, playback: null };
    }
    const data = (await res.json()) as {
      playback?: Partial<StoredPlayback> | null;
    };
    const p = data.playback;
    if (p && typeof p === 'object' && typeof p.key === 'string' && p.key) {
      return {
        available: true,
        playback: {
          key: p.key,
          time: Number(p.time) || 0,
          playlistId:
            typeof p.playlistId === 'string' && p.playlistId
              ? p.playlistId
              : undefined,
        },
      };
    }
    return { available: true, playback: null };
  } catch {
    return { available: false, playback: null };
  }
}

export async function saveDiskPlayback(
  playback: StoredPlayback,
  options?: { beacon?: boolean }
): Promise<void> {
  try {
    const body = JSON.stringify(playback);
    if (
      options?.beacon &&
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      navigator.sendBeacon(
        '/api/playback',
        new Blob([body], { type: 'application/json' })
      );
      return;
    }
    await fetch('/api/playback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    // Degrade gracefully
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_TRACKS)) {
          db.createObjectStore(STORE_TRACKS, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          if (dbPromise === pending) dbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          if (dbPromise === pending) dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        if (dbPromise === pending) dbPromise = null;
        reject(req.error);
      };
    } catch (error) {
      if (dbPromise === pending) dbPromise = null;
      reject(error);
    }
  });
  dbPromise = pending;
  return pending;
}

export async function saveLocalFilesToDB(items: StoredLocalFile[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, 'readwrite');
      const store = tx.objectStore(STORE_TRACKS);
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
    });
  } catch {
    // Degrade gracefully
  }
}

export async function loadLocalFilesFromDB(): Promise<StoredLocalFile[]> {
  try {
    const db = await openDB();
    return await new Promise<StoredLocalFile[]>((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, 'readonly');
      const store = tx.objectStore(STORE_TRACKS);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredLocalFile[]) || []);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
    });
  } catch {
    return [];
  }
}

export async function removeLocalFileFromDB(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, 'readwrite');
      tx.objectStore(STORE_TRACKS).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
    });
  } catch {
    // Ignore
  }
}
