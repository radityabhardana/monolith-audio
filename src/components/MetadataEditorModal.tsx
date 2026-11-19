import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, X } from '@phosphor-icons/react';
import { Track, TrackMetadataOverride } from '../types/music';

interface MetadataEditorModalProps {
  track: Track | null;
  onClose: () => void;
  onSave: (trackKey: string, override: TrackMetadataOverride) => void;
}

export const MetadataEditorModal: React.FC<MetadataEditorModalProps> = ({
  track,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');

  useEffect(() => {
    if (track) {
      setTitle(track.title);
      setArtist(track.artist);
      setAlbum(track.album);
    }
  }, [track]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!track) return;
    onSave(track.key, {
      title: title.trim() || track.title,
      artist: artist.trim() || track.artist,
      album: album.trim() || track.album,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="w-full max-w-md smoked-glass-elevated rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Edit Track Info</h3>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-full hover:bg-white/10 text-zinc-400"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Artist
                </label>
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Album
                </label>
                <input
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-full border border-white/15 text-xs text-zinc-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200"
              >
                <Check size={13} weight="bold" />
                <span>Save</span>
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
