import { useCallback, useEffect, useRef, useState } from 'react';

export function useDevicePopup() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const winRef = useRef<Window | null>(null);

  const closePopup = useCallback(() => {
    if (winRef.current && !winRef.current.closed) {
      winRef.current.close();
    }
    winRef.current = null;
    setContainer(null);
    setIsOpen(false);
  }, []);

  const attachToWindow = useCallback((win: Window) => {
    winRef.current = win;
    win.document.title = 'MONOLITH // NOW PLAYING';

    const head = win.document.head;
    head.innerHTML = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      head.appendChild(node.cloneNode(true));
    });

    win.document.body.className =
      'bg-[#070709] text-zinc-100 antialiased overflow-hidden m-0 p-2 select-none';
    win.document.body.innerHTML = '';
    const mount = win.document.createElement('div');
    mount.className = 'w-full h-full';
    win.document.body.appendChild(mount);

    const handleClose = () => {
      winRef.current = null;
      setContainer(null);
      setIsOpen(false);
    };

    win.addEventListener('pagehide', handleClose);
    win.addEventListener('beforeunload', handleClose);
    setContainer(mount);
    setIsOpen(true);
  }, []);

  const openPopup = useCallback(async () => {
    if (winRef.current && !winRef.current.closed) {
      winRef.current.focus();
      return true;
    }

    let win: Window | null = null;
    try {
      if (window.documentPictureInPicture) {
        win = await window.documentPictureInPicture.requestWindow({
          width: 440,
          height: 128,
        });
      }
    } catch {
      win = null;
    }

    if (!win) {
      const left = Math.max(0, Math.round((window.screen.availWidth - 440) / 2));
      win = window.open(
        '',
        'MONOLITH_DEVICE_STATUS',
        `width=440,height=128,top=14,left=${left},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
      );
    }

    if (!win) {
      return false;
    }

    attachToWindow(win);
    return true;
  }, [attachToWindow]);

  const togglePopup = useCallback(async () => {
    if (isOpen || (winRef.current && !winRef.current.closed)) {
      closePopup();
      return false;
    }
    return openPopup();
  }, [isOpen, closePopup, openPopup]);

  useEffect(() => {
    return () => {
      if (winRef.current && !winRef.current.closed) {
        winRef.current.close();
      }
    };
  }, []);

  return {
    isOpen,
    container,
    openPopup,
    closePopup,
    togglePopup,
  };
}
