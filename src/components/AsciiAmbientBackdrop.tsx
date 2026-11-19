import React, { useEffect, useRef } from 'react';

interface AsciiAmbientBackdropProps {
  accentColor: [number, number, number];
  isPlaying: boolean;
  getFrequencyData: (target: Uint8Array<ArrayBuffer>) => boolean;
}

const SUBTLE_GLYPHS = [' ', ' ', '·', ':', '+', '░'];

export const AsciiAmbientBackdrop: React.FC<AsciiAmbientBackdropProps> = ({
  accentColor,
  isPlaying,
  getFrequencyData,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const freqData = new Uint8Array(new ArrayBuffer(128));
    let rafId = 0;
    let time = 0;
    let lastFrame = 0;

    const render = (now: number) => {
      if (now - lastFrame < 50) {
        rafId = requestAnimationFrame(render);
        return;
      }
      lastFrame = now;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      let bass = 0;
      if (isPlaying && getFrequencyData(freqData)) {
        let sum = 0;
        for (let i = 0; i < 8; i++) sum += freqData[i];
        bass = sum / (8 * 255);
      }

      time += isPlaying ? 0.03 + bass * 0.04 : 0.01;

      const cellW = 28;
      const cellH = 28;
      const cols = Math.ceil(width / cellW);
      const rows = Math.ceil(height / cellH);
      const [ar, ag, ab] = accentColor;

      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let r = 0; r < rows; r++) {
        const ny = r / rows;
        for (let c = 0; c < cols; c++) {
          const nx = c / cols;
          const w = Math.sin(nx * 4.5 + time) * Math.cos(ny * 3.8 - time * 0.7);
          const intensity = Math.max(0, Math.min(1, w * 0.5 + 0.5 + bass * 0.15));

          const glyphIdx = Math.floor(intensity * SUBTLE_GLYPHS.length);
          const ch = SUBTLE_GLYPHS[Math.min(SUBTLE_GLYPHS.length - 1, glyphIdx)];
          if (ch === ' ') continue;

          const alpha = 0.03 + intensity * 0.06;
          ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha.toFixed(3)})`;
          ctx.fillText(ch, (c + 0.5) * cellW, (r + 0.5) * cellH);
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [accentColor, isPlaying, getFrequencyData]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 w-full h-full z-0"
    />
  );
};
