import { normalizeAnimeRecord } from './data.js';
import { loadFromStorage, loadSettings, saveSettings, saveToStorage } from './storage.js';
import { generateId } from './utils.js';
import { readOperationBackup, saveOperationBackup } from './backups.js';

export const DEFAULT_SETTINGS = {
    listStyle: 'cover',
    darkMode: false,
    apiEndpoint: 'direct',
    showAnimeDetails: true,
    listOrder: 'time',
    updateOrderStart: 'yesterday',
    episodeNotesCollapsed: false,
    startupToday: true,
    startupYesterday: false,
    userGuideSeen: false,
};

const { updateSource: _legacyUpdateSource, syncApiUrl: _legacySyncApiUrl, ...storedSettings } = loadSettings();

let renderCallback = () => {};
const pendingDeletions = new Map();
export const DELETE_UNDO_MS = 15000;

function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function applyCompletionDate(previous, updates) {
    const next = { ...previous, ...updates };
    if (next.type !== 'binge') return next;

    if (previous.status !== 'completed' && next.status === 'completed' && !next.completedDate) {
        next.completedDate = localDateString();
    } else if (
        previous.status === 'completed'
        && next.status !== 'completed'
        && !Object.hasOwn(updates, 'completedDate')
    ) {
        next.completedDate = '';
    }
    return next;
}

export let state = {
    animeList: loadFromStorage(),
    filter: 'all',
    searchQuery: '',
    currentPage: 'list',
    currentAnimeId: null,
    yucSeason: '',
    settings: {
        ...DEFAULT_SETTINGS,
        ...storedSettings,
        updateOrderStart: storedSettings.updateOrderStart === 'today' ? 'today' : 'yesterday',
    },
};

export function setRenderer(callback) {
    renderCallback = callback;
}

export function setState(updates, { render = true } = {}) {
    const previousList = state.animeList;
    state = { ...state, ...updates };
    if (render) renderCallback();
    if (previousList !== state.animeList) {
        globalThis.window?.dispatchEvent?.(new CustomEvent('anime-list-changed'));
    }
}

export function updateSettings(updates, { render = true } = {}) {
    const settings = { ...state.settings, ...updates };
    settings.updateOrderStart = settings.updateOrderStart === 'today' ? 'today' : 'yesterday';
    saveSettings(settings);
    setState({ settings }, { render });
}

export function getFilteredAnime() {
    let list = state.animeList;
    if (state.filter !== 'all') list = list.filter(anime => anime.status === state.filter);
    if (state.searchQuery) {
        const query = state.searchQuery.toLocaleLowerCase('zh-CN');
        list = list.filter(anime => anime.title.toLocaleLowerCase('zh-CN').includes(query));
    }
    return list;
}

export function getAnimeById(id) {
    return state.animeList.find(anime => anime.id === id) || null;
}

export function getCurrentAnime() {
    return getAnimeById(state.currentAnimeId);
}

export function addAnime(animeData, { navigate = true, render = true } = {}) {
    const now = new Date().toISOString();
    const initial = applyCompletionDate({ status: '', type: animeData.type }, animeData);
    const anime = normalizeAnimeRecord({ ...initial, id: generateId(), createdAt: now, updatedAt: now });
    const animeList = [...state.animeList, anime];
    if (!saveToStorage(animeList)) return false;
    setState({
        animeList,
        ...(navigate ? { currentPage: 'list' } : {}),
        currentAnimeId: null,
    }, { render });
    return true;
}

export function updateAnime(id, updates, { render = true } = {}) {
    let changed = false;
    const animeList = state.animeList.map(anime => {
        if (anime.id !== id) return anime;
        changed = true;
        const next = applyCompletionDate(anime, updates);
        if (Object.hasOwn(updates, 'bgmId') && String(updates.bgmId || '') !== String(anime.bgmId || '') && !Object.hasOwn(updates, 'metadata')) {
            next.metadata = {};
        }
        const previousEpisode = Number(anime.currentEpisode) || 0;
        const nextEpisode = Math.min(Number(next.currentEpisode) || 0, Number(next.totalEpisodes) || 1);
        if (nextEpisode > previousEpisode) {
            next.episodeNotes = { ...next.episodeNotes };
            const watchedAt = new Date().toISOString();
            for (let episode = previousEpisode + 1; episode <= nextEpisode; episode += 1) {
                const note = next.episodeNotes[episode] || {};
                if (!note.watchedAt) next.episodeNotes[episode] = { ...note, watchedAt };
            }
        }
        return normalizeAnimeRecord({
            ...next,
            id,
            updatedAt: new Date().toISOString(),
        });
    });
    if (!changed || !saveToStorage(animeList)) return false;
    setState({ animeList }, { render });
    return true;
}

export function replaceAnimeList(records, { markDirty = true, backupReason = '', render = true } = {}) {
    if (backupReason && !saveOperationBackup(state.animeList, backupReason)) return false;
    if (!saveToStorage(records, { markDirty })) return false;
    setState({ animeList: records }, { render });
    return true;
}

export function clearAnimeList() {
    if (!saveOperationBackup(state.animeList, '清空所有番剧前')) return false;
    if (!saveToStorage([])) return false;
    setState({ animeList: [], currentPage: 'settings', currentAnimeId: null });
    return true;
}

export function deleteAnime(id) {
    const index = state.animeList.findIndex(anime => anime.id === id);
    if (index < 0) return false;
    const anime = state.animeList[index];
    const animeList = state.animeList.filter(anime => anime.id !== id);
    if (!saveToStorage(animeList)) return false;
    setState({ animeList, currentPage: 'list', currentAnimeId: null });
    const token = generateId();
    pendingDeletions.set(token, { anime, index, expiresAt: Date.now() + DELETE_UNDO_MS });
    const timer = setTimeout(() => pendingDeletions.delete(token), DELETE_UNDO_MS);
    timer.unref?.();
    globalThis.window?.dispatchEvent?.(new CustomEvent('anime-deleted', { detail: { token, title: anime.title } }));
    return true;
}

export function undoDeletedAnime(token) {
    const deleted = pendingDeletions.get(token);
    if (!deleted || deleted.expiresAt < Date.now()) return false;
    if (state.animeList.some(anime => anime.id === deleted.anime.id || (anime.bgmId && anime.bgmId === deleted.anime.bgmId))) return false;
    const animeList = [...state.animeList];
    animeList.splice(Math.min(deleted.index, animeList.length), 0, deleted.anime);
    if (!saveToStorage(animeList)) return false;
    pendingDeletions.delete(token);
    setState({ animeList });
    return true;
}

export function restoreLocalBackup(id) {
    const records = readOperationBackup(id);
    return records ? replaceAnimeList(records, { backupReason: '恢复自动备份前' }) : false;
}
