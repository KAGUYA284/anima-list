import { render, showReminder } from './renderer.js';
import { setRenderer, setState, state } from './store.js';
import { showToast } from './utils.js';
import { scheduleAutoSync } from './sync-service.js';

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
