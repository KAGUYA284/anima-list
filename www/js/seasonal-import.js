import { yucSeasonStartDate } from './yuc.js';
import { mergeLibraryMetadata } from './library-cache.js';
import { getBangumiSubjectFetchedAt, getYucAnimeFetchedAt } from './api.js';

export function normalizeSeasonalTitle(value) {
    return String(value || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '').toLocaleLowerCase('zh-CN');
}

export function getSeasonalRecordKey(record, season) {
    const title = normalizeSeasonalTitle(record?.titleJp || record?.titleCn || record?.title);
    return /^\d{4}(01|04|07|10)$/.test(String(season || '')) && title ? `${season}:${title}` : '';
}

export function seasonalAnimeAssociation(record, subject, season) {
    return {
        yucKey: getSeasonalRecordKey(record, season),
        titleJp: subject?.name || record?.titleJp || '',
    };
}

export function findExistingSeasonalAnime(animeList, record, subject = null, season = '') {
    const bgmId = String(subject?.id || record?.bgmId || '');
    const yucKey = getSeasonalRecordKey(record, season);
    const list = Array.isArray(animeList) ? animeList : [];
    const linked = (bgmId && list.find(anime => String(anime.bgmId || '') === bgmId))
        || (yucKey && list.find(anime => anime.yucKey === yucKey));
    if (linked) return linked;
    const titles = [
        record?.titleJp, record?.titleCn, record?.title,
        subject?.name, subject?.name_cn,
    ].map(normalizeSeasonalTitle).filter(Boolean);
    return list.find(anime => [anime.title, anime.titleJp].some(title => titles.includes(normalizeSeasonalTitle(title)))) || null;
}

export function buildSeasonalAnime(record, subject, season) {
    const schedule = record?.schedule || {};
    const title = subject?.name_cn || subject?.name || record?.titleCn || record?.title || record?.titleJp || '';
    return {
        title,
        totalEpisodes: Number(subject?.total_episodes) || 12,
        currentEpisode: 0,
        status: 'want',
        type: 'chasing',
        airDate: subject?.date || schedule.airDate || yucSeasonStartDate(season),
        updateWeekDay: schedule.updateWeekDay || '',
        updateTime: schedule.updateTime || '',
        updatePeriod: schedule.updatePeriod || '',
        bgmId: subject?.id ? String(subject.id) : '',
        ...seasonalAnimeAssociation(record, subject, season),
        metadata: mergeLibraryMetadata({}, {
            subject,
            yuc: record,
            bangumiUpdatedAt: getBangumiSubjectFetchedAt(subject?.id),
            yucUpdatedAt: getYucAnimeFetchedAt(record),
        }),
    };
}
