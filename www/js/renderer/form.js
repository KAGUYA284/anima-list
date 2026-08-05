// ============================================================
// 渲染层 · 表单页（添加/编辑） - Anime Tracker
// ============================================================

import { STATUS_CONFIG, WEEK_DAYS } from '../constants.js';
import { escHtml, renderEditableStars } from '../utils.js';

/** 渲染添加/编辑表单页 */
export function renderFormPage(anime) {
    const isEdit = !!anime;
    const data = anime || {
        title: '',
        totalEpisodes: 12,
        currentEpisode: 0,
        status: 'watching',
        rating: 0,
        review: '',
        airDate: '',
        type: 'chasing',
        updateWeekDay: '',
        updateTime: '',
        completedDate: ''
    };
    const currentType = data.type || 'chasing';

    return `
        <header class="header">
            <div class="header-content">
                <button class="btn btn-secondary" id="backToList">
                    ← 取消
                </button>
                <span class="header-title" style="font-size:1.125rem;">
                    ${isEdit ? '编辑番剧' : '添加番剧'}
                </span>
                <button class="btn btn-primary" id="saveAnime">
                    保存
                </button>
            </div>
        </header>

        <div class="detail-page">
            <div class="form-group">
                <label class="form-label">番剧名称 *</label>
                <input
                    type="text"
                    class="form-input"
                    id="formTitle"
                    placeholder="输入番剧名称进行搜索"
                    value="${escHtml(data.title)}"
                    required
                >
            </div>
            <div class="bgm-results" id="bgmResults" style="display:none;"></div>

            <div class="form-group">
                <label class="form-label">类型</label>
                <div class="type-grid">
                    <button type="button" class="type-option ${currentType === 'chasing' ? 'active-chasing' : ''}" data-form-type="chasing">
                        追番
                    </button>
                    <button type="button" class="type-option ${currentType === 'binge' ? 'active-binge' : ''}" data-form-type="binge">
                        补番
                    </button>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">总集数</label>
                    <input
                        type="number"
                        class="form-input"
                        id="formTotal"
                        min="1"
                        value="${data.totalEpisodes}"
                    >
                </div>
                <div class="form-group">
                    <label class="form-label">已看集数</label>
                    <div class="episode-picker">
                        <button type="button" class="episode-picker-btn" id="epMinus">−</button>
                        <div class="episode-picker-wheel" id="epWheel">
                            <div class="episode-picker-items" id="epItems"></div>
                        </div>
                        <button type="button" class="episode-picker-btn" id="epPlus">+</button>
                    </div>
                    <input type="hidden" id="formCurrent" value="${data.currentEpisode}">
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">观看状态</label>
                <div class="status-grid">
                    ${Object.entries(STATUS_CONFIG).filter(([s]) => s !== 'want' && s !== 'completed').map(([status, config]) => `
                        <button type="button" class="status-option ${data.status === status ? `active-${status}` : ''}" data-form-status="${status}">
                            ${config.label}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div id="chasingSection" class="${currentType === 'chasing' ? '' : 'form-section-hidden'}">
                <div class="form-group">
                    <label class="form-label">放送日期</label>
                    <input
                        type="date"
                        class="form-input"
                        id="formAirDate"
                        value="${data.airDate}"
                    >
                </div>
                <div class="form-group">
                    <label class="form-label">每周更新时间</label>
                    <select class="form-input" id="formUpdateWeekDay">
                        <option value="">请选择更新时间</option>
                        ${WEEK_DAYS.slice(1).map((label, index) => `
                            <option value="${index + 1}" ${Number(data.updateWeekDay) === index + 1 ? 'selected' : ''}>${label}</option>
                        `).join('')}
                    </select>
                    <div id="chasingWeekdayInfo" style="padding:0.375rem 0 0;color:#6b7280;font-size:0.75rem;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">具体更新时间</label>
                    <input
                        type="text"
                        inputmode="numeric"
                        class="form-input"
                        id="formUpdateTime"
                        placeholder="例如 22:00；深夜档可填写 25:30"
                        value="${escHtml(data.updateTime || '')}"
                        maxlength="5"
                    >
                </div>
            </div>

            <div id="bingeSection" class="${currentType === 'binge' ? '' : 'form-section-hidden'}">
                <div class="form-group">
                    <label class="form-label">放送日期</label>
                    <input
                        type="date"
                        class="form-input"
                        id="formBingeAirDate"
                        value="${data.airDate}"
                    >
                </div>
                <div class="form-group">
                    <label class="form-label">开始观看日期</label>
                    <input
                        type="date"
                        class="form-input"
                        id="formAirDateBinge"
                        value="${data.startDate || ''}"
                    >
                </div>
                <div class="form-group">
                    <label class="form-label">看完日期</label>
                    <input
                        type="date"
                        class="form-input"
                        id="formCompletedDate"
                        value="${data.completedDate || ''}"
                    >
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">评分</label>
                <div class="rating-stars" id="formRating">
                    ${renderEditableStars(data.rating)}
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">观后感</label>
                <textarea
                    class="form-input form-textarea"
                    id="formReview"
                    placeholder="写下你的观后感..."
                >${escHtml(data.review || '')}</textarea>
            </div>
        </div>
    `;
}

/** 更新表单中类型选择的 UI */
export function updateFormTypeUI(selectedType) {
    document.querySelectorAll('[data-form-type]').forEach(btn => {
        const type = btn.dataset.formType;
        btn.className = 'type-option';
        if (type === selectedType) {
            btn.className += ' active-' + type;
        }
    });

    const chasingSection = document.getElementById('chasingSection');
    const bingeSection = document.getElementById('bingeSection');
    if (chasingSection) {
        chasingSection.className = selectedType === 'chasing' ? '' : 'form-section-hidden';
    }
    if (bingeSection) {
        bingeSection.className = selectedType === 'binge' ? '' : 'form-section-hidden';
    }
}

/** 更新表单中状态选择的 UI */
export function updateFormStatusUI(selectedStatus) {
    document.querySelectorAll('[data-form-status]').forEach(btn => {
        const status = btn.dataset.formStatus;
        btn.className = 'status-option';
        if (status === selectedStatus) {
            btn.className += ' active-' + status;
        }
    });
}

/** 更新表单中评分选择的 UI */
export function updateFormRatingUI(selectedRating) {
    document.querySelectorAll('#formRating .rating-star').forEach(star => {
        const rating = parseInt(star.dataset.rating);
        star.className = 'rating-star';
        if (rating <= selectedRating) {
            star.className += ' filled';
        } else {
            star.className += ' empty';
        }
    });
}
