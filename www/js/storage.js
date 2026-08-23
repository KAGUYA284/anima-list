import {
    COLLAPSE_KEY, DATA_VERSION_KEY, LAST_UPDATED_KEY, LEGACY_SYNC_DATA_KEY,
    LOCAL_DIRTY_KEY, SCHEMA_VERSION, SETTINGS_KEY, STORAGE_KEY,
} from './constants.js';
import { normalizeStoredRecords } from './data.js';

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        console.error(`[Storage] 读取 ${key} 失败`, error);
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`[Storage] 写入 ${key} 失败`, error);
        window.dispatchEvent(new CustomEvent('storage-error', { detail: { key, error } }));
        return false;
    }
}

export function loadFromStorage() {
    return normalizeStoredRecords(readJson(STORAGE_KEY, []));
}

export function saveToStorage(data, { markDirty = true } = {}) {
    if (!writeJson(STORAGE_KEY, data)) return false;
    // 同步方案要求保留的兼容键；主应用仍使用原键，避免升级后丢失既有数据。
    writeJson(LEGACY_SYNC_DATA_KEY, data);
    localStorage.setItem(DATA_VERSION_KEY, String(SCHEMA_VERSION));
    if (markDirty) {
        localStorage.setItem(LOCAL_DIRTY_KEY, 'true');
        localStorage.setItem(LAST_UPDATED_KEY, String(Date.now()));
        globalThis.window?.dispatchEvent?.(new CustomEvent('anime-data-dirty'));
    }
    return true;
}

export function loadCollapsed() {
    const value = readJson(COLLAPSE_KEY, []);
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

export function saveCollapsed(ids) {
    return writeJson(COLLAPSE_KEY, ids);
}

export function loadSettings() {
    const value = readJson(SETTINGS_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function saveSettings(settings) {
    return writeJson(SETTINGS_KEY, settings);
}
