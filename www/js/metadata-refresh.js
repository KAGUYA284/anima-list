import {
    getBangumiSubject, getYucAnime, searchBangumi, selectBangumiMatch,
} from './api.js';
import { normalizeAnimeRecord } from './data.js';

const REMOTE_FIELDS = [
    'title', 'totalEpisodes', 'airDate', 'updateWeekDay', 'updateTime', 'updatePeriod', 'bgmId',
];

export function mergeRemoteAnimeMetadata(record, { subject = null, yuc = null } = {}) {
    const schedule = yuc?.schedule || {};
    const remoteEpisodes = Math.trunc(Number(subject?.total_episodes) || 0);
    const highestNotedEpisode = Math.max(0, ...Object.keys(record.episodeNotes || {}).map(Number).filter(Number.isFinite));
    const totalEpisodes = remoteEpisodes > 0
        ? Math.max(remoteEpisodes, Number(record.currentEpisode) || 0, highestNotedEpisode, 1)
        : record.totalEpisodes;
    const candidate = normalizeAnimeRecord({
        ...record,
        title: subject?.name_cn || subject?.name || record.title,
        bgmId: subject?.id ? String(subject.id) : record.bgmId,
        totalEpisodes,
        airDate: schedule.airDate || subject?.date || record.airDate,
        updateWeekDay: record.type === 'chasing'
            ? schedule.updateWeekDay || record.updateWeekDay
            : record.updateWeekDay,
        updateTime: record.type === 'chasing'
            ? schedule.updateTime || record.updateTime
            : record.updateTime,
        updatePeriod: record.type === 'chasing'
            ? schedule.updatePeriod || record.updatePeriod
            : record.updatePeriod,
    });
    const changed = REMOTE_FIELDS.some(field => candidate[field] !== record[field]);
    return changed
        ? normalizeAnimeRecord({ ...candidate, updatedAt: new Date().toISOString() })
        : record;
}

export function applyRefreshedMetadata(current, refreshed) {
    if (!refreshed) return current;
    const updates = Object.fromEntries(REMOTE_FIELDS.map(field => [field, refreshed[field]]));
    const highestNotedEpisode = Math.max(0, ...Object.keys(current.episodeNotes || {}).map(Number).filter(Number.isFinite));
    updates.totalEpisodes = Math.max(Number(updates.totalEpisodes) || 1, Number(current.currentEpisode) || 0, highestNotedEpisode);
    const changed = REMOTE_FIELDS.some(field => updates[field] !== current[field]);
    return changed
        ? normalizeAnimeRecord({ ...current, ...updates, updatedAt: refreshed.updatedAt })
        : current;
}

export async function refreshAnimeMetadata(record) {
    let subject = null;
    if (record.bgmId) {
        subject = await getBangumiSubject(record.bgmId, { forceRefresh: true });
    } else {
        const subjects = await searchBangumi(record.title);
        const match = selectBangumiMatch(subjects, { title: record.title, airDate: record.airDate });
        if (match?.id) subject = await getBangumiSubject(match.id, { forceRefresh: true }).catch(() => match);
    }

    let yuc = null;
    if (record.type === 'chasing') {
        yuc = await getYucAnime({
            title: record.title,
            titleCn: subject?.name_cn || '',
            titleJp: subject?.name || '',
            airDate: subject?.date || record.airDate,
            forceRefresh: true,
        });
    }
    return mergeRemoteAnimeMetadata(record, { subject, yuc });
}

export async function refreshAnimeMetadataList(records, { concurrency = 3, onProgress } = {}) {
    const result = [...records];
    let cursor = 0;
    let completed = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const worker = async () => {
        while (cursor < result.length) {
            const index = cursor++;
            try {
                const refreshed = await refreshAnimeMetadata(result[index]);
                if (refreshed !== result[index]) updatedCount += 1;
                result[index] = refreshed;
            } catch (error) {
                failedCount += 1;
                console.warn(`[Metadata] 无法更新《${result[index].title}》`, error);
            } finally {
                completed += 1;
                onProgress?.(completed, result.length);
            }
        }
    };
    const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, result.length));
    await Promise.all(Array.from({ length: workerCount }, worker));
    return { records: result, updatedCount, failedCount };
}
