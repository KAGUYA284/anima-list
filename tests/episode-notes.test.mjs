import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage ||= { getItem: () => null, setItem() {} };
const store = await import('../www/js/store.js');
const { addAnime, getAnimeById, setRenderer, updateAnime } = store;
const { attachEpisodeNotes, watchedAtToLocalInput, localInputToWatchedAt } = await import('../www/js/episode-notes.js');

function element(extra = {}) {
    const listeners = {};
    const classes = new Set();
    return {
        dataset: {}, style: {},
        classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } },
        setAttribute(name, value) { this[name] = value; },
        addEventListener(name, callback) { listeners[name] = callback; },
        fire(name) { listeners[name]?.(); },
        ...extra,
    };
}

test('episode notes save in place, grow and shrink, and preserve other episode changes', () => {
    addAnime({ title: '单集测试', totalEpisodes: 3, episodeNotes: { 1: { note: '旧记录', rating: 3 } } });
    const id = store.state.animeList.at(-1).id;
    let renders = 0;
    setRenderer(() => { renders += 1; });
    const input = element({ value: '旧记录', scrollHeight: 34, clientHeight: 34, offsetHeight: 36 });
    const stars = [1, 2, 3, 4, 5].map(rating => element({ dataset: { episodeRating: String(rating) } }));
    const row = element({
        dataset: { ep: '1' },
        querySelector: selector => selector === '.ep-note-input' ? input : null,
        querySelectorAll: () => stars,
    });
    const section = element({ open: true });
    const container = {
        querySelectorAll: selector => selector === '[data-ep]' ? [row] : [input],
        closest: () => section,
    };
    attachEpisodeNotes(container, id);
    assert.equal(input.style.height, '36px');
    updateAnime(id, { episodeNotes: { ...getAnimeById(id).episodeNotes, 2: { note: '另一次修改', rating: 5 } } }, { render: false });
    input.value = '多行\n长记录\n新增内容';
    input.scrollHeight = 100;
    input.fire('input');
    assert.equal(input.style.height, '102px');
    assert.equal(getAnimeById(id).episodeNotes[1].rating, 3);
    assert.equal(getAnimeById(id).episodeNotes[2].note, '另一次修改');
    stars[4].fire('click');
    assert.equal(getAnimeById(id).episodeNotes[1].rating, 5);
    assert.equal(stars[4]['aria-pressed'], 'true');
    stars[4].fire('click');
    assert.equal(getAnimeById(id).episodeNotes[1].rating, 0);
    input.value = '';
    input.scrollHeight = 34;
    input.fire('input');
    assert.equal(input.style.height, '36px');
    assert.equal(getAnimeById(id).episodeNotes[1], undefined);
    assert.equal(renders, 0);
});

test('watch time round-trips in local time and rejects impossible calendar dates', () => {
    const iso = new Date(2026, 9, 23, 21, 30).toISOString();
    assert.equal(watchedAtToLocalInput(iso), '2026-10-23T21:30');
    assert.equal(localInputToWatchedAt('2026-10-23T21:30'), iso);
    assert.equal(watchedAtToLocalInput('bad-date'), '');
    assert.equal(watchedAtToLocalInput(''), '');
    assert.equal(localInputToWatchedAt('2026-02-30T21:30'), '');
    assert.equal(localInputToWatchedAt('2026-10-23'), '');
    assert.equal(localInputToWatchedAt(''), '');
});

test('watch time edits retain notes and ratings, and note/rating edits retain watch time', () => {
    const watchedAt = new Date(2026, 9, 22, 20).toISOString();
    addAnime({ title: '观看时间测试', totalEpisodes: 2, episodeNotes: { 1: { note: '保留笔记', rating: 3, watchedAt } } });
    const id = store.state.animeList.at(-1).id;
    const input = element({ value: '保留笔记', scrollHeight: 34, clientHeight: 34, offsetHeight: 36 });
    const timeInput = element({ value: '2026-10-23T21:30', setCustomValidity() {}, reportValidity() {} });
    const hint = element({ textContent: '' });
    const stars = [1, 2, 3, 4, 5].map(rating => element({ dataset: { episodeRating: String(rating) } }));
    const row = element({
        dataset: { ep: '1' },
        querySelector: selector => ({ '.ep-note-input': input, '[data-episode-watched-at]': timeInput, '.ep-watched-at-hint': hint })[selector],
        querySelectorAll: () => stars,
    });
    attachEpisodeNotes({
        querySelectorAll: selector => selector === '[data-ep]' ? [row] : [input],
        closest: () => null,
    }, id);

    timeInput.fire('change');
    const expected = new Date(2026, 9, 23, 21, 30).toISOString();
    assert.deepEqual(getAnimeById(id).episodeNotes[1], { note: '保留笔记', rating: 3, watchedAt: expected });
    input.value = '更新笔记';
    input.fire('input');
    stars[4].fire('click');
    assert.deepEqual(getAnimeById(id).episodeNotes[1], { note: '更新笔记', rating: 5, watchedAt: expected });

    timeInput.value = '';
    timeInput.fire('change');
    assert.equal(hint.textContent, '待补充');
    assert.equal(getAnimeById(id).episodeNotes[1].note, '更新笔记');
    assert.equal(getAnimeById(id).episodeNotes[1].rating, 5);
    assert.equal(getAnimeById(id).episodeNotes[1].watchedAt || '', '');
});

test('jump to current episode opens a collapsed section and scrolls to the watched episode', () => {
    addAnime({ title: '跳转测试', totalEpisodes: 12, currentEpisode: 3 });
    const id = store.state.animeList.at(-1).id;
    const section = element({ open: false });
    const jumpButton = element();
    let scrolled = false;
    const target = { scrollIntoView(options) { scrolled = true; assert.equal(options.block, 'center'); } };
    attachEpisodeNotes({
        closest: () => section,
        querySelectorAll: () => [],
        querySelector: selector => selector === '[data-ep="3"]' ? target : null,
    }, id, { jumpButton });
    jumpButton.fire('click');
    assert.equal(section.open, true);
    assert.equal(scrolled, true);
});

test('episode records show only watched episodes and leave old unknown watch times blank', async () => {
    const { renderEpisodeNotes } = await import('../www/js/renderer/detail.js');
    const html = renderEpisodeNotes({
        currentEpisode: 2, totalEpisodes: 12,
        episodeNotes: { 1: { note: '历史记录', rating: 4 }, 3: { note: '保留但隐藏' } },
    });
    assert.match(html, /data-ep="1"/);
    assert.match(html, /data-ep="2"/);
    assert.doesNotMatch(html, /data-ep="3"/);
    assert.doesNotMatch(html, /保留但隐藏/);
    assert.match(html, /data-episode-watched-at value=""/);
    assert.match(html, /待补充/);
    assert.match(renderEpisodeNotes({ currentEpisode: 0, totalEpisodes: 12 }), /还没有观看记录/);
});
