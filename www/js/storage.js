import { COLLAPSE_KEY, SETTINGS_KEY, STORAGE_KEY } from './constants.js';
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

export function saveToStorage(data) {
    return writeJson(STORAGE_KEY, data);
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
