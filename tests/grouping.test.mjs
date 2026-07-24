import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroups, buildFilteredData, getAnimeGroup, mergeImport } from '../www/js/grouping.js';

test('buildGroups 按番剧播出日期归入年/季', () => {
    const groups = buildGroups([
        { title: 'A', type: 'chasing', airDate: '2024-04-10' },
        { title: 'B', type: 'chasing', airDate: '2024-07-05' },
    ]);
    assert.deepEqual(Object.keys(groups).sort(), ['2024']);
    assert.equal(groups['2024']['春'].length, 1);
    assert.equal(groups['2024']['夏'].length, 1);
});

test('buildGroups 跨季边界：季末最后一周归入下一季', () => {
    // 冬季边界 lastWeekDay=25，1/2/3 月；3 月 25 日及以后归入“春”
    const groups = buildGroups([
        { title: '早', type: 'chasing', airDate: '2024-03-24' },
        { title: '晚', type: 'chasing', airDate: '2024-03-26' },
    ]);
    assert.equal(groups['2024']['冬'][0].title, '早');
    assert.equal(groups['2024']['春'][0].title, '晚');
});

test('buildGroups 秋季末跨年归入次年冬季', () => {
    // 秋季 lastWeekDay=25，next=冬，nextYearOffset=1
    const groups = buildGroups([
        { title: '跨年', type: 'chasing', airDate: '2024-12-30' },
    ]);
    assert.equal(groups['2025']['冬'][0].title, '跨年');
});

test('buildGroups 补番按月份粗分季，无日期归入未分类', () => {
    const groups = buildGroups([
        { title: '补', type: 'binge', startDate: '2023-08-01' },
        { title: '无', type: 'chasing', airDate: '' },
    ]);
    assert.equal(groups['2023']['夏'][0].title, '补');
    assert.equal(groups['未分类'][''][0].title, '无');
});

test('追番在播出期间随系统时间跨季，完结后回到首播季度', () => {
    const anime = {
        title: '跨季追番',
        type: 'chasing',
        status: 'watching',
        airDate: '2026-04-08',
        totalEpisodes: 24,
    };
    assert.deepEqual(getAnimeGroup(anime, new Date('2026-05-15T12:00:00')), {
        year: '2026',
        quarter: '春',
    });
    assert.deepEqual(getAnimeGroup(anime, new Date('2026-07-15T12:00:00')), {
        year: '2026',
        quarter: '夏',
    });
    assert.deepEqual(getAnimeGroup(
        { ...anime, status: 'completed' },
        new Date('2026-07-15T12:00:00'),
    ), {
        year: '2026',
        quarter: '春',
    });
});

test('追番的动态季度不超过末集播出季度', () => {
    assert.deepEqual(getAnimeGroup({
        type: 'chasing',
        status: 'watching',
        airDate: '2026-04-08',
        totalEpisodes: 24,
    }, new Date('2027-02-01T12:00:00')), {
        year: '2026',
        quarter: '夏',
    });
});

test('补番在观看中随系统季度移动，看完后按看完日期归档', () => {
    const anime = {
        type: 'binge',
        status: 'watching',
        airDate: '2020-01-10',
        startDate: '2026-05-01',
    };
    assert.deepEqual(getAnimeGroup(anime, new Date('2026-05-15T12:00:00')), {
        year: '2026',
        quarter: '春',
    });
    assert.deepEqual(getAnimeGroup(anime, new Date('2026-07-15T12:00:00')), {
        year: '2026',
        quarter: '夏',
    });
    assert.deepEqual(getAnimeGroup({
        ...anime,
        status: 'completed',
        completedDate: '2026-10-02',
    }), {
        year: '2026',
        quarter: '秋',
    });
});

test('想看和搁置均按首播季度归档', () => {
    const records = [
        { title: '想看补番', type: 'binge', status: 'want', airDate: '2024-04-12', startDate: '2026-07-01' },
        { title: '搁置追番', type: 'chasing', status: 'paused', airDate: '2024-04-12', totalEpisodes: 24 },
    ];
    const groups = buildGroups(records, new Date('2026-10-01T12:00:00'));
    assert.deepEqual(groups['2024']['春'].map(item => item.title), ['想看补番', '搁置追番']);
});

test('buildFilteredData 仅返回选中年份/季度的番剧', () => {
    const list = [
        { title: 'A', type: 'chasing', airDate: '2024-04-10' },
        { title: 'B', type: 'chasing', airDate: '2024-07-05' },
    ];
    const selected = buildFilteredData(
        { '2024': { quarters: { 春: true, 夏: false } } },
        list,
    );
    assert.deepEqual(selected.map(a => a.title), ['A']);
});

test('mergeImport 以 bgmId 优先、标题兜底作为合并键', () => {
    const local = [
        { bgmId: 1, title: '本地1' },
        { title: '仅标题' },
    ];
    const imported = [
        { bgmId: 1, title: '导入覆盖1' },
        { title: '  仅标题  ' },
        { bgmId: 2, title: '新增' },
    ];
    const { merged, localCount, importedCount } = mergeImport(local, imported);
    assert.equal(localCount, 2);
    assert.equal(importedCount, 3);
    // bgm:1 被导入覆盖；title:仅标题 归一化后去重；bgm:2 新增
    assert.equal(merged.length, 3);
    assert.equal(merged.find(x => x.bgmId === 1).title, '导入覆盖1');
    assert.equal(merged.find(x => x.title === '  仅标题  ') !== undefined, true);
    assert.equal(merged.some(x => x.bgmId === 2), true);
});
