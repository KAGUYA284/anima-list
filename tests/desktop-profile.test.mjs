import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configureDataProfile } from '../electron/data-profile.cjs';

test('desktop profiles isolate portable data, retain it between starts, and leave installed data unchanged', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'anima-profile-test-'));
    const executable = path.join(directory, 'Anima List.exe');
    const paths = new Map();
    const app = { setPath: (key, value) => paths.set(key, value) };
    try {
        assert.equal(configureDataProfile(app, executable), 'installed');
        assert.equal(paths.size, 0);

        writeFileSync(path.join(directory, '.anima-list-portable'), '');
        assert.equal(configureDataProfile(app, executable), 'portable');
        const portableData = path.join(directory, 'portable-user-data');
        assert.equal(paths.get('userData'), portableData);
        assert.equal(paths.get('sessionData'), portableData);
        const savedRecord = path.join(portableData, 'saved-record.json');
        writeFileSync(savedRecord, '{"progress":8}');
        configureDataProfile(app, executable);
        assert.equal(readFileSync(savedRecord, 'utf8'), '{"progress":8}');

        writeFileSync(path.join(directory, '.anima-list-cache-test'), '');
        assert.equal(configureDataProfile(app, executable), 'cache-test');
        assert.equal(paths.get('userData'), path.join(directory, 'test-user-data'));
        assert.equal(paths.get('sessionData'), path.join(directory, 'test-user-data'));
        assert.equal(existsSync(savedRecord), true);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
