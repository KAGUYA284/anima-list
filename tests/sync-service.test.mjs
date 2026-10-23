import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnimeRecord } from '../www/js/data.js';
import * as store from '../www/js/store.js';
import { loadOperationBackups } from '../www/js/backups.js';

let session = 0;
const copy = value => JSON.parse(JSON.stringify(value));
const anime = (id, episode = 1) => normalizeAnimeRecord({ id, title: id, bgmId: id.replace(/\D/g, '') || '42', currentEpisode: episode, totalEpisodes: 12, type: 'chasing', status: 'watching' });

async function scenario(run) {
    const previous = { storage: globalThis.localStorage, window: globalThis.window, fetch: globalThis.fetch, state: store.state, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
    const values = new Map([['ANIMA_AUTH_USER', JSON.stringify({ id: 'self' })], ['AUTH_TOKEN', 'test-token']]);
    globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    globalThis.window = new EventTarget();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    store.setRenderer(() => {});
    store.setState({ animeList: [] }, { render: false });
    const server = { snapshot: null, revision: 0, serverUpdatedAt: 0 };
    const requests = [];
    const hooks = {};
    globalThis.fetch = async (_url, options = {}) => {
        const method = options.method || 'GET';
        requests.push(method);
        if (method === 'GET') {
            const response = copy(server);
            await hooks.get?.();
            return Response.json({ success: true, data: response });
        }
        const body = JSON.parse(options.body);
        await hooks.put?.(body);
        if (body.baseRevision !== server.revision) return Response.json({ success: false, error: { code: 'SYNC_CONFLICT' }, remote: copy(server) }, { status: 409 });
        server.snapshot = body.snapshot;
        server.revision += 1;
        server.serverUpdatedAt = Date.now();
        server.dataHash = 'server-content';
        return Response.json({ success: true, data: { revision: server.revision, dataHash: server.dataHash } });
    };
    const sync = await import(`../www/js/sync-service.js?journey=${++session}`);
    try { await run({ sync, values, server, requests, hooks }); }
    finally {
        await sync.logout();
        globalThis.localStorage = previous.storage;
        globalThis.window = previous.window;
        globalThis.fetch = previous.fetch;
        if (previous.navigator) Object.defineProperty(globalThis, 'navigator', previous.navigator);
        else delete globalThis.navigator;
        store.setState(previous.state, { render: false });
    }
}

test('ordinary empty sync remains protected while explicit cloud initialization succeeds once', () => scenario(async ({ sync, server, requests }) => {
    store.setState({ animeList: [anime('101')] }, { render: false });
    assert.equal((await sync.syncNow()).action, 'blocked-empty-remote');
    assert.equal(requests.includes('PUT'), false);
    assert.equal((await sync.initializeCloud()).action, 'initialize');
    assert.equal(server.snapshot.records.length, 1);
    await assert.rejects(sync.initializeCloud(), /云端已有番剧/);
    assert.equal(requests.filter(method => method === 'PUT').length, 1);
}));

test('a blank device can explicitly restore cloud data and nonempty local data is backed up', () => scenario(async ({ sync, server }) => {
    server.snapshot = { schemaVersion: 2, records: [anime('102', 8)] };
    server.revision = 4;
    assert.equal((await sync.syncNow()).action, 'blocked-empty');
    assert.equal((await sync.restoreFromCloud()).action, 'restore');
    assert.equal(store.state.animeList[0].currentEpisode, 8);
    store.updateAnime('102', { currentEpisode: 9 });
    await sync.restoreFromCloud();
    assert.equal(store.state.animeList[0].currentEpisode, 8);
    assert.equal(loadOperationBackups()[0].backup.records[0].currentEpisode, 9);
}));

test('cloud restore rejects empty cloud or edits made while the request is in flight', () => scenario(async ({ sync, server, hooks }) => {
    store.setState({ animeList: [anime('103', 2)] }, { render: false });
    await assert.rejects(sync.restoreFromCloud(), /云端数据为空/);
    server.snapshot = { schemaVersion: 2, records: [anime('103', 1)] };
    server.revision = 1;
    hooks.get = () => store.updateAnime('103', { currentEpisode: 3 });
    await assert.rejects(sync.restoreFromCloud(), /本地记录已修改/);
    assert.equal(store.state.animeList[0].currentEpisode, 3);
}));

test('concurrent sync clicks share a request and in-flight local edits remain dirty for the next upload', () => scenario(async ({ sync, values, server, hooks, requests }) => {
    store.setState({ animeList: [anime('104', 2)] }, { render: false });
    server.snapshot = { schemaVersion: 2, records: [anime('104', 1)] };
    server.revision = 1;
    values.set('ANIMA_LAST_REVISION', '1');
    values.set('ANIMA_LOCAL_DIRTY', 'true');
    let release;
    let entered;
    const requestStarted = new Promise(resolve => { entered = resolve; });
    hooks.put = () => { entered(); return new Promise(resolve => { release = resolve; }); };
    const first = sync.syncNow();
    assert.equal(sync.syncNow(), first);
    await requestStarted;
    store.updateAnime('104', { currentEpisode: 3 });
    release();
    await first;
    assert.equal(server.snapshot.records[0].currentEpisode, 2);
    assert.equal(values.get('ANIMA_LOCAL_DIRTY'), 'true');
    delete hooks.put;
    await sync.syncNow();
    assert.equal(server.snapshot.records[0].currentEpisode, 3);
    assert.equal(values.get('ANIMA_LOCAL_DIRTY'), 'false');
    assert.equal(requests.filter(method => method === 'PUT').length, 2);
    assert.equal(loadOperationBackups()[0].reason, '覆盖云端前');
    assert.equal(loadOperationBackups()[0].backup.records[0].currentEpisode, 2);
}));

test('conflict resolution uses current local notes and detects a newer cloud revision', () => scenario(async ({ sync, values, server }) => {
    store.setState({ animeList: [anime('105', 2)] }, { render: false });
    server.snapshot = { schemaVersion: 2, records: [anime('105', 4)] };
    server.revision = 2;
    values.set('ANIMA_LAST_REVISION', '1');
    values.set('ANIMA_LOCAL_DIRTY', 'true');
    await assert.rejects(sync.syncNow(), { name: 'SyncConflictError' });
    store.updateAnime('105', { currentEpisode: 3, review: '冲突后新写的' });
    await sync.resolveConflict('local');
    assert.equal(server.snapshot.records[0].review, '冲突后新写的');
    assert.equal(server.snapshot.records[0].currentEpisode, 3);
    values.set('ANIMA_LAST_REVISION', '1');
    values.set('ANIMA_LOCAL_DIRTY', 'true');
    await assert.rejects(sync.syncNow(), { name: 'SyncConflictError' });
    server.revision += 1;
    await assert.rejects(sync.resolveConflict('local'), { name: 'SyncConflictError' });
    assert.equal(sync.getSyncStatus().conflict.remote.revision, server.revision);
}));

test('cloud snapshots omit cache metadata and downloading retains matching local text cache', () => scenario(async ({ sync, server }) => {
    const local = { ...anime('106'), metadata: { summary: '本机简介', staff: { director: '本机制作信息' } } };
    store.setState({ animeList: [local] }, { render: false });
    assert.equal(Object.hasOwn(sync.createLocalSnapshot().records[0], 'metadata'), false);
    server.snapshot = { schemaVersion: 2, records: [anime('106', 4)] };
    server.revision = 3;
    await sync.restoreFromCloud();
    assert.equal(store.state.animeList[0].metadata.summary, '本机简介');
    assert.equal(store.state.animeList[0].metadata.staff.director, '本机制作信息');
}));
