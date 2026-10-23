import test from 'node:test';
import assert from 'node:assert/strict';
import { showReminder } from '../www/js/renderer/reminder.js';
import * as store from '../www/js/store.js';

test('startup reminders independently select today, yesterday, both, or no popup', () => {
    const previousState = store.state;
    const previousDocument = globalThis.document;
    const overlays = [];
    globalThis.document = {
        createElement: () => ({ addEventListener() {}, remove() {} }),
        body: { appendChild: overlay => overlays.push(overlay) },
    };
    try {
        const animeList = [
            { title: '周一作品', status: 'want', type: 'chasing', updateWeekDay: 1, totalEpisodes: 12, currentEpisode: 0 },
            { title: '周日作品', status: 'want', type: 'chasing', updateWeekDay: 7, totalEpisodes: 12, currentEpisode: 0 },
        ];
        for (const [today, yesterday] of [[true, false], [false, true], [true, true], [false, false]]) {
            overlays.length = 0;
            store.setState({ animeList, settings: { ...store.state.settings, startupToday: today, startupYesterday: yesterday } }, { render: false });
            showReminder(new Date('2026-10-19T12:00:00'));
            if (!today && !yesterday) { assert.equal(overlays.length, 0); continue; }
            assert.equal(overlays.length, 1);
            assert.equal(overlays[0].innerHTML.includes('周一作品'), today);
            assert.equal(overlays[0].innerHTML.includes('周日作品'), yesterday);
        }
    } finally {
        globalThis.document = previousDocument;
        store.setState(previousState, { render: false });
    }
});
