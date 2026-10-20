import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Grid2X2,
  Folder,
  FolderOpen,
  Tag,
  Trash2,
  Clock,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  Upload,
  Settings,
  MoreHorizontal,
  X,
  Check,
  Image,
  Film,
  Download,
  Link,
  Pin,
  Maximize2,
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  LogOut,
  RefreshCw,
  HardDrive,
  Server,
  Users,
  Lock,
  Copy,
  SlidersHorizontal,
  FolderPlus,
  Star,
  Monitor,
  Layers,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  Clipboard,
  Minus,
  Square,
} from 'lucide-react';
import { EAGLE_FILTER_FIELDS } from '../vendor/eagle-filter-core.ts';
import LatticeLoader from './components/LatticeLoader.jsx';
import FolderSidebar from './components/FolderSidebar.jsx';
import MagnetContent from './components/MagnetContent.jsx';
import Preview from './components/Preview.jsx';
import Masonry from './components/Masonry.jsx';
import AppBackdrop from './components/AppBackdrop.jsx';
import { version as APP_VERSION } from '../package.json';
const bridge = window.library;
function LoadingStatus({ label = '处理中', compact = false, delay = 180 }) {
  const [visible, setVisible] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return visible ? (
    <LatticeLoader
      label={label}
      pattern="orbit"
      grid={3}
      shape="round"
      color="currentColor"
      fontSize={compact ? 12 : 13}
      cellSize={compact ? 4 : 6}
      gap={2}
      step={90}
      showTimer={!compact}
    />
  ) : null;
}
const rateOptions = EAGLE_FILTER_FIELDS.find((x) => x.field === 'RATING').options;
const views = [
  ['all', '全部素材', Grid2X2, 'total'],
  ['unfiled', '未分类', Folder, 'unfiled'],
  ['untagged', '未标签', Tag, 'untagged'],
  ['recent', '最近添加', Clock, null],
  ['trash', '回收站', Trash2, 'trash'],
];
const media = (asset, type = 'thumb') => `asset-media://library/${asset.id}/${type}`;
const bytes = (n) =>
  !n
    ? '0 B'
    : n < 1024
      ? `${n} B`
      : n < 1024 ** 2
        ? `${(n / 1024).toFixed(1)} KB`
        : n < 1024 ** 3
          ? `${(n / 1024 ** 2).toFixed(1)} MB`
          : `${(n / 1024 ** 3).toFixed(2)} GB`;
const date = (s) => (s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '—');
const duration = (n) =>
  n ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '视频';
const basename = (p) => p.split(/[\\/]/).pop();
function IconButton({ title, children, onClick, magnetic = false, ...rest }) {
  return (
    <button className="icon-button" title={title} aria-label={title} onClick={onClick} {...rest}>
      {magnetic ? (
        <MagnetContent compact disabled={rest.disabled}>
          {children}
        </MagnetContent>
      ) : (
        children
      )}
    </button>
  );
}
function Mark() {
  return (
    <span className="brand-mark">
      <img className="product-logo" src="assets/logo.png" alt="素材库" />
    </span>
  );
}
function WindowChrome() {
  const [state, setState] = useState({ maximized: false, focused: true }),
    [error, setError] = useState('');
  const reference = new URLSearchParams(location.search).has('preview');
  useEffect(() => {
    bridge
      .windowState()
      .then(setState)
      .catch(() => {});
    return bridge.onWindowState(setState);
  }, []);
  const control = async (action) => {
    try {
      setState(await bridge.windowControl(action));
      setError('');
    } catch (error) {
      setError(error.message);
    }
  };
  return (
    <header className={`window-chrome ${state.focused ? '' : 'unfocused'}`} aria-label="应用标题栏">
      <div className="window-identity">
        <img className="product-logo title-logo" src="assets/logo.png" alt="" />
        <span>{reference ? '参考预览' : '素材库'}</span>
        {error && <small role="alert">{error}</small>}
      </div>
      <div className="window-drag-area" aria-hidden="true" />
      <div className="window-controls">
        <button aria-label="最小化窗口" title="最小化" onClick={() => control('minimize')}>
          <Minus size={15} strokeWidth={1.3} />
        </button>
        <button
          aria-label={state.maximized ? '还原窗口' : '最大化窗口'}
          title={state.maximized ? '还原' : '最大化'}
          onClick={() => control('maximize')}
        >
          {state.maximized ? (
            <Copy size={12} strokeWidth={1.3} />
          ) : (
            <Square size={12} strokeWidth={1.3} />
          )}
        </button>
        <button
          className="window-close"
          aria-label="关闭窗口"
          title="关闭"
          onClick={() => control('close')}
        >
          <X size={16} strokeWidth={1.4} />
        </button>
      </div>
    </header>
  );
}
function Modal({ title, subtitle, children, onClose, wide = false }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton title="关闭" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
function Stars({ value, onChange }) {
  return (
    <div className="stars" aria-label={`评分 ${value} 星`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          title={`${n} 星${n === value ? '，再次点击清除' : ''}`}
          aria-label={`${n} 星`}
          key={n}
          onClick={() => onChange(n === value ? 0 : n)}
        >
          <Star
            size={17}
            fill={n <= value ? 'currentColor' : 'none'}
            className={n <= value ? 'lit' : ''}
          />
        </button>
      ))}
    </div>
  );
}
function Thumbnail({ asset, onMeasure }) {
  const imageRef = useRef(null);
  const source = media(asset);
  const [imageState, setImageState] = useState({ source: '', status: 'loading' });
  const failed = imageState.source === source && imageState.status === 'error';
  const loaded = imageState.source === source && imageState.status === 'ready';
  const available = asset.thumb_status === 'ready' && !failed;
  useEffect(() => {
    if (asset.thumb_status === 'pending') setImageState({ source, status: 'loading' });
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth) {
      setImageState({ source, status: 'ready' });
      onMeasure?.(image.naturalHeight / image.naturalWidth);
    }
  }, [source, asset.thumb_status]);
  const pending = asset.thumb_status === 'pending';
  return (
    <div className="thumbnail" aria-busy={pending || (available && !loaded)}>
      {available && (
        <img
          ref={imageRef}
          loading="lazy"
          src={source}
          onLoad={(e) => {
            setImageState({ source, status: 'ready' });
            onMeasure?.(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth);
          }}
          onError={() => setImageState({ source, status: 'error' })}
        />
      )}
      {pending || (available && !loaded) ? (
        <div className="thumb-placeholder thumb-loading">
          <LoadingStatus label={pending ? '生成预览中' : '读取预览中'} compact delay={0} />
        </div>
      ) : !available ? (
        <div className="thumb-placeholder">
          {asset.kind === 'video' ? (
            <Film size={35} strokeWidth={1} />
          ) : (
            <Image size={35} strokeWidth={1} />
          )}
          <span>
            {failed ? '预览加载失败' : asset.kind === 'video' ? '视频封面不可用' : '预览不可用'}
          </span>
        </div>
      ) : null}
      <span className="format-badge">{asset.extension.toUpperCase()}</span>
      {asset.kind === 'video' && (
        <span className="duration-badge">
          <Film size={11} />
          {duration(asset.duration)}
        </span>
      )}
    </div>
  );
}
function Detail({
  asset,
  onUpdate,
  onDownload,
  onPreview,
  onAssign,
  onTrash,
  onRestore,
  onPurge,
  trash,
}) {
  const [name, setName] = useState(asset.name),
    [description, setDescription] = useState(asset.description),
    [source, setSource] = useState(asset.source_url);
  const save = (field, value, original) => {
    if (value !== original) onUpdate(asset.id, { [field]: value });
  };
  return (
    <aside className="details">
      <div className="details-top">
        <span>素材详情</span>
        <IconButton
          magnetic
          title="独立置顶参考窗口"
          onClick={() => bridge.previewWindow(asset.id)}
          disabled={trash}
        >
          <Pin size={15} />
        </IconButton>
      </div>
      <div className="detail-scroll">
        <button className="detail-preview" onClick={() => onPreview(asset.id)} disabled={trash}>
          <Thumbnail asset={asset} />
          <span className="preview-hint">
            <Maximize2 size={13} />
            空格预览
          </span>
        </button>
        <input
          className="asset-title"
          aria-label="素材名称"
          value={name}
          disabled={trash}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => save('name', name, asset.name)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <textarea
          aria-label="素材备注"
          placeholder="记录值得参考的设计细节…"
          value={description}
          disabled={trash}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => save('description', description, asset.description)}
        />
        <div className="source-input">
          <Link size={14} />
          <input
            aria-label="来源网址"
            placeholder="添加来源网址"
            value={source}
            disabled={trash}
            onChange={(e) => setSource(e.target.value)}
            onBlur={() => save('source_url', source, asset.source_url)}
          />
          {asset.source_url && (
            <IconButton
              magnetic
              title="打开来源网页"
              onClick={() => bridge.openSource(asset.source_url)}
            >
              <ExternalLink size={13} />
            </IconButton>
          )}
        </div>
        <section>
          <div className="section-label">
            标签
            {!trash && (
              <IconButton title="添加标签" onClick={() => onAssign('tags')}>
                <Plus size={15} />
              </IconButton>
            )}
          </div>
          <div className="chips">
            {asset.tags.map((tag) => (
              <span className="chip" key={tag.id}>
                {tag.name}
                {!trash && (
                  <button
                    title="移除标签"
                    onClick={() => onUpdate(asset.id, null, `/tags/${tag.id}`)}
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {!asset.tags.length && <span className="muted">尚未添加标签</span>}
          </div>
        </section>
        <section>
          <div className="section-label">
            分类
            {!trash && (
              <IconButton title="添加分类" onClick={() => onAssign('categories')}>
                <Plus size={15} />
              </IconButton>
            )}
          </div>
          <div className="chips">
            {asset.categories.map((category) => (
              <span className="chip category-chip" key={category.id}>
                <Folder size={12} />
                {category.name}
                {!trash && (
                  <button
                    title="移出分类"
                    onClick={() => onUpdate(asset.id, null, `/categories/${category.id}`)}
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {!asset.categories.length && <span className="muted">未分类</span>}
          </div>
        </section>
        <section>
          <div className="section-label">基本信息</div>
          <dl>
            <dt>我的评分</dt>
            <dd>
              {trash ? (
                <span>{asset.rating || '未评分'}</span>
              ) : (
                <Stars value={asset.rating} onChange={(rating) => onUpdate(asset.id, { rating })} />
              )}
            </dd>
            <dt>尺寸</dt>
            <dd>{asset.width ? `${asset.width} × ${asset.height}` : '—'}</dd>
            {asset.kind === 'video' && (
              <>
                <dt>时长</dt>
                <dd>{asset.duration ? duration(asset.duration) : '待读取'}</dd>
              </>
            )}
            <dt>文件大小</dt>
            <dd>{bytes(asset.size)}</dd>
            <dt>格式</dt>
            <dd>{asset.extension.toUpperCase()}</dd>
            <dt>添加者</dt>
            <dd>{asset.uploaded_by}</dd>
            <dt>入库时间</dt>
            <dd>{date(asset.created_at)}</dd>
            <dt>保存方式</dt>
            <dd>本地素材库 · 统一存放</dd>
            {trash && (
              <>
                <dt>删除时间</dt>
                <dd>{date(asset.deleted_at)}</dd>
              </>
            )}
          </dl>
        </section>
      </div>
      <footer>
        {trash ? (
          <>
            <button className="primary" onClick={onRestore}>
              <RotateCcw size={16} />
              恢复素材
            </button>
            {onPurge && (
              <button className="danger-text" onClick={onPurge}>
                彻底删除
              </button>
            )}
          </>
        ) : (
          <>
            <button className="primary" onClick={onDownload}>
              <MagnetContent>
                <Download size={16} />
                导出原文件
              </MagnetContent>
            </button>
            <IconButton title="移入回收站" onClick={onTrash}>
              <Trash2 size={16} />
            </IconButton>
          </>
        )}
      </footer>
    </aside>
  );
}
function App() {
  const [initial, setInitial] = useState(null),
    [session, setSession] = useState(null),
    [toast, setToast] = useState(''),
    [loading, setLoading] = useState(false),
    [summary, setSummary] = useState({ stats: {}, categories: [], tags: [] }),
    [assets, setAssets] = useState([]),
    [total, setTotal] = useState(0),
    [view, setView] = useState('all'),
    [category, setCategory] = useState(''),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState(''),
    [rating, setRating] = useState(''),
    [sort, setSort] = useState('newest'),
    [tag, setTag] = useState(''),
    [selected, setSelected] = useState(new Set()),
    [selectingAll, setSelectingAll] = useState(false),
    [batchBusy, setBatchBusy] = useState(false),
    [activeId, setActiveId] = useState(''),
    [size, setSize] = useState(220),
    [collapsed, setCollapsed] = useState(new Set()),
    [modal, setModal] = useState(null),
    [previewId, setPreviewId] = useState(''),
    [queue, setQueue] = useState([]),
    [importing, setImporting] = useState(false),
    [scanning,setScanning] = useState(false),
    [dropping, setDropping] = useState(false),
    [standaloneAsset, setStandaloneAsset] = useState(null);
  const lastIndex = useRef(0),
    searchRef = useRef(null),
    workspaceRef = useRef(null),
    loadingRef = useRef(false),
    requestId = useRef(0),
    selectionId = useRef(0);
  const standaloneId = new URLSearchParams(location.search).get('preview');
  const notify = useCallback((message) => {
    setToast(message);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    bridge
      .init()
      .then((data) => {
        setInitial(data);
        if (data.user) setSession(data);
      })
      .catch((error) => setInitial({ error: error.message }));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const api = useCallback(async (route, method, body) => {
    try {
      return await bridge.request(route, method, body);
    } catch (error) {
      throw error;
    }
  }, []);
  const refresh = useCallback(
    async (append = false) => {
      if (!session || standaloneId) return;
      const id = ++requestId.current;
      loadingRef.current = true;
      setLoading(true);
      const params = new URLSearchParams({
        view: view === 'recent' ? 'all' : view,
        category,
        q: query,
        kind,
        rating,
        sort,
        tag,
        limit: '120',
        offset: String(append ? assets.length : 0),
      });
      try {
        let [result, meta] = await Promise.all([api(`/api/assets?${params}`), api('/api/summary')]);
        if (!append) {
          const target = Math.min(assets.length, result.total);
          while (result.items.length < target) {
            params.set('offset', String(result.items.length));
            const page = await api(`/api/assets?${params}`);
            if (!page.items.length) break;
            result.items.push(...page.items);
          }
        }
        if (id !== requestId.current) return;
        setAssets((old) => (append ? [...old, ...result.items] : result.items));
        setTotal(result.total);
        setSummary(meta);
        if (category && !meta.categories.some((c) => c.id === category)) setCategory('');
      } catch (error) {
        notify(error.message);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    [session, view, category, query, kind, rating, sort, tag, assets.length],
  );
  useEffect(() => {
    selectionId.current++;
    setSelectingAll(false);
    refresh();
    setSelected(new Set());
    setActiveId('');
  }, [session, view, category, query, kind, rating, sort, tag]);
  useEffect(() => {
    if (!session || !standaloneId) return;
    api(`/api/assets/${standaloneId}`)
      .then(setStandaloneAsset)
      .catch((e) => notify(e.message));
  }, [session, standaloneId]);
  const pendingThumbnails = assets.some((asset) => asset.thumb_status === 'pending');
  useEffect(() => {
    if (!session || standaloneId) return;
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'visible' && !loadingRef.current && !importing) refresh();
      },
      pendingThumbnails ? 1500 : 30000,
    );
    return () => clearInterval(timer);
  }, [refresh, session, importing, pendingThumbnails]);
  const active = assets.find((a) => a.id === activeId),
    preview = assets.find((a) => a.id === previewId),
    selectedIds = [...selected];
  const cancelAllSelection = () => {
    selectionId.current++;
    setSelectingAll(false);
    setSelected(new Set());
    setActiveId('');
  };
  const selectAllAssets = async () => {
    const generation = ++selectionId.current;
    setSelectingAll(true);
    const ids = [];
    const params = new URLSearchParams({
      view: view === 'recent' ? 'all' : view,
      category,
      q: query,
      kind,
      rating,
      sort,
      tag,
      limit: '120',
      offset: '0',
    });
    try {
      let more = true;
      while (more) {
        const page = await api(`/api/assets?${params}`);
        if (generation !== selectionId.current) return;
        ids.push(...page.items.map((a) => a.id));
        more = page.items.length > 0 && ids.length < page.total;
        params.set('offset', String(ids.length));
      }
      if (generation === selectionId.current) setSelected(new Set(ids));
    } catch (error) {
      if (generation === selectionId.current) notify(error.message);
    } finally {
      if (generation === selectionId.current) setSelectingAll(false);
    }
  };
  const processSelectedBatches = async (route, ids) => {
    setBatchBusy(true);
    try {
      for (let offset = 0; offset < ids.length; offset += 200)
        await api(route, 'POST', { ids: ids.slice(offset, offset + 200) });
    } catch (error) {
      setSelected(new Set());
      setActiveId('');
      setModal(null);
      await refresh();
      throw new Error(`操作未全部完成，列表已刷新。${error.message}`);
    } finally {
      setBatchBusy(false);
    }
  };
  const chooseView = (value) => {
    setView(value);
    setCategory('');
    setTag('');
    if (value === 'recent') setSort('newest');
  };
  const chooseCategory = (id) => {
    setCategory(id);
    setView('all');
    setTag('');
  };
  const perform = async (fn) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      notify(e.message);
    }
  };
  const update = (id, body, suffix = '') =>
    perform(() => api(`/api/assets/${id}${suffix}`, suffix ? 'DELETE' : 'PATCH', body));
  const trashSelected = (ids) =>
    setModal({
      type: 'confirm',
      title: '移入回收站？',
      text: `将 ${ids.length} 个素材移出我的列表。原文件暂时保留，可在回收站恢复。`,
      action: () =>
        perform(async () => {
          await processSelectedBatches('/api/assets/trash', ids);
          setSelected(new Set());
          setActiveId('');
          setModal(null);
          notify('已移入回收站');
        }),
    });
  const restore = (ids) =>
    perform(async () => {
      await processSelectedBatches('/api/assets/restore', ids);
      setSelected(new Set());
      setActiveId('');
      notify('素材已恢复');
    });
  const purge = (ids) =>
    setModal({
      type: 'confirm',
      danger: true,
      title: '彻底删除素材？',
      text: `永久删除 ${ids.length} 个原文件及其分类、标签记录，无法通过回收站恢复。`,
      action: () =>
        perform(async () => {
          await processSelectedBatches('/api/assets/purge', ids);
          setSelected(new Set());
          setActiveId('');
          setModal(null);
          notify('已彻底删除');
        }),
    });
  const addFiles = async (files) => {
    if (!files.length) return;
    if(importing)return notify('请等待当前导入完成');
    setImporting(true);setScanning(true);setQueue([]);
    const currentCategory=category;let prepared;
    try {
      const paths=files.filter(file=>typeof file==='string');
      prepared=paths.length?await bridge.prepareImport(paths,currentCategory):{files:[],skipped:0,warnings:[]};
      files=[...prepared.files,...files.filter(file=>typeof file!=='string')];
      setScanning(false);
      if(!files.length){notify(prepared.warnings[0] || (prepared.skipped?'未找到支持的图片或视频，其他文件已跳过；压缩包请先解压。':'文件夹内没有可导入的图片或视频'));return;}
      setQueue(files.map(file=>({file,name:file.name,status:'waiting'})));
      for(const file of files){
        setQueue(old=>old.map(item=>item.file===file?{...item,status:'uploading'}:item));
        try{
          let result;
          if(file.path)result=await bridge.uploadFile(file.path,file.categories || (currentCategory?[currentCategory]:[]));
          else {
            if(file.blob.size>64*1024*1024)throw new Error('此拖拽文件没有本地路径且超过 64 MB，请先另存为文件后导入');
            const bytes=new Uint8Array(await file.blob.arrayBuffer());result=await bridge.uploadBytes({name:file.name,bytes},currentCategory?[currentCategory]:[]);
          }
          setQueue(old=>old.map(item=>item.file===file?{...item,status:result.duplicate?'duplicate':'success'}:item));
        }catch(error){setQueue(old=>old.map(item=>item.file===file?{...item,status:'failed',error:error.message}:item));}
      }
      if(prepared.skipped || prepared.warnings.length)notify(`已跳过 ${prepared.skipped} 个非素材或链接项目，${prepared.warnings.length} 个项目无法读取`);
    }catch(error){notify(error.message);}
    finally{setScanning(false);setImporting(false);await refresh();}
  };
  const paste = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await bridge.pasteImage(category ? [category] : []);
      notify(result.duplicate ? '剪贴板图片已存在，已复用' : '剪贴板图片已入库');
      await refresh();
    } catch (e) {
      notify(e.message);
    } finally {
      setImporting(false);
    }
  };
  useEffect(() => {
    const key = (e) => {
      if (
        e.defaultPrevented ||
        document.querySelector('.folder-menu-layer,.folder-action-dialog') ||
        !session ||
        standaloneId ||
        e.target.matches('input,textarea,select') ||
        e.isComposing
      )
        return;
      if (e.code === 'Space' && e.target.closest('.branched-menu')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        paste();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (modal) setModal(null);
        else if (previewId) setPreviewId('');
        else {
          setSelected(new Set());
          setActiveId('');
        }
      }
      if (modal || previewId) return;
      if (e.code === 'Space' && active && view !== 'trash') {
        e.preventDefault();
        setPreviewId(active.id);
      }
      if (e.key === 'Delete' && selected.size && view !== 'trash') trashSelected([...selected]);
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAllAssets();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [session, active, selected, modal, previewId, category, importing, assets]);
  const select = (event, asset, index) => {
    if (batchBusy) return;
    selectionId.current++;
    setSelectingAll(false);
    if (event.shiftKey) {
      const start = Math.min(lastIndex.current, index),
        end = Math.max(lastIndex.current, index);
      setSelected((old) => new Set([...old, ...assets.slice(start, end + 1).map((a) => a.id)]));
    } else if (event.ctrlKey || event.metaKey) {
      setSelected((old) => {
        const next = new Set(old);
        next.has(asset.id) ? next.delete(asset.id) : next.add(asset.id);
        return next;
      });
      lastIndex.current = index;
    } else {
      setSelected(new Set([asset.id]));
      lastIndex.current = index;
    }
    setActiveId(asset.id);
  };
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || modal || previewId) return;
    let remainder = 0;
    const wheel = (event) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      if (event.target.closest('textarea,select,input:not([type="range"])')) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? workspace.clientHeight : 1;
      remainder += Math.max(-30, Math.min(30, -event.deltaY * unit * 0.2));
      const change = Math.trunc(remainder);
      if (change) {
        remainder -= change;
        setSize((previous) => Math.max(150, Math.min(330, previous + change)));
      }
    };
    workspace.addEventListener('wheel', wheel, { passive: false });
    return () => workspace.removeEventListener('wheel', wheel);
  }, [session, standaloneId, modal, previewId]);
  const categoryName = category ? summary.categories.find((c) => c.id === category)?.name : '',
    title = categoryName || views.find((v) => v[0] === view)?.[1] || '全部素材';
  if (!initial)
    return (
      <div className="boot">
        <LoadingStatus label="正在启动 素材库" />
      </div>
    );
  if (!session)
    return (
      <div className="boot">
        <div className="storage-block">
          <Mark />
          <h2>素材库暂时无法打开</h2>
          <p>{initial?.error || '请重新打开应用重试'}</p>
          <p>原有素材不会被覆盖。请检查磁盘连接和读写权限后重新启动。</p>
        </div>
      </div>
    );
  if (standaloneId)
    return (
      <>
        {standaloneAsset ? (
          <Preview
            asset={standaloneAsset}
            standalone
            notify={notify}
            onClose={() => bridge.closePreview()}
          />
        ) : (
          <div className="boot">{toast || <LoadingStatus label="读取素材中" />}</div>
        )}
      </>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="workspace-mark">
            <img className="product-logo" src="assets/logo.png" alt="素材库" />
          </span>
          <span>
            个人素材库<small>只在这台电脑 · 离线使用</small>
          </span>
        </div>
        <nav>
          {views.map(([id, label, Icon, count]) => (
            <button
              key={id}
              className={view === id && !category && !tag ? 'active' : ''}
              onClick={() => chooseView(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
              {count && <small>{summary.stats[count] ?? 0}</small>}
            </button>
          ))}
        </nav>
        <FolderSidebar
          categories={summary.categories}
          active={category}
          onSelect={chooseCategory}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          api={api}
          refresh={refresh}
          notify={notify}
        />
        <button
          className={`tag-management ${tag ? 'active' : ''}`}
          onClick={() => setModal({ type: 'tag-filter' })}
        >
          <Tag size={16} />
          <span>标签检索</span>
          <small>{summary.tags.filter((t) => t.count > 0).length}</small>
        </button>
        <footer>
          <span className="avatar">
            <img className="product-logo" src="assets/logo.png" alt="" />
          </span>
          <div>
            {session.user.display_name}
            <small>本地存储</small>
          </div>
          <IconButton title="本地设置" onClick={() => setModal({ type: 'settings' })}>
            <Settings size={17} />
          </IconButton>
        </footer>
      </aside>
      <main
        ref={workspaceRef}
        className={`workspace ${dropping ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          setDropping(false);
          if (importing) return notify('请等待当前导入完成');
          try {
            // Capture native File objects synchronously, before the drag event is released.
            const dropped = Array.from(e.dataTransfer.files);
            if (!dropped.length) {
              for (const item of Array.from(e.dataTransfer.items || [])) {
                if (item.kind === 'file') {
                  const file = item.getAsFile();
                  if (file) dropped.push(file);
                }
              }
            }
            if (!dropped.length)
              return notify(
                '没有读取到拖入的文件。微信图片请先打开原图后复制，再按 Ctrl+V；也可另存为后拖入。',
              );
            const paths = await bridge.dropped(dropped);
            await addFiles(
              dropped.map(
                (file, index) => paths[index] || { name: file.name || '拖入图片.png', blob: file },
              ),
            );
          } catch (error) {
            notify(error.message);
          }
        }}
      >
        <AppBackdrop />
        <header className="toolbar">
          <div className="breadcrumb">
            <span>我的素材库</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="toolbar-actions">
            <div className="search-field">
              <Search size={15} />
              <input
                ref={searchRef}
                placeholder="搜索名称、标签、备注"
                aria-label="搜索素材"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <X size={12} />
                </button>
              )}
              <kbd>Ctrl F</kbd>
            </div>
            <IconButton magnetic title="刷新素材" onClick={() => refresh()}>
              <RefreshCw size={16} />
            </IconButton>
            <IconButton title="导入文件夹" disabled={importing || view==='trash'} onClick={async()=>{try{await addFiles(await bridge.chooseImportDirectory());}catch(error){notify(error.message);}}}><FolderPlus size={17}/></IconButton>
            <button
              className="primary"
              disabled={importing || view === 'trash'}
              onClick={async () => {
                try {
                  await addFiles(await bridge.chooseFiles());
                } catch (error) {
                  notify(error.message);
                }
              }}
            >
              <MagnetContent disabled={importing || view === 'trash'}>
                <Plus size={16} />
                导入素材
              </MagnetContent>
            </button>
          </div>
        </header>
        <div className="filterbar">
          <div className="type-tabs">
            {[
              ['', '全部'],
              ['image', '图片'],
              ['video', '视频'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={kind === value ? 'active' : ''}
                onClick={() => setKind(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="filter-tools">
            <select
              aria-label="评分筛选"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            >
              <option value="">全部评分</option>
              {rateOptions
                .filter((option) => option.value !== '0')
                .slice()
                .reverse()
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}及以上
                  </option>
                ))}
            </select>
            <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">最近添加</option>
              <option value="oldest">最早添加</option>
              <option value="name">名称排序</option>
              <option value="rating">评分最高</option>
            </select>
            <div className="size-slider" title="缩略图大小 · Ctrl + 滚轮">
              <Image size={13} />
              <input
                aria-label="缩略图大小"
                type="range"
                min="150"
                max="330"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
        {
          <div
            className="trash-selection-bar"
            role="toolbar"
            aria-label={view === 'trash' ? '回收站选择操作' : '素材选择操作'}
          >
            <button
              type="button"
              aria-label="全部选择"
              disabled={!total || selectingAll || batchBusy || loading}
              onClick={selectAllAssets}
            >
              <CheckSquare size={14} />
              全部选择
            </button>
            <button
              type="button"
              disabled={(!selected.size && !selectingAll) || batchBusy}
              onClick={cancelAllSelection}
            >
              <X size={14} />
              全部取消
            </button>
            <span>
              {selectingAll ? (
                <LoadingStatus label="正在选择全部素材" compact delay={0} />
              ) : batchBusy ? (
                <LoadingStatus label="正在处理所选素材" compact delay={0} />
              ) : (
                `已选 ${selected.size} / ${total} 项`
              )}
            </span>
          </div>
        }
        {tag && (
          <div className="active-filter">
            <Tag size={13} />
            标签：{summary.tags.find((t) => t.id === tag)?.name}
            <button onClick={() => setTag('')}>
              <X size={13} />
            </button>
          </div>
        )}
        {(selected.size > 1 || (view === 'trash' && selected.size === 1)) && (
          <div className="batchbar">
            <span>
              <CheckSquare size={16} />
              已选 {selected.size} 项
            </span>
            {view === 'trash' ? (
              <>
                <button disabled={selectingAll || batchBusy} onClick={() => restore(selectedIds)}>
                  <RotateCcw size={14} />
                  恢复
                </button>
                {session.user.role === 'admin' && (
                  <button
                    disabled={selectingAll || batchBusy}
                    className="danger-text"
                    onClick={() => purge(selectedIds)}
                  >
                    彻底删除
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={() => setModal({ type: 'categories' })}>
                  <FolderPlus size={14} />
                  添加分类
                </button>
                <button onClick={() => setModal({ type: 'tags' })}>
                  <Tag size={14} />
                  添加标签
                </button>
                <button onClick={() => setModal({ type: 'rating' })}>
                  <Star size={14} />
                  评分
                </button>
                <button onClick={() => trashSelected(selectedIds)}>
                  <Trash2 size={14} />
                  移入回收站
                </button>
              </>
            )}
            <button disabled={batchBusy} className="batch-clear" onClick={cancelAllSelection}>
              取消选择
            </button>
          </div>
        )}
        <div
          className="asset-scroll"
          onClick={(e) => {
            if (e.target === e.currentTarget || e.target.classList.contains('masonry')) {
              if (!batchBusy) cancelAllSelection();
            }
          }}
          aria-busy={loading}
        >
          {loading && !assets.length ? (
            <div className="loading-placeholder">
              <LoadingStatus label="正在读取素材" />
            </div>
          ) : assets.length ? (
            <>
              <Masonry
                items={assets}
                columnWidth={size}
                gap={12}
                renderItem={(asset, index, onMeasure) => (
                  <article
                    key={asset.id}
                    className={`asset-card ${selected.has(asset.id) ? 'selected' : ''}`}
                    data-selected={selected.has(asset.id)}
                    onClick={(e) => select(e, asset, index)}
                    onDoubleClick={() => {
                      if (view !== 'trash') setPreviewId(asset.id);
                    }}
                    title={asset.name}
                  >
                    <div className="card-caption">
                      <span>{asset.name}</span>
                      {asset.rating > 0 && (
                        <small>
                          <Star size={10} fill="currentColor" />
                          {asset.rating}
                        </small>
                      )}
                    </div>
                    <Thumbnail asset={asset} onMeasure={onMeasure} />
                    <span className="card-check">
                      {selected.has(asset.id) && <Check size={12} />}
                    </span>
                  </article>
                )}
              />
              {assets.length < total && (
                <button className="load-more" disabled={loading} onClick={() => refresh(true)}>
                  加载更多（{assets.length} / {total}）
                </button>
              )}
            </>
          ) : (
            <div className="empty">
              <div className="empty-symbol">
                {view === 'trash' ? (
                  <Trash2 size={43} strokeWidth={1} />
                ) : query || kind || tag || rating ? (
                  <Search size={43} strokeWidth={1} />
                ) : (
                  <FolderOpen size={43} strokeWidth={1} />
                )}
              </div>
              <h2>
                {loading
                  ? '正在读取素材…'
                  : view === 'trash'
                    ? '回收站是空的'
                    : query || kind || tag || rating
                      ? '没有找到匹配的素材'
                      : '从第一份参考开始'}
              </h2>
              <p>
                {view === 'trash'
                  ? '删除的素材会暂存在这里，可随时恢复。'
                  : query || kind || tag || rating
                    ? '换一个关键词，或调整筛选条件。'
                    : '拖入图片、视频，或直接粘贴截图。\n素材统一存放，随时浏览和整理。'}
              </p>
              {view !== 'trash' && !query && !kind && !tag && !rating && (
                <div className="empty-actions">
                  <button
                    className="primary"
                    onClick={async () => addFiles(await bridge.chooseFiles())}
                  >
                    <MagnetContent>
                      <Upload size={16} />
                      选择文件
                    </MagnetContent>
                  </button>
                  <button onClick={paste}>
                    <MagnetContent disabled={importing}>
                      <Clipboard size={16} />
                      粘贴图片
                    </MagnetContent>
                  </button>
                </div>
              )}
              <small>{view !== 'trash' ? '支持 JPG、PNG、WEBP、GIF、MP4 等常用格式' : ''}</small>
            </div>
          )}
        </div>
        {dropping && (
          <div className="drop-overlay">
            <Upload size={37} />
            <h2>松开以导入素材</h2>
            <p>
              {categoryName ? `添加到「${categoryName}」` : '统一存入我的素材库'} · 来源文件保留
            </p>
          </div>
        )}
        <footer className="statusbar">
          <span>
            {loading && assets.length > 0 ? (
              <LoadingStatus label="正在读取素材" compact />
            ) : (
              <>
                <span className="online-dot" />
                本地素材库已就绪
              </>
            )}
          </span>
          <span>
            {total} 项{selected.size ? ` · 已选 ${selected.size} 项` : ''}
          </span>
          <span>Space 预览 · Ctrl V 粘贴</span>
        </footer>
        {scanning && <div className="upload-panel"><header><LoadingStatus label="正在扫描文件夹与子文件" delay={0}/></header></div>}
        {queue.length > 0 && (
          <div className="upload-panel">
            <header>
              {importing ? (
                <LoadingStatus label="正在导入素材" delay={0} />
              ) : (
                <strong>导入结果</strong>
              )}
              <span className="upload-count">
                {queue.filter((x) => ['success', 'duplicate'].includes(x.status)).length} /{' '}
                {queue.length}
              </span>
              {!importing && (
                <IconButton title="关闭导入结果" onClick={() => setQueue([])}>
                  <X size={15} />
                </IconButton>
              )}
            </header>
            <div>
              {queue.map((item, index) => (
                <div className={`upload-item ${item.status}`} key={index}>
                  <span title={item.file.path || item.name}>
                    {item.name}
                  </span>
                  {item.status === 'uploading' ? (
                    <span>导入中</span>
                  ) : item.status === 'failed' ? (
                    <span title={item.error}>失败</span>
                  ) : item.status === 'duplicate' ? (
                    '已存在'
                  ) : item.status === 'success' ? (
                    <Check size={14} />
                  ) : (
                    <span>等待</span>
                  )}
                  {item.status === 'failed' && <small>{item.error}</small>}
                </div>
              ))}
            </div>
            {!importing && queue.some((x) => x.status === 'failed') && (
              <button
                onClick={() =>
                  addFiles(queue.filter((x) => x.status === 'failed').map((x) => x.file))
                }
              >
                重试失败项
              </button>
            )}
          </div>
        )}
      </main>
      {active ? (
        <Detail
          key={active.id}
          asset={active}
          trash={view === 'trash'}
          onUpdate={update}
          onPreview={setPreviewId}
          onDownload={() => perform(() => bridge.download(active.id, active.original_name))}
          onAssign={(type) => {
            setSelected(new Set([active.id]));
            setModal({ type });
          }}
          onTrash={() => trashSelected([active.id])}
          onRestore={() => restore([active.id])}
          onPurge={session.user.role === 'admin' ? () => purge([active.id]) : null}
        />
      ) : (
        <aside className="details empty-details">
          <div className="details-top">素材详情</div>
          <div>
            <Image size={30} strokeWidth={1} />
            <p>选择一份素材</p>
            <small>查看信息、分类与标签</small>
          </div>
          <footer>
            <HardDrive size={14} />
            <span>统一托管 · 本地存储</span>
          </footer>
        </aside>
      )}
      {modal && (
        <DialogContent
          modal={modal}
          close={() => setModal(null)}
          session={session}
          summary={summary}
          selected={selectedIds}
          api={api}
          refresh={refresh}
          notify={notify}
          category={category}
          onFilterTag={(id) => {
            setTag(id);
            setCategory('');
            setView('all');
            setModal(null);
          }}
        />
      )}
      {preview && (
        <Preview
          asset={preview}
          nextAsset={assets[assets.findIndex((item) => item.id === preview.id) + 1]}
          notify={notify}
          onClose={() => setPreviewId('')}
          onPrevious={() => {
            const i = assets.findIndex((x) => x.id === preview.id);
            if (i > 0) setPreviewId(assets[i - 1].id);
          }}
          onNext={() => {
            const i = assets.findIndex((x) => x.id === preview.id);
            if (i < assets.length - 1) setPreviewId(assets[i + 1].id);
          }}
        />
      )}
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </div>
  );
}
function DialogContent({
  modal,
  close,
  session,
  summary,
  selected,
  api,
  refresh,
  notify,
  category,
  onFilterTag,
}) {
  const [text, setText] = useState(''),
    [chosen, setChosen] = useState(new Set()),
    [rating, setRating] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [storage, setStorage] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (modal.type === 'settings') {
      bridge
        .storageInfo()
        .then(setStorage)
        .catch((e) => setError(e.message));
    }
  }, []);
  const paths = summary.categories.map((c) => {
    let names = [c.name],
      p = c.parent_id;
    while (p) {
      const item = summary.categories.find((x) => x.id === p);
      if (!item) break;
      names.unshift(item.name);
      p = item.parent_id;
    }
    return { ...c, path: names.join(' / ') };
  });
  const titles = {
    tags: '添加标签',
    categories: '添加到分类',
    rating: '设置我的评分',
    'tag-filter': '按标签检索',
    settings: '设置',
    confirm: modal.title,
  };
  const submit = async () => {
    const body = {
      ids: selected,
      ...(modal.type === 'tags'
        ? {
            tags: [
              ...new Set([
                ...chosen,
                ...text
                  .split(/[,，\n]/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              ]),
            ],
          }
        : modal.type === 'categories'
          ? { categories: [...chosen] }
          : { rating }),
    };
    try {
      for (let offset = 0; offset < selected.length; offset += 200)
        await api('/api/assets/batch', 'POST', {
          ...body,
          ids: selected.slice(offset, offset + 200),
        });
    } catch (error) {
      await refresh();
      throw error;
    }
    await refresh();
    notify('整理已保存');
    close();
  };
  return (
    <Modal
      title={titles[modal.type]}
      subtitle={
        ['tags', 'categories', 'rating'].includes(modal.type)
          ? `为 ${selected.length} 个素材添加信息，保留其他已有内容。`
          : null
      }
      onClose={busy ? () => {} : close}
      wide={modal.type === 'settings'}
    >
      {modal.type === 'confirm' ? (
        <>
          <p className="confirm-text">{modal.text}</p>
          <div className="modal-actions">
            <button onClick={close}>取消</button>
            <button
              disabled={busy}
              className={modal.danger ? 'danger' : 'primary'}
              onClick={() => run(modal.action)}
            >
              {busy ? <LoadingStatus label="处理中" compact delay={0} /> : '确认'}
            </button>
          </div>
        </>
      ) : modal.type === 'tags' ? (
        <>
          <label>
            输入标签，用逗号分隔
            <input
              autoFocus
              placeholder="例如：现代、木饰面、暖色"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="section-label">已有标签</p>
          <div className="tag-picker">
            {summary.tags.map((tag) => (
              <button
                key={tag.id}
                className={chosen.has(tag.name) ? 'selected' : ''}
                onClick={() => {
                  const next = new Set(chosen);
                  next.has(tag.name) ? next.delete(tag.name) : next.add(tag.name);
                  setChosen(next);
                }}
              >
                {chosen.has(tag.name) && <Check size={12} />} {tag.name}
              </button>
            ))}
            {!summary.tags.length && <span className="muted">尚无我的标签，输入即可创建。</span>}
          </div>
          <div className="modal-actions">
            <button onClick={close}>取消</button>
            <button disabled={busy} className="primary" onClick={() => run(submit)}>
              添加标签
            </button>
          </div>
        </>
      ) : modal.type === 'categories' ? (
        <>
          <input
            aria-label="搜索分类"
            placeholder="搜索分类…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="category-picker">
            {paths
              .filter((c) => c.path.includes(text))
              .map((c) => (
                <label key={c.id} className="checkbox">
                  <input
                    type="checkbox"
                    checked={chosen.has(c.id)}
                    onChange={() => {
                      const next = new Set(chosen);
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                      setChosen(next);
                    }}
                  />
                  {c.path}
                </label>
              ))}
          </div>
          <div className="modal-actions">
            <button onClick={close}>取消</button>
            <button disabled={busy || !chosen.size} className="primary" onClick={() => run(submit)}>
              添加分类
            </button>
          </div>
        </>
      ) : modal.type === 'rating' ? (
        <>
          <div className="rating-picker">
            <Stars value={rating} onChange={setRating} />
            <p>{rating ? `${rating} 星` : '未评分（清除评分）'}</p>
          </div>
          <div className="modal-actions">
            <button onClick={close}>取消</button>
            <button disabled={busy} className="primary" onClick={() => run(submit)}>
              保存评分
            </button>
          </div>
        </>
      ) : modal.type === 'tag-filter' ? (
        <>
          <input
            placeholder="搜索我的标签…"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="tag-picker">
            {summary.tags
              .filter((t) => t.count > 0 && t.name.includes(text))
              .map((t) => (
                <button key={t.id} onClick={() => onFilterTag(t.id)}>
                  {t.name}
                  <small>{t.count}</small>
                </button>
              ))}
            {!summary.tags.some((t) => t.count > 0) && (
              <span className="muted">给素材添加标签后，即可在这里检索。</span>
            )}
          </div>
        </>
      ) : modal.type === 'settings' ? (
        <>
          <div className="storage-block">
            <h3>
              <HardDrive size={16} />
              素材库位置
            </h3>
            <code>{storage?.root || '读取中…'}</code>
            <p>原文件、缩略图、标签和分类均存放在此目录。</p>
          </div>
          <p className="hint-text">
            选择一个空的本地文件夹。迁移完成后自动切换；旧库保留，确认新库正常后可自行清理。迁移期间请勿关闭程序，并预留足够磁盘空间。
          </p>
          <button
            className="primary"
            disabled={busy || !storage}
            onClick={() =>
              run(async () => {
                const target = await bridge.chooseDirectory();
                if (!target) return;
                setStorage((s) => ({ ...s, target }));
              })
            }
          >
            选择新的存储位置
          </button>
          {storage?.target && (
            <div className="storage-block">
              <h3>准备迁移至</h3>
              <code>{storage.target}</code>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await bridge.migrateStorage(storage.target);
                    setStorage(await bridge.storageInfo());
                    await refresh();
                    notify('迁移完成，已切换到新位置；旧库保留');
                  })
                }
              >
                {busy ? (
                  <LoadingStatus label="正在复制与校验，请勿关闭" compact delay={0} />
                ) : (
                  '确认迁移整个素材库'
                )}
              </button>
            </div>
          )}
          <p className="hint-text">删除分类及其子分类会保留素材；回收站内永久删除由你直接操作。</p>
        </>
      ) : null}
      {error && (
        <div className="error">
          <AlertCircle size={15} />
          {error}
        </div>
      )}
    </Modal>
  );
}
createRoot(document.getElementById('root')).render(
  <>
    <WindowChrome />
    <App />
  </>,
);
