import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, normalizeAnimeRecord, readBackup } from '../www/js/data.js';

test('normalizeAnimeRecord constrains untrusted fields', () => {
    const record = normalizeAnimeRecord({
        title: '<img src=x onerror=alert(1)>',
        totalEpisodes: 12,
        currentEpisode: 99,
        status: 'not-valid',
        type: 'not-valid',
        rating: 99,
        bgmId: '12<script>',
        episodeNotes: { 1: { note: 'ok', rating: 9 }, 99: { note: 'outside' } },
    });
    assert.equal(record.currentEpisode, 12);
    assert.equal(record.status, 'watching');
    assert.equal(record.type, 'chasing');
    assert.equal(record.rating, 5);
    assert.equal(record.bgmId, '');
    assert.deepEqual(record.episodeNotes, { 1: { note: 'ok', rating: 5 } });
});

test('normalizeAnimeRecord rejects calendar dates that JavaScript would roll over', () => {
    const record = normalizeAnimeRecord({ title: 'A', airDate: '2026-02-31', startDate: '2026-02-28' });
    assert.equal(record.airDate, '');
    assert.equal(record.startDate, '2026-02-28');
});

test('normalizeAnimeRecord preserves a manually selected chasing update weekday', () => {
    const record = normalizeAnimeRecord({
        title: 'Manual weekday',
        type: 'chasing',
        airDate: '2026-07-01',
        updateWeekDay: 6,
        updateTime: '25:30',
    });
    assert.equal(record.updateWeekDay, 6);
    assert.equal(record.updateTime, '25:30');
    assert.equal(normalizeAnimeRecord({ title: 'Invalid time', updateTime: '30:10' }).updateTime, '');
});

test('readBackup supports legacy arrays and rejects invalid entries with a report', () => {
    const { records, errors } = readBackup([{ title: 'A' }, null, { title: '' }]);
    assert.equal(records.length, 1);
    assert.equal(errors.length, 2);
});

test('createBackup emits a versioned portable envelope', () => {
    const backup = createBackup([{ title: 'A' }]);
    assert.equal(backup.schemaVersion, 2);
    assert.equal(backup.appVersion, '1.3.1');
    assert.equal(backup.records[0].title, 'A');
    assert.ok(backup.exportedAt);
});

test('portable records retain watch timestamps and text metadata while rejecting unsafe image URLs', () => {
    const record = normalizeAnimeRecord({ title: '离线作品', totalEpisodes: 12, episodeNotes: { 1: { watchedAt: '2026-10-23T18:30:00+08:00' } }, metadata: { summary: '简介', coverUrl: 'javascript:alert(1)', thumbnailUrl: 'https://example.test/cover.jpg', staff: { director: '导演' }, updatedAt: '2026-10-23T10:00:00.000Z' } });
    const restored = readBackup(createBackup([record])).records[0];
    assert.equal(restored.episodeNotes[1].watchedAt, '2026-10-23T10:30:00.000Z');
    assert.equal(restored.metadata.summary, '简介');
    assert.equal(restored.metadata.coverUrl, '');
    assert.equal(restored.metadata.staff.director, '导演');
});
