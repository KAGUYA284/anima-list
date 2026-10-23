// ============================================================
// 事件处理 · 列表页 - Anime Tracker
// ============================================================

import { changeProgress } from '../core.js';
import { isCardInteractiveTarget } from '../card-interaction.js';
import { getYucAnime } from '../api.js';
import { deleteAnime, getAnimeById, setState, state, updateAnime } from '../store.js';
import { loadCollapsed, saveCollapsed } from '../storage.js';
import { loadListCovers } from '../renderer/list.js';
import { render } from '../renderer/index.js';
import { attachIoModals } from './io.js';

let lastYucScheduleSync = 0;
let yucScheduleSyncPromise = null;

async function syncYucSchedules() {
    if (Date.now() - lastYucScheduleSync < 6 * 60 * 60 * 1000) return;
    if (yucScheduleSyncPromise) return yucScheduleSyncPromise;
    lastYucScheduleSync = Date.now();
    const candidates = state.animeList.filter(anime => anime.type === 'chasing' && anime.title);
    yucScheduleSyncPromise = Promise.allSettled(candidates.map(async anime => {
        const yuc = await getYucAnime({ title: anime.title, airDate: anime.airDate });
        const schedule = yuc?.schedule;
        if (!schedule) return false;
        const updates = {
            airDate: schedule.airDate || anime.airDate,
            updateWeekDay: schedule.updateWeekDay || anime.updateWeekDay,
            updateTime: schedule.updateTime || anime.updateTime,
            updatePeriod: schedule.updatePeriod || anime.updatePeriod,
        };
        return Object.entries(updates).some(([key, value]) => value !== anime[key])
            ? updateAnime(anime.id, updates, { render: false })
            : false;
    })).then(results => {
        yucScheduleSyncPromise = null;
        if (results.some(result => result.status === 'fulfilled' && result.value) && state.currentPage === 'list') render();
    }).catch(error => {
        yucScheduleSyncPromise = null;
        console.warn('[Yuc] 番剧放送信息同步失败', error);
    });
    return yucScheduleSyncPromise;
}

/** 绑定列表页事件 */
export function attachListEvents() {
    // 移动端检测
    if (window.Capacitor || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.body.classList.add('is-mobile');
    } else {
        document.body.classList.remove('is-mobile');
    }

    // Android 状态栏安全区域兜底（CSS env() 可能返回 0）
    if (/Android/i.test(navigator.userAgent)) {
        const header = document.querySelector('.header');
        if (header) {
            const ptop = parseFloat(getComputedStyle(header).paddingTop);
            // 如果 env(safe-area-inset-top) 为 0，补充最小安全间距
            if (ptop < 20) {
                header.style.paddingTop = (ptop + 24) + 'px';
            }
        }
    }

    // 筛选按钮
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            setState({ filter: btn.dataset.filter });
        });
    });

    // 搜索输入（支持中文输入法组合）
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let composing = false;
        const doSearch = (val) => {
            state.searchQuery = val;
            render();
            const si = document.getElementById('searchInput');
            if (si) {
                si.focus();
                si.setSelectionRange(val.length, val.length);
            }
        };
        searchInput.addEventListener('compositionstart', () => { composing = true; });
        searchInput.addEventListener('compositionend', (e) => {
            composing = false;
            doSearch(e.target.value);
        });
        searchInput.addEventListener('input', (e) => {
            if (!composing) {
                doSearch(e.target.value);
            }
        });
    }

    // 年份折叠/展开
    document.querySelectorAll('[data-toggle="year"]').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.dataset.target;
            const content = document.getElementById(targetId);
            const icon = document.getElementById(targetId + '-icon');
            if (!content || !icon) return;
            const isCollapsed = content.classList.contains('collapsed');
            const saved = loadCollapsed();
            if (isCollapsed) {
                content.classList.remove('collapsed');
                content.style.maxHeight = '9999px';
                icon.classList.remove('collapsed');
                saveCollapsed(saved.filter(id => id !== targetId));
            } else {
                content.classList.add('collapsed');
                content.style.maxHeight = '0px';
                icon.classList.add('collapsed');
                if (!saved.includes(targetId)) saved.push(targetId);
                saveCollapsed(saved);
            }
        });
    });

    // 季度折叠/展开
    document.querySelectorAll('[data-toggle="quarter"]').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.dataset.target;
            const content = document.getElementById(targetId);
            const icon = document.getElementById(targetId + '-icon');
            if (!content || !icon) return;
            const isCollapsed = content.classList.contains('collapsed');
            const saved = loadCollapsed();
            if (isCollapsed) {
                content.classList.remove('collapsed');
                content.style.maxHeight = '9999px';
                icon.classList.remove('collapsed');
                saveCollapsed(saved.filter(id => id !== targetId));
            } else {
                content.classList.add('collapsed');
                content.style.maxHeight = '0px';
                icon.classList.add('collapsed');
                if (!saved.includes(targetId)) saved.push(targetId);
                saveCollapsed(saved);
            }
        });
    });

    // 添加按钮
    const addBtn = document.getElementById('addAnimeBtn');
    const addFirstBtn = document.getElementById('addFirstAnime');
    if (addBtn) addBtn.addEventListener('click', () => setState({ currentPage: 'add' }));
    if (addFirstBtn) addFirstBtn.addEventListener('click', () => setState({ currentPage: 'add' }));

    // 设置按钮
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => setState({ currentPage: 'settings' }));
    const yucScheduleBtn = document.getElementById('yucScheduleBtn');
    if (yucScheduleBtn) yucScheduleBtn.addEventListener('click', () => setState({ currentPage: 'yucSchedule' }));

    attachSwipeActions();

    // 番剧卡片点击 → 详情页
    document.querySelectorAll('.anime-card').forEach(card => {
        card.addEventListener('click', event => {
            if (card.dataset.swipeMoved === 'true' || isCardInteractiveTarget(event.target)) return;
            const id = card.dataset.id;
            setState({ currentPage: 'detail', currentAnimeId: id });
        });
    });

    // +1 按钮
    document.querySelectorAll('[data-plus]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.plus;
            const anime = getAnimeById(id);
            if (!anime) return;
            updateAnime(id, changeProgress(anime, 1));
        });
    });

    // 导入/导出弹窗（位于 #app 外，仅绑定一次）
    attachIoModals();

    // 封面模式加载番剧封面
    if (state.settings.listStyle === 'cover') {
        setTimeout(() => loadListCovers(), 100);
    }
    setTimeout(() => syncYucSchedules(), 0);
}

function attachSwipeActions() {
    let openRow = null;
    document.querySelectorAll('.anime-swipe-row').forEach(row => {
        const card = row.querySelector('.anime-card');
        if (!card) return;
        let startX = 0;
        let startY = 0;
        let dragging = false;
        let moved = false;
        const close = () => {
            row.classList.remove('swipe-open');
            if (openRow === row) openRow = null;
        };
        card.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            if (isCardInteractiveTarget(event.target)) return;
            if (openRow && openRow !== row) openRow.classList.remove('swipe-open');
            startX = event.clientX;
            startY = event.clientY;
            dragging = true;
            moved = false;
            card.setPointerCapture?.(event.pointerId);
        });
        card.addEventListener('pointermove', event => {
            if (!dragging) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
            moved = true;
            card.style.transform = `translateX(${Math.max(-112, Math.min(0, dx))}px)`;
        });
        const finish = event => {
            if (!dragging) return;
            dragging = false;
            const dx = event.clientX - startX;
            card.style.transform = '';
            if (moved && dx < -44) {
                row.classList.add('swipe-open');
                openRow = row;
            } else if (moved || dx > 20) {
                close();
            }
            if (moved) {
                card.dataset.swipeMoved = 'true';
                setTimeout(() => { delete card.dataset.swipeMoved; }, 0);
            }
        };
        card.addEventListener('pointerup', finish);
        card.addEventListener('pointercancel', finish);
    });

    document.querySelectorAll('[data-card-edit]').forEach(button => {
        button.addEventListener('click', event => {
            event.stopPropagation();
            setState({ currentPage: 'edit', currentAnimeId: button.dataset.cardEdit });
        });
    });
    document.querySelectorAll('[data-card-delete]').forEach(button => {
        button.addEventListener('click', event => {
            event.stopPropagation();
            const anime = getAnimeById(button.dataset.cardDelete);
            if (anime && confirm(`确定要删除《${anime.title}》吗？删除后 15 秒内可以撤销。`)) deleteAnime(anime.id);
        });
    });
}
