import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRefreshedMetadata, mergeRemoteAnimeMetadata } from '../www/js/metadata-refresh.js';

function localRecord(overrides = {}) {
    return {
        id: 'metadata-test',
        title: '旧标题',
        totalEpisodes: 12,
        currentEpisode: 8,
        status: 'watching',
        rating: 5,
        review: '保留观后感',
        airDate: '2026-10-01',
        type: 'chasing',
        updateWeekDay: 4,
        updateTime: '22:00',
        updatePeriod: '晚间',
        bgmId: '',
        episodeNotes: { 8: { note: '保留单集笔记', rating: 5 } },
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        ...overrides,
    };
}

test('批量更新合并 Bangumi 与 Yuc 字段并保留用户观看数据', () => {
    const original = localRecord();
    const refreshed = mergeRemoteAnimeMetadata(original, {
        subject: { id: 42, name: '新日文标题', name_cn: '新中文标题', date: '2026-10-03', total_episodes: 24 },
        yuc: { schedule: { airDate: '2026-10-04', updateWeekDay: 7, updateTime: '23:30', updatePeriod: '晚间' } },
    });

    assert.equal(refreshed.title, '新中文标题');
    assert.equal(refreshed.bgmId, '42');
    assert.equal(refreshed.totalEpisodes, 24);
    assert.equal(refreshed.airDate, '2026-10-04');
    assert.equal(refreshed.updateWeekDay, 7);
    assert.equal(refreshed.updateTime, '23:30');
    assert.equal(refreshed.currentEpisode, 8);
    assert.equal(refreshed.status, 'watching');
    assert.equal(refreshed.rating, 5);
    assert.equal(refreshed.review, '保留观后感');
    assert.deepEqual(refreshed.episodeNotes, original.episodeNotes);
});

test('Yuc 预告版未提供具体小时会保留本地更新时间', () => {
    const original = localRecord();
    const refreshed = mergeRemoteAnimeMetadata(original, {
        yuc: { schedule: { airDate: '2026-10-03', updateWeekDay: 6, updateTime: '', updatePeriod: '上午', isPreview: true } },
    });
    assert.equal(refreshed.updateTime, '22:00');
    assert.equal(refreshed.updateWeekDay, 6);
    assert.equal(refreshed.updatePeriod, '上午');
});

test('刷新完成后只把远程字段合并到用户期间编辑过的最新记录', () => {
    const current = localRecord({ currentEpisode: 9, review: '刷新期间修改', episodeNotes: { 9: { note: '新笔记', rating: 4 } } });
    const refreshed = localRecord({ title: '远程新标题', bgmId: '42', totalEpisodes: 24, updateWeekDay: 6 });
    const merged = applyRefreshedMetadata(current, refreshed);
    assert.equal(merged.title, '远程新标题');
    assert.equal(merged.currentEpisode, 9);
    assert.equal(merged.review, '刷新期间修改');
    assert.deepEqual(merged.episodeNotes, current.episodeNotes);
});

test('远程集数减少时不会删除本地较后集数的单集笔记', () => {
    const current = localRecord({ totalEpisodes: 24, episodeNotes: { 24: { note: '最终话笔记', rating: 5 } } });
    const refreshed = localRecord({ totalEpisodes: 12 });
    const merged = applyRefreshedMetadata(current, refreshed);
    assert.equal(merged.totalEpisodes, 24);
    assert.deepEqual(merged.episodeNotes, current.episodeNotes);
});
