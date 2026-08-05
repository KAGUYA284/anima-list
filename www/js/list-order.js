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

/** 同一季度内追番的展示排序。time 保持周一至周日；update 从今天起轮转。 */
export function compareChasingForDisplay(left, right, mode = 'time', now = new Date()) {
    const leftDay = Number(left.updateWeekDay) || 0;
    const rightDay = Number(right.updateWeekDay) || 0;
    const today = currentWeekDay(now);
    const dayRank = day => {
        if (!day) return 8;
        return mode === 'update' ? (day - today + 7) % 7 : day - 1;
    };
    const dayDifference = dayRank(leftDay) - dayRank(rightDay);
    if (dayDifference) return dayDifference;

    if (mode === 'update') {
        const periodDifference = periodValue(left) - periodValue(right);
        if (periodDifference) return periodDifference;
        const updateTimeDifference = timeValue(left.updateTime) - timeValue(right.updateTime);
        if (updateTimeDifference) return updateTimeDifference;
    }
    return left.title.localeCompare(right.title, 'zh');
}
