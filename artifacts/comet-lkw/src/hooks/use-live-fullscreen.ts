import { useCallback, useEffect, useRef, useState } from "react";

/** Native fullscreen where permitted, viewport-filling mode in embedded previews. */
export function useLiveFullscreen(open: boolean, hasTarget: boolean) {
  const [fullscreen, setFullscreen] = useState(false);
  const requested = useRef(false);
  const ownsNative = useRef(false);

  const exitFullscreen = useCallback(() => {
    requested.current = false;
    setFullscreen(false);
    if (ownsNative.current && document.fullscreenElement === document.documentElement) {
      void document.exitFullscreen().catch(() => { /* viewport mode already restored */ });
    }
    ownsNative.current = false;
  }, []);

  const enterFullscreen = useCallback(async () => {
    requested.current = true;
    setFullscreen(true);
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    try {
      // Fullscreen the root so Radix menus portaled to body remain visible.
      await document.documentElement.requestFullscreen();
      ownsNative.current = true;
      if (!requested.current) exitFullscreen();
    } catch {
      // Embedded previews and some mobile browsers disallow the native API.
      // The dialog still fills the available app viewport.
    }
  }, [exitFullscreen]);

  useEffect(() => {
    const changed = () => {
      if (ownsNative.current && document.fullscreenElement !== document.documentElement) {
        ownsNative.current = false;
        requested.current = false;
        setFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      requested.current = false;
      if (ownsNative.current && document.fullscreenElement === document.documentElement) {
        void document.exitFullscreen().catch(() => {});
      }
      ownsNative.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open || !hasTarget) exitFullscreen();
  }, [open, hasTarget, exitFullscreen]);

  return { fullscreen, enterFullscreen, exitFullscreen };
}
