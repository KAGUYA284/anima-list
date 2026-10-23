import { APP_VERSION, SCHEMA_VERSION, SYNC_API_URL } from './constants.js';
import { readBackup } from './data.js';
import { secureTokenStorage } from './secure-storage.js';
import { replaceAnimeList, state } from './store.js';
import { syncDataStorage } from './sync-storage.js';
import { decideSyncAction, hasSyncableAnimeList, hasSyncableSnapshot } from './sync-core.js';
import { saveOperationBackup } from './backups.js';

const AUTH_USER_KEY = 'ANIMA_AUTH_USER';
let syncStatus = { phase: 'idle', message: '尚未同步', lastSyncedAt: 0, conflict: null, protection: null };
let autoSyncTimer = null;
let localChangeVersion = 0;
let operationTail = Promise.resolve();
const pendingOperations = new Map();

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
    setStatus({ phase: 'idle', message: '已登录，等待同步', conflict: null, protection: null });
    return data.user;
}

export async function logout() {
    await secureTokenStorage.removeToken();
    localStorage.removeItem(AUTH_USER_KEY);
    setStatus({ phase: 'idle', message: '尚未登录', conflict: null, protection: null });
}

export function createLocalSnapshot() {
    // 可重新获取的资料保留在本机，云端额度用于观看进度和笔记。
    return {
        schemaVersion: SCHEMA_VERSION,
        records: state.animeList.map(({ metadata: _metadata, ...record }) => JSON.parse(JSON.stringify(record))),
    };
}

function captureLocal() {
    return { snapshot: createLocalSnapshot(), records: state.animeList, version: localChangeVersion };
}

function localChanged(captured) {
    return captured.records !== state.animeList || captured.version !== localChangeVersion;
}

function runOperation(key, operation) {
    if (pendingOperations.has(key)) return pendingOperations.get(key);
    const pending = operationTail.then(operation).catch(error => {
        if (error instanceof SyncConflictError) {
            setStatus({ phase: 'conflict', message: '检测到多设备修改冲突，请查看最新云端数据后选择', conflict: error, protection: null });
        } else if (error.protection) {
            setStatus({ phase: 'protected', message: error.message, conflict: null, protection: error.protection });
        } else {
            setStatus({ phase: 'error', message: error.message || '同步失败', conflict: null, protection: null });
        }
        throw error;
    });
    pendingOperations.set(key, pending);
    operationTail = pending.catch(() => {});
    const cleanup = () => { if (pendingOperations.get(key) === pending) pendingOperations.delete(key); };
    pending.then(cleanup, cleanup);
    return pending;
}

function protectedError(message, protection) {
    const error = new Error(message);
    error.protection = protection;
    return error;
}

async function requireLogin() {
    if (!getStoredUser() || !(await secureTokenStorage.getToken())) throw new Error('请先登录云同步账号');
}

function finishSync(message) {
    setStatus({ phase: 'success', message, lastSyncedAt: Date.now(), conflict: null, protection: null });
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

async function upload(captured, baseRevision, previousRemote = null) {
    if (hasSyncableSnapshot(previousRemote?.snapshot)) {
        const { records } = readBackup(previousRemote.snapshot);
        if (!saveOperationBackup(records, '覆盖云端前')) throw new Error('操作前备份保存失败，已停止覆盖云端');
    }
    const data = await apiRequest('/api/sync', {
        method: 'PUT',
        body: JSON.stringify({
            snapshot: captured.snapshot, dataVersion: SCHEMA_VERSION, appVersion: APP_VERSION, baseRevision,
            clientUpdatedAt: syncDataStorage.getClientUpdatedAt() || Date.now(),
        }),
    });
    syncDataStorage.setRevision(data.revision);
    const changedDuringUpload = localChanged(captured);
    syncDataStorage.setDirty(changedDuringUpload);
    syncDataStorage.setLastHash(data.dataHash);
    if (changedDuringUpload) scheduleAutoSync();
    return data;
}

function applyRemote(remote) {
    const { records } = readBackup(remote.snapshot);
    const byBangumiId = new Map(state.animeList.filter(record => record.bgmId).map(record => [record.bgmId, record]));
    const byId = new Map(state.animeList.map(record => [record.id, record]));
    for (const record of records) {
        const local = byBangumiId.get(record.bgmId) || byId.get(record.id);
        if (local && local.bgmId === record.bgmId && local.metadata
            && Object.values(local.metadata).some(value => typeof value === 'string' ? Boolean(value) : Object.keys(value || {}).length > 0)) {
            record.metadata = local.metadata;
        }
    }
    if (!replaceAnimeList(records, { markDirty: false, backupReason: '云端覆盖前' })) throw new Error('云端数据无法写入本地，请检查自动备份和存储空间');
    syncDataStorage.setRevision(remote.revision);
    syncDataStorage.setDirty(false);
    syncDataStorage.setDataVersion(remote.dataVersion || SCHEMA_VERSION);
    syncDataStorage.setLastHash(remote.dataHash || '');
}

export function syncNow() {
    return runOperation('sync', performSync);
}

async function performSync() {
    await requireLogin();
    if (!hasSyncableAnimeList(state.animeList)) {
        setStatus({ phase: 'protected', message: '本地番剧列表为空，不可同步', conflict: null, protection: 'local' });
        return { action: 'blocked-empty' };
    }
    if (!navigator.onLine) { setStatus({ phase: 'offline', message: '当前离线，联网后自动同步' }); return { action: 'offline' }; }
    setStatus({ phase: 'syncing', message: '正在检查云端数据…', conflict: null, protection: null });
    const remote = await apiRequest('/api/sync', { method: 'GET' });
    if (!hasSyncableSnapshot(remote.snapshot)) {
        setStatus({ phase: 'protected', message: '云端数据为空，不可同步', conflict: null, protection: 'remote' });
        return { action: 'blocked-empty-remote', remote };
    }
    let captured;
    let localHash;
    do {
        captured = captureLocal();
        localHash = await hashSnapshot(captured.snapshot);
    } while (localChanged(captured));
    if (!hasSyncableSnapshot(captured.snapshot)) {
        setStatus({ phase: 'protected', message: '本地番剧列表为空，不可同步', conflict: null, protection: 'local' });
        return { action: 'blocked-empty' };
    }
    const action = decideSyncAction({
        remoteRevision: Number(remote.revision) || 0,
        localRevision: syncDataStorage.getRevision(),
        localDirty: syncDataStorage.isDirty(),
        localCount: state.animeList.length,
        remoteHash: remote.dataHash || '', localHash,
    });
    if (action === 'upload') await upload(captured, Number(remote.revision) || 0, remote);
    else if (action === 'download') applyRemote(remote);
    else if (action === 'accept-equal') {
        syncDataStorage.setRevision(remote.revision);
        syncDataStorage.setDirty(false);
        syncDataStorage.setLastHash(remote.dataHash || localHash);
    } else if (action === 'conflict') throw new SyncConflictError(remote, captured.snapshot);
    finishSync(action === 'none' ? '本地与云端已一致' : (syncDataStorage.isDirty() ? '本次同步完成，新修改将继续同步' : '同步完成'));
    return { action, remote };
}

export function initializeCloud() {
    return runOperation('initialize', async () => {
        await requireLogin();
        if (!hasSyncableAnimeList(state.animeList)) throw protectedError('本地番剧列表为空，不能初始化云端', 'local');
        if (!navigator.onLine) throw new Error('当前离线，请联网后初始化云端');
        setStatus({ phase: 'syncing', message: '正在检查并初始化云端…', conflict: null, protection: null });
        const remote = await apiRequest('/api/sync', { method: 'GET' });
        if (hasSyncableSnapshot(remote.snapshot)) throw protectedError('云端已有番剧，请使用普通同步或从云端恢复', 'remote-existing');
        const captured = captureLocal();
        if (!hasSyncableSnapshot(captured.snapshot)) throw protectedError('本地番剧列表为空，不能初始化云端', 'local');
        await upload(captured, Number(remote.revision) || 0);
        finishSync(syncDataStorage.isDirty() ? '云端初始化完成，新修改将继续同步' : '云端初始化完成');
        return { action: 'initialize' };
    });
}

export function restoreFromCloud() {
    return runOperation('restore', async () => {
        await requireLogin();
        if (!navigator.onLine) throw new Error('当前离线，请联网后从云端恢复');
        setStatus({ phase: 'syncing', message: '正在从云端恢复…', conflict: null, protection: null });
        const captured = captureLocal();
        const remote = await apiRequest('/api/sync', { method: 'GET' });
        if (!hasSyncableSnapshot(remote.snapshot)) throw protectedError('云端数据为空，无法恢复', 'remote');
        if (localChanged(captured)) throw new Error('恢复期间本地记录已修改，请重新确认从云端恢复');
        applyRemote(remote);
        finishSync('已从云端恢复');
        return { action: 'restore', remote };
    });
}

export function resolveConflict(choice, conflict = syncStatus.conflict) {
    return runOperation(`resolve-${choice}`, () => performResolveConflict(choice, conflict));
}

async function performResolveConflict(choice, conflict) {
    await requireLogin();
    if (!(conflict instanceof SyncConflictError)) throw new Error('没有待处理的同步冲突');
    if (!hasSyncableSnapshot(conflict.remote?.snapshot)) {
        setStatus({ phase: 'protected', message: '云端数据为空，不可同步', conflict: null, protection: 'remote' });
        throw new Error('云端数据为空，不可同步');
    }
    if (choice === 'remote') {
        const captured = captureLocal();
        const latest = await apiRequest('/api/sync', { method: 'GET' });
        if (!hasSyncableSnapshot(latest.snapshot)) throw protectedError('云端数据为空，不可同步', 'remote');
        if (Number(latest.revision) !== Number(conflict.remote.revision)) throw new SyncConflictError(latest, createLocalSnapshot());
        if (localChanged(captured)) throw new SyncConflictError(latest, createLocalSnapshot());
        applyRemote(latest);
        finishSync('已使用云端数据');
        return;
    }
    if (choice === 'local') {
        if (!hasSyncableAnimeList(state.animeList)) throw new Error('本地番剧列表为空，不能覆盖云端数据');
        await upload(captureLocal(), Number(conflict.remote.revision) || 0, conflict.remote);
        finishSync(syncDataStorage.isDirty() ? '已使用本地数据，新修改将继续同步' : '已确认使用本地数据覆盖云端');
        return;
    }
    throw new Error('未知冲突处理方式');
}

export function scheduleAutoSync() {
    clearTimeout(autoSyncTimer);
    if (!getStoredUser()) return;
    autoSyncTimer = setTimeout(() => syncNow().catch(() => {}), 1500);
}

window.addEventListener('anime-data-dirty', () => { localChangeVersion += 1; scheduleAutoSync(); });
window.addEventListener('online', scheduleAutoSync);
window.addEventListener('offline', () => setStatus({ phase: 'offline', message: '当前离线，联网后自动同步' }));
