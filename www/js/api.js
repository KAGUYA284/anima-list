// ============================================================
// Bangumi API 集成 - Anime Tracker
// ============================================================

/**
 * API 代理服务器地址配置
 * 直连：api.bgm.tv
 * 代理1：腾讯云函数代理
 * 代理2：备用代理
 */
const API_PROXIES = {
    direct: 'https://api.bgm.tv',
    proxy1: 'https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com'
};

/**
 * 获取当前选中的 API 基础地址
 * @returns {string} API 基础 URL
 */
function getApiBaseUrl() {
    const endpoint = state.settings.apiEndpoint || 'direct';
    return API_PROXIES[endpoint] || API_PROXIES.direct;
}

/**
 * 通用 fetch 封装：自动处理网络异常
 * @param {string} url - 完整请求 URL
 * @param {object} options - fetch 选项
 * @returns {Promise<Response|null>} 成功返回 Response，失败返回 null
 */
async function safeFetch(url, options) {
    try {
        const res = await fetch(url, options);
        return res;
    } catch (e) {
        console.error('[API] fetch 失败:', url, e.message);
        return null;
    }
}

/**
 * 检测并解包 SCF 云函数代理响应格式
 * 当 body 是字符串时尝试 JSON.parse 提取实际数据
 * @param {*} data - 待检测的响应
 * @returns {*} 解包后的实际数据
 */
function unwrapProxyResponse(data) {
    if (data && typeof data === 'object' && typeof data.body === 'string') {
        try {
            const parsed = JSON.parse(data.body);
            console.log('[API] 检测到包装格式，已解包 body');
            return parsed;
        } catch (e) {
            console.warn('[API] body 不是有效JSON，返回原始数据');
            return data;
        }
    }
    return data;
}

/**
 * 通用 API 请求：带原始文本日志、解包、错误兜底
 * @param {string} url - 请求 URL
 * @param {object} options - fetch 选项
 * @returns {Promise<*>} 解析后的响应数据，失败返回 null
 */
async function apiFetch(url, options) {
    const res = await safeFetch(url, options);
    if (!res) {
        console.error('[API] 请求无响应:', url);
        return null;
    }
    // 读取响应文本
    let text;
    try {
        text = await res.text();
    } catch (e) {
        console.error('[API] 读取响应文本失败:', url, e);
        return null;
    }
    console.log('[API] 原始响应(' + res.status + '):', text.substring(0, 400));
    if (!res.ok) {
        console.warn('[API] 状态异常:', res.status, text.substring(0, 200));
        return null;
    }
    // 尝试解析 JSON
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error('[API] JSON 解析失败:', text.substring(0, 200));
        return null;
    }
    return unwrapProxyResponse(data);
}

/**
 * 搜索 Bangumi 番剧
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array>} 搜索结果列表
 */
async function searchBangumi(keyword) {
    const baseUrl = getApiBaseUrl();
    const url = baseUrl + '/v0/search/subjects';
    const data = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, filter: { type: [2] }, limit: 8 })
    });
    if (!data) throw new Error('Bangumi API request failed');
    return (data.data || []).filter(item => item.type === 2);
}

/**
 * 获取 Bangumi 番剧详情
 * @param {number|string} id - Bangumi 条目 ID
 * @returns {Promise<Object|null>} 番剧详情
 */
async function getBangumiSubject(id) {
    const baseUrl = getApiBaseUrl();
    const url = baseUrl + '/v0/subjects/' + id;
    const data = await apiFetch(url);
    return data || null;
}

/**
 * 获取 Bangumi 番剧角色与声优列表
 * @param {number|string} id - Bangumi 条目 ID
 * @returns {Promise<Array>} 角色列表
 */
async function getBangumiCharacters(id) {
    const baseUrl = getApiBaseUrl();
    const url = baseUrl + '/v0/subjects/' + id + '/characters';
    const data = await apiFetch(url);
    if (Array.isArray(data)) return data;
    return [];
}
