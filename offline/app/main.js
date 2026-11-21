// Highline Run for Windows: the same single-page game in its own window, no internet needed. Saves stay on this PC.
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

app.setName('Highline Run');
Menu.setApplicationMenu(null);

function open() {
  const win = new BrowserWindow({
    width: 1280, height: 760, minWidth: 640, minHeight: 400, backgroundColor: '#0e1114', title: 'Highline Run',
    icon: path.join(__dirname, 'icon.png'), show: false, fullscreen: !process.env.HIGHLINE_WINDOWED,   // starts full screen; F11 or the menu switches
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', (e) => e.preventDefault());
  // F11 or Alt+Enter: full screen
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.alt && input.key === 'Enter'))) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // the game never leaves its page; web links open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) e.preventDefault(); });
  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}
// the page's Full screen and Exit game buttons
ipcMain.handle('fullscreen', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (!w) return false; w.setFullScreen(on == null ? !w.isFullScreen() : !!on); return w.isFullScreen(); });
ipcMain.handle('isFullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); return !!(w && w.isFullScreen()); });
ipcMain.on('quit', () => app.quit());

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(open);
  app.on('window-all-closed', () => app.quit());
}
