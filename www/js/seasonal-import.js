import { yucSeasonStartDate } from './yuc.js';

export function normalizeSeasonalTitle(value) {
    return String(value || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '').toLocaleLowerCase('zh-CN');
}

export function findExistingSeasonalAnime(animeList, record, subject = null) {
    const bgmId = subject?.id ? String(subject.id) : '';
    const titles = [
        record?.titleJp, record?.titleCn, record?.title,
        subject?.name, subject?.name_cn,
    ].map(normalizeSeasonalTitle).filter(Boolean);
    return (Array.isArray(animeList) ? animeList : []).find(anime => (
        (bgmId && String(anime.bgmId || '') === bgmId)
        || titles.includes(normalizeSeasonalTitle(anime.title))
    )) || null;
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
    };
}
