// ============================================================
// 事件处理 - Anime Tracker
// ============================================================

import { QUARTER_BOUNDARIES, QUARTER_ORDER, WEEK_DAYS } from './constants.js';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { changeProgress, classifySeason, deriveStatus, extractAnimationStudio } from './core.js';
import { createBackup, readBackup } from './data.js';
import { getBangumiCharacters, getBangumiImageUrl, getBangumiPersons, getBangumiSubject, hydrateBangumiImages, searchBangumi } from './api.js';
import {
    addAnime, deleteAnime, getAnimeById, getCurrentAnime, replaceAnimeList,
    setState, state, updateAnime, updateSettings,
} from './store.js';
import { loadCollapsed, saveCollapsed } from './storage.js';
import { escHtml, getWeekDayFromDate, safeImageUrl, showToast } from './utils.js';
import { loadListCovers, updateFormRatingUI, updateFormStatusUI, updateFormTypeUI } from './renderer.js';

/** 绑定列表页事件 */
export function attachListEvents() {
    // 移动端检测
    if (window.Capacitor || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.body.classList.add('is-mobile');
    } else {
        document.body.classList.remove('is-mobile');
    }

    // Android 状态栏安全区域兜底（CSS env() 可能返回 0）
    if (/Android/i.test(navigator.userAgent)) {
        const header = document.querySelector('.header');
        if (header) {
            const ptop = parseFloat(getComputedStyle(header).paddingTop);
            // 如果 env(safe-area-inset-top) 为 0，补充最小安全间距
            if (ptop < 20) {
                header.style.paddingTop = (ptop + 24) + 'px';
            }
        }
    }

    // 筛选按钮
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            setState({ filter: btn.dataset.filter });
        });
    });

    // 搜索输入（支持中文输入法组合）
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

    // 年份折叠/展开
    document.querySelectorAll('[data-toggle="year"]').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.dataset.target;
            const content = document.getElementById(targetId);
            const icon = document.getElementById(targetId + '-icon');
            if (!content || !icon) return;
            const isCollapsed = content.classList.contains('collapsed');
            const saved = loadCollapsed();
            if (isCollapsed) {
                content.classList.remove('collapsed');
                content.style.maxHeight = '9999px';
                icon.classList.remove('collapsed');
                saveCollapsed(saved.filter(id => id !== targetId));
            } else {
                content.classList.add('collapsed');
                content.style.maxHeight = '0px';
                icon.classList.add('collapsed');
                if (!saved.includes(targetId)) saved.push(targetId);
                saveCollapsed(saved);
            }
        });
    });

    // 季度折叠/展开
    document.querySelectorAll('[data-toggle="quarter"]').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.dataset.target;
            const content = document.getElementById(targetId);
            const icon = document.getElementById(targetId + '-icon');
            if (!content || !icon) return;
            const isCollapsed = content.classList.contains('collapsed');
            const saved = loadCollapsed();
            if (isCollapsed) {
                content.classList.remove('collapsed');
                content.style.maxHeight = '9999px';
                icon.classList.remove('collapsed');
                saveCollapsed(saved.filter(id => id !== targetId));
            } else {
                content.classList.add('collapsed');
                content.style.maxHeight = '0px';
                icon.classList.add('collapsed');
                if (!saved.includes(targetId)) saved.push(targetId);
                saveCollapsed(saved);
            }
        });
    });

    // 添加按钮
    const addBtn = document.getElementById('addAnimeBtn');
    const addFirstBtn = document.getElementById('addFirstAnime');
    if (addBtn) addBtn.addEventListener('click', () => setState({ currentPage: 'add' }));
    if (addFirstBtn) addFirstBtn.addEventListener('click', () => setState({ currentPage: 'add' }));

    // 设置按钮
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => setState({ currentPage: 'settings' }));

    // 番剧卡片点击 → 详情页
    document.querySelectorAll('.anime-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            setState({ currentPage: 'detail', currentAnimeId: id });
        });
    });

    // +1 按钮
    document.querySelectorAll('[data-plus]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.plus;
            const anime = getAnimeById(id);
            if (!anime) return;
            updateAnime(id, changeProgress(anime, 1));
        });
    });

    // ======== 导出功能 ========
    const exportFilterModal = document.getElementById('exportFilterModal');
    const exportFilterOverlay = document.getElementById('exportFilterOverlay');
    const exportFilterContent = document.getElementById('exportFilterContent');
    const exportFilterSelectAll = document.getElementById('exportFilterSelectAll');
    const exportFilterCancelBtn = document.getElementById('exportFilterCancelBtn');
    const exportFilterConfirmBtn = document.getElementById('exportFilterConfirmBtn');
    // 导出方式选择弹窗
    const exportChoiceModal = document.getElementById('exportChoiceModal');
    const exportChoiceOverlay = document.getElementById('exportChoiceOverlay');
    const exportChoiceText = document.getElementById('exportChoiceText');
    const exportChoiceFile = document.getElementById('exportChoiceFile');
    const exportChoiceCancelBtn = document.getElementById('exportChoiceCancelBtn');
    // 导出结果弹窗（纯文字）
    const exportResultModal = document.getElementById('exportResultModal');
    const exportResultOverlay = document.getElementById('exportResultOverlay');
    const exportResultTextarea = document.getElementById('exportResultTextarea');
    const exportResultCloseBtn = document.getElementById('exportResultCloseBtn');
    const exportResultCopyBtn = document.getElementById('exportResultCopyBtn');

    let pendingExportData = null; // 暂存筛选后的数据

    // 这些弹窗位于 #app 外，不会随页面重绘销毁，因此只绑定一次。
    if (!exportFilterModal?.dataset.eventsBound) {
        if (exportFilterModal) exportFilterModal.dataset.eventsBound = 'true';

    // 导出筛选弹窗事件（无条件绑定，元素始终在 HTML 中）
    if (exportFilterModal) {
        exportFilterOverlay.addEventListener('click', () => {
            exportFilterModal.style.display = 'none';
        });
        exportFilterCancelBtn.addEventListener('click', () => {
            exportFilterModal.style.display = 'none';
        });
        exportFilterSelectAll.addEventListener('click', () => {
            const cbs = exportFilterContent.querySelectorAll('input[type="checkbox"]');
            const allChecked = Array.from(cbs).every(cb => cb.checked);
            cbs.forEach(cb => { cb.checked = !allChecked; });
        });
        exportFilterConfirmBtn.addEventListener('click', async () => {
            exportFilterModal.style.display = 'none';
            const map = {};
            document.querySelectorAll('.export-check-row').forEach(row => {
                const cb = row.querySelector('input[type="checkbox"]');
                const year = row.dataset.year;
                if (!year) return;
                if (!map[year]) map[year] = { year: year, quarters: {} };
                const quarter = row.dataset.quarter;
                map[year].quarters[quarter || ''] = cb.checked;
            });
            pendingExportData = buildFilteredData(map);
            if (pendingExportData.length === 0) {
                showToast('未选择任何数据');
                return;
            }
            // 显示导出方式选择弹窗
            if (exportChoiceModal) exportChoiceModal.style.display = 'block';
        });
    }

    // ======== 导出方式选择弹窗 ========
    function closeExportChoice() {
        if (exportChoiceModal) exportChoiceModal.style.display = 'none';
        pendingExportData = null;
    }

    if (exportChoiceModal) {
        exportChoiceOverlay?.addEventListener('click', closeExportChoice);
        exportChoiceCancelBtn?.addEventListener('click', closeExportChoice);
        exportChoiceText?.addEventListener('click', () => {
            exportChoiceModal.style.display = 'none';
            const data = pendingExportData;
            pendingExportData = null;
            if (data) doExportText(data);
        });
        exportChoiceFile?.addEventListener('click', () => {
            exportChoiceModal.style.display = 'none';
            const data = pendingExportData;
            pendingExportData = null;
            if (data) doExportFile(data);
        });
    }

    // ======== 导出结果弹窗（纯文字） ========
    function closeExportResult() {
        if (exportResultModal) exportResultModal.style.display = 'none';
    }

    if (exportResultModal) {
        exportResultOverlay?.addEventListener('click', closeExportResult);
        exportResultCloseBtn?.addEventListener('click', closeExportResult);
        exportResultCopyBtn?.addEventListener('click', async () => {
            const text = exportResultTextarea?.value;
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                showToast('已复制到剪贴板');
            } catch {
                if (exportResultTextarea) {
                    exportResultTextarea.focus();
                    exportResultTextarea.select();
                    document.execCommand('copy');
                    showToast('已复制到剪贴板');
                }
            }
        });
    }

    // ======== 导入功能 ========
    const fileInput = document.getElementById('importFileInput');
    const pasteModal = document.getElementById('pasteModal');
    const pasteOverlay = document.getElementById('pasteOverlay');
    const pasteTextarea = document.getElementById('pasteTextarea');
    const pasteCancelBtn = document.getElementById('pasteCancelBtn');
    const pasteBackBtn = document.getElementById('pasteBackBtn');
    const pasteConfirmBtn = document.getElementById('pasteConfirmBtn');
    const importFileChoice = document.getElementById('importFileChoice');
    const importPasteChoice = document.getElementById('importPasteChoice');
    const importSelectView = document.getElementById('importSelectView');
    const importPasteView = document.getElementById('importPasteView');
    const importSelectActions = document.getElementById('importSelectActions');
    const pasteTitle = pasteModal?.querySelector('.paste-modal-title');

    function closePasteModal() {
        pasteModal.style.display = 'none';
        importSelectView.style.display = 'block';
        importPasteView.style.display = 'none';
        importSelectActions.style.display = 'block';
        pasteTextarea.value = '';
        if (pasteTitle) pasteTitle.textContent = '导入数据';
    }

    function showPasteView() {
        importSelectView.style.display = 'none';
        importPasteView.style.display = 'block';
        importSelectActions.style.display = 'none';
        if (pasteTitle) pasteTitle.textContent = '粘贴 JSON 数据';
        pasteTextarea.focus();
    }

    // 导入弹窗事件（无条件绑定，元素始终在 HTML 中）
    if (pasteModal) {
        pasteOverlay.addEventListener('click', closePasteModal);
        pasteCancelBtn.addEventListener('click', closePasteModal);

        importFileChoice.addEventListener('click', () => {
            pasteModal.style.display = 'none';
            fileInput.click();
        });

        importPasteChoice.addEventListener('click', showPasteView);
        pasteBackBtn.addEventListener('click', () => {
            importSelectView.style.display = 'block';
            importPasteView.style.display = 'none';
            importSelectActions.style.display = 'block';
            if (pasteTitle) pasteTitle.textContent = '导入数据';
            pasteTextarea.value = '';
        });

        pasteConfirmBtn.addEventListener('click', () => {
            const raw = pasteTextarea.value.trim();
            if (!raw) return;
            try {
                const imported = JSON.parse(raw);
                closePasteModal();
                doImportJson(imported);
            } catch (e) {
                alert('JSON 格式错误：' + e.message);
            }
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const imported = JSON.parse(reader.result);
                    doImportJson(imported);
                } catch (e) {
                    alert('文件解析失败：' + e.message);
                }
            };
            reader.readAsText(file);
            fileInput.value = '';
        });
    }

    }

    // 封面模式加载番剧封面
    if (state.settings.listStyle === 'cover') {
        setTimeout(() => loadListCovers(), 100);
    }
}

/** 构建导出筛选弹窗内容 */
function buildExportFilter() {
    const groups = buildGroups(state.animeList);
    const years = Object.keys(groups).sort((a, b) => {
        if (a === '未分类') return 1;
        if (b === '未分类') return -1;
        return parseInt(b) - parseInt(a);
    });
    let html = '';
    years.forEach(year => {
        html += `<div class="export-year-group">`;
        html += `<div class="export-year-title">${year}年</div>`;
        const quartersInYear = Object.keys(groups[year]).sort((a, b) => {
            return QUARTER_ORDER.indexOf(a) - QUARTER_ORDER.indexOf(b);
        });
        quartersInYear.forEach(quarter => {
            const count = groups[year][quarter].length;
            const label = quarter ? quarter + '季' : '未归类';
            html += `<label class="export-check-row export-quarter-row" data-year="${year}" data-quarter="${quarter || ''}">`;
            html += `<input type="checkbox" checked> ${label}（${count}部）</label>`;
        });
        html += `</div>`;
    });
    const exportFilterContent = document.getElementById('exportFilterContent');
    if (exportFilterContent) {
        exportFilterContent.innerHTML = html || '<div style="color:#9ca3af;text-align:center;padding:1rem;">暂无数据</div>';
    }
}

/** 构建年/季分组 */
function buildGroups(animeList) {
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
                        if (info.months.includes(month)) { baseQuarter = q; break; }
                    }
                    if (baseQuarter) {
                        const info = QUARTER_BOUNDARIES[baseQuarter];
                        const lastMonth = info.months[info.months.length - 1];
                        if (month === lastMonth && day >= info.lastWeekDay) {
                            quarter = info.next;
                            if (info.nextYearOffset > 0) year = String(parseInt(year) + info.nextYearOffset);
                        } else { quarter = baseQuarter; }
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
    return groups;
}

/** 根据 map 筛选数据 */
function buildFilteredData(map) {
    const selected = [];
    const groups = buildGroups(state.animeList);
    for (const [year, yearInfo] of Object.entries(map)) {
        if (!groups[year]) continue;
        for (const [quarter, checked] of Object.entries(yearInfo.quarters)) {
            if (checked && groups[year][quarter]) {
                for (const anime of groups[year][quarter]) {
                    selected.push(anime);
                }
            }
        }
    }
    return selected;
}

/** 导出为纯文字 — 在弹窗中展示 JSON */
function doExportText(selected) {
    const json = JSON.stringify(createBackup(selected), null, 2);
    const resultModal = document.getElementById('exportResultModal');
    const resultTextarea = document.getElementById('exportResultTextarea');
    if (resultModal && resultTextarea) {
        resultTextarea.value = json;
        resultTextarea.style.height = 'auto';
        resultTextarea.style.height = Math.min(resultTextarea.scrollHeight, window.innerHeight * 0.6) + 'px';
        resultModal.style.display = 'block';
    }
}

/** 导出为 JSON 文件 */
async function doExportFile(selected) {
    const json = JSON.stringify(createBackup(selected), null, 2);
    const filename = 'anime-tracker-backup.json';

    // 策略1: File System Access API (桌面浏览器)
    if (window.showSaveFilePicker) {
        const blob = new Blob([json], { type: 'application/json' });
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            showToast(`导出成功 — ${selected.length} 部番剧`);
        } catch (e) {
            if (e.name !== 'AbortError') showToast('导出失败');
        }
        return;
    }

    // 策略2: Capacitor Filesystem + Share (Android/iOS)
    if (Capacitor.isNativePlatform()) {
        try {
            showToast('正在准备 JSON 文件...');
            const result = await Filesystem.writeFile({
                path: filename,
                data: json,
                directory: Directory.Cache,
                encoding: Encoding.UTF8,
                recursive: true,
            });
            await Share.share({
                title: '追番记录备份',
                text: `${selected.length} 部番剧的 JSON 备份`,
                url: result.uri,
                dialogTitle: '导出追番数据',
            });
            showToast(`导出成功 — ${selected.length} 部番剧`);
            return;
        } catch (e) {
            console.error('[Export] FileSystem export failed:', e);
            showToast(`导出失败：${e?.message || '无法创建分享文件'}`);
            return;
        }
    }

    // 策略3: Blob 下载 (兜底)
    try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`导出成功 — ${selected.length} 部番剧`);
    } catch (e) {
        console.error('[Export] Blob download failed:', e);
        showToast('导出失败，请稍后重试');
    }
}

/** 执行导入合并（以番剧名称为合并键） */
function doImportJson(imported) {
    let parsed;
    try {
        parsed = readBackup(imported);
    } catch (error) {
        alert(error.message);
        return;
    }
    imported = parsed.records;
    const localCount = state.animeList.length;
    const cloudCount = imported.length;
    const merged = new Map();
    const mergeKey = item => item.bgmId
        ? `bgm:${item.bgmId}`
        : `title:${item.title.trim().toLocaleLowerCase('zh-CN')}`;
    state.animeList.forEach(item => merged.set(mergeKey(item), item));
    imported.forEach(item => {
        merged.set(mergeKey(item), item);
    });
    const result = Array.from(merged.values());
    const rejected = parsed.errors.length ? `\n忽略无效记录：${parsed.errors.length} 条` : '';
    const msg = `本地：${localCount} 条\n导入数据：${cloudCount} 条${rejected}\n合并后：${result.length} 条\n\n相同 Bangumi 条目或标准化名称将被新数据覆盖，确认导入？`;
    if (!confirm(msg)) return;
    if (replaceAnimeList(result)) setTimeout(() => showToast('导入成功'), 100);
}

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

    // ======== 单集记录编辑 ========
    document.querySelectorAll('.episode-item').forEach(item => {
        item.addEventListener('click', () => {
            const ep = parseInt(item.dataset.ep);
            showEpisodeEditor(anime, ep);
        });
    });
}

/** 加载 Bangumi 详情（异步渲染到 #bangumiDetail） */
async function loadBangumiDetailInto(bgmId) {
    const container = document.getElementById('bangumiDetail');
    if (!container) return;
    container.innerHTML = '<div class="bgm-loading">加载番剧详情...</div>';

    const [subject, characters, persons] = await Promise.all([
        getBangumiSubject(bgmId),
        getBangumiCharacters(bgmId),
        getBangumiPersons(bgmId),
    ]);

    if (!subject) {
        container.innerHTML = '';
        return;
    }

    const studio = extractAnimationStudio(persons, Array.isArray(subject.infobox) ? subject.infobox : []);

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
        ${studio ? `<div class="bgm-studio"><span class="info-label">动画制作</span><span>${escHtml(studio)}</span></div>` : ''}
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

/** 绑定表单页事件 */
export function attachFormEvents(anime) {
    const isEdit = !!anime;
    let formData = {
        status: anime?.status || 'watching',
        rating: anime?.rating || 0,
        type: anime?.type || 'chasing',
        bgmId: anime?.bgmId || ''
    };
    let selectedBgmId = anime?.bgmId || '';

    document.getElementById('backToList').addEventListener('click', () => {
        setState({ currentPage: 'list', currentAnimeId: null });
    });

    // ======== 集数滚轮 ========
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
        const val = scrollToVal != null ? scrollToVal : getCurrent();
        scrollToEpisode(val);
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

    // ======== 点击滚轮直接编辑 ========
    epWheel.addEventListener('click', () => {
        if (epWheel.querySelector('.wheel-edit-input')) return;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'form-input wheel-edit-input';
        input.value = getCurrent();
        input.min = 0;
        input.max = getTotal();
        input.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;text-align:center;font-size:1rem;font-weight:700;z-index:5;border:none;border-radius:0.375rem;background:rgba(233,69,96,0.1);';
        epWheel.style.position = 'relative';
        epWheel.appendChild(input);
        input.focus();
        input.select();
        const finishEdit = () => {
            if (!input.parentNode) return;
            const val = parseInt(input.value) || 0;
            const clamped = Math.max(0, Math.min(getTotal(), val));
            input.remove();
            setCurrent(clamped);
        };
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.remove(); }
        });
    });

    // ======== 类型切换 ========
    document.querySelectorAll('[data-form-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            formData.type = btn.dataset.formType;
            updateFormTypeUI(formData.type);
        });
    });

    // ======== 状态切换 ========
    document.querySelectorAll('[data-form-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            formData.status = btn.dataset.formStatus;
            updateFormStatusUI(formData.status);
        });
    });

    // ======== 评分切换 ========
    document.querySelectorAll('#formRating .rating-star').forEach(star => {
        star.addEventListener('click', () => {
            const rating = parseInt(star.dataset.rating);
            formData.rating = formData.rating === rating ? 0 : rating;
            updateFormRatingUI(formData.rating);
        });
    });

    // ======== 保存 ========
    document.getElementById('saveAnime').addEventListener('click', (e) => {
        e.preventDefault();

        const title = document.getElementById('formTitle').value.trim();
        if (!title) {
            alert('请输入番剧名称');
            return;
        }

        const duplicate = state.animeList.find(a => a.title === title && a.id !== anime?.id);
        if (duplicate) {
            alert(`番剧「${title}」已存在，不能重复添加`);
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

        const status = deriveStatus(currentEpisode, totalEpisodes, formData.status);

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
            startDate,
            bgmId: selectedBgmId || (anime?.bgmId || '')
        };

        if (isEdit) {
            updateAnime(anime.id, data, { render: false });
            setState({
                currentPage: 'list',
                currentAnimeId: null
            });
        } else {
            addAnime(data);
        }
    });

    // ======== Bangumi 搜索 ========
    const bgmResults = document.getElementById('bgmResults');
    const formTitle = document.getElementById('formTitle');
    if (bgmResults && formTitle) {
        let debounceTimer;
        let lastKeyword = '';
        let searchController;

        const doSearch = async (keyword) => {
            if (!keyword) {
                bgmResults.style.display = 'none';
                return;
            }
            if (keyword === lastKeyword) return;
            lastKeyword = keyword;
            searchController?.abort();
            searchController = new AbortController();

            bgmResults.style.display = 'block';
            bgmResults.innerHTML = '<div class="bgm-loading">搜索中...</div>';

            let subjects = [];
            try {
                subjects = await searchBangumi(keyword, { signal: searchController.signal });
            } catch (e) {
                if (e.name === 'AbortError') return;
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
                    <div class="bgm-result-item" data-bgm-id="${escHtml(item.id)}">
                        <div>
                            <span class="bgm-result-name">${escHtml(item.name)}</span>
                            ${cn ? `<span class="bgm-result-cn">${escHtml(cn)}</span>` : ''}
                        </div>
                        <span class="bgm-result-meta">${escHtml(date)}</span>
                    </div>
                `;
            }).join('');

            bgmResults.querySelectorAll('.bgm-result-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const id = item.dataset.bgmId;
                    selectedBgmId = id;
                    formData.bgmId = id;
                    item.innerHTML = '<div class="bgm-loading">加载详情...</div>';
                    try {
                        const detail = await getBangumiSubject(id);
                        if (!detail) throw new Error('No data');

                        document.getElementById('formTitle').value = detail.name_cn || detail.name;
                        const ftEl = document.getElementById('formTotal');
                        ftEl.value = detail.total_episodes || 12;
                        ftEl.dispatchEvent(new Event('input', { bubbles: true }));

                        if (detail.date) {
                            const isChasing = (formData.type || 'chasing') === 'chasing';
                            if (isChasing) {
                                const airDateInput = document.getElementById('formAirDate');
                                if (airDateInput) airDateInput.value = detail.date;
                                const wd = getWeekDayFromDate(detail.date);
                                const infoEl = document.getElementById('chasingWeekdayInfo');
                                if (infoEl && wd) {
                                    infoEl.style.display = 'block';
                                    infoEl.textContent = '📅 ' + WEEK_DAYS[wd] + '更新';
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

/** 绑定设置页事件 */
export function attachSettingsEvents() {
    // 返回按钮
    document.getElementById('backFromSettings').addEventListener('click', () => {
        setState({ currentPage: 'list' });
    });

    // 列表样式切换
    document.querySelectorAll('.toggle-btn[data-style]').forEach(btn => {
        btn.addEventListener('click', () => {
            const style = btn.dataset.style;
            if (style !== state.settings.listStyle) {
                updateSettings({ listStyle: style });
            }
        });
    });

    // 深色模式切换
    document.querySelectorAll('.toggle-btn[data-dark]').forEach(btn => {
        btn.addEventListener('click', () => {
            const isDark = btn.dataset.dark === 'true';
            if (isDark !== state.settings.darkMode) {
                updateSettings({ darkMode: isDark });
            }
        });
    });

    // API 接口选择切换
    document.querySelectorAll('.toggle-btn[data-api]').forEach(btn => {
        btn.addEventListener('click', () => {
            const endpoint = btn.dataset.api;
            if (endpoint !== state.settings.apiEndpoint) {
                updateSettings({ apiEndpoint: endpoint });
            }
        });
    });

    // 导出按钮
    const settingsExportBtn = document.getElementById('settingsExportBtn');
    const exportFilterModal = document.getElementById('exportFilterModal');
    if (settingsExportBtn && exportFilterModal) {
        settingsExportBtn.addEventListener('click', () => {
            buildExportFilter();
            exportFilterModal.style.display = 'block';
        });
    }

    // 导入按钮 — 触发文件选择
    const settingsImportBtn = document.getElementById('settingsImportBtn');
    const fileInput = document.getElementById('importFileInput');
    if (settingsImportBtn && fileInput) {
        settingsImportBtn.addEventListener('click', () => {
            // 先显示导入方式选择
            const pasteModal = document.getElementById('pasteModal');
            if (pasteModal) {
                document.getElementById('importSelectView').style.display = 'block';
                document.getElementById('importPasteView').style.display = 'none';
                document.getElementById('importSelectActions').style.display = 'block';
                pasteModal.style.display = 'block';
            }
        });
    }
}
