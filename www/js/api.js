import { state } from './store.js';
import { safeImageUrl } from './utils.js';

const API_PROXIES = {
    direct: 'https://api.bgm.tv',
    proxy1: 'https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com',
};

const responseCache = new Map();
const inFlight = new Map();
const DEFAULT_TIMEOUT_MS = 10000;
// v2 invalidates responses produced by the old proxy, which could split UTF-8 characters across chunks.
const CACHE_STORAGE_KEY = 'anime-tracker-api-cache-v2';
const MAX_PERSISTED_CACHE_ENTRIES = 100;
const STALE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const proxyImageCache = new Map();

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

/** 代理模式下让 Bangumi 图片也经过同一代理，避免移动网络只能访问 API 文本而无法访问图片 CDN。 */
export function getBangumiImageUrl(value, endpoint = state.settings.apiEndpoint) {
    const directUrl = safeImageUrl(value);
    if (!directUrl || endpoint !== 'proxy1') return directUrl;

    const parsed = new URL(directUrl);
    if (parsed.hostname !== 'lain.bgm.tv') return directUrl;
    return `${API_PROXIES.proxy1}/image?url=${encodeURIComponent(directUrl)}`;
}

function imageContentType(headers) {
    const matches = String(headers.get('content-type') || '').match(/image\/(?:jpeg|png|webp|gif)/gi);
    return matches?.at(-1)?.toLowerCase() || 'image/jpeg';
}

/** Convert both native binary and SCF gateway Base64 responses into a browser image URL. */
export async function resolveBangumiImageUrl(value, endpoint = state.settings.apiEndpoint) {
    const directUrl = safeImageUrl(value);
    const proxyUrl = getBangumiImageUrl(directUrl, endpoint);
    if (!directUrl || proxyUrl === directUrl) return directUrl;
    if (proxyImageCache.has(proxyUrl)) return proxyImageCache.get(proxyUrl);

    const pending = (async () => {
        const response = await fetchWithTimeout(proxyUrl, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Image proxy returned ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let blobBytes = bytes;
        // 快路径：代理显式声明编码时按其处理，无需魔术字节猜测。
        const encoding = String(response.headers.get('X-Encoding') || '').toLowerCase();
        const looksBinary = (bytes[0] === 0xff && bytes[1] === 0xd8)
            || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
            || (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
            || (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46);
        // 头缺失或声明 base64 时回退到启发式判断（保持向后兼容，且不会
        // 覆盖对真实二进制的可靠识别——避免网关已解码时被误当作 base64）。
        const isKnownBinary = looksBinary || encoding === 'binary';
        if (!isKnownBinary) {
            const base64 = new TextDecoder('ascii').decode(bytes).trim();
            if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
                throw new Error('Image proxy returned an unsupported payload');
            }
            const decoded = atob(base64);
            blobBytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
        }
        return URL.createObjectURL(new Blob([blobBytes], { type: imageContentType(response.headers) }));
    })().catch(error => {
        proxyImageCache.delete(proxyUrl);
        throw error;
    });
    proxyImageCache.set(proxyUrl, pending);
    return pending;
}

/** Resolve proxy-backed images below a freshly rendered element. */
export function hydrateBangumiImages(root = document) {
    if (state.settings.apiEndpoint !== 'proxy1') return;
    root.querySelectorAll('img[data-direct-src]').forEach(image => {
        if (image.dataset.proxyLoading === 'true') return;
        const directUrl = safeImageUrl(image.dataset.directSrc);
        if (!directUrl || getBangumiImageUrl(directUrl) === directUrl) return;
        image.dataset.proxyLoading = 'true';
        resolveBangumiImageUrl(directUrl)
            .then(url => {
                if (image.isConnected) image.src = url;
            })
            .catch(error => console.warn('[Image proxy] Unable to decode image', error))
            .finally(() => { delete image.dataset.proxyLoading; });
    });
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

function hasBrokenEncoding(value) {
    try {
        return JSON.stringify(value).includes('\uFFFD');
    } catch {
        return false;
    }
}

export async function apiFetch(url, options = {}, { retries = 2, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetchWithTimeout(url, options, timeoutMs);
            const text = new TextDecoder('utf-8').decode(await response.arrayBuffer());
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

async function apiFetchWithEncodingFallback(path, options = {}) {
    const primaryBase = getApiBaseUrl();
    const primary = await apiFetch(`${primaryBase}${path}`, options);
    if (primaryBase === API_PROXIES.direct || !hasBrokenEncoding(primary)) return primary;

    try {
        const directOptions = { ...options };
        delete directOptions.signal;
        return await apiFetch(`${API_PROXIES.direct}${path}`, directOptions, { retries: 0 });
    } catch {
        throw new Error('代理返回了损坏的 UTF-8 文本，请更新代理后重试');
    }
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
    const data = await apiFetchWithEncodingFallback('/v0/search/subjects', {
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
        const data = await apiFetchWithEncodingFallback(`/v0/subjects/${encodeURIComponent(id)}`);
        return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    }, 6 * 60 * 60 * 1000);
}

export function getBangumiCharacters(id) {
    const key = `${getApiBaseUrl()}:characters:${id}`;
    return cachedRequest(key, async () => {
        const data = await apiFetchWithEncodingFallback(`/v0/subjects/${encodeURIComponent(id)}/characters`);
        return Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [];
    }, 6 * 60 * 60 * 1000);
}

export function getBangumiPersons(id) {
    const key = `${getApiBaseUrl()}:persons:${id}`;
    return cachedRequest(key, async () => {
        const data = await apiFetchWithEncodingFallback(`/v0/subjects/${encodeURIComponent(id)}/persons`);
        return Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [];
    }, 6 * 60 * 60 * 1000);
}

export function getCachedBangumiSubject(id) {
    const key = `${getApiBaseUrl()}:subject:${id}`;
    return getCacheEntry(key)?.value || null;
}

export function getYucAnime({ title = '', titleCn = '', titleJp = '', airDate = '' } = {}) {
    const query = new URLSearchParams();
    if (title) query.set('title', String(title).slice(0, 300));
    if (titleCn) query.set('titleCn', String(titleCn).slice(0, 300));
    if (titleJp) query.set('titleJp', String(titleJp).slice(0, 300));
    if (airDate) query.set('airDate', String(airDate).slice(0, 10));
    if (![...query.keys()].some(key => key.startsWith('title'))) return Promise.resolve(null);

    const key = `${API_PROXIES.proxy1}:yuc:${query}`;
    return cachedRequest(key, async () => {
        const data = await apiFetch(`${API_PROXIES.proxy1}/yuc/anime?${query}`, {}, {
            retries: 1,
            timeoutMs: 15000,
        });
        return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    }, 6 * 60 * 60 * 1000);
}
