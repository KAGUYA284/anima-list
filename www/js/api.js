import { state } from './store.js';

const API_PROXIES = {
    direct: 'https://api.bgm.tv',
    proxy1: 'https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com',
};

const responseCache = new Map();
const inFlight = new Map();
const DEFAULT_TIMEOUT_MS = 10000;
const CACHE_STORAGE_KEY = 'anime-tracker-api-cache-v1';
const MAX_PERSISTED_CACHE_ENTRIES = 100;
const STALE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

function readPersistedCache() {
    try {
        const value = JSON.parse(globalThis.localStorage?.getItem(CACHE_STORAGE_KEY) || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

function persistCacheEntry(key, entry) {
    try {
        const cache = readPersistedCache();
        cache[key] = entry;
        const trimmed = Object.fromEntries(Object.entries(cache)
            .filter(([, value]) => value?.staleUntil > Date.now())
            .sort(([, a], [, b]) => b.expiresAt - a.expiresAt)
            .slice(0, MAX_PERSISTED_CACHE_ENTRIES));
        globalThis.localStorage?.setItem(CACHE_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (error) {
        console.warn('[API] Unable to persist cache', error);
    }
}

function getCacheEntry(key) {
    const memoryEntry = responseCache.get(key);
    if (memoryEntry) return memoryEntry;
    const storedEntry = readPersistedCache()[key];
    if (storedEntry?.staleUntil > Date.now() && Object.hasOwn(storedEntry, 'value')) {
        responseCache.set(key, storedEntry);
        return storedEntry;
    }
    return null;
}

export function getApiBaseUrl() {
    return API_PROXIES[state.settings.apiEndpoint] || API_PROXIES.direct;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function combineSignals(signals) {
    const controller = new AbortController();
    for (const signal of signals.filter(Boolean)) {
        if (signal.aborted) controller.abort(signal.reason);
        else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(new DOMException('请求超时', 'TimeoutError')), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: combineSignals([options.signal, timeoutController.signal]) });
    } finally {
        clearTimeout(timer);
    }
}

function unwrapProxyResponse(data) {
    if (data && typeof data === 'object' && typeof data.body === 'string') {
        try {
            return JSON.parse(data.body);
        } catch {
            return data;
        }
    }
    return data;
}

export async function apiFetch(url, options = {}, { retries = 2, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetchWithTimeout(url, options, timeoutMs);
            const text = await response.text();
            if (!response.ok) {
                const retryable = [429, 502, 503, 504].includes(response.status);
                if (retryable && attempt < retries) {
                    await delay(250 * (2 ** attempt) + Math.random() * 150);
                    continue;
                }
                throw new Error(`Bangumi API 返回 ${response.status}`);
            }
            try {
                return unwrapProxyResponse(JSON.parse(text));
            } catch {
                throw new Error('Bangumi API 返回了无效 JSON');
            }
        } catch (error) {
            if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
            lastError = error;
            if (attempt < retries) await delay(250 * (2 ** attempt) + Math.random() * 150);
        }
    }
    throw lastError || new Error('Bangumi API 请求失败');
}

async function cachedRequest(key, loader, ttlMs) {
    const cached = getCacheEntry(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (inFlight.has(key)) return inFlight.get(key);

    const promise = loader()
        .then(value => {
            const entry = {
                value,
                expiresAt: Date.now() + ttlMs,
                staleUntil: Date.now() + STALE_CACHE_MS,
            };
            responseCache.set(key, entry);
            persistCacheEntry(key, entry);
            return value;
        })
        .catch(error => {
            if (cached?.staleUntil > Date.now()) return cached.value;
            throw error;
        })
        .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
}

export async function searchBangumi(keyword, { signal } = {}) {
    const normalized = String(keyword || '').trim();
    if (!normalized) return [];
    const url = `${getApiBaseUrl()}/v0/search/subjects`;
    const data = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: normalized, filter: { type: [2] }, limit: 8 }),
        signal,
    });
    return (Array.isArray(data?.data) ? data.data : [])
        .filter(item => item && typeof item === 'object' && item.type === 2);
}

export function getBangumiSubject(id) {
    const key = `${getApiBaseUrl()}:subject:${id}`;
    return cachedRequest(key, async () => {
        const data = await apiFetch(`${getApiBaseUrl()}/v0/subjects/${encodeURIComponent(id)}`);
        return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    }, 6 * 60 * 60 * 1000);
}

export function getBangumiCharacters(id) {
    const key = `${getApiBaseUrl()}:characters:${id}`;
    return cachedRequest(key, async () => {
        const data = await apiFetch(`${getApiBaseUrl()}/v0/subjects/${encodeURIComponent(id)}/characters`);
        return Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [];
    }, 6 * 60 * 60 * 1000);
}
