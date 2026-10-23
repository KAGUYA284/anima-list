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

function isInBroadcastWindow(anime, today) {
    if (!anime.airDate) return true;
    const premiere = new Date(`${anime.airDate}T00:00:00`);
    if (Number.isNaN(premiere.getTime())) return true;

    const lastEpisode = new Date(premiere);
    const totalEpisodes = Math.max(1, Number(anime.totalEpisodes) || 1);
    lastEpisode.setDate(lastEpisode.getDate() + (totalEpisodes - 1) * 7);
    return today >= premiere && today <= lastEpisode;
}

export function getReminderItems(animeList, todayWeekday, now = new Date()) {
    const today = now instanceof Date ? new Date(now) : new Date(now);
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayWeekday = todayWeekday === 1 ? 7 : todayWeekday - 1;
    const onDay = (weekday, date) => animeList.filter(a =>
        (a.status === 'watching' || a.status === 'want')
        && a.type === 'chasing'
        && Number(a.updateWeekDay) === weekday
        && isInBroadcastWindow(a, date)
    );
    return {
        today: onDay(todayWeekday, today),
        yesterday: onDay(yesterdayWeekday, yesterday),
        binge: animeList.filter(a => a.status === 'watching' && a.type === 'binge'),
    };
}

function infoboxText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(item => infoboxText(item)).filter(Boolean).join('、');
    if (value && typeof value === 'object') return infoboxText(value.v ?? value.name ?? '');
    return '';
}

export function extractAnimationStudio(persons = [], infobox = []) {
    const relations = new Set(['动画制作', '動畫製作', 'アニメーション制作']);
    const relatedStudio = persons.find(person => relations.has(String(person?.relation || '').trim()));
    if (relatedStudio?.name) return String(relatedStudio.name).trim();

    const keys = new Set(['动画制作', '動畫製作', 'アニメーション制作', '制作公司', '製作公司', 'Studio']);
    const item = infobox.find(entry => keys.has(String(entry?.key || '').trim()));
    return infoboxText(item?.value).trim();
}
