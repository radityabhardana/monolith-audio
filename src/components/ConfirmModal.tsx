import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Trash, Warning, X } from '@phosphor-icons/react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  secondaryLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onSecondaryConfirm?: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  secondaryLabel,
  onCancel,
  onConfirm,
  onSecondaryConfirm,
}) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md smoked-glass-elevated rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-400/25 flex items-center justify-center shrink-0">
                  <Warning size={20} weight="fill" className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    {message}
                  </p>
                </div>
              </div>

              <button
                onClick={onCancel}
                className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-full border border-white/15 text-xs font-medium text-zinc-300 hover:bg-white/10 transition"
              >
                Cancel
              </button>

              {secondaryLabel && onSecondaryConfirm && (
                <button
                  onClick={onSecondaryConfirm}
                  className="px-4 py-2 rounded-full bg-white/12 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white transition"
                >
                  {secondaryLabel}
                </button>
              )}

              <button
                onClick={onConfirm}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-red-500 hover:bg-red-400 text-white text-xs font-semibold shadow-lg transition active:scale-[0.98]"
              >
                <Trash size={14} weight="bold" />
                <span>{confirmLabel}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
