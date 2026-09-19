// ============================================================
// 渲染层 · 设置页 - Anime Tracker
// ============================================================

import { APP_VERSION, SYNC_PASSWORD_MAX_LENGTH, SYNC_PASSWORD_MIN_LENGTH } from '../constants.js';
import { state } from '../store.js';
import { getStoredUser, getSyncStatus } from '../sync-service.js';
import { escHtml } from '../utils.js';

function formatSyncTime(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '暂无记录';
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '暂无记录' : date.toLocaleString('zh-CN', { hour12: false });
}

/** 渲染设置页 */
export function renderSettingsPage() {
    const currentStyle = state.settings.listStyle;
    const isDark = state.settings.darkMode;
    const apiEndpoint = state.settings.apiEndpoint;
    const showAnimeDetails = state.settings.showAnimeDetails;
    const listOrder = state.settings.listOrder;
    const syncUser = getStoredUser();
    const syncStatus = getSyncStatus();
    const localSyncUnavailable = state.animeList.length === 0;
    const remoteSyncUnavailable = syncStatus.protection === 'remote';
    const syncUnavailable = localSyncUnavailable || remoteSyncUnavailable;
    const syncUnavailableMessage = remoteSyncUnavailable ? '云端数据为空，不可同步' : '本地番剧列表为空，暂不可同步';
    const remoteSyncTime = formatSyncTime(syncStatus.conflict?.remote?.serverUpdatedAt);
    return `
        <header class="header">
            <div class="header-content">
                <button class="btn btn-secondary" id="backFromSettings">
                    ← 返回
                </button>
                <span class="header-title" style="font-size:1.125rem;">设置</span>
                <div style="width:2.5rem;"></div>
            </div>
        </header>

        <div class="settings-page">
            <div class="settings-section">
                <h2 class="settings-section-title">列表显示</h2>
                <div class="settings-row">
                    <span class="settings-label">列表样式</span>
                    <div class="settings-toggle">
                        <button class="toggle-btn ${currentStyle === 'text' ? 'active' : ''}" data-style="text">
                            仅文字
                        </button>
                        <button class="toggle-btn ${currentStyle === 'cover' ? 'active' : ''}" data-style="cover">
                            封面模式
                        </button>
                    </div>
                </div>
            </div>

            <div class="settings-section">
                <h2 class="settings-section-title">外观</h2>
                <div class="settings-row">
                    <span class="settings-label">深色模式</span>
                    <div class="settings-toggle">
                        <button class="toggle-btn ${!isDark ? 'active' : ''}" data-dark="false">
                            浅色
                        </button>
                        <button class="toggle-btn ${isDark ? 'active' : ''}" data-dark="true">
                            深色
                        </button>
                    </div>
                </div>
            </div>

            <div class="settings-section">
                <h2 class="settings-section-title">API 接口</h2>
                <div class="settings-row">
                    <span class="settings-label">Bangumi 访问方式</span>
                    <div class="settings-toggle">
                        <button class="toggle-btn ${apiEndpoint === 'direct' ? 'active' : ''}" data-api="direct">
                            直连
                        </button>
                        <button class="toggle-btn ${apiEndpoint === 'proxy1' ? 'active' : ''}" data-api="proxy1">
                            代理
                        </button>
                    </div>
                </div>
            </div>

            <div class="settings-section">
                <h2 class="settings-section-title">番剧信息</h2>
                <div class="settings-row">
                    <span class="settings-label">显示番剧具体信息</span>
                    <div class="settings-toggle">
                        <button class="toggle-btn ${showAnimeDetails ? 'active' : ''}" data-anime-details="true">
                            开启
                        </button>
                        <button class="toggle-btn ${!showAnimeDetails ? 'active' : ''}" data-anime-details="false">
                            关闭
                        </button>
                    </div>
                </div>
                <div class="settings-row settings-row-wrap">
                    <span class="settings-label settings-label-with-help">
                        展示次序
                        <button class="settings-info-button" id="listOrderInfoBtn" type="button" aria-expanded="false" aria-controls="listOrderHelp" title="查看排序方法">i</button>
                    </span>
                    <div class="settings-toggle">
                        <button class="toggle-btn ${listOrder === 'update' ? 'active' : ''}" data-list-order="update">更新次序</button>
                        <button class="toggle-btn ${listOrder !== 'update' ? 'active' : ''}" data-list-order="time">时间次序</button>
                    </div>
                    <div class="settings-order-help" id="listOrderHelp" hidden>
                        <strong>更新次序：</strong>从昨天开始按最近更新日倒序（例如周三依次显示周二、周一、周日）；同一天优先显示较晚的时段和更新时间。<br>
                        <strong>时间次序：</strong>保持原有周一至周日的固定顺序。
                    </div>
                </div>
            </div>

            <div class="settings-section">
                <h2 class="settings-section-title">云同步</h2>
                <div class="sync-settings-stack">
                    ${syncUser ? `
                        <div class="settings-row">
                            <span class="settings-label">当前账号</span>
                            <span class="sync-account-email">${escHtml(syncUser.email || '已登录账号')}</span>
                        </div>
                        <div class="sync-status sync-status-${escHtml(syncStatus.phase)}" id="syncStatusText">${escHtml(syncStatus.message)}</div>
                        <div class="sync-actions">
                            <button class="btn btn-primary" id="syncNowBtn" ${syncUnavailable ? `disabled title="${syncUnavailableMessage}"` : ''}>立即同步</button>
                            <button class="btn btn-secondary" id="syncLogoutBtn">退出登录</button>
                        </div>
                        ${syncUnavailable ? `<div class="sync-status sync-status-protected">${syncUnavailableMessage}</div>` : ''}
                    ` : `
                        <label class="sync-field"><span class="settings-label">邮箱</span><input class="form-input" id="syncEmail" type="email" autocomplete="username" maxlength="254"></label>
                        <label class="sync-field"><span class="settings-label">密码</span><input class="form-input" id="syncPassword" type="password" autocomplete="current-password" minlength="${SYNC_PASSWORD_MIN_LENGTH}" maxlength="${SYNC_PASSWORD_MAX_LENGTH}" placeholder="${SYNC_PASSWORD_MIN_LENGTH}–${SYNC_PASSWORD_MAX_LENGTH} 个字符"></label>
                        <div class="sync-actions">
                            <button class="btn btn-primary" id="syncLoginBtn">登录</button>
                            <button class="btn btn-secondary" id="syncRegisterBtn">注册</button>
                        </div>
                        <div class="sync-status" id="syncStatusText">Token 仅保存在当前设备的安全凭据存储中</div>
                    `}
                    ${syncStatus.phase === 'conflict' ? `
                        <div class="sync-conflict-panel" id="syncConflictPanel">
                            <strong>检测到多设备修改冲突</strong>
                            <p>系统不会静默覆盖。请选择保留云端、本地覆盖云端，或先导出双方 JSON。</p>
                            <p class="sync-conflict-time">云端上次同步时间：${escHtml(remoteSyncTime)}</p>
                            <div class="sync-actions">
                                <button class="btn btn-secondary" id="syncUseRemoteBtn">使用云端</button>
                                <button class="btn btn-secondary" id="syncUseLocalBtn" ${syncUnavailable ? `disabled title="${syncUnavailableMessage}"` : ''}>使用本地</button>
                                <button class="btn btn-secondary" id="syncExportConflictBtn">导出双方 JSON</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>

            <div class="settings-section">
                <h2 class="settings-section-title">数据管理</h2>
                <div class="settings-row">
                    <span class="settings-label">导出数据</span>
                    <button class="btn btn-secondary" id="settingsExportBtn">选择导出</button>
                </div>
                <div class="settings-row">
                    <span class="settings-label">导入数据</span>
                    <button class="btn btn-secondary" id="settingsImportBtn">选择导入</button>
                </div>
                <div class="settings-row">
                    <span class="settings-label">更新番剧信息</span>
                    <button class="btn btn-secondary" id="refreshAnimeMetadataBtn" ${state.animeList.length ? '' : 'disabled'}>更新全部</button>
                </div>
                <div class="settings-row">
                    <span class="settings-label">清空所有番剧</span>
                    <button class="btn btn-danger-outline" id="clearAnimeListBtn" ${state.animeList.length ? '' : 'disabled'}>清空全部</button>
                </div>
            </div>

            <div class="settings-section">
                <h2 class="settings-section-title">关于</h2>
                <div class="settings-row">
                    <span class="settings-label">版本</span>
                    <span style="color:#9ca3af;font-size:0.875rem;">${APP_VERSION}</span>
                </div>
            </div>
        </div>
    `;
}
