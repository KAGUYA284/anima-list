import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage ||= { getItem: () => null, setItem() {} };
const { mergeLibraryMetadata } = await import('../www/js/library-cache.js');
const store = await import('../www/js/store.js');
const { normalizeAnimeRecord } = await import('../www/js/data.js');

function thumbnailDatabase() {
    const records = new Map();
    let created = false;
    const database = {
        objectStoreNames: { contains: () => created },
        createObjectStore() { created = true; },
        close() {},
        transaction() {
            const transaction = {};
            transaction.objectStore = () => ({
                get(key) {
                    const request = {};
                    queueMicrotask(() => { request.result = records.get(key); transaction.oncomplete?.(); });
                    return request;
                },
                put(value) {
                    const request = {};
                    queueMicrotask(() => { records.set(value.url, structuredClone(value)); request.result = value.url; transaction.oncomplete?.(); });
                    return request;
                },
            });
            return transaction;
        },
    };
    return {
        records,
        open() {
            const request = {};
            queueMicrotask(() => {
                request.result = database;
                if (!created) request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        },
    };
}

test('收藏资料合并简介封面与制作信息，缺失字段保留上次成功内容', () => {
    const first = mergeLibraryMetadata({}, {
        subject: { summary: '第一版简介', images: { large: 'https://lain.bgm.tv/large.jpg', medium: 'https://lain.bgm.tv/thumb.jpg' } },
        yuc: { staff: { director: '导演甲', animationStudio: '制作公司' } },
    }, '2026-10-23T01:00:00.000Z');
    const next = mergeLibraryMetadata({ metadata: first }, {
        subject: { summary: '', images: {} },
        yuc: { staff: { director: '导演乙' } },
    }, '2026-10-24T01:00:00.000Z');
    assert.equal(next.summary, '第一版简介');
    assert.equal(next.coverUrl, first.coverUrl);
    assert.equal(next.thumbnailUrl, first.thumbnailUrl);
    assert.equal(next.staff.director, '导演乙');
    assert.equal(next.staff.animationStudio, '制作公司');
    assert.equal(next.updatedAt, '2026-10-24T01:00:00.000Z');
    assert.equal(mergeLibraryMetadata({ metadata: next }, {}), next);
    assert.equal(mergeLibraryMetadata({ metadata: next }, { subject: { id: 1 }, yuc: { schedule: {} } }), next);
});

test('缩略图Blob持久写入IndexedDB，重新打开后离线读取且不写进localStorage', async () => {
    const previous = { indexedDB: globalThis.indexedDB, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
    const database = thumbnailDatabase();
    globalThis.indexedDB = database;
    let storageWrites = 0;
    globalThis.localStorage = { getItem: () => null, setItem() { storageWrites += 1; } };
    let fetches = 0;
    globalThis.fetch = async () => {
        fetches += 1;
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { headers: { 'Content-Type': 'image/jpeg' } });
    };
    const record = { metadata: { thumbnailUrl: 'https://lain.bgm.tv/offline-persist-test.jpg' } };
    let firstUrl;
    let secondUrl;
    try {
        const firstSession = await import('../www/js/library-cache.js?thumbnail-session-1');
        firstUrl = await firstSession.resolveLibraryThumbnail(record, { fetchMissing: true });
        assert.match(firstUrl, /^blob:/);
        assert.ok(database.records.get(record.metadata.thumbnailUrl).blob instanceof Blob);
        globalThis.fetch = async () => { throw new Error('offline'); };
        const secondSession = await import('../www/js/library-cache.js?thumbnail-session-2');
        secondUrl = await secondSession.resolveLibraryThumbnail(record);
        assert.match(secondUrl, /^blob:/);
        assert.equal(fetches, 1);
        assert.equal(storageWrites, 0);
    } finally {
        if (firstUrl) URL.revokeObjectURL(firstUrl);
        if (secondUrl) URL.revokeObjectURL(secondUrl);
        Object.assign(globalThis, previous);
    }
});

test('后台资料缓存覆盖全部收藏状态，网络任务最多并发三部', async () => {
    const previous = { indexedDB: globalThis.indexedDB, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
    const previousState = { ...store.state };
    globalThis.indexedDB = thumbnailDatabase();
    const storage = new Map();
    globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
    let active = 0;
    let maxActive = 0;
    let subjects = 0;
    let images = 0;
    globalThis.fetch = async url => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 2));
        try {
            const id = String(url).match(/\/v0\/subjects\/(\d+)/)?.[1];
            if (id) {
                subjects += 1;
                return new Response(JSON.stringify({ id: Number(id), summary: `简介${id}`, images: { medium: `https://lain.bgm.tv/thumb-${id}.jpg` } }));
            }
            images += 1;
            return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { headers: { 'Content-Type': 'image/jpeg' } });
        } finally {
            active -= 1;
        }
    };
    try {
        const statuses = ['watching', 'want', 'completed', 'dropped', 'paused', 'completed', 'want', 'watching'];
        const records = statuses.map((status, index) => normalizeAnimeRecord({
            id: `library-all-${index}`, bgmId: String(17001 + index), title: `收藏${index}`, status, airDate: '2018-01-01',
        }));
        store.setState({ animeList: records, settings: { ...store.state.settings, apiEndpoint: 'direct' } }, { render: false });
        const session = await import('../www/js/library-cache.js?all-statuses-test');
        await session.cacheLibraryRecords();
        assert.equal(subjects, records.length);
        assert.equal(images, records.length);
        assert.ok(maxActive <= 3);
        assert.equal(globalThis.indexedDB.records.size, records.length);
        for (const record of store.state.animeList) assert.equal(record.metadata.summary, `简介${record.bgmId}`);
        assert.equal(JSON.stringify(store.state.animeList).includes('blob:'), false);
    } finally {
        store.setState(previousState, { render: false });
        Object.assign(globalThis, previous);
    }
});

test('后台网络不可用时保留收藏的旧简介制作信息与最后成功时间', async () => {
    const previous = { indexedDB: globalThis.indexedDB, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
    const previousState = { ...store.state };
    globalThis.indexedDB = thumbnailDatabase();
    globalThis.localStorage = { getItem: () => null, setItem() {} };
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    try {
        const record = normalizeAnimeRecord({
            id: 'library-offline', bgmId: '18999', title: '离线收藏', airDate: '2018-01-01',
            metadata: { summary: '旧简介', staff: { director: '旧导演' }, updatedAt: '2026-01-01T00:00:00.000Z', bangumiUpdatedAt: '2026-01-01T00:00:00.000Z' },
        });
        store.setState({ animeList: [record] }, { render: false });
        const session = await import('../www/js/library-cache.js?offline-preserve-test');
        await session.cacheLibraryRecords();
        assert.deepEqual(store.state.animeList[0].metadata, record.metadata);
    } finally {
        store.setState(previousState, { render: false });
        Object.assign(globalThis, previous);
    }
});
