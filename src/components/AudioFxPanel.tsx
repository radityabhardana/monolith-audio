import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  Faders,
  Gauge,
  Moon,
  Power,
  Sparkle,
  SpeakerHigh,
} from '@phosphor-icons/react';
import { AudioFxSettings, EQBand } from '../types/music';
import { EQ_PRESETS } from '../hooks/useAudioEngine';
import { formatTime } from '../utils/id3';
import { DEFAULT_AUDIO_FX } from '../utils/storage';

interface AudioFxPanelProps {
  enabled: boolean;
  preamp: number;
  bands: EQBand[];
  audioFx: AudioFxSettings;
  isPlaying: boolean;
  sleepAfterTrack: boolean;
  sleepRemainingSec: number | null;
  accentColor: [number, number, number];
  getFrequencyData: (target: Uint8Array<ArrayBuffer>) => boolean;
  getWaveformData: (target: Uint8Array<ArrayBuffer>) => boolean;
  onToggleEnabled: () => void;
  onChangePreamp: (gain: number) => void;
  onChangeBand: (index: number, gain: number) => void;
  onApplyPreset: (presetKey: string) => void;
  onChangeAudioFx: (next: AudioFxSettings) => void;
  onSetSleepTimer: (mins: number | 'track' | null) => void;
}

const PRESET_LABELS: Record<string, string> = {
  FLAT: 'Flat',
  BASS_BOOST: 'Bass Boost',
  NOTHING_CRISP: 'Crisp Clarity',
  LOFI_WARM: 'Warm Vinyl',
  VOCAL_FOCUS: 'Vocal Focus',
  CLUB_DANCE: 'Club / Dance',
  LATE_NIGHT: 'Late Night',
  RNB_SOUL: 'R&B / Soul',
  ACOUSTIC: 'Acoustic',
};

const SAMPLE_RATE = 48000;

/**
 * Evaluates the magnitude gain (in dB) of an RBJ biquad filter at frequency f.
 */
function biquadMagDb(
  type: BiquadFilterType,
  f0: number,
  q: number,
  gainDb: number,
  freq: number
): number {
  const w0 = (2 * Math.PI * Math.min(f0, SAMPLE_RATE * 0.48)) / SAMPLE_RATE;
  const w = (2 * Math.PI * freq) / SAMPLE_RATE;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * q);
  const A = Math.pow(10, gainDb / 40);

  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = 0;
  let a2 = 0;

  if (type === 'peaking') {
    b0 = 1 + alpha * A;
    b1 = -2 * cosW0;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cosW0;
    a2 = 1 - alpha / A;
  } else if (type === 'lowshelf') {
    const beta = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cosW0 + beta);
    b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
    b2 = A * (A + 1 - (A - 1) * cosW0 - beta);
    a0 = A + 1 + (A - 1) * cosW0 + beta;
    a1 = -2 * (A - 1 + (A + 1) * cosW0);
    a2 = A + 1 + (A - 1) * cosW0 - beta;
  } else if (type === 'highshelf') {
    const beta = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cosW0 + beta);
    b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
    b2 = A * (A + 1 + (A - 1) * cosW0 - beta);
    a0 = A + 1 - (A - 1) * cosW0 + beta;
    a1 = 2 * (A - 1 - (A + 1) * cosW0);
    a2 = A + 1 - (A - 1) * cosW0 - beta;
  } else if (type === 'lowpass') {
    b0 = (1 - cosW0) / 2;
    b1 = 1 - cosW0;
    b2 = (1 - cosW0) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosW0;
    a2 = 1 - alpha;
  }

  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  const numRe = b0 + b1 * cosW + b2 * cos2W;
  const numIm = -(b1 * sinW + b2 * sin2W);
  const denRe = a0 + a1 * cosW + a2 * cos2W;
  const denIm = -(a1 * sinW + a2 * sin2W);

  const magSq = (numRe * numRe + numIm * numIm) / Math.max(1e-12, denRe * denRe + denIm * denIm);
  return 10 * Math.log10(Math.max(1e-9, magSq));
}

export const AudioFxPanel: React.FC<AudioFxPanelProps> = ({
  enabled,
  preamp,
  bands,
  audioFx,
  isPlaying,
  sleepAfterTrack,
  sleepRemainingSec,
  accentColor,
  getFrequencyData,
  getWaveformData,
  onToggleEnabled,
  onChangePreamp,
  onChangeBand,
  onApplyPreset,
  onChangeAudioFx,
  onSetSleepTimer,
}) => {
  const accent = accentColor.join(',');
  const bassBoost = audioFx.bassBoost ?? 0;
  const stereoWidth = audioFx.stereoWidth ?? 1;
  const compressor = Boolean(audioFx.compressor);
  const lowpassHz = audioFx.lowpassHz ?? 20000;
  const crossfadeSec = audioFx.crossfadeSec ?? 0;

  const [customSleepMins, setCustomSleepMins] = useState(25);
  const rmsRef = useRef(0);
  const peakHoldRef = useRef(0);
  const meterTextRef = useRef<HTMLSpanElement | null>(null);
  const meterRmsBarRef = useRef<HTMLDivElement | null>(null);
  const meterPeakRef = useRef<HTMLDivElement | null>(null);
  const curveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isSlowedReverb = audioFx.speed < 0.92 && audioFx.reverbMix >= 0.25 && !audioFx.preservesPitch;
  const isNightcore = audioFx.speed >= 1.18 && !audioFx.preservesPitch && audioFx.reverbMix < 0.15;
  const isLofiTape = lowpassHz <= 9500 && audioFx.reverbMix >= 0.1 && bassBoost >= 2;
  const isWide3D = stereoWidth >= 1.35 && audioFx.reverbMix >= 0.15;
  const isNormalFx =
    Math.abs(audioFx.speed - 1) < 0.01 &&
    audioFx.preservesPitch &&
    audioFx.reverbMix === 0 &&
    audioFx.pan === 0 &&
    bassBoost === 0 &&
    Math.abs(stereoWidth - 1) < 0.02 &&
    !compressor &&
    lowpassHz >= 19500;

  const applyMood = (mood: 'normal' | 'slowed' | 'nightcore' | 'lofi' | 'wide') => {
    const baseReset: AudioFxSettings = {
      ...DEFAULT_AUDIO_FX,
      crossfadeSec: audioFx.crossfadeSec ?? 0,
      autoRadio: audioFx.autoRadio ?? false,
    };
    if (mood === 'normal') {
      onChangeAudioFx(baseReset);
      return;
    }
    if (mood === 'slowed') {
      onChangeAudioFx(
        isSlowedReverb
          ? baseReset
          : { ...baseReset, speed: 0.85, preservesPitch: false, reverbMix: 0.35 }
      );
      return;
    }
    if (mood === 'nightcore') {
      onChangeAudioFx(
        isNightcore
          ? baseReset
          : { ...baseReset, speed: 1.25, preservesPitch: false, reverbMix: 0.05 }
      );
      return;
    }
    if (mood === 'lofi') {
      onChangeAudioFx(
        isLofiTape
          ? baseReset
          : {
              ...baseReset,
              speed: 0.95,
              preservesPitch: true,
              reverbMix: 0.2,
              bassBoost: 3.5,
              lowpassHz: 7500,
            }
      );
      return;
    }
    onChangeAudioFx(
      isWide3D
        ? baseReset
        : { ...baseReset, stereoWidth: 1.5, reverbMix: 0.22 }
    );
  };

  // Live EQ frequency response curve + FFT spectrum canvas & RMS/Peak meter
  useEffect(() => {
    let rafId = 0;
    const freqData = new Uint8Array(128);
    const waveData = new Uint8Array(128);

    const draw = () => {
      const canvas = curveCanvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(240, Math.floor(rect.width));
        const height = Math.max(96, Math.floor(rect.height));
        if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, height);

          const padX = 12;
          const padY = 14;
          const plotW = width - padX * 2;
          const plotH = height - padY * 2;
          const minFreq = 25;
          const maxFreq = 18000;
          const logMin = Math.log10(minFreq);
          const logMax = Math.log10(maxFreq);

          // Horizontal dB grid (+12, 0, -12)
          ctx.lineWidth = 1;
          for (const db of [12, 0, -12]) {
            const y = padY + ((15 - db) / 30) * plotH;
            ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
            ctx.beginPath();
            ctx.moveTo(padX, y);
            ctx.lineTo(width - padX, y);
            ctx.stroke();
          }

          // Vertical band guides
          for (const b of bands) {
            const t = (Math.log10(b.freq) - logMin) / (logMax - logMin);
            const x = padX + t * plotW;
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.beginPath();
            ctx.moveTo(x, padY);
            ctx.lineTo(x, height - padY);
            ctx.stroke();
          }

          // Live FFT Spectrum bars behind the EQ curve
          if (isPlaying && getFrequencyData(freqData)) {
            const barCount = 48;
            const gap = 2;
            const barW = Math.max(2, plotW / barCount - gap);
            for (let i = 0; i < barCount; i++) {
              const t = i / (barCount - 1);
              const f = Math.pow(10, logMin + t * (logMax - logMin));
              const bin = Math.min(
                freqData.length - 1,
                Math.max(0, Math.round((f / (SAMPLE_RATE / 2)) * freqData.length))
              );
              const amp = freqData[bin] / 255;
              const barH = amp * plotH * 0.85;
              const x = padX + t * (plotW - barW);
              const y = height - padY - barH;
              ctx.fillStyle = `rgba(${accent}, ${0.08 + amp * 0.22})`;
              ctx.fillRect(x, y, barW, barH);
            }
          }

          // Combined EQ + Bass Boost + Hi-Cut + Preamp response curve
          const preampDb = enabled ? 20 * Math.log10(Math.max(0.1, preamp)) : 0;
          const samples = 96;
          ctx.beginPath();
          for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const freq = Math.pow(10, logMin + t * (logMax - logMin));
            let totalDb = preampDb;

            if (enabled) {
              for (const b of bands) {
                totalDb += biquadMagDb(b.type, b.freq, 1.1, b.gain, freq);
              }
            }
            if (bassBoost > 0) {
              totalDb += biquadMagDb('lowshelf', 85, 0.707, bassBoost, freq);
            }
            if (lowpassHz < 19500) {
              totalDb += biquadMagDb('lowpass', lowpassHz, 0.707, 0, freq);
            }

            const clampedDb = Math.max(-15, Math.min(15, totalDb));
            const x = padX + t * plotW;
            const y = padY + ((15 - clampedDb) / 30) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          ctx.strokeStyle = enabled ? `rgb(${accent})` : 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Subtle fill under curve to 0 dB line
          const zeroY = padY + (15 / 30) * plotH;
          ctx.lineTo(width - padX, zeroY);
          ctx.lineTo(padX, zeroY);
          ctx.closePath();
          ctx.fillStyle = enabled ? `rgba(${accent}, 0.12)` : 'rgba(255,255,255,0.04)';
          ctx.fill();

          // Band anchor dots
          for (const b of bands) {
            const t = (Math.log10(b.freq) - logMin) / (logMax - logMin);
            const x = padX + t * plotW;
            const bandDb = enabled ? b.gain + preampDb : 0;
            const y = padY + ((15 - Math.max(-15, Math.min(15, bandDb))) / 30) * plotH;
            ctx.beginPath();
            ctx.arc(x, y, 3.2, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
          }
        }
      }

      // Live RMS & Peak Output Meter
      if (isPlaying && getWaveformData(waveData)) {
        let sumSq = 0;
        let maxAbs = 0;
        for (let i = 0; i < waveData.length; i++) {
          const sample = (waveData[i] - 128) / 128;
          sumSq += sample * sample;
          const abs = Math.abs(sample);
          if (abs > maxAbs) maxAbs = abs;
        }
        rmsRef.current = Math.min(1, Math.sqrt(sumSq / waveData.length) * 2.2);
        peakHoldRef.current = Math.min(1, Math.max(maxAbs, peakHoldRef.current * 0.94));
      } else {
        rmsRef.current = rmsRef.current < 0.01 ? 0 : rmsRef.current * 0.8;
        peakHoldRef.current = peakHoldRef.current < 0.01 ? 0 : peakHoldRef.current * 0.85;
      }

      const rmsPct = Math.round(rmsRef.current * 100);
      const peakPct = Math.round(peakHoldRef.current * 100);
      if (meterTextRef.current) {
        meterTextRef.current.textContent = isPlaying
          ? `${rmsPct}% RMS · ${peakPct}% PK`
          : 'Idle';
      }
      if (meterRmsBarRef.current) {
        meterRmsBarRef.current.style.width = `${rmsPct}%`;
      }
      if (meterPeakRef.current) {
        if (peakHoldRef.current > 0.02) {
          meterPeakRef.current.style.display = '';
          meterPeakRef.current.style.left = `${Math.min(99, peakPct)}%`;
        } else {
          meterPeakRef.current.style.display = 'none';
        }
      }

      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(rafId);
  }, [accent, bands, bassBoost, enabled, getFrequencyData, getWaveformData, isPlaying, lowpassHz, preamp]);

  const signalChain = useMemo(
    () => [
      { label: '5-Band EQ', active: enabled && bands.some((b) => Math.abs(b.gain) > 0.05) },
      { label: `Sub +${bassBoost.toFixed(0)}dB`, active: bassBoost > 0 },
      { label: lowpassHz < 19500 ? `Hi-Cut ${(lowpassHz / 1000).toFixed(1)}k` : 'Full Range', active: lowpassHz < 19500 },
      { label: 'Compressor', active: compressor },
      { label: `Width ${Math.round(stereoWidth * 100)}%`, active: Math.abs(stereoWidth - 1) >= 0.05 },
      { label: `Reverb ${Math.round(audioFx.reverbMix * 100)}%`, active: audioFx.reverbMix > 0 },
      { label: `${audioFx.speed.toFixed(2)}×`, active: Math.abs(audioFx.speed - 1) >= 0.02 },
      { label: crossfadeSec > 0 ? `Fade ${crossfadeSec}s` : 'Crossfade', active: crossfadeSec > 0 },
    ],
    [audioFx.reverbMix, audioFx.speed, bands, bassBoost, compressor, crossfadeSec, enabled, lowpassHz, stereoWidth]
  );

  const activeNodeCount = signalChain.filter((s) => s.active).length;

  return (
    <div className="w-full space-y-5 pb-6">
      {/* Header + Presets */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-white">
                Equalizer & Sound FX
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] font-mono text-[10px] text-zinc-300">
                {activeNodeCount} DSP ACTIVE
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              5-band parametric EQ, sub-bass boost, dynamics compressor, M/S stereo width, spatial reverb & sleep timer
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onApplyPreset('FLAT');
                onChangePreamp(1);
                onChangeAudioFx(DEFAULT_AUDIO_FX);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-zinc-300 transition"
            >
              <ArrowCounterClockwise size={14} />
              <span>Reset All</span>
            </button>

            <button
              onClick={onToggleEnabled}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-xs font-semibold transition ${
                enabled
                  ? 'bg-white text-zinc-950 border-white'
                  : 'bg-white/[0.05] text-zinc-400 border-white/[0.1] hover:text-white'
              }`}
            >
              <Power size={14} weight="bold" />
              <span>{enabled ? 'EQ Active' : 'EQ Bypassed'}</span>
            </button>
          </div>
        </div>

        {/* EQ Preset Strip */}
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.keys(EQ_PRESETS).map((key) => {
            const presetGains = EQ_PRESETS[key];
            const isCurrent = bands.every((b, idx) => Math.abs(b.gain - presetGains[idx]) < 0.1);
            return (
              <button
                key={key}
                onClick={() => onApplyPreset(key)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                  isCurrent
                    ? 'bg-white/15 border-white/30 text-white'
                    : 'bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
                }`}
              >
                {PRESET_LABELS[key] || key}
              </button>
            );
          })}
        </div>

        {/* Live Frequency Response Curve + Spectrum Canvas */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-3">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 flex items-center gap-1.5">
              <Faders size={12} style={{ color: `rgb(${accent})` }} />
              Frequency Response & Live Spectrum
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              Double-click any fader to reset · ±12 dB
            </span>
          </div>
          <div className="relative h-28 w-full rounded-xl bg-black/45 border border-white/[0.06] overflow-hidden">
            <canvas ref={curveCanvasRef} className="w-full h-full block" />
            <div className="pointer-events-none absolute inset-x-3 bottom-1 flex justify-between font-mono text-[9px] text-zinc-500">
              <span>25 Hz</span>
              <span>60 Hz</span>
              <span>230 Hz</span>
              <span>910 Hz</span>
              <span>3.6 kHz</span>
              <span>14 kHz</span>
            </div>
            <div className="pointer-events-none absolute left-2 top-1.5 bottom-4 flex flex-col justify-between font-mono text-[9px] text-zinc-500">
              <span>+12</span>
              <span>0 dB</span>
              <span>-12</span>
            </div>
          </div>
        </div>

        {/* 6-Channel Vertical LED Console */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Preamp */}
          <div
            onDoubleClick={() => onChangePreamp(1)}
            title="Double-click to reset Preamp to 100%"
            className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-3.5 flex flex-col items-center justify-between gap-2.5 select-none"
          >
            <span className="font-mono text-[11px] text-zinc-400">Preamp</span>
            <div className="relative h-32 w-full flex items-center justify-center">
              <div className="w-7 h-full rounded-xl bg-black/45 border border-white/[0.07] p-1.5 flex flex-col justify-between">
                {Array.from({ length: 12 }).map((_, segIdx) => {
                  const normalized = (preamp - 0.4) / 1.4;
                  const lit = 11 - segIdx <= Math.round(normalized * 11);
                  return (
                    <div
                      key={segIdx}
                      className="w-full h-1.5 rounded-[2px] transition-colors"
                      style={{
                        backgroundColor: lit
                          ? enabled
                            ? `rgb(${accent})`
                            : 'rgba(255,255,255,0.35)'
                          : 'rgba(255,255,255,0.06)',
                      }}
                    />
                  );
                })}
              </div>
              <input
                type="range"
                min={0.4}
                max={1.8}
                step={0.05}
                value={preamp}
                onChange={(e) => onChangePreamp(parseFloat(e.target.value))}
                aria-label="Preamp Gain"
                className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
              />
            </div>
            <span className="font-mono text-xs text-zinc-200 tabular-nums">
              {(preamp * 100).toFixed(0)}%
            </span>
          </div>

          {bands.map((band, idx) => {
            const normalized = (band.gain + 12) / 24;
            const litCount = Math.round(normalized * 11);
            return (
              <div
                key={band.freq}
                onDoubleClick={() => onChangeBand(idx, 0)}
                title={`Double-click to reset ${band.label} to 0.0 dB`}
                className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-3.5 flex flex-col items-center justify-between gap-2.5 select-none"
              >
                <span className="font-mono text-[11px] text-zinc-400">{band.label}</span>
                <div className="relative h-32 w-full flex items-center justify-center">
                  <div className="w-7 h-full rounded-xl bg-black/45 border border-white/[0.07] p-1.5 flex flex-col justify-between">
                    {Array.from({ length: 12 }).map((_, segIdx) => {
                      const levelIndex = 11 - segIdx;
                      const isLit = levelIndex <= litCount;
                      const isCenter = segIdx === 5 || segIdx === 6;
                      return (
                        <div
                          key={segIdx}
                          className="w-full h-1.5 rounded-[2px] transition-colors"
                          style={{
                            backgroundColor: isLit
                              ? enabled
                                ? levelIndex >= 9
                                  ? `rgb(${accent})`
                                  : '#f4f4f5'
                                : 'rgba(255,255,255,0.35)'
                              : isCenter
                              ? 'rgba(255,255,255,0.16)'
                              : 'rgba(255,255,255,0.06)',
                          }}
                        />
                      );
                    })}
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={band.gain}
                    onChange={(e) => onChangeBand(idx, parseFloat(e.target.value))}
                    aria-label={`${band.label} Gain`}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  />
                </div>
                <span
                  className="font-mono text-xs tabular-nums"
                  style={{
                    color:
                      band.gain !== 0 && enabled
                        ? `rgb(${accent})`
                        : 'rgb(212, 212, 216)',
                  }}
                >
                  {band.gain > 0 ? `+${band.gain.toFixed(1)}` : band.gain.toFixed(1)} dB
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom 3-Column DSP Rack */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Card 1: Spatial & Tape Speed */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkle size={15} style={{ color: `rgb(${accent})` }} />
                <h3 className="text-sm font-semibold text-white">Spatial & Tape Speed</h3>
              </div>
              <button
                onClick={() => applyMood('normal')}
                className={`px-2.5 py-0.5 rounded-full border font-mono text-[10px] transition ${
                  isNormalFx
                    ? 'bg-white/15 border-white/25 text-white'
                    : 'bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white'
                }`}
              >
                Normal
              </button>
            </div>

            {/* Quick Mood Switches */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'slowed' as const, label: 'Slowed + Reverb', active: isSlowedReverb },
                { id: 'nightcore' as const, label: 'Nightcore', active: isNightcore },
                { id: 'lofi' as const, label: 'Lo-Fi Tape', active: isLofiTape },
                { id: 'wide' as const, label: 'Wide 3D', active: isWide3D },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => applyMood(m.id)}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-medium transition ${
                    m.active
                      ? 'bg-white text-zinc-950 border-white font-semibold'
                      : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.09]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Hall Reverb Mix</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {Math.round(audioFx.reverbMix * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.75}
                  step={0.05}
                  value={audioFx.reverbMix}
                  onChange={(e) =>
                    onChangeAudioFx({ ...audioFx, reverbMix: parseFloat(e.target.value) })
                  }
                  className="w-full clean-range"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Playback Speed</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {audioFx.speed.toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.4}
                  step={0.05}
                  value={audioFx.speed}
                  onChange={(e) =>
                    onChangeAudioFx({ ...audioFx, speed: parseFloat(e.target.value) })
                  }
                  className="w-full clean-range"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Stereo Balance</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {audioFx.pan === 0
                      ? 'Center'
                      : audioFx.pan < 0
                      ? `L ${Math.round(Math.abs(audioFx.pan) * 100)}%`
                      : `R ${Math.round(audioFx.pan * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={audioFx.pan}
                  onChange={(e) =>
                    onChangeAudioFx({ ...audioFx, pan: parseFloat(e.target.value) })
                  }
                  className="w-full clean-range"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Stereo Width</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {stereoWidth === 0
                      ? 'Mono'
                      : Math.abs(stereoWidth - 1) < 0.03
                      ? '100% Stereo'
                      : `${Math.round(stereoWidth * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.6}
                  step={0.05}
                  value={stereoWidth}
                  onChange={(e) =>
                    onChangeAudioFx({ ...audioFx, stereoWidth: parseFloat(e.target.value) })
                  }
                  className="w-full clean-range"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
            <span className="text-xs text-zinc-400">Lock Pitch on Speed</span>
            <button
              onClick={() =>
                onChangeAudioFx({
                  ...audioFx,
                  preservesPitch: !audioFx.preservesPitch,
                })
              }
              className={`px-3 py-1 rounded-full border text-xs font-medium transition ${
                audioFx.preservesPitch
                  ? 'bg-white/15 border-white/25 text-white'
                  : 'bg-white/[0.04] border-white/[0.08] text-zinc-400'
              }`}
            >
              {audioFx.preservesPitch ? 'Pitch Locked' : 'Tape Resample'}
            </button>
          </div>
        </div>

        {/* Card 2: Tone, Dynamics & Output Meter */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SpeakerHigh size={15} style={{ color: `rgb(${accent})` }} />
                <h3 className="text-sm font-semibold text-white">Tone & Dynamics</h3>
              </div>
              <span className="font-mono text-[10px] text-zinc-400">85 Hz · 20 kHz</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Sub-Bass Boost (85 Hz)</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    +{bassBoost.toFixed(1)} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={bassBoost}
                  onChange={(e) =>
                    onChangeAudioFx({ ...audioFx, bassBoost: parseFloat(e.target.value) })
                  }
                  className="w-full clean-range"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Tape Warmth (Hi-Cut)</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {lowpassHz >= 19500 ? 'Open' : `${(lowpassHz / 1000).toFixed(1)} kHz`}
                  </span>
                </div>
                <input
                  type="range"
                  min={4000}
                  max={20000}
                  step={500}
                  value={lowpassHz}
                  onChange={(e) =>
                    onChangeAudioFx({ ...audioFx, lowpassHz: parseFloat(e.target.value) })
                  }
                  className="w-full clean-range"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">DJ Crossfade Transition</span>
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {crossfadeSec === 0 ? 'Off' : `${crossfadeSec}s`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={crossfadeSec}
                  onChange={(e) =>
                    onChangeAudioFx({ ...audioFx, crossfadeSec: parseInt(e.target.value, 10) })
                  }
                  className="w-full clean-range"
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-200">Loudness Normalizer</p>
                  <p className="text-[10px] text-zinc-500">
                    Evens out volume swings across tracks
                  </p>
                </div>
                <button
                  onClick={() => onChangeAudioFx({ ...audioFx, compressor: !compressor })}
                  className={`shrink-0 px-3 py-1 rounded-full border text-xs font-semibold transition ${
                    compressor
                      ? 'bg-white text-zinc-950 border-white'
                      : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'
                  }`}
                >
                  {compressor ? 'Active' : 'Off'}
                </button>
              </div>
            </div>
          </div>

          {/* Live Output Level Meter */}
          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <Gauge size={13} />
                Output Level
              </span>
              <span ref={meterTextRef} className="font-mono text-zinc-300 tabular-nums">
                {isPlaying ? '0% RMS · 0% PK' : 'Idle'}
              </span>
            </div>
            <div className="relative h-2.5 w-full rounded-full bg-black/50 border border-white/[0.06] overflow-hidden">
              <div
                ref={meterRmsBarRef}
                className="h-full rounded-full transition-[width] duration-75"
                style={{
                  width: '0%',
                  background: `linear-gradient(90deg, rgba(${accent}, 0.55), rgb(${accent}))`,
                }}
              />
              <div
                ref={meterPeakRef}
                className="absolute top-0 bottom-0 w-0.5 bg-white"
                style={{ left: '0%', display: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Sleep Timer & Signal Chain */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-5 flex flex-col justify-between gap-4 md:col-span-2 xl:col-span-1">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon size={16} style={{ color: `rgb(${accent})` }} />
                <h3 className="text-sm font-semibold text-white">Sleep Timer</h3>
              </div>
              <span
                className={`font-mono text-[11px] px-2.5 py-0.5 rounded-full ${
                  sleepRemainingSec !== null || sleepAfterTrack
                    ? 'bg-white/15 text-white font-semibold'
                    : 'bg-white/[0.04] text-zinc-500'
                }`}
              >
                {sleepAfterTrack
                  ? 'End of Track'
                  : sleepRemainingSec !== null
                  ? formatTime(sleepRemainingSec)
                  : 'Inactive'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[15, 30, 45, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => onSetSleepTimer(m)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] font-mono text-xs text-zinc-200 transition"
                >
                  {m} min
                </button>
              ))}
              <button
                onClick={() => onSetSleepTimer('track')}
                className={`px-2.5 py-1.5 rounded-xl border font-mono text-xs transition ${
                  sleepAfterTrack
                    ? 'bg-white text-zinc-950 border-white font-semibold'
                    : 'bg-white/[0.05] hover:bg-white/[0.12] border-white/[0.08] text-zinc-200'
                }`}
              >
                Track End
              </button>
              <button
                onClick={() => onSetSleepTimer(null)}
                className="px-2.5 py-1.5 rounded-xl bg-black/35 hover:bg-white/[0.08] border border-white/[0.06] font-mono text-xs text-zinc-400 hover:text-white transition"
              >
                Turn Off
              </button>
            </div>

            {/* Custom Minutes */}
            <div className="flex items-center gap-2.5 pt-1">
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={customSleepMins}
                onChange={(e) => setCustomSleepMins(parseInt(e.target.value, 10))}
                aria-label="Custom sleep timer minutes"
                className="flex-1 clean-range"
              />
              <button
                onClick={() => onSetSleepTimer(customSleepMins)}
                className="shrink-0 px-2.5 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] font-mono text-[11px] text-zinc-200 transition"
              >
                Set {customSleepMins}m
              </button>
            </div>
          </div>

          {/* Active DSP Signal Chain */}
          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              Web Audio Signal Chain
            </p>
            <div className="flex flex-wrap gap-1.5">
              {signalChain.map((node) => (
                <span
                  key={node.label}
                  className={`px-2 py-0.5 rounded-md border font-mono text-[10px] transition ${
                    node.active
                      ? 'bg-white/10 text-white border-white/25'
                      : 'bg-black/25 text-zinc-500 border-white/[0.05]'
                  }`}
                  style={
                    node.active
                      ? { borderColor: `rgba(${accent}, 0.5)` }
                      : undefined
                  }
                >
                  {node.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
