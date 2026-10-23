import test from 'node:test';
import assert from 'node:assert/strict';
import { compareChasingForDisplay } from '../www/js/list-order.js';

test('update order starts with yesterday and moves backwards through the week', () => {
    const now = new Date('2026-08-05T12:00:00'); // 周三
    const records = [
        { title: '周二', updateWeekDay: 2, updatePeriod: '上午', updateTime: '08:00' },
        { title: '周二深夜', updateWeekDay: 2, updatePeriod: '深夜', updateTime: '24:30' },
        { title: '周四晚', updateWeekDay: 4, updatePeriod: '晚间', updateTime: '20:00' },
        { title: '周二下午晚', updateWeekDay: 2, updatePeriod: '下午', updateTime: '16:00' },
        { title: '周二下午早', updateWeekDay: 2, updatePeriod: '下午', updateTime: '13:00' },
        { title: '周一', updateWeekDay: 1, updatePeriod: '上午', updateTime: '09:00' },
    ];
    records.sort((a, b) => compareChasingForDisplay(a, b, 'update', now));
    assert.deepEqual(records.map(record => record.title), [
        '周二深夜', '周二下午晚', '周二下午早', '周二', '周一', '周四晚',
    ]);
});

test('time order keeps the original Monday-to-Sunday ordering', () => {
    const records = [
        { title: '周三', updateWeekDay: 3 },
        { title: '周一', updateWeekDay: 1 },
        { title: '待定', updateWeekDay: 0 },
        { title: '周二', updateWeekDay: 2 },
    ];
    records.sort((a, b) => compareChasingForDisplay(a, b, 'time', new Date('2026-08-05'), 'today'));
    assert.deepEqual(records.map(record => record.title), ['周一', '周二', '周三', '待定']);
});

test('update order uses the selected start day and wraps across week boundaries', () => {
    for (const [start, expected] of [
        ['today', [3, 2, 1, 7, 6, 5, 4, 0]],
        ['yesterday', [2, 1, 7, 6, 5, 4, 3, 0]],
    ]) {
        const records = Array.from({ length: 8 }, (_, day) => ({ title: String(day), updateWeekDay: day }));
        records.sort((a, b) => compareChasingForDisplay(a, b, 'update', new Date(2026, 7, 5, 12), start));
        assert.deepEqual(records.map(record => record.updateWeekDay), expected);
    }

    const records = Array.from({ length: 7 }, (_, day) => ({ title: String(day), updateWeekDay: day + 1 }));
    records.sort((a, b) => compareChasingForDisplay(a, b, 'update', new Date(2026, 7, 3, 12), 'yesterday'));
    assert.deepEqual(records.map(record => record.updateWeekDay), [7, 6, 5, 4, 3, 2, 1]);
});

test('today update order retains later periods and times first, with unknown times last', () => {
    const records = [
        { title: '上午', updateWeekDay: 3, updateTime: '08:00' },
        { title: '晚间早', updateWeekDay: 3, updateTime: '19:00' },
        { title: '未定', updateWeekDay: 3 },
        { title: '深夜', updateWeekDay: 3, updateTime: '24:30' },
        { title: '晚间晚', updateWeekDay: 3, updateTime: '21:30' },
    ];
    records.sort((a, b) => compareChasingForDisplay(a, b, 'update', new Date(2026, 7, 5, 12), 'today'));
    assert.deepEqual(records.map(record => record.title), ['深夜', '晚间晚', '晚间早', '上午', '未定']);
});
