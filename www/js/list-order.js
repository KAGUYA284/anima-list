import { updatePeriodFromTime } from './yuc.js';

const PERIOD_ORDER = new Map([
    ['上午', 0],
    ['下午', 1],
    ['晚间', 2],
    ['深夜', 3],
]);

function currentWeekDay(now) {
    const day = now.getDay();
    return day === 0 ? 7 : day;
}

function timeValue(value) {
    const match = /^(\d{2}):([0-5]\d)$/.exec(String(value || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.POSITIVE_INFINITY;
}

function periodValue(anime) {
    const period = anime.updatePeriod || updatePeriodFromTime(anime.updateTime);
    return PERIOD_ORDER.get(period) ?? PERIOD_ORDER.size;
}

/** 同一季度内追番的展示排序。update 可从当天或昨天起按最近更新日倒序。 */
export function compareChasingForDisplay(left, right, mode = 'time', now = new Date(), updateOrderStart = 'yesterday') {
    const leftDay = Number(left.updateWeekDay) || 0;
    const rightDay = Number(right.updateWeekDay) || 0;
    const today = currentWeekDay(now);
    const startDay = today - (updateOrderStart === 'today' ? 0 : 1);
    const dayRank = day => {
        if (!day) return 8;
        return mode === 'update' ? (startDay - day + 7) % 7 : day - 1;
    };
    const dayDifference = dayRank(leftDay) - dayRank(rightDay);
    if (dayDifference) return dayDifference;

    if (mode === 'update') {
        const leftPeriod = periodValue(left);
        const rightPeriod = periodValue(right);
        if (leftPeriod === PERIOD_ORDER.size && rightPeriod !== PERIOD_ORDER.size) return 1;
        if (rightPeriod === PERIOD_ORDER.size && leftPeriod !== PERIOD_ORDER.size) return -1;
        const periodDifference = rightPeriod - leftPeriod;
        if (periodDifference) return periodDifference;
        const leftTime = timeValue(left.updateTime);
        const rightTime = timeValue(right.updateTime);
        if (!Number.isFinite(leftTime) && Number.isFinite(rightTime)) return 1;
        if (!Number.isFinite(rightTime) && Number.isFinite(leftTime)) return -1;
        const updateTimeDifference = rightTime - leftTime;
        if (updateTimeDifference) return updateTimeDifference;
    }
    return left.title.localeCompare(right.title, 'zh');
}
