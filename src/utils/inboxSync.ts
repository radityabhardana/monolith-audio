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

function revokeTrackUrls(track: Track): void {
  if (track.fileUrl.startsWith('blob:')) URL.revokeObjectURL(track.fileUrl);
  if (track.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(track.coverUrl);
}

// Pulls new audio files written by scripts/sync_playlist.py into the library.
export async function syncInbox(
  existingKeys: Set<string>,
  buildTrack: TrackBuilder,
  shouldCancel?: () => boolean
): Promise<Track[]> {
  const base = `${import.meta.env.BASE_URL}inbox/`;
  const stamp = () => `?t=${Date.now()}`;

  const entries = await fetchInboxManifest();
  if (shouldCancel?.()) return [];

  const seenIds = new Set<string>();
  const pending: InboxEntry[] = [];
  for (const entry of entries) {
    if (!entry.id || !entry.file) continue;
    if (seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    const key = `yt::${entry.id}`;
    if (existingKeys.has(key)) continue;
    pending.push(entry);
  }
  if (pending.length === 0) return [];

  const results: ({ track: Track; stored: StoredLocalFile } | null)[] = new Array(
    pending.length
  ).fill(null);
  let cursor = 0;

  const worker = async () => {
    while (!shouldCancel?.()) {
      const idx = cursor++;
      if (idx >= pending.length) return;
      const entry = pending[idx];
      const key = `yt::${entry.id}`;
      let track: Track | null = null;
      let accepted = false;
      try {
        const res = await fetch(
          `${base}${encodeURIComponent(entry.file)}${stamp()}`,
          { cache: 'no-store' }
        );
        if (shouldCancel?.()) return;
        if (!res.ok) continue;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
          continue;
        }
        const blob = await res.blob();
        if (shouldCancel?.() || blob.size === 0) continue;
        const file = new File([blob], entry.file, {
          type: blob.type || 'audio/mpeg',
        });
        const now = Date.now();
        track = await buildTrack(file, key, now);
        if (shouldCancel?.()) {
          revokeTrackUrls(track);
          return;
        }
        if (!Number.isFinite(track.duration) || track.duration <= 0) {
          revokeTrackUrls(track);
          continue;
        }
        if (entry.title) track.title = entry.title;
        if (entry.artist) track.artist = entry.artist;
        if (entry.album) track.album = entry.album;
        if (entry.duration) track.duration = entry.duration;
        if (entry.lyrics) track.lyrics = parseLrc(entry.lyrics);
        results[idx] = { track, stored: { key, file, addedAt: now } };
        accepted = true;
      } catch {
        if (track && !accepted) revokeTrackUrls(track);
        // skip one bad file, keep syncing the rest
      }
    }
  };

  const workerCount = Math.min(6, pending.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (shouldCancel?.()) {
    for (const item of results) {
      if (item) revokeTrackUrls(item.track);
    }
    return [];
  }

  const newTracks: Track[] = [];
  const toStore: StoredLocalFile[] = [];
  for (const item of results) {
    if (!item) continue;
    newTracks.push(item.track);
    toStore.push(item.stored);
    existingKeys.add(item.stored.key);
  }

  if (toStore.length > 0) await saveLocalFilesToDB(toStore);
  return newTracks;
}
