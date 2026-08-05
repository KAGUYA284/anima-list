import { normalizeAnimeRecord } from './data.js';
import { loadFromStorage, loadSettings, saveSettings, saveToStorage } from './storage.js';
import { generateId } from './utils.js';

export const DEFAULT_SETTINGS = {
    listStyle: 'cover',
    darkMode: false,
    apiEndpoint: 'direct',
    showAnimeDetails: true,
    listOrder: 'time',
};

const { updateSource: _legacyUpdateSource, ...storedSettings } = loadSettings();

let renderCallback = () => {};

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
    settings: { ...DEFAULT_SETTINGS, ...storedSettings },
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

export function addAnime(animeData, { navigate = true } = {}) {
    const now = new Date().toISOString();
    const initial = applyCompletionDate({ status: '', type: animeData.type }, animeData);
    const anime = normalizeAnimeRecord({ ...initial, id: generateId(), createdAt: now, updatedAt: now });
    const animeList = [...state.animeList, anime];
    if (!saveToStorage(animeList)) return false;
    setState({
        animeList,
        ...(navigate ? { currentPage: 'list' } : {}),
        currentAnimeId: null,
    });
    return true;
}

export function updateAnime(id, updates, { render = true } = {}) {
    let changed = false;
    const animeList = state.animeList.map(anime => {
        if (anime.id !== id) return anime;
        changed = true;
        return normalizeAnimeRecord({
            ...applyCompletionDate(anime, updates),
            id,
            updatedAt: new Date().toISOString(),
        });
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
