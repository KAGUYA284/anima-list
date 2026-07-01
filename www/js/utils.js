// ============================================================
// 工具函数 - Anime Tracker
// ============================================================

/** HTML 转义，防止 XSS */
function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

/** 生成唯一 ID */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/** 从日期字符串获取星期几（1=周一 ... 7=周日，空=空字符串） */
function getWeekDayFromDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    return day === 0 ? 7 : day;
}

/** 渲染只读星级评分 1-5 */
function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= rating;
        stars += `<span class="star ${filled ? 'filled' : 'empty'}">★</span>`;
    }
    return stars;
}

/** 渲染可编辑星级评分 1-5 */
function renderEditableStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= rating;
        stars += `<span class="rating-star ${filled ? 'filled' : 'empty'}" data-rating="${i}">★</span>`;
    }
    return stars;
}

/** 显示 Toast 提示消息 */
function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}
