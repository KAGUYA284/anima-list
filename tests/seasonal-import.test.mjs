import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonalAnime, findExistingSeasonalAnime, getSeasonalRecordKey } from '../www/js/seasonal-import.js';
import { createBackup, normalizeAnimeRecord, readBackup } from '../www/js/data.js';
import { renderYucRecords } from '../www/js/renderer/yuc.js';

test('seasonal imports use canonical Bangumi metadata while retaining Yuc schedule fields', () => {
    const record = {
        titleCn: '译名不同',
        titleJp: '原題',
        schedule: { airDate: '2026-07-02', updateWeekDay: 4, updateTime: '23:30', updatePeriod: '晚间' },
    };
    const anime = buildSeasonalAnime(record, {
        id: 42, name: '原題', name_cn: 'Bangumi 中文名', date: '2026-07-03', total_episodes: 24,
    }, '202607');
    const { metadata, ...canonical } = anime;
    assert.deepEqual(canonical, {
        title: 'Bangumi 中文名', totalEpisodes: 24, currentEpisode: 0, status: 'want', type: 'chasing',
        airDate: '2026-07-03', updateWeekDay: 4, updateTime: '23:30', updatePeriod: '晚间', bgmId: '42',
        titleJp: '原題', yucKey: '202607:原題',
    });
});

test('seasonal duplicate detection prioritizes Bangumi ID across different titles', () => {
    const existing = [{ title: '旧译名', bgmId: '42' }];
    const duplicate = findExistingSeasonalAnime(existing, { titleCn: '完全不同的新译名' }, { id: 42, name: '原題' });
    assert.equal(duplicate, existing[0]);
    assert.equal(findExistingSeasonalAnime([
        { title: '完全不同的新译名', bgmId: '1' }, ...existing,
    ], { titleCn: '完全不同的新译名' }, { id: 42, name: '原題' }), existing[0]);
});

test('seasonal association survives save, export and import despite a renamed local title', () => {
    const record = { titleCn: 'Yuc 译名', titleJp: '原題', schedule: { updateWeekDay: 4 } };
    const imported = buildSeasonalAnime(record, { id: 42, name: '原題', name_cn: '另一译名' }, '202607');
    const saved = normalizeAnimeRecord({ ...imported, title: '自定义名称' });
    const restored = readBackup(createBackup([saved])).records;
    assert.equal(restored[0].yucKey, '202607:原題');
    assert.equal(restored[0].titleJp, '原題');
    assert.equal(findExistingSeasonalAnime(restored, record, null, '202607'), restored[0]);
    const html = renderYucRecords([record], restored, '202607');
    assert.match(html, /data-yuc-add="0" disabled/);
    assert.match(html, /已在待看列表/);
});

test('seasonal title matching uses the Japanese title for previous imports and keeps sequel numbers', () => {
    const records = [{ title: '完全不同译名', titleJp: '原題 第2期', bgmId: '42' }];
    assert.equal(findExistingSeasonalAnime(records, { titleJp: '原題 第2期' }), records[0]);
    assert.equal(findExistingSeasonalAnime(records, { titleJp: '原題 第3期' }), null);
    assert.equal(getSeasonalRecordKey({ titleJp: '原題 第2期' }, '202610'), '202610:原題第2期');
});

test('seasonal association identifies a renamed Yuc title when its stable record key is retained', () => {
    const records = [{ title: '用户别名', yucKey: '202607:原題' }];
    assert.equal(findExistingSeasonalAnime(records, { titleCn: '新版译名', titleJp: '原題' }, null, '202607'), records[0]);
    assert.equal(findExistingSeasonalAnime(records, { titleCn: '新版译名', titleJp: '原題' }, null, '202610'), null);
});

test('adding a seasonal entry updates its button without rerendering or replacing the scrolled list', async () => {
    const { attachYucEvents } = await import('../www/js/events/yuc.js');
    const store = await import('../www/js/store.js');
    const { setRenderer, setState } = store;
    const previous = { fetch: globalThis.fetch, document: globalThis.document, window: globalThis.window, storage: globalThis.localStorage, state: store.state };
    const storage = new Map();
    globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
    const classes = new Set(['btn-primary']);
    const listeners = {};
    const button = {
        dataset: { yucAdd: '0' }, disabled: false, textContent: '加入待看',
        classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
        addEventListener: (type, callback) => { listeners[type] = callback; },
    };
    let listWrites = 0;
    let loaded;
    let renderedHtml = '';
    const ready = new Promise(resolve => { loaded = resolve; });
    const list = {
        scrollTop: 640,
        set innerHTML(value) { renderedHtml = value; listWrites += 1; loaded(); },
        querySelectorAll: () => [button],
    };
    const elements = { yucSeasonList: list, yucSeasonStatus: {} };
    globalThis.document = {
        getElementById: id => elements[id],
        createElement: () => ({ remove() {}, setAttribute() {} }),
        body: { appendChild() {} },
    };
    globalThis.window = { dispatchEvent() {} };
    const record = { titleCn: 'Yuc 中文名', titleJp: '独自原題', schedule: { airDate: '2099-01-03', updateWeekDay: 3 } };
    const subject = { id: 20990142, type: 2, name: '独自原題', name_cn: '另一中文名', date: '2099-01-03' };
    globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('/yuc/season')
        ? { records: [record] }
        : String(url).includes('/search/subjects') ? { data: [subject] } : subject), { status: 200 });
    let renderCount = 0;
    setRenderer(() => { renderCount += 1; });
    setState({ animeList: [], currentPage: 'yucSchedule', yucSeason: '209901' }, { render: false });
    try {
        attachYucEvents();
        await ready;
        assert.match(renderedHtml, /加入待看/);
        await listeners.click();
        assert.equal(renderCount, 0);
        assert.equal(listWrites, 1);
        assert.equal(list.scrollTop, 640);
        assert.equal(button.disabled, true);
        assert.equal(button.textContent, '已在待看列表');
        assert.equal(classes.has('btn-secondary'), true);
        assert.equal(store.state.animeList[0].title, '另一中文名');
        assert.equal(store.state.animeList[0].yucKey, '209901:独自原題');
        assert.match(renderYucRecords([record], store.state.animeList, '209901'), /data-yuc-add="0" disabled/);
    } finally {
        globalThis.fetch = previous.fetch;
        globalThis.document = previous.document;
        globalThis.window = previous.window;
        globalThis.localStorage = previous.storage;
        setState(previous.state, { render: false });
        setRenderer(() => {});
    }
});
