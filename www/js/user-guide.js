import { state, updateSettings } from './store.js';
import { renderUserGuideMarkdown } from './user-guide-markdown.js';

let guideContent;
let activeDialog = null;

function showDialog(html, onClose) {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const overlay = document.createElement('div');
    overlay.className = 'data-dialog-overlay user-guide-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'userGuideTitle');
    overlay.innerHTML = html;
    const close = () => {
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        document.body.style.overflow = previousOverflow;
        activeDialog = null;
        if (previousFocus?.isConnected) previousFocus.focus();
        onClose?.();
    };
    const onKeyDown = event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const controls = [...overlay.querySelectorAll('button, summary, [tabindex="0"]')]
            .filter(element => element.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    overlay.querySelector('[data-guide-close]').addEventListener('click', close);
    overlay.querySelectorAll('[data-guide-target]').forEach(button => {
        button.addEventListener('click', () => {
            overlay.querySelector(`#${button.dataset.guideTarget}`)?.scrollIntoView({ block: 'start' });
        });
    });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    activeDialog = { close };
    overlay.querySelector('[data-guide-close]').focus();
}

/** Android 返回键与屏幕上的关闭按钮共用相同流程。 */
export function closeUserGuide() {
    if (!activeDialog) return false;
    activeDialog.close();
    return true;
}

export function openUserGuide({ firstUse = false } = {}) {
    if (!guideContent || activeDialog) return;
    showDialog(`
        <section class="data-dialog user-guide-dialog">
            <header class="user-guide-header"><h2 id="userGuideTitle">Anima List 使用说明</h2><button class="btn btn-secondary" type="button" data-guide-close>关闭</button></header>
            <div class="user-guide-content">${guideContent.directory}<article>${guideContent.body}</article></div>
        </section>`, () => {
        if (!firstUse) return;
        updateSettings({ userGuideSeen: true }, { render: false });
        showDialog(`
            <section class="data-dialog user-guide-notice">
                <h2 id="userGuideTitle">以后在哪里查看？</h2>
                <p>后续可以在“设置”页面最下方的“使用说明”中随时查看。</p>
                <button class="btn btn-primary" type="button" data-guide-close>知道了</button>
            </section>`);
    });
}

/** 每台设备只在首次空列表启动时引导；已有记录的用户不自动弹出。 */
export function initializeUserGuide(markdown) {
    guideContent = renderUserGuideMarkdown(markdown);
    if (state.settings.userGuideSeen) return;
    if (state.animeList.length) {
        updateSettings({ userGuideSeen: true }, { render: false });
        return;
    }
    openUserGuide({ firstUse: true });
}
