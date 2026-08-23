import { APP_VERSION, SCHEMA_VERSION, SYNC_API_URL } from './constants.js';
import { readBackup } from './data.js';
import { secureTokenStorage } from './secure-storage.js';
import { replaceAnimeList, state } from './store.js';
import { syncDataStorage } from './sync-storage.js';
import { decideSyncAction } from './sync-core.js';

const AUTH_USER_KEY = 'ANIMA_AUTH_USER';
let syncStatus = { phase: 'idle', message: '尚未同步', lastSyncedAt: 0, conflict: null };
let autoSyncTimer = null;

export class SyncConflictError extends Error {
    constructor(remote, localSnapshot) {
        super('SYNC_CONFLICT');
        this.name = 'SyncConflictError';
        this.remote = remote;
        this.localSnapshot = localSnapshot;
    }
}

export function getSyncStatus() { return syncStatus; }
export function getStoredUser() {
    try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null'); } catch { return null; }
}

function setStatus(updates) {
    syncStatus = { ...syncStatus, ...updates };
    window.dispatchEvent(new CustomEvent('sync-state-changed', { detail: syncStatus }));
}

export function normalizeSyncApiUrl(value) {
    const raw = String(value || '').trim().replace(/\/+$/, '');
    if (!raw) return '';
    try {
        const url = new URL(raw);
        if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.href.replace(/\/+$/, '');
    } catch { /* invalid URL */ }
    throw new Error('同步服务地址必须使用 HTTPS（本机开发地址除外）');
}

async function apiRequest(path, options = {}) {
    const base = normalizeSyncApiUrl(SYNC_API_URL);
    const token = await secureTokenStorage.getToken();
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    const attempts = options.method === 'GET' || !options.method ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const desktopFetch = globalThis.animaListDesktop?.syncFetch;
            if (desktopFetch) {
                const result = await desktopFetch(`${base}${path}`, { method: options.method || 'GET', headers, body: options.body || '' });
                response = { status: result.status, ok: result.ok, json: async () => JSON.parse(result.body) };
            } else response = await fetch(`${base}${path}`, { ...options, headers });
            break;
        }
        catch (error) {
            if (attempt + 1 >= attempts) throw error;
            await new Promise(resolve => setTimeout(resolve, 350));
        }
    }
    let payload = null;
    try { payload = await response.json(); } catch { /* handled below */ }
    if (response.status === 401) {
        await logout();
        throw new Error('登录状态已失效，请重新登录');
    }
    if (!response.ok) {
        if (response.status === 409 && payload?.error?.code === 'SYNC_CONFLICT') {
            throw new SyncConflictError(payload.remote, createLocalSnapshot());
        }
        throw new Error(payload?.error?.message || `云同步请求失败（${response.status}）`);
    }
    return payload?.data;
}

export async function register(email, password) {
    return apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function login(email, password) {
    const data = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!(await secureTokenStorage.setToken(data.accessToken))) throw new Error('当前设备安全凭据存储不可用');
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    setStatus({ phase: 'idle', message: '已登录，等待同步', conflict: null });
    return data.user;
}

export async function logout() {
    await secureTokenStorage.removeToken();
    localStorage.removeItem(AUTH_USER_KEY);
    setStatus({ phase: 'idle', message: '尚未登录', conflict: null });
}

export function createLocalSnapshot() {
    return { schemaVersion: SCHEMA_VERSION, records: state.animeList };
}

async function hashSnapshot(snapshot) {
    const canonicalize = value => {
        if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
        if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
        return JSON.stringify(value);
    };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(snapshot)));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function upload(snapshot, baseRevision) {
    const data = await apiRequest('/api/sync', {
        method: 'PUT',
        body: JSON.stringify({
            snapshot, dataVersion: SCHEMA_VERSION, appVersion: APP_VERSION, baseRevision,
            clientUpdatedAt: syncDataStorage.getClientUpdatedAt() || Date.now(),
        }),
    });
    syncDataStorage.setRevision(data.revision);
    syncDataStorage.setDirty(false);
    syncDataStorage.setLastHash(data.dataHash);
    return data;
}

function applyRemote(remote) {
    const { records } = readBackup(remote.snapshot);
    if (!replaceAnimeList(records, { markDirty: false })) throw new Error('云端数据无法写入本地');
    syncDataStorage.setRevision(remote.revision);
    syncDataStorage.setDirty(false);
    syncDataStorage.setDataVersion(remote.dataVersion || SCHEMA_VERSION);
    syncDataStorage.setLastHash(remote.dataHash || '');
}

export async function syncNow() {
    if (!getStoredUser() || !(await secureTokenStorage.getToken())) throw new Error('请先登录云同步账号');
    if (!navigator.onLine) { setStatus({ phase: 'offline', message: '当前离线，联网后自动同步' }); return { action: 'offline' }; }
    setStatus({ phase: 'syncing', message: '正在检查云端数据…', conflict: null });
    try {
        const remote = await apiRequest('/api/sync', { method: 'GET' });
        const localSnapshot = createLocalSnapshot();
        const localHash = await hashSnapshot(localSnapshot);
        const action = decideSyncAction({
            remoteRevision: Number(remote.revision) || 0,
            localRevision: syncDataStorage.getRevision(),
            localDirty: syncDataStorage.isDirty(),
            localCount: state.animeList.length,
            remoteHash: remote.dataHash || '', localHash,
        });
        if (action === 'upload') await upload(localSnapshot, Number(remote.revision) || 0);
        else if (action === 'download') applyRemote(remote);
        else if (action === 'accept-equal') {
            syncDataStorage.setRevision(remote.revision);
            syncDataStorage.setDirty(false);
            syncDataStorage.setLastHash(remote.dataHash || localHash);
        } else if (action === 'conflict') throw new SyncConflictError(remote, localSnapshot);
        const now = Date.now();
        setStatus({ phase: 'success', message: action === 'none' ? '本地与云端已一致' : '同步完成', lastSyncedAt: now, conflict: null });
        return { action, remote };
    } catch (error) {
        if (error instanceof SyncConflictError) {
            setStatus({ phase: 'conflict', message: '检测到多设备修改冲突', conflict: error });
        } else setStatus({ phase: 'error', message: error.message || '同步失败' });
        throw error;
    }
}

export async function resolveConflict(choice, conflict = syncStatus.conflict) {
    if (!(conflict instanceof SyncConflictError)) throw new Error('没有待处理的同步冲突');
    if (choice === 'remote') {
        applyRemote(conflict.remote);
        setStatus({ phase: 'success', message: '已使用云端数据', lastSyncedAt: Date.now(), conflict: null });
        return;
    }
    if (choice === 'local') {
        const latest = await apiRequest('/api/sync', { method: 'GET' });
        await upload(conflict.localSnapshot, Number(latest.revision) || 0);
        setStatus({ phase: 'success', message: '已确认使用本地数据覆盖云端', lastSyncedAt: Date.now(), conflict: null });
        return;
    }
    throw new Error('未知冲突处理方式');
}

export function scheduleAutoSync() {
    clearTimeout(autoSyncTimer);
    if (!getStoredUser()) return;
    autoSyncTimer = setTimeout(() => syncNow().catch(() => {}), 1500);
}

window.addEventListener('anime-data-dirty', scheduleAutoSync);
window.addEventListener('online', scheduleAutoSync);
window.addEventListener('offline', () => setStatus({ phase: 'offline', message: '当前离线，联网后自动同步' }));
