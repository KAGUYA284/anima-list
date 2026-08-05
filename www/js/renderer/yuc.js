import { state } from '../store.js';
import { escHtml } from '../utils.js';
import { yucSeasonFromDate, yucSeasonLabel } from '../yuc.js';

export function renderYucPage() {
    const season = state.yucSeason || yucSeasonFromDate();
    return `
        <header class="header">
            <div class="header-content">
                <button class="btn btn-secondary" id="backFromYuc">← 返回</button>
                <span class="header-title" style="font-size:1.125rem;">新番表</span>
                <div style="width:2.5rem;"></div>
            </div>
        </header>
        <main class="main-content yuc-schedule-page">
            <div class="yuc-season-toolbar">
                <button class="btn btn-secondary" id="yucPreviousSeason">← 上一季度</button>
                <h1 id="yucSeasonTitle">${escHtml(yucSeasonLabel(season))}</h1>
                <button class="btn btn-secondary" id="yucNextSeason">下一季度 →</button>
            </div>
            <p class="yuc-season-source">数据来源：yuc.wiki · 优先端侧抓取，失败时使用云函数</p>
            <div id="yucSeasonStatus" class="bgm-loading">正在加载季度新番表...</div>
            <div id="yucSeasonList" class="yuc-season-list"></div>
        </main>
    `;
}

export function renderYucRecords(records, existingTitles = new Set()) {
    return records.map((record, index) => {
        const schedule = record.schedule || {};
        const title = record.titleCn || record.title || record.titleJp || `未命名番剧 ${index + 1}`;
        const key = String(title).normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '').toLocaleLowerCase('zh-CN');
        const exists = existingTitles.has(key);
        const date = schedule.airDate || '日期待定';
        const weekday = schedule.updateWeekDay ? ['','周一','周二','周三','周四','周五','周六','周日'][schedule.updateWeekDay] : '';
        const time = schedule.updateTime || '';
        const period = schedule.updatePeriod || '';
        const staff = record.staff || {};
        const details = [staff.director && `导演：${staff.director}`, staff.animationStudio && `制作：${staff.animationStudio}`]
            .filter(Boolean).join(' · ');
        return `
            <article class="yuc-season-card" data-yuc-index="${index}">
                <div class="yuc-season-card-main">
                    <h2>${escHtml(title)}</h2>
                    ${record.titleJp && record.titleJp !== title ? `<p class="yuc-season-jp">${escHtml(record.titleJp)}</p>` : ''}
                    <p class="yuc-season-meta">首播：${escHtml(date)}${weekday ? ` · ${escHtml(weekday)}` : ''}${time ? ` · ${escHtml(time)}` : ''}${period ? `（${escHtml(period)}）` : ''}</p>
                    ${details ? `<p class="yuc-season-staff">${escHtml(details)}</p>` : ''}
                </div>
                <button class="btn ${exists ? 'btn-secondary' : 'btn-primary'} yuc-add-button" data-yuc-add="${index}" ${exists ? 'disabled' : ''}>
                    ${exists ? '已在待看列表' : '加入待看'}
                </button>
            </article>
        `;
    }).join('');
}
