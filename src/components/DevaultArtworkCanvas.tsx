import React, { useEffect, useRef, useState } from 'react';
import { AsciiTunerSettings, CoverRenderMode } from '../types/music';
import {
  drawFallbackArtwork,
  renderStaticAsciiFrame,
  resolvePixelColor,
  TORUS_RAMP,
} from '../utils/asciiEngine';
import { DEFAULT_ASCII_TUNER } from '../utils/storage';

interface DevaultArtworkCanvasProps {
  coverUrl: string | null;
  title: string;
  mode: CoverRenderMode;
  accentColor: [number, number, number];
  isPlaying?: boolean;
  tuner?: AsciiTunerSettings;
  getFrequencyData?: (target: Uint8Array<ArrayBuffer>) => boolean;
  className?: string;
  onClick?: () => void;
  canvasRefOut?: React.RefObject<HTMLCanvasElement | null>;
}

export const DevaultArtworkCanvas: React.FC<DevaultArtworkCanvasProps> = ({
  coverUrl,
  title,
  mode,
  accentColor,
  isPlaying = false,
  tuner = DEFAULT_ASCII_TUNER,
  getFrequencyData,
  className = '',
  onClick,
  canvasRefOut,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = canvasRefOut ?? internalCanvasRef;
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const sampleCacheRef = useRef<{
    w: number;
    h: number;
    data: Uint8ClampedArray;
  } | null>(null);
  const [imageVersion, setImageVersion] = useState(0);

  useEffect(() => {
    sampleCacheRef.current = null;
    if (!coverUrl) {
      loadedImageRef.current = null;
      setImageVersion((v) => v + 1);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) {
        loadedImageRef.current = img;
        sampleCacheRef.current = null;
        setImageVersion((v) => v + 1);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        loadedImageRef.current = null;
        sampleCacheRef.current = null;
        setImageVersion((v) => v + 1);
      }
    };
    img.src = coverUrl;

    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  useEffect(() => {
    if (mode === 'hd') return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const freqData = new Uint8Array(new ArrayBuffer(128));
    let rafId = 0;
    let angleA = 0.7;
    let angleB = 0.4;
    let lastDraw = 0;

    const offscreen = document.createElement('canvas');
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

    const getSampled = (
      sampleW: number,
      sampleH: number,
      phase: number
    ): Uint8ClampedArray | null => {
      const img = loadedImageRef.current;
      if (
        img &&
        sampleCacheRef.current &&
        sampleCacheRef.current.w === sampleW &&
        sampleCacheRef.current.h === sampleH
      ) {
        return sampleCacheRef.current.data;
      }
      if (!offCtx) return null;
      offscreen.width = sampleW;
      offscreen.height = sampleH;
      if (img) {
        const scale = Math.max(sampleW / img.width, sampleH / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        offCtx.drawImage(img, (sampleW - dw) / 2, (sampleH - dh) / 2, dw, dh);
        const data = offCtx.getImageData(0, 0, sampleW, sampleH).data;
        sampleCacheRef.current = { w: sampleW, h: sampleH, data };
        return data;
      }
      drawFallbackArtwork(offCtx, sampleW, sampleH, accentColor, phase);
      return offCtx.getImageData(0, 0, sampleW, sampleH).data;
    };

    const render = (now: number) => {
      const minDelta = isPlaying || mode === 'orbit' ? 20 : !loadedImageRef.current ? 55 : 120;
      if (now - lastDraw < minDelta) {
        rafId = requestAnimationFrame(render);
        return;
      }
      lastDraw = now;

      const size = Math.max(64, container.clientWidth || 200);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pxTarget = Math.floor(size * dpr);

      if (canvas.width !== pxTarget || canvas.height !== pxTarget) {
        canvas.width = pxTarget;
        canvas.height = pxTarget;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let bassEnergy = 0;
      let trebleEnergy = 0;
      if (isPlaying && getFrequencyData?.(freqData)) {
        let bSum = 0;
        let tSum = 0;
        for (let i = 0; i < 8; i++) bSum += freqData[i];
        for (let i = 18; i < 40; i++) tSum += freqData[i];
        bassEnergy = bSum / (8 * 255);
        trebleEnergy = tSum / (22 * 255);
      }
      const boost = bassEnergy * tuner.audioReactive;

      if (mode === 'orbit') {
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, size, size);

        const step = Math.max(7, tuner.cellSize + 1);
        const cols = Math.floor(size / step);
        const rows = Math.floor(size / (step * 1.25));
        const cellW = size / cols;
        const cellH = size / rows;
        const zBuf = new Float32Array(cols * rows);

        angleA += isPlaying ? 0.036 + bassEnergy * 0.045 : 0.012;
        angleB += isPlaying ? 0.02 + trebleEnergy * 0.035 : 0.008;

        ctx.font = `700 ${Math.max(8, Math.floor(cellH * 0.9))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const cosA = Math.cos(angleA);
        const sinA = Math.sin(angleA);
        const cosB = Math.cos(angleB);
        const sinB = Math.sin(angleB);
        const rScale = 1 + boost * 0.22;

        for (let theta = 0; theta < 6.28; theta += 0.09) {
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          for (let phi = 0; phi < 6.28; phi += 0.04) {
            const cosP = Math.cos(phi);
            const sinP = Math.sin(phi);

            const circleX = cosT + 2.15;
            const circleY = sinT * rScale;

            const x3 = circleX * (cosB * cosP + sinA * sinB * sinP) - circleY * cosA * sinB;
            const y3 = circleX * (sinB * cosP - sinA * cosB * sinP) + circleY * cosA * cosB;
            const z3 = 5.4 + cosA * circleX * sinP + circleY * sinA;
            const ooz = 1 / z3;

            const xp = Math.floor(cols / 2 + cols * 0.72 * ooz * x3);
            const yp = Math.floor(rows / 2 - rows * 0.72 * ooz * y3);

            const lum =
              cosP * cosT * sinB -
              cosA * cosT * sinP -
              sinA * sinT +
              cosB * (cosA * sinT - cosT * sinA * sinP);

            if (lum > -0.25 && xp >= 0 && xp < cols && yp >= 0 && yp < rows) {
              const idx = xp + cols * yp;
              if (ooz > zBuf[idx]) {
                zBuf[idx] = ooz;
                const normLum = Math.max(0, Math.min(1, (lum + 0.25) / 1.55));
                const chIdx = Math.min(
                  TORUS_RAMP.length - 1,
                  Math.floor(normLum * TORUS_RAMP.length)
                );
                ctx.fillStyle = resolvePixelColor(
                  accentColor[0],
                  accentColor[1],
                  accentColor[2],
                  normLum,
                  accentColor,
                  tuner.colorMode
                );
                ctx.fillText(
                  TORUS_RAMP[chIdx],
                  (xp + 0.5) * cellW,
                  (yp + 0.5) * cellH
                );
              }
            }
          }
        }
      } else {
        const cell = Math.max(5, tuner.cellSize);
        let sampleW = 36;
        let sampleH = 36;
        if (mode === 'braille') {
          const cols = Math.max(18, Math.floor(size / cell));
          const rows = Math.max(12, Math.floor(size / (cell * 1.45)));
          sampleW = cols * 2;
          sampleH = rows * 4;
        } else if (mode === 'ascii') {
          sampleW = Math.max(20, Math.floor(size / cell));
          sampleH = Math.max(14, Math.floor(size / (cell * 1.35)));
        } else if (mode === 'halftone') {
          sampleW = Math.max(18, Math.floor(size / (cell * 1.2)));
          sampleH = Math.max(18, Math.floor(size / (cell * 1.2)));
        } else {
          const px = Math.max(2, Math.floor(cell * 0.45));
          sampleW = Math.max(36, Math.floor(size / px));
          sampleH = Math.max(36, Math.floor(size / px));
        }

        const data = getSampled(sampleW, sampleH, now * 0.0014);
        if (data) {
          renderStaticAsciiFrame(
            ctx,
            data,
            sampleW,
            sampleH,
            size,
            size,
            mode,
            accentColor,
            tuner,
            boost
          );
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [mode, isPlaying, accentColor, tuner, imageVersion, getFrequencyData, canvasRef]);

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      title={onClick ? 'Click to cycle artwork render style' : undefined}
      className={`relative aspect-square overflow-hidden bg-[#09090b] border border-white/10 shadow-[0_24px_56px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] select-none ${
        onClick ? 'cursor-pointer group' : ''
      } ${className}`}
    >
      {mode === 'hd' ? (
        coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-950 font-mono text-xs text-zinc-500">
            NO ART
          </div>
        )
      ) : (
        <canvas ref={canvasRef} className="w-full h-full block" />
      )}

      {tuner.scanlines && mode !== 'hd' && (
        <div className="scanline-overlay absolute inset-0 opacity-40" />
      )}
    </div>
  );
};
