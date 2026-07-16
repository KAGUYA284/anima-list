import test from 'node:test';
import assert from 'node:assert/strict';
import { escHtml, safeImageUrl } from '../www/js/utils.js';

test('escHtml makes untrusted text safe in HTML text and attributes', () => {
    assert.equal(
        escHtml('<img src="x" onerror=\'alert(1)\'>&'),
        '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;',
    );
});

test('safeImageUrl only accepts HTTPS image URLs', () => {
    assert.equal(safeImageUrl('javascript:alert(1)'), '');
    assert.equal(safeImageUrl('data:image/png;base64,AAAA'), '');
    assert.equal(safeImageUrl('http://example.test/image.png'), '');
    assert.equal(safeImageUrl('https://example.test/image.png'), 'https://example.test/image.png');
});
