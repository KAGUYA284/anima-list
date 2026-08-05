import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
};

const {
    apiFetch, getBangumiImageUrl, getBangumiSubject, resolveBangumiImageUrl,
    searchBangumiForYuc, selectBangumiMatch,
} = await import('../www/js/api.js');

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
