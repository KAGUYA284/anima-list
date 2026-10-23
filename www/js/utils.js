// ============================================================
// 工具函数 - Anime Tracker
// ============================================================

/** HTML 转义，防止 XSS */
export function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]);
}

/** 生成唯一 ID */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/** 从日期字符串获取星期几（1=周一 ... 7=周日，空=空字符串） */
export function getWeekDayFromDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    return day === 0 ? 7 : day;
}

/** 渲染只读星级评分 1-5 */
export function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= rating;
        stars += `<span class="star ${filled ? 'filled' : 'empty'}">★</span>`;
    }
    return stars;
}

/** 渲染可编辑星级评分 1-5 */
export function renderEditableStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= rating;
        stars += `<span class="rating-star ${filled ? 'filled' : 'empty'}" data-rating="${i}">★</span>`;
    }
    return stars;
}

/** 显示 Toast 提示消息 */
export function showToast(msg, { duration = 2000, actionLabel = '', onAction } = {}) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    el.setAttribute('role', 'status');
    if (actionLabel && onAction) {
        const button = document.createElement('button');
        button.className = 'toast-action';
        button.type = 'button';
        button.textContent = actionLabel;
        button.addEventListener('click', () => { onAction(); el.remove(); });
        el.appendChild(button);
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
}

/** 只允许远程图片使用 HTTPS，阻止 javascript:、data: 等危险协议。 */
export function safeImageUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}
