import { getYucSeasonList, searchBangumiForYuc } from '../api.js';
import { YUC_MIN_SEASON, yucSeasonFromDate, yucSeasonLabel } from '../yuc.js';
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
    const yearFilter = document.getElementById('yucYearFilter');
    const quarterFilter = document.getElementById('yucQuarterFilter');
    const applySeasonFilter = () => {
        const year = Number(yearFilter?.value);
        const quarter = String(quarterFilter?.value || '01');
        if (!Number.isInteger(year) || year < 1000 || year > 9999 || !['01', '04', '07', '10'].includes(quarter)) return;
        setState({ yucSeason: `${year}${quarter}` });
    };
    yearFilter?.addEventListener('change', applySeasonFilter);
    quarterFilter?.addEventListener('change', applySeasonFilter);

    const status = document.getElementById('yucSeasonStatus');
    const list = document.getElementById('yucSeasonList');
    if (!status || !list) return;

    getYucSeasonList(season).then(records => {
        if (records.length === 0) {
            status.textContent = season < YUC_MIN_SEASON
                ? '无数据：yuc.wiki 新番表从 2019 年 10 月开始收录'
                : `${yucSeasonLabel(season)}暂无数据`;
            list.innerHTML = '<p class="yuc-season-empty">无数据</p>';
            return;
        }
        status.textContent = `${yucSeasonLabel(season)}共 ${records.length} 部番剧`;
        list.innerHTML = renderYucRecords(records, existingTitleSet());
        list.querySelectorAll('[data-yuc-add]').forEach(button => {
            button.addEventListener('click', async () => {
                const record = records[Number(button.dataset.yucAdd)];
                if (!record) return;
                const title = record.titleCn || record.title || record.titleJp;
                if (!title || existingTitleSet().has(normalizeTitle(title))) {
                    showToast('这部番剧已经在待看列表');
                    return;
                }
                button.disabled = true;
                button.textContent = '匹配 Bangumi...';
                const schedule = record.schedule || {};
                let bangumi = null;
                try {
                    bangumi = await searchBangumiForYuc(record);
                } catch (error) {
                    console.warn('[Yuc] Bangumi 代理匹配失败', error);
                }
                const added = addAnime({
                    title,
                    totalEpisodes: bangumi?.total_episodes || 12,
                    currentEpisode: 0,
                    status: 'want',
                    type: 'chasing',
                    airDate: schedule.airDate || '',
                    updateWeekDay: schedule.updateWeekDay || '',
                    updateTime: schedule.updateTime || '',
                    updatePeriod: schedule.updatePeriod || '',
                    bgmId: bangumi?.id ? String(bangumi.id) : '',
                }, { navigate: false });
                if (added) {
                    showToast(bangumi
                        ? `已加入待看并匹配 Bangumi：${title}`
                        : `已加入待看：${title}（未匹配到 Bangumi 信息）`);
                } else {
                    button.disabled = false;
                    button.textContent = '加入待看';
                }
            });
        });
    }).catch(error => {
        status.innerHTML = `<span style="color:#f87171;">新番表加载失败：${escHtml(error.message)}</span>`;
        list.innerHTML = '<p class="yuc-season-empty">请检查网络连接，或稍后重试。</p>';
    });
}
