// ============================================================
// 数据持久化层 - Anime Tracker
// ============================================================

/** 从 localStorage 加载番剧列表 */
function loadFromStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

/** 保存番剧列表到 localStorage */
function saveToStorage(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save:', e);
    }
}

/** 加载折叠状态 */
function loadCollapsed() {
    try {
        const data = localStorage.getItem(COLLAPSE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

/** 保存折叠状态 */
function saveCollapsed(ids) {
    try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(ids));
    } catch (e) {}
}
