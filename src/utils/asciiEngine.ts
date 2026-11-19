import { AsciiColorMode, AsciiTunerSettings } from '../types/music';

export const ASCII_RAMP = ' .:-=+*#%@';
export const TORUS_RAMP = '.,-~:;=!*#$@';

// Unicode Braille bitmask in 2x4 subpixel cell
export const BRAILLE_DOT_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

export function resolvePixelColor(
  r: number,
  g: number,
  b: number,
  lum: number,
  accent: [number, number, number],
  colorMode: AsciiColorMode
): string {
  if (colorMode === 'mono') {
    const v = Math.min(255, Math.round(95 + lum * 160));
    return `rgb(${v},${v},${v})`;
  }
  if (colorMode === 'matrix') {
    const gVal = Math.min(255, Math.round(75 + lum * 180));
    const rVal = Math.round(lum * 50);
    return `rgb(${rVal},${gVal},${Math.round(rVal * 1.1)})`;
  }
  if (colorMode === 'amber') {
    const rVal = Math.min(255, Math.round(120 + lum * 135));
    const gVal = Math.min(205, Math.round(50 + lum * 135));
    return `rgb(${rVal},${gVal},24)`;
  }
  const mixR = Math.min(255, Math.round(r * 0.78 + accent[0] * 0.22 + 24));
  const mixG = Math.min(255, Math.round(g * 0.78 + accent[1] * 0.22 + 24));
  const mixB = Math.min(255, Math.round(b * 0.78 + accent[2] * 0.22 + 24));
  return `rgb(${mixR},${mixG},${mixB})`;
}

export function drawFallbackArtwork(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accent: [number, number, number],
  phase = 0
): void {
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.44;

  const grad = ctx.createRadialGradient(cx, cy, maxR * 0.08, cx, cy, maxR * 1.15);
  grad.addColorStop(0, `rgba(${accent.join(',')}, 0.92)`);
  grad.addColorStop(0.55, `rgba(${accent.join(',')}, 0.34)`);
  grad.addColorStop(1, 'rgba(9,9,11,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.68)';
  ctx.lineWidth = Math.max(1, w * 0.014);
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * (i * 0.28), phase + i, phase + i + Math.PI * 1.45);
    ctx.stroke();
  }
}

export function applyContrast(lum: number, contrast: number, invert: boolean): number {
  const adjusted = Math.max(0, Math.min(1, (lum - 0.5) * contrast + 0.5));
  return invert ? 1 - adjusted : adjusted;
}

export function renderStaticAsciiFrame(
  ctx: CanvasRenderingContext2D,
  sourceData: Uint8ClampedArray,
  sampleW: number,
  sampleH: number,
  outW: number,
  outH: number,
  mode: 'braille' | 'ascii' | 'halftone' | 'dither',
  accent: [number, number, number],
  tuner: AsciiTunerSettings,
  energyBoost = 0
): void {
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, outW, outH);

  if (mode === 'braille') {
    const cols = Math.floor(sampleW / 2);
    const rows = Math.floor(sampleH / 4);
    const cellW = outW / cols;
    const cellH = outH / rows;
    ctx.font = `600 ${Math.max(8, Math.floor(cellH * 0.96))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const threshold = Math.max(0.16, Math.min(0.68, 0.38 - energyBoost * 0.14));

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        let mask = 0;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let lumSum = 0;

        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            const px = cx * 2 + sx;
            const py = cy * 4 + sy;
            const idx = (py * sampleW + px) * 4;
            const r = sourceData[idx];
            const g = sourceData[idx + 1];
            const b = sourceData[idx + 2];
            const rawLum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const lum = applyContrast(rawLum, tuner.contrast, tuner.invert);
            if (lum > threshold) {
              mask |= BRAILLE_DOT_BITS[sy][sx];
            }
            rSum += r;
            gSum += g;
            bSum += b;
            lumSum += lum;
          }
        }

        if (mask === 0) continue;
        const avgLum = lumSum / 8;
        ctx.fillStyle = resolvePixelColor(
          rSum / 8,
          gSum / 8,
          bSum / 8,
          Math.min(1, avgLum + energyBoost * 0.22),
          accent,
          tuner.colorMode
        );
        ctx.fillText(
          String.fromCharCode(0x2800 + mask),
          (cx + 0.5) * cellW,
          (cy + 0.5) * cellH
        );
      }
    }
    return;
  }

  if (mode === 'ascii') {
    const cellW = outW / sampleW;
    const cellH = outH / sampleH;
    ctx.font = `700 ${Math.max(8, Math.floor(cellH * 0.94))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        const idx = (y * sampleW + x) * 4;
        const r = sourceData[idx];
        const g = sourceData[idx + 1];
        const b = sourceData[idx + 2];
        const rawLum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const lum = Math.min(
          1,
          applyContrast(rawLum, tuner.contrast, tuner.invert) + energyBoost * 0.18
        );
        const charIdx = Math.min(ASCII_RAMP.length - 1, Math.floor(lum * ASCII_RAMP.length));
        const ch = ASCII_RAMP[charIdx];
        if (ch === ' ') continue;

        ctx.fillStyle = resolvePixelColor(r, g, b, lum, accent, tuner.colorMode);
        ctx.fillText(ch, (x + 0.5) * cellW, (y + 0.5) * cellH);
      }
    }
    return;
  }

  if (mode === 'halftone') {
    const cellW = outW / sampleW;
    const cellH = outH / sampleH;
    const maxR = Math.min(cellW, cellH) * (0.48 + energyBoost * 0.12);

    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        const idx = (y * sampleW + x) * 4;
        const r = sourceData[idx];
        const g = sourceData[idx + 1];
        const b = sourceData[idx + 2];
        const rawLum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const lum = applyContrast(rawLum, tuner.contrast, tuner.invert);
        const radius = lum * maxR;
        if (radius < 0.65) continue;

        ctx.fillStyle = resolvePixelColor(r, g, b, lum, accent, tuner.colorMode);
        ctx.beginPath();
        ctx.arc((x + 0.5) * cellW, (y + 0.5) * cellH, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  // 'dither' — Atkinson Error-Diffusion Dithering (Devault / Classic Mac crisp 1-bit)
  const cellW = outW / sampleW;
  const cellH = outH / sampleH;
  const gray = new Float32Array(sampleW * sampleH);

  for (let i = 0; i < sampleW * sampleH; i++) {
    const idx = i * 4;
    const rawLum =
      (0.299 * sourceData[idx] +
        0.587 * sourceData[idx + 1] +
        0.114 * sourceData[idx + 2]) /
      255;
    gray[i] = Math.min(
      1,
      applyContrast(rawLum, tuner.contrast, tuner.invert) + energyBoost * 0.1
    );
  }

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const i = y * sampleW + x;
      const oldVal = gray[i];
      const newVal = oldVal >= 0.48 ? 1 : 0;
      const err = (oldVal - newVal) / 8;

      if (x + 1 < sampleW) gray[i + 1] += err;
      if (x + 2 < sampleW) gray[i + 2] += err;
      if (y + 1 < sampleH) {
        if (x - 1 >= 0) gray[i + sampleW - 1] += err;
        gray[i + sampleW] += err;
        if (x + 1 < sampleW) gray[i + sampleW + 1] += err;
      }
      if (y + 2 < sampleH) {
        gray[i + sampleW * 2] += err;
      }

      if (newVal === 1) {
        const idx = i * 4;
        ctx.fillStyle = resolvePixelColor(
          sourceData[idx],
          sourceData[idx + 1],
          sourceData[idx + 2],
          oldVal,
          accent,
          tuner.colorMode
        );
        ctx.fillRect(x * cellW, y * cellH, Math.max(1, cellW - 0.3), Math.max(1, cellH - 0.3));
      }
    }
  }
}
