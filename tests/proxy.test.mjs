import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _test } = require('../scf_bangumi_proxy.js');

test('image proxy only accepts HTTPS Bangumi picture paths', () => {
    assert.equal(
        _test.getAllowedImageUrl({ queryString: { url: 'https://lain.bgm.tv/r/800/pic/cover/l/example.jpg' } }).hostname,
        'lain.bgm.tv',
    );
    assert.equal(_test.getAllowedImageUrl({ queryString: { url: 'http://lain.bgm.tv/pic/a.jpg' } }), null);
    assert.equal(_test.getAllowedImageUrl({ queryString: { url: 'https://example.test/pic/a.jpg' } }), null);
    assert.equal(_test.getAllowedImageUrl({ queryString: { url: 'https://lain.bgm.tv/private/a.jpg' } }), null);
});

test('proxy permits the subject persons endpoint used for animation studios', () => {
    assert.equal(_test.isAllowedRequest('GET', '/v0/subjects/501963/persons'), true);
    assert.equal(_test.isAllowedRequest('GET', '/v0/subjects/501963/private'), false);
});

test('SCF source remains parseable by the configured legacy-compatible runtime', () => {
    const source = readFileSync(new URL('../scf_bangumi_proxy.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\?\.(?!\.)|\?\?|\.at\(|\.matchAll\(/);
});

test('SCF maps the legacy Bangumi search response to the v0 shape', async () => {
    const requests = [];
    const requester = async request => {
        requests.push(request);
        if (requests.length === 1) return { statusCode: 502, body: 'Bad Gateway' };
        return {
            statusCode: 200,
            body: JSON.stringify({
                list: [{
                    id: 42, type: 2, name: '対象作品', name_cn: '目标作品', air_date: '2026-10-03',
                    images: { large: 'http://lain.bgm.tv/pic/cover/l/example.jpg' },
                }],
            }),
        };
    };
    const response = await _test.proxyBangumiSearch(JSON.stringify({ keyword: '対象作品', limit: 8 }), '', requester);
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(requests[0].path, '/v0/search/subjects');
    assert.equal(requests[1].path, '/search/subject/%E5%AF%BE%E8%B1%A1%E4%BD%9C%E5%93%81?type=2&responseGroup=small');
    assert.equal(payload.fallback, 'legacy-search');
    assert.deepEqual(payload.data[0], {
        id: 42,
        type: 2,
        name: '対象作品',
        name_cn: '目标作品',
        summary: '',
        date: '2026-10-03',
        images: {
            large: 'https://lain.bgm.tv/pic/cover/l/example.jpg',
            common: '', medium: '', small: '', grid: '',
        },
    });
});

test('binaryResponse 以 base64 承载并显式声明 X-Encoding 头', () => {
    const res = _test.binaryResponse(200, Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg', 'https://app.example');
    assert.equal(res.isBase64Encoded, true);
    assert.equal(res.headers['X-Encoding'], 'base64');
    assert.equal(res.headers['Content-Type'], 'image/jpeg');
    assert.equal(res.body, Buffer.from([0xff, 0xd8, 0xff]).toString('base64'));
    // 跨域时必须允许前端读取 X-Encoding
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://app.example');
    assert.equal(res.headers['Access-Control-Expose-Headers'], 'X-Encoding');
});

test('binaryResponse 无 Origin 时不下发 CORS 头', () => {
    const res = _test.binaryResponse(200, Buffer.from([0x89, 0x50]), 'image/png');
    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(res.headers['X-Encoding'], 'base64');
});

test('Yuc 季度页解析并通过封面映射播出时间与制作信息', () => {
    const cover = 'http://i0.hdslb.com/bfs/new_dyn/example.jpg';
    const html = `
        <div><table class="date_"><tr><td class="date2">周四 (木)</td></tr></table></div>
        <div style="float:left"><div class="div_date">
            <p class="imgtext4">22:00~</p><p class="imgep">7/2~</p>
            <a href="${cover}"><img src="${cover}"></a>
        </div><div><div class="table-container"><table width="120px"><tbody>
            <tr><td class="date_title1">BanG Dream!<br>YUME∞MITA</td></tr>
        </tbody></table></div></div></div>
        <a href="${cover}"><img src="${cover}"></a>
        <div class="table-container"><table width="500px"><tbody><tr>
            <td class="title_main_r"><p class="title_cn_r1">BanG Dream! YUME∞MITA</p>
            <p class="title_jp_r">バンドリ！ ゆめ∞みた</p></td></tr><tr>
            <td class="staff_r2">原作：Bushiroad<br>导演：梅津朋美<br>副导演：森田纮吏<br>
            编剧：后藤绿<br>人物设计：信泽収&amp;mochipuyo<br>
            动画人设：茶之原拓也&amp;八森优香<br>动画制作：NICHICALINE</td>
            <td><p class="broadcast_r">7/2周四深夜</p></td>
        </tr></tbody></table></div>`;

    const records = _test.parseYucPage(html, '202607');
    assert.equal(records.length, 1);
    assert.equal(records[0].title, 'BanG Dream! YUME∞MITA');
    assert.equal(records[0].imageUrl, 'https://i0.hdslb.com/bfs/new_dyn/example.jpg');
    assert.equal(records[0].schedule.airDate, '2026-07-02');
    assert.equal(records[0].schedule.updateWeekDay, 4);
    assert.equal(records[0].schedule.updateTime, '22:00');
    assert.equal(records[0].schedule.updatePeriod, '深夜');
    assert.equal(records[0].schedule.isPreview, false);
    assert.deepEqual(records[0].staff, {
        originalWork: 'Bushiroad',
        director: '梅津朋美',
        assistantDirector: '森田纮吏',
        seriesComposition: '后藤绿',
        characterDesign: '信泽収&mochipuyo',
        animationCharacterDesign: '茶之原拓也&八森优香',
        animationStudio: 'NICHICALINE',
    });
    assert.equal(_test.matchYucAnime(records, ['バンドリ！ ゆめ∞みた']), records[0]);
});

test('Yuc 预告版只有介绍卡片时仍生成季度记录', () => {
    const html = `
        <div style="float:left"><img src="http://i0.hdslb.com/preview.jpg"></div>
        <div><table width="500px"><tbody><tr>
            <td class="title_main_r"><p class="title_cn_r1">预告版作品</p>
            <p class="title_jp_r">予告版作品</p></td></tr><tr>
            <td class="staff_r2">导演：测试导演<br>动画制作：测试制作</td>
            <td><p class="broadcast_r">10/3周六早间</p></td>
        </tr></tbody></table></div>`;

    const records = _test.parseYucPage(html, '202610');
    assert.equal(records.length, 1);
    assert.equal(records[0].title, '预告版作品');
    assert.equal(records[0].titleJp, '予告版作品');
    assert.equal(records[0].imageUrl, 'https://i0.hdslb.com/preview.jpg');
    assert.equal(records[0].schedule.airDate, '2026-10-03');
    assert.equal(records[0].schedule.updateWeekDay, 6);
    assert.equal(records[0].schedule.updatePeriod, '上午');
    assert.equal(records[0].schedule.updateTime, '');
    assert.equal(records[0].schedule.isPreview, true);
});

test('Yuc 季度路径由首播日期确定', () => {
    assert.equal(_test.yucSeasonFromDate('2026-08-05'), '202607');
    assert.equal(_test.yucSeasonFromDate('2026-01-03'), '202601');
});

test('Yuc 播出时间可以映射到具体时段', () => {
    assert.equal(_test.updatePeriodFromTime('04:30'), '深夜');
    assert.equal(_test.updatePeriodFromTime('09:00'), '上午');
    assert.equal(_test.updatePeriodFromTime('15:00'), '下午');
    assert.equal(_test.updatePeriodFromTime('22:00'), '晚间');
    assert.equal(_test.updatePeriodFromBroadcast('7/2周四深夜'), '深夜');
});

test('Yuc 连续播出条目继承页面星期分组', () => {
    const html = `
        <table class="date_"><tr><td class="date2">周五 (金)</td></tr></table>
        <div style="float:left"><div class="div_date">
            <p class="imgtext5">23:30~</p><p class="imgep">(全24话)</p>
            <img data-src="https://i0.hdslb.com/ongoing.jpg">
        </div><div><table><tr><td class="date_title">连续播出作品</td></tr></table></div></div>`;
    const records = _test.parseYucPage(html, '202607');
    assert.equal(records.length, 1);
    assert.equal(records[0].schedule.airDate, '');
    assert.equal(records[0].schedule.updateWeekDay, 5);
});
