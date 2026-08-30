const { existsSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { app, BrowserWindow, ipcMain, net, safeStorage, session, shell } = require('electron');
const http = require('node:http');
const path = require('node:path');

const YUC_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const YUC_TIMEOUT_MS = 15000;

function fetchYucPage(season) {
    return new Promise((resolve, reject) => {
        if (!/^\d{4}(01|04|07|10)$/.test(String(season || ''))) {
            reject(new Error('Invalid yuc season'));
            return;
        }
        const request = http.request({
            hostname: 'yuc.wiki',
            port: 80,
            path: `/${season}/`,
            method: 'GET',
            headers: {
                'User-Agent': 'AnimaList/1.2.1 (+desktop direct yuc reader)',
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Encoding': 'identity',
            },
        }, response => {
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`Yuc 返回 ${response.statusCode || 502}`));
                return;
            }
            const chunks = [];
            let size = 0;
            response.on('data', chunk => {
                size += chunk.length;
                if (size > YUC_MAX_RESPONSE_BYTES) request.destroy(new Error('Yuc 页面过大'));
                else chunks.push(chunk);
            });
            response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        request.setTimeout(YUC_TIMEOUT_MS, () => request.destroy(new Error('Yuc 请求超时')));
        request.on('error', reject);
        request.end();
    });
}

ipcMain.handle('yuc.fetch', (_event, season) => fetchYucPage(season));

function tokenFile() {
    return path.join(app.getPath('userData'), 'auth-token.bin');
}

ipcMain.handle('secure-token.get', () => {
    try {
        if (!safeStorage.isEncryptionAvailable() || !existsSync(tokenFile())) return null;
        return safeStorage.decryptString(readFileSync(tokenFile()));
    } catch { return null; }
});
ipcMain.handle('secure-token.set', (_event, token) => {
    if (!safeStorage.isEncryptionAvailable() || typeof token !== 'string' || token.length > 8192) return false;
    writeFileSync(tokenFile(), safeStorage.encryptString(token));
    return true;
});
ipcMain.handle('secure-token.remove', () => {
    if (existsSync(tokenFile())) rmSync(tokenFile(), { force: true });
    return true;
});
ipcMain.handle('sync.fetch', async (_event, rawUrl, options = {}) => {
    const url = new URL(String(rawUrl || ''));
    const localDevelopment = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localDevelopment) throw new Error('同步服务仅允许 HTTPS');
    if (!url.pathname.startsWith('/api/')) throw new Error('同步服务路径无效');
    const method = ['GET', 'POST', 'PUT'].includes(options.method) ? options.method : 'GET';
    // Electron 的 net.fetch 使用 Chromium 网络栈并遵循系统代理；Node 全局 fetch
    // 在使用系统代理的网络环境下可能直接报 TypeError: fetch failed。
    const response = await net.fetch(url.href, {
        method,
        headers: options.headers && typeof options.headers === 'object' ? options.headers : {},
        body: method === 'GET' ? undefined : String(options.body || ''),
        signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    if (body.length > 2 * 1024 * 1024) throw new Error('同步服务响应过大');
    return { status: response.status, ok: response.ok, body };
});

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
            preload: path.join(__dirname, 'preload.cjs'),
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
