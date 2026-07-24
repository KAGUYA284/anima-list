// ============================================================
// 纯函数 · 年/季分组、筛选与导入合并 - Anime Tracker
// ------------------------------------------------------------
// 无 DOM / 无副作用，便于 Node 单元测试。
// ============================================================

import { classifySeason } from './core.js';

function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) return null;
    const date = new Date(`${dateString}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeNow(now) {
    const date = now instanceof Date ? new Date(now) : new Date(now);
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

/**
 * 计算记录当前应显示的季度。
 *
 * - 追番：仅“在看”会随播出进度跨季，并停在末集播出的季度；
 *   已看完、搁置、想看等状态均按首播季度归档。
 * - 补番：“在看”随系统时间跨季，“已看完”按看完日期归档；
 *   其他状态按首播季度归档。
 */
export function getAnimeGroup(anime, now = new Date()) {
    const currentDate = normalizeNow(now);
    const airDate = anime.airDate || '';

    if (anime.type === 'binge') {
        if (anime.status === 'watching') {
            return classifySeason(toLocalDateString(currentDate), 'binge');
        }
        if (anime.status === 'completed') {
            return classifySeason(anime.completedDate || anime.startDate || airDate, 'binge');
        }
        return classifySeason(airDate || anime.startDate, 'binge');
    }

    if (anime.status !== 'watching') {
        return classifySeason(airDate, 'chasing');
    }

    const premiere = parseLocalDate(airDate);
    if (!premiere) return classifySeason('', 'chasing');

    const lastEpisode = new Date(premiere);
    const totalEpisodes = Math.max(1, Number(anime.totalEpisodes) || 1);
    lastEpisode.setDate(lastEpisode.getDate() + (totalEpisodes - 1) * 7);

    const activeDate = currentDate < premiere
        ? premiere
        : currentDate > lastEpisode ? lastEpisode : currentDate;
    return classifySeason(toLocalDateString(activeDate), 'chasing');
}

/** 构建年/季分组 */
export function buildGroups(animeList, now = new Date()) {
    const groups = {};
    animeList.forEach(anime => {
        const { year, quarter } = getAnimeGroup(anime, now);
        if (!groups[year]) groups[year] = {};
        if (!groups[year][quarter]) groups[year][quarter] = [];
        groups[year][quarter].push(anime);
    });
    return groups;
}

/** 根据 map 筛选数据 */
export function buildFilteredData(map, animeList) {
    const selected = [];
    const groups = buildGroups(animeList);
    for (const [year, yearInfo] of Object.entries(map)) {
        if (!groups[year]) continue;
        for (const [quarter, checked] of Object.entries(yearInfo.quarters)) {
            if (checked && groups[year][quarter]) {
                for (const anime of groups[year][quarter]) {
                    selected.push(anime);
                }
            }
        }
    }
    return selected;
}

/**
 * 以番剧标准化名称 / Bangumi 条目为合并键，导入数据覆盖本地同键记录。
 * @returns {{ merged: object[], localCount: number, importedCount: number }}
 */
export function mergeImport(localList, importedRecords) {
    const merged = new Map();
    const mergeKey = item => item.bgmId
        ? `bgm:${item.bgmId}`
        : `title:${item.title.trim().toLocaleLowerCase('zh-CN')}`;
    localList.forEach(item => merged.set(mergeKey(item), item));
    importedRecords.forEach(item => merged.set(mergeKey(item), item));
    return {
        merged: Array.from(merged.values()),
        localCount: localList.length,
        importedCount: importedRecords.length,
    };
}
