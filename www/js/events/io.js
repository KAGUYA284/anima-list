// ============================================================
// 事件处理 · 导入导出（数据 IO） - Anime Tracker
// ============================================================

import { QUARTER_ORDER } from '../constants.js';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { createBackup, readBackup } from '../data.js';
import { replaceAnimeList, state } from '../store.js';
import { escHtml, showToast } from '../utils.js';
import { buildFilteredData, buildGroups, mergeImport } from '../grouping.js';
import { applyImportedEnrichment, enrichImportedAnimeList } from '../import-enrichment.js';

/** 构建导出筛选弹窗内容 */
export function buildExportFilter() {
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

/** 导出为纯文字 — 在弹窗中展示 JSON */
function doExportText(selected) {
    const json = JSON.stringify(createBackup(selected), null, 2);
    const resultModal = document.getElementById('exportResultModal');
    const resultTextarea = document.getElementById('exportResultTextarea');
    if (resultModal && resultTextarea) {
        resultTextarea.value = json;
        resultModal.style.display = 'block';
    }
}

/** 导出为 JSON 文件 */
async function doExportFile(selected) {
    const json = JSON.stringify(createBackup(selected), null, 2);
    const filename = 'anima-list-backup.json';

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
                title: 'Anima List 备份',
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
async function completeImportedMetadata(importedRecords) {
    const enriched = await enrichImportedAnimeList(importedRecords);
    const enrichedById = new Map(enriched.map(record => [record.id, record]));
    const latest = state.animeList.map(record => {
        const candidate = enrichedById.get(record.id);
        return candidate ? applyImportedEnrichment(record, candidate) : record;
    });
    if (replaceAnimeList(latest)) showToast('导入番剧信息补全完成并已保存');
}

function doImportJson(imported) {
    let parsed;
    try {
        parsed = readBackup(imported);
    } catch (error) {
        alert(error.message);
        return;
    }
    const preview = mergeImport(state.animeList, parsed.records, 'keep-local');
    const overlay = document.createElement('div');
    overlay.className = 'data-dialog-overlay';
    overlay.innerHTML = `
        <section class="data-dialog" role="dialog" aria-modal="true" aria-labelledby="importModeTitle">
            <h2 id="importModeTitle">选择导入方式</h2>
            <p>导入 ${parsed.records.length} 部，其中 ${preview.matchedCount} 条已存在，${preview.addedCount} 条为新增。${parsed.errors.length ? `忽略无效记录 ${parsed.errors.length} 条。` : ''}</p>
            <label class="import-mode-option"><input type="radio" name="importMode" value="only-new"><span><strong>仅添加新番</strong><small>已有番剧完全保留，只添加不存在的番剧。</small></span></label>
            <label class="import-mode-option"><input type="radio" name="importMode" value="keep-local" checked><span><strong>保留本地</strong><small>保留本地进度、评分和感想，仅补充空缺资料并添加新番。</small></span></label>
            <label class="import-mode-option"><input type="radio" name="importMode" value="use-import"><span><strong>使用导入记录</strong><small>已有番剧的进度、评分和感想使用导入内容。</small></span></label>
            <p class="settings-hint">导入前自动保存一份备份，最近保留 3 份。</p>
            <div class="data-dialog-preview">${parsed.records.slice(0, 8).map(record => `<span>${escHtml(record.title)} · ${record.currentEpisode}/${record.totalEpisodes} 集</span>`).join('')}${parsed.records.length > 8 ? `<span>另有 ${parsed.records.length - 8} 部</span>` : ''}</div>
            <div class="sync-actions"><button class="btn btn-secondary" data-import-cancel>取消</button><button class="btn btn-primary" data-import-apply>确认导入</button></div>
        </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-import-cancel]').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    overlay.querySelector('[data-import-apply]').addEventListener('click', () => {
        const mode = overlay.querySelector('input[name="importMode"]:checked')?.value || 'keep-local';
        const { merged, appliedRecords } = mergeImport(state.animeList, parsed.records, mode);
        if (!appliedRecords.length) { overlay.remove(); showToast('没有需要添加的番剧'); return; }
        if (!replaceAnimeList(merged, { backupReason: '导入 JSON 前' })) return;
        overlay.remove();
        setTimeout(() => showToast('导入成功，正在补全缺失信息...'), 100);
        completeImportedMetadata(appliedRecords).catch(error => {
            console.error('[Import] 补全任务失败', error);
            showToast('导入已保存，部分信息暂时无法补全');
        });
    });
}

/**
 * 绑定导入/导出相关弹窗事件。
 * 这些弹窗位于 #app 外，不会随页面重绘销毁，因此只绑定一次。
 */
export function attachIoModals() {
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
            pendingExportData = buildFilteredData(map, state.animeList);
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
}
