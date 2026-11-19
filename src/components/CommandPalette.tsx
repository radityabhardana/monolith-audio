import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowsOutSimple,
  Equalizer,
  MagnifyingGlass,
  Moon,
  Play,
  Sparkle,
  X,
} from '@phosphor-icons/react';
import { Track } from '../types/music';
import { CoverArtRenderer } from './CoverArtRenderer';

interface CommandPaletteProps {
  open: boolean;
  tracks: Track[];
  onClose: () => void;
  onPlayTrack: (track: Track) => void;
  onOpenFx: () => void;
  onToggleZen: () => void;
  onCycleCoverMode: () => void;
  onToggleSlowedReverb: () => void;
  onSetSleep15: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  tracks,
  onClose,
  onPlayTrack,
  onOpenFx,
  onToggleZen,
  onCycleCoverMode,
  onToggleSlowedReverb,
  onSetSleep15,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const actions = useMemo(
    () => [
      { id: 'fx', label: 'Open Equalizer & Audio FX', icon: Equalizer, run: onOpenFx },
      { id: 'slowed', label: 'Toggle Slowed + Reverb Vibe', icon: Sparkle, run: onToggleSlowedReverb },
      { id: 'art', label: 'Switch Cover Art ASCII / Dither Style', icon: Sparkle, run: onCycleCoverMode },
      { id: 'zen', label: 'Toggle Fullscreen Zen Mode', icon: ArrowsOutSimple, run: onToggleZen },
      { id: 'sleep', label: 'Set Sleep Timer (15 min)', icon: Moon, run: onSetSleep15 },
    ],
    [onOpenFx, onToggleSlowedReverb, onCycleCoverMode, onToggleZen, onSetSleep15]
  );

  const filteredActions = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  const filteredTracks = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return tracks.slice(0, 5);
    return tracks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
      )
      .slice(0, 7);
  }, [tracks, query]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-start justify-center pt-[12vh] px-4"
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg smoked-glass-elevated rounded-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
              <MagnifyingGlass size={16} className="text-zinc-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose();
                  if (e.key === 'Enter' && filteredTracks.length > 0) {
                    onPlayTrack(filteredTracks[0]);
                    onClose();
                  }
                }}
                placeholder="Jump to track, playlist, or command..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-white/10 text-zinc-400"
              >
                <X size={14} />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2 space-y-3">
              {filteredTracks.length > 0 && (
                <div>
                  <p className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Tracks
                  </p>
                  {filteredTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => {
                        onPlayTrack(track);
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.08] text-left transition"
                    >
                      <CoverArtRenderer
                        coverUrl={track.coverUrl}
                        title={track.title}
                        mode="hd"
                        accentColor={track.accentColor}
                        size={32}
                        className="w-8 h-8 rounded-lg shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white truncate">
                          {track.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {track.artist}
                        </p>
                      </div>
                      <Play size={13} weight="fill" className="text-zinc-400" />
                    </button>
                  ))}
                </div>
              )}

              {filteredActions.length > 0 && (
                <div>
                  <p className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Quick Commands
                  </p>
                  {filteredActions.map((act) => {
                    const Icon = act.icon;
                    return (
                      <button
                        key={act.id}
                        onClick={() => {
                          act.run();
                          onClose();
                        }}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.08] text-left text-xs text-zinc-200 transition"
                      >
                        <Icon size={15} className="text-zinc-400" />
                        <span>{act.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
