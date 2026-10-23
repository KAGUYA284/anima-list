// ============================================================
// 渲染层 · 列表页 - Anime Tracker
// ============================================================

import { QUARTER_ORDER, STATUS_CONFIG, TYPE_CONFIG, WEEK_DAYS } from '../constants.js';
import { getBangumiImageUrl, getBangumiSubject, getCachedBangumiSubject, hydrateBangumiImages } from '../api.js';
import { buildGroups } from '../grouping.js';
import { getAnimeById, getFilteredAnime, state } from '../store.js';
import { loadCollapsed } from '../storage.js';
import { escHtml, renderStars, safeImageUrl } from '../utils.js';
import { hasYucSeasonData } from '../yuc.js';
import { compareChasingForDisplay } from '../list-order.js';
import { getLibraryMetadata, persistLibraryMetadata, resolveLibraryThumbnail } from '../library-cache.js';

/** 渲染列表页 */
export function renderListPage() {
    const filtered = getFilteredAnime();

    return `
        <header class="header">
            <div class="header-content">
                <div>
                    <div class="header-title">Anima List</div>
                    <div class="header-subtitle">${filtered.length} 部番剧</div>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <button class="btn btn-icon" id="settingsBtn" title="设置">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                    <button class="btn btn-icon" id="yucScheduleBtn" title="新番表" aria-label="新番表">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect x="3" y="4.5" width="18" height="16" rx="2"/>
                            <path d="M7 3v3M17 3v3M3 9h18M7 13h.01M12 13h.01M17 13h.01M7 17h.01M12 17h.01"/>
                        </svg>
                    </button>
                    <button class="btn btn-primary" id="addAnimeBtn">
                        <span>+</span>
                        <span>添加</span>
                    </button>
                </div>
            </div>
        </header>

        ${renderFilterBar()}

        <div class="search-bar">
            <input
                type="text"
                class="form-input"
                id="searchInput"
                placeholder="搜索番剧..."
                value="${escHtml(state.searchQuery)}"
                style="width:100%;max-width:800px;margin:0 auto;display:block;padding:0.4375rem 0.75rem;font-size:0.875rem;"
            >
        </div>

        <main class="main-content">
            ${filtered.length === 0 ? renderEmptyState() : renderAnimeList(filtered)}
        </main>
    `;
}

/** 渲染筛选栏 */
function renderFilterBar() {
    const filters = [
        { value: 'all', label: '全部' },
        ...Object.entries(STATUS_CONFIG).map(([value, config]) => ({ value, label: config.label }))
    ];

    return `
        <div class="filter-bar">
            <div class="filter-content">
                ${filters.map(f => `
                    <button class="filter-btn ${state.filter === f.value ? 'active' : ''}" data-filter="${f.value}">
                        ${f.label}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

/** 渲染空状态 */
function renderEmptyState() {
    return `
        <div class="empty-state">
            <div class="empty-icon">📺</div>
            <div class="empty-title">还没有番剧</div>
            <div class="empty-text">点击添加按钮开始记录你的追番历程</div>
            <button class="btn btn-primary" id="addFirstAnime">
                <span>+</span>
                <span>添加第一部番剧</span>
            </button>
        </div>
    `;
}

/** 渲染番剧列表（按年/季分组） */
function renderAnimeList(animeList) {
    const groups = buildGroups(animeList);
    const sortNow = new Date();

    const years = Object.keys(groups).sort((a, b) => {
        if (a === '未分类') return 1;
        if (b === '未分类') return -1;
        return parseInt(b) - parseInt(a);
    });

    let yearIdx = 0;
    let html = '<div class="anime-list">';
    const collapsed = loadCollapsed();
    years.forEach(year => {
        yearIdx++;
        const yearId = 'y-' + year;
        const yearTotal = Object.values(groups[year]).reduce((sum, arr) => sum + arr.length, 0);
        const yearCollapsed = collapsed.includes(yearId);
        html += `<div class="year-header" data-toggle="year" data-target="${yearId}">`;
        html += `<span class="toggle-icon${yearCollapsed ? ' collapsed' : ''}" id="${yearId}-icon">▼</span>`;
        html += `${year}年<span style="color:#9ca3af;font-weight:400;font-size:0.75rem;margin-left:0.375rem;">${yearTotal}</span></div>`;
        html += `<div class="collapsible-content${yearCollapsed ? ' collapsed' : ''}" id="${yearId}" style="max-height:${yearCollapsed ? '0px' : '9999px'};">`;

        const quartersInYear = Object.keys(groups[year]).sort((a, b) => {
            return QUARTER_ORDER.indexOf(a) - QUARTER_ORDER.indexOf(b);
        });
        quartersInYear.forEach(quarter => {
            const qId = 'y-' + year + '-' + (quarter || 'nocat');
            const qCollapsed = collapsed.includes(qId);
            if (quarter) {
                html += `<div class="quarter-header" data-toggle="quarter" data-target="${qId}">`;
                html += `<span class="toggle-icon${qCollapsed ? ' collapsed' : ''}" id="${qId}-icon">▼</span>`;
                html += `${quarter}<span style="color:#9ca3af;font-weight:400;font-size:0.6875rem;margin-left:0.375rem;">${groups[year][quarter].length}</span></div>`;
            }
            html += `<div class="collapsible-content${qCollapsed ? ' collapsed' : ''}" id="${qId}" style="max-height:${qCollapsed ? '0px' : '9999px'};">`;
            const chasing = [];
            const binge = [];
            groups[year][quarter].forEach(anime => {
                if (anime.type === 'binge') binge.push(anime);
                else chasing.push(anime);
            });
            chasing.sort((a, b) => compareChasingForDisplay(a, b, state.settings.listOrder, sortNow, state.settings.updateOrderStart));
            binge.sort((a, b) => {
                const dateA = a.startDate || '';
                const dateB = b.startDate || '';
                if (dateA && dateB) return dateA.localeCompare(dateB);
                if (dateA) return -1;
                if (dateB) return 1;
                return a.title.localeCompare(b.title, 'zh');
            });
            [...chasing, ...binge].forEach(anime => {
                html += renderAnimeCard(anime);
            });
            html += '</div>';
        });
        html += '</div>';
    });
    html += '</div>';
    return html;
}

/** 渲染单个番剧卡片 */
const coverCache = {};

function getCachedCover(anime) {
    const metadata = getLibraryMetadata(anime);
    const savedCover = safeImageUrl(metadata.thumbnailUrl || metadata.coverUrl);
    if (savedCover) return savedCover;
    const bgmId = anime.bgmId;
    if (!bgmId) return '';
    if (coverCache[bgmId]) return coverCache[bgmId];
    const persistedSubject = getCachedBangumiSubject(bgmId);
    const cover = safeImageUrl(persistedSubject?.images?.medium || '');
    if (cover) coverCache[bgmId] = cover;
    return cover;
}

function renderAnimeCard(anime) {
    const progress = anime.totalEpisodes > 0
        ? (anime.currentEpisode / anime.totalEpisodes) * 100
        : 0;
    const statusConfig = STATUS_CONFIG[anime.status] || STATUS_CONFIG.want;
    const typeLabel = TYPE_CONFIG[anime.type]?.label || '';
    const showYucTime = hasYucSeasonData(anime.airDate);

    if (state.settings.listStyle === 'cover') {
        const cachedCover = getCachedCover(anime);
        return renderSwipeRow(anime, `
            <div class="anime-card anime-card-cover" data-id="${escHtml(anime.id)}" data-bgmid="${escHtml(anime.bgmId || '')}">
                <div class="card-cover-thumb">
                    <div class="card-cover-placeholder">${escHtml(anime.title.charAt(0))}</div>
                    <img class="card-cover-img" data-library-id="${escHtml(anime.id)}" data-library-pending="true" data-direct-src="${escHtml(cachedCover)}" alt="" loading="lazy" style="display:none;">
                </div>
                <div class="card-cover-info">
                    <div class="card-title">${escHtml(anime.title)}</div>
                    <div class="card-meta">
                        <span class="status-badge ${statusConfig.class}">${statusConfig.label}</span>
                        ${anime.type === 'chasing' && anime.updateWeekDay ? `<span class="weekday-tag">${WEEK_DAYS[anime.updateWeekDay]}${showYucTime && anime.updateTime ? ` ${escHtml(anime.updateTime)}` : ''}${showYucTime && anime.updatePeriod ? `（${escHtml(anime.updatePeriod)}）` : ''}</span>` : ''}
                    </div>
                    <div class="card-progress-cover">
                        <span class="progress-text">${anime.currentEpisode}/${anime.totalEpisodes}</span>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%;"></div>
                        </div>
                    </div>
                    ${anime.status !== 'dropped' && anime.status !== 'completed' ? `<button class="card-plus-one" data-plus="${escHtml(anime.id)}">+1</button>` : ''}
                </div>
            </div>
        `);
    }

    return renderSwipeRow(anime, `
        <div class="anime-card" data-id="${escHtml(anime.id)}">
            <div class="card-info">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <div class="card-title">${escHtml(anime.title)}</div>
                    ${anime.type === 'binge' ? `<span class="type-badge ${TYPE_CONFIG[anime.type].class}">${typeLabel}</span>` : ''}
                </div>
                <div class="card-meta">
                    <span class="status-badge ${statusConfig.class}">${statusConfig.label}</span>
                    ${anime.type === 'chasing' && anime.updateWeekDay ? `<span class="weekday-tag">${WEEK_DAYS[anime.updateWeekDay]}${showYucTime && anime.updateTime ? ` ${escHtml(anime.updateTime)}` : ''}${showYucTime && anime.updatePeriod ? `（${escHtml(anime.updatePeriod)}）` : ''}</span>` : ''}
                    <div class="card-stars">
                        ${renderStars(anime.rating)}
                    </div>
                    ${anime.type !== 'binge' && anime.airDate ? `<span style="color:#9ca3af;font-size:0.75rem;">${anime.airDate}</span>` : ''}
                </div>
            </div>
            <div class="card-progress">
                <span class="progress-text">${anime.currentEpisode}/${anime.totalEpisodes}</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%;"></div>
                </div>
                ${anime.status !== 'dropped' && anime.status !== 'completed' ? `<button class="card-plus-one" data-plus="${escHtml(anime.id)}">+1</button>` : ''}
            </div>
        </div>
    `);
}

function renderSwipeRow(anime, cardHtml) {
    const id = escHtml(anime.id);
    return `
        <div class="anime-swipe-row" data-swipe-id="${id}">
            <div class="anime-swipe-actions" aria-label="${escHtml(anime.title)}操作">
                <button class="anime-swipe-action anime-swipe-edit" type="button" data-card-edit="${id}" title="编辑" aria-label="编辑">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.83 2.83-.06-.06a1.65 1.65 0 0 0-1.82-.33A1.65 1.65 0 0 0 14 20.83V21h-4v-.17a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 0 0 4.6 15 1.65 1.65 0 0 0 3.09 14H3v-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06L7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4 1.65 1.65 0 0 0 10 2.17V2h4v.17A1.65 1.65 0 0 0 15.08 4a1.65 1.65 0 0 0 1.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0 0 19.4 9 1.65 1.65 0 0 0 20.91 10H21v4h-.09A1.65 1.65 0 0 0 19.4 15Z"/></svg>
                </button>
                <button class="anime-swipe-action anime-swipe-delete" type="button" data-card-delete="${id}" title="删除" aria-label="删除">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
                </button>
            </div>
            ${cardHtml}
        </div>
    `;
}

/** 异步加载列表中所有番剧的封面图片 */
export async function loadListCovers(animeId = '') {
    const images = [...document.querySelectorAll('.card-cover-img[data-library-id]')]
        .filter(image => !animeId || image.dataset.libraryId === animeId);
    let next = 0;
    const worker = async () => {
        while (next < images.length) {
            const image = images[next++];
            try {
                let record = getAnimeById(image.dataset.libraryId);
                if (!record || !image.isConnected) continue;
                let cover = getCachedCover(record);
                if (!cover && record.bgmId) {
                    const subject = await getBangumiSubject(record.bgmId);
                    persistLibraryMetadata(record.id, { subject });
                    record = getAnimeById(record.id);
                    if (!record) continue;
                    cover = getCachedCover(record);
                }
                if (!cover) continue;
                if (image.dataset.coverBound !== 'true') {
                    image.dataset.coverBound = 'true';
                    image.addEventListener('load', () => {
                        image.closest('.card-cover-thumb')?.querySelector('.card-cover-placeholder')?.style.setProperty('display', 'none');
                    });
                    image.addEventListener('error', () => {
                        if (image.dataset.fallbackUsed !== 'true' && image.dataset.directSrc && image.src !== image.dataset.directSrc) {
                            image.dataset.fallbackUsed = 'true';
                            image.src = image.dataset.directSrc;
                        } else {
                            image.style.display = 'none';
                            image.closest('.card-cover-thumb')?.querySelector('.card-cover-placeholder')?.style.removeProperty('display');
                        }
                    });
                }
                const local = await resolveLibraryThumbnail(record, { fetchMissing: true }).catch(() => null);
                if (!image.isConnected) continue;
                delete image.dataset.libraryPending;
                image.dataset.directSrc = cover;
                image.style.display = 'block';
                if (local) {
                    image.dataset.localThumbnail = 'true';
                    if (image.src !== local) image.src = local;
                } else {
                    delete image.dataset.localThumbnail;
                    image.dataset.fallbackUsed = 'false';
                    const remote = getBangumiImageUrl(cover);
                    if (image.src !== remote) image.src = remote;
                    hydrateBangumiImages(image.parentElement);
                }
            } catch (error) {
                console.info('[Library] 封面暂不可用', error.message);
            }
        }
    };
    await Promise.allSettled(Array.from({ length: Math.min(3, images.length) }, worker));
}
