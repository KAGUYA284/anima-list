import { getYucSeasonList, shiftYucSeason, yucSeasonFromDate, yucSeasonLabel } from '../yuc.js';
import { addAnime, setState, state } from '../store.js';
import { escHtml, showToast } from '../utils.js';
import { renderYucRecords } from '../renderer/yuc.js';

function normalizeTitle(value) {
    return String(value || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '').toLocaleLowerCase('zh-CN');
}

function existingTitleSet() {
    return new Set(state.animeList.map(anime => normalizeTitle(anime.title)).filter(Boolean));
}

export function attachYucEvents() {
    const season = state.yucSeason || yucSeasonFromDate();
    if (!state.yucSeason) setState({ yucSeason: season }, { render: false });

    document.getElementById('backFromYuc')?.addEventListener('click', () => {
        setState({ currentPage: 'list', yucSeason: '' });
    });
    document.getElementById('yucPreviousSeason')?.addEventListener('click', () => {
        setState({ yucSeason: shiftYucSeason(season, -3) });
    });
    document.getElementById('yucNextSeason')?.addEventListener('click', () => {
        setState({ yucSeason: shiftYucSeason(season, 3) });
    });

    const status = document.getElementById('yucSeasonStatus');
    const list = document.getElementById('yucSeasonList');
    if (!status || !list) return;

    getYucSeasonList(season).then(records => {
        status.textContent = `${yucSeasonLabel(season)}共 ${records.length} 部番剧`;
        list.innerHTML = renderYucRecords(records, existingTitleSet());
        list.querySelectorAll('[data-yuc-add]').forEach(button => {
            button.addEventListener('click', () => {
                const record = records[Number(button.dataset.yucAdd)];
                if (!record) return;
                const title = record.titleCn || record.title || record.titleJp;
                if (!title || existingTitleSet().has(normalizeTitle(title))) {
                    showToast('这部番剧已经在待看列表');
                    return;
                }
                const schedule = record.schedule || {};
                const added = addAnime({
                    title,
                    totalEpisodes: 12,
                    currentEpisode: 0,
                    status: 'want',
                    type: 'chasing',
                    airDate: schedule.airDate || '',
                    updateWeekDay: schedule.updateWeekDay || '',
                    updateTime: schedule.updateTime || '',
                    updatePeriod: schedule.updatePeriod || '',
                });
                if (added) showToast(`已加入待看：${title}`);
            });
        });
    }).catch(error => {
        status.innerHTML = `<span style="color:#f87171;">新番表加载失败：${escHtml(error.message)}</span>`;
        list.innerHTML = '<p class="yuc-season-empty">请检查网络连接，或稍后重试。</p>';
    });
}
