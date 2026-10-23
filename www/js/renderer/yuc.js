import { state } from '../store.js';
import { WEEK_DAYS } from '../constants.js';
import { escHtml, safeImageUrl } from '../utils.js';
import { yucSeasonFromDate, yucSeasonLabel } from '../yuc.js';
import { findExistingSeasonalAnime } from '../seasonal-import.js';

export function renderYucPage() {
    const season = state.yucSeason || yucSeasonFromDate();
    const year = season.slice(0, 4);
    const quarter = season.slice(4);
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
                <h1 id="yucSeasonTitle">${escHtml(yucSeasonLabel(season))}</h1>
                <div class="yuc-season-filters" aria-label="新番表季度筛选">
                    <label>
                        <span>年份</span>
                        <input class="form-input" type="number" id="yucYearFilter" min="2019" step="1" value="${escHtml(year)}">
                    </label>
                    <label>
                        <span>季度</span>
                        <select class="form-input" id="yucQuarterFilter">
                            <option value="01" ${quarter === '01' ? 'selected' : ''}>冬季（1 月）</option>
                            <option value="04" ${quarter === '04' ? 'selected' : ''}>春季（4 月）</option>
                            <option value="07" ${quarter === '07' ? 'selected' : ''}>夏季（7 月）</option>
                            <option value="10" ${quarter === '10' ? 'selected' : ''}>秋季（10 月）</option>
                        </select>
                    </label>
                </div>
            </div>
            <div id="yucSeasonStatus" class="bgm-loading">正在加载季度新番表...</div>
            <div id="yucSeasonList" class="yuc-season-list"></div>
        </main>
    `;
}

export function renderYucRecords(records, animeList = [], season = '') {
    const indexed = records
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => record.titleCn || record.title || record.titleJp);
    const sections = WEEK_DAYS.slice(1).map((label, index) => ({
        label,
        weekday: index + 1,
        records: indexed.filter(item => Number(item.record.schedule?.updateWeekDay) === index + 1),
    }));
    const unscheduled = indexed.filter(item => !Number(item.record.schedule?.updateWeekDay));
    if (unscheduled.length) sections.push({ label: '时间待定', weekday: 0, records: unscheduled });

    return sections.filter(section => section.records.length).map(section => `
        <section class="yuc-weekday-section" data-weekday="${section.weekday}">
            <div class="yuc-weekday-heading">
                <h2>${escHtml(section.label)}</h2>
                <span>${section.records.length} 部</span>
            </div>
            <div class="yuc-weekday-grid">
                ${section.records.map(({ record, index }) => renderYucRecord(record, index, animeList, season)).join('')}
            </div>
        </section>
    `).join('');
}

function renderYucRecord(record, index, animeList, season) {
        const schedule = record.schedule || {};
        const title = record.titleCn || record.title || record.titleJp;
        const exists = !!findExistingSeasonalAnime(animeList, record, null, season);
        const date = schedule.airDate || '日期待定';
        const time = schedule.updateTime || '';
        const period = schedule.updatePeriod || '';
        const staff = record.staff || {};
        const imageUrl = safeImageUrl(record.imageUrl);
        const details = [staff.director && `导演：${staff.director}`, staff.animationStudio && `制作：${staff.animationStudio}`]
            .filter(Boolean).join(' · ');
        return `
            <article class="yuc-season-card" data-yuc-index="${index}">
                <div class="yuc-season-cover">
                    ${imageUrl
                        ? `<img src="${escHtml(imageUrl)}" alt="${escHtml(title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
                        : ''}
                    <div class="yuc-season-cover-placeholder" ${imageUrl ? 'style="display:none;"' : ''}>${escHtml(title.charAt(0))}</div>
                </div>
                <div class="yuc-season-card-main">
                    <h2>${escHtml(title)}</h2>
                    ${record.titleJp && record.titleJp !== title ? `<p class="yuc-season-jp">${escHtml(record.titleJp)}</p>` : ''}
                    <p class="yuc-season-meta">首播：${escHtml(date)}${time ? ` · ${escHtml(time)}` : ''}${period ? `（${escHtml(period)}）` : ''}</p>
                    ${details ? `<p class="yuc-season-staff">${escHtml(details)}</p>` : ''}
                </div>
                <button class="btn ${exists ? 'btn-secondary' : 'btn-primary'} yuc-add-button" data-yuc-add="${index}" ${exists ? 'disabled' : ''}>
                    ${exists ? '已在待看列表' : '加入待看'}
                </button>
            </article>
        `;
}
