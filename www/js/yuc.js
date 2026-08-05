const PROXY_BASE_URL = 'https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com';
const SEASON_PATTERN = /^\d{4}(01|04|07|10)$/;
const yucCache = new Map();
const yucInFlight = new Map();

export const YUC_PERIODS = ['上午', '下午', '晚间', '深夜'];
export const YUC_MIN_SEASON = '201910';

export function yucSeasonFromDate(value, now = new Date()) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value || '');
    const year = match ? Number(match[1]) : now.getFullYear();
    const month = match ? Number(match[2]) : now.getMonth() + 1;
    const seasonMonth = month <= 3 ? 1 : month <= 6 ? 4 : month <= 9 ? 7 : 10;
    return `${year}${String(seasonMonth).padStart(2, '0')}`;
}

export function shiftYucSeason(season, offset) {
    if (!SEASON_PATTERN.test(season)) return yucSeasonFromDate('');
    const year = Number(season.slice(0, 4));
    const month = Number(season.slice(4));
    const date = new Date(year, month - 1 + Number(offset || 0), 1);
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function yucSeasonLabel(season) {
    const labels = { 1: '冬番', 4: '春番', 7: '夏番', 10: '秋番' };
    if (!SEASON_PATTERN.test(season)) return '新番表';
    return `${season.slice(0, 4)}年${labels[Number(season.slice(4))] || '新番'}`;
}

export function yucSeasonStartDate(season) {
    return SEASON_PATTERN.test(String(season || ''))
        ? `${String(season).slice(0, 4)}-${String(season).slice(4)}-01`
        : '';
}

export function hasYucSeasonData(value) {
    const season = SEASON_PATTERN.test(String(value || ''))
        ? String(value)
        : yucSeasonFromDate(value);
    return season >= YUC_MIN_SEASON;
}

export function updatePeriodFromTime(value) {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) return '';
    const hour = Number(match[1]) % 24;
    if (hour < 5) return '深夜';
    if (hour < 12) return '上午';
    if (hour < 18) return '下午';
    return '晚间';
}

export function updatePeriodFromBroadcast(value) {
    const text = String(value || '');
    if (/深夜|凌晨/.test(text)) return '深夜';
    if (/晚间|晚上/.test(text)) return '晚间';
    if (/下午/.test(text)) return '下午';
    if (/上午|早晨/.test(text)) return '上午';
    return '';
}

function cleanText(value) {
    return String(value || '').replace(/[\t\r\u00a0　]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function textOf(element) {
    return cleanText(element?.textContent || '');
}

function htmlLines(element) {
    if (!element) return [];
    const html = String(element.innerHTML || '').replace(/<br\s*\/?\s*>/gi, '\n');
    const holder = document.createElement('div');
    holder.innerHTML = html.replace(/<[^>]+>/g, ' ');
    return holder.textContent.split(/\n+/).map(cleanText).filter(Boolean);
}

function normalizeTitle(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLocaleLowerCase('zh-CN')
        .replace(/(?:第\s*[\d一二三四五六七八九十]+\s*[季期]|season\s*\d+|part\.?\s*\d+)/gi, '')
        .replace(/[\p{P}\p{S}\s]/gu, '');
}

function titleScore(left, right) {
    const a = normalizeTitle(left);
    const b = normalizeTitle(right);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return 82;
    if (a.length < 2 || b.length < 2) return 0;
    const grams = value => Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2));
    const leftGrams = grams(a);
    const rightGrams = grams(b);
    const remaining = [...rightGrams];
    let matches = 0;
    for (const gram of leftGrams) {
        const index = remaining.indexOf(gram);
        if (index >= 0) {
            matches += 1;
            remaining.splice(index, 1);
        }
    }
    return Math.round((2 * matches / (leftGrams.length + rightGrams.length)) * 70);
}

function fullYucDate(value, season) {
    const match = /(\d{1,2})\s*\/\s*(\d{1,2})/.exec(value || '');
    if (!match || !SEASON_PATTERN.test(season)) return '';
    let year = Number(season.slice(0, 4));
    const seasonMonth = Number(season.slice(4));
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (seasonMonth === 1 && month >= 10) year -= 1;
    if (seasonMonth === 10 && month <= 2) year += 1;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function weekDayFromDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 0;
    const day = new Date(`${value}T00:00:00`).getDay();
    return day === 0 ? 7 : day;
}

function imageOf(element) {
    const value = element?.getAttribute('data-src') || element?.getAttribute('src') || '';
    try {
        const url = new URL(value, 'https://yuc.wiki/');
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        url.protocol = 'https:';
        return url.href;
    } catch {
        return '';
    }
}

function parseStaff(element) {
    const wanted = new Map([
        ['原作', 'originalWork'],
        ['导演', 'director'],
        ['副导演', 'assistantDirector'],
        ['编剧', 'seriesComposition'],
        ['人物设计', 'characterDesign'],
        ['动画人设', 'animationCharacterDesign'],
        ['动画制作', 'animationStudio'],
        ['制作', 'animationStudio'],
    ]);
    const result = {};
    let currentKey = '';
    for (const line of htmlLines(element)) {
        const labeled = /^([^：:]{1,12})[：:]\s*(.*)$/.exec(line);
        if (labeled) {
            currentKey = wanted.get(labeled[1].trim()) || '';
            if (currentKey && labeled[2].trim()) result[currentKey] = labeled[2].trim();
        } else if (currentKey) {
            result[currentKey] = `${result[currentKey] || ''} ${line}`.trim();
        }
    }
    return result;
}

export function parseYucHtml(html, season) {
    if (typeof DOMParser === 'undefined') return [];
    const documentNode = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const schedules = [];
    let sectionWeekDay = 0;
    const weekDayLabels = new Map([
        ['周一', 1], ['周二', 2], ['周三', 3], ['周四', 4],
        ['周五', 5], ['周六', 6], ['周日', 7],
    ]);
    for (const node of documentNode.querySelectorAll('table.date_, .div_date')) {
        if (node.matches('table.date_')) {
            const label = textOf(node.querySelector('.date2'));
            sectionWeekDay = [...weekDayLabels].find(([name]) => label.includes(name))?.[1] || 0;
            continue;
        }
        const block = node;
        const root = block.parentElement;
        const dateText = textOf(block.querySelector('.imgep'));
        const updateTime = textOf(block.querySelector('.imgtext4, .imgtext5')).replace(/~.*$/, '').trim();
        const airDate = fullYucDate(dateText, season);
        const title = textOf(root?.querySelector('[class^="date_title"]'));
        schedules.push({
            title,
            imageUrl: imageOf(block.querySelector('img')),
            dateText,
            airDate,
            updateWeekDay: sectionWeekDay || weekDayFromDate(airDate),
            updateTime: /^(?:[01]?\d|2\d):[0-5]\d$/.test(updateTime) ? updateTime.padStart(5, '0') : '',
            updatePeriod: updatePeriodFromTime(updateTime),
            broadcast: '',
        });
    }

    const details = [...documentNode.querySelectorAll('table[width="500px"]')].map(table => ({
        titleCn: textOf(table.querySelector('[class^="title_cn_"]')),
        titleJp: textOf(table.querySelector('[class^="title_jp_"]')),
        broadcast: textOf(table.querySelector('[class^="broadcast_"]')),
        staff: parseStaff(table.querySelector('[class^="staff_"]')),
    }));

    return schedules.map(schedule => {
        const match = details.map(detail => ({
            detail,
            score: Math.max(titleScore(schedule.title, detail.titleCn), titleScore(schedule.title, detail.titleJp)),
        })).sort((left, right) => right.score - left.score)[0];
        const detail = match?.score >= 55 ? match.detail : null;
        const updatePeriod = updatePeriodFromBroadcast(detail?.broadcast) || schedule.updatePeriod;
        return {
            title: detail?.titleCn || schedule.title,
            titleCn: detail?.titleCn || schedule.title,
            titleJp: detail?.titleJp || '',
            imageUrl: schedule.imageUrl,
            broadcast: detail?.broadcast || '',
            staff: detail?.staff || {},
            schedule: { ...schedule, updatePeriod, broadcast: detail?.broadcast || '' },
        };
    }).filter(record => record.title || record.titleCn || record.titleJp);
}

async function fetchText(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Yuc 返回 ${response.status}`);
        const text = await response.text();
        if (text.length > 2 * 1024 * 1024) throw new Error('Yuc 页面过大');
        return text;
    } finally {
        clearTimeout(timer);
    }
}

async function fetchYucHtml(season) {
    const desktopFetcher = globalThis.animaListDesktop?.fetchYucPage;
    if (typeof desktopFetcher === 'function') {
        const result = await desktopFetcher(season);
        if (typeof result === 'string') return result;
        if (result?.html) return result.html;
        throw new Error('Electron 未返回 yuc 页面');
    }

    const protocol = globalThis.location?.protocol;
    const urls = protocol === 'http:'
        ? [`http://yuc.wiki/${season}/`, `https://yuc.wiki/${season}/`]
        : [`https://yuc.wiki/${season}/`, `http://yuc.wiki/${season}/`];
    let lastError;
    for (const url of urls) {
        try {
            return await fetchText(url);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Yuc 页面请求失败');
}

export async function getYucSeasonList(season, { useProxy = true } = {}) {
    if (!SEASON_PATTERN.test(season)) throw new Error('季度参数无效');
    if (!hasYucSeasonData(season)) return [];
    const cached = yucCache.get(season);
    if (cached?.expiresAt > Date.now()) return cached.records;
    if (yucInFlight.has(season)) return yucInFlight.get(season);

    const promise = (async () => {
        let lastError;
        try {
            const records = parseYucHtml(await fetchYucHtml(season), season);
            if (records.length === 0) throw new Error('Yuc 页面未解析到番剧');
            yucCache.set(season, { records, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
            return records;
        } catch (error) {
            lastError = error;
        }

        if (!useProxy) throw lastError || new Error('Yuc 页面请求失败');
        const response = await fetchText(`${PROXY_BASE_URL}/yuc/season?season=${season}`);
        const payload = JSON.parse(response);
        const records = Array.isArray(payload?.records) ? payload.records : [];
        if (records.length === 0) throw lastError || new Error('代理未返回番剧表');
        yucCache.set(season, { records, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
        return records;
    })().finally(() => yucInFlight.delete(season));
    yucInFlight.set(season, promise);
    return promise;
}

export function matchYucAnime(records, titles) {
    const requested = titles.map(value => String(value || '').trim()).filter(Boolean);
    let best = null;
    for (const record of records) {
        const score = Math.max(0, ...requested.flatMap(title => [
            titleScore(title, record.title),
            titleScore(title, record.titleCn),
            titleScore(title, record.titleJp),
            titleScore(title, record.schedule?.title),
        ]));
        if (!best || score > best.score) best = { score, record };
    }
    return best?.score >= 55 ? best.record : null;
}

export async function getYucAnimeDirect(options = {}) {
    const season = yucSeasonFromDate(options.airDate);
    if (!hasYucSeasonData(season)) return null;
    const records = await getYucSeasonList(season, { useProxy: false });
    return matchYucAnime(records, [options.title, options.titleCn, options.titleJp]);
}
