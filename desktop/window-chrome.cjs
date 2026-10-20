'use strict';
const { BrowserWindow, ipcMain } = require('electron');
const stateFor = (window) => ({
  maximized: window.isMaximized(),
  focused: window.isFocused(),
  minimized: window.isMinimized(),
  visible: window.isVisible(),
});
function bindWindowChrome(window) {
  const send = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('window-state-changed', stateFor(window));
  };
  for (const name of [
    'maximize',
    'unmaximize',
    'restore',
    'minimize',
    'focus',
    'blur',
    'show',
    'hide',
  ])
    window.on(name, send);
  window.webContents.on('did-finish-load', send);
}
function registerWindowChrome(guard) {
  ipcMain.handle('window-state', (event) => {
    try {
      guard(event);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error('窗口已关闭');
      return { ok: true, data: stateFor(window) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('window-control', (event, action) => {
    try {
      guard(event);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error('窗口已关闭');
      if (action === 'minimize') window.minimize();
      else if (action === 'maximize') {
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
      } else if (action === 'close')
        setImmediate(() => {
          if (!window.isDestroyed()) window.close();
        });
      else throw new Error('无效窗口操作');
      return { ok: true, data: stateFor(window) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}
module.exports = { bindWindowChrome, registerWindowChrome };
