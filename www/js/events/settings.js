// ============================================================
// 事件处理 · 设置页 - Anime Tracker
// ============================================================

import { setState, state, updateSettings } from '../store.js';
import { buildExportFilter } from './io.js';

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
