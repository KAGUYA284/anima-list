import test from 'node:test';
import assert from 'node:assert/strict';
import { compareChasingForDisplay } from '../www/js/list-order.js';

test('update order rotates weekdays from today and sorts periods then times', () => {
    const now = new Date('2026-08-05T12:00:00'); // 周三
    const records = [
        { title: '周二', updateWeekDay: 2, updatePeriod: '上午', updateTime: '08:00' },
        { title: '周三深夜', updateWeekDay: 3, updatePeriod: '深夜', updateTime: '24:30' },
        { title: '周四晚', updateWeekDay: 4, updatePeriod: '晚间', updateTime: '20:00' },
        { title: '周三下午晚', updateWeekDay: 3, updatePeriod: '下午', updateTime: '16:00' },
        { title: '周三下午早', updateWeekDay: 3, updatePeriod: '下午', updateTime: '13:00' },
        { title: '周一', updateWeekDay: 1, updatePeriod: '上午', updateTime: '09:00' },
    ];
    records.sort((a, b) => compareChasingForDisplay(a, b, 'update', now));
    assert.deepEqual(records.map(record => record.title), [
        '周三下午早', '周三下午晚', '周三深夜', '周四晚', '周一', '周二',
    ]);
});

test('time order keeps the original Monday-to-Sunday ordering', () => {
    const records = [
        { title: '周三', updateWeekDay: 3 },
        { title: '周一', updateWeekDay: 1 },
        { title: '待定', updateWeekDay: 0 },
        { title: '周二', updateWeekDay: 2 },
    ];
    records.sort((a, b) => compareChasingForDisplay(a, b, 'time', new Date('2026-08-05')));
    assert.deepEqual(records.map(record => record.title), ['周一', '周二', '周三', '待定']);
});
