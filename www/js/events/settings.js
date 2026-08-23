// ============================================================
// 事件处理 · 设置页 - Anime Tracker
// ============================================================

import { clearAnimeList, setState, state, updateSettings } from '../store.js';
import { showToast } from '../utils.js';
import { buildExportFilter } from './io.js';
import {
    getSyncStatus, login, logout, normalizeSyncApiUrl, register, resolveConflict, syncNow,
} from '../sync-service.js';

/** 绑定设置页事件 */
export function attachSettingsEvents() {
    if (window.__animaSyncSettingsHandler) window.removeEventListener('sync-state-changed', window.__animaSyncSettingsHandler);
    window.__animaSyncSettingsHandler = event => {
        if (state.currentPage !== 'settings') return;
        if (event.detail?.phase === 'conflict') { setState({}); return; }
        const status = document.getElementById('syncStatusText');
        if (status) status.textContent = event.detail?.message || '';
    };
    window.addEventListener('sync-state-changed', window.__animaSyncSettingsHandler);

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

    document.querySelectorAll('.toggle-btn[data-list-order]').forEach(btn => {
        btn.addEventListener('click', () => {
            const listOrder = btn.dataset.listOrder === 'update' ? 'update' : 'time';
            if (listOrder !== state.settings.listOrder) updateSettings({ listOrder });
        });
    });
    document.getElementById('listOrderInfoBtn')?.addEventListener('click', event => {
        const help = document.getElementById('listOrderHelp');
        if (!help) return;
        help.hidden = !help.hidden;
        event.currentTarget.setAttribute('aria-expanded', String(!help.hidden));
    });

    document.querySelectorAll('.toggle-btn[data-anime-details]').forEach(btn => {
        btn.addEventListener('click', () => {
            const showAnimeDetails = btn.dataset.animeDetails === 'true';
            if (showAnimeDetails !== state.settings.showAnimeDetails) updateSettings({ showAnimeDetails });
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

    document.getElementById('clearAnimeListBtn')?.addEventListener('click', () => {
        if (!state.animeList.length) return;
        if (!confirm(`确定要清空全部 ${state.animeList.length} 部番剧吗？此操作不可撤销。`)) return;
        if (clearAnimeList()) showToast('已清空所有番剧');
    });

    const syncApiUrl = document.getElementById('syncApiUrl');
    const commitSyncApiUrl = () => {
        if (!syncApiUrl) return state.settings.syncApiUrl || '';
        const value = normalizeSyncApiUrl(syncApiUrl.value);
        if (value !== state.settings.syncApiUrl) updateSettings({ syncApiUrl: value }, { render: false });
        return value;
    };
    syncApiUrl?.addEventListener('change', () => {
        try {
            commitSyncApiUrl();
        } catch (error) {
            showToast(error.message);
            syncApiUrl.value = state.settings.syncApiUrl || '';
        }
    });

    const credentials = () => ({
        email: document.getElementById('syncEmail')?.value.trim() || '',
        password: document.getElementById('syncPassword')?.value || '',
    });
    document.getElementById('syncRegisterBtn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        const { email, password } = credentials();
        if (password.length < 12 || password.length > 128) { showToast('密码必须为 12–128 个字符'); return; }
        button.disabled = true;
        try { commitSyncApiUrl(); await register(email, password); showToast('注册成功，请使用该账号登录'); }
        catch (error) { showToast(error.message); }
        finally { if (document.contains(button)) button.disabled = false; }
    });
    document.getElementById('syncLoginBtn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        const { email, password } = credentials();
        button.disabled = true;
        try { commitSyncApiUrl(); await login(email, password); setState({}); setTimeout(() => syncNow().catch(() => {}), 0); }
        catch (error) { showToast(error.message); if (document.contains(button)) button.disabled = false; }
    });
    document.getElementById('syncLogoutBtn')?.addEventListener('click', async () => {
        await logout();
        setState({});
    });
    document.getElementById('syncNowBtn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try { await syncNow(); showToast('同步完成'); }
        catch (error) { if (error.name !== 'SyncConflictError') showToast(error.message); }
        finally { if (document.contains(button)) button.disabled = false; }
    });
    document.getElementById('syncUseRemoteBtn')?.addEventListener('click', async () => {
        if (!confirm('使用云端数据将替换当前设备的本地番剧列表，确定继续吗？')) return;
        try { await resolveConflict('remote'); showToast('已使用云端数据'); }
        catch (error) { showToast(error.message); }
    });
    document.getElementById('syncUseLocalBtn')?.addEventListener('click', async () => {
        if (!confirm('确定使用当前设备的数据覆盖最新云端快照吗？')) return;
        try { await resolveConflict('local'); showToast('已使用本地数据覆盖云端'); }
        catch (error) { showToast(error.message); }
    });
    document.getElementById('syncExportConflictBtn')?.addEventListener('click', () => {
        const conflict = getSyncStatus().conflict;
        if (!conflict) return;
        const textarea = document.getElementById('exportResultTextarea');
        const modal = document.getElementById('exportResultModal');
        if (textarea && modal) {
            textarea.value = JSON.stringify({ exportedAt: new Date().toISOString(), local: conflict.localSnapshot, remote: conflict.remote }, null, 2);
            modal.style.display = 'block';
            showToast('已生成双方 JSON；可复制后取消同步');
        }
    });
}
