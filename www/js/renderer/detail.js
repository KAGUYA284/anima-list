// ============================================================
// 渲染层 · 详情页 - Anime Tracker
// ============================================================

import { STATUS_CONFIG, TYPE_CONFIG, WEEK_DAYS } from '../constants.js';
import { getCurrentAnime, state } from '../store.js';
import { escHtml, renderEditableStars, safeImageUrl } from '../utils.js';
import { hasYucSeasonData } from '../yuc.js';
import { renderListPage } from './list.js';
import { watchedAtToLocalInput } from '../episode-notes.js';
import { getLibraryMetadata } from '../library-cache.js';

/** 渲染详情页 */
export function renderDetailPage() {
    const anime = getCurrentAnime();
    if (!anime) {
        return renderListPage();
    }

    const progress = anime.totalEpisodes > 0
        ? (anime.currentEpisode / anime.totalEpisodes) * 100
        : 0;
    const statusConfig = STATUS_CONFIG[anime.status] || STATUS_CONFIG.want;
    const showYucTime = hasYucSeasonData(anime.airDate);
    const metadata = getLibraryMetadata(anime);

    return `
        <header class="header">
            <div class="header-content">
                <button class="btn btn-secondary" id="backToList">
                    ← 返回
                </button>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <button class="btn btn-icon flat-action-icon" id="editAnime" title="编辑" aria-label="编辑">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 3a6 6 0 0 0-7.3 7.4l-7.1 7.1a2.2 2.2 0 0 0 3.1 3.1l7.1-7.1A6 6 0 0 0 21 6.2l-2.9 2.9-2.9-.2L15 6Z"/><circle cx="5.2" cy="19" r="0.8" stroke-width="1.4"/></svg>
                    </button>
                    <button class="btn btn-icon flat-action-icon flat-action-delete" id="deleteAnime" title="删除" aria-label="删除">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
                    </button>
                </div>
            </div>
        </header>

        <div class="detail-page">
            <div class="detail-header">
                <h1 class="detail-title">${escHtml(anime.title)}</h1>
                <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
                    <span class="type-badge ${TYPE_CONFIG[anime.type || 'chasing'].class}">${TYPE_CONFIG[anime.type || 'chasing'].label}</span>
                    <span class="status-badge ${statusConfig.class}">${statusConfig.label}</span>
                    ${anime.status === 'completed' ? `
                    <div class="rating-stars" id="detailRating">
                        ${renderEditableStars(anime.rating)}
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- Bangumi 详情区域（通过 JS 异步加载） -->
            ${state.settings.showAnimeDetails ? `
                <div id="bangumiDetail" class="detail-section">${renderSavedBangumiDetail(metadata)}</div>
                <div id="yucDetail" class="detail-section">${showYucTime ? renderStaffInformation(metadata.staff) : ''}</div>
            ` : ''}

            <div class="detail-section">
                <h2 class="detail-section-title">基本信息</h2>
                ${anime.airDate ? `
                    <div class="info-row">
                        <span class="info-label">放送日期</span>
                        <span>${anime.airDate}</span>
                    </div>
                ` : ''}
                ${anime.type === 'chasing' ? `
                    <div class="info-row">
                        <span class="info-label">更新时间</span>
                        <span>${anime.updateWeekDay ? WEEK_DAYS[anime.updateWeekDay] : '-'}${showYucTime && anime.updateTime ? ` ${escHtml(anime.updateTime)}` : ''}${showYucTime && anime.updatePeriod ? `（${escHtml(anime.updatePeriod)}）` : ''}</span>
                    </div>
                ` : `
                    ${anime.startDate ? `
                        <div class="info-row">
                            <span class="info-label">开始观看</span>
                            <span>${anime.startDate}</span>
                        </div>
                    ` : ''}
                    ${anime.completedDate && anime.status !== 'dropped' ? `
                        <div class="info-row">
                            <span class="info-label">看完日期</span>
                            <span>${anime.completedDate}</span>
                        </div>
                    ` : ''}
                `}
            </div>

            <div class="detail-section">
                <h2 class="detail-section-title">观看进度</h2>
                <div class="progress-control">
                    <button class="progress-btn progress-btn-minus" id="progressMinus">−</button>
                    <div class="progress-display">
                        <div>
                            <span class="progress-current">${anime.currentEpisode}</span>
                            <span class="progress-total">/${anime.totalEpisodes}</span>
                        </div>
                        <div class="progress-label">集数</div>
                    </div>
                    <button class="progress-btn progress-btn-plus" id="progressPlus">+</button>
                </div>
            </div>

            <div class="detail-section">
                <h2 class="detail-section-title">观看状态</h2>
                <div class="status-grid">
                    ${Object.entries(STATUS_CONFIG).filter(([s]) => s !== 'want' && s !== 'completed').map(([status, config]) => `
                        <button class="status-option ${anime.status === status ? `active-${status}` : ''}" data-status="${status}">
                            ${config.label}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div class="episode-notes-toolbar">
                <button type="button" class="btn btn-secondary" id="jumpToCurrentEpisode" ${anime.currentEpisode > 0 ? '' : 'disabled'}>跳到当前集${anime.currentEpisode > 0 ? `（第 ${anime.currentEpisode} 集）` : ''}</button>
            </div>
            <details class="detail-section episode-notes-section" id="episodeNotesSection" ${state.settings.episodeNotesCollapsed ? '' : 'open'}>
                <summary class="episode-notes-summary">
                    <h2 class="detail-section-title">📋 集数记录</h2>
                    <span class="episode-notes-toggle"><span class="episode-notes-open-label">收起</span><span class="episode-notes-closed-label">展开</span><span class="episode-notes-chevron" aria-hidden="true">⌄</span></span>
                </summary>
                <p class="episode-notes-hint">仅显示已观看集数。输入后自动保存，点击已选星级可取消评分；历史观看时间可手动补充。</p>
                <div id="episodeNotes">
                    ${renderEpisodeNotes(anime)}
                </div>
            </details>

            <div class="detail-section">
                <h2 class="detail-section-title">观后感</h2>
                <textarea
                    class="form-input form-textarea"
                    id="detailReview"
                    placeholder="写下你的观后感..."
                >${escHtml(anime.review || '')}</textarea>
            </div>
        </div>
    `;
}

/** 渲染单集记录 */
export function renderEpisodeNotes(anime) {
    const watched = Math.min(anime.totalEpisodes || 0, Math.max(0, anime.currentEpisode || 0));
    if (watched === 0) return '<div class="episode-notes-hint">还没有观看记录，增加观看进度后即可记录这一集的感想。</div>';
    const notes = anime.episodeNotes || {};
    let html = '<div class="episode-list">';
    for (let i = 1; i <= watched; i++) {
        const ep = notes[i] || {};
        const hasNote = ep.note || ep.rating || ep.watchedAt;
        html += `
            <div class="episode-item ${hasNote ? 'episode-done' : ''}" data-ep="${i}">
                <div class="episode-item-header">
                    <label class="ep-num" for="episodeNote${i}">第 ${i} 集</label>
                    <div class="ep-rating" role="group" aria-label="第 ${i} 集评分">
                        ${[1, 2, 3, 4, 5].map(rating => `<button type="button" class="rating-star ${rating <= (ep.rating || 0) ? 'filled' : 'empty'}" data-episode-rating="${rating}" aria-label="${rating} 星" aria-pressed="${rating === (ep.rating || 0)}">★</button>`).join('')}
                    </div>
                </div>
                <div class="ep-watched-at-row">
                    <label for="episodeWatchedAt${i}">观看时间</label>
                    <input type="datetime-local" class="form-input ep-watched-at" id="episodeWatchedAt${i}" data-episode-watched-at value="${escHtml(watchedAtToLocalInput(ep.watchedAt))}" aria-label="第 ${i} 集观看时间">
                    <span class="ep-watched-at-hint">${ep.watchedAt ? '' : '待补充'}</span>
                </div>
                <textarea class="ep-note-input" id="episodeNote${i}" rows="1" maxlength="10000" placeholder="写下这一集的感想...">${escHtml(ep.note || '')}</textarea>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

/** 收藏资料立即显示，网络刷新失败时仍保留。 */
export function renderSavedBangumiDetail(metadata = {}) {
    const cover = safeImageUrl(metadata.thumbnailUrl || metadata.coverUrl);
    const summary = metadata.summary || '';
    if (!cover && !summary) return '';
    return `<div class="bgm-detail">
        ${cover ? `<div class="bgm-cover"><img src="${escHtml(cover)}" data-library-cover alt="封面" onerror="this.style.display='none'"></div>` : ''}
        <div class="bgm-info">${summary ? `<p class="bgm-summary">${escHtml(summary)}</p>` : ''}</div>
    </div>`;
}

export function renderStaffInformation(staff = {}) {
    const fields = [
        ['原作', staff.originalWork],
        ['导演', staff.director],
        ['副导演', staff.assistantDirector],
        ['编剧', staff.seriesComposition],
        ['人物设计', staff.characterDesign],
        ['动画人设', staff.animationCharacterDesign],
        ['动画制作', staff.animationStudio],
    ].filter(([, value]) => value);
    if (fields.length === 0) return '';
    return `
        <div class="yuc-detail-header"><h2 class="detail-section-title">制作信息</h2></div>
        <div class="yuc-staff-grid">${fields.map(([label, value]) => `
            <div class="yuc-staff-row"><span class="info-label">${label}</span><span>${escHtml(value)}</span></div>
        `).join('')}</div>
    `;
}
