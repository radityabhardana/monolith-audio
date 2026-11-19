export interface WordToken {
  time: number;
  text: string;
}

export interface LyricLine {
  time: number;
  text: string;
  words?: WordToken[];
}

export type AudioFormat = 'MP3' | 'FLAC' | 'WAV' | 'OGG' | 'M4A' | 'AAC' | 'OPUS' | 'SYNTH';

export interface Track {
  id: string;
  key: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileUrl: string;
  coverUrl: string | null;
  accentColor: [number, number, number];
  format: AudioFormat;
  bitrate: string;
  lyrics: LyricLine[];
  liked: boolean;
  addedAt: number;
  isDemo?: boolean;
  fileName?: string;
}

export interface TrackMetadataOverride {
  title: string;
  artist: string;
  album: string;
}

export interface HistoryEntry {
  key: string;
  playedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackKeys: string[];
  createdAt: number;
  // YouTube Music playlist this playlist syncs from (one link per playlist)
  source?: string;
  /** custom banner artwork, stored as a data URL */
  coverUrl?: string;
}

export interface EQBand {
  freq: number;
  label: string;
  gain: number;
  type: BiquadFilterType;
}

export interface AudioFxSettings {
  speed: number;
  preservesPitch: boolean;
  reverbMix: number;
  pan: number;
  bassBoost?: number;
  stereoWidth?: number;
  compressor?: boolean;
  lowpassHz?: number;
}

export type VisualizerMode = 'ascii-bars' | 'dot-matrix' | 'oscilloscope';
export type CoverRenderMode = 'hd' | 'braille' | 'ascii' | 'halftone' | 'dither' | 'orbit';
export type AsciiColorMode = 'tint' | 'mono' | 'matrix' | 'amber';
export type RepeatMode = 'off' | 'all' | 'one';
export type NavSection = 'library' | 'albums' | 'artists' | 'liked' | 'history' | 'playlist' | 'fx';
export type RightDrawerTab = 'lyrics' | 'queue' | 'top';
export type SortMode = 'recent' | 'title' | 'artist' | 'duration' | 'plays';

export interface AsciiTunerSettings {
  cellSize: number;
  contrast: number;
  colorMode: AsciiColorMode;
  audioReactive: number;
  invert: boolean;
  scanlines: boolean;
}

export interface UserPreferences {
  likedKeys: string[];
  hiddenDemoKeys: string[];
  playlists: Playlist[];
  customLyrics: Record<string, LyricLine[]>;
  lyricOffsets: Record<string, number>;
  metadataOverrides: Record<string, TrackMetadataOverride>;
  history: HistoryEntry[];
  playCounts: Record<string, number>;
  eqGains: number[];
  eqPreamp: number;
  eqEnabled: boolean;
  audioFx: AudioFxSettings;
  visualizerMode: VisualizerMode;
  coverMode: CoverRenderMode;
  asciiTuner: AsciiTunerSettings;
  volume: number;
  asciiOverlayEnabled: boolean;
}
