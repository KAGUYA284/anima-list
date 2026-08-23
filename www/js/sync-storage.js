import {
    DATA_VERSION_KEY, LAST_REVISION_KEY, LAST_SYNCED_HASH_KEY, LAST_UPDATED_KEY,
    LOCAL_DIRTY_KEY, SCHEMA_VERSION,
} from './constants.js';

function nonNegativeInteger(key, fallback = 0) {
    const value = Number(localStorage.getItem(key));
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export const syncDataStorage = {
    getRevision: () => nonNegativeInteger(LAST_REVISION_KEY),
    setRevision: value => localStorage.setItem(LAST_REVISION_KEY, String(Math.max(0, Math.trunc(Number(value) || 0)))),
    isDirty: () => localStorage.getItem(LOCAL_DIRTY_KEY) === 'true',
    setDirty: value => localStorage.setItem(LOCAL_DIRTY_KEY, String(Boolean(value))),
    getClientUpdatedAt: () => nonNegativeInteger(LAST_UPDATED_KEY),
    setClientUpdatedAt: value => localStorage.setItem(LAST_UPDATED_KEY, String(Math.max(0, Math.trunc(Number(value) || 0)))),
    getDataVersion: () => nonNegativeInteger(DATA_VERSION_KEY, SCHEMA_VERSION),
    setDataVersion: value => localStorage.setItem(DATA_VERSION_KEY, String(value)),
    getLastHash: () => localStorage.getItem(LAST_SYNCED_HASH_KEY) || '',
    setLastHash: value => localStorage.setItem(LAST_SYNCED_HASH_KEY, String(value || '')),
};
