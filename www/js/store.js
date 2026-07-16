import { normalizeAnimeRecord } from './data.js';
import { loadFromStorage, loadSettings, saveSettings, saveToStorage } from './storage.js';
import { generateId } from './utils.js';

export const DEFAULT_SETTINGS = {
    listStyle: 'text',
    darkMode: false,
    apiEndpoint: 'direct',
};

let renderCallback = () => {};

export let state = {
    animeList: loadFromStorage(),
    filter: 'all',
    searchQuery: '',
    currentPage: 'list',
    currentAnimeId: null,
    settings: { ...DEFAULT_SETTINGS, ...loadSettings() },
};

export function setRenderer(callback) {
    renderCallback = callback;
}

export function setState(updates, { render = true } = {}) {
    state = { ...state, ...updates };
    if (render) renderCallback();
}

export function updateSettings(updates) {
    const settings = { ...state.settings, ...updates };
    saveSettings(settings);
    setState({ settings });
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

export function addAnime(animeData) {
    const now = new Date().toISOString();
    const anime = normalizeAnimeRecord({ ...animeData, id: generateId(), createdAt: now, updatedAt: now });
    const animeList = [...state.animeList, anime];
    if (!saveToStorage(animeList)) return false;
    setState({ animeList, currentPage: 'list', currentAnimeId: null });
    return true;
}

export function updateAnime(id, updates, { render = true } = {}) {
    let changed = false;
    const animeList = state.animeList.map(anime => {
        if (anime.id !== id) return anime;
        changed = true;
        return normalizeAnimeRecord({ ...anime, ...updates, id, updatedAt: new Date().toISOString() });
    });
    if (!changed || !saveToStorage(animeList)) return false;
    setState({ animeList }, { render });
    return true;
}

export function replaceAnimeList(records) {
    if (!saveToStorage(records)) return false;
    setState({ animeList: records });
    return true;
}

export function deleteAnime(id) {
    const animeList = state.animeList.filter(anime => anime.id !== id);
    if (!saveToStorage(animeList)) return false;
    setState({ animeList, currentPage: 'list', currentAnimeId: null });
    return true;
}
