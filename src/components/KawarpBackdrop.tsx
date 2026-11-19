import React, { useEffect } from 'react';
import { Kawarp, useKawarp } from '@kawarp/react';
import { AsciiAmbientBackdrop } from './AsciiAmbientBackdrop';

interface KawarpBackdropProps {
  coverUrl: string | null;
  accentColor: [number, number, number];
  isPlaying: boolean;
  asciiOverlayEnabled: boolean;
  getFrequencyData: (target: Uint8Array<ArrayBuffer>) => boolean;
}

export const KawarpBackdrop: React.FC<KawarpBackdropProps> = ({
  coverUrl,
  accentColor,
  isPlaying,
  asciiOverlayEnabled,
  getFrequencyData,
}) => {
  const { ref, loadGradient } = useKawarp();

  useEffect(() => {
    if (!coverUrl) {
      // Sculptural obsidian-to-pearl ribbons so frosted glass has visible depth & refraction
      loadGradient(['#040406', '#8c8c9c', '#141419', '#d4d4d8', '#07070a'], 132);
    }
  }, [coverUrl, loadGradient]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#060608]">
      <Kawarp
        ref={ref}
        src={coverUrl ?? undefined}
        warpIntensity={1.08}
        blurPasses={3}
        animationSpeed={isPlaying ? 0.56 : 0.24}
        transitionDuration={900}
        saturation={0.55}
        tintColor={[0.04, 0.04, 0.06]}
        tintIntensity={0.1}
        dithering={0.008}
        scale={1.08}
        className="w-full h-full opacity-95"
      />

      {/* Sculptural pearl highlight & deep obsidian edge falloff for glass depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 64% 26%, rgba(255,255,255,0.14) 0%, rgba(16,16,22,0.18) 52%, rgba(4,4,6,0.68) 100%)',
        }}
      />

      {/* Subtle architectural diagonal light ribbon */}
      <div
        className="absolute inset-0 opacity-45"
        style={{
          background:
            'linear-gradient(125deg, transparent 18%, rgba(255,255,255,0.08) 44%, transparent 64%, rgba(255,255,255,0.05) 82%, transparent 95%)',
        }}
      />

      {/* Subtle micro-pixel dot matrix */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      {asciiOverlayEnabled && (
        <AsciiAmbientBackdrop
          accentColor={accentColor}
          isPlaying={isPlaying}
          getFrequencyData={getFrequencyData}
        />
      )}
    </div>
  );
};
