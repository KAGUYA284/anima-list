import { state } from './store.js';
import { safeImageUrl } from './utils.js';
import {
    getYucAnimeDirect,
    getYucSeasonList as fetchYucSeasonList,
    hasYucSeasonData,
    updatePeriodFromBroadcast,
    updatePeriodFromTime,
    yucSeasonFromDate,
} from './yuc.js';

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
const yucFetchedAt = new WeakMap();

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

async function imageResponseBlob(response) {
    if (!response.ok) throw new Error(`Image request returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let blobBytes = bytes;
    const encoding = String(response.headers.get('X-Encoding') || '').toLowerCase();
    const looksBinary = (bytes[0] === 0xff && bytes[1] === 0xd8)
        || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        || (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
        || (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46);
    if (!looksBinary && encoding !== 'binary') {
        const base64 = new TextDecoder('ascii').decode(bytes).trim();
        if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
            throw new Error('Image proxy returned an unsupported payload');
        }
        blobBytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    }
    return new Blob([blobBytes], { type: imageContentType(response.headers) });
}

/** Fetch image bytes for the local thumbnail store, with the same direct/proxy preference as the API. */
export async function fetchBangumiImageBlob(value, endpoint = state.settings.apiEndpoint) {
    const directUrl = safeImageUrl(value);
    if (!directUrl) throw new Error('封面地址无效');
    const proxyUrl = getBangumiImageUrl(directUrl, 'proxy1');
    const urls = [...new Set(endpoint === 'proxy1' ? [proxyUrl, directUrl] : [directUrl, proxyUrl])];
    let lastError;
    for (const url of urls) {
        try {
            const response = await fetchWithTimeout(url, { cache: 'force-cache', credentials: 'omit' });
            return await imageResponseBlob(response);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('封面下载失败');
}

/** Convert both native binary and SCF gateway Base64 responses into a browser image URL. */
export async function resolveBangumiImageUrl(value, endpoint = state.settings.apiEndpoint) {
    const directUrl = safeImageUrl(value);
    const proxyUrl = getBangumiImageUrl(directUrl, endpoint);
    if (!directUrl || proxyUrl === directUrl) return directUrl;
    if (proxyImageCache.has(proxyUrl)) return proxyImageCache.get(proxyUrl);

    const pending = (async () => {
        const response = await fetchWithTimeout(proxyUrl, { cache: 'force-cache' });
        return URL.createObjectURL(await imageResponseBlob(response));
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
        if (image.dataset.proxyLoading === 'true' || image.dataset.localThumbnail === 'true'
            || image.dataset.libraryPending === 'true') return;
        const directUrl = safeImageUrl(image.dataset.directSrc);
        if (!directUrl || getBangumiImageUrl(directUrl) === directUrl) return;
        image.dataset.proxyLoading = 'true';
        resolveBangumiImageUrl(directUrl)
            .then(url => {
                if (image.isConnected && image.dataset.localThumbnail !== 'true') image.src = url;
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

export function getBangumiEndpointOrder(endpoint = state.settings.apiEndpoint) {
    return endpoint === 'proxy1'
        ? [API_PROXIES.proxy1, API_PROXIES.direct]
        : [API_PROXIES.direct, API_PROXIES.proxy1];
}

async function apiFetchWithEndpointFallback(path, options = {}, { endpoint } = {}) {
    const bases = getBangumiEndpointOrder(endpoint);
    let lastError;
    for (const [index, base] of bases.entries()) {
        try {
            // 两个独立入口本身就是冗余：单个入口失败后立即切换，避免每个入口
            // 各自重试并等待多轮超时，造成搜索界面长时间无响应。
            const data = await apiFetch(`${base}${path}`, options, { retries: 0 });
            if (base !== API_PROXIES.direct && hasBrokenEncoding(data) && index + 1 < bases.length) {
                lastError = new Error('代理返回了损坏的 UTF-8 文本');
                continue;
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            lastError = error;
        }
    }
    throw lastError || new Error('Bangumi 直连与代理均不可用');
}

async function cachedRequest(key, loader, ttlMs, { forceRefresh = false } = {}) {
    const cached = getCacheEntry(key);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
    if (inFlight.has(key)) return inFlight.get(key);

    const promise = loader()
        .then(value => {
            const entry = {
                value,
                fetchedAt: Date.now(),
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
    return searchBangumiAt(keyword, { signal });
}

async function searchBangumiAt(keyword, { signal, endpoint } = {}) {
    const normalized = String(keyword || '').trim();
    if (!normalized) return [];
    const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: normalized, filter: { type: [2] }, limit: 8 }),
        signal,
    };
    const data = await apiFetchWithEndpointFallback('/v0/search/subjects', requestOptions, { endpoint });
    return (Array.isArray(data?.data) ? data.data : [])
        .filter(item => item && typeof item === 'object' && item.type === 2);
}

function normalizedAnimeTitle(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLocaleLowerCase('zh-CN')
        .replace(/(?:第\s*[\d一二三四五六七八九十]+\s*[季期]|season\s*\d+|part\.?\s*\d+)/gi, '')
        .replace(/[\p{P}\p{S}\s]/gu, '');
}

export function selectBangumiMatch(subjects, { title = '', titleCn = '', titleJp = '', airDate = '' } = {}) {
    const requested = [titleJp, titleCn, title].map(normalizedAnimeTitle).filter(Boolean);
    let best = null;
    for (const subject of Array.isArray(subjects) ? subjects : []) {
        const candidates = [subject?.name, subject?.name_cn].map(normalizedAnimeTitle).filter(Boolean);
        let score = 0;
        for (const left of requested) {
            for (const right of candidates) {
                if (left === right) score = Math.max(score, 100);
                else if (Math.min(left.length, right.length) >= 4 && (left.includes(right) || right.includes(left))) {
                    score = Math.max(score, 78);
                }
            }
        }
        if (airDate && subject?.date === airDate) score += 15;
        else if (airDate && subject?.date && subject.date.slice(0, 7) === airDate.slice(0, 7)) score += 5;
        if (!best || score > best.score) best = { score, subject };
    }
    return best?.score >= 78 ? best.subject : null;
}

export async function searchBangumiForYuc(record, { signal } = {}) {
    const title = record?.titleCn || record?.title || record?.titleJp || '';
    const titleJp = record?.titleJp || '';
    const keywords = [titleJp, record?.titleCn, record?.title]
        .map(value => String(value || '').trim())
        .filter((value, index, values) => value && values.indexOf(value) === index);
    for (const keyword of keywords) {
        const subjects = await searchBangumiAt(keyword, { signal, endpoint: 'proxy1' });
        const matched = selectBangumiMatch(subjects, {
            title,
            titleCn: record?.titleCn,
            titleJp,
            airDate: record?.schedule?.airDate,
        });
        if (matched) return matched;
    }
    return null;
}

export function getBangumiSubject(id, { forceRefresh = false } = {}) {
    const key = `${getApiBaseUrl()}:subject:${id}`;
    return cachedRequest(key, async () => {
        const data = await apiFetchWithEndpointFallback(`/v0/subjects/${encodeURIComponent(id)}`);
        return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    }, 6 * 60 * 60 * 1000, { forceRefresh });
}

export function getBangumiCharacters(id) {
    const key = `${getApiBaseUrl()}:characters:${id}`;
    return cachedRequest(key, async () => {
        const data = await apiFetchWithEndpointFallback(`/v0/subjects/${encodeURIComponent(id)}/characters`);
        return Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [];
    }, 6 * 60 * 60 * 1000);
}

export function getBangumiPersons(id) {
    const key = `${getApiBaseUrl()}:persons:${id}`;
    return cachedRequest(key, async () => {
        const data = await apiFetchWithEndpointFallback(`/v0/subjects/${encodeURIComponent(id)}/persons`);
        return Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [];
    }, 6 * 60 * 60 * 1000);
}

export function getCachedBangumiSubject(id) {
    const key = `${getApiBaseUrl()}:subject:${id}`;
    return getCacheEntry(key)?.value || null;
}

export function getBangumiSubjectFetchedAt(id) {
    const cached = getCacheEntry(`${getApiBaseUrl()}:subject:${id}`);
    const timestamp = cached?.fetchedAt || (cached?.expiresAt - 6 * 60 * 60 * 1000);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

export function getYucAnimeFetchedAt(record) {
    return record && typeof record === 'object' ? yucFetchedAt.get(record) || '' : '';
}

export async function getYucAnime({ title = '', titleCn = '', titleJp = '', airDate = '', forceRefresh = false } = {}) {
    const query = new URLSearchParams();
    if (title) query.set('title', String(title).slice(0, 300));
    if (titleCn) query.set('titleCn', String(titleCn).slice(0, 300));
    if (titleJp) query.set('titleJp', String(titleJp).slice(0, 300));
    if (airDate) query.set('airDate', String(airDate).slice(0, 10));
    if (forceRefresh) query.set('refresh', '1');
    if (![...query.keys()].some(key => key.startsWith('title'))) return null;
    if (airDate && !hasYucSeasonData(airDate)) return null;

    try {
        const direct = await getYucAnimeDirect({ title, titleCn, titleJp, airDate, forceRefresh });
        if (direct) {
            const season = yucSeasonFromDate(airDate);
            const result = { source: 'yuc.wiki', season, sourceUrl: `https://yuc.wiki/${season}/`, ...direct };
            yucFetchedAt.set(result, new Date().toISOString());
            return result;
        }
    } catch (error) {
        console.info('[Yuc] 端侧抓取失败，回退云函数', error.message);
    }

    const key = `${API_PROXIES.proxy1}:yuc:${query}`;
    const result = await cachedRequest(key, async () => {
        const data = await apiFetch(`${API_PROXIES.proxy1}/yuc/anime?${query}`, {}, {
            retries: 1,
            timeoutMs: 15000,
        });
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        if (data.schedule && !data.schedule.updatePeriod) {
            data.schedule.updatePeriod = updatePeriodFromBroadcast(data.schedule.broadcast)
                || updatePeriodFromTime(data.schedule.updateTime);
        }
        return data;
    }, 6 * 60 * 60 * 1000, { forceRefresh });
    if (result && typeof result === 'object') {
        const cached = getCacheEntry(key);
        const timestamp = cached?.fetchedAt || (cached?.expiresAt - 6 * 60 * 60 * 1000);
        if (Number.isFinite(timestamp)) yucFetchedAt.set(result, new Date(timestamp).toISOString());
    }
    return result;
}

export function getYucSeasonList(season) {
    return fetchYucSeasonList(season);
}
