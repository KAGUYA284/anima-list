/** Tencent Cloud SCF proxy for the small Bangumi API surface used by the app. */
const https = require('https');
const http = require('http');

const MAX_BODY_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const defaultOrigins = [
    'null',
    'https://localhost',
    'http://localhost:5173',
    ...Array.from({ length: 21 }, (_, index) => `http://127.0.0.1:${4173 + index}`),
];
const allowedOrigins = new Set([...defaultOrigins, ...(process.env.ALLOWED_ORIGINS || '').split(',')]
    .map(value => value.trim())
    .filter(Boolean));
const yucPageCache = new Map();

function response(statusCode, body = '', extraHeaders = {}, origin = '') {
    return {
        isBase64Encoded: false,
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'no-store',
            ...extraHeaders,
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    };
}

function binaryResponse(statusCode, body, contentType, origin = '') {
    return {
        isBase64Encoded: true,
        statusCode,
        headers: {
            'Content-Type': contentType,
            // 显式声明传输编码：网关以 base64 承载二进制图片，
            // 前端据此直接选择解码路径，无需再靠魔术字节猜测。
            'X-Encoding': 'base64',
            'Cache-Control': 'public, max-age=604800, immutable',
            'X-Content-Type-Options': 'nosniff',
            ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Expose-Headers': 'X-Encoding' } : {}),
        },
        body: body.toString('base64'),
    };
}

function getAllowedImageUrl(event) {
    const queryString = event.queryString || {};
    const queryStringParameters = event.queryStringParameters || {};
    const value = queryString.url !== undefined ? queryString.url : queryStringParameters.url;
    if (typeof value !== 'string' || value.length > 2000) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'lain.bgm.tv') return null;
        if (!/^\/(?:r\/\d+\/)?pic\//.test(url.pathname)) return null;
        return url;
    } catch {
        return null;
    }
}

function proxyImage(url, origin) {
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };
        const request = https.request({
            hostname: url.hostname,
            port: 443,
            path: `${url.pathname}${url.search}`,
            method: 'GET',
            headers: { 'User-Agent': 'AnimaList/1.3.1' },
        }, upstream => {
            const contentType = String(upstream.headers['content-type'] || '').split(';')[0];
            if (upstream.statusCode !== 200 || !/^image\/(?:jpeg|png|webp|gif)$/.test(contentType)) {
                upstream.resume();
                finish(response(upstream.statusCode || 502, { error: 'Image upstream failed' }, {}, origin));
                return;
            }

            const chunks = [];
            let size = 0;
            upstream.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_RESPONSE_BYTES) {
                    request.destroy(new Error('Image response too large'));
                    return;
                }
                chunks.push(chunk);
            });
            upstream.on('end', () => finish(binaryResponse(200, Buffer.concat(chunks), contentType, origin)));
        });
        request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('Image upstream timeout')));
        request.on('error', error => finish(response(502, { error: error.message }, {}, origin)));
        request.end();
    });
}

function isAllowedRequest(method, path) {
    if (method === 'POST' && path === '/v0/search/subjects') return true;
    if (method === 'GET' && /^\/v0\/subjects\/\d+$/.test(path)) return true;
    if (method === 'GET' && /^\/v0\/subjects\/\d+\/characters$/.test(path)) return true;
    if (method === 'GET' && /^\/v0\/subjects\/\d+\/persons$/.test(path)) return true;
    return false;
}

function decodeHtml(value) {
    return String(value || '')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;|&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

function htmlLines(value) {
    return decodeHtml(String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .split(/\n+/)
        .map(line => line.replace(/[\t\r\u00a0　]+/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

function htmlText(value) {
    return htmlLines(value).join(' ').trim();
}

function classContent(html, classPrefix) {
    const pattern = new RegExp(`<([a-z][a-z0-9]*)[^>]*class=["'][^"']*${classPrefix}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
    const match = pattern.exec(html);
    return match ? match[2] : '';
}

function normalizeYucTitle(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLocaleLowerCase('zh-CN')
        .replace(/(?:第\s*[\d一二三四五六七八九十]+\s*[季期]|season\s*\d+|part\.?\s*\d+)/gi, '')
        .replace(/[\p{P}\p{S}\s]/gu, '');
}

function titleScore(left, right) {
    const a = normalizeYucTitle(left);
    const b = normalizeYucTitle(right);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return 82;
    const grams = value => {
        if (value.length < 2) return [value];
        return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2));
    };
    const aGrams = grams(a);
    const remaining = grams(b);
    let matches = 0;
    for (const gram of aGrams) {
        const index = remaining.indexOf(gram);
        if (index >= 0) {
            matches += 1;
            remaining.splice(index, 1);
        }
    }
    return Math.round((2 * matches / (aGrams.length + grams(b).length)) * 70);
}

function fullYucDate(dateText, season) {
    const match = String(dateText || '').match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    const seasonMatch = /^(\d{4})(01|04|07|10)$/.exec(season || '');
    if (!match || !seasonMatch) return '';
    let year = Number(seasonMatch[1]);
    const seasonMonth = Number(seasonMatch[2]);
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (seasonMonth === 1 && month >= 10) year -= 1;
    if (seasonMonth === 10 && month <= 2) year += 1;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function weekDayFromDate(dateText) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText || '');
    if (!match) return 0;
    const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
    return day === 0 ? 7 : day;
}

function updatePeriodFromTime(value) {
    const match = /^(\d{1,2}):[0-5]\d$/.exec(String(value || '').trim());
    if (!match) return '';
    const hour = Number(match[1]) % 24;
    if (hour < 5) return '深夜';
    if (hour < 12) return '上午';
    if (hour < 18) return '下午';
    return '晚间';
}

function updatePeriodFromBroadcast(value) {
    const text = String(value || '');
    if (/深夜|凌晨/.test(text)) return '深夜';
    if (/晚间|晚上/.test(text)) return '晚间';
    if (/下午/.test(text)) return '下午';
    if (/上午|早晨|早间/.test(text)) return '上午';
    return '';
}

function scheduleFromBroadcast(value, season) {
    const broadcast = htmlText(value);
    const weekDayNames = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    const weekDayMatch = /周([一二三四五六日天])/.exec(broadcast);
    const timeMatch = /(?:^|\s)((?:[01]?\d|2\d):[0-5]\d)/.exec(broadcast);
    const updateTime = timeMatch && timeMatch[1] ? timeMatch[1].padStart(5, '0') : '';
    const airDate = fullYucDate(broadcast, season);
    return {
        dateText: broadcast,
        airDate,
        updateWeekDay: weekDayMatch ? weekDayNames[weekDayMatch[1]] : weekDayFromDate(airDate),
        updateTime,
        updatePeriod: updatePeriodFromBroadcast(broadcast) || updatePeriodFromTime(updateTime),
        broadcast,
        isPreview: true,
    };
}

function parseStaff(staffHtml) {
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
    for (const line of htmlLines(staffHtml)) {
        const labeled = /^([^：:]{1,12})[：:]\s*(.*)$/.exec(line);
        if (labeled) {
            currentKey = wanted.get(labeled[1].trim()) || '';
            if (currentKey && labeled[2].trim()) {
                if (!result[currentKey] || labeled[1].trim() !== '制作') result[currentKey] = labeled[2].trim();
            }
        } else if (currentKey) {
            result[currentKey] = `${result[currentKey] || ''} ${line}`.trim();
        }
    }
    return result;
}

function parseYucPage(html, season) {
    const schedules = [];
    const weekDayMarkers = [];
    const weekDayMap = new Map([
        ['周一', 1], ['周二', 2], ['周三', 3], ['周四', 4],
        ['周五', 5], ['周六', 6], ['周日', 7],
    ]);
    const weekDayPattern = /<td[^>]*class=["'][^"']*date2[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi;
    let weekDayMatch;
    while ((weekDayMatch = weekDayPattern.exec(html))) {
        const label = htmlText(weekDayMatch[1]);
        const weekDayEntry = [...weekDayMap].find(([name]) => label.includes(name));
        const weekDay = weekDayEntry ? weekDayEntry[1] : 0;
        if (weekDay) weekDayMarkers.push({ index: weekDayMatch.index, weekDay });
    }
    const schedulePattern = /<div\s+style=["'][^"']*float\s*:\s*left[^"']*["'][^>]*>\s*<div[^>]*class=["'][^"']*div_date[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div>[\s\S]*?<td[^>]*class=["'][^"']*date_title[^"']*["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/table>/gi;
    let match;
    let markerIndex = 0;
    let sectionWeekDay = 0;
    while ((match = schedulePattern.exec(html))) {
        while (markerIndex < weekDayMarkers.length && weekDayMarkers[markerIndex].index < match.index) {
            sectionWeekDay = weekDayMarkers[markerIndex].weekDay;
            markerIndex += 1;
        }
        const dateBlock = match[1];
        const updateTime = htmlText(classContent(dateBlock, 'imgtext4') || classContent(dateBlock, 'imgtext5')).replace(/~.*$/, '').trim();
        const dateText = htmlText(classContent(dateBlock, 'imgep'));
        const dataImageMatch = /<img[^>]+data-src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/i.exec(dateBlock);
        const linkedImageMatch = /<a[^>]+href=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/i.exec(dateBlock);
        const rawImageUrl = dataImageMatch ? dataImageMatch[1] : (linkedImageMatch ? linkedImageMatch[1] : '');
        const imageUrl = rawImageUrl.replace(/^http:/i, 'https:');
        const airDate = fullYucDate(dateText, season);
        schedules.push({
            title: htmlText(match[2]),
            imageUrl,
            dateText,
            airDate,
            updateWeekDay: sectionWeekDay || weekDayFromDate(airDate),
            updateTime: /^(?:[01]?\d|2\d):[0-5]\d$/.test(updateTime) ? updateTime.padStart(5, '0') : '',
            updatePeriod: updatePeriodFromTime(updateTime),
        });
    }

    const details = [];
    const detailPattern = /<table[^>]*width=["']500px["'][^>]*>([\s\S]*?)<\/table>/gi;
    while ((match = detailPattern.exec(html))) {
        const table = match[1];
        const titleCn = htmlText(classContent(table, 'title_cn_'));
        const titleJp = htmlText(classContent(table, 'title_jp_'));
        if (!titleCn && !titleJp) continue;
        const prefix = html.slice(Math.max(0, match.index - 1000), match.index);
        const imagePattern = /<img[^>]+(?:data-src|src)=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi;
        const images = [];
        let imageMatch;
        while ((imageMatch = imagePattern.exec(prefix))) images.push(imageMatch);
        const lastImage = images.length ? images[images.length - 1] : null;
        details.push({
            titleCn,
            titleJp,
            imageUrl: (lastImage ? lastImage[1] : '').replace(/^http:/i, 'https:'),
            broadcast: htmlText(classContent(table, 'broadcast_')),
            staff: parseStaff(classContent(table, 'staff_')),
        });
    }

    const matchedDetails = new Set();
    const records = schedules.map(schedule => {
        const match = details.map((detail, index) => ({
            detail,
            index,
            score: Math.max(
                schedule.imageUrl && detail.imageUrl && schedule.imageUrl === detail.imageUrl ? 100 : 0,
                titleScore(schedule.title, detail.titleCn),
                titleScore(schedule.title, detail.titleJp),
            ),
        })).sort((left, right) => right.score - left.score)[0];
        const detail = match && match.score >= 55 ? match.detail : null;
        if (detail) matchedDetails.add(match.index);
        const updatePeriod = updatePeriodFromBroadcast(detail ? detail.broadcast : '') || schedule.updatePeriod;
        return {
            title: (detail && detail.titleCn) || schedule.title,
            titleCn: (detail && detail.titleCn) || schedule.title,
            titleJp: (detail && detail.titleJp) || '',
            imageUrl: schedule.imageUrl,
            broadcast: (detail && detail.broadcast) || '',
            staff: (detail && detail.staff) || {},
            schedule: { ...schedule, updatePeriod, broadcast: (detail && detail.broadcast) || '', isPreview: false },
        };
    });
    details.forEach((detail, index) => {
        if (matchedDetails.has(index)) return;
        const title = detail.titleCn || detail.titleJp;
        records.push({
            title,
            titleCn: detail.titleCn,
            titleJp: detail.titleJp,
            imageUrl: detail.imageUrl,
            broadcast: detail.broadcast,
            staff: detail.staff,
            schedule: { title, ...scheduleFromBroadcast(detail.broadcast, season) },
        });
    });
    return records.filter(record => record.title || record.titleCn || record.titleJp);
}

function matchYucAnime(records, titles) {
    const requested = titles.map(value => String(value || '').trim()).filter(Boolean);
    let best = null;
    for (const record of records) {
        const score = Math.max(0, ...requested.flatMap(title => [
            titleScore(title, record.titleCn),
            titleScore(title, record.titleJp),
            titleScore(title, record.schedule ? record.schedule.title : ''),
        ]));
        if (!best || score > best.score) best = { score, record };
    }
    return best && best.score >= 55 ? best.record : null;
}

function yucSeasonFromDate(value, now = new Date()) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value || '');
    const year = match ? Number(match[1]) : now.getFullYear();
    const month = match ? Number(match[2]) : now.getMonth() + 1;
    const seasonMonth = month <= 3 ? 1 : month <= 6 ? 4 : month <= 9 ? 7 : 10;
    return `${year}${String(seasonMonth).padStart(2, '0')}`;
}

function isYucSeason(value) {
    return /^\d{4}(01|04|07|10)$/.test(String(value || ''));
}

function downloadYucPage(path, transport = https) {
    return new Promise((resolve, reject) => {
        const request = transport.request({
            hostname: 'yuc.wiki',
            port: transport === https ? 443 : 80,
            path,
            method: 'GET',
            headers: {
                'User-Agent': 'AnimaList/1.3.1 (+local anime tracker)',
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Encoding': 'identity',
            },
        }, upstream => {
            if (upstream.statusCode !== 200) {
                upstream.resume();
                reject(new Error(`Yuc upstream returned ${upstream.statusCode || 502}`));
                return;
            }
            const chunks = [];
            let size = 0;
            upstream.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_RESPONSE_BYTES) request.destroy(new Error('Yuc response too large'));
                else chunks.push(chunk);
            });
            upstream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('Yuc upstream timeout')));
        request.on('error', reject);
        request.end();
    });
}

async function fetchYucAnime(event, origin) {
    const params = { ...(event.queryStringParameters || {}), ...(event.queryString || {}) };
    const titles = [params.title, params.titleCn, params.titleJp]
        .filter(value => typeof value === 'string' && value.length <= 300);
    if (titles.length === 0) return response(400, { error: 'Missing title' }, {}, origin);
    const season = yucSeasonFromDate(params.airDate);
    if (season < '201910') return response(200, null, { 'Cache-Control': 'public, max-age=21600' }, origin);
    const path = `/${season}/`;
    const forceRefresh = params.refresh === '1';
    const respondFromRecords = records => {
        const result = matchYucAnime(records, titles);
        return response(200, result ? {
            source: 'yuc.wiki',
            season,
            sourceUrl: `https://yuc.wiki/${season}/`,
            ...result,
        } : null, { 'Cache-Control': 'public, max-age=21600' }, origin);
    };
    const cached = yucPageCache.get(season);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return respondFromRecords(cached.records);

    try {
        // yuc.wiki 当前 HTTPS 证书已过期，但同一固定主机公开提供 HTTP 200 页面。
        // 抓取内容只按白名单字段解析为纯文本，从不执行远端脚本或透传 HTML。
        const html = await downloadYucPage(path, http);
        const records = parseYucPage(html, season);
        if (records.length === 0) throw new Error('Yuc page structure was not recognized');
        yucPageCache.set(season, { records, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
        return respondFromRecords(records);
    } catch (error) {
        return response(502, { error: error.message }, {}, origin);
    }
}

async function fetchYucSeason(event, origin) {
    const params = { ...(event.queryStringParameters || {}), ...(event.queryString || {}) };
    const season = String(params.season || '');
    const forceRefresh = params.refresh === '1';
    if (!isYucSeason(season)) return response(400, { error: 'Invalid season' }, {}, origin);
    if (season < '201910') {
        return response(200, {
            source: 'yuc.wiki',
            season,
            sourceUrl: '',
            records: [],
        }, { 'Cache-Control': 'public, max-age=21600' }, origin);
    }
    const cached = yucPageCache.get(season);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
        return response(200, {
            source: 'yuc.wiki',
            season,
            sourceUrl: `https://yuc.wiki/${season}/`,
            records: cached.records,
        }, { 'Cache-Control': 'public, max-age=21600' }, origin);
    }
    try {
        const html = await downloadYucPage(`/${season}/`, http);
        const records = parseYucPage(html, season);
        if (records.length === 0) throw new Error('Yuc page structure was not recognized');
        yucPageCache.set(season, { records, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
        return response(200, {
            source: 'yuc.wiki',
            season,
            sourceUrl: `https://yuc.wiki/${season}/`,
            records,
        }, { 'Cache-Control': 'public, max-age=21600' }, origin);
    } catch (error) {
        return response(502, { error: error.message }, {}, origin);
    }
}

function requestBangumi({ path, method = 'GET', body = '' }) {
    return new Promise((resolve, reject) => {
        const request = https.request({
            hostname: 'api.bgm.tv',
            port: 443,
            path,
            method,
            headers: {
                'User-Agent': 'AnimaList/1.3.1',
                Accept: 'application/json',
                ...(method === 'POST' ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                } : {}),
            },
        }, upstream => {
            const chunks = [];
            let size = 0;
            upstream.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_RESPONSE_BYTES) request.destroy(new Error('Upstream response too large'));
                else chunks.push(chunk);
            });
            upstream.on('end', () => resolve({
                statusCode: upstream.statusCode || 502,
                body: Buffer.concat(chunks).toString('utf8'),
            }));
        });
        request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('Upstream timeout')));
        request.on('error', reject);
        if (method === 'POST') request.write(body);
        request.end();
    });
}

function httpsImageUrl(value) {
    return typeof value === 'string' ? value.replace(/^http:/i, 'https:') : '';
}

function normalizeLegacySearch(payload, limit = 8) {
    const records = Array.isArray(payload && payload.list) ? payload.list : [];
    return records
        .filter(item => item && typeof item === 'object' && Number(item.type) === 2)
        .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)))
        .map(item => {
            const images = item.images && typeof item.images === 'object' ? item.images : {};
            return {
                id: item.id,
                type: 2,
                name: String(item.name || ''),
                name_cn: String(item.name_cn || ''),
                summary: String(item.summary || ''),
                date: String(item.air_date || ''),
                images: {
                    large: httpsImageUrl(images.large),
                    common: httpsImageUrl(images.common),
                    medium: httpsImageUrl(images.medium),
                    small: httpsImageUrl(images.small),
                    grid: httpsImageUrl(images.grid),
                },
            };
        });
}

async function proxyBangumiSearch(body, origin, requester = requestBangumi) {
    let input;
    try {
        input = JSON.parse(body || '{}');
    } catch {
        return response(400, { error: 'Invalid JSON body' }, {}, origin);
    }
    const keyword = typeof input.keyword === 'string' ? input.keyword.trim().slice(0, 300) : '';
    if (!keyword) return response(400, { error: 'Missing keyword' }, {}, origin);

    let primary;
    try {
        primary = await requester({ path: '/v0/search/subjects', method: 'POST', body });
    } catch {
        primary = null;
    }
    const fallbackStatuses = new Set([429, 502, 503, 504]);
    if (primary && !fallbackStatuses.has(primary.statusCode)) {
        return response(primary.statusCode, primary.body, {}, origin);
    }

    try {
        const legacyPath = `/search/subject/${encodeURIComponent(keyword)}?type=2&responseGroup=small`;
        const legacy = await requester({ path: legacyPath, method: 'GET', body: '' });
        if (legacy.statusCode !== 200) {
            return response(primary ? primary.statusCode : legacy.statusCode, primary ? primary.body : legacy.body, {}, origin);
        }
        const mapped = normalizeLegacySearch(JSON.parse(legacy.body), input.limit);
        return response(200, { total: mapped.length, data: mapped, fallback: 'legacy-search' }, {}, origin);
    } catch (error) {
        return response(502, { error: error.message || 'Bangumi search failed' }, {}, origin);
    }
}

function eventBody(event) {
    if (!event.body) return '';
    if (event.isBase64Encoded && typeof event.body === 'string') {
        return Buffer.from(event.body, 'base64').toString('utf8');
    }
    return typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
}

exports._test = {
    getAllowedImageUrl,
    isAllowedRequest,
    binaryResponse,
    normalizeYucTitle,
    parseYucPage,
    matchYucAnime,
    yucSeasonFromDate,
    updatePeriodFromTime,
    updatePeriodFromBroadcast,
    normalizeLegacySearch,
    proxyBangumiSearch,
};

exports.main_handler = async event => {
    const requestContext = event.requestContext || {};
    const requestHttp = requestContext.http || {};
    const path = event.path || event.rawPath || requestHttp.path || '';
    const method = (event.httpMethod || requestHttp.method || 'GET').toUpperCase();
    const eventHeaders = event.headers || {};
    const requestOrigin = eventHeaders.origin || eventHeaders.Origin || '';
    const corsOrigin = allowedOrigins.has(requestOrigin) ? requestOrigin : '';
    const send = (statusCode, body = '', headers = {}) => response(statusCode, body, headers, corsOrigin);

    if (method === 'OPTIONS') {
        if (!corsOrigin) return send(403, { error: 'Origin not allowed' });
        return send(204, '', { 'Access-Control-Max-Age': '86400' });
    }
    if (requestOrigin && !corsOrigin) return send(403, { error: 'Origin not allowed' });
    if (method === 'GET' && path === '/image') {
        const imageUrl = getAllowedImageUrl(event);
        if (!imageUrl) return send(400, { error: 'Invalid image URL' });
        return proxyImage(imageUrl, corsOrigin);
    }
    if (method === 'GET' && path === '/yuc/anime') {
        return fetchYucAnime(event, corsOrigin);
    }
    if (method === 'GET' && path === '/yuc/season') {
        return fetchYucSeason(event, corsOrigin);
    }
    if (!isAllowedRequest(method, path)) return send(404, { error: 'Not found' });

    const body = eventBody(event);
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return send(413, { error: 'Request body too large' });

    if (method === 'POST' && path === '/v0/search/subjects') {
        return proxyBangumiSearch(body, corsOrigin);
    }

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(event.queryString || {})) {
        if (typeof value === 'string' && value.length <= 500) query.set(key, value);
    }
    const queryText = query.toString();
    const targetPath = `${path}${queryText ? `?${queryText}` : ''}`;

    try {
        const upstream = await requestBangumi({ path: targetPath, method, body });
        return send(upstream.statusCode, upstream.body);
    } catch (error) {
        return send(502, { error: error.message || 'Bangumi upstream failed' });
    }
};
