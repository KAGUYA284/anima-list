// ============================================================
// 事件处理 · 表单页（添加/编辑） - Anime Tracker
// ============================================================

import { WEEK_DAYS } from '../constants.js';
import { deriveStatus } from '../core.js';
import { getBangumiSubject, getYucAnime, searchBangumi } from '../api.js';
import { addAnime, setState, state, updateAnime } from '../store.js';
import { escHtml, getWeekDayFromDate, showToast } from '../utils.js';
import { updateFormRatingUI, updateFormStatusUI, updateFormTypeUI } from '../renderer/form.js';

/** 绑定表单页事件 */
export function attachFormEvents(anime) {
    const isEdit = !!anime;
    let formData = {
        status: anime?.status || 'watching',
        rating: anime?.rating || 0,
        type: anime?.type || 'chasing',
        bgmId: anime?.bgmId || ''
    };
    let selectedBgmId = anime?.bgmId || '';

    const formAirDate = document.getElementById('formAirDate');
    const formUpdateWeekDay = document.getElementById('formUpdateWeekDay');
    const formUpdateTime = document.getElementById('formUpdateTime');
    const chasingWeekdayInfo = document.getElementById('chasingWeekdayInfo');

    function updateChasingWeekdayHint(source = 'manual') {
        if (!formUpdateWeekDay || !chasingWeekdayInfo) return;
        const weekday = Number(formUpdateWeekDay.value) || 0;
        const time = formUpdateTime?.value.trim() || '';
        const sourceLabel = source === 'yuc' ? '长门有希' : source === 'date' ? '已根据放送日期推断' : '当前设置';
        chasingWeekdayInfo.textContent = weekday
            ? `${sourceLabel}：${WEEK_DAYS[weekday]}${time ? ` ${time}` : ''}更新`
            : '选择实际的每周更新时间';
    }

    function syncChasingWeekdayFromDate(force = false) {
        if (!formAirDate || !formUpdateWeekDay) return;
        const weekday = getWeekDayFromDate(formAirDate.value);
        if (weekday && (force || !formUpdateWeekDay.value)) {
            formUpdateWeekDay.value = String(weekday);
            updateChasingWeekdayHint('date');
        } else {
            updateChasingWeekdayHint();
        }
    }

    formAirDate?.addEventListener('change', () => syncChasingWeekdayFromDate(true));
    formUpdateWeekDay?.addEventListener('change', () => updateChasingWeekdayHint('manual'));
    formUpdateTime?.addEventListener('input', () => updateChasingWeekdayHint('manual'));
    syncChasingWeekdayFromDate(false);

    document.getElementById('backToList').addEventListener('click', () => {
        setState({ currentPage: 'list', currentAnimeId: null });
    });

    // ======== 集数滚轮 ========
    const epItems = document.getElementById('epItems');
    const epMinus = document.getElementById('epMinus');
    const epPlus = document.getElementById('epPlus');
    const epWheel = document.getElementById('epWheel');
    const formCurrent = document.getElementById('formCurrent');
    const formTotal = document.getElementById('formTotal');

    function getTotal() {
        return Math.max(1, parseInt(formTotal.value) || 1);
    }

    function getCurrent() {
        return parseInt(formCurrent.value) || 0;
    }

    function setCurrent(val) {
        formCurrent.value = val;
        buildWheel(val);
    }

    function buildWheel(scrollToVal) {
        const total = getTotal();
        let html = '';
        for (let i = 0; i <= total; i++) {
            html += `<div class="episode-picker-item" data-ep="${i}">${i}</div>`;
        }
        epItems.innerHTML = html;
        const val = scrollToVal != null ? scrollToVal : getCurrent();
        scrollToEpisode(val);
    }

    function scrollToEpisode(val) {
        const item = epItems.querySelector(`[data-ep="${val}"]`);
        if (item) {
            const scrollTop = item.offsetTop - epItems.offsetTop - 3 * epItems.clientHeight / 9;
            epItems.scrollTop = Math.max(0, scrollTop);
        }
        updateActiveItem();
    }

    function updateActiveItem() {
        const items = epItems.querySelectorAll('.episode-picker-item');
        const center = epItems.scrollTop + epItems.clientHeight / 2;
        let best = null;
        let bestDist = Infinity;
        items.forEach(item => {
            const mid = item.offsetTop + item.offsetHeight / 2 - epItems.offsetTop;
            const dist = Math.abs(mid - center);
            if (dist < bestDist) { bestDist = dist; best = item; }
        });
        items.forEach(i => i.classList.remove('active'));
        if (best) {
            best.classList.add('active');
            formCurrent.value = best.dataset.ep;
        }
    }

    buildWheel(parseInt(formCurrent.value) || 0);

    let wheelTimeout;
    epItems.addEventListener('scroll', () => {
        clearTimeout(wheelTimeout);
        updateActiveItem();
        wheelTimeout = setTimeout(() => {
            const val = parseInt(formCurrent.value) || 0;
            scrollToEpisode(val);
        }, 200);
    }, { passive: true });

    epMinus.addEventListener('click', () => {
        setCurrent(Math.max(0, getCurrent() - 1));
    });

    epPlus.addEventListener('click', () => {
        const max = getTotal();
        setCurrent(Math.min(max, getCurrent() + 1));
    });

    formTotal.addEventListener('input', () => {
        formCurrent.value = Math.min(getTotal(), parseInt(formCurrent.value) || 0);
        buildWheel();
    });

    // ======== 点击滚轮直接编辑 ========
    epWheel.addEventListener('click', () => {
        if (epWheel.querySelector('.wheel-edit-input')) return;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'form-input wheel-edit-input';
        input.value = getCurrent();
        input.min = 0;
        input.max = getTotal();
        input.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;text-align:center;font-size:1rem;font-weight:700;z-index:5;border:none;border-radius:0.375rem;background:rgba(233,69,96,0.1);';
        epWheel.style.position = 'relative';
        epWheel.appendChild(input);
        input.focus();
        input.select();
        const finishEdit = () => {
            if (!input.parentNode) return;
            const val = parseInt(input.value) || 0;
            const clamped = Math.max(0, Math.min(getTotal(), val));
            input.remove();
            setCurrent(clamped);
        };
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.remove(); }
        });
    });

    // ======== 类型切换 ========
    document.querySelectorAll('[data-form-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            formData.type = btn.dataset.formType;
            updateFormTypeUI(formData.type);
        });
    });

    // ======== 状态切换 ========
    document.querySelectorAll('[data-form-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            formData.status = btn.dataset.formStatus;
            updateFormStatusUI(formData.status);
        });
    });

    // ======== 评分切换 ========
    document.querySelectorAll('#formRating .rating-star').forEach(star => {
        star.addEventListener('click', () => {
            const rating = parseInt(star.dataset.rating);
            formData.rating = formData.rating === rating ? 0 : rating;
            updateFormRatingUI(formData.rating);
        });
    });

    // ======== 保存 ========
    document.getElementById('saveAnime').addEventListener('click', (e) => {
        e.preventDefault();

        const title = document.getElementById('formTitle').value.trim();
        if (!title) {
            alert('请输入番剧名称');
            return;
        }

        const duplicate = state.animeList.find(a => a.title === title && a.id !== anime?.id);
        if (duplicate) {
            alert(`番剧「${title}」已存在，不能重复添加`);
            return;
        }

        const totalEpisodes = Math.max(1, parseInt(document.getElementById('formTotal').value) || 1);
        const currentEpisode = Math.min(totalEpisodes, Math.max(0, parseInt(document.getElementById('formCurrent').value) || 0));
        const review = document.getElementById('formReview').value;

        let airDate = '';
        let updateWeekDay = '';
        let updateTime = '';
        let completedDate = '';
        let startDate = '';

        if (formData.type === 'chasing') {
            airDate = document.getElementById('formAirDate')?.value || '';
            updateWeekDay = Number(document.getElementById('formUpdateWeekDay')?.value)
                || getWeekDayFromDate(airDate);
            updateTime = document.getElementById('formUpdateTime')?.value.trim() || '';
            if (updateTime && !/^(?:[01]\d|2\d):[0-5]\d$/.test(updateTime)) {
                alert('具体更新时间格式应为 HH:MM，可使用 24:00 至 29:59 表示日本深夜档');
                return;
            }
        } else {
            airDate = document.getElementById('formBingeAirDate')?.value || '';
            startDate = document.getElementById('formAirDateBinge')?.value || '';
            completedDate = document.getElementById('formCompletedDate')?.value || '';
        }

        const status = deriveStatus(currentEpisode, totalEpisodes, formData.status);

        const data = {
            title,
            totalEpisodes,
            currentEpisode,
            status,
            rating: formData.rating,
            review,
            airDate,
            type: formData.type,
            updateWeekDay,
            updateTime,
            completedDate,
            startDate,
            bgmId: selectedBgmId || (anime?.bgmId || '')
        };

        if (isEdit) {
            updateAnime(anime.id, data, { render: false });
            setState({
                currentPage: 'list',
                currentAnimeId: null
            });
        } else {
            addAnime(data);
        }
    });

    // ======== Bangumi 搜索 ========
    const bgmResults = document.getElementById('bgmResults');
    const formTitle = document.getElementById('formTitle');
    if (bgmResults && formTitle) {
        let debounceTimer;
        let lastKeyword = '';
        let searchController;

        const doSearch = async (keyword) => {
            if (!keyword) {
                bgmResults.style.display = 'none';
                return;
            }
            if (keyword === lastKeyword) return;
            lastKeyword = keyword;
            searchController?.abort();
            searchController = new AbortController();

            bgmResults.style.display = 'block';
            bgmResults.innerHTML = '<div class="bgm-loading">搜索中...</div>';

            let subjects = [];
            try {
                subjects = await searchBangumi(keyword, { signal: searchController.signal });
            } catch (e) {
                if (e.name === 'AbortError') return;
                bgmResults.innerHTML = '<div class="bgm-loading" style="color:#f87171;">搜索失败，请重试</div>';
                return;
            }

            if (subjects.length === 0) {
                bgmResults.innerHTML = '<div class="bgm-loading">未找到相关番剧</div>';
                return;
            }

            bgmResults.innerHTML = subjects.map(item => {
                const cn = item.name_cn && item.name_cn !== item.name ? item.name_cn : '';
                const date = item.date || '';
                return `
                    <div class="bgm-result-item" data-bgm-id="${escHtml(item.id)}">
                        <div>
                            <span class="bgm-result-name">${escHtml(item.name)}</span>
                            ${cn ? `<span class="bgm-result-cn">${escHtml(cn)}</span>` : ''}
                        </div>
                        <span class="bgm-result-meta">${escHtml(date)}</span>
                    </div>
                `;
            }).join('');

            bgmResults.querySelectorAll('.bgm-result-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const id = item.dataset.bgmId;
                    selectedBgmId = id;
                    formData.bgmId = id;
                    item.innerHTML = '<div class="bgm-loading">加载详情...</div>';
                    try {
                        const detail = await getBangumiSubject(id);
                        if (!detail) throw new Error('No data');

                        document.getElementById('formTitle').value = detail.name_cn || detail.name;
                        const ftEl = document.getElementById('formTotal');
                        ftEl.value = detail.total_episodes || 12;
                        ftEl.dispatchEvent(new Event('input', { bubbles: true }));

                        if (detail.date) {
                            const isChasing = (formData.type || 'chasing') === 'chasing';
                            if (isChasing) {
                                const airDateInput = document.getElementById('formAirDate');
                                if (airDateInput) airDateInput.value = detail.date;
                                syncChasingWeekdayFromDate(true);
                            } else {
                                const bingeAirDate = document.getElementById('formBingeAirDate');
                                if (bingeAirDate) bingeAirDate.value = detail.date;
                            }
                        }

                        let yucMatched = false;
                        if ((formData.type || 'chasing') === 'chasing' && state.settings.updateSource === 'yuc') {
                            try {
                                const yuc = await getYucAnime({
                                    title: detail.name_cn || detail.name,
                                    titleCn: detail.name_cn || '',
                                    titleJp: detail.name || '',
                                    airDate: detail.date || '',
                                });
                                if (yuc?.schedule) {
                                    const airDateInput = document.getElementById('formAirDate');
                                    if (airDateInput && yuc.schedule.airDate) airDateInput.value = yuc.schedule.airDate;
                                    if (formUpdateWeekDay && yuc.schedule.updateWeekDay) {
                                        formUpdateWeekDay.value = String(yuc.schedule.updateWeekDay);
                                    }
                                    if (formUpdateTime) formUpdateTime.value = yuc.schedule.updateTime || '';
                                    updateChasingWeekdayHint('yuc');
                                    yucMatched = true;
                                }
                            } catch (error) {
                                console.warn('[Yuc] 更新时间查询失败，保留 Bangumi 日期', error);
                            }
                        } else if (formUpdateTime) {
                            formUpdateTime.value = '';
                        }

                        bgmResults.style.display = 'none';
                        lastKeyword = detail.name_cn || detail.name || '';
                        showToast(yucMatched ? '已从长门有希填写播出日期和具体时间' : '已自动填写番剧信息');
                    } catch (e) {
                        item.innerHTML = '<div class="bgm-loading" style="color:#f87171;">加载失败</div>';
                    }
                });
            });
        };

        formTitle.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const keyword = formTitle.value.trim();
            if (keyword.length < 2) {
                bgmResults.style.display = 'none';
                return;
            }
            debounceTimer = setTimeout(() => doSearch(keyword), 500);
        });

        formTitle.addEventListener('focus', () => {
            const keyword = formTitle.value.trim();
            if (keyword.length >= 2 && lastKeyword !== keyword) {
                clearTimeout(debounceTimer);
                doSearch(keyword);
            }
        });

        formTitle.addEventListener('blur', () => {
            setTimeout(() => { bgmResults.style.display = 'none'; }, 200);
        });
    }
}
