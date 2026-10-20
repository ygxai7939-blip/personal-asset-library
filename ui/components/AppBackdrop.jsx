import React, { useEffect, useState } from 'react';
import DotGrid from './DotGrid.jsx';

// User's React Bits URL parameters; preserve these rather than upstream defaults.
export const BACKDROP_SETTINGS = Object.freeze({
  gap: 10,
  glow: 0,
  shockStrength: 1.5,
  tension: 0.15,
  shockRadius: 360,
  strength: 0.5,
  swell: 0.25,
  dotSize: 4,
  fade: 0.2,
  baseColor: '#1e1c24',
  activeColor: '#a5a5a5',
});
function backgroundEvent(event) {
  return !event.target.closest?.(
    '.sidebar,.details,.modal,.setup-card,.preview-overlay,.window-chrome,button,input,textarea,select,a,[role="dialog"]',
  );
}
export default function AppBackdrop() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [paused, setPaused] = useState(() => document.hidden || !document.hasFocus());
  const [nativeActive, setNativeActive] = useState(true);
  useEffect(() => {
    let alive = true;
    const update = (state) => {
      if (alive) setNativeActive(state.focused && !state.minimized && state.visible !== false);
    };
    window.library
      .windowState()
      .then(update)
      .catch(() => {});
    const unsubscribe = window.library.onWindowState(update);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(media.matches);
    const onActivity = () => setPaused(document.hidden || !document.hasFocus());
    const onBlur = () => setPaused(true);
    const onFocus = () => setPaused(document.hidden);
    media.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onActivity);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      media.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onActivity);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  return (
    <div
      className="app-backdrop"
      aria-hidden="true"
      data-paused={paused || !nativeActive}
      data-reduced={reduced}
    >
      <DotGrid
        key={String(reduced)}
        {...BACKDROP_SETTINGS}
        intro={!reduced}
        mouseInteraction={!reduced}
        clickShock={!reduced}
        paused={paused || !nativeActive}
        dpr={Math.min(window.devicePixelRatio || 1, 1.5)}
        eventFilter={backgroundEvent}
      />
    </div>
  );
}
