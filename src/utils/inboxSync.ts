import { Track } from '../types/music';
import { parseLrc } from './id3';
import { saveLocalFilesToDB, StoredLocalFile } from './storage';

export interface InboxEntry {
  id: string;
  file: string;
  size?: number;
  duration?: number;
  title?: string;
  artist?: string;
  album?: string;
  lyrics?: string;
  source?: string;
}

// playlist identity that survives the ?si= tracking param the user may paste
export function listIdOf(url?: string): string | null {
  const match = /[?&]list=([\w-]+)/.exec(url ?? '');
  return match ? match[1] : null;
}

type TrackBuilder = (file: File, key: string, addedAt: number) => Promise<Track>;

export async function fetchInboxManifest(): Promise<InboxEntry[]> {
  try {
    const res = await fetch(
      `${import.meta.env.BASE_URL}inbox/manifest.json?t=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return [];
    const parsed = await res.json();
    return Array.isArray(parsed) ? (parsed as InboxEntry[]) : [];
  } catch {
    return [];
  }
}

// Pulls new audio files written by scripts/sync_playlist.py into the library.
export async function syncInbox(
  existingKeys: Set<string>,
  buildTrack: TrackBuilder
): Promise<Track[]> {
  const base = `${import.meta.env.BASE_URL}inbox/`;
  const stamp = () => `?t=${Date.now()}`;

  const entries = await fetchInboxManifest();

  const newTracks: Track[] = [];
  const toStore: StoredLocalFile[] = [];

  for (const entry of entries) {
    if (!entry.id || !entry.file) continue;
    const key = `yt::${entry.id}`;
    if (existingKeys.has(key)) continue;

    try {
      const res = await fetch(
        `${base}${encodeURIComponent(entry.file)}${stamp()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        continue;
      }
      const blob = await res.blob();
      if (blob.size === 0) continue;
      const file = new File([blob], entry.file, {
        type: blob.type || 'audio/mpeg',
      });
      const now = Date.now();
      const track = await buildTrack(file, key, now);
      if (!Number.isFinite(track.duration) || track.duration <= 0) continue;
      if (entry.title) track.title = entry.title;
      if (entry.artist) track.artist = entry.artist;
      if (entry.album) track.album = entry.album;
      if (entry.duration) track.duration = entry.duration;
      if (entry.lyrics) track.lyrics = parseLrc(entry.lyrics);
      newTracks.push(track);
      toStore.push({ key, file, addedAt: now });
      existingKeys.add(key);
    } catch {
      // skip one bad file, keep syncing the rest
    }
  }

  if (toStore.length > 0) await saveLocalFilesToDB(toStore);
  return newTracks;
}
