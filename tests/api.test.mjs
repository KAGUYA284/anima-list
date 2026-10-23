import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
};

const {
    apiFetch, getBangumiEndpointOrder, getBangumiImageUrl, getBangumiSubject, resolveBangumiImageUrl,
    searchBangumi, searchBangumiForYuc, selectBangumiMatch,
} = await import('../www/js/api.js');
const { applyImportedEnrichment, fillMissingAnimeFields } = await import('../www/js/import-enrichment.js');

test('Bangumi images use the image proxy only in proxy mode', () => {
    const image = 'https://lain.bgm.tv/r/800/pic/cover/l/example.jpg';
    assert.equal(getBangumiImageUrl(image, 'direct'), image);
    assert.equal(
        getBangumiImageUrl(image, 'proxy1'),
        `https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com/image?url=${encodeURIComponent(image)}`,
    );
    assert.equal(getBangumiImageUrl('https://example.test/image.jpg', 'proxy1'), 'https://example.test/image.jpg');
    assert.equal(getBangumiImageUrl('javascript:alert(1)', 'proxy1'), '');
});

test('Bangumi endpoint order follows the selected connection mode', () => {
    assert.deepEqual(getBangumiEndpointOrder('direct'), [
        'https://api.bgm.tv',
        'https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com',
    ]);
    assert.deepEqual(getBangumiEndpointOrder('proxy1'), [
        'https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com',
        'https://api.bgm.tv',
    ]);
});

test('direct Bangumi search automatically falls back to the proxy', async () => {
    const urls = [];
    globalThis.fetch = async url => {
        urls.push(String(url));
        if (String(url).startsWith('https://api.bgm.tv')) {
            return new Response('{}', { status: 502 });
        }
        return new Response(JSON.stringify({
            data: [{ id: 42, type: 2, name: 'Fallback', name_cn: '代理降级成功' }],
        }), { status: 200 });
    };
    const records = await searchBangumi('代理降级测试');
    assert.equal(records[0].id, 42);
    assert.ok(urls[0].startsWith('https://api.bgm.tv'));
    assert.ok(urls.at(-1).startsWith('https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com'));
});

test('proxy-first Yuc search automatically falls back to direct Bangumi', async () => {
    const urls = [];
    globalThis.fetch = async url => {
        urls.push(String(url));
        if (String(url).startsWith('https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com')) {
            return new Response('{}', { status: 503 });
        }
        return new Response(JSON.stringify({
            data: [{ id: 84, type: 2, name: '対象作品', name_cn: '目标作品', date: '2026-10-03' }],
        }), { status: 200 });
    };
    const match = await searchBangumiForYuc({
        title: '目标作品', titleCn: '目标作品', titleJp: '対象作品', schedule: { airDate: '2026-10-03' },
    });
    assert.equal(match.id, 84);
    assert.ok(urls[0].startsWith('https://1449216768-89tlli7yzj.ap-hongkong.tencentscf.com'));
    assert.ok(urls.at(-1).startsWith('https://api.bgm.tv'));
});

test('SCF Base64 image responses are decoded into Blob URLs', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    let capturedBlob;
    URL.createObjectURL = blob => {
        capturedBlob = blob;
        return 'blob:test-image';
    };
    globalThis.fetch = async () => new Response('aGVsbG8=', {
        status: 200,
        headers: { 'Content-Type': 'application/json,image/jpeg' },
    });
    try {
        const result = await resolveBangumiImageUrl(
            'https://lain.bgm.tv/r/800/pic/cover/l/proxy-base64-test.jpg',
            'proxy1',
        );
        assert.equal(result, 'blob:test-image');
        assert.equal(capturedBlob.type, 'image/jpeg');
        assert.equal(await capturedBlob.text(), 'hello');
    } finally {
        URL.createObjectURL = originalCreateObjectURL;
    }
});

test('apiFetch retries a transient response and parses the successful response', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return calls === 1
            ? new Response('{}', { status: 503 })
            : new Response('{"id":42}', { status: 200 });
    };
    const result = await apiFetch('https://example.test', {}, { retries: 1, timeoutMs: 1000 });
    assert.equal(calls, 2);
    assert.equal(result.id, 42);
});

test('subject metadata is persisted and used as an offline stale fallback', async () => {
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    globalThis.fetch = async () => new Response('{"id":7,"name":"cached"}', { status: 200 });
    try {
        const first = await getBangumiSubject('7');
        assert.equal(first.name, 'cached');
        assert.ok(storage.get('anime-tracker-api-cache-v2'));

        now += 7 * 60 * 60 * 1000;
        globalThis.fetch = async () => { throw new TypeError('offline'); };
        const second = await getBangumiSubject('7');
        assert.equal(second.name, 'cached');
    } finally {
        Date.now = realNow;
    }
});

test('Yuc records select the matching Bangumi subject by title and air date', () => {
    const subjects = [
        { id: 10, type: 2, name: '同名作品', name_cn: '同名作品', date: '2024-07-01' },
        { id: 20, type: 2, name: '対象作品 第2期', name_cn: '目标作品 第二季', date: '2026-07-06' },
    ];
    const matched = selectBangumiMatch(subjects, {
        titleCn: '目标作品 第2期',
        titleJp: '対象作品 第2期',
        airDate: '2026-07-06',
    });
    assert.equal(matched.id, 20);
});

test('Yuc additions search Bangumi by Japanese title before Chinese fallback', async () => {
    const keywords = [];
    globalThis.fetch = async (_url, options) => {
        const keyword = JSON.parse(options.body).keyword;
        keywords.push(keyword);
        const data = keyword === '対象作品'
            ? [{ id: 1, type: 2, name: '別作品', name_cn: '其他作品', date: '2026-07-01' }]
            : [{ id: 2, type: 2, name: '対象作品', name_cn: '目标作品', date: '2026-07-02' }];
        return new Response(JSON.stringify({ data }), { status: 200 });
    };
    const matched = await searchBangumiForYuc({
        title: '目标作品',
        titleCn: '目标作品',
        titleJp: '対象作品',
        schedule: { airDate: '2026-07-02' },
    });
    assert.deepEqual(keywords, ['対象作品', '目标作品']);
    assert.equal(matched.id, 2);
});

test('import enrichment fills missing fields without overwriting local values', () => {
    const enriched = fillMissingAnimeFields({
        title: '导入作品',
        totalEpisodes: 1,
        currentEpisode: 0,
        type: 'chasing',
        airDate: '',
        updateWeekDay: 5,
        updateTime: '',
        updatePeriod: '',
    }, {
        subject: { id: 42, total_episodes: 12, date: '2026-07-03' },
        yuc: { schedule: { airDate: '2026-07-04', updateWeekDay: 6, updateTime: '22:30', updatePeriod: '晚间' } },
    });
    assert.equal(enriched.bgmId, '42');
    assert.equal(enriched.totalEpisodes, 12);
    assert.equal(enriched.airDate, '2026-07-04');
    assert.equal(enriched.updateWeekDay, 5);
    assert.equal(enriched.updateTime, '22:30');
    assert.equal(enriched.updatePeriod, '晚间');
});

test('async import completion retains metadata and current episode notes, and ignores a changed subject link', () => {
    const current = { id: 'local', title: '作品', bgmId: '42', type: 'chasing', totalEpisodes: 12, currentEpisode: 8, episodeNotes: { 8: { note: '刚写下的', watchedAt: '2026-10-23T10:00:00.000Z' } }, metadata: { summary: '已有简介' } };
    const candidate = { ...current, currentEpisode: 2, episodeNotes: {}, metadata: { summary: '旧简介', coverUrl: 'https://example.test/cover.jpg', staff: { director: '导演' } } };
    const result = applyImportedEnrichment(current, candidate);
    assert.equal(result.currentEpisode, 8);
    assert.equal(result.episodeNotes[8].note, '刚写下的');
    assert.equal(result.metadata.summary, '已有简介');
    assert.equal(result.metadata.staff.director, '导演');
    assert.equal(applyImportedEnrichment({ ...current, bgmId: '99' }, candidate).bgmId, '99');
});
