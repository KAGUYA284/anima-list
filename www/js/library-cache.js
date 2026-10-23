import {
    getBangumiSubject, getBangumiSubjectFetchedAt, getCachedBangumiSubject,
    getYucAnime, getYucAnimeFetchedAt, fetchBangumiImageBlob,
} from './api.js';
import { getAnimeById, state, updateAnime } from './store.js';
import { safeImageUrl } from './utils.js';
import { hasYucSeasonData } from './yuc.js';

const STAFF_FIELDS = [
    'originalWork', 'director', 'assistantDirector', 'seriesComposition',
    'characterDesign', 'animationCharacterDesign', 'animationStudio',
];
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 30 * 60 * 1000;
const attempts = new Map();
const imageLoads = new Map();
const objectUrls = new Map();
let databasePromise;
let queueTimer;
let runningPromise;
let rerun = false;

export function getLibraryMetadata(record) {
    return record?.metadata && typeof record.metadata === 'object' ? record.metadata : {};
}

/** Keep the last successful fields when a source has no new value. Image bytes never enter records. */
export function mergeLibraryMetadata(record, {
    subject = null, yuc = null, bangumiUpdatedAt = '', yucUpdatedAt = '',
} = {}, now = new Date().toISOString()) {
    const previous = getLibraryMetadata(record);
    const hasSubject = subject && (typeof subject.summary === 'string' || subject.images);
    const hasYuc = yuc && (yuc.staff || yuc.imageUrl);
    if (!hasSubject && !hasYuc) return previous;
    const metadata = { ...previous, staff: { ...previous.staff } };
    if (hasSubject) {
        metadata.summary = String(subject.summary || previous.summary || '').slice(0, 50000);
        metadata.coverUrl = safeImageUrl(subject.images?.large || subject.images?.common
            || subject.images?.medium || subject.images?.small) || previous.coverUrl || '';
        metadata.thumbnailUrl = safeImageUrl(subject.images?.medium || subject.images?.small
            || subject.images?.grid) || previous.thumbnailUrl || metadata.coverUrl || '';
        metadata.bangumiUpdatedAt = bangumiUpdatedAt || now;
    }
    if (hasYuc) {
        for (const key of STAFF_FIELDS) {
            const value = yuc.staff?.[key];
            if (typeof value === 'string' && value.trim()) metadata.staff[key] = value.trim().slice(0, 5000);
        }
        if (!metadata.coverUrl) metadata.coverUrl = safeImageUrl(yuc.imageUrl) || '';
        if (!metadata.thumbnailUrl) metadata.thumbnailUrl = safeImageUrl(yuc.imageUrl) || metadata.coverUrl || '';
        metadata.yucUpdatedAt = yucUpdatedAt || now;
    }
    metadata.updatedAt = [previous.updatedAt, metadata.bangumiUpdatedAt, metadata.yucUpdatedAt]
        .filter(value => value && Number.isFinite(Date.parse(value))).sort().at(-1) || now;
    return metadata;
}

export function persistLibraryMetadata(animeId, sources = {}) {
    const record = getAnimeById(animeId);
    if (!record) return null;
    if (record.bgmId && sources.subject?.id && String(sources.subject.id) !== record.bgmId) {
        return getLibraryMetadata(record);
    }
    const metadata = mergeLibraryMetadata(record, {
        ...sources,
        bangumiUpdatedAt: sources.bangumiUpdatedAt || getBangumiSubjectFetchedAt(sources.subject?.id),
        yucUpdatedAt: sources.yucUpdatedAt || getYucAnimeFetchedAt(sources.yuc),
    });
    if (JSON.stringify(metadata) !== JSON.stringify(getLibraryMetadata(record))) {
        if (!updateAnime(animeId, { metadata }, { render: false })) return null;
        globalThis.window?.dispatchEvent?.(new CustomEvent('library-metadata-updated', { detail: { id: animeId } }));
    }
    return metadata;
}

function openImageDatabase() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('anima-list-library', 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('thumbnails')) database.createObjectStore('thumbnails', { keyPath: 'url' });
        };
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => { database.close(); databasePromise = undefined; };
            resolve(database);
        };
        request.onerror = () => { databasePromise = undefined; reject(request.error); };
    });
    return databasePromise;
}

async function imageStoreRequest(mode, callback) {
    const database = await openImageDatabase();
    if (!database) return null;
    return new Promise((resolve, reject) => {
        const transaction = database.transaction('thumbnails', mode);
        const request = callback(transaction.objectStore('thumbnails'));
        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onerror = () => reject(transaction.error || request.error);
        transaction.onabort = () => reject(transaction.error || new Error('缩略图保存中断'));
    });
}

async function makeThumbnail(blob) {
    if (typeof globalThis.createImageBitmap !== 'function') return blob;
    const bitmap = await createImageBitmap(blob);
    try {
        const scale = Math.min(1, 240 / bitmap.width, 340 / bitmap.height);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        let canvas;
        if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(width, height);
        else if (globalThis.document?.createElement) {
            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
        }
        const context = canvas?.getContext('2d');
        if (!context) return blob;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        if (canvas.convertToBlob) return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.84 });
        return await new Promise(resolve => canvas.toBlob(result => resolve(result || blob), 'image/jpeg', 0.84));
    } finally {
        bitmap.close?.();
    }
}

function thumbnailSource(record) {
    const metadata = getLibraryMetadata(record);
    const subject = record?.bgmId ? getCachedBangumiSubject(record.bgmId) : null;
    return safeImageUrl(metadata.thumbnailUrl || metadata.coverUrl
        || subject?.images?.medium || subject?.images?.small || subject?.images?.large);
}

async function loadThumbnail(url, fetchMissing) {
    const saved = await imageStoreRequest('readonly', store => store.get(url));
    if (saved?.blob instanceof Blob) return saved.blob;
    if (!fetchMissing || globalThis.navigator?.onLine === false || !globalThis.indexedDB) return null;
    if (imageLoads.has(url)) return imageLoads.get(url);
    const promise = (async () => {
        const blob = await makeThumbnail(await fetchBangumiImageBlob(url));
        await imageStoreRequest('readwrite', store => store.put({ url, blob, savedAt: new Date().toISOString() }));
        return blob;
    })().finally(() => imageLoads.delete(url));
    imageLoads.set(url, promise);
    return promise;
}

/** A local Blob URL for list/detail images; null means no stored thumbnail is available. */
export async function resolveLibraryThumbnail(record, { fetchMissing = false } = {}) {
    const source = thumbnailSource(record);
    if (!source) return null;
    if (objectUrls.has(source)) return objectUrls.get(source);
    const blob = await loadThumbnail(source, fetchMissing);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrls.set(source, url);
    return url;
}

function shouldRefresh(record, source, forceRefresh) {
    const key = `${record.id}:${record.bgmId}:${source}`;
    const now = Date.now();
    if (!forceRefresh && now - (attempts.get(key) || 0) < RETRY_AFTER_MS) return false;
    const lastSuccess = Date.parse(getLibraryMetadata(record)[`${source}UpdatedAt`] || '');
    if (!forceRefresh && Number.isFinite(lastSuccess) && now - lastSuccess < REFRESH_AFTER_MS) return false;
    attempts.set(key, now);
    return true;
}

async function cacheRecord(record, forceRefresh) {
    let subject = null;
    const online = globalThis.navigator?.onLine !== false;
    if (online && record.bgmId && shouldRefresh(record, 'bangumi', forceRefresh)) {
        try {
            subject = await getBangumiSubject(record.bgmId, { forceRefresh });
            if (subject) persistLibraryMetadata(record.id, { subject });
        } catch (error) {
            console.info(`[Library] 保留《${record.title}》的本地资料`, error.message);
        }
    }
    const current = getAnimeById(record.id);
    if (!current || current.bgmId !== record.bgmId) return;
    if (online && hasYucSeasonData(current.airDate) && shouldRefresh(current, 'yuc', forceRefresh)) {
        try {
            const yuc = await getYucAnime({
                title: current.title,
                titleJp: current.titleJp || subject?.name || '',
                titleCn: subject?.name_cn || '',
                airDate: current.airDate,
                forceRefresh,
            });
            const latest = getAnimeById(record.id);
            if (yuc && latest?.bgmId === record.bgmId) persistLibraryMetadata(record.id, { yuc });
        } catch (error) {
            console.info(`[Library] 保留《${record.title}》的制作资料`, error.message);
        }
    }
    const latest = getAnimeById(record.id);
    if (!latest || latest.bgmId !== record.bgmId) return;
    const source = thumbnailSource(latest);
    if (!source) return;
    const imageKey = `image:${source}`;
    const allowFetch = online && (forceRefresh || Date.now() - (attempts.get(imageKey) || 0) >= RETRY_AFTER_MS);
    if (allowFetch) attempts.set(imageKey, Date.now());
    try {
        await loadThumbnail(source, allowFetch);
    } catch (error) {
        console.info(`[Library] 缩略图暂未缓存《${record.title}》`, error.message);
    }
}

/** Covers every saved status, including completed/dropped shows; runs only three records at a time. */
export async function cacheLibraryRecords({ forceRefresh = false } = {}) {
    if (runningPromise) { rerun = true; return runningPromise; }
    runningPromise = (async () => {
        const records = [...state.animeList];
        let next = 0;
        const worker = async () => {
            while (next < records.length) await cacheRecord(records[next++], forceRefresh);
        };
        await Promise.allSettled(Array.from({ length: Math.min(3, records.length) }, worker));
        globalThis.window?.dispatchEvent?.(new CustomEvent('library-cache-updated'));
    })().finally(() => {
        runningPromise = null;
        if (rerun) { rerun = false; queueLibraryCache(); }
    });
    return runningPromise;
}

export function queueLibraryCache({ retryFailed = false } = {}) {
    if (retryFailed) attempts.clear();
    clearTimeout(queueTimer);
    queueTimer = setTimeout(() => { void cacheLibraryRecords(); }, 800);
}
