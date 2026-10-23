// ============================================================
// 事件处理 · 详情页 - Anime Tracker
// ============================================================

import { changeProgress } from '../core.js';
import { getBangumiCharacters, getBangumiImageUrl, getBangumiSubject, getYucAnime, hydrateBangumiImages } from '../api.js';
import { deleteAnime, getCurrentAnime, setState, state, updateAnime, updateSettings } from '../store.js';
import { escHtml, safeImageUrl } from '../utils.js';
import { hasYucSeasonData } from '../yuc.js';
import { attachEpisodeNotes } from '../episode-notes.js';
import { getLibraryMetadata, persistLibraryMetadata, resolveLibraryThumbnail } from '../library-cache.js';
import { renderStaffInformation } from '../renderer/detail.js';

/** 绑定详情页事件 */
export function attachDetailEvents() {
    const anime = getCurrentAnime();
    if (!anime) return;

    document.getElementById('backToList').addEventListener('click', () => {
        setState({ currentPage: 'list', currentAnimeId: null });
    });

    document.getElementById('editAnime').addEventListener('click', () => {
        setState({ currentPage: 'edit' });
    });

    document.getElementById('deleteAnime').addEventListener('click', () => {
        if (confirm(`确定要删除《${anime.title}》吗？删除后可以短时间撤销。`)) {
            deleteAnime(anime.id);
        }
    });

    document.getElementById('progressMinus').addEventListener('click', () => {
        updateAnime(anime.id, changeProgress(anime, -1));
    });

    document.getElementById('progressPlus').addEventListener('click', () => {
        updateAnime(anime.id, changeProgress(anime, 1));
    });

    document.querySelectorAll('#detailRating .rating-star').forEach(star => {
        star.addEventListener('click', () => {
            const rating = parseInt(star.dataset.rating);
            const newRating = anime.rating === rating ? 0 : rating;
            updateAnime(anime.id, { rating: newRating });
        });
    });

    document.querySelectorAll('[data-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            updateAnime(anime.id, { status: btn.dataset.status });
        });
    });

    const reviewEl = document.getElementById('detailReview');
    let reviewTimeout;
    reviewEl.addEventListener('input', () => {
        clearTimeout(reviewTimeout);
        reviewTimeout = setTimeout(() => {
            updateAnime(anime.id, { review: reviewEl.value }, { render: false });
        }, 500);
    });

    // ======== Bangumi 详情加载 ========
    if (state.settings.showAnimeDetails) {
        applySavedThumbnail(anime, document.getElementById('bangumiDetail'));
    }
    if (state.settings.showAnimeDetails && anime.bgmId) {
        loadBangumiDetailInto(anime).catch(e => {
            console.error('[Detail] Bangumi 详情加载失败:', e);
            if (getCurrentAnime()?.id !== anime.id) return;
            const container = document.getElementById('bangumiDetail');
            container?.querySelector('.bgm-loading')?.remove();
        });
    }
    if (state.settings.showAnimeDetails) {
        loadYucDetailInto(anime).catch(error => {
            console.warn('[Detail] 长门有希详情加载失败:', error);
            if (getCurrentAnime()?.id !== anime.id) return;
            const container = document.getElementById('yucDetail');
            container?.querySelector('.bgm-loading')?.remove();
        });
    }

    const episodeSection = document.getElementById('episodeNotesSection');
    episodeSection?.addEventListener('toggle', () => {
        if (state.settings.episodeNotesCollapsed !== !episodeSection.open) {
            updateSettings({ episodeNotesCollapsed: !episodeSection.open }, { render: false });
        }
    });
    attachEpisodeNotes(document.getElementById('episodeNotes'), anime.id, {
        jumpButton: document.getElementById('jumpToCurrentEpisode'),
    });
}

async function applySavedThumbnail(anime, container) {
    if (!container) return;
    try {
        const url = await resolveLibraryThumbnail(anime, { fetchMissing: false });
        const image = container.querySelector('.bgm-cover img');
        if (!url || !image || !container.isConnected || getCurrentAnime()?.id !== anime.id) return;
        image.dataset.localThumbnail = 'true';
        image.src = url;
        image.style.display = '';
    } catch (error) {
        console.warn('[Detail] 本地缩略图读取失败:', error);
    }
}

async function loadYucDetailInto(anime) {
    const container = document.getElementById('yucDetail');
    if (!container) return;
    if (!hasYucSeasonData(anime.airDate)) {
        container.innerHTML = '';
        return;
    }
    if (!container.innerHTML.trim()) container.innerHTML = '<div class="bgm-loading">正在匹配制作信息...</div>';

    let subject = null;
    if (anime.bgmId) {
        try {
            subject = await getBangumiSubject(anime.bgmId);
        } catch (error) {
            console.warn('[Yuc] Bangumi 标题别名加载失败', error);
        }
    }
    const yuc = await getYucAnime({
        title: anime.title,
        titleCn: subject?.name_cn || '',
        titleJp: subject?.name || '',
        airDate: anime.airDate,
    });
    if (yuc) await persistLibraryMetadata(anime.id, { yuc });
    if (!container.isConnected || getCurrentAnime()?.id !== anime.id) return;
    const saved = getLibraryMetadata(getCurrentAnime());
    const html = renderStaffInformation(saved.staff);
    if (html) container.innerHTML = html;
    else container.querySelector('.bgm-loading')?.remove();
}

/** 加载 Bangumi 详情（异步渲染到 #bangumiDetail） */
async function loadBangumiDetailInto(anime) {
    const container = document.getElementById('bangumiDetail');
    if (!container) return;
    if (!container.innerHTML.trim()) container.innerHTML = '<div class="bgm-loading">加载番剧详情...</div>';

    const [subjectResult, charactersResult] = await Promise.allSettled([
        getBangumiSubject(anime.bgmId),
        getBangumiCharacters(anime.bgmId),
    ]);
    if (subjectResult.status === 'rejected') throw subjectResult.reason;
    const subject = subjectResult.value;
    const characters = charactersResult.status === 'fulfilled' ? charactersResult.value : [];

    if (!subject) {
        container.querySelector('.bgm-loading')?.remove();
        return;
    }
    await persistLibraryMetadata(anime.id, { subject });
    if (!container.isConnected || getCurrentAnime()?.id !== anime.id) return;

    // 修复旧代理曾写入本地记录的 U+FFFD 替换字符标题。
    const currentAnime = getCurrentAnime();
    const remoteTitle = String(subject.name_cn || subject.name || '').trim();
    if (currentAnime?.id && currentAnime.title.includes('\uFFFD') && remoteTitle && !remoteTitle.includes('\uFFFD')) {
        updateAnime(currentAnime.id, { title: remoteTitle }, { render: false });
        const titleElement = document.querySelector('.detail-title');
        if (titleElement) titleElement.textContent = remoteTitle;
    }

    const metadata = getLibraryMetadata(getCurrentAnime());
    const rawCover = subject.images?.large || metadata.coverUrl || metadata.thumbnailUrl || '';
    const cover = getBangumiImageUrl(rawCover);
    const coverFallback = safeImageUrl(rawCover);
    const summary = subject.summary || metadata.summary || '';

    // 角色头像 HTML（带加载失败回退）
    function avatarHtml(c) {
        var rawImgUrl = c.images?.grid || c.images?.small || c.images?.medium || '';
        var imgUrl = getBangumiImageUrl(rawImgUrl);
        var fallbackUrl = safeImageUrl(rawImgUrl);
        if (imgUrl) {
            return '<div class="char-avatar-wrap"><img src="' + imgUrl + '" data-direct-src="' + fallbackUrl + '" alt="' + escHtml(c.name) + '" class="char-avatar" onerror="if(this.src!==this.dataset.directSrc){this.src=this.dataset.directSrc;return}var p=this.parentNode;p.classList.add(\'char-avatar-fallback\');this.remove();"></div>';
        }
        return '<div class="char-avatar char-avatar-placeholder"></div>';
    }

    // 按 relation 排序（主角优先，其次配角，其次客串/闲角/旁白）
    const roleOrder = { '主角': 1, '配角': 2, '客串': 3, '闲角': 4, '旁白': 5 };
    const sortedChars = [...characters].sort((a, b) => {
        const ra = roleOrder[a.relation] || 99;
        const rb = roleOrder[b.relation] || 99;
        return ra - rb;
    });

    container.innerHTML = `
        <div class="bgm-detail">
            ${cover ? `<div class="bgm-cover"><img src="${cover}" data-direct-src="${coverFallback}" onerror="if(this.src!==this.dataset.directSrc){this.src=this.dataset.directSrc}else{this.style.display='none'}" alt="封面"></div>` : ''}
            <div class="bgm-info">
                ${summary ? `<p class="bgm-summary">${escHtml(summary)}</p>` : ''}
            </div>
        </div>
        ${sortedChars.length > 0 ? `
            <h3 style="font-size:0.875rem;font-weight:600;color:#374151;margin:0.75rem 0 0.25rem;">角色 · 声优</h3>
            <div class="bgm-characters">
                ${sortedChars.map(c => `
                    <div class="bgm-character">
                        ${avatarHtml(c)}
                        <div class="char-info">
                            <span class="char-name">${escHtml(c.name)}${c.relation === '主角' ? ' <span class="char-badge">主角</span>' : ''}</span>
                            ${c.actors?.[0] ? `<span class="char-cv">CV: ${escHtml(c.actors[0].name)}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
    hydrateBangumiImages(container);
    applySavedThumbnail(getCurrentAnime(), container);
}
