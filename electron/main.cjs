const { existsSync } = require('node:fs');
const { app, BrowserWindow, session, shell } = require('electron');
const path = require('node:path');

// 缓存测试版随包放置此标记文件。其浏览器缓存、Local Storage、IndexedDB
// 等数据固定写入解压目录，便于携带和复现；正式便携版不放置该标记。
const portableCacheMarker = path.join(path.dirname(process.execPath), '.anima-list-cache-test');
if (existsSync(portableCacheMarker)) {
    app.setPath('userData', path.join(path.dirname(process.execPath), 'test-user-data'));
}

function createWindow() {
    const window = new BrowserWindow({
        width: 1180,
        height: 820,
        minWidth: 760,
        minHeight: 600,
        backgroundColor: '#f8f9fb',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function allowAppApiResponses() {
    session.defaultSession.webRequest.onHeadersReceived({
        urls: [
            'https://api.bgm.tv/*',
            'https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com/*',
        ],
    }, (details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Access-Control-Allow-Origin': ['*'],
                'Access-Control-Allow-Headers': ['Content-Type'],
            },
        });
    });
}

app.whenReady().then(() => {
    allowAppApiResponses();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
