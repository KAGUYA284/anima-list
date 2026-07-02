// ============================================================
// 应用入口 - Anime Tracker
// ============================================================

// ======== 首次渲染 ========
render();

// ======== 启动画面淡出 ========
const splash = document.getElementById('splashScreen');
if (splash) {
    setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => { splash.remove(); }, 400);
    }, 800);
}

// ======== 追番提醒弹窗 ========
setTimeout(showReminder, 600);

// ======== Android 物理返回键处理 ========
if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
    Capacitor.Plugins.App.addListener('backButton', () => {
        if (state.currentPage === 'detail') {
            setState({ currentPage: 'list', currentAnime: null });
        } else if (state.currentPage === 'add' || state.currentPage === 'edit' || state.currentPage === 'settings') {
            setState({ currentPage: 'list', currentAnime: null });
        } else {
            if (!window._exitTimer) {
                window._exitTimer = true;
                showToast('再按一次退出');
                setTimeout(() => { window._exitTimer = false; }, 2000);
            } else {
                Capacitor.Plugins.App.exitApp();
            }
        }
    });
}
