import { loadListCovers, render, showReminder } from './renderer.js';
import { DELETE_UNDO_MS, setRenderer, setState, state, undoDeletedAnime } from './store.js';
import { showToast } from './utils.js';
import { scheduleAutoSync } from './sync-service.js';
import { queueLibraryCache } from './library-cache.js';
import guideMarkdown from '../../docs/软件使用说明.md?raw';
import { closeUserGuide, initializeUserGuide } from './user-guide.js';

function safeRender() {
    try {
        render();
    } catch (error) {
        console.error('[App] 渲染失败', error);
        const app = document.getElementById('app');
        if (!app) return;
        app.innerHTML = `
            <main class="main-content" style="text-align:center;padding-top:4rem;">
                <h1 style="font-size:1.25rem;">页面加载失败</h1>
                <p style="color:#6b7280;">本地数据仍然安全，请重试或导出备份。</p>
                <button class="btn btn-primary" id="retryRender">重试</button>
            </main>`;
        document.getElementById('retryRender')?.addEventListener('click', () => {
            setState({ currentPage: 'list', currentAnimeId: null });
        });
    }
}

setRenderer(safeRender);
safeRender();
window.__animeTrackerReady?.();
initializeUserGuide(guideMarkdown);
queueLibraryCache();
window.addEventListener('anime-list-changed', () => queueLibraryCache());
window.addEventListener('online', () => queueLibraryCache({ retryFailed: true }));
const refreshLibraryImages = event => {
    if (state.currentPage === 'list' && state.settings.listStyle === 'cover') {
        void loadListCovers(event.detail?.id || '');
    }
};
window.addEventListener('library-metadata-updated', refreshLibraryImages);
window.addEventListener('library-cache-updated', refreshLibraryImages);

setTimeout(() => {
    try {
        showReminder();
    } catch (error) {
        console.error('[Reminder] 提醒计算失败', error);
    }
}, 600);
setTimeout(() => scheduleAutoSync(), 900);

window.addEventListener('storage-error', () => {
    showToast('数据保存失败，请立即导出备份');
});

window.addEventListener('backup-error', () => {
    showToast('自动备份保存失败，已停止覆盖。请先导出数据并释放本地空间。', { duration: 5000 });
});
window.addEventListener('anime-deleted', event => {
    const { token, title } = event.detail;
    showToast(`已删除《${title}》`, {
        duration: DELETE_UNDO_MS,
        actionLabel: '撤销',
        onAction: () => showToast(undoDeletedAnime(token) ? '已恢复番剧' : '撤销已过期或番剧已存在'),
    });
});

let lastUnexpectedErrorAt = 0;
function showUnexpectedError() {
    const now = Date.now();
    if (now - lastUnexpectedErrorAt < 2000) return;
    lastUnexpectedErrorAt = now;
    showToast('操作未完成，请检查网络后重试');
}

window.addEventListener('unhandledrejection', event => {
    console.error('[App] 未处理的异步错误', event.reason);
    if (event.reason?.name !== 'AbortError') showUnexpectedError();
});

window.addEventListener('error', event => {
    console.error('[App] 未处理的运行时错误', event.error || event.message);
    showUnexpectedError();
});

const capacitorApp = window.Capacitor?.Plugins?.App;
if (capacitorApp) {
    capacitorApp.addListener('backButton', () => {
        if (closeUserGuide()) return;
        if (state.currentPage !== 'list') {
            setState({ currentPage: 'list', currentAnimeId: null });
            return;
        }
        if (!window._exitTimer) {
            window._exitTimer = true;
            showToast('再按一次退出');
            setTimeout(() => { window._exitTimer = false; }, 2000);
        } else {
            capacitorApp.exitApp();
        }
    });
}
