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

test('readBackup supports legacy arrays and rejects invalid entries with a report', () => {
    const { records, errors } = readBackup([{ title: 'A' }, null, { title: '' }]);
    assert.equal(records.length, 1);
    assert.equal(errors.length, 2);
});

test('createBackup emits a versioned portable envelope', () => {
    const backup = createBackup([{ title: 'A' }]);
    assert.equal(backup.schemaVersion, 2);
    assert.equal(backup.appVersion, '1.1.0');
    assert.equal(backup.records[0].title, 'A');
    assert.ok(backup.exportedAt);
});
