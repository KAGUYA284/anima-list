import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSyncAction } from '../www/js/sync-core.js';

test('sync decisions use revision and dirty state instead of client clocks', () => {
    assert.equal(decideSyncAction({ remoteRevision: 0, localRevision: 0, localDirty: true, localCount: 2 }), 'upload');
    assert.equal(decideSyncAction({ remoteRevision: 4, localRevision: 4, localDirty: false, localCount: 2 }), 'none');
    assert.equal(decideSyncAction({ remoteRevision: 4, localRevision: 4, localDirty: true, localCount: 2 }), 'upload');
    assert.equal(decideSyncAction({ remoteRevision: 5, localRevision: 4, localDirty: false, localCount: 2 }), 'download');
    assert.equal(decideSyncAction({ remoteRevision: 5, localRevision: 4, localDirty: true, localCount: 2 }), 'conflict');
});

test('a lost upload response is accepted when cloud and local hashes are equal', () => {
    assert.equal(decideSyncAction({
        remoteRevision: 5, localRevision: 4, localDirty: true, localCount: 2,
        remoteHash: 'same', localHash: 'same',
    }), 'accept-equal');
});
