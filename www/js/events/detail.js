// ============================================================
// 事件处理 · 详情页 - Anime Tracker
// ============================================================

import { changeProgress } from '../core.js';
import { getBangumiCharacters, getBangumiImageUrl, getBangumiSubject, getYucAnime, hydrateBangumiImages } from '../api.js';
import { deleteAnime, getAnimeById, getCurrentAnime, setState, state, updateAnime } from '../store.js';
import { escHtml, safeImageUrl } from '../utils.js';
import { hasYucSeasonData } from '../yuc.js';

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
        if (confirm(`确定要删除《${anime.title}》吗？此操作不可撤销。`)) {
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
    if (anime.bgmId) {
        loadBangumiDetailInto(anime.bgmId).catch(e => {
            console.error('[Detail] Bangumi 详情加载失败:', e);
            const container = document.getElementById('bangumiDetail');
            if (container) container.innerHTML = '';
        });
    }
    if (state.settings.showAnimeDetails) {
        loadYucDetailInto(anime).catch(error => {
            console.warn('[Detail] 长门有希详情加载失败:', error);
            const container = document.getElementById('yucDetail');
            if (container) container.innerHTML = '';
        });
    }

    // ======== 单集记录编辑 ========
    document.querySelectorAll('.episode-item').forEach(item => {
        item.addEventListener('click', () => {
            const ep = parseInt(item.dataset.ep);
            showEpisodeEditor(anime, ep);
        });
    });
}

async function loadYucDetailInto(anime) {
    const container = document.getElementById('yucDetail');
    if (!container) return;
    if (!hasYucSeasonData(anime.airDate)) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = '<div class="bgm-loading">正在匹配长门有希制作信息...</div>';

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
    const staff = yuc?.staff || {};
    const fields = [
        ['原作', staff.originalWork],
        ['导演', staff.director],
        ['副导演', staff.assistantDirector],
        ['编剧', staff.seriesComposition],
        ['人物设计', staff.characterDesign],
        ['动画人设', staff.animationCharacterDesign],
        ['动画制作', staff.animationStudio],
    ].filter(([, value]) => value);
    if (fields.length === 0) {
        container.innerHTML = '';
        return;
    }

    const sourceUrl = /^https:\/\/yuc\.wiki\/\d{6}\/$/.test(yuc.sourceUrl || '') ? yuc.sourceUrl : 'https://yuc.wiki/';
    container.innerHTML = `
        <div class="yuc-detail-header">
            <h2 class="detail-section-title">制作信息</h2>
            <a href="${escHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">来源：长门有希</a>
        </div>
        <div class="yuc-staff-grid">
            ${fields.map(([label, value]) => `
                <div class="yuc-staff-row">
                    <span class="info-label">${label}</span>
                    <span>${escHtml(value)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

/** 加载 Bangumi 详情（异步渲染到 #bangumiDetail） */
async function loadBangumiDetailInto(bgmId) {
    const container = document.getElementById('bangumiDetail');
    if (!container) return;
    container.innerHTML = '<div class="bgm-loading">加载番剧详情...</div>';

    const [subject, characters] = await Promise.all([
        getBangumiSubject(bgmId),
        getBangumiCharacters(bgmId),
    ]);

    if (!subject) {
        container.innerHTML = '';
        return;
    }

    // 修复旧代理曾写入本地记录的 U+FFFD 替换字符标题。
    const currentAnime = getCurrentAnime();
    const remoteTitle = String(subject.name_cn || subject.name || '').trim();
    if (currentAnime?.id && currentAnime.title.includes('\uFFFD') && remoteTitle && !remoteTitle.includes('\uFFFD')) {
        updateAnime(currentAnime.id, { title: remoteTitle }, { render: false });
        const titleElement = document.querySelector('.detail-title');
        if (titleElement) titleElement.textContent = remoteTitle;
    }

    const rawCover = subject.images?.large || '';
    const cover = getBangumiImageUrl(rawCover);
    const coverFallback = safeImageUrl(rawCover);
    const summary = subject.summary || '';

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
}

/** 显示单集编辑弹窗 */
function showEpisodeEditor(anime, episodeNum) {
    const notes = anime.episodeNotes || {};
    const ep = notes[episodeNum] || {};

    const overlay = document.createElement('div');
    overlay.className = 'ep-editor-overlay';

    let starHtml = '';
    for (let i = 1; i <= 5; i++) {
        starHtml += `<span class="rating-star ${i <= (ep.rating || 0) ? 'filled' : 'empty'}" data-sr="${i}">★</span>`;
    }

    overlay.innerHTML = `
        <div class="ep-editor">
            <div class="ep-editor-title">第 ${episodeNum} 集记录</div>
            <textarea id="epNoteInput" placeholder="写下这一集的感想...">${escHtml(ep.note || '')}</textarea>
            <div class="ep-editor-stars" id="epEditorStars">
                ${starHtml}
            </div>
            <div class="ep-editor-actions">
                <button class="btn btn-secondary" id="epEditorDelete">删除</button>
                <button class="btn btn-primary" id="epEditorSave">保存</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let rating = ep.rating || 0;

    // 点击星星
    overlay.querySelectorAll('#epEditorStars .rating-star').forEach(star => {
        star.addEventListener('click', () => {
            rating = parseInt(star.dataset.sr);
            overlay.querySelectorAll('#epEditorStars .rating-star').forEach((s, idx) => {
                s.className = 'rating-star' + (idx < rating ? ' filled' : ' empty');
            });
        });
    });

    // 保存
    document.getElementById('epEditorSave').addEventListener('click', () => {
        const noteText = document.getElementById('epNoteInput').value.trim();
        const currentAnime = getAnimeById(anime.id);
        if (!currentAnime) return;

        const currentNotes = { ...(currentAnime.episodeNotes || {}) };
        if (noteText || rating > 0) {
            currentNotes[episodeNum] = { note: noteText, rating };
        } else {
            delete currentNotes[episodeNum];
        }
        updateAnime(anime.id, { episodeNotes: currentNotes });
        overlay.remove();
    });

    // 删除
    document.getElementById('epEditorDelete').addEventListener('click', () => {
        const currentAnime = getAnimeById(anime.id);
        if (!currentAnime) return;
        const currentNotes = { ...(currentAnime.episodeNotes || {}) };
        delete currentNotes[episodeNum];
        updateAnime(anime.id, { episodeNotes: currentNotes });
        overlay.remove();
    });

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}
