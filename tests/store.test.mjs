import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addAnime, getCurrentAnime, setRenderer, setState, state, updateAnime,
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
