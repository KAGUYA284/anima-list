// ============================================================
// 渲染层 - Anime Tracker
// ============================================================

/** 主渲染分发器：根据当前页面状态渲染对应视图 */
function render() {
    const app = document.getElementById('app');

    switch (state.currentPage) {
        case 'list':
            app.innerHTML = renderListPage();
            attachListEvents();
            break;
        case 'detail':
            app.innerHTML = renderDetailPage();
            attachDetailEvents();
            break;
        case 'add':
            app.innerHTML = renderFormPage(null);
            attachFormEvents(null);
            break;
        case 'edit':
            app.innerHTML = renderFormPage(state.currentAnime);
            attachFormEvents(state.currentAnime);
            break;
    }
}

/** 渲染列表页 */
function renderListPage() {
    const filtered = getFilteredAnime();

    return `
        <header class="header">
            <div class="header-content">
                <div>
                    <div class="header-title">Anime list</div>
                    <div class="header-subtitle">${filtered.length} 部番剧</div>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <button class="btn btn-secondary" id="exportBtn" style="font-size:0.75rem;padding:0.375rem 0.625rem;">导出</button>
                    <button class="btn btn-secondary" id="importBtn" style="font-size:0.75rem;padding:0.375rem 0.625rem;">导入</button>
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
                value="${state.searchQuery}"
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
    const groups = {};

    animeList.forEach(anime => {
        let year = '未分类';
        let quarter = '';
        const groupDate = anime.type === 'binge'
            ? (anime.startDate || anime.airDate || '')
            : (anime.airDate || '');
        if (groupDate) {
            const parts = groupDate.split('-');
            if (parts.length >= 2) {
                year = parts[0];
                const month = parseInt(parts[1]);
                if (anime.type === 'binge') {
                    if (month >= 1 && month <= 3) quarter = '冬';
                    else if (month >= 4 && month <= 6) quarter = '春';
                    else if (month >= 7 && month <= 9) quarter = '夏';
                    else if (month >= 10 && month <= 12) quarter = '秋';
                } else if (parts.length >= 3) {
                    const day = parseInt(parts[2]);
                    let baseQuarter = '';
                    for (const [q, info] of Object.entries(QUARTER_BOUNDARIES)) {
                        if (info.months.includes(month)) {
                            baseQuarter = q;
                            break;
                        }
                    }
                    if (baseQuarter) {
                        const info = QUARTER_BOUNDARIES[baseQuarter];
                        const lastMonth = info.months[info.months.length - 1];
                        if (month === lastMonth && day >= info.lastWeekDay) {
                            quarter = info.next;
                            if (info.nextYearOffset > 0) {
                                year = String(parseInt(year) + info.nextYearOffset);
                            }
                        } else {
                            quarter = baseQuarter;
                        }
                    }
                } else {
                    if (month >= 1 && month <= 3) quarter = '冬';
                    else if (month >= 4 && month <= 6) quarter = '春';
                    else if (month >= 7 && month <= 9) quarter = '夏';
                    else if (month >= 10 && month <= 12) quarter = '秋';
                }
            }
        }
        if (!groups[year]) groups[year] = {};
        if (!groups[year][quarter]) groups[year][quarter] = [];
        groups[year][quarter].push(anime);
    });

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
            chasing.sort((a, b) => {
                const wa = a.updateWeekDay || 0;
                const wb = b.updateWeekDay || 0;
                if (wa === wb) return a.title.localeCompare(b.title, 'zh');
                if (wa === 0) return 1;
                if (wb === 0) return -1;
                return wa - wb;
            });
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
function renderAnimeCard(anime) {
    const progress = anime.totalEpisodes > 0
        ? (anime.currentEpisode / anime.totalEpisodes) * 100
        : 0;
    const statusConfig = STATUS_CONFIG[anime.status];
    const typeLabel = TYPE_CONFIG[anime.type]?.label || '';

    return `
        <div class="anime-card" data-id="${anime.id}">
            <div class="card-info">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <div class="card-title">${anime.title}</div>
                    ${anime.type === 'binge' ? `<span class="type-badge ${TYPE_CONFIG[anime.type].class}">${typeLabel}</span>` : ''}
                </div>
                <div class="card-meta">
                    <span class="status-badge ${statusConfig.class}">${statusConfig.label}</span>
                    ${anime.type === 'chasing' && anime.updateWeekDay ? `<span class="weekday-tag">${WEEK_DAYS[anime.updateWeekDay]}</span>` : ''}
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
                ${anime.status !== 'dropped' && anime.status !== 'completed' ? `<button class="card-plus-one" data-plus="${anime.id}">+1</button>` : ''}
            </div>
        </div>
    `;
}

/** 渲染详情页 */
function renderDetailPage() {
    const anime = state.currentAnime;
    if (!anime) {
        setState({ currentPage: 'list' });
        return '';
    }

    const progress = anime.totalEpisodes > 0
        ? (anime.currentEpisode / anime.totalEpisodes) * 100
        : 0;
    const statusConfig = STATUS_CONFIG[anime.status];

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
                <h1 class="detail-title">${anime.title}</h1>
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
                        <span>${anime.updateWeekDay ? WEEK_DAYS[anime.updateWeekDay] : '-'}</span>
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
                >${anime.review || ''}</textarea>
            </div>
        </div>
    `;
}

/** 渲染添加/编辑表单页 */
function renderFormPage(anime) {
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
                    value="${data.title}"
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
                <div id="chasingWeekdayInfo" style="display:none;padding:0.5rem 0;color:#e94560;font-size:0.875rem;"></div>
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
                >${data.review || ''}</textarea>
            </div>
        </div>
    `;
}

/** 更新表单中类型选择的 UI */
function updateFormTypeUI(selectedType) {
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
function updateFormStatusUI(selectedStatus) {
    document.querySelectorAll('[data-form-status]').forEach(btn => {
        const status = btn.dataset.formStatus;
        btn.className = 'status-option';
        if (status === selectedStatus) {
            btn.className += ' active-' + status;
        }
    });
}

/** 更新表单中评分选择的 UI */
function updateFormRatingUI(selectedRating) {
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

/** 渲染追番提醒弹窗 */
function showReminder() {
    const now = new Date();
    const todayWeekday = now.getDay() === 0 ? 7 : now.getDay();

    const chasingToday = state.animeList.filter(a =>
        a.status === 'watching' && a.type === 'chasing' && a.updateWeekDay === todayWeekday
    );

    const bingeUnfinished = state.animeList.filter(a =>
        a.status === 'watching' && a.type === 'binge'
    );

    if (chasingToday.length === 0 && bingeUnfinished.length === 0) return;

    let html = '';
    if (chasingToday.length > 0) {
        html += `<div class="reminder-section">
            <div class="reminder-section-title">📺 今天更新的番剧（${chasingToday.length}部）</div>`;
        chasingToday.forEach(a => {
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
                <span>${a.title}</span>
                <span class="reminder-weekday">${a.currentEpisode}/${a.totalEpisodes}集${completeInfo}</span>
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
                <span>${a.title}</span>
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
