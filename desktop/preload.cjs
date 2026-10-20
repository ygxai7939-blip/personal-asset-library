'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const call = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) {
    const error = new Error(result.error);
    error.status = result.status;
    throw error;
  }
  return result.data;
};
contextBridge.exposeInMainWorld('library', {
  windowState: () => call('window-state'),
  windowControl: (action) => call('window-control', action),
  onWindowState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('window-state-changed', listener);
    return () => ipcRenderer.removeListener('window-state-changed', listener);
  },
  init: () => call('init'),
  storageInfo: () => call('storage-info'),
  migrateStorage: (target) => call('migrate-storage', target),
  chooseDirectory: () => call('choose-directory'),
  request: (route, method, body) => call('request', route, method, body),
  chooseFiles: () => call('choose-files'),
  chooseImportDirectory: () => call('choose-import-directory'),
  prepareImport: (paths,parent) => call('prepare-import',paths,parent),
  dropped: async (files) => {
    const paths = Array.from(files).map((file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    });
    await call('register-drops', paths.filter(Boolean));
    return paths;
  },
  uploadBytes: (file, categories) => call('upload-bytes', file, categories),
  uploadFile: (file, categories) => call('upload-file', file, categories),
  pasteImage: (categories) => call('paste-image', categories),
  download: (id, name) => call('download', id, name),
  openSource: (url) => call('open-source', url),
  previewWindow: (id) => call('preview-window', id),
  pinPreview: (pinned) => call('pin-preview', pinned),
  closePreview: () => call('close-preview'),
});
