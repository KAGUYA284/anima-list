import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addAnime, getAnimeById, getCurrentAnime, setRenderer, setState, state, updateAnime,
} from '../www/js/store.js';

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
