// Adapted from React Bits BranchedMenu, Copyright (c) 2026 David Haz.
// MIT + Commons Clause: licenses/ReactBits-LICENSE.md at the application root.
// Extend the upstream branch geometry and fold animation to real recursive categories.
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, MoreHorizontal } from 'lucide-react';
import FolderIcon from './FolderIcon.jsx';

const ROW = 32,
  INDENT = 24,
  TRUNK = 6,
  RADIUS = 7,
  END = 20;

function BranchGroup({
  items,
  activePath,
  active,
  collapsed,
  onToggle,
  onSelect,
  onManage,
  onFolderPointerDown,
  dragSource,
  dragTarget,
  editing,
  editBusy,
  onCommit,
  onCancel,
  root = false,
  visible = true,
}) {
  const ref = useRef(null),
    [geometry, setGeometry] = useState({ height: 0, ys: [] });
  useLayoutEffect(() => {
    const tree = ref.current;
    if (!tree || root) return;
    const measure = () => {
      const top = tree.getBoundingClientRect().top;
      const ys = Array.from(tree.children)
        .filter((el) => el.classList.contains('branched-menu__section'))
        .map((el) => {
          const row = el.querySelector(':scope > .branched-menu__row');
          const rect = row.getBoundingClientRect();
          return Math.round((rect.top - top + rect.height / 2) * 10) / 10;
        });
      const height = Math.round(tree.getBoundingClientRect().height * 10) / 10;
      setGeometry((old) =>
        old.height === height && old.ys.length === ys.length && old.ys.every((y, i) => y === ys[i])
          ? old
          : { height, ys },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tree);
    return () => observer.disconnect();
  }, [items, root]);
  const branch = (y) =>
    `M ${TRUNK} ${Math.max(0, y - RADIUS)} A ${RADIUS} ${RADIUS} 0 0 0 ${TRUNK + RADIUS} ${y} H ${END}`;
  const reach = (y) =>
    `M ${TRUNK} 0 V ${Math.max(0, y - RADIUS)} A ${RADIUS} ${RADIUS} 0 0 0 ${TRUNK + RADIUS} ${y} H ${END}`;
  const length = (y) => Math.max(0, y - RADIUS) + (Math.PI * RADIUS) / 2 + (END - TRUNK - RADIUS);
  return (
    <div ref={ref} className={`branched-menu__tree${root ? ' branched-menu__root' : ''}`}>
      {!root && geometry.ys.length > 0 && (
        <svg
          className="branched-menu__lines"
          width={INDENT}
          height={geometry.height}
          aria-hidden="true"
        >
          <path
            className="branched-menu__base"
            d={`M ${TRUNK} 0 V ${Math.max(0, geometry.ys.at(-1) - RADIUS)}`}
          />
          {items.map((item, index) => (
            <path
              key={item.value}
              className="branched-menu__base"
              d={branch(geometry.ys[index] ?? ROW / 2)}
            />
          ))}
          {items.map((item, index) => {
            const y = geometry.ys[index] ?? ROW / 2,
              l = length(y);
            return (
              <path
                key={item.value}
                className="branched-menu__reach"
                d={reach(y)}
                style={{ strokeDasharray: l, strokeDashoffset: activePath.has(item.value) ? 0 : l }}
              />
            );
          })}
        </svg>
      )}
      {items.map((item) => {
        const hasChildren = item.children.length > 0,
          isOpen = hasChildren && !collapsed.has(item.value),
          selected = active === item.value,
          onPath = activePath.has(item.value);
        return (
          <div
            key={item.value}
            className="branched-menu__section"
            data-open={isOpen ? '' : undefined}
            data-root={root ? '' : undefined}
          >
            <div
              className="branched-menu__row"
              data-folder-id={item.value}
              data-drop-target={dragTarget === item.value ? '' : undefined}
              data-drag-source={dragSource === item.value ? '' : undefined}
              data-active={selected ? '' : undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onManage?.(item.value, e);
              }}
              data-path={onPath ? '' : undefined}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="branched-menu__toggle"
                  aria-label={`${isOpen ? '折叠' : '展开'}分类：${item.label}`}
                  aria-expanded={isOpen}
                  tabIndex={visible ? 0 : -1}
                  onClick={() => onToggle(item.value)}
                >
                  <ChevronRight size={12} />
                </button>
              ) : (
                <span className="branched-menu__toggle-space" aria-hidden="true" />
              )}
              {editing?.id === item.value ? (
                <FolderNameEditor
                  key={item.value}
                  name={editing.name}
                  busy={editBusy}
                  onCommit={onCommit}
                  onCancel={onCancel}
                />
              ) : (
                <button
                  type="button"
                  className="branched-menu__item"
                  title={item.label}
                  aria-current={selected ? 'page' : undefined}
                  data-active={selected ? '' : undefined}
                  tabIndex={visible ? 0 : -1}
                  onPointerDown={(e) => onFolderPointerDown?.(e, item.value)}
                  onClick={() => onSelect(item.value)}
                >
                  <span className="branched-menu__icon" aria-hidden="true">
                    <FolderIcon name={item.icon} color={item.color} open={selected || isOpen} />
                  </span>
                  <span className="branched-menu__label">{item.label}</span>
                  <small>{item.count ?? 0}</small>
                </button>
              )}
              <button
                type="button"
                className="category-more"
                title={`管理「${item.label}」`}
                aria-label={`管理「${item.label}」`}
                tabIndex={visible ? 0 : -1}
                onClick={(e) => onManage?.(item.value, e)}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
            {hasChildren && (
              <div className="branched-menu__body" aria-hidden={!isOpen} inert={!isOpen}>
                <div className="branched-menu__fold">
                  <div
                    className="branched-menu__children"
                    role="group"
                    aria-label={`${item.label}子分类`}
                  >
                    <BranchGroup
                      items={item.children}
                      activePath={activePath}
                      active={active}
                      collapsed={collapsed}
                      onToggle={onToggle}
                      onSelect={onSelect}
                      onManage={onManage}
                      onFolderPointerDown={onFolderPointerDown}
                      dragSource={dragSource}
                      dragTarget={dragTarget}
                      editing={editing}
                      editBusy={editBusy}
                      onCommit={onCommit}
                      onCancel={onCancel}
                      visible={visible && isOpen}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BranchedMenu({
  categories,
  active = '',
  collapsed,
  onToggle,
  onSelect,
  onManage,
  onFolderPointerDown,
  dragSource,
  dragTarget,
  editing,
  editBusy,
  onCommit,
  onCancel,
}) {
  const { items, parents } = useMemo(() => {
    const byParent = new Map(),
      parents = new Map();
    for (const c of categories) {
      const key = c.parent_id || null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
      parents.set(c.id, key);
    }
    const build = (parent, seen = new Set()) =>
      (byParent.get(parent) || [])
        .filter((c) => !seen.has(c.id))
        .map((c) => ({
          value: c.id,
          label: c.name,
          icon: c.icon,
          color: c.color,
          count: c.count,
          children: build(c.id, new Set([...seen, c.id])),
        }));
    return { items: build(null), parents };
  }, [categories]);
  const activePath = useMemo(() => {
    const path = new Set();
    let id = active;
    while (id && !path.has(id)) {
      path.add(id);
      id = parents.get(id);
    }
    return path;
  }, [active, parents]);
  return (
    <nav className="branched-menu" aria-label="我的分类">
      <BranchGroup
        items={items}
        root
        activePath={activePath}
        active={active}
        collapsed={collapsed}
        onToggle={onToggle}
        onSelect={onSelect}
        onManage={onManage}
        onFolderPointerDown={onFolderPointerDown}
        dragSource={dragSource}
        dragTarget={dragTarget}
        editing={editing}
        editBusy={editBusy}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </nav>
  );
}

function FolderNameEditor({ name, busy, onCommit, onCancel }) {
  const ref = useRef(null),
    cancelled = useRef(false),
    submitted = useRef(false);
  const [value, setValue] = useState(name);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    if (cancelled.current || submitted.current) return;
    submitted.current = true;
    Promise.resolve(onCommit(value)).then((ok) => {
      if (ok === false) {
        submitted.current = false;
        setTimeout(() => ref.current?.focus(), 0);
      }
    });
  };
  return (
    <input
      ref={ref}
      className="folder-inline-name"
      aria-label="文件夹名称"
      value={value}
      maxLength={255}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.preventDefault();
          onCancel();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
