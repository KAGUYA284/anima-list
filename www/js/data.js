import { APP_VERSION, SCHEMA_VERSION, STATUS_CONFIG, TYPE_CONFIG } from './constants.js';
import { generateId } from './utils.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UPDATE_TIME_PATTERN = /^(?:[01]\d|2\d):[0-5]\d$/;

function cleanString(value, maxLength = 50000) {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function cleanDate(value) {
    const date = cleanString(value, 10);
    if (!DATE_PATTERN.test(date)) return '';
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    const [year, month, day] = date.split('-').map(Number);
    return parsed.getFullYear() === year
        && parsed.getMonth() + 1 === month
        && parsed.getDate() === day
        ? date
        : '';
}

function cleanEpisodeNotes(value, totalEpisodes) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    for (const [episode, noteValue] of Object.entries(value)) {
        const number = Number(episode);
        if (!Number.isInteger(number) || number < 1 || number > totalEpisodes) continue;
        if (!noteValue || typeof noteValue !== 'object') continue;
        const note = cleanString(noteValue.note, 10000).trim();
        const rating = Math.min(5, Math.max(0, Number(noteValue.rating) || 0));
        if (note || rating) result[number] = { note, rating };
    }
    return result;
}

export function normalizeAnimeRecord(value, { requireTitle = true } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('记录不是对象');
    }
    const title = cleanString(value.title, 300).trim();
    if (requireTitle && !title) throw new Error('缺少番剧名称');

    const totalEpisodes = Math.min(10000, Math.max(1, Math.trunc(Number(value.totalEpisodes) || 1)));
    const currentEpisode = Math.min(totalEpisodes, Math.max(0, Math.trunc(Number(value.currentEpisode) || 0)));
    const type = Object.hasOwn(TYPE_CONFIG, value.type) ? value.type : 'chasing';
    const status = Object.hasOwn(STATUS_CONFIG, value.status) ? value.status : (currentEpisode ? 'watching' : 'want');
    const bgmId = /^\d+$/.test(String(value.bgmId || '')) ? String(value.bgmId) : '';
    const now = new Date().toISOString();

    return {
        id: cleanString(value.id, 100).trim() || generateId(),
        title,
        totalEpisodes,
        currentEpisode,
        status,
        rating: Math.min(5, Math.max(0, Number(value.rating) || 0)),
        review: cleanString(value.review),
        airDate: cleanDate(value.airDate),
        type,
        updateWeekDay: type === 'chasing' ? Math.min(7, Math.max(0, Number(value.updateWeekDay) || 0)) : '',
        updateTime: type === 'chasing' && UPDATE_TIME_PATTERN.test(cleanString(value.updateTime, 5))
            ? cleanString(value.updateTime, 5)
            : '',
        completedDate: cleanDate(value.completedDate),
        startDate: cleanDate(value.startDate),
        bgmId,
        episodeNotes: cleanEpisodeNotes(value.episodeNotes, totalEpisodes),
        createdAt: cleanString(value.createdAt, 40) || now,
        updatedAt: cleanString(value.updatedAt, 40) || now,
    };
}

export function readBackup(input) {
    const source = Array.isArray(input) ? input : input?.records;
    if (!Array.isArray(source)) throw new Error('备份格式错误：应为记录数组或带 records 的备份对象');

    const records = [];
    const errors = [];
    source.forEach((item, index) => {
        try {
            records.push(normalizeAnimeRecord(item));
        } catch (error) {
            errors.push(`第 ${index + 1} 条：${error.message}`);
        }
    });
    if (source.length > 0 && records.length === 0) throw new Error(`没有可导入记录。${errors.slice(0, 3).join('；')}`);
    return { records, errors };
}

export function normalizeStoredRecords(input) {
    try {
        return readBackup(input).records;
    } catch {
        return [];
    }
}

export function createBackup(records) {
    return {
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        records: records.map(record => normalizeAnimeRecord(record)),
    };
}
