import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  FolderPlus,
  FolderInput,
  TextCursorInput,
  Trash2,
  Search,
  ChevronRight,
  ChevronsUpDown,
  Check,
  X,
  Palette,
  Smile,
} from 'lucide-react';
import BranchedMenu from './BranchedMenu.jsx';
import FolderIcon, { FOLDER_ICONS } from './FolderIcon.jsx';

const COLORS = [
  ['', '默认'],
  ['#b6bbc2', '灰色'],
  ['#f66b6b', '红色'],
  ['#f3a347', '橙色'],
  ['#ead465', '黄色'],
  ['#75c58d', '绿色'],
  ['#60c6ce', '青色'],
  ['#72aef2', '蓝色'],
  ['#b196ef', '紫色'],
  ['#e79cc9', '粉色'],
];
export default function FolderSidebar({
  categories,
  active,
  onSelect,
  collapsed,
  setCollapsed,
  api,
  refresh,
  notify,
}) {
  const [menu, setMenu] = useState(null),
    [filter, setFilter] = useState(''),
    [panel, setPanel] = useState(''),
    [edit, setEdit] = useState(null),
    [dialog, setDialog] = useState(null),
    [destination, setDestination] = useState(''),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(null);
  const dragContext = useRef(null);
  const dragState = useRef(null),
    pressState = useRef(null),
    holdTimer = useRef(null),
    suppressClickUntil = useRef(0);
  const layer = useRef(null),
    editing = useRef(false);
  const current = categories.find((c) => c.id === menu?.id);
  const descendants = (id) => {
    const result = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of categories)
        if (result.has(c.parent_id) && !result.has(c.id)) {
          result.add(c.id);
          changed = true;
        }
    }
    return result;
  };
  const startFolderPress = (event, id) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      edit ||
      busy ||
      menu
    )
      return;
    clearTimeout(holdTimer.current);
    pressState.current = { id, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    holdTimer.current = setTimeout(() => {
      const pressed = pressState.current;
      const item = categories.find((c) => c.id === id);
      if (!pressed || pressed.id !== id || !item) return;
      const next = {
        id,
        name: item.name,
        x: pressed.x,
        y: pressed.y,
        target: null,
        invalid: false,
      };
      dragState.current = next;
      setDrag(next);
      document.body.classList.add('folder-dragging');
    }, 350);
  };
  useEffect(() => {
    const cancel = () => {
      clearTimeout(holdTimer.current);
      pressState.current = null;
      dragState.current = null;
      setDrag(null);
      document.body.classList.remove('folder-dragging');
    };
    const move = (event) => {
      const pressed = pressState.current;
      if (!pressed) return;
      if (!dragState.current) {
        if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 7) {
          clearTimeout(holdTimer.current);
          pressState.current = null;
        }
        return;
      }
      event.preventDefault();
      const row = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('.branched-menu__row[data-folder-id]');
      const target = row?.dataset.folderId || null;
      const invalid = !!target && dragContext.current.descendants(dragState.current.id).has(target);
      const next = { ...dragState.current, x: event.clientX, y: event.clientY, target, invalid };
      dragState.current = next;
      setDrag(next);
    };
    const up = async (event) => {
      const moving = dragState.current;
      if (!moving) {
        cancel();
        return;
      }
      event.preventDefault();
      suppressClickUntil.current = Date.now() + 350;
      cancel();
      if (!moving.target || moving.invalid) return;
      const item = dragContext.current.categories.find((c) => c.id === moving.id);
      if (!item || item.parent_id === moving.target) return;
      setBusy(true);
      try {
        const ctx = dragContext.current;
        await ctx.api(`/api/categories/${moving.id}`, 'PATCH', { parent_id: moving.target });
        await ctx.refresh();
        ctx.showAncestors(moving.target);
        ctx.onSelect(moving.id);
        notify('文件夹已移入目标文件夹');
      } catch (error) {
        notify(error.message);
      } finally {
        setBusy(false);
      }
    };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      clearTimeout(holdTimer.current);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      document.body.classList.remove('folder-dragging');
    };
  }, []);
  const close = () => {
    setMenu(null);
    setFilter('');
    setPanel('');
  };
  const open = (id, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    const rect = event?.currentTarget?.getBoundingClientRect();
    setMenu({
      id,
      x: event?.clientX || rect?.left || 30,
      y: event?.clientY || rect?.bottom || 160,
    });
    setFilter('');
    setPanel('');
  };
  const showAncestors = (id) =>
    setCollapsed((old) => {
      const next = new Set(old);
      let p = id;
      while (p) {
        next.delete(p);
        p = categories.find((c) => c.id === p)?.parent_id;
      }
      return next;
    });
  dragContext.current = { categories, api, refresh, onSelect, showAncestors, descendants };
  const beginCreate = (parent = null) => {
    if (editing.current) return;
    close();
    showAncestors(parent);
    setEdit({ id: 'folder-draft', name: '新建文件夹', parent_id: parent, creating: true });
  };
  const beginRename = (c) => {
    if (!c || editing.current) return;
    close();
    setEdit({ ...c, creating: false });
  };
  const saveEdit = async (name) => {
    if (editing.current || !edit) return;
    const value = name.trim();
    if (!value) {
      setEdit(null);
      return;
    }
    editing.current = true;
    setBusy(true);
    try {
      let id = edit.id;
      if (edit.creating) {
        id = (await api('/api/categories', 'POST', { name: value, parent_id: edit.parent_id })).id;
      } else await api(`/api/categories/${id}`, 'PATCH', { name: value });
      await refresh();
      setEdit(null);
      onSelect(id);
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    } finally {
      editing.current = false;
      setBusy(false);
    }
  };
  const updateStyle = async (body) => {
    try {
      await api(`/api/categories/${menu.id}`, 'PATCH', body);
      await refresh();
      close();
    } catch (e) {
      notify(e.message);
    }
  };
  const toggle = (id) =>
    setCollapsed((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  useEffect(() => {
    if (!menu) return;
    const outside = (e) => {
      if (!layer.current?.contains(e.target)) close();
    };
    const dismiss = () => close();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [menu]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') {
        if (menu) {
          close();
          e.preventDefault();
        }
        if (dialog) setDialog(null);
        return;
      }
      if (
        e.target.closest('input,textarea,select,[contenteditable=true]') ||
        document.querySelector('[role=dialog],.preview-overlay')
      )
        return;
      const selected = categories.find((c) => c.id === active);
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        beginCreate(selected?.parent_id || null);
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        beginCreate(selected?.id || null);
      } else if (e.key === 'F2' && selected) {
        e.preventDefault();
        beginRename(selected);
      } else if (
        e.key === 'Delete' &&
        selected &&
        document.activeElement?.closest('.folder-sidebar-tree')
      ) {
        e.preventDefault();
        setDialog({ type: 'delete', category: selected });
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [active, categories, menu, dialog]);
  const rowAction = (key) => {
    if (!current) return;
    close();
    if (key === 'move') {
      setDestination(current.parent_id || '');
      setDialog({ type: 'move', category: current });
    }
    if (key === 'delete') setDialog({ type: 'delete', category: current });
  };
  const items = [
    {
      name: '新增文件夹',
      Icon: FolderPlus,
      key: 'new',
      shortcut: 'Ctrl Shift N',
      action: () => beginCreate(current?.parent_id || null),
    },
    {
      name: '新增子文件夹',
      Icon: FolderPlus,
      key: 'child',
      shortcut: 'Alt N',
      action: () => beginCreate(current?.id || null),
      needs: true,
    },
    {
      name: '移动文件夹',
      Icon: FolderInput,
      key: 'move',
      action: () => rowAction('move'),
      needs: true,
    },
    {
      name: '重命名',
      Icon: TextCursorInput,
      key: 'rename',
      shortcut: 'F2',
      action: () => beginRename(current),
      needs: true,
    },
    {
      name: '展开 / 收起文件夹',
      Icon: ChevronsUpDown,
      key: 'toggle',
      action: () => {
        toggle(current.id);
        close();
      },
      needs: true,
    },
    {
      name: '展开 / 收起同级文件夹',
      Icon: ChevronsUpDown,
      key: 'siblings',
      needs: true,
      action: () => {
        const siblings = categories.filter(
          (c) => c.parent_id === current.parent_id && categories.some((x) => x.parent_id === c.id),
        );
        setCollapsed((old) => {
          const next = new Set(old);
          const expand = siblings.some((c) => next.has(c.id));
          for (const c of siblings) expand ? next.delete(c.id) : next.add(c.id);
          return next;
        });
        close();
      },
    },
    {
      name: '展开所有文件夹',
      Icon: ChevronsUpDown,
      key: 'expand',
      action: () => {
        setCollapsed(new Set());
        close();
      },
    },
    {
      name: '收起所有文件夹',
      Icon: ChevronsUpDown,
      key: 'collapse',
      action: () => {
        setCollapsed(
          new Set(
            categories.filter((c) => categories.some((x) => x.parent_id === c.id)).map((c) => c.id),
          ),
        );
        close();
      },
    },
    {
      name: '文件夹图标',
      Icon: Smile,
      key: 'icon',
      submenu: true,
      action: () => setPanel('icon'),
      needs: true,
    },
    {
      name: '文件夹颜色',
      Icon: Palette,
      key: 'color',
      submenu: true,
      action: () => setPanel('color'),
      needs: true,
    },
    {
      name: '删除文件夹',
      Icon: Trash2,
      key: 'delete',
      shortcut: 'Delete',
      action: () => rowAction('delete'),
      needs: true,
      danger: true,
    },
  ].filter((i) => (!i.needs || current) && (!filter || i.name.includes(filter)));
  const display = edit?.creating ? [...categories, { ...edit, count: 0 }] : categories;
  return (
    <>
      <div className="sidebar-section-title">
        <span>文件夹</span>
        <button
          type="button"
          className="icon-button"
          title="新增文件夹"
          aria-label="新增文件夹"
          onClick={() => beginCreate(null)}
        >
          <Plus size={15} />
        </button>
      </div>
      <div
        className="tree folder-sidebar-tree"
        onClickCapture={(e) => {
          if (Date.now() < suppressClickUntil.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onContextMenu={(e) => open(null, e)}
      >
        {!categories.length && !edit && (
          <p className="empty-tree">
            点击 ＋ 或右键新增文件夹
            <br />
            名称直接在这里编辑
          </p>
        )}
        <BranchedMenu
          categories={display}
          active={active}
          collapsed={collapsed}
          onSelect={onSelect}
          onToggle={toggle}
          onManage={open}
          onFolderPointerDown={startFolderPress}
          dragSource={drag?.id}
          dragTarget={!drag?.invalid ? drag?.target : null}
          editing={edit}
          editBusy={busy}
          onCommit={saveEdit}
          onCancel={() => setEdit(null)}
        />
      </div>
      {drag &&
        createPortal(
          <div
            className="folder-drag-ghost"
            style={{
              left: Math.min(drag.x + 15, innerWidth - 240),
              top: Math.min(drag.y + 15, innerHeight - 70),
            }}
          >
            <div>
              <FolderIcon />
              <strong>{drag.name}</strong>
            </div>
            <small>
              {drag.invalid
                ? '不能移入自身或下级文件夹'
                : drag.target
                  ? `松开移入「${categories.find((c) => c.id === drag.target)?.name}」`
                  : '拖到目标文件夹后松开'}
            </small>
          </div>,
          document.body,
        )}
      {menu &&
        createPortal(
          <div className="folder-menu-layer" ref={layer}>
            <FolderMenu
              menu={menu}
              panel={panel}
              filter={filter}
              setFilter={setFilter}
              items={items}
              current={current}
              close={close}
              setPanel={setPanel}
              updateStyle={updateStyle}
            />
          </div>,
          document.body,
        )}
      {dialog &&
        createPortal(
          <div className="modal-backdrop">
            <section
              className="modal folder-action-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={dialog.type === 'delete' ? '删除文件夹' : '移动文件夹'}
            >
              <header>
                <h2>{dialog.type === 'delete' ? '删除文件夹' : '移动文件夹'}</h2>
                <button
                  className="icon-button"
                  aria-label="关闭"
                  disabled={busy}
                  onClick={() => setDialog(null)}
                >
                  <X size={17} />
                </button>
              </header>
              {dialog.type === 'delete' ? (
                <p>
                  删除「{dialog.category.name}」及其 {descendants(dialog.category.id).size - 1}{' '}
                  个下级文件夹？
                  <br />
                  <span className="hint-text">素材保留在「全部素材」中，不会删除原文件。</span>
                </p>
              ) : (
                <label>
                  将「{dialog.category.name}」移动到
                  <select
                    aria-label="目标文件夹"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option value="">顶级文件夹</option>
                    {categories
                      .filter((c) => !descendants(dialog.category.id).has(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {folderPath(c, categories)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <div className="modal-actions">
                <button disabled={busy} onClick={() => setDialog(null)}>
                  取消
                </button>
                <button
                  disabled={busy}
                  className={dialog.type === 'delete' ? 'danger' : 'primary'}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(
                        `/api/categories/${dialog.category.id}`,
                        dialog.type === 'delete' ? 'DELETE' : 'PATCH',
                        dialog.type === 'move' ? { parent_id: destination || null } : undefined,
                      );
                      await refresh();
                      setDialog(null);
                    } catch (e) {
                      notify(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? '处理中…' : dialog.type === 'delete' ? '删除文件夹' : '确认移动'}
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
function folderPath(c, categories) {
  const names = [c.name];
  let p = c.parent_id;
  while (p) {
    const item = categories.find((x) => x.id === p);
    if (!item) break;
    names.unshift(item.name);
    p = item.parent_id;
  }
  return names.join(' / ');
}
function FolderMenu({
  menu,
  panel,
  filter,
  setFilter,
  items,
  current,
  close,
  setPanel,
  updateStyle,
}) {
  const main = useRef(null),
    [pos, setPos] = useState({
      left: Math.min(menu.x, innerWidth - 268),
      top: Math.min(menu.y, innerHeight - 460),
    }),
    [sub, setSub] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const rect = main.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(menu.x, innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(menu.y, innerHeight - rect.height - 8));
    setPos({ left, top });
    const anchor = main.current.querySelector(`[data-submenu="${panel}"]`)?.getBoundingClientRect();
    setSub({
      left: left + rect.width + 288 < innerWidth ? left + rect.width + 6 : Math.max(8, left - 286),
      top: Math.max(
        8,
        Math.min(anchor?.top || top, innerHeight - (panel === 'icon' ? 265 : 112) - 8),
      ),
    });
  }, [menu.x, menu.y, panel, filter]);
  return (
    <>
      <div
        className="folder-context-menu"
        ref={main}
        style={pos}
        role="menu"
        aria-label="文件夹操作"
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            close();
            return;
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
          const nodes = [...main.current.querySelectorAll('[role=menuitem]')];
          let index = nodes.indexOf(document.activeElement);
          if (e.key === 'Home') index = 0;
          else if (e.key === 'End') index = nodes.length - 1;
          else index = (index + (e.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length;
          nodes[index]?.focus();
          e.preventDefault();
        }}
      >
        <div className="folder-menu-search">
          <Search size={14} />
          <input
            aria-label="搜索文件夹操作"
            placeholder="搜索操作…"
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {current && <div className="folder-menu-caption">{current.name}</div>}
        <div className="folder-menu-options">
          {items.map(({ name, Icon, key, shortcut, action, submenu, danger }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              data-submenu={submenu ? key : undefined}
              aria-haspopup={submenu ? 'menu' : undefined}
              aria-expanded={submenu ? panel === key : undefined}
              className={`${danger ? 'destructive' : ''} ${panel === key ? 'submenu-active' : ''}`}
              onClick={action}
              onMouseEnter={() => setPanel(submenu ? key : '')}
            >
              <Icon size={15} />
              <span>{name}</span>
              {shortcut && <kbd>{shortcut}</kbd>}
              {submenu && <ChevronRight size={13} />}
            </button>
          ))}
          {!items.length && <p className="hint-text">没有匹配的操作</p>}
        </div>
      </div>
      {panel === 'icon' && (
        <div role="menu" aria-label="文件夹图标" className="folder-icon-panel" style={sub}>
          <div className="folder-menu-caption">选择图标</div>
          <div className="folder-icon-grid">
            {Object.entries(FOLDER_ICONS).map(([id, [Icon, label]]) => (
              <button
                type="button"
                key={id}
                title={label}
                aria-label={`图标：${label}`}
                className={(current?.icon || 'folder') === id ? 'selected' : ''}
                onClick={() => updateStyle({ icon: id })}
              >
                <Icon size={18} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </div>
      )}
      {panel === 'color' && (
        <div className="folder-color-panel" role="menu" aria-label="文件夹颜色" style={sub}>
          <div className="folder-menu-caption">文件夹图标颜色</div>
          <div className="folder-color-grid">
            {COLORS.map(([color, label]) => (
              <button
                type="button"
                key={label}
                title={label}
                aria-label={`颜色：${label}`}
                style={{ background: color || '#454545' }}
                onClick={() => updateStyle({ color })}
              >
                {(current?.color || '') === color && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
