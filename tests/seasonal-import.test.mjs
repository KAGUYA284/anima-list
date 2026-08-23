import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonalAnime, findExistingSeasonalAnime } from '../www/js/seasonal-import.js';

test('seasonal imports use canonical Bangumi metadata while retaining Yuc schedule fields', () => {
    const record = {
        titleCn: '译名不同',
        titleJp: '原題',
        schedule: { airDate: '2026-07-02', updateWeekDay: 4, updateTime: '23:30', updatePeriod: '晚间' },
    };
    const anime = buildSeasonalAnime(record, {
        id: 42, name: '原題', name_cn: 'Bangumi 中文名', date: '2026-07-03', total_episodes: 24,
    }, '202607');
    assert.deepEqual(anime, {
        title: 'Bangumi 中文名', totalEpisodes: 24, currentEpisode: 0, status: 'want', type: 'chasing',
        airDate: '2026-07-03', updateWeekDay: 4, updateTime: '23:30', updatePeriod: '晚间', bgmId: '42',
    });
});

test('seasonal duplicate detection prioritizes Bangumi ID across different titles', () => {
    const existing = [{ title: '旧译名', bgmId: '42' }];
    const duplicate = findExistingSeasonalAnime(existing, { titleCn: '完全不同的新译名' }, { id: 42, name: '原題' });
    assert.equal(duplicate, existing[0]);
});
