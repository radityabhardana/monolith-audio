import { Track } from '../types/music';
import { parseLrc } from './id3';

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

interface SynthPreset {
  bpm: number;
  chords: number[][];
  arpPattern: number[];
  bassRoot: number[];
  waveform: 'warm' | 'bright' | 'sub';
}

function synthesizeTrackUrl(durationSec: number, preset: SynthPreset): string {
  const sampleRate = 22050;
  const totalSamples = Math.floor(durationSec * sampleRate);
  const samples = new Float32Array(totalSamples);
  const beatSec = 60 / preset.bpm;
  const stepSec = beatSec / 2;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const stepIndex = Math.floor(t / stepSec);
    const barIndex = Math.floor(stepIndex / 8) % preset.chords.length;
    const stepInBar = stepIndex % 8;
    const stepLocalT = t - stepIndex * stepSec;

    const chord = preset.chords[barIndex];
    const bassFreq = preset.bassRoot[barIndex];
    const arpFreq = chord[preset.arpPattern[stepInBar] % chord.length] * 2;

    let pad = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = chord[c];
      pad += Math.sin(2 * Math.PI * f * t) * 0.14;
      if (preset.waveform === 'bright') {
        pad += Math.sin(2 * Math.PI * f * 2 * t) * 0.04;
      }
    }

    const bassEnv = Math.exp(-stepLocalT * 4.2);
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.28 * (0.45 + 0.55 * bassEnv);

    const arpEnv = Math.exp(-stepLocalT * 9.5);
    const arpWave =
      preset.waveform === 'sub'
        ? Math.sin(2 * Math.PI * arpFreq * t)
        : Math.sin(2 * Math.PI * arpFreq * t) * 0.7 +
          Math.sin(2 * Math.PI * arpFreq * 2 * t) * 0.3;
    const arp = arpWave * 0.22 * arpEnv;

    const beatLocalT = t % beatSec;
    const kickFreq = 48 + 90 * Math.exp(-beatLocalT * 38);
    const kick =
      Math.sin(2 * Math.PI * kickFreq * beatLocalT) *
      Math.exp(-beatLocalT * 14) *
      0.34;

    const hatPhase = (t + beatSec / 2) % beatSec;
    const hatEnv = Math.exp(-hatPhase * 65);
    const pseudoNoise = Math.sin(i * 12.9898) * 43758.5453;
    const hat = ((pseudoNoise - Math.floor(pseudoNoise)) * 2 - 1) * hatEnv * 0.06;

    const fadeIn = Math.min(1, t / 1.0);
    const fadeOut = Math.min(1, (durationSec - t) / 1.5);

    samples[i] = (pad + bass + arp + kick + hat) * fadeIn * fadeOut * 0.78;
  }

  return URL.createObjectURL(encodeWav(samples, sampleRate));
}

function createGalleryCover(variant: 'cobalt' | 'chrome' | 'amber'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const themes = {
    cobalt: { bg: '#090b12', c1: '#38bdf8', c2: '#818cf8', fg: '#f8fafc' },
    chrome: { bg: '#09090c', c1: '#e4e4e7', c2: '#a1a1aa', fg: '#ffffff' },
    amber: { bg: '#100a06', c1: '#f59e0b', c2: '#fb7185', fg: '#fafaf9' },
  }[variant];

  ctx.fillStyle = themes.bg;
  ctx.fillRect(0, 0, 600, 600);

  // Smooth luminous multi-stop orb
  const g1 = ctx.createRadialGradient(340, 260, 20, 300, 300, 290);
  g1.addColorStop(0, themes.fg);
  g1.addColorStop(0.28, themes.c1);
  g1.addColorStop(0.65, themes.c2 + '55');
  g1.addColorStop(1, 'transparent');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, 600, 600);

  // Sculptural foreground eclipse / monolith cut for strong ASCII & Braille silhouette
  ctx.fillStyle = themes.bg;
  if (variant === 'cobalt') {
    ctx.beginPath();
    ctx.arc(270, 320, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(300, 300, 175, 0.2, Math.PI * 1.65);
    ctx.stroke();
  } else if (variant === 'chrome') {
    ctx.beginPath();
    ctx.roundRect(185, 185, 230, 230, 36);
    ctx.fill();
    ctx.fillStyle = themes.c1;
    ctx.beginPath();
    ctx.arc(300, 300, 56, 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (let i = -3; i <= 3; i++) {
      const w = 22;
      const h = 230 - Math.abs(i) * 38;
      ctx.fillStyle = i === 0 ? themes.fg : 'rgba(255,255,255,0.82)';
      ctx.beginPath();
      ctx.roundRect(300 + i * 38 - w / 2, 300 - h / 2, w, h, 8);
      ctx.fill();
    }
  }

  return canvas.toDataURL('image/png');
}

export function createDemoTracks(): Track[] {
  const track1Lrc = `
[00:00.50] Welcome to Monolith Personal Audio
[00:03.50] Drag any local folder or MP3 / FLAC / WAV files anywhere
[00:07.50] Switch cover art live: Braille, ASCII, Halftone, Dither & 3D Orbit
[00:12.00] Click any lyric line to jump straight to that moment
[00:16.50] Press [P] to pop out a floating status bar over your desktop
[00:21.50] Offline forever — your music stays on your machine
`;

  const track2Lrc = `
[00:00.50] Pure client-side Web Audio API signal chain
[00:04.50] Real-time 5-band parametric equalizer ready
[00:09.00] Drop a matching .lrc file to automatically sync lyrics
[00:14.00] Press [Z] anytime for distraction-free Zen listening
[00:19.00] Built for late night focus sessions
`;

  const track3Lrc = `
[00:00.50] Atkinson 1-bit dithering calibrated to album colors
[00:05.00] Smoked liquid glass adapts softly to every artwork
[00:10.00] Hardware media keys & Picture-in-Picture widget supported
[00:16.00] Import your own collection to begin
`;

  return [
    {
      id: 'demo-1',
      key: 'demo-midnight-glass',
      title: 'Midnight Glass',
      artist: 'Monolith Sessions',
      album: 'Starter Signal I',
      duration: 26,
      fileUrl: synthesizeTrackUrl(26, {
        bpm: 112,
        chords: [
          [220, 261.63, 329.63, 392.0],
          [174.61, 220, 261.63, 349.23],
          [196.0, 246.94, 293.66, 392.0],
          [164.81, 196.0, 246.94, 329.63],
        ],
        arpPattern: [0, 1, 2, 3, 2, 1, 3, 0],
        bassRoot: [55, 43.65, 49, 41.2],
        waveform: 'bright',
      }),
      coverUrl: createGalleryCover('cobalt'),
      accentColor: [56, 189, 248],
      format: 'SYNTH',
      bitrate: '1411 kbps',
      lyrics: parseLrc(track1Lrc),
      liked: true,
      addedAt: Date.now() - 3000,
      isDemo: true,
      fileName: '01_midnight_glass.wav',
    },
    {
      id: 'demo-2',
      key: 'demo-braille-echoes',
      title: 'Braille Echoes',
      artist: 'Kaito & Static',
      album: 'Starter Signal II',
      duration: 24,
      fileUrl: synthesizeTrackUrl(24, {
        bpm: 96,
        chords: [
          [196.0, 233.08, 293.66, 349.23],
          [155.56, 196.0, 233.08, 311.13],
          [174.61, 207.65, 261.63, 349.23],
          [146.83, 174.61, 220.0, 293.66],
        ],
        arpPattern: [0, 2, 1, 3, 0, 3, 2, 1],
        bassRoot: [49, 38.89, 43.65, 36.71],
        waveform: 'warm',
      }),
      coverUrl: createGalleryCover('chrome'),
      accentColor: [228, 228, 231],
      format: 'SYNTH',
      bitrate: '1411 kbps',
      lyrics: parseLrc(track2Lrc),
      liked: false,
      addedAt: Date.now() - 2000,
      isDemo: true,
      fileName: '02_braille_echoes.wav',
    },
    {
      id: 'demo-3',
      key: 'demo-amber-horizon',
      title: 'Amber Horizon',
      artist: 'Sora Studio',
      album: 'Starter Signal III',
      duration: 22,
      fileUrl: synthesizeTrackUrl(22, {
        bpm: 88,
        chords: [
          [174.61, 220.0, 261.63, 329.63],
          [146.83, 174.61, 220.0, 261.63],
          [164.81, 196.0, 246.94, 293.66],
          [130.81, 164.81, 196.0, 246.94],
        ],
        arpPattern: [3, 1, 2, 0, 2, 3, 1, 0],
        bassRoot: [43.65, 36.71, 41.2, 32.7],
        waveform: 'sub',
      }),
      coverUrl: createGalleryCover('amber'),
      accentColor: [245, 158, 11],
      format: 'SYNTH',
      bitrate: '1411 kbps',
      lyrics: parseLrc(track3Lrc),
      liked: false,
      addedAt: Date.now() - 1000,
      isDemo: true,
      fileName: '03_amber_horizon.wav',
    },
  ];
}
