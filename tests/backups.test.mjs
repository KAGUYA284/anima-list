import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOperationBackups, saveOperationBackup } from '../www/js/backups.js';
import { addAnime, clearAnimeList, deleteAnime, getAnimeById, restoreLocalBackup, setRenderer, setState, state, undoDeletedAnime, updateAnime } from '../www/js/store.js';

function isolatedStorage(run) {
    const previous = { storage: globalThis.localStorage, window: globalThis.window, state };
    const values = new Map();
    globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
    const events = [];
    globalThis.window = { dispatchEvent: event => events.push(event) };
    setRenderer(() => {});
    setState({ animeList: [] }, { render: false });
    try { run(events); }
    finally {
        globalThis.localStorage = previous.storage;
        globalThis.window = previous.window;
        setState(previous.state, { render: false });
    }
}

test('operation backups keep exactly the newest three nonempty snapshots', () => isolatedStorage(() => {
    for (let i = 1; i <= 5; i++) assert.equal(saveOperationBackup([{ title: `备份${i}` }], `操作${i}`), true);
    assert.deepEqual(loadOperationBackups().map(backup => backup.reason), ['操作5', '操作4', '操作3']);
    saveOperationBackup([], '空列表');
    assert.equal(loadOperationBackups().length, 3);
}));

test('clear and cloud/import replacement backups can restore ratings, notes, dates and metadata', () => isolatedStorage(() => {
    addAnime({ title: '保留记录', totalEpisodes: 12, currentEpisode: 8, rating: 5, episodeNotes: { 8: { note: '感想', rating: 5, watchedAt: '2026-10-23T10:00:00.000Z' } }, metadata: { summary: '简介', coverUrl: 'https://example.test/a.jpg' } });
    const id = state.animeList[0].id;
    assert.equal(clearAnimeList(), true);
    const backup = loadOperationBackups()[0];
    assert.equal(restoreLocalBackup(backup.id), true);
    assert.equal(getAnimeById(id).episodeNotes[8].watchedAt, '2026-10-23T10:00:00.000Z');
    assert.equal(getAnimeById(id).episodeNotes[8].note, '感想');
    assert.equal(getAnimeById(id).metadata.summary, '简介');
    assert.equal(getAnimeById(id).rating, 5);
}));

test('delete undo restores only the deleted anime and preserves changes made meanwhile', () => isolatedStorage(events => {
    addAnime({ title: '可撤销', bgmId: '100' });
    const deletedId = state.animeList[0].id;
    addAnime({ title: '继续编辑', totalEpisodes: 12 });
    const remainingId = state.animeList[1].id;
    deleteAnime(deletedId);
    const token = events.find(event => event.type === 'anime-deleted').detail.token;
    updateAnime(remainingId, { currentEpisode: 2 });
    assert.equal(undoDeletedAnime(token), true);
    assert.equal(getAnimeById(deletedId).title, '可撤销');
    assert.equal(getAnimeById(remainingId).currentEpisode, 2);
    assert.equal(undoDeletedAnime(token), false);
}));

test('progress increases stamp only newly watched episodes and preserve previous watch times', () => isolatedStorage(() => {
    addAnime({ title: '历史观看', totalEpisodes: 12, currentEpisode: 2, episodeNotes: { 2: { watchedAt: '2025-01-01T02:00:00.000Z' } } });
    const id = state.animeList[0].id;
    assert.equal(getAnimeById(id).episodeNotes[1], undefined);
    updateAnime(id, { currentEpisode: 4 });
    assert.equal(getAnimeById(id).episodeNotes[2].watchedAt, '2025-01-01T02:00:00.000Z');
    assert.ok(getAnimeById(id).episodeNotes[3].watchedAt);
    assert.ok(getAnimeById(id).episodeNotes[4].watchedAt);
    const timestamp = getAnimeById(id).episodeNotes[4].watchedAt;
    updateAnime(id, { currentEpisode: 3 });
    updateAnime(id, { currentEpisode: 4 });
    assert.equal(getAnimeById(id).episodeNotes[4].watchedAt, timestamp);
}));
