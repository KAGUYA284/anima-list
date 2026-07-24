import test from 'node:test';
import assert from 'node:assert/strict';
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
