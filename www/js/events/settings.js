// ============================================================
// 事件处理 · 设置页 - Anime Tracker
// ============================================================

import { clearAnimeList, replaceAnimeList, setState, state, updateSettings } from '../store.js';
import { SYNC_PASSWORD_MAX_LENGTH, SYNC_PASSWORD_MIN_LENGTH } from '../constants.js';
import { showToast } from '../utils.js';
import { buildExportFilter } from './io.js';
import { shouldRenderSyncConflictPanel } from '../sync-core.js';
import { applyRefreshedMetadata, refreshAnimeMetadataList } from '../metadata-refresh.js';
import {
    getSyncStatus, login, logout, register, resolveConflict, syncNow,
} from '../sync-service.js';

/** 绑定设置页事件 */
export function attachSettingsEvents() {
    if (window.__animaSyncSettingsHandler) window.removeEventListener('sync-state-changed', window.__animaSyncSettingsHandler);
    window.__animaSyncSettingsHandler = event => {
        if (state.currentPage !== 'settings') return;
        const phase = event.detail?.phase || 'idle';
        if (phase === 'protected' || shouldRenderSyncConflictPanel(phase, document.getElementById('syncConflictPanel'))) {
            setState({});
            return;
        }
        const status = document.getElementById('syncStatusText');
        if (status) {
            status.textContent = event.detail?.message || '';
            status.className = `sync-status sync-status-${phase}`;
        }
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

    document.getElementById('refreshAnimeMetadataBtn')?.addEventListener('click', async event => {
        if (!state.animeList.length) return;
        const button = event.currentTarget;
        const initial = [...state.animeList];
        button.disabled = true;
        button.textContent = `更新中 0/${initial.length}`;
        try {
            const result = await refreshAnimeMetadataList(initial, {
                onProgress: (completed, total) => {
                    if (document.contains(button)) button.textContent = `更新中 ${completed}/${total}`;
                },
            });
            const refreshedById = new Map(result.records.map(record => [record.id, record]));
            const latest = state.animeList.map(record => applyRefreshedMetadata(record, refreshedById.get(record.id)));
            if (!replaceAnimeList(latest)) throw new Error('更新结果无法保存到本地');
            const failure = result.failedCount ? `，${result.failedCount} 部更新失败` : '';
            setTimeout(() => showToast(`番剧信息更新完成：${result.updatedCount} 部有变化${failure}`), 0);
        } catch (error) {
            showToast(error.message || '番剧信息更新失败');
            if (document.contains(button)) {
                button.disabled = false;
                button.textContent = '更新全部';
            }
        }
    });

    document.getElementById('clearAnimeListBtn')?.addEventListener('click', () => {
        if (!state.animeList.length) return;
        if (!confirm(`确定要清空全部 ${state.animeList.length} 部番剧吗？此操作不可撤销。`)) return;
        if (clearAnimeList()) showToast('已清空所有番剧');
    });

    const credentials = () => ({
        email: document.getElementById('syncEmail')?.value.trim() || '',
        password: document.getElementById('syncPassword')?.value || '',
    });
    document.getElementById('syncRegisterBtn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        const { email, password } = credentials();
        if (password.length < SYNC_PASSWORD_MIN_LENGTH || password.length > SYNC_PASSWORD_MAX_LENGTH) {
            showToast(`密码必须为 ${SYNC_PASSWORD_MIN_LENGTH}–${SYNC_PASSWORD_MAX_LENGTH} 个字符`);
            return;
        }
        button.disabled = true;
        try { await register(email, password); showToast('注册成功，请使用该账号登录'); }
        catch (error) { showToast(error.message); }
        finally { if (document.contains(button)) button.disabled = false; }
    });
    document.getElementById('syncLoginBtn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        const { email, password } = credentials();
        button.disabled = true;
        try { await login(email, password); setState({}); setTimeout(() => syncNow().catch(() => {}), 0); }
        catch (error) { showToast(error.message); if (document.contains(button)) button.disabled = false; }
    });
    document.getElementById('syncLogoutBtn')?.addEventListener('click', async () => {
        await logout();
        setState({});
    });
    document.getElementById('syncNowBtn')?.addEventListener('click', async event => {
        if (!state.animeList.length) { showToast('本地番剧列表为空，暂不可同步'); return; }
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const result = await syncNow();
            showToast(result?.action === 'blocked-empty-remote' ? '云端数据为空，不可同步' : '同步完成');
        }
        catch (error) { if (error.name !== 'SyncConflictError') showToast(error.message); }
        finally { if (document.contains(button)) button.disabled = false; }
    });
    document.getElementById('syncUseRemoteBtn')?.addEventListener('click', async () => {
        if (!confirm('使用云端数据将替换当前设备的本地番剧列表，确定继续吗？')) return;
        try { await resolveConflict('remote'); showToast('已使用云端数据'); }
        catch (error) { showToast(error.message); }
    });
    document.getElementById('syncUseLocalBtn')?.addEventListener('click', async () => {
        if (!state.animeList.length) { showToast('本地番剧列表为空，不能覆盖云端数据'); return; }
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
