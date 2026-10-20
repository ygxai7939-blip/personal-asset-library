// Adapted from React Bits Magnet. Copyright (c) 2026 David Haz.
// MIT + Commons Clause: licenses/ReactBits-LICENSE.md at the application root.
'use client';

import React, { useEffect, useRef } from 'react';

const DEFAULT_SPRING = { stiffness: 170, damping: 16, mass: 1 };

const smoothstep = (edge0, edge1, value) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const registry = new Set();
const field = { pointer: null, owner: null, hit: null };
const blocked = (entry) =>
  entry.button?.disabled ||
  (entry.settings.current.withinButton &&
    (!entry.button || !field.hit || !entry.button.contains(field.hit)));
let detach = null;

const reach = (rect, pointer) => {
  const dx = pointer.x - (rect.left + rect.width / 2);
  const dy = pointer.y - (rect.top + rect.height / 2);
  const outside = Math.hypot(
    Math.max(0, Math.abs(dx) - rect.width / 2),
    Math.max(0, Math.abs(dy) - rect.height / 2),
  );
  return { dx, dy, outside };
};

const arbitrate = () => {
  if (field.pointer) field.hit = document.elementFromPoint(field.pointer.x, field.pointer.y);
  let winner = null;
  let nearest = Infinity;
  let closest = Infinity;
  for (const entry of registry) {
    const s = entry.settings.current;
    let near = null;
    if (field.pointer && !s.disabled && !entry.reduce && !blocked(entry)) {
      near = reach(entry.wrapper.getBoundingClientRect(), field.pointer);
      if (near.outside > s.padding) near = null;
    }
    if (!s.exclusive) {
      if (near || entry.active) entry.wake();
      continue;
    }
    if (!near) continue;
    const center = Math.hypot(near.dx, near.dy);
    if (near.outside < nearest || (near.outside === nearest && center < closest)) {
      winner = entry;
      nearest = near.outside;
      closest = center;
    }
  }
  const previous = field.owner;
  field.owner = winner;
  if (previous && previous !== winner) previous.wake();
  if (winner) winner.wake();
};

const attach = () => {
  const onPointerMove = (event) => {
    if (event.pointerType === 'touch') {
      onKeyboard();
      return;
    }
    field.pointer = { x: event.clientX, y: event.clientY };
    field.hit = document.elementFromPoint(event.clientX, event.clientY);
    arbitrate();
  };
  const onLeave = () => {
    field.pointer = null;
    field.hit = null;
    arbitrate();
  };
  const onKeyboard = () => {
    field.pointer = null;
    field.hit = null;
    field.owner = null;
    for (const entry of registry) entry.reset();
  };
  const onPointerDown = (event) => {
    if (event.pointerType === 'touch') onKeyboard();
  };
  window.addEventListener('keydown', onKeyboard);
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('scroll', arbitrate, { passive: true, capture: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  return () => {
    window.removeEventListener('keydown', onKeyboard);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('scroll', arbitrate, { capture: true });
    document.documentElement.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
  };
};

const Magnet = ({
  children,
  as: Wrapper = 'div',
  innerAs: Inner = 'div',
  withinButton = false,
  padding = 100,
  disabled = false,
  magnetStrength = 2,
  maxOffset,
  exclusive = true,
  axis = 'both',
  tilt = 0,
  scale = 1,
  spring,
  onActiveChange,
  wrapperClassName = '',
  innerClassName = '',
  style,
  ...props
}) => {
  const wrapperRef = useRef(null);
  const innerRef = useRef(null);
  const wakeRef = useRef(null);
  const settings = {
    padding: Math.max(0, padding),
    disabled,
    withinButton,
    strength: Math.max(0.1, magnetStrength),
    maxOffset,
    exclusive,
    axis,
    tilt,
    scale,
    stiffness: Math.max(1, spring?.stiffness ?? DEFAULT_SPRING.stiffness),
    damping: Math.max(0, spring?.damping ?? DEFAULT_SPRING.damping),
    mass: Math.max(0.01, spring?.mass ?? DEFAULT_SPRING.mass),
    onActiveChange,
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const inner = innerRef.current;
    if (!wrapper || !inner) return undefined;

    const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduce = motionPreference?.matches ?? false;
    const current = { x: 0, y: 0, tiltX: 0, tiltY: 0, scale: 1 };
    const velocity = { x: 0, y: 0, tiltX: 0, tiltY: 0, scale: 0 };
    let active = false;
    let raf = 0;
    let last = 0;

    const solve = (target, dt) => {
      const s = settingsRef.current;
      let resting = true;
      Object.keys(current).forEach((key) => {
        const force = s.stiffness * (target[key] - current[key]) - s.damping * velocity[key];
        velocity[key] += (force / s.mass) * dt;
        current[key] += velocity[key] * dt;
        const epsilon = key === 'scale' ? 0.001 : 0.05;
        if (Math.abs(target[key] - current[key]) > epsilon || Math.abs(velocity[key]) > epsilon)
          resting = false;
      });
      return resting;
    };

    const measure = () => {
      const s = settingsRef.current;
      const target = { x: 0, y: 0, tiltX: 0, tiltY: 0, scale: 1 };
      if (s.disabled || entry.reduce || blocked(entry) || !field.pointer)
        return { target, engaged: false };
      if (s.exclusive && field.owner !== entry) return { target, engaged: false };
      const rect = wrapper.getBoundingClientRect();
      const { dx, dy, outside } = reach(rect, field.pointer);
      if (outside > s.padding) return { target, engaged: false };
      const pull = s.padding > 0 ? 1 - smoothstep(s.padding * 0.5, s.padding, outside) : 1;
      let x = s.axis === 'y' ? 0 : (dx / s.strength) * pull;
      let y = s.axis === 'x' ? 0 : (dy / s.strength) * pull;
      if (s.maxOffset !== undefined && s.maxOffset !== null) {
        const length = Math.hypot(x, y);
        if (length > s.maxOffset) {
          x *= s.maxOffset / length;
          y *= s.maxOffset / length;
        }
      }
      const nx = Math.max(-1, Math.min(1, dx / Math.max(rect.width / 2, 1)));
      const ny = Math.max(-1, Math.min(1, dy / Math.max(rect.height / 2, 1)));
      target.x = x;
      target.y = y;
      target.tiltX = -ny * s.tilt * pull;
      target.tiltY = nx * s.tilt * pull;
      target.scale = 1 + (s.scale - 1) * pull;
      return { target, engaged: true };
    };

    const apply = () => {
      const { x, y, tiltX, tiltY, scale } = current;
      const turned = Math.abs(tiltX) > 0.01 || Math.abs(tiltY) > 0.01;
      inner.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)${
        turned
          ? ` perspective(800px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`
          : ''
      }${Math.abs(scale - 1) > 0.0005 ? ` scale(${scale.toFixed(4)})` : ''}`;
    };

    const reset = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (active) settingsRef.current.onActiveChange?.(false);
      active = false;
      entry.active = false;
      for (const key of Object.keys(current)) {
        current[key] = key === 'scale' ? 1 : 0;
        velocity[key] = 0;
      }
      wrapper.removeAttribute('data-magnet-active');
      inner.style.willChange = 'auto';
      apply();
    };

    const frame = (now) => {
      raf = 0;
      if (settingsRef.current.disabled || entry.reduce || entry.button?.disabled) {
        reset();
        return;
      }
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      const { target, engaged } = measure();
      if (engaged !== active) {
        active = engaged;
        entry.active = engaged;
        inner.style.willChange = engaged ? 'transform' : 'auto';
        if (engaged) wrapper.setAttribute('data-magnet-active', '');
        else wrapper.removeAttribute('data-magnet-active');
        settingsRef.current.onActiveChange?.(engaged);
      }
      const steps = Math.ceil(dt / (1 / 120));
      let resting = true;
      for (let i = 0; i < steps; i++) resting = solve(target, dt / steps);
      if (resting) {
        Object.keys(current).forEach((key) => {
          current[key] = target[key];
          velocity[key] = 0;
        });
      }
      apply();
      if (!resting) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    function wake() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    const entry = {
      wrapper,
      button: wrapper.closest('button'),
      settings: settingsRef,
      reduce,
      wake,
      reset,
      active: false,
    };
    const onMotionChange = (event) => {
      entry.reduce = event.matches;
      reset();
      arbitrate();
    };
    motionPreference?.addEventListener('change', onMotionChange);
    registry.add(entry);
    if (!detach) detach = attach();
    wakeRef.current = () => {
      arbitrate();
      wake();
    };

    return () => {
      cancelAnimationFrame(raf);
      motionPreference?.removeEventListener('change', onMotionChange);
      wakeRef.current = null;
      registry.delete(entry);
      if (field.owner === entry) field.owner = null;
      if (!registry.size && detach) {
        detach();
        detach = null;
      }
    };
  }, []);

  useEffect(() => {
    wakeRef.current?.();
  });

  return (
    <Wrapper
      ref={wrapperRef}
      className={wrapperClassName}
      style={{ position: 'relative', display: 'inline-block', ...style }}
      {...props}
    >
      <Inner ref={innerRef} className={innerClassName}>
        {children}
      </Inner>
    </Wrapper>
  );
};

export default Magnet;
