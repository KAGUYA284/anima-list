// ============================================================
// 渲染层 · 详情页 - Anime Tracker
// ============================================================

import { STATUS_CONFIG, TYPE_CONFIG, WEEK_DAYS } from '../constants.js';
import { getCurrentAnime, state } from '../store.js';
import { escHtml, renderEditableStars } from '../utils.js';
import { hasYucSeasonData } from '../yuc.js';
import { renderListPage } from './list.js';

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

    return `
        <header class="header">
            <div class="header-content">
                <button class="btn btn-secondary" id="backToList">
                    ← 返回
                </button>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <button class="btn btn-icon" id="editAnime">✏️</button>
                    <button class="btn btn-icon" id="deleteAnime" style="color:#f87171;">🗑️</button>
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
            <div id="bangumiDetail" class="detail-section"></div>
            ${state.settings.showAnimeDetails ? '<div id="yucDetail" class="detail-section"></div>' : ''}

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

            <div class="detail-section">
                <h2 class="detail-section-title">📋 集数记录</h2>
                <div id="episodeNotes">
                    ${renderEpisodeNotes(anime)}
                </div>
            </div>

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
function renderEpisodeNotes(anime) {
    const total = anime.totalEpisodes || 0;
    if (total === 0) return '<div style="color:#9ca3af;text-align:center;padding:0.5rem;">暂无集数数据</div>';
    const notes = anime.episodeNotes || {};
    let html = '<div class="episode-grid">';
    for (let i = 1; i <= total; i++) {
        const ep = notes[i] || {};
        const hasNote = ep.note || ep.rating;
        html += `
            <div class="episode-item ${hasNote ? 'episode-done' : ''}" data-ep="${i}">
                <div class="ep-num">第${i}集</div>
                <div class="ep-note">${escHtml(ep.note || '')}</div>
                ${ep.rating ? `<div class="ep-rating">${'★'.repeat(ep.rating)}${'☆'.repeat(5 - ep.rating)}</div>` : ''}
            </div>
        `;
    }
    html += '</div>';
    return html;
}
