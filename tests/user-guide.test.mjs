import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderUserGuideMarkdown } from '../www/js/user-guide-markdown.js';

globalThis.localStorage ||= { getItem: () => null, setItem() {} };
const store = await import('../www/js/store.js');
const { initializeUserGuide, openUserGuide, closeUserGuide } = await import('../www/js/user-guide.js');
const markdown = readFileSync(new URL('../docs/软件使用说明.md', import.meta.url), 'utf8');

test('the actual user guide has 15 linked chapters and a collapsed directory', () => {
    const { body, directory } = renderUserGuideMarkdown(markdown);
    const targets = [...directory.matchAll(/data-guide-target="([^"]+)"/g)].map(match => match[1]);
    assert.equal(targets.length, 15);
    assert.equal(new Set(targets).size, 15);
    for (const target of targets) assert.ok(body.includes(`id="${target}"`));
    assert.match(directory, /<details class="user-guide-toc">/);
    assert.doesNotMatch(directory, /<details[^>]*\bopen(?:\s|=|>)/);
    assert.doesNotMatch(body, /<h1\b/);
});

test('guide markdown renders tables and lists while escaping untrusted HTML everywhere', () => {
    const { body, directory } = renderUserGuideMarkdown([
        '## <img src=x onerror=alert(1)>', '',
        '| 名称 | 用途 |', '| --- | --- |', '| **加粗** | `<script>` |', '',
        '- 列表 <b>文本</b>', '- 第二项', '',
        '1. 步骤一', '2. 步骤二', '',
        '正文 <script>alert(1)</script> 和 **<em>强调</em>**。',
    ].join('\n'));
    assert.match(body, /<table><thead><tr><th scope="col">名称<\/th>/);
    assert.match(body, /<td><strong>加粗<\/strong><\/td><td><code>&lt;script&gt;<\/code><\/td>/);
    assert.match(body, /<ul><li>列表 &lt;b&gt;文本&lt;\/b&gt;<\/li><li>第二项<\/li><\/ul>/);
    assert.match(body, /<ol><li>步骤一<\/li><li>步骤二<\/li><\/ol>/);
    assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(body, /<strong>&lt;em&gt;强调&lt;\/em&gt;<\/strong>/);
    assert.match(directory, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(body + directory, /<(?:img|script|em|b)\b/);
});

function fakeDocument() {
    const overlays = [];
    const documentListeners = new Map();
    const doc = {
        overlays,
        activeElement: null,
        addEventListener: (name, callback) => documentListeners.set(name, callback),
        removeEventListener: (name, callback) => {
            if (documentListeners.get(name) === callback) documentListeners.delete(name);
        },
        body: { style: { overflow: 'auto' }, appendChild: overlay => overlays.push(overlay) },
        createElement() {
            const closeListeners = new Map();
            const closeButton = {
                isConnected: true,
                addEventListener: (name, callback) => closeListeners.set(name, callback),
                focus() { doc.activeElement = this; },
                click: () => closeListeners.get('click')?.(),
                getClientRects: () => [{}],
            };
            const overlay = {
                attributes: {},
                setAttribute(name, value) { this.attributes[name] = value; },
                remove() { overlays.splice(overlays.indexOf(this), 1); closeButton.isConnected = false; },
                set innerHTML(value) {
                    this.html = value;
                    this.directory = value.includes('user-guide-toc') ? { open: /<details[^>]*\bopen(?:\s|=|>)/.test(value) } : null;
                },
                get innerHTML() { return this.html; },
                querySelector: selector => selector === '[data-guide-close]' ? closeButton : null,
                querySelectorAll: selector => selector === '[data-guide-target]' ? [] : [closeButton],
            };
            return overlay;
        },
    };
    return doc;
}

function withGuideEnvironment(run) {
    const previous = { state: store.state, document: globalThis.document, storage: globalThis.localStorage, window: globalThis.window };
    const values = new Map();
    const doc = fakeDocument();
    globalThis.document = doc;
    globalThis.window = undefined;
    globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
    store.setState({ animeList: [], settings: { ...store.DEFAULT_SETTINGS, userGuideSeen: false } }, { render: false });
    try {
        run(doc, values);
    } finally {
        while (closeUserGuide()) { /* Close a guide and its first-use notice before restoring globals. */ }
        store.setState(previous.state, { render: false });
        globalThis.document = previous.document;
        globalThis.localStorage = previous.storage;
        globalThis.window = previous.window;
    }
}

test('first empty startup shows the guide once, remembers closing, and shows the settings notice', () => {
    withGuideEnvironment((doc, values) => {
        initializeUserGuide(markdown);
        assert.equal(doc.overlays.length, 1);
        assert.equal(doc.overlays[0].directory.open, false);
        assert.equal(doc.overlays[0].attributes['aria-modal'], 'true');
        assert.equal(doc.body.style.overflow, 'hidden');
        doc.overlays[0].querySelector('[data-guide-close]').click();
        assert.equal(store.state.settings.userGuideSeen, true);
        assert.equal(JSON.parse(values.get('anime-tracker-settings')).userGuideSeen, true);
        assert.equal(doc.overlays.length, 1);
        assert.match(doc.overlays[0].innerHTML, /设置.*最下方.*使用说明/s);
        assert.equal(closeUserGuide(), true);
        assert.equal(doc.overlays.length, 0);
        assert.equal(doc.body.style.overflow, 'auto');
        assert.equal(closeUserGuide(), false);
        initializeUserGuide(markdown);
        assert.equal(doc.overlays.length, 0);
    });
});

test('manual guide openings reset the directory and do not show a first-use notice', () => {
    withGuideEnvironment(doc => {
        store.setState({ settings: { ...store.state.settings, userGuideSeen: true } }, { render: false });
        initializeUserGuide(markdown);
        openUserGuide();
        assert.equal(doc.overlays.length, 1);
        assert.equal(doc.overlays[0].directory.open, false);
        doc.overlays[0].directory.open = true;
        openUserGuide();
        assert.equal(doc.overlays.length, 1);
        closeUserGuide();
        assert.equal(doc.overlays.length, 0);
        openUserGuide();
        assert.equal(doc.overlays[0].directory.open, false);
        closeUserGuide();
        assert.equal(doc.overlays.length, 0);
    });
});

test('existing records skip onboarding and later clearing the list does not trigger it', () => {
    withGuideEnvironment(doc => {
        store.setState({ animeList: [{ id: 'existing', title: '已有番剧' }] }, { render: false });
        initializeUserGuide(markdown);
        assert.equal(doc.overlays.length, 0);
        assert.equal(store.state.settings.userGuideSeen, true);
        store.setState({ animeList: [] }, { render: false });
        initializeUserGuide(markdown);
        assert.equal(doc.overlays.length, 0);
    });
});
