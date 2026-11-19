import React from 'react';
import { ArrowDown, ArrowUp, Play, Trash, X } from '@phosphor-icons/react';
import { Track } from '../types/music';
import { formatTime } from '../utils/id3';
import { CoverArtRenderer } from './CoverArtRenderer';

interface QueuePanelProps {
  currentTrack: Track | null;
  queueTracks: Track[];
  upNextTracks: Track[];
  onPlayTrack: (track: Track) => void;
  onMoveQueue: (from: number, to: number) => void;
  onRemoveQueue: (index: number) => void;
  onClearQueue: () => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  currentTrack,
  queueTracks,
  upNextTracks,
  onPlayTrack,
  onMoveQueue,
  onRemoveQueue,
  onClearQueue,
}) => {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] shrink-0">
        <h3 className="text-sm font-semibold text-zinc-100">Queue</h3>
        {queueTracks.length > 0 && (
          <button
            onClick={onClearQueue}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-zinc-300 transition"
          >
            <Trash size={12} />
            <span>Clear</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-5 pr-1">
        {currentTrack && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Now Playing
            </p>
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.07]">
              <CoverArtRenderer
                coverUrl={currentTrack.coverUrl}
                title={currentTrack.title}
                mode="hd"
                accentColor={currentTrack.accentColor}
                size={36}
                className="w-9 h-9 rounded-lg shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">
                  {currentTrack.title}
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  {currentTrack.artist}
                </p>
              </div>
              <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
                {formatTime(currentTrack.duration)}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Next in Queue ({queueTracks.length})
          </p>
          {queueTracks.length === 0 ? (
            <p className="text-xs text-zinc-500 py-2">
              Queue is empty. Use "Add to Queue" on any track to schedule it next.
            </p>
          ) : (
            <div className="space-y-1">
              {queueTracks.map((track, idx) => (
                <div
                  key={`${track.id}-q-${idx}`}
                  className="group flex items-center gap-2 p-2 rounded-xl hover:bg-white/[0.05] transition"
                >
                  <CoverArtRenderer
                    coverUrl={track.coverUrl}
                    title={track.title}
                    mode="hd"
                    accentColor={track.accentColor}
                    size={32}
                    className="w-8 h-8 rounded-md shrink-0"
                  />
                  <div
                    onClick={() => onPlayTrack(track)}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <p className="text-xs font-medium text-zinc-200 truncate">
                      {track.title}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {track.artist}
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => onMoveQueue(idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 disabled:opacity-30"
                      title="Move up"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={() => onMoveQueue(idx, idx + 1)}
                      disabled={idx === queueTracks.length - 1}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 disabled:opacity-30"
                      title="Move down"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      onClick={() => onRemoveQueue(idx)}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-red-400"
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {upNextTracks.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Next from Library
            </p>
            <div className="space-y-1">
              {upNextTracks.slice(0, 6).map((track) => (
                <button
                  key={`${track.id}-auto`}
                  onClick={() => onPlayTrack(track)}
                  className="w-full text-left group flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/[0.05] transition"
                >
                  <div className="relative w-8 h-8 rounded-md overflow-hidden shrink-0">
                    <CoverArtRenderer
                      coverUrl={track.coverUrl}
                      title={track.title}
                      mode="hd"
                      accentColor={track.accentColor}
                      size={32}
                      className="w-full h-full"
                    />
                    <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <Play size={12} weight="fill" className="text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-300 truncate">
                      {track.title}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {track.artist}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                    {formatTime(track.duration)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
