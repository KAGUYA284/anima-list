// ============================================================
// Bangumi API 集成 - Anime Tracker
// ============================================================

/**
 * 搜索 Bangumi 番剧
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array>} 搜索结果列表
 */
async function searchBangumi(keyword) {
    const res = await fetch('https://api.bgm.tv/v0/search/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, filter: { type: [2] }, limit: 8 })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).filter(item => item.type === 2);
}

/**
 * 获取 Bangumi 番剧详情
 * @param {number|string} id - Bangumi 条目 ID
 * @returns {Promise<Object|null>} 番剧详情
 */
async function getBangumiSubject(id) {
    const res = await fetch('https://api.bgm.tv/v0/subjects/' + id);
    if (!res.ok) return null;
    return res.json();
}

/**
 * 获取 Bangumi 番剧角色与声优列表
 * @param {number|string} id - Bangumi 条目 ID
 * @returns {Promise<Array>} 角色列表
 */
async function getBangumiCharacters(id) {
    const res = await fetch('https://api.bgm.tv/v0/subjects/' + id + '/characters');
    if (!res.ok) return [];
    return res.json();
}
