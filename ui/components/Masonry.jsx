// Adapted from React Bits Masonry. Copyright (c) 2026 David Haz.
// MIT + Commons Clause: licenses/ReactBits-LICENSE.md at project root.
// Retain shortest-column placement and damped spring reflow; use library cards/previews.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const aspectOf = (item, measured) =>
  measured[item.id] || (item.width > 0 && item.height > 0 ? item.height / item.width : 0.75);
const gridOf = (width, columnWidth, gap) => {
  const count = Math.max(1, Math.floor((width + gap) / (Math.max(40, columnWidth) + gap)));
  return { count, size: Math.max(1, (width - gap * (count - 1)) / count) };
};
const place = (heights, item, grid, gap, measured) => {
  const { count, size } = grid;
  let column = 0,
    top = Infinity;
  for (let start = 0; start < count; start++) {
    if (heights[start] < top - 0.5) {
      top = heights[start];
      column = start;
    }
  }
  const w = size,
    h = Math.max(1, (w - 10) * aspectOf(item, measured)) + 42;
  heights[column] = top + h + gap;
  return { x: Math.round(column * (size + gap)), y: Math.round(top), w, h };
};
const layoutOf = (items, width, columnWidth, gap, measured) => {
  const grid = gridOf(width, columnWidth, gap),
    heights = new Array(grid.count).fill(0);
  const tiles = items.map((item, index) => ({
    item,
    index,
    id: item.id,
    ...place(heights, item, grid, gap, measured),
  }));
  return { tiles, columns: grid.count, height: Math.max(0, Math.max(...heights) - gap) };
};

export default function Masonry({ items, columnWidth = 220, gap = 12, renderItem }) {
  const root = useRef(null),
    nodes = useRef(new Map()),
    springs = useRef(new Map());
  const [width, setWidth] = useState(0),
    [measured, setMeasured] = useState({});
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const layout = useMemo(
    () => layoutOf(items, width, columnWidth, gap, measured),
    [items, width, columnWidth, gap, measured],
  );
  useLayoutEffect(() => {
    const element = root.current;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    setWidth(Math.round(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)'),
      change = (e) => setReduced(e.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    if (!width) return;
    const live = new Set(layout.tiles.map((tile) => tile.id));
    for (const id of springs.current.keys()) if (!live.has(id)) springs.current.delete(id);
    for (const tile of layout.tiles) {
      let spring = springs.current.get(tile.id);
      if (!spring) {
        spring = {
          x: tile.x,
          y: tile.y + (reduced ? 0 : 10),
          vx: 0,
          vy: 0,
          s: 1,
          vs: 0,
          w: tile.w,
          tx: tile.x,
          ty: tile.y,
          reveal: reduced ? 1 : 0,
        };
        springs.current.set(tile.id, spring);
      } else if (!reduced && Math.abs(spring.w - tile.w) > 0.5) {
        spring.s *= spring.w / tile.w;
      }
      spring.w = tile.w;
      spring.tx = tile.x;
      spring.ty = tile.y;
      if (reduced) {
        spring.x = tile.x;
        spring.y = tile.y;
        spring.vx = spring.vy = spring.vs = 0;
        spring.s = 1;
        spring.reveal = 1;
      }
    }
    let raf = 0,
      last = performance.now();
    const omega = (Math.PI * 2) / 0.32,
      zeta = 0.96;
    const frame = (now) => {
      const elapsed = clamp((now - last) / 1000, 0, 1 / 20);
      last = now;
      const steps = Math.max(1, Math.ceil(elapsed / (1 / 240))),
        dt = elapsed / steps;
      let moving = false;
      springs.current.forEach((spring, id) => {
        if (!reduced) {
          for (let i = 0; i < steps; i++) {
            spring.vx +=
              (-omega * omega * (spring.x - spring.tx) - 2 * zeta * omega * spring.vx) * dt;
            spring.vy +=
              (-omega * omega * (spring.y - spring.ty) - 2 * zeta * omega * spring.vy) * dt;
            spring.vs += (-omega * omega * (spring.s - 1) - 2 * zeta * omega * spring.vs) * dt;
            spring.x += spring.vx * dt;
            spring.y += spring.vy * dt;
            spring.s += spring.vs * dt;
          }
        }
        const resting =
          Math.abs(spring.x - spring.tx) < 0.05 &&
          Math.abs(spring.y - spring.ty) < 0.05 &&
          Math.abs(spring.vx) + Math.abs(spring.vy) < 0.05 &&
          Math.abs(spring.s - 1) < 0.0005 &&
          Math.abs(spring.vs) < 0.001;
        if (resting) {
          spring.x = spring.tx;
          spring.y = spring.ty;
          spring.s = 1;
          spring.vx = spring.vy = spring.vs = 0;
        } else moving = true;
        spring.reveal = Math.min(1, spring.reveal + elapsed / 0.18);
        if (spring.reveal < 1) moving = true;
        const element = nodes.current.get(id);
        if (element) {
          element.style.transform = `translate3d(${spring.x}px,${spring.y}px,0) scale(${spring.s})`;
          element.style.opacity = String(1 - Math.pow(1 - spring.reveal, 3));
          element.style.willChange = moving ? 'transform, opacity' : 'auto';
        }
      });
      root.current?.setAttribute('data-layout-state', moving ? 'moving' : 'still');
      if (moving) raf = requestAnimationFrame(frame);
    };
    root.current.setAttribute('data-layout-state', reduced ? 'still' : 'moving');
    frame(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [layout, width, reduced]);
  const measure = (id, ratio) => {
    if (!(ratio > 0) || !Number.isFinite(ratio)) return;
    setMeasured((old) =>
      Math.abs((old[id] || 0) - ratio) < 0.001 ? old : { ...old, [id]: ratio },
    );
  };
  return (
    <div
      ref={root}
      className="asset-grid masonry"
      role="list"
      aria-label="素材瀑布流"
      data-columns={layout.columns}
      style={{ height: width ? layout.height : 0 }}
    >
      {width > 0 &&
        layout.tiles.map((tile) => (
          <div
            key={tile.id}
            ref={(node) => {
              if (node) nodes.current.set(tile.id, node);
              else nodes.current.delete(tile.id);
            }}
            className="masonry__item"
            role="listitem"
            style={{ width: tile.w, height: tile.h }}
          >
            {renderItem(tile.item, tile.index, (ratio) => measure(tile.id, ratio))}
          </div>
        ))}
    </div>
  );
}
