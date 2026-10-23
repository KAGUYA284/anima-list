import {
    getBangumiSubject, getBangumiSubjectFetchedAt, getYucAnime, getYucAnimeFetchedAt,
    searchBangumi, selectBangumiMatch,
} from './api.js';
import { normalizeAnimeRecord } from './data.js';
import { mergeLibraryMetadata } from './library-cache.js';

export function fillMissingAnimeFields(record, { subject = null, yuc = null } = {}) {
    const schedule = yuc?.schedule || {};
    const remoteEpisodes = Math.trunc(Number(subject?.total_episodes) || 0);
    return normalizeAnimeRecord({
        ...record,
        bgmId: record.bgmId || (subject?.id ? String(subject.id) : ''),
        titleJp: record.titleJp || subject?.name || '',
        totalEpisodes: record.totalEpisodes <= 1 && remoteEpisodes > 1
            ? remoteEpisodes
            : record.totalEpisodes,
        airDate: record.airDate || schedule.airDate || subject?.date || '',
        updateWeekDay: record.type === 'chasing'
            ? record.updateWeekDay || schedule.updateWeekDay || ''
            : record.updateWeekDay,
        updateTime: record.type === 'chasing'
            ? record.updateTime || schedule.updateTime || ''
            : record.updateTime,
        updatePeriod: record.type === 'chasing'
            ? record.updatePeriod || schedule.updatePeriod || ''
            : record.updatePeriod,
        metadata: mergeLibraryMetadata(record, {
            subject, yuc,
            bangumiUpdatedAt: getBangumiSubjectFetchedAt(subject?.id),
            yucUpdatedAt: getYucAnimeFetchedAt(yuc),
        }),
    });
}

/** 补全结束时以当前记录为准，保留期间新增的观看记录和本地资料。 */
export function applyImportedEnrichment(current, candidate) {
    if (current.bgmId && candidate.bgmId && current.bgmId !== candidate.bgmId) return current;
    const metadata = { ...candidate.metadata, ...current.metadata, staff: { ...candidate.metadata?.staff, ...current.metadata?.staff } };
    for (const key of ['summary', 'coverUrl', 'thumbnailUrl', 'updatedAt', 'bangumiUpdatedAt', 'yucUpdatedAt']) {
        if (!metadata[key] && candidate.metadata?.[key]) metadata[key] = candidate.metadata[key];
    }
    return fillMissingAnimeFields({ ...current, metadata }, {
        subject: { id: candidate.bgmId, name: candidate.titleJp, total_episodes: candidate.totalEpisodes, date: candidate.airDate },
        yuc: { schedule: candidate },
    });
}

export async function enrichImportedAnime(record) {
    let subject = null;
    if (record.bgmId) {
        subject = await getBangumiSubject(record.bgmId);
    } else {
        const subjects = await searchBangumi(record.title);
        const match = selectBangumiMatch(subjects, { title: record.title, airDate: record.airDate });
        if (match?.id) subject = await getBangumiSubject(match.id).catch(() => match);
    }

    const withBangumi = fillMissingAnimeFields(record, { subject });
    let yuc = null;
    if (withBangumi.type === 'chasing') {
        yuc = await getYucAnime({
            title: withBangumi.title,
            titleCn: subject?.name_cn || '',
            titleJp: subject?.name || '',
            airDate: withBangumi.airDate,
        });
    }
    return fillMissingAnimeFields(withBangumi, { subject, yuc });
}

export async function enrichImportedAnimeList(records, { concurrency = 3 } = {}) {
    const result = [...records];
    let cursor = 0;
    const worker = async () => {
        while (cursor < result.length) {
            const index = cursor++;
            try {
                result[index] = await enrichImportedAnime(result[index]);
            } catch (error) {
                console.warn(`[Import] 无法补全《${result[index].title}》`, error);
            }
        }
    };
    const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, result.length));
    await Promise.all(Array.from({ length: workerCount }, worker));
    return result;
}
