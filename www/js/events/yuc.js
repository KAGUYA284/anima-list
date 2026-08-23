import { getBangumiSubject, getYucSeasonList, searchBangumiForYuc } from '../api.js';
import { YUC_MIN_SEASON, yucSeasonFromDate, yucSeasonLabel } from '../yuc.js';
import { addAnime, setState, state } from '../store.js';
import { escHtml, showToast } from '../utils.js';
import { renderYucRecords } from '../renderer/yuc.js';
import { buildSeasonalAnime, findExistingSeasonalAnime, normalizeSeasonalTitle } from '../seasonal-import.js';

function existingTitleSet() {
    return new Set(state.animeList.map(anime => normalizeSeasonalTitle(anime.title)).filter(Boolean));
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
                if (!title || findExistingSeasonalAnime(state.animeList, record)) {
                    showToast('这部番剧已经在待看列表');
                    return;
                }
                button.disabled = true;
                button.textContent = '匹配 Bangumi...';
                let bangumi = null;
                try {
                    bangumi = await searchBangumiForYuc(record);
                    if (bangumi?.id) {
                        bangumi = await getBangumiSubject(bangumi.id) || bangumi;
                    }
                } catch (error) {
                    console.warn('[Yuc] Bangumi 代理匹配失败', error);
                }
                if (!bangumi?.id) {
                    button.disabled = false;
                    button.textContent = '加入待看';
                    showToast('未匹配到 Bangumi 条目，暂未加入');
                    return;
                }
                if (findExistingSeasonalAnime(state.animeList, record, bangumi)) {
                    button.disabled = true;
                    button.textContent = '已在待看列表';
                    showToast('这部番剧已经在待看列表');
                    return;
                }
                const added = addAnime(buildSeasonalAnime(record, bangumi, season), { navigate: false });
                if (added) {
                    showToast(`已从 Bangumi 导入待看：${bangumi.name_cn || bangumi.name || title}`);
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
