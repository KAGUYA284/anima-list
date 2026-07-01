
        const STATUS_CONFIG = {
            want: { label: '想看', class: 'status-want' },
            watching: { label: '在看', class: 'status-watching' },
            paused: { label: '搁置', class: 'status-paused' },
            completed: { label: '已看完', class: 'status-completed' },
            dropped: { label: '放弃', class: 'status-dropped' }
        };

        const STORAGE_KEY = 'anime-tracker-data';

        function loadFromStorage() {
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                return data ? JSON.parse(data) : [];
            } catch {
                return [];
            }
        }

        function saveToStorage(data) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                console.error('Failed to save:', e);
            }
        }

        function escHtml(s) {
            const d = document.createElement('div');
            d.textContent = s;
            return d.innerHTML;
        }

        function generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        }

        function getWeekDayFromDate(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr + 'T00:00:00');
            const day = d.getDay();
            return day === 0 ? 7 : day;
        }

        let state = {
            animeList: loadFromStorage(),
            filter: 'all',
            searchQuery: '',
            currentPage: 'list',
            currentAnime: null
        };

        function setState(updates) {
            state = { ...state, ...updates };
            render();
        }

        function getFilteredAnime() {
            let list = state.animeList;
            if (state.filter !== 'all') {
                list = list.filter(anime => anime.status === state.filter);
            }
            if (state.searchQuery) {
                const q = state.searchQuery.toLowerCase();
                list = list.filter(anime => anime.title.toLowerCase().includes(q));
            }
            return list;
        }

        function getAnimeById(id) {
            return state.animeList.find(a => a.id === id);
        }

        function addAnime(animeData) {
            const newAnime = {
                ...animeData,
                id: generateId(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            const newList = [...state.animeList, newAnime];
            saveToStorage(newList);
            setState({ animeList: newList, currentPage: 'list' });
        }

        function updateAnime(id, updates) {
            const newList = state.animeList.map(anime => 
                anime.id === id 
                    ? { ...anime, ...updates, updatedAt: new Date().toISOString() }
                    : anime
            );
            saveToStorage(newList);
            setState({ animeList: newList });
        }

        function deleteAnime(id) {
            const newList = state.animeList.filter(a => a.id !== id);
            saveToStorage(newList);
            setState({ 
                animeList: newList,
                currentPage: 'list' 
            });
        }

        function renderStars(rating) {
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                const filled = i <= rating;
                stars += `<span class="star ${filled ? 'filled' : 'empty'}">★</span>`;
            }
            return stars;
        }

        function renderEditableStars(rating) {
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                const filled = i <= rating;
                stars += `<span class="rating-star ${filled ? 'filled' : 'empty'}" data-rating="${i}">★</span>`;
            }
            return stars;
        }

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

        function renderAnimeList(animeList) {
            const groups = {};
            
            const QUARTER_BOUNDARIES = {
                '冬': { months: [1,2,3], lastWeekDay: 25, next: '春', nextYearOffset: 0 },
                '春': { months: [4,5,6], lastWeekDay: 24, next: '夏', nextYearOffset: 0 },
                '夏': { months: [7,8,9], lastWeekDay: 24, next: '秋', nextYearOffset: 0 },
                '秋': { months: [10,11,12], lastWeekDay: 25, next: '冬', nextYearOffset: 1 }
            };

            animeList.forEach(anime => {
                let year = '未分类';
                let quarter = '';
                const groupDate = anime.type === 'binge'
                    ? (anime.startDate || anime.airDate || '')
                    : (anime.airDate || '');
                if (groupDate) {
                    const parts = groupDate.split('-');
                    if (parts.length >= 3) {
                        year = parts[0];
                        const month = parseInt(parts[1]);
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
                    } else if (parts.length >= 2) {
                        year = parts[0];
                        const month = parseInt(parts[1]);
                        if (month >= 1 && month <= 3) quarter = '冬';
                        else if (month >= 4 && month <= 6) quarter = '春';
                        else if (month >= 7 && month <= 9) quarter = '夏';
                        else if (month >= 10 && month <= 12) quarter = '秋';
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
            
            const quarterOrder = ['冬', '春', '夏', '秋', ''];

            let yearIdx = 0;
            let html = '<div class="anime-list">';
            years.forEach(year => {
                yearIdx++;
                const yearId = 'year-' + yearIdx;
                const yearTotal = Object.values(groups[year]).reduce((sum, arr) => sum + arr.length, 0);
                html += `<div class="year-header" data-toggle="year" data-target="${yearId}">`;
                html += `<span class="toggle-icon" id="${yearId}-icon">▼</span>`;
                html += `${year}年<span style="color:#9ca3af;font-weight:400;font-size:0.75rem;margin-left:0.375rem;">${yearTotal}</span></div>`;
                html += `<div class="collapsible-content" id="${yearId}" style="max-height:9999px;">`;

                const quartersInYear = Object.keys(groups[year]).sort((a, b) => {
                    return quarterOrder.indexOf(a) - quarterOrder.indexOf(b);
                });
                quartersInYear.forEach(quarter => {
                    const qId = yearId + '-' + (quarter || 'nocat');
                    if (quarter) {
                        html += `<div class="quarter-header" data-toggle="quarter" data-target="${qId}">`;
                        html += `<span class="toggle-icon" id="${qId}-icon">▼</span>`;
                        html += `${quarter}<span style="color:#9ca3af;font-weight:400;font-size:0.6875rem;margin-left:0.375rem;">${groups[year][quarter].length}</span></div>`;
                    }
                    html += `<div class="collapsible-content" id="${qId}" style="max-height:9999px;">`;
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

        function renderAnimeCard(anime) {
            const progress = anime.totalEpisodes > 0 
                ? (anime.currentEpisode / anime.totalEpisodes) * 100 
                : 0;
            const statusConfig = STATUS_CONFIG[anime.status];
            const typeConfig = {
                chasing: { label: '追番', class: 'type-chasing' },
                binge: { label: '补', class: 'type-binge' }
            };
            const weekDays = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

            return `
                <div class="anime-card" data-id="${anime.id}">
                    <div class="card-info">
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <div class="card-title">${anime.title}</div>
                            ${anime.type === 'binge' ? `<span class="type-badge ${typeConfig[anime.type].class}">${typeConfig[anime.type].label}</span>` : ''}
                        </div>
                        <div class="card-meta">
                            <span class="status-badge ${statusConfig.class}">${statusConfig.label}</span>
                            ${anime.type === 'chasing' && anime.updateWeekDay ? `<span class="weekday-tag">${weekDays[anime.updateWeekDay]}</span>` : ''}
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
                        <button class="card-plus-one" data-plus="${anime.id}">+1</button>
                    </div>
                </div>
            `;
        }

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
            const typeConfig = {
                chasing: { label: '追番', class: 'type-chasing' },
                binge: { label: '补番', class: 'type-binge' }
            };
            const weekDays = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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
                            <span class="type-badge ${typeConfig[anime.type || 'chasing'].class}">${typeConfig[anime.type || 'chasing'].label}</span>
                            <span class="status-badge ${statusConfig.class}">${statusConfig.label}</span>
                            <div class="rating-stars" id="detailRating">
                                ${renderEditableStars(anime.rating)}
                            </div>
                        </div>
                    </div>

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
                                <span>${anime.updateWeekDay ? weekDays[anime.updateWeekDay] : '-'}</span>
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
                        <div class="progress-info">
                            <span>进度</span>
                            <span>${Math.round(progress)}%</span>
                        </div>
                        <div class="progress-bar" style="margin-top:0.5rem;">
                            <div class="progress-fill" style="width: ${progress}%;"></div>
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
            const weekDays = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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
                        <div id="chasingWeekdayInfo" class="${data.airDate && data.updateWeekDay ? '' : 'form-section-hidden'}" style="display:${data.airDate && data.updateWeekDay ? 'block' : 'none'};padding:0.5rem 0;color:#e94560;font-size:0.875rem;">
                            📅 ${weekDays[data.updateWeekDay || 0]}更新
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
                        >${data.review || ''}</textarea>
                    </div>
                </div>
            `;
        }

        function attachListEvents() {
            document.querySelectorAll('[data-filter]').forEach(btn => {
                btn.addEventListener('click', () => {
                    setState({ filter: btn.dataset.filter });
                });
            });

            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                let composing = false;
                const doSearch = (val) => {
                    state.searchQuery = val;
                    render();
                    const si = document.getElementById('searchInput');
                    if (si) {
                        si.focus();
                        si.setSelectionRange(val.length, val.length);
                    }
                };
                searchInput.addEventListener('compositionstart', () => { composing = true; });
                searchInput.addEventListener('compositionend', (e) => {
                    composing = false;
                    doSearch(e.target.value);
                });
                searchInput.addEventListener('input', (e) => {
                    if (!composing) {
                        doSearch(e.target.value);
                    }
                });
            }

            document.querySelectorAll('[data-toggle="year"]').forEach(header => {
                header.addEventListener('click', (e) => {
                    const targetId = header.dataset.target;
                    const content = document.getElementById(targetId);
                    const icon = document.getElementById(targetId + '-icon');
                    if (!content || !icon) return;
                    const isCollapsed = content.classList.contains('collapsed');
                    if (isCollapsed) {
                        content.classList.remove('collapsed');
                        content.style.maxHeight = '9999px';
                        icon.classList.remove('collapsed');
                    } else {
                        content.classList.add('collapsed');
                        content.style.maxHeight = '0px';
                        icon.classList.add('collapsed');
                    }
                });
            });

            document.querySelectorAll('[data-toggle="quarter"]').forEach(header => {
                header.addEventListener('click', (e) => {
                    const targetId = header.dataset.target;
                    const content = document.getElementById(targetId);
                    const icon = document.getElementById(targetId + '-icon');
                    if (!content || !icon) return;
                    const isCollapsed = content.classList.contains('collapsed');
                    if (isCollapsed) {
                        content.classList.remove('collapsed');
                        content.style.maxHeight = '9999px';
                        icon.classList.remove('collapsed');
                    } else {
                        content.classList.add('collapsed');
                        content.style.maxHeight = '0px';
                        icon.classList.add('collapsed');
                    }
                });
            });

            const addBtn = document.getElementById('addAnimeBtn');
            const addFirstBtn = document.getElementById('addFirstAnime');
            if (addBtn) addBtn.addEventListener('click', () => setState({ currentPage: 'add' }));
            if (addFirstBtn) addFirstBtn.addEventListener('click', () => setState({ currentPage: 'add' }));

            document.querySelectorAll('.anime-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    const id = card.dataset.id;
                    const anime = getAnimeById(id);
                    setState({ currentPage: 'detail', currentAnime: anime });
                });
            });

            document.querySelectorAll('[data-plus]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.plus;
                    const anime = getAnimeById(id);
                    if (!anime) return;
                    let newEpisode = anime.currentEpisode + 1;
                    let newStatus = anime.status;
                    if (newEpisode > anime.totalEpisodes) {
                        newEpisode = anime.totalEpisodes;
                    }
                    if (newEpisode === anime.totalEpisodes && anime.totalEpisodes > 0) {
                        newStatus = 'completed';
                    } else if (newEpisode > 0 && anime.status === 'want') {
                        newStatus = 'watching';
                    }
                    updateAnime(id, { currentEpisode: newEpisode, status: newStatus });
                });
            });

            const exportBtn = document.getElementById('exportBtn');
            if (exportBtn) exportBtn.addEventListener('click', async () => {
                const json = JSON.stringify(state.animeList, null, 2);

                if (window.showSaveFilePicker) {
                    const blob = new Blob([json], { type: 'application/json' });
                    try {
                        const handle = await window.showSaveFilePicker({
                            suggestedName: 'Anime list.json',
                            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
                        });
                        const writable = await handle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        showToast('导出成功 — Anime list.json');
                    } catch (e) {
                        if (e.name !== 'AbortError') showToast('导出失败');
                    }
                    return;
                }

                const hasCapacitor = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share;

                let shared = false;

                if (hasCapacitor) {
                    try {
                        await Capacitor.Plugins.Share.share({
                            title: 'Anime list',
                            text: json,
                            dialogTitle: '分享追番数据'
                        });
                        shared = true;
                    } catch {}
                }

                if (!shared && navigator.share) {
                    try {
                        await navigator.share({ title: 'Anime list', text: json });
                        shared = true;
                    } catch (e) {
                        if (e.name === 'AbortError') return;
                    }
                }

                showToast(shared ? '分享成功' : '导出失败');
            });

            const importBtn = document.getElementById('importBtn');
            const fileInput = document.getElementById('importFileInput');
            if (importBtn && fileInput) {
                importBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', () => {
                    const file = fileInput.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            const imported = JSON.parse(reader.result);
                            if (!Array.isArray(imported)) {
                                alert('文件格式错误');
                                return;
                            }
                            doImportJson(imported);
                        } catch (e) {
                            alert('文件解析失败：' + e.message);
                        }
                    };
                    reader.readAsText(file);
                    fileInput.value = '';
                });
            }

            function doImportJson(imported) {
                const localCount = state.animeList.length;
                const cloudCount = imported.length;
                const merged = new Map();
                state.animeList.forEach(item => merged.set(item.id, item));
                imported.forEach(item => {
                    const local = merged.get(item.id);
                    if (!local || new Date(item.updatedAt) > new Date(local.updatedAt)) {
                        merged.set(item.id, item);
                    }
                });
                const result = Array.from(merged.values());
                const msg = `本地：${localCount} 条\n导入数据：${cloudCount} 条\n合并后：${result.length} 条\n\n以最新修改时间为准，确认导入？`;
                if (!confirm(msg)) return;
                saveToStorage(result);
                setState({ animeList: result });
                setTimeout(() => showToast('导入成功'), 100);
            }
        }

        function attachDetailEvents() {
            const anime = state.currentAnime;
            if (!anime) return;

            document.getElementById('backToList').addEventListener('click', () => {
                setState({ currentPage: 'list', currentAnime: null });
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
                const newEpisode = Math.max(0, anime.currentEpisode - 1);
                const updates = { currentEpisode: newEpisode };
                if (newEpisode === 0) {
                    updates.status = 'want';
                } else if (anime.status === 'completed' && newEpisode < anime.totalEpisodes) {
                    updates.status = 'watching';
                }
                updateAnime(anime.id, updates);
                setState({ currentAnime: getAnimeById(anime.id) });
            });

            document.getElementById('progressPlus').addEventListener('click', () => {
                let newEpisode = anime.currentEpisode + 1;
                let newStatus = anime.status;
                
                if (newEpisode > anime.totalEpisodes) {
                    newEpisode = anime.totalEpisodes;
                }
                
                if (newEpisode === anime.totalEpisodes && anime.totalEpisodes > 0) {
                    newStatus = 'completed';
                } else if (newEpisode > 0 && anime.status === 'want') {
                    newStatus = 'watching';
                }
                
                updateAnime(anime.id, { currentEpisode: newEpisode, status: newStatus });
                setState({ currentAnime: getAnimeById(anime.id) });
            });

            document.querySelectorAll('#detailRating .rating-star').forEach(star => {
                star.addEventListener('click', () => {
                    const rating = parseInt(star.dataset.rating);
                    const newRating = anime.rating === rating ? 0 : rating;
                    updateAnime(anime.id, { rating: newRating });
                    setState({ currentAnime: getAnimeById(anime.id) });
                });
            });

            document.querySelectorAll('[data-status]').forEach(btn => {
                btn.addEventListener('click', () => {
                    updateAnime(anime.id, { status: btn.dataset.status });
                    setState({ currentAnime: getAnimeById(anime.id) });
                });
            });

            const reviewEl = document.getElementById('detailReview');
            let reviewTimeout;
            reviewEl.addEventListener('input', () => {
                clearTimeout(reviewTimeout);
                reviewTimeout = setTimeout(() => {
                    updateAnime(anime.id, { review: reviewEl.value });
                }, 500);
            });
        }

        async function searchBangumi(keyword) {
            const res = await fetch('https://api.bgm.tv/v0/search/subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword, filter: { type: [2] }, limit: 8 })
            });
            if (!res.ok) return [];
            const data = await res.json();
            return (data.data || []).filter(item => item.type === 2);
        }

        async function getBangumiSubject(id) {
            const res = await fetch('https://api.bgm.tv/v0/subjects/' + id);
            if (!res.ok) return null;
            return res.json();
        }

        function attachFormEvents(anime) {
            const isEdit = !!anime;
            let formData = {
                status: anime?.status || 'watching',
                rating: anime?.rating || 0,
                type: anime?.type || 'chasing'
            };

            document.getElementById('backToList').addEventListener('click', () => {
                setState({ currentPage: 'list', currentAnime: null });
            });

            const epWheel = document.getElementById('epWheel');
            const epItems = document.getElementById('epItems');
            const epMinus = document.getElementById('epMinus');
            const epPlus = document.getElementById('epPlus');
            const formCurrent = document.getElementById('formCurrent');
            const formTotal = document.getElementById('formTotal');

            function getTotal() {
                return Math.max(1, parseInt(formTotal.value) || 1);
            }

            function getCurrent() {
                return parseInt(formCurrent.value) || 0;
            }

            function setCurrent(val) {
                formCurrent.value = val;
                buildWheel(val);
            }

            function buildWheel(scrollToVal) {
                const total = getTotal();
                let html = '';
                for (let i = 0; i <= total; i++) {
                    html += `<div class="episode-picker-item" data-ep="${i}">${i}</div>`;
                }
                epItems.innerHTML = html;
                scrollToEpisode(scrollToVal != null ? scrollToVal : getCurrent());
            }

            function scrollToEpisode(val) {
                const item = epItems.querySelector(`[data-ep="${val}"]`);
                if (item) {
                    const scrollTop = item.offsetTop - epItems.offsetTop - 3 * epItems.clientHeight / 9;
                    epItems.scrollTop = Math.max(0, scrollTop);
                }
                updateActiveItem();
            }

            function updateActiveItem() {
                const items = epItems.querySelectorAll('.episode-picker-item');
                const center = epItems.scrollTop + epItems.clientHeight / 2;
                let best = null;
                let bestDist = Infinity;
                items.forEach(item => {
                    const mid = item.offsetTop + item.offsetHeight / 2 - epItems.offsetTop;
                    const dist = Math.abs(mid - center);
                    if (dist < bestDist) { bestDist = dist; best = item; }
                });
                items.forEach(i => i.classList.remove('active'));
                if (best) {
                    best.classList.add('active');
                    formCurrent.value = best.dataset.ep;
                }
            }

            buildWheel(parseInt(formCurrent.value) || 0);

            let wheelTimeout;
            epItems.addEventListener('scroll', () => {
                clearTimeout(wheelTimeout);
                updateActiveItem();
                wheelTimeout = setTimeout(() => {
                    const val = parseInt(formCurrent.value) || 0;
                    scrollToEpisode(val);
                }, 200);
            }, { passive: true });

            epMinus.addEventListener('click', () => {
                setCurrent(Math.max(0, getCurrent() - 1));
            });

            epPlus.addEventListener('click', () => {
                const max = getTotal();
                setCurrent(Math.min(max, getCurrent() + 1));
            });

            formTotal.addEventListener('input', () => {
                formCurrent.value = Math.min(getTotal(), parseInt(formCurrent.value) || 0);
                buildWheel();
            });

            document.querySelectorAll('[data-form-type]').forEach(btn => {
                btn.addEventListener('click', () => {
                    formData.type = btn.dataset.formType;
                    updateFormTypeUI(formData.type);
                });
            });

            document.querySelectorAll('[data-form-status]').forEach(btn => {
                btn.addEventListener('click', () => {
                    formData.status = btn.dataset.formStatus;
                    updateFormStatusUI(formData.status);
                });
            });

            document.querySelectorAll('#formRating .rating-star').forEach(star => {
                star.addEventListener('click', () => {
                    const rating = parseInt(star.dataset.rating);
                    formData.rating = formData.rating === rating ? 0 : rating;
                    updateFormRatingUI(formData.rating);
                });
            });

            document.getElementById('saveAnime').addEventListener('click', (e) => {
                e.preventDefault();
                
                const title = document.getElementById('formTitle').value.trim();
                if (!title) {
                    alert('请输入番剧名称');
                    return;
                }

                const totalEpisodes = Math.max(1, parseInt(document.getElementById('formTotal').value) || 1);
                const currentEpisode = Math.min(totalEpisodes, Math.max(0, parseInt(document.getElementById('formCurrent').value) || 0));
                const review = document.getElementById('formReview').value;
                
                let airDate = '';
                let updateWeekDay = '';
                let completedDate = '';
                let startDate = '';
                
                if (formData.type === 'chasing') {
                    airDate = document.getElementById('formAirDate')?.value || '';
                    updateWeekDay = getWeekDayFromDate(airDate);
                } else {
                    airDate = document.getElementById('formBingeAirDate')?.value || '';
                    startDate = document.getElementById('formAirDateBinge')?.value || '';
                    completedDate = document.getElementById('formCompletedDate')?.value || '';
                }

                let status = formData.status;
                if (currentEpisode === 0) {
                    status = 'want';
                } else if (currentEpisode >= totalEpisodes && totalEpisodes > 0) {
                    status = 'completed';
                }

                const data = {
                    title,
                    totalEpisodes,
                    currentEpisode,
                    status,
                    rating: formData.rating,
                    review,
                    airDate,
                    type: formData.type,
                    updateWeekDay,
                    completedDate,
                    startDate
                };

                if (isEdit) {
                    updateAnime(anime.id, data);
                    setState({ 
                        currentPage: 'list', 
                        currentAnime: null 
                    });
                } else {
                    addAnime(data);
                }
            });

            const bgmResults = document.getElementById('bgmResults');
            const formTitle = document.getElementById('formTitle');
            if (bgmResults && formTitle) {
                let debounceTimer;
                let lastKeyword = '';

                const doSearch = async (keyword) => {
                    if (!keyword) {
                        bgmResults.style.display = 'none';
                        return;
                    }
                    if (keyword === lastKeyword) return;
                    lastKeyword = keyword;

                    bgmResults.style.display = 'block';
                    bgmResults.innerHTML = '<div class="bgm-loading">搜索中...</div>';

                    let subjects = [];
                    try {
                        subjects = await searchBangumi(keyword);
                    } catch (e) {
                        bgmResults.innerHTML = '<div class="bgm-loading" style="color:#f87171;">搜索失败，请重试</div>';
                        return;
                    }

                    if (subjects.length === 0) {
                        bgmResults.innerHTML = '<div class="bgm-loading">未找到相关番剧</div>';
                        return;
                    }

                    bgmResults.innerHTML = subjects.map(item => {
                        const cn = item.name_cn && item.name_cn !== item.name ? item.name_cn : '';
                        const date = item.date || '';
                        return `
                            <div class="bgm-result-item" data-bgm-id="${item.id}">
                                <div>
                                    <span class="bgm-result-name">${escHtml(item.name)}</span>
                                    ${cn ? `<span class="bgm-result-cn">${escHtml(cn)}</span>` : ''}
                                </div>
                                <span class="bgm-result-meta">${date}</span>
                            </div>
                        `;
                    }).join('');

                    bgmResults.querySelectorAll('.bgm-result-item').forEach(item => {
                        item.addEventListener('click', async () => {
                            const id = item.dataset.bgmId;
                            item.innerHTML = '<div class="bgm-loading">加载详情...</div>';
                            try {
                                const detail = await getBangumiSubject(id);
                                if (!detail) throw new Error('No data');

                                document.getElementById('formTitle').value = detail.name_cn || detail.name;
                                document.getElementById('formTotal').value = detail.total_episodes || 12;

                                if (detail.date) {
                                    const isChasing = (formData.type || 'chasing') === 'chasing';
                                    if (isChasing) {
                                        const airDateInput = document.getElementById('formAirDate');
                                        if (airDateInput) airDateInput.value = detail.date;
                                        const wd = getWeekDayFromDate(detail.date);
                                        const weekDays = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
                                        const infoEl = document.getElementById('chasingWeekdayInfo');
                                        if (infoEl && wd) {
                                            infoEl.style.display = 'block';
                                            infoEl.textContent = '📅 ' + weekDays[wd] + '更新';
                                        }
                                    } else {
                                        const bingeAirDate = document.getElementById('formBingeAirDate');
                                        if (bingeAirDate) bingeAirDate.value = detail.date;
                                    }
                                }

                                bgmResults.style.display = 'none';
                                lastKeyword = detail.name_cn || detail.name || '';
                                showToast('已自动填写番剧信息');
                            } catch (e) {
                                item.innerHTML = '<div class="bgm-loading" style="color:#f87171;">加载失败</div>';
                            }
                        });
                    });
                };

                formTitle.addEventListener('input', () => {
                    clearTimeout(debounceTimer);
                    const keyword = formTitle.value.trim();
                    if (keyword.length < 2) {
                        bgmResults.style.display = 'none';
                        return;
                    }
                    debounceTimer = setTimeout(() => doSearch(keyword), 500);
                });

                formTitle.addEventListener('focus', () => {
                    const keyword = formTitle.value.trim();
                    if (keyword.length >= 2 && lastKeyword !== keyword) {
                        clearTimeout(debounceTimer);
                        doSearch(keyword);
                    }
                });

                formTitle.addEventListener('blur', () => {
                    setTimeout(() => { bgmResults.style.display = 'none'; }, 200);
                });
            }
        }

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

        function updateFormStatusUI(selectedStatus) {
            document.querySelectorAll('[data-form-status]').forEach(btn => {
                const status = btn.dataset.formStatus;
                btn.className = 'status-option';
                if (status === selectedStatus) {
                    btn.className += ' active-' + status;
                }
            });
        }

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

        function showToast(msg) {
            const el = document.createElement('div');
            el.className = 'toast';
            el.textContent = msg;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 2000);
        }

        function showReminder() {
            const now = new Date();
            const todayWeekday = now.getDay() === 0 ? 7 : now.getDay();
            const weekDays = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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
                    html += `<div class="reminder-item">
                        <span>${a.title}</span>
                        <span class="reminder-weekday">${weekDays[todayWeekday]} · ${a.currentEpisode}/${a.totalEpisodes}集</span>
                    </div>`;
                });
                html += `</div>`;
            }

            if (bingeUnfinished.length > 0) {
                html += `<div class="reminder-section">
                    <div class="reminder-section-title">📚 未看完的番剧（${bingeUnfinished.length}部）</div>`;
                bingeUnfinished.forEach(a => {
                    html += `<div class="reminder-item">
                        <span>${a.title}</span>
                        <span class="reminder-weekday">${a.currentEpisode}/${a.totalEpisodes}集</span>
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

        render();

        setTimeout(showReminder, 600);

        if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
            Capacitor.Plugins.App.addListener('backButton', () => {
                if (state.currentPage === 'detail') {
                    setState({ currentPage: 'list', currentAnime: null });
                } else if (state.currentPage === 'add' || state.currentPage === 'edit') {
                    setState({ currentPage: 'list', currentAnime: null });
                } else {
                    if (!window._exitTimer) {
                        window._exitTimer = true;
                        showToast('再按一次退出');
                        setTimeout(() => { window._exitTimer = false; }, 2000);
                    } else {
                        Capacitor.Plugins.App.exitApp();
                    }
                }
            });
        }
    