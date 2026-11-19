import { AudioFormat, LyricLine, WordToken } from '../types/music';

export interface ParsedMetadata {
  title: string;
  artist: string;
  album: string;
  coverUrl: string | null;
  embeddedLyrics: LyricLine[];
  format: AudioFormat;
  bitrate: string;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// totals (playlist/album length) switch to hours past the 60 minute mark
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  if (seconds < 3600) return formatTime(seconds);
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function parseTimestampMatch(minStr: string, secStr: string, fracStr?: string): number {
  const minutes = parseInt(minStr, 10);
  const seconds = parseInt(secStr, 10);
  const f = fracStr || '0';
  const frac = parseInt(f, 10) / Math.pow(10, f.length);
  return minutes * 60 + seconds + frac;
}

export function parseLrc(lrcText: string): LyricLine[] {
  const lines = lrcText.split(/\r?\n/);
  const result: LyricLine[] = [];
  const lineTagRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const wordTagRegex = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>([^<]*)/g;

  for (const rawLine of lines) {
    const matches = [...rawLine.matchAll(lineTagRegex)];
    if (matches.length === 0) continue;

    const body = rawLine.replace(lineTagRegex, '').trim();
    if (!body) continue;

    // Parse Enhanced LRC word/syllable timestamps if present (<mm:ss.xx>word)
    const wordMatches = [...body.matchAll(wordTagRegex)];
    let words: WordToken[] | undefined;
    let cleanText = body;

    if (wordMatches.length > 0) {
      words = wordMatches
        .map((wm) => ({
          time: parseTimestampMatch(wm[1], wm[2], wm[3]),
          text: wm[4].trim(),
        }))
        .filter((w) => w.text.length > 0);
      cleanText = words.map((w) => w.text).join(' ');
    }

    if (!cleanText) continue;

    for (const match of matches) {
      const time = parseTimestampMatch(match[1], match[2], match[3]);
      result.push({ time, text: cleanText, words });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

export function inferFormatFromName(fileName: string): AudioFormat {
  const ext = fileName.split('.').pop()?.toUpperCase() || '';
  switch (ext) {
    case 'FLAC':
      return 'FLAC';
    case 'WAV':
      return 'WAV';
    case 'OGG':
      return 'OGG';
    case 'M4A':
      return 'M4A';
    case 'AAC':
      return 'AAC';
    case 'OPUS':
      return 'OPUS';
    case 'MP3':
    default:
      return 'MP3';
  }
}

function parseFilenameFallback(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^/.]+$/, '').replace(/^\d+[\s._-]+/, '');
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim() || 'Unknown Artist',
      title: parts.slice(1).join(' - ').trim() || base,
    };
  }
  return {
    title: base.trim() || 'Untitled Track',
    artist: 'Local Audio',
  };
}

function readSyncSafeInt(view: DataView, offset: number): number {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

function decodeTextBytes(bytes: Uint8Array, encoding: number): string {
  if (bytes.length === 0) return '';
  try {
    if (encoding === 0) {
      return new TextDecoder('iso-8859-1').decode(bytes).replace(/\0+$/, '').trim();
    }
    if (encoding === 1) {
      // UTF-16 with BOM
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(bytes.subarray(2)).replace(/\0+$/, '').trim();
      }
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(bytes.subarray(2)).replace(/\0+$/, '').trim();
      }
      return new TextDecoder('utf-16le').decode(bytes).replace(/\0+$/, '').trim();
    }
    if (encoding === 2) {
      return new TextDecoder('utf-16be').decode(bytes).replace(/\0+$/, '').trim();
    }
    return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/, '').trim();
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0+$/, '').trim();
  }
}

function findNullTerminator(bytes: Uint8Array, start: number, isUtf16: boolean): number {
  if (!isUtf16) {
    for (let i = start; i < bytes.length; i++) {
      if (bytes[i] === 0) return i;
    }
    return bytes.length;
  }
  for (let i = start; i + 1 < bytes.length; i += 2) {
    if (bytes[i] === 0 && bytes[i + 1] === 0) return i;
  }
  return bytes.length;
}

function parseId3v2(buffer: ArrayBuffer): Partial<ParsedMetadata> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) {
    return {};
  }

  const versionMajor = bytes[3];
  if (versionMajor < 3 || versionMajor > 4) return {};

  const tagSize = readSyncSafeInt(view, 6);
  const maxOffset = Math.min(bytes.length, 10 + tagSize);

  let offset = 10;
  // Skip extended header if flag bit 6 is set
  if ((bytes[5] & 0x40) !== 0 && offset + 4 <= maxOffset) {
    const extSize =
      versionMajor === 4 ? readSyncSafeInt(view, offset) : view.getUint32(offset);
    offset += versionMajor === 4 ? extSize : extSize + 4;
  }

  const result: Partial<ParsedMetadata> = {};

  while (offset + 10 <= maxOffset) {
    const frameId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    if (frameId === '\0\0\0\0' || !/^[A-Z0-9]{4}$/.test(frameId)) break;

    const frameSize =
      versionMajor === 4
        ? readSyncSafeInt(view, offset + 4)
        : view.getUint32(offset + 4);
    if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) break;

    const frameData = bytes.subarray(offset + 10, offset + 10 + frameSize);
    offset += 10 + frameSize;

    if (frameId === 'TIT2' || frameId === 'TPE1' || frameId === 'TALB') {
      const encoding = frameData[0];
      const text = decodeTextBytes(frameData.subarray(1), encoding);
      if (text) {
        if (frameId === 'TIT2') result.title = text;
        if (frameId === 'TPE1') result.artist = text;
        if (frameId === 'TALB') result.album = text;
      }
    } else if (frameId === 'USLT' && frameData.length > 4) {
      const encoding = frameData[0];
      const isUtf16 = encoding === 1 || encoding === 2;
      const descEnd = findNullTerminator(frameData, 4, isUtf16);
      const textStart = Math.min(frameData.length, descEnd + (isUtf16 ? 2 : 1));
      const rawLyrics = decodeTextBytes(frameData.subarray(textStart), encoding);
      if (rawLyrics) {
        const parsed = parseLrc(rawLyrics);
        if (parsed.length > 0) {
          result.embeddedLyrics = parsed;
        } else {
          // Plain unsynchronized lyrics fallback without timestamps
          const lines = rawLyrics
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          result.embeddedLyrics = lines.map((text, idx) => ({
            time: idx * 3.5,
            text,
          }));
        }
      }
    } else if (frameId === 'APIC' && frameData.length > 4 && !result.coverUrl) {
      const encoding = frameData[0];
      const mimeEnd = findNullTerminator(frameData, 1, false);
      const mime =
        decodeTextBytes(frameData.subarray(1, mimeEnd), 0) || 'image/jpeg';
      const picTypeIndex = mimeEnd + 1;
      if (picTypeIndex < frameData.length) {
        const isUtf16 = encoding === 1 || encoding === 2;
        const descEnd = findNullTerminator(frameData, picTypeIndex + 1, isUtf16);
        const imgStart = descEnd + (isUtf16 ? 2 : 1);
        if (imgStart < frameData.length) {
          const imgBytes = frameData.subarray(imgStart);
          const blob = new Blob([imgBytes], {
            type: mime.includes('/') ? mime : 'image/jpeg',
          });
          result.coverUrl = URL.createObjectURL(blob);
        }
      }
    }
  }

  return result;
}

function parseFlacMetadata(buffer: ArrayBuffer): Partial<ParsedMetadata> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x66 ||
    bytes[1] !== 0x4c ||
    bytes[2] !== 0x61 ||
    bytes[3] !== 0x43
  ) {
    return {};
  }

  const result: Partial<ParsedMetadata> = {};
  let offset = 4;

  while (offset + 4 <= bytes.length) {
    const header = bytes[offset];
    const isLast = (header & 0x80) !== 0;
    const blockType = header & 0x7f;
    const blockSize =
      (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 4;

    if (offset + blockSize > bytes.length) break;

    if (blockType === 4) {
      // VORBIS_COMMENT
      let pos = offset;
      if (pos + 4 <= offset + blockSize) {
        const vendorLen = view.getUint32(pos, true);
        pos += 4 + vendorLen;
        if (pos + 4 <= offset + blockSize) {
          const commentCount = view.getUint32(pos, true);
          pos += 4;
          for (let i = 0; i < commentCount && pos + 4 <= offset + blockSize; i++) {
            const len = view.getUint32(pos, true);
            pos += 4;
            if (pos + len > offset + blockSize) break;
            const comment = new TextDecoder('utf-8').decode(
              bytes.subarray(pos, pos + len)
            );
            pos += len;
            const eq = comment.indexOf('=');
            if (eq !== -1) {
              const key = comment.slice(0, eq).toUpperCase();
              const val = comment.slice(eq + 1).trim();
              if (key === 'TITLE' && val) result.title = val;
              if (key === 'ARTIST' && val) result.artist = val;
              if (key === 'ALBUM' && val) result.album = val;
              if (key === 'LYRICS' && val) {
                const parsed = parseLrc(val);
                if (parsed.length > 0) result.embeddedLyrics = parsed;
              }
            }
          }
        }
      }
    } else if (blockType === 6 && !result.coverUrl) {
      // PICTURE block
      let pos = offset + 4; // skip picture type
      if (pos + 4 <= offset + blockSize) {
        const mimeLen = view.getUint32(pos, false);
        pos += 4;
        const mime = new TextDecoder('ascii').decode(
          bytes.subarray(pos, pos + mimeLen)
        );
        pos += mimeLen;
        if (pos + 4 <= offset + blockSize) {
          const descLen = view.getUint32(pos, false);
          pos += 4 + descLen + 16; // skip width, height, depth, colors
          if (pos + 4 <= offset + blockSize) {
            const dataLen = view.getUint32(pos, false);
            pos += 4;
            if (pos + dataLen <= offset + blockSize) {
              const imgBytes = bytes.subarray(pos, pos + dataLen);
              const blob = new Blob([imgBytes], {
                type: mime || 'image/jpeg',
              });
              result.coverUrl = URL.createObjectURL(blob);
            }
          }
        }
      }
    }

    offset += blockSize;
    if (isLast) break;
  }

  return result;
}

export async function parseAudioFile(file: File): Promise<ParsedMetadata> {
  const fallback = parseFilenameFallback(file.name);
  const format = inferFormatFromName(file.name);
  const defaultBitrate =
    format === 'FLAC' || format === 'WAV' ? '1411 kbps' : '320 kbps';

  try {
    // Read up to 2.5MB header slice to extract cover art and metadata
    const slice = file.slice(0, Math.min(file.size, 2.5 * 1024 * 1024));
    const buffer = await slice.arrayBuffer();

    const parsed =
      format === 'FLAC' ? parseFlacMetadata(buffer) : parseId3v2(buffer);

    return {
      title: parsed.title || fallback.title,
      artist: parsed.artist || fallback.artist,
      album: parsed.album || 'Local Collection',
      coverUrl: parsed.coverUrl || null,
      embeddedLyrics: parsed.embeddedLyrics || [],
      format,
      bitrate: defaultBitrate,
    };
  } catch {
    return {
      title: fallback.title,
      artist: fallback.artist,
      album: 'Local Collection',
      coverUrl: null,
      embeddedLyrics: [],
      format,
      bitrate: defaultBitrate,
    };
  }
}

export function getAudioDuration(fileUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    const cleanup = () => {
      audio.src = '';
    };
    audio.onloadedmetadata = () => {
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve(dur);
    };
    audio.onerror = () => {
      cleanup();
      resolve(0);
    };
    audio.src = fileUrl;
  });
}

export async function extractDominantColor(
  imageUrl: string | null
): Promise<[number, number, number]> {
  if (!imageUrl) return [212, 212, 216];

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve([212, 212, 216]);
        ctx.drawImage(img, 0, 0, 16, 16);
        const { data } = ctx.getImageData(0, 0, 16, 16);

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let weightSum = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 2;
          // Ignore pitch black and pure white pixels
          if (lum < 28 || lum > 235) continue;
          const sat = max === 0 ? 0 : (max - min) / max;
          const weight = 0.4 + sat * 2.5;
          rSum += r * weight;
          gSum += g * weight;
          bSum += b * weight;
          weightSum += weight;
        }

        if (weightSum === 0) {
          resolve([212, 212, 216]);
          return;
        }

        resolve([
          Math.min(255, Math.round(rSum / weightSum)),
          Math.min(255, Math.round(gSum / weightSum)),
          Math.min(255, Math.round(bSum / weightSum)),
        ]);
      } catch {
        resolve([212, 212, 216]);
      }
    };
    img.onerror = () => resolve([212, 212, 216]);
    img.src = imageUrl;
  });
}
