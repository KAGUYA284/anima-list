import test from 'node:test';
import assert from 'node:assert/strict';
import { changeProgress, classifySeason, deriveStatus, extractAnimationStudio, getReminderItems } from '../www/js/core.js';

test('deriveStatus follows progress boundaries', () => {
    assert.equal(deriveStatus(0, 12, 'watching'), 'want');
    assert.equal(deriveStatus(1, 12, 'want'), 'watching');
    assert.equal(deriveStatus(12, 12, 'watching'), 'completed');
    assert.equal(deriveStatus(3, 12, 'paused'), 'paused');
});

test('changeProgress clamps progress and reopens completed records', () => {
    assert.deepEqual(changeProgress({ currentEpisode: 12, totalEpisodes: 12, status: 'completed' }, -1), {
        currentEpisode: 11,
        status: 'watching',
    });
    assert.deepEqual(changeProgress({ currentEpisode: 11, totalEpisodes: 12, status: 'watching' }, 5), {
        currentEpisode: 12,
        status: 'completed',
    });
});

test('classifySeason handles Japanese season boundary and binge calendar quarter', () => {
    assert.deepEqual(classifySeason('2026-03-24', 'chasing'), { year: '2026', quarter: '冬' });
    assert.deepEqual(classifySeason('2026-03-25', 'chasing'), { year: '2026', quarter: '春' });
    assert.deepEqual(classifySeason('2026-12-25', 'chasing'), { year: '2027', quarter: '冬' });
    assert.deepEqual(classifySeason('2026-12-25', 'binge'), { year: '2026', quarter: '秋' });
    assert.deepEqual(classifySeason('', 'chasing'), { year: '未分类', quarter: '' });
});

test('getReminderItems separates today chasing and active binge records', () => {
    const list = [
        { status: 'watching', type: 'chasing', updateWeekDay: 4 },
        { status: 'watching', type: 'binge' },
        { status: 'completed', type: 'chasing', updateWeekDay: 4 },
    ];
    const result = getReminderItems(list, 4);
    assert.equal(result.today.length, 1);
    assert.equal(result.binge.length, 1);
});

test('extractAnimationStudio prefers the animation studio relation and never uses the original author', () => {
    const persons = [
        { name: '理不尽な孫の手', relation: '原作' },
        { name: 'スタジオバインド', relation: '动画制作' },
    ];
    assert.equal(extractAnimationStudio(persons, []), 'スタジオバインド');
    assert.equal(extractAnimationStudio([], [
        { key: '原作', value: '理不尽な孫の手' },
        { key: '动画制作', value: [{ v: 'Studio Bind' }] },
    ]), 'Studio Bind');
    assert.equal(extractAnimationStudio([], [{ key: '原作', value: '理不尽な孫の手' }]), '');
});
