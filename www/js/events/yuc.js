import { getBangumiSubject, getCachedBangumiSubject, getYucSeasonList, searchBangumiForYuc } from '../api.js';
import { YUC_MIN_SEASON, yucSeasonFromDate, yucSeasonLabel } from '../yuc.js';
import { addAnime, setState, state, updateAnime } from '../store.js';
import { escHtml, showToast } from '../utils.js';
import { renderYucRecords } from '../renderer/yuc.js';
import { buildSeasonalAnime, findExistingSeasonalAnime, seasonalAnimeAssociation } from '../seasonal-import.js';

function existingAnimeWithTitles() {
    return state.animeList.map(anime => ({
        ...anime,
        titleJp: anime.titleJp || getCachedBangumiSubject(anime.bgmId)?.name || '',
    }));
}

function markAdded(button) {
    button.disabled = true;
    button.textContent = '已在待看列表';
    button.classList.remove('btn-primary');
    button.classList.add('btn-secondary');
}

function linkSeasonalAnime(anime, record, subject, season) {
    const association = seasonalAnimeAssociation(record, subject, season);
    if (!association.titleJp) association.titleJp = anime.titleJp || '';
    if (anime.yucKey !== association.yucKey || anime.titleJp !== association.titleJp) {
        updateAnime(anime.id, association, { render: false });
    }
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
    const isCurrentView = () => document.getElementById('yucSeasonList') === list && state.yucSeason === season;

    getYucSeasonList(season).then(records => {
        if (!isCurrentView()) return;
        if (records.length === 0) {
            status.textContent = season < YUC_MIN_SEASON
                ? '无数据：yuc.wiki 新番表从 2019 年 10 月开始收录'
                : `${yucSeasonLabel(season)}暂无数据`;
            list.innerHTML = '<p class="yuc-season-empty">无数据</p>';
            return;
        }
        const previewCount = records.filter(record => record.schedule?.isPreview).length;
        status.textContent = `${yucSeasonLabel(season)}共 ${records.length} 部番剧${previewCount ? `，其中 ${previewCount} 部具体更新时间待 yuc.wiki 更新` : ''}`;
        list.innerHTML = renderYucRecords(records, existingAnimeWithTitles(), season);
        const updateAddedButtons = () => {
            if (!isCurrentView()) return;
            const animeList = existingAnimeWithTitles();
            list.querySelectorAll('[data-yuc-add]').forEach(button => {
                if (findExistingSeasonalAnime(animeList, records[Number(button.dataset.yucAdd)], null, season)) {
                    markAdded(button);
                }
            });
        };
        list.querySelectorAll('[data-yuc-add]').forEach(button => {
            button.addEventListener('click', async () => {
                const record = records[Number(button.dataset.yucAdd)];
                if (!record) return;
                const title = record.titleCn || record.title || record.titleJp;
                const existing = findExistingSeasonalAnime(existingAnimeWithTitles(), record, null, season);
                if (!title || existing) {
                    if (existing) linkSeasonalAnime(existing, record, getCachedBangumiSubject(existing.bgmId), season);
                    updateAddedButtons();
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
                const duplicate = findExistingSeasonalAnime(state.animeList, record, bangumi, season);
                if (duplicate) {
                    linkSeasonalAnime(duplicate, record, bangumi, season);
                    updateAddedButtons();
                    showToast('这部番剧已经在待看列表');
                    return;
                }
                const added = addAnime(buildSeasonalAnime(record, bangumi, season), { navigate: false, render: false });
                if (added) {
                    updateAddedButtons();
                    showToast(`已从 Bangumi 导入待看：${bangumi.name_cn || bangumi.name || title}`);
                } else {
                    button.disabled = false;
                    button.textContent = '加入待看';
                }
            });
        });
        // 旧记录没有保存日文名时，补全本季度的 Bangumi 原名，修复不同译名的已添加标记。
        const start = new Date(Number(season.slice(0, 4)), Number(season.slice(4)) - 1, -14);
        const end = new Date(Number(season.slice(0, 4)), Number(season.slice(4)) + 2, 16);
        const candidates = state.animeList.filter(anime => {
            if (!anime.bgmId || anime.titleJp) return false;
            const airDate = anime.airDate ? new Date(`${anime.airDate}T00:00:00`) : null;
            return !airDate || (airDate >= start && airDate < end);
        });
        let next = 0;
        const completeTitles = async () => {
            while (next < candidates.length && isCurrentView()) {
                const anime = candidates[next++];
                try {
                    const subject = await getBangumiSubject(anime.bgmId);
                    const current = state.animeList.find(item => item.id === anime.id && item.bgmId === anime.bgmId);
                    if (!current || !subject?.name) continue;
                    const record = records.find(item => findExistingSeasonalAnime([{ ...current, titleJp: subject.name }], item, null, season));
                    if (record) linkSeasonalAnime(current, record, subject, season);
                    else if (!current.titleJp) updateAnime(current.id, { titleJp: subject.name }, { render: false });
                    updateAddedButtons();
                } catch (error) {
                    console.warn('[Yuc] 已添加番剧原名补全失败', error);
                }
            }
        };
        void Promise.all(Array.from({ length: Math.min(3, candidates.length) }, completeTitles));
    }).catch(error => {
        if (!isCurrentView()) return;
        status.innerHTML = `<span style="color:#f87171;">新番表加载失败：${escHtml(error.message)}</span>`;
        list.innerHTML = '<p class="yuc-season-empty">请检查网络连接，或稍后重试。</p>';
    });
}
