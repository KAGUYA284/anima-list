import {
    getBangumiSubject, getYucAnime, searchBangumi, selectBangumiMatch,
} from './api.js';
import { normalizeAnimeRecord } from './data.js';

export function fillMissingAnimeFields(record, { subject = null, yuc = null } = {}) {
    const schedule = yuc?.schedule || {};
    const remoteEpisodes = Math.trunc(Number(subject?.total_episodes) || 0);
    return normalizeAnimeRecord({
        ...record,
        bgmId: record.bgmId || (subject?.id ? String(subject.id) : ''),
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
