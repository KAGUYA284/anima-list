import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addAnime, clearAnimeList, DEFAULT_SETTINGS, getAnimeById, getCurrentAnime, setRenderer, setState, state, updateAnime,
} from '../www/js/store.js';

test('fresh settings default to cover mode and do not expose an update source', () => {
    assert.equal(DEFAULT_SETTINGS.listStyle, 'cover');
    assert.equal(DEFAULT_SETTINGS.listOrder, 'time');
    assert.equal(Object.hasOwn(DEFAULT_SETTINGS, 'updateSource'), false);
});

test('the detail selection is derived from currentAnimeId and each update renders once', () => {
    let renderCount = 0;
    setRenderer(() => { renderCount += 1; });

    assert.equal(addAnime({ title: 'State test', totalEpisodes: 12 }), true);
    const id = state.animeList.at(-1).id;
    setState({ currentAnimeId: id, currentPage: 'detail' });
    const beforeUpdate = renderCount;

    assert.equal(updateAnime(id, { review: 'latest' }), true);
    assert.equal(renderCount, beforeUpdate + 1);
    assert.equal(getCurrentAnime().review, 'latest');
    assert.equal(state.currentAnimeId, id);
    assert.equal(localStorage.getItem('ANIMA_LOCAL_DIRTY'), 'true');
    assert.ok(Number(localStorage.getItem('ANIMA_LAST_UPDATED')) > 0);
});

test('binge completion dates are recorded and cleared with completion state', () => {
    assert.equal(addAnime({
        title: 'Completion date test',
        type: 'binge',
        totalEpisodes: 12,
        currentEpisode: 12,
        status: 'completed',
    }), true);
    const id = state.animeList.at(-1).id;
    const today = new Date();
    const expectedDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
    ].join('-');
    assert.equal(getAnimeById(id).completedDate, expectedDate);

    assert.equal(updateAnime(id, { currentEpisode: 11, status: 'watching' }), true);
    assert.equal(getAnimeById(id).completedDate, '');
});

test('adding from the seasonal schedule can preserve the current page', () => {
    setState({ currentPage: 'yucSchedule' });
    assert.equal(addAnime({
        title: 'Season schedule test',
        type: 'chasing',
        status: 'want',
        bgmId: '12345',
    }, { navigate: false }), true);
    assert.equal(state.currentPage, 'yucSchedule');
    assert.equal(state.animeList.at(-1).bgmId, '12345');
});

test('clearing the anime list removes every record and stays in settings', () => {
    assert.equal(addAnime({ title: 'Clear me', totalEpisodes: 1 }), true);
    assert.equal(clearAnimeList(), true);
    assert.equal(state.animeList.length, 0);
    assert.equal(state.currentPage, 'settings');
});
