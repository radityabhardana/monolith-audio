import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioFxSettings, EQBand, RepeatMode, Track } from '../types/music';
import { DEFAULT_AUDIO_FX } from '../utils/storage';

export const DEFAULT_EQ_BANDS: EQBand[] = [
  { freq: 60, label: '60Hz', gain: 0, type: 'lowshelf' },
  { freq: 230, label: '230Hz', gain: 0, type: 'peaking' },
  { freq: 910, label: '910Hz', gain: 0, type: 'peaking' },
  { freq: 3600, label: '3.6kHz', gain: 0, type: 'peaking' },
  { freq: 14000, label: '14kHz', gain: 0, type: 'highshelf' },
];

export const EQ_PRESETS: Record<string, number[]> = {
  FLAT: [0, 0, 0, 0, 0],
  BASS_BOOST: [7, 4.5, 0, 1, 2],
  NOTHING_CRISP: [3, -1, 1.5, 4, 6],
  LOFI_WARM: [4.5, 3, 1, -2.5, -5],
  VOCAL_FOCUS: [-2, 0.5, 4.5, 5, 1.5],
  CLUB_DANCE: [6, 3, -1, 2.5, 4.5],
  LATE_NIGHT: [3.5, 1.5, 0, -1, -2.5],
  RNB_SOUL: [5, 3.5, 1.5, 1, 2.5],
  ACOUSTIC: [1.5, 2, 1, 3, 2],
};

function createReverbImpulse(ctx: AudioContext, duration = 2.1, decay = 2.6): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return impulse;
}

interface UseAudioEngineOptions {
  tracks: Track[];
  allTracks?: Track[];
  currentTrack: Track | null;
  onSelectTrack: (track: Track) => void;
  onTrackStarted?: (track: Track) => void;
  onAutoRadioPick?: (track: Track) => void;
  onPlaybackError?: (track: Track) => void;
  initialVolume: number;
  initialEqGains: number[];
  initialEqPreamp: number;
  initialEqEnabled: boolean;
  initialAudioFx?: AudioFxSettings;
}

export function useAudioEngine({
  tracks,
  allTracks,
  currentTrack,
  onSelectTrack,
  onTrackStarted,
  onAutoRadioPick,
  onPlaybackError,
  initialVolume,
  initialEqGains,
  initialEqPreamp,
  initialEqEnabled,
  initialAudioFx = DEFAULT_AUDIO_FX,
}: UseAudioEngineOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const bassBoostRef = useRef<BiquadFilterNode | null>(null);
  const lowpassRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const preampRef = useRef<GainNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);
  const widthGainsRef = useRef<{
    ll: GainNode;
    rl: GainNode;
    lr: GainNode;
    rr: GainNode;
  } | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const crossfadeGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pendingSeekCleanupRef = useRef<(() => void) | null>(null);
  const fadingOutNearEndRef = useRef(false);
  const recentRadioIdsRef = useRef<string[]>([]);
  const lastPositionSyncRef = useRef(0);

  const clearPendingSeek = useCallback(() => {
    pendingSeekCleanupRef.current?.();
    pendingSeekCleanupRef.current = null;
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(initialVolume);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('all');
  const [queueIds, setQueueIds] = useState<string[]>([]);

  const [eqEnabled, setEqEnabled] = useState(initialEqEnabled);
  const [eqPreamp, setEqPreamp] = useState(initialEqPreamp);
  const [eqBands, setEqBands] = useState<EQBand[]>(() =>
    DEFAULT_EQ_BANDS.map((band, idx) => ({
      ...band,
      gain: initialEqGains[idx] ?? 0,
    }))
  );
  const [audioFx, setAudioFx] = useState<AudioFxSettings>(initialAudioFx);

  // Sleep Timer state
  const [sleepEndTime, setSleepEndTime] = useState<number | null>(null);
  const [sleepAfterTrack, setSleepAfterTrack] = useState(false);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);

  if (!audioRef.current && typeof window !== 'undefined') {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';
    audio.volume = initialVolume;
    audioRef.current = audio;
  }

  const syncFxNodes = useCallback((fx: AudioFxSettings) => {
    if (bassBoostRef.current) {
      bassBoostRef.current.gain.value = fx.bassBoost ?? 0;
    }
    if (lowpassRef.current) {
      lowpassRef.current.frequency.value = Math.max(2000, Math.min(20000, fx.lowpassHz ?? 20000));
    }
    if (compressorRef.current) {
      const comp = compressorRef.current;
      if (fx.compressor) {
        comp.threshold.value = -20;
        comp.knee.value = 12;
        comp.ratio.value = 4;
        comp.attack.value = 0.005;
        comp.release.value = 0.18;
      } else {
        comp.threshold.value = 0;
        comp.knee.value = 0;
        comp.ratio.value = 1;
      }
    }
    if (pannerRef.current) {
      pannerRef.current.pan.value = fx.pan;
    }
    if (widthGainsRef.current) {
      const w = fx.stereoWidth ?? 1;
      const same = (1 + w) / 2;
      const cross = (1 - w) / 2;
      widthGainsRef.current.ll.gain.value = same;
      widthGainsRef.current.rr.gain.value = same;
      widthGainsRef.current.rl.gain.value = cross;
      widthGainsRef.current.lr.gain.value = cross;
    }
    if (dryGainRef.current && wetGainRef.current) {
      dryGainRef.current.gain.value = 1 - fx.reverbMix * 0.45;
      wetGainRef.current.gain.value = fx.reverbMix;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = fx.speed;
      (
        audioRef.current as HTMLAudioElement & { preservesPitch?: boolean }
      ).preservesPitch = fx.preservesPitch;
    }
  }, []);

  const ensureAudioGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!ctxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      ctxRef.current = ctx;

      const source = ctx.createMediaElementSource(audio);
      sourceRef.current = source;

      const filters = DEFAULT_EQ_BANDS.map((band, idx) => {
        const filter = ctx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.Q.value = 1.1;
        filter.gain.value = eqEnabled ? eqBands[idx]?.gain ?? 0 : 0;
        return filter;
      });
      filtersRef.current = filters;

      const bassBoost = ctx.createBiquadFilter();
      bassBoost.type = 'lowshelf';
      bassBoost.frequency.value = 85;
      bassBoostRef.current = bassBoost;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.Q.value = 0.707;
      lowpassRef.current = lowpass;

      const preamp = ctx.createGain();
      preamp.gain.value = eqEnabled ? eqPreamp : 1;
      preampRef.current = preamp;

      const compressor = ctx.createDynamicsCompressor();
      compressorRef.current = compressor;

      const panner = ctx.createStereoPanner();
      pannerRef.current = panner;

      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const ll = ctx.createGain();
      const rl = ctx.createGain();
      const lr = ctx.createGain();
      const rr = ctx.createGain();
      widthGainsRef.current = { ll, rl, lr, rr };

      const convolver = ctx.createConvolver();
      convolver.buffer = createReverbImpulse(ctx);

      const dryGain = ctx.createGain();
      dryGainRef.current = dryGain;

      const wetGain = ctx.createGain();
      wetGainRef.current = wetGain;

      const crossfadeGain = ctx.createGain();
      crossfadeGain.gain.value = 1;
      crossfadeGainRef.current = crossfadeGain;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      analyserRef.current = analyser;

      let prevNode: AudioNode = source;
      for (const filter of filters) {
        prevNode.connect(filter);
        prevNode = filter;
      }
      prevNode.connect(bassBoost);
      bassBoost.connect(lowpass);
      lowpass.connect(preamp);
      preamp.connect(compressor);
      compressor.connect(panner);

      panner.connect(splitter);
      splitter.connect(ll, 0);
      splitter.connect(rl, 1);
      splitter.connect(lr, 0);
      splitter.connect(rr, 1);
      ll.connect(merger, 0, 0);
      rl.connect(merger, 0, 0);
      lr.connect(merger, 0, 1);
      rr.connect(merger, 0, 1);

      // Dry + Reverb parallel mix -> Crossfade stage -> Analyser -> Destination
      merger.connect(dryGain);
      dryGain.connect(crossfadeGain);

      merger.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(crossfadeGain);

      crossfadeGain.connect(analyser);
      analyser.connect(ctx.destination);
      syncFxNodes(audioFx);
    }

    if (ctxRef.current.state === 'suspended') {
      void ctxRef.current.resume();
    }
  }, [eqBands, eqEnabled, eqPreamp, audioFx, syncFxNodes]);

  // Sync EQ & Spatial DSP nodes
  useEffect(() => {
    if (preampRef.current) {
      preampRef.current.gain.value = eqEnabled ? eqPreamp : 1;
    }
    filtersRef.current.forEach((filter, idx) => {
      filter.gain.value = eqEnabled ? eqBands[idx]?.gain ?? 0 : 0;
    });
  }, [eqBands, eqEnabled, eqPreamp]);

  useEffect(() => {
    syncFxNodes(audioFx);
  }, [audioFx, syncFxNodes]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // Sleep timer countdown ticker with smooth 10s fadeout
  useEffect(() => {
    if (!sleepEndTime) {
      setSleepRemainingSec(null);
      if (audioRef.current) {
        audioRef.current.volume = muted ? 0 : volume;
      }
      return;
    }
    const tick = () => {
      const rem = Math.max(0, Math.ceil((sleepEndTime - Date.now()) / 1000));
      setSleepRemainingSec(rem);
      if (audioRef.current && !muted) {
        if (rem <= 10 && rem > 0) {
          audioRef.current.volume = volume * (rem / 10);
        } else if (rem > 10) {
          audioRef.current.volume = volume;
        }
      }
      if (rem <= 0) {
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
        setIsPlaying(false);
        setSleepEndTime(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sleepEndTime, volume, muted]);

  const setSleepTimerMinutes = useCallback((mins: number | 'track' | null) => {
    if (mins === null) {
      setSleepEndTime(null);
      setSleepAfterTrack(false);
      setSleepRemainingSec(null);
      return;
    }
    if (mins === 'track') {
      setSleepEndTime(null);
      setSleepAfterTrack(true);
      return;
    }
    setSleepAfterTrack(false);
    setSleepEndTime(Date.now() + mins * 60 * 1000);
  }, []);

  const autoRadio = Boolean(audioFx.autoRadio);
  const crossfadeSec = Math.max(0, Math.min(10, audioFx.crossfadeSec ?? 0));

  const toggleAutoRadio = useCallback(() => {
    setAudioFx((prev) => ({ ...prev, autoRadio: !prev.autoRadio }));
  }, []);

  const pickAutoRadioTrack = useCallback((): Track | null => {
    const pool = allTracks && allTracks.length > 0 ? allTracks : tracks;
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];

    const recent = new Set(recentRadioIdsRef.current);
    let candidates = pool.filter(
      (t) => t.id !== currentTrack?.id && !recent.has(t.id)
    );
    if (candidates.length === 0) {
      candidates = pool.filter((t) => t.id !== currentTrack?.id);
    }
    if (candidates.length === 0) return pool[0];

    // 35% chance to favor same artist when available
    if (currentTrack && Math.random() < 0.35) {
      const sameArtist = candidates.filter(
        (t) => t.artist.toLowerCase() === currentTrack.artist.toLowerCase()
      );
      if (sameArtist.length > 0) {
        return sameArtist[Math.floor(Math.random() * sameArtist.length)];
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }, [allTracks, tracks, currentTrack]);

  const getNextTrack = useCallback(
    (direction: 1 | -1): Track | null => {
      if (tracks.length === 0) return null;
      if (!currentTrack) return tracks[0];

      if (shuffle && tracks.length > 1) {
        const candidates = tracks.filter((t) => t.id !== currentTrack.id);
        return candidates[Math.floor(Math.random() * candidates.length)];
      }

      const idx = tracks.findIndex((t) => t.id === currentTrack.id);
      if (idx === -1) return tracks[0];

      if (direction === 1 && idx === tracks.length - 1) {
        if (autoRadio) return null;
        if (repeat === 'off') return null;
      }

      const nextIdx = (idx + direction + tracks.length) % tracks.length;
      return tracks[nextIdx];
    },
    [tracks, currentTrack, shuffle, repeat, autoRadio]
  );

  const playTrack = useCallback(
    async (track: Track) => {
      const audio = audioRef.current;
      if (!audio) return;
      ensureAudioGraph();
      clearPendingSeek();

      const ctx = ctxRef.current;
      const cfGain = crossfadeGainRef.current;
      const wasPlayingDifferent =
        !audio.paused && audio.src && audio.src !== track.fileUrl;
      const useNaturalFadeIn = fadingOutNearEndRef.current && crossfadeSec > 0;
      fadingOutNearEndRef.current = false;

      if (ctx && cfGain && wasPlayingDifferent && crossfadeSec > 0 && !useNaturalFadeIn) {
        // Gentle fast dip on manual skip when crossfade is enabled
        const dip = Math.min(0.28, crossfadeSec * 0.15);
        cfGain.gain.cancelScheduledValues(ctx.currentTime);
        cfGain.gain.setValueAtTime(cfGain.gain.value, ctx.currentTime);
        cfGain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + dip);
        await new Promise((r) => window.setTimeout(r, Math.round(dip * 1000)));
      }

      if (audio.src !== track.fileUrl) {
        audio.src = track.fileUrl;
        audio.load();
        setCurrentTime(0);
      }
      audio.playbackRate = audioFx.speed;
      (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch =
        audioFx.preservesPitch;

      recentRadioIdsRef.current = [
        track.id,
        ...recentRadioIdsRef.current.filter((id) => id !== track.id),
      ].slice(0, 18);

      onSelectTrack(track);
      onTrackStarted?.(track);
      try {
        await audio.play();
        setIsPlaying(true);
        if (ctx && cfGain) {
          cfGain.gain.cancelScheduledValues(ctx.currentTime);
          if (crossfadeSec > 0 && (useNaturalFadeIn || wasPlayingDifferent)) {
            const fadeInDur = useNaturalFadeIn
              ? Math.min(crossfadeSec, 4)
              : Math.min(1.2, crossfadeSec * 0.45);
            cfGain.gain.setValueAtTime(0.02, ctx.currentTime);
            cfGain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeInDur);
          } else {
            cfGain.gain.setValueAtTime(1, ctx.currentTime);
          }
        }
      } catch {
        if (ctx && cfGain) {
          cfGain.gain.cancelScheduledValues(ctx.currentTime);
          cfGain.gain.setValueAtTime(1, ctx.currentTime);
        }
        setIsPlaying(false);
        onPlaybackError?.(track);
      }
    },
    [
      ensureAudioGraph,
      clearPendingSeek,
      onSelectTrack,
      onTrackStarted,
      onPlaybackError,
      audioFx.speed,
      audioFx.preservesPitch,
      crossfadeSec,
    ]
  );

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack && tracks.length > 0) {
      await playTrack(tracks[0]);
      return;
    }
    if (!currentTrack) return;

    ensureAudioGraph();
    if (audio.src !== currentTrack.fileUrl) {
      clearPendingSeek();
      audio.src = currentTrack.fileUrl;
      audio.load();
    }

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
        onPlaybackError?.(currentTrack);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [currentTrack, tracks, playTrack, ensureAudioGraph, clearPendingSeek, onPlaybackError]);

  const seek = useCallback((timeSec: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(timeSec)) return;
    clearPendingSeek();
    const clamped = Math.max(0, Math.min(timeSec, audio.duration || timeSec));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, [clearPendingSeek]);

  // restores a track after a page reload without autoplay, at the saved position
  const loadPaused = useCallback((track: Track, timeSec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    clearPendingSeek();
    audio.pause();
    audio.src = track.fileUrl;
    audio.load();
    const onLoadedMetadata = () => {
      pendingSeekCleanupRef.current = null;
      const max = Number.isFinite(audio.duration) ? audio.duration : timeSec;
      audio.currentTime = Math.max(0, Math.min(timeSec, max));
      setCurrentTime(audio.currentTime);
    };
    audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    pendingSeekCleanupRef.current = () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
    setCurrentTime(0);
    setIsPlaying(false);
  }, [clearPendingSeek]);

  useEffect(() => () => clearPendingSeek(), [clearPendingSeek]);

  const nextTrack = useCallback(() => {
    if (queueIds.length > 0) {
      const [nextId, ...rest] = queueIds;
      const pool = allTracks ?? tracks;
      const queued = pool.find((t) => t.id === nextId);
      setQueueIds(rest);
      if (queued) {
        void playTrack(queued);
        return;
      }
    }
    const next = getNextTrack(1);
    if (next) {
      void playTrack(next);
      return;
    }
    if (autoRadio) {
      const radioTrack = pickAutoRadioTrack();
      if (radioTrack) {
        onAutoRadioPick?.(radioTrack);
        void playTrack(radioTrack);
        return;
      }
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, [queueIds, tracks, allTracks, getNextTrack, playTrack, autoRadio, pickAutoRadioTrack, onAutoRadioPick]);

  const prevTrack = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const prev = getNextTrack(-1);
    if (prev) {
      void playTrack(prev);
    }
  }, [getNextTrack, playTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncMediaPosition = () => {
      if (
        'mediaSession' in navigator &&
        typeof navigator.mediaSession.setPositionState === 'function' &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(audio.duration, Math.max(0, audio.currentTime)),
          });
        } catch {
          // Ignore browsers with strict position state validation
        }
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      if (audio.currentTime < 1.2 && fadingOutNearEndRef.current) {
        fadingOutNearEndRef.current = false;
        const ctx = ctxRef.current;
        const cfGain = crossfadeGainRef.current;
        if (ctx && cfGain) {
          cfGain.gain.cancelScheduledValues(ctx.currentTime);
          cfGain.gain.setValueAtTime(1, ctx.currentTime);
        }
      }

      if (
        crossfadeSec > 0 &&
        !fadingOutNearEndRef.current &&
        Number.isFinite(audio.duration) &&
        audio.duration > crossfadeSec + 1.5 &&
        repeat !== 'one' &&
        !sleepAfterTrack
      ) {
        const remaining = audio.duration - audio.currentTime;
        if (remaining > 0.1 && remaining <= crossfadeSec) {
          fadingOutNearEndRef.current = true;
          const ctx = ctxRef.current;
          const cfGain = crossfadeGainRef.current;
          if (ctx && cfGain) {
            cfGain.gain.cancelScheduledValues(ctx.currentTime);
            cfGain.gain.setValueAtTime(cfGain.gain.value, ctx.currentTime);
            cfGain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + remaining);
          }
        }
      }

      const now = Date.now();
      if (now - lastPositionSyncRef.current >= 1000) {
        lastPositionSyncRef.current = now;
        syncMediaPosition();
      }
    };
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      syncMediaPosition();
    };
    const onPlay = () => {
      setIsPlaying(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      syncMediaPosition();
    };
    const onPause = () => {
      setIsPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      syncMediaPosition();
    };
    const onEnded = () => {
      if (sleepAfterTrack) {
        setSleepAfterTrack(false);
        setIsPlaying(false);
        return;
      }
      if (repeat === 'one') {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      nextTrack();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [repeat, sleepAfterTrack, nextTrack, crossfadeSec]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: currentTrack.coverUrl
        ? [{ src: currentTrack.coverUrl, sizes: '512x512', type: 'image/png' }]
        : [{ src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' }],
    });

    navigator.mediaSession.setActionHandler('play', () => void togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => void togglePlay());
    navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
    navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset ?? 10;
      seek(Math.max(0, (audioRef.current?.currentTime ?? 0) - offset));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const offset = details.seekOffset ?? 10;
      seek((audioRef.current?.currentTime ?? 0) + offset);
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
        setCurrentTime(0);
      }
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        seek(details.seekTime);
      }
    });
  }, [currentTrack, togglePlay, prevTrack, nextTrack, seek]);

  // Queue helpers
  const enqueueTrack = useCallback((trackId: string) => {
    setQueueIds((prev) => [...prev, trackId]);
  }, []);

  const playNextInQueue = useCallback((trackId: string) => {
    setQueueIds((prev) => [trackId, ...prev.filter((id) => id !== trackId)]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueueIds((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveQueueItem = useCallback((from: number, to: number) => {
    setQueueIds((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }, []);

  const clearQueue = useCallback(() => setQueueIds([]), []);

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }, []);

  const setEqBandGain = useCallback((index: number, gain: number) => {
    setEqBands((prev) =>
      prev.map((band, i) =>
        i === index ? { ...band, gain: Math.max(-12, Math.min(12, gain)) } : band
      )
    );
  }, []);

  const setEqGains = useCallback((gains: number[]) => {
    setEqBands((prev) =>
      prev.map((band, i) => ({
        ...band,
        gain: Math.max(-12, Math.min(12, gains[i] ?? 0)),
      }))
    );
  }, []);

  const applyEqPreset = useCallback((presetKey: string) => {
    const gains = EQ_PRESETS[presetKey];
    if (!gains) return;
    setEqBands((prev) =>
      prev.map((band, i) => ({ ...band, gain: gains[i] ?? 0 }))
    );
  }, []);

  const getFrequencyData = useCallback((target: Uint8Array<ArrayBuffer>): boolean => {
    const analyser = analyserRef.current;
    if (!analyser) return false;
    analyser.getByteFrequencyData(target);
    return true;
  }, []);

  const getWaveformData = useCallback((target: Uint8Array<ArrayBuffer>): boolean => {
    const analyser = analyserRef.current;
    if (!analyser) return false;
    analyser.getByteTimeDomainData(target);
    return true;
  }, []);

  return {
    isPlaying,
    currentTime,
    duration: duration || currentTrack?.duration || 0,
    volume,
    muted,
    shuffle,
    repeat,
    queueIds,
    eqEnabled,
    eqPreamp,
    eqBands,
    audioFx,
    autoRadio,
    crossfadeSec,
    sleepAfterTrack,
    sleepRemainingSec,
    playTrack,
    togglePlay,
    seek,
    loadPaused,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleAutoRadio,
    nextTrack,
    prevTrack,
    enqueueTrack,
    playNextInQueue,
    removeFromQueue,
    moveQueueItem,
    clearQueue,
    setEqEnabled,
    setEqPreamp,
    setEqBandGain,
    setEqGains,
    applyEqPreset,
    setAudioFx,
    setSleepTimerMinutes,
    getFrequencyData,
    getWaveformData,
  };
}
