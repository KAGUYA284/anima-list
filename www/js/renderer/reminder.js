// ============================================================
// 渲染层 · 追番提醒弹窗 - Anime Tracker
// ============================================================

import { getReminderItems } from '../core.js';
import { state } from '../store.js';
import { escHtml } from '../utils.js';
import { hasYucSeasonData } from '../yuc.js';

/** 渲染追番提醒弹窗 */
export function showReminder() {
    const now = new Date();
    const todayWeekday = now.getDay() === 0 ? 7 : now.getDay();

    const { today: chasingToday, binge: bingeUnfinished } = getReminderItems(state.animeList, todayWeekday, now);

    if (chasingToday.length === 0 && bingeUnfinished.length === 0) return;

    let html = '';
    if (chasingToday.length > 0) {
        html += `<div class="reminder-section">
            <div class="reminder-section-title">📺 今天更新的番剧（${chasingToday.length}部）</div>`;
        chasingToday.forEach(a => {
            const showYucTime = hasYucSeasonData(a.airDate);
            let completeInfo = '';
            if (a.airDate && a.totalEpisodes > 0) {
                const airDate = new Date(a.airDate + 'T00:00:00');
                const completeDate = new Date(airDate);
                completeDate.setDate(airDate.getDate() + (a.totalEpisodes - 1) * 7);
                const cdMonth = completeDate.getMonth() + 1;
                const cdDay = completeDate.getDate();
                completeInfo = ` · 预计${cdMonth}月${cdDay}日完结`;
            }
            html += `<div class="reminder-item">
                <span>${escHtml(a.title)}</span>
                <span class="reminder-weekday">${showYucTime && a.updateTime ? `${escHtml(a.updateTime)}${a.updatePeriod ? `（${escHtml(a.updatePeriod)}）` : ''} · ` : ''}${a.currentEpisode}/${a.totalEpisodes}集${completeInfo}</span>
            </div>`;
        });
        html += `</div>`;
    }

    if (bingeUnfinished.length > 0) {
        html += `<div class="reminder-section">
            <div class="reminder-section-title">📚 未看完的番剧（${bingeUnfinished.length}部）</div>`;
        bingeUnfinished.forEach(a => {
            const remaining = a.totalEpisodes - a.currentEpisode;
            html += `<div class="reminder-item">
                <span>${escHtml(a.title)}</span>
                <span class="reminder-weekday">${a.currentEpisode}/${a.totalEpisodes}集 · 剩余${remaining}集</span>
            </div>`;
        });
        html += `</div>`;
    }

    html += `<button class="reminder-btn" id="dismissReminder">知道了</button>`;

    const overlay = document.createElement('div');
    overlay.className = 'reminder-overlay';
    overlay.innerHTML = `<div class="reminder-card">
        <div class="reminder-title">📋 追番提醒</div>
        ${html}
    </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.id === 'dismissReminder') {
            overlay.remove();
        }
    });
}
