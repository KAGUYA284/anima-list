import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
};

const { apiFetch, getBangumiSubject } = await import('../www/js/api.js');

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
        assert.ok(storage.get('anime-tracker-api-cache-v1'));

        now += 7 * 60 * 60 * 1000;
        globalThis.fetch = async () => { throw new TypeError('offline'); };
        const second = await getBangumiSubject('7');
        assert.equal(second.name, 'cached');
    } finally {
        Date.now = realNow;
    }
});
