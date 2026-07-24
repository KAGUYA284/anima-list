// ============================================================
// 渲染层 · 聚合入口与主分发器 - Anime Tracker
// ============================================================

import { getCurrentAnime, state } from '../store.js';
import { hydrateBangumiImages } from '../api.js';
import { attachDetailEvents, attachFormEvents, attachListEvents, attachSettingsEvents } from '../events/index.js';
import { renderListPage } from './list.js';
import { renderDetailPage } from './detail.js';
import { renderFormPage } from './form.js';
import { renderSettingsPage } from './settings.js';

// 保持对外公共 API：渲染层子模块的可复用导出集中于此再导出。
export { loadListCovers } from './list.js';
export { updateFormRatingUI, updateFormStatusUI, updateFormTypeUI } from './form.js';
export { showReminder } from './reminder.js';

/** 主渲染分发器：根据当前页面状态渲染对应视图 */
export function render() {
    // 应用深色模式
    if (state.settings.darkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }

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
            const anime = getCurrentAnime();
            if (!anime) {
                window.location.hash = '';
                app.innerHTML = renderListPage();
                attachListEvents();
                break;
            }
            app.innerHTML = renderFormPage(anime);
            attachFormEvents(anime);
            break;
        case 'settings':
            app.innerHTML = renderSettingsPage();
            attachSettingsEvents();
            break;
    }
    hydrateBangumiImages(app);
}
