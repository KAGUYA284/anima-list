import { describe, expect, it } from 'vitest';
import { snapshotHash, validateSyncWrite, writeDecision } from '../src/services/sync';

describe('revision based synchronization', () => {
    it('creates at revision zero and detects stale writers regardless of client time', () => {
        expect(writeDecision(0, 0)).toBe('create');
        expect(writeDecision(8, 8)).toBe('update');
        expect(writeDecision(9, 8)).toBe('conflict');
    });

    it('canonicalizes snapshot keys for duplicate hashes', async () => {
        expect(await snapshotHash({ records: [], schemaVersion: 2 })).toBe(await snapshotHash({ schemaVersion: 2, records: [] }));
    });

    it('rejects invalid versions, revisions and oversized payloads', () => {
        expect(() => validateSyncWrite({ snapshot: {}, dataVersion: 99, baseRevision: 0, clientUpdatedAt: 1 })).toThrow('UNSUPPORTED_DATA_VERSION');
        expect(() => validateSyncWrite({ snapshot: {}, dataVersion: 2, baseRevision: -1, clientUpdatedAt: 1 })).toThrow('INVALID_BASE_REVISION');
        expect(() => validateSyncWrite({ snapshot: { text: 'x'.repeat(1024 * 1024) }, dataVersion: 2, baseRevision: 0, clientUpdatedAt: 1 })).toThrow('SNAPSHOT_TOO_LARGE');
    });
});
