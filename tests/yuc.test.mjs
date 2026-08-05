import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getYucSeasonList, hasYucSeasonData, yucSeasonLabel, yucSeasonStartDate,
} from '../www/js/yuc.js';

test('Yuc season data starts at October 2019', async () => {
    assert.equal(hasYucSeasonData('201907'), false);
    assert.equal(hasYucSeasonData('2019-09-30'), false);
    assert.equal(hasYucSeasonData('201910'), true);
    assert.equal(hasYucSeasonData('2019-10-01'), true);
    assert.equal(yucSeasonLabel('203510'), '2035年秋番');
    assert.equal(yucSeasonStartDate('202407'), '2024-07-01');
    assert.equal(yucSeasonStartDate('not-a-season'), '');
    assert.deepEqual(await getYucSeasonList('201907'), []);
});
