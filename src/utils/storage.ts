import { AsciiTunerSettings, AudioFxSettings, UserPreferences } from '../types/music';

const PREFS_KEY = 'monolith_audio_prefs_v5';
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

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      eqGains:
        Array.isArray(parsed.eqGains) && parsed.eqGains.length === 5
          ? parsed.eqGains
          : DEFAULT_PREFS.eqGains,
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
  } catch {
    return DEFAULT_PREFS;
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

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
    });
  } catch {
    // Ignore
  }
}
