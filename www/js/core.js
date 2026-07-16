import { QUARTER_BOUNDARIES } from './constants.js';

export function deriveStatus(currentEpisode, totalEpisodes, previousStatus = 'watching') {
    if (currentEpisode <= 0) return 'want';
    if (totalEpisodes > 0 && currentEpisode >= totalEpisodes) return 'completed';
    if (previousStatus === 'want' || previousStatus === 'completed') return 'watching';
    return previousStatus;
}

export function changeProgress(anime, delta) {
    const totalEpisodes = Math.max(1, Number(anime.totalEpisodes) || 1);
    const currentEpisode = Math.min(totalEpisodes, Math.max(0, (Number(anime.currentEpisode) || 0) + delta));
    return {
        currentEpisode,
        status: deriveStatus(currentEpisode, totalEpisodes, anime.status),
    };
}

export function classifySeason(dateString, type = 'chasing') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '');
    if (!match) return { year: '未分类', quarter: '' };

    let year = match[1];
    const month = Number(match[2]);
    const day = Number(match[3]);
    const calendarQuarter = month <= 3 ? '冬' : month <= 6 ? '春' : month <= 9 ? '夏' : '秋';
    if (type === 'binge') return { year, quarter: calendarQuarter };

    const info = QUARTER_BOUNDARIES[calendarQuarter];
    const lastMonth = info.months.at(-1);
    if (month === lastMonth && day >= info.lastWeekDay) {
        if (info.nextYearOffset) year = String(Number(year) + info.nextYearOffset);
        return { year, quarter: info.next };
    }
    return { year, quarter: calendarQuarter };
}

export function getReminderItems(animeList, todayWeekday) {
    return {
        today: animeList.filter(a => a.status === 'watching' && a.type === 'chasing' && a.updateWeekDay === todayWeekday),
        binge: animeList.filter(a => a.status === 'watching' && a.type === 'binge'),
    };
}
