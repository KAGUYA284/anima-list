// ============================================================
// 状态管理 - Anime Tracker
// ============================================================

/** 全局应用状态 */
let state = {
    animeList: loadFromStorage(),
    filter: 'all',
    searchQuery: '',
    currentPage: 'list',
    currentAnime: null
};

/** 更新状态并触发重新渲染 */
function setState(updates) {
    state = { ...state, ...updates };
    render();
}

/** 获取按筛选条件和搜索查询过滤后的番剧列表 */
function getFilteredAnime() {
    let list = state.animeList;
    if (state.filter !== 'all') {
        list = list.filter(anime => anime.status === state.filter);
    }
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        list = list.filter(anime => anime.title.toLowerCase().includes(q));
    }
    return list;
}

/** 根据 ID 获取单部番剧 */
function getAnimeById(id) {
    return state.animeList.find(a => a.id === id);
}

/** 添加新番剧 */
function addAnime(animeData) {
    const newAnime = {
        ...animeData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    const newList = [...state.animeList, newAnime];
    saveToStorage(newList);
    setState({ animeList: newList, currentPage: 'list' });
}

/** 更新番剧信息（部分更新） */
function updateAnime(id, updates) {
    const newList = state.animeList.map(anime =>
        anime.id === id
            ? { ...anime, ...updates, updatedAt: new Date().toISOString() }
            : anime
    );
    saveToStorage(newList);
    setState({ animeList: newList });
}

/** 删除番剧 */
function deleteAnime(id) {
    const newList = state.animeList.filter(a => a.id !== id);
    saveToStorage(newList);
    setState({
        animeList: newList,
        currentPage: 'list'
    });
}
