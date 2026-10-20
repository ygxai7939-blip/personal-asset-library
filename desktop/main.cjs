'use strict';
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  shell,
  clipboard,
  Menu,
} = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
if (process.env.ASSET_CONFIG_DIR) {
  app.setPath(
    'userData',
    path.join(path.resolve(process.env.ASSET_CONFIG_DIR), 'electron-profile'),
  );
}
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { openAsBlob } = require('node:fs');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);
let mainWindow,
  previewWindow,
  server,
  token = '',
  baseUrl = '',
  currentUser = null;
const pendingPaths = new Set();
let activeWrites = 0;
const configDir = process.env.ASSET_CONFIG_DIR || path.join(app.getPath('userData'), 'config');
const configPath = path.join(configDir, 'desktop.json');
const chosenDirectories = new Set();
const { bindWindowChrome, registerWindowChrome } = require('./window-chrome.cjs');
const { LocalLibrary } = require('./local-library.cjs');
const localLibrary = new LocalLibrary(
  configPath,
  process.env.ASSET_LIBRARY_DIR || path.join(app.getPath('userData'), 'library'),
);
async function request(route, method = 'GET', body) {
  if (localLibrary.busy) throw new Error('正在迁移素材库，请稍后重试');
  if (!baseUrl) throw new Error('本地素材库未启动');
  if (
    typeof route !== 'string' ||
    !route.startsWith('/api/') ||
    route.includes('..') ||
    /[\r\n#]/.test(route)
  )
    throw new Error('无效请求');
  const target = new URL(route, baseUrl);
  if (target.origin !== baseUrl || !target.pathname.startsWith('/api/'))
    throw new Error('无效请求');
  const response = await fetch(target, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(route.includes('/backup') ? 3600000 : 30000),
  });
  const data = await response.json().catch(() => ({ error: '服务响应异常' }));
  if (!response.ok)
    throw Object.assign(new Error(data.error || `请求失败 ${response.status}`), {
      status: response.status,
    });
  return data;
}
async function initSession() {
  await localLibrary.init();
  server = localLibrary.server;
  baseUrl = server.url;
  token = server.personalSession.token;
  currentUser = server.personalSession.user;
  return { configured: true, user: currentUser, mode: 'local', version: app.getVersion() };
}
function makeWindow() {
  mainWindow = new BrowserWindow({
    frame: false,
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: true,
    title: '素材库',
    icon: path.join(__dirname, '../ui/assets/logo.png'),
    backgroundColor: '#191919',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  bindWindowChrome(mainWindow);
  mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
}
function guard(event) {
  const filename = event.senderFrame?.url || '';
  const allowed = require('node:url').pathToFileURL(path.join(__dirname, '../ui/index.html'));
  const actual = new URL(filename);
  if (
    actual.protocol !== 'file:' ||
    decodeURIComponent(actual.pathname).toLowerCase() !==
      decodeURIComponent(allowed.pathname).toLowerCase()
  )
    throw new Error('仅允许应用页面访问');
}
function handle(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    let write = false;
    try {
      guard(event);
      if (localLibrary.busy) throw new Error('正在迁移素材库，请稍后重试');
      if (channel === 'migrate-storage' && activeWrites)
        throw new Error('请等当前导入或整理操作完成后再迁移');
      write =
        ['upload-file', 'upload-bytes', 'paste-image', 'prepare-import'].includes(channel) ||
        (channel === 'request' && args[1] && args[1] !== 'GET');
      if (write) activeWrites++;
      return { ok: true, data: await action(...args) };
    } catch (error) {
      return { ok: false, error: error.message, status: error.status };
    } finally {
      if (write) activeWrites--;
    }
  });
}
registerWindowChrome(guard);
handle('init', initSession);
handle('choose-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  chosenDirectories.add(path.resolve(result.filePaths[0]));
  return result.filePaths[0];
});
handle('storage-info', async () => {
  await initSession();
  return localLibrary.info();
});
handle('migrate-storage', async (target) => {
  if (typeof target !== 'string' || !chosenDirectories.has(path.resolve(target)))
    throw new Error('请通过选择文件夹指定位置');
  previewWindow?.close();
  const result = await localLibrary.migrate(target);
  await initSession();
  return result;
});
handle('request', (route, method, body) => request(route, method, body));
handle('choose-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: '图片与视频',
        extensions: [
          'jpg',
          'jpeg',
          'png',
          'webp',
          'gif',
          'tif',
          'tiff',
          'avif',
          'bmp',
          'mp4',
          'mov',
          'm4v',
          'webm',
          'mkv',
          'avi',
        ],
      },
    ],
  });
  for (const p of result.filePaths) pendingPaths.add(p);
  return result.filePaths;
});
// Paths submitted by the preload come only from the dropped File objects, never from parsed clipboard text.
handle('register-drops', (paths) => {
  if (!Array.isArray(paths) || paths.length > 500) throw new Error('一次最多添加 500 个文件');
  for (const p of paths) {
    if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('文件路径不正确');
    pendingPaths.add(p);
  }
  return paths;
});
handle('choose-import-directory',async()=>{
  const result=await dialog.showOpenDialog(mainWindow,{properties:['openDirectory']});
  if(result.canceled)return [];
  for(const file of result.filePaths)pendingPaths.add(file);
  return result.filePaths;
});
handle('prepare-import',async(paths,parentId='')=>{
  if(!Array.isArray(paths)||paths.length>500||paths.some(p=>typeof p!=='string'||!pendingPaths.has(p)))throw new Error('请通过文件选择或拖拽添加文件夹');
  const {scanImports}=require('./scan-imports.cjs');
  const result=await scanImports(paths);
  const meta=await request('/api/summary');const categories=[...meta.categories];
  if(parentId && !categories.some(c=>c.id===parentId))throw new Error('目标文件夹已不存在，请重新选择');
  for(const file of result.files){
    let parent=parentId||null;
    for(const name of file.folders){
      let item=categories.find(c=>(c.parent_id||null)===parent && c.name===name);
      if(!item){const made=await request('/api/categories','POST',{name,parent_id:parent});item={id:made.id,name,parent_id:parent};categories.push(item);}
      parent=item.id;
    }
    file.categories=parent?[parent]:[];pendingPaths.add(file.path);delete file.folders;
  }
  return result;
});
handle('upload-file', async (file, categories = []) => {
  if (!pendingPaths.has(file)) throw new Error('请通过文件选择或拖拽添加');
  const stat = await fsp.stat(file);
  if (!stat.isFile()) throw new Error('此项目不是普通文件；文件夹请通过文件夹导入自动扫描');
  if (stat.size > 2 * 1024 ** 3) throw new Error('单个文件超过 2 GB 上限，请使用较小的文件');
  const form = new FormData();
  form.append('name', path.basename(file));
  form.append('categories', JSON.stringify(categories));
  form.append('file', await openAsBlob(file), path.basename(file));
  const response = await fetch(`${baseUrl}/api/assets/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
});
async function importBytes(bytes, name, categories, type = 'application/octet-stream') {
  const form = new FormData();
  form.append('name', name);
  form.append('categories', JSON.stringify(categories));
  form.append('file', new Blob([bytes], { type }), name);
  const response = await fetch(`${baseUrl}/api/assets/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
handle('upload-bytes', async (file, categories = []) => {
  const { LIMIT } = require('./clipboard-image.cjs');
  if (
    !file ||
    typeof file.name !== 'string' ||
    !(file.bytes instanceof Uint8Array) ||
    !file.bytes.byteLength ||
    file.bytes.byteLength > LIMIT
  )
    throw new Error('未能读取拖入文件，或文件超过 64 MB；请另存为本地文件后导入');
  const name = path.basename(file.name);
  return importBytes(file.bytes, name, categories);
});
handle('paste-image', async (categories = []) => {
  const { readClipboardImage } = require('./clipboard-image.cjs');
  const image = await readClipboardImage(clipboard);
  const name = `粘贴图片_${new Date().toISOString().replace(/[:.]/g, '-')}.${image.extension}`;
  return importBytes(image.bytes, name, categories, image.type);
});
handle('download', async (id, name) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('素材标识不正确');
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('downloads'), path.basename(name)),
  });
  if (result.canceled) return null;
  const response = await fetch(`${baseUrl}/api/assets/${id}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('下载失败，原文件暂不可访问');
  const tmp = `${result.filePath}.asset-part`;
  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmp));
    await fsp.rename(tmp, result.filePath);
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => {});
  }
  return result.filePath;
});
handle('open-source', async (url) => {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('仅支持网页地址');
  await shell.openExternal(parsed.href);
});
handle('preview-window', async (id) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('素材标识不正确');
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.close();
  }
  previewWindow = new BrowserWindow({
    frame: false,
    width: 840,
    height: 680,
    minWidth: 400,
    minHeight: 300,
    title: '素材参考',
    backgroundColor: '#191919',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  bindWindowChrome(previewWindow);
  previewWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await previewWindow.loadFile(path.join(__dirname, '../ui/index.html'), {
    query: { preview: id },
  });
  previewWindow.setTitle('素材参考 · 素材库');
  previewWindow.on('closed', () => {
    previewWindow = null;
  });
  return true;
});
handle('pin-preview', (pinned) => {
  if (!previewWindow) throw new Error('请先打开参考窗口');
  previewWindow.setAlwaysOnTop(!!pinned);
  return previewWindow.isAlwaysOnTop();
});
handle('close-preview', () => {
  previewWindow?.close();
  return true;
});
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle('asset-media', async (request) => {
      try {
        const url = new URL(request.url);
        const match = /^\/(?:asset\/)?([a-f0-9-]{36})\/(thumb|file)$/.exec(url.pathname);
        if (!match || !token || !baseUrl) return new Response('', { status: 404 });
        const headers = { Authorization: `Bearer ${token}` };
        const range = request.headers.get('range');
        if (range) headers.Range = range;
        const response = await net.fetch(`${baseUrl}/api/assets/${match[1]}/${match[2]}`, {
          headers,
        });
        return response;
      } catch {
        return new Response('', { status: 503 });
      }
    });
    makeWindow();
  });
  app.on('window-all-closed', () => {
    app.quit();
  });
  let closing = false;
  app.on('before-quit', (event) => {
    if (closing || !localLibrary.server) return;
    event.preventDefault();
    localLibrary
      .waitForMigration()
      .then(() => localLibrary.close())
      .catch(console.error)
      .finally(() => {
        closing = true;
        app.quit();
      });
  });
}
