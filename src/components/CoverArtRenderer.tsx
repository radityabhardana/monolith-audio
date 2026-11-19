import React, { useEffect, useRef } from 'react';
import { AsciiTunerSettings, CoverRenderMode } from '../types/music';
import {
  drawFallbackArtwork,
  renderStaticAsciiFrame,
  TORUS_RAMP,
} from '../utils/asciiEngine';
import { DEFAULT_ASCII_TUNER } from '../utils/storage';

interface CoverArtRendererProps {
  coverUrl: string | null;
  title: string;
  mode: CoverRenderMode;
  accentColor: [number, number, number];
  size?: number;
  className?: string;
  tuner?: AsciiTunerSettings;
  onCycleMode?: () => void;
}

export const CoverArtRenderer: React.FC<CoverArtRendererProps> = ({
  coverUrl,
  title,
  mode,
  accentColor,
  size = 160,
  className = '',
  tuner = DEFAULT_ASCII_TUNER,
  onCycleMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (mode === 'hd') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const drawOrbitThumbnail = () => {
      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, size, size);
      const cols = Math.max(14, Math.floor(size / 6));
      const rows = Math.max(10, Math.floor(size / 8));
      const zBuf = new Float32Array(cols * rows);
      const cellW = size / cols;
      const cellH = size / rows;
      ctx.font = `700 ${Math.max(6, Math.floor(cellH * 0.9))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const A = 0.7;
      const B = 0.45;
      for (let theta = 0; theta < 6.28; theta += 0.18) {
        for (let phi = 0; phi < 6.28; phi += 0.09) {
          const sinP = Math.sin(phi);
          const cosP = Math.cos(phi);
          const sinT = Math.sin(theta);
          const cosT = Math.cos(theta);
          const h = cosT + 2;
          const D = 1 / (sinP * h * Math.sin(A) + sinT * Math.cos(A) + 5);
          const t = sinP * h * Math.cos(A) - sinT * Math.sin(A);
          const x = Math.floor(cols / 2 + cols * 0.36 * D * (cosP * h * Math.cos(B) - t * Math.sin(B)));
          const y = Math.floor(rows / 2 + rows * 0.38 * D * (cosP * h * Math.sin(B) + t * Math.cos(B)));
          const lumIdx = Math.floor(
            8 * ((sinT * Math.sin(A) - sinP * cosT * Math.cos(A)) * Math.cos(B) - sinP * cosT * Math.sin(A) - sinT * Math.cos(A) - cosP * cosT * Math.sin(B))
          );
          if (x >= 0 && x < cols && y >= 0 && y < rows) {
            const o = x + cols * y;
            if (D > zBuf[o]) {
              zBuf[o] = D;
              const ch = TORUS_RAMP[Math.max(0, Math.min(TORUS_RAMP.length - 1, lumIdx))];
              ctx.fillStyle = lumIdx > 5 ? `rgb(${accentColor.join(',')})` : '#e4e4e7';
              ctx.fillText(ch, (x + 0.5) * cellW, (y + 0.5) * cellH);
            }
          }
        }
      }
    };

    const drawFromSource = (img: HTMLImageElement | null) => {
      if (mode === 'orbit') {
        drawOrbitThumbnail();
        return;
      }

      const sampleCanvas = document.createElement('canvas');
      const sCtx = sampleCanvas.getContext('2d');
      if (!sCtx) return;

      let sampleW = 24;
      let sampleH = 24;
      if (mode === 'braille') {
        const cols = Math.max(10, Math.floor(size / 8));
        const rows = Math.max(8, Math.floor(size / 11));
        sampleW = cols * 2;
        sampleH = rows * 4;
      } else if (mode === 'ascii') {
        sampleW = Math.max(14, Math.floor(size / 6));
        sampleH = Math.max(12, Math.floor(size / 8));
      } else if (mode === 'halftone') {
        sampleW = Math.max(12, Math.floor(size / 7));
        sampleH = Math.max(12, Math.floor(size / 7));
      } else {
        const px = size >= 120 ? 3 : 2;
        sampleW = Math.max(16, Math.floor(size / px));
        sampleH = Math.max(16, Math.floor(size / px));
      }

      sampleCanvas.width = sampleW;
      sampleCanvas.height = sampleH;
      if (img) {
        sCtx.drawImage(img, 0, 0, sampleW, sampleH);
      } else {
        drawFallbackArtwork(sCtx, sampleW, sampleH, accentColor);
      }

      const data = sCtx.getImageData(0, 0, sampleW, sampleH).data;
      renderStaticAsciiFrame(ctx, data, sampleW, sampleH, size, size, mode, accentColor, tuner);
    };

    if (!coverUrl) {
      drawFromSource(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) drawFromSource(img);
    };
    img.onerror = () => {
      if (!cancelled) drawFromSource(null);
    };
    img.src = coverUrl;

    return () => {
      cancelled = true;
    };
  }, [coverUrl, mode, accentColor, size, tuner]);

  return (
    <div
      onClick={onCycleMode}
      title={onCycleMode ? 'Click to cycle Devault ASCII Engine preset' : undefined}
      className={`relative overflow-hidden bg-[#07070a] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] select-none ${
        onCycleMode ? 'cursor-pointer group' : ''
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
          <div className="w-full h-full flex items-center justify-center bg-zinc-950 font-mono text-[9px] text-zinc-500">
            RAW
          </div>
        )
      ) : (
        <canvas ref={canvasRef} className="w-full h-full block" />
      )}
    </div>
  );
};
