import React, { useEffect, useRef } from 'react';
import { VisualizerMode } from '../types/music';

interface AsciiVisualizerProps {
  mode: VisualizerMode;
  isPlaying: boolean;
  accentColor: [number, number, number];
  getFrequencyData: (target: Uint8Array<ArrayBuffer>) => boolean;
  getWaveformData: (target: Uint8Array<ArrayBuffer>) => boolean;
  height?: number;
  className?: string;
}

const ASCII_BLOCKS = [' ', '░', '▒', '▓', '█'];
const FREQ_LABELS = ['60', '120', '250', '500', '1K', '2K', '4K', '8K', '16K'];

export const AsciiVisualizer: React.FC<AsciiVisualizerProps> = ({
  mode,
  isPlaying,
  accentColor,
  getFrequencyData,
  getWaveformData,
  height = 176,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const peaksRef = useRef<number[]>(new Array(36).fill(0));
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const freqData = new Uint8Array(new ArrayBuffer(128));
    const waveData = new Uint8Array(new ArrayBuffer(128));
    let rafId = 0;

    const render = () => {
      const width = container.clientWidth || 480;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      phaseRef.current += isPlaying ? 0.045 : 0.015;
      const hasFreq = isPlaying && getFrequencyData(freqData);
      const hasWave = isPlaying && getWaveformData(waveData);
      const [ar, ag, ab] = accentColor;

      // Subtle horizontal grid baseline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let y = 24; y < height - 20; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (mode === 'ascii-bars') {
        const showLabels = height >= 80;
        const footerPad = showLabels ? 16 : 6;
        const cols = Math.min(32, Math.max(14, Math.floor(width / 15)));
        const rows = Math.max(4, Math.floor((height - footerPad) / 11));
        const colW = width / cols;
        const rowH = (height - footerPad) / rows;
        const fontSize = Math.max(8, Math.min(11, Math.floor(rowH * 0.86)));

        ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let c = 0; c < cols; c++) {
          let level = 0;
          if (hasFreq) {
            const bin = Math.min(63, Math.floor((c / cols) * 52));
            level = freqData[bin] / 255;
          } else {
            level =
              0.2 +
              0.14 * Math.sin(phaseRef.current + c * 0.34) +
              0.09 * Math.cos(phaseRef.current * 1.5 - c * 0.22);
          }

          const activeRows = Math.max(0, Math.round(level * rows));
          if (activeRows > peaksRef.current[c]) {
            peaksRef.current[c] = activeRows;
          } else {
            peaksRef.current[c] = Math.max(0, peaksRef.current[c] - 0.14);
          }

          const x = (c + 0.5) * colW;
          for (let r = 0; r < rows; r++) {
            const y = height - footerPad - (r + 0.5) * rowH;
            if (r < activeRows) {
              const ratio = r / rows;
              if (ratio > 0.78) {
                ctx.fillStyle = `rgb(${ar}, ${ag}, ${ab})`;
                ctx.fillText('█', x, y);
              } else if (ratio > 0.45) {
                ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.82)`;
                ctx.fillText('▓', x, y);
              } else {
                ctx.fillStyle = 'rgba(244, 244, 245, 0.72)';
                ctx.fillText(ASCII_BLOCKS[3], x, y);
              }
            } else {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
              ctx.fillText('·', x, y);
            }
          }

          const peakRow = Math.floor(peaksRef.current[c]);
          if (peakRow > 0 && peakRow < rows) {
            const py = height - footerPad - (peakRow + 0.5) * rowH;
            ctx.fillStyle = '#ffffff';
            ctx.fillText('━', x, py);
          }
        }

        if (showLabels) {
          ctx.fillStyle = 'rgba(161, 161, 170, 0.65)';
          ctx.font = '500 8px "JetBrains Mono", monospace';
          FREQ_LABELS.forEach((lbl, idx) => {
            const lx = ((idx + 0.5) / FREQ_LABELS.length) * width;
            ctx.fillText(lbl, lx, height - 5);
          });
        }
      } else if (mode === 'dot-matrix') {
        const cols = Math.min(30, Math.max(14, Math.floor(width / 14)));
        const rows = Math.max(5, Math.floor((height - 10) / 11));
        const colW = width / cols;
        const rowH = (height - 8) / rows;
        const dotR = Math.max(1.5, Math.min(colW, rowH) * 0.28);

        for (let c = 0; c < cols; c++) {
          let level = 0;
          if (hasFreq) {
            const bin = Math.min(63, Math.floor((c / cols) * 52));
            level = freqData[bin] / 255;
          } else {
            level = 0.1 + 0.08 * Math.sin(phaseRef.current + c * 0.4);
          }

          const lit = Math.round(level * rows);
          for (let r = 0; r < rows; r++) {
            const cx = (c + 0.5) * colW;
            const cy = height - 6 - (r + 0.5) * rowH;
            ctx.beginPath();
            ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
            if (r < lit) {
              const hot = r >= rows * 0.72;
              ctx.fillStyle = hot
                ? `rgb(${ar}, ${ag}, ${ab})`
                : `rgba(255, 255, 255, ${0.45 + (r / rows) * 0.55})`;
            } else {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
            }
            ctx.fill();
          }
        }
      } else {
        // Oscilloscope mode with ASCII telemetry header
        const midY = height / 2;
        const points = waveData.length;
        let peak = 0;

        ctx.beginPath();
        for (let i = 0; i < points; i++) {
          const x = (i / (points - 1)) * width;
          const v = hasWave
            ? (waveData[i] - 128) / 128
            : Math.sin(phaseRef.current * 2 + i * 0.14) * 0.12;
          peak = Math.max(peak, Math.abs(v));
          const y = midY + v * (height * 0.36);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgb(${ar}, ${ag}, ${ab})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Secondary ghost trace
        ctx.beginPath();
        for (let i = 0; i < points; i += 2) {
          const x = (i / (points - 1)) * width;
          const v = hasWave
            ? (waveData[i] - 128) / 128
            : Math.sin(phaseRef.current * 2 + i * 0.14) * 0.12;
          const y = midY - v * (height * 0.24);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Telemetry readout
        const db = peak > 0.001 ? Math.max(-60, Math.round(20 * Math.log10(peak))) : -60;
        ctx.fillStyle = 'rgba(212, 212, 216, 0.75)';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
          `OSC_CH0 // PEAK: ${db} dB // ${isPlaying ? 'ACTIVE' : 'STANDBY'}`,
          8,
          14
        );
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [mode, isPlaying, accentColor, getFrequencyData, getWaveformData, height]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} style={{ height: `${height}px` }} className="w-full block" />
    </div>
  );
};
