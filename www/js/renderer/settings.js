// ============================================================
// 渲染层 · 设置页 - Anime Tracker
// ============================================================

import { APP_VERSION } from '../constants.js';
import { state } from '../store.js';

/** 渲染设置页 */
export function renderSettingsPage() {
    const currentStyle = state.settings.listStyle;
    const isDark = state.settings.darkMode;
    const apiEndpoint = state.settings.apiEndpoint;
    const showAnimeDetails = state.settings.showAnimeDetails;
    const listOrder = state.settings.listOrder;
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
                        <strong>更新次序：</strong>从今天开始按星期轮转；同一天依次为上午、下午、晚间、深夜，同一时段按具体更新时间由早到晚。<br>
                        <strong>时间次序：</strong>保持原有周一至周日的固定顺序。
                    </div>
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
