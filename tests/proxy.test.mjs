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
