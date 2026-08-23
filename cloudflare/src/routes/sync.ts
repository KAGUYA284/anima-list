import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv, SyncRow } from '../types';
import { requireAuth } from '../middleware/auth';
import { MAX_SNAPSHOT_BYTES, snapshotHash, validateSyncWrite, writeDecision } from '../services/sync';

const sync = new Hono<AppEnv>();
sync.use('*', requireAuth);

function remoteData(row: SyncRow | null) {
    if (!row) return { snapshot: null, revision: 0, serverUpdatedAt: 0 };
    return {
        snapshot: JSON.parse(row.anime_data), dataVersion: row.data_version, appVersion: row.app_version,
        revision: row.revision, clientUpdatedAt: row.client_updated_at, serverUpdatedAt: row.server_updated_at,
        dataHash: row.data_hash,
    };
}

async function currentRow(c: Context<AppEnv>) {
    return c.env.DB.prepare('SELECT * FROM user_sync WHERE user_id = ?').bind(c.get('userId')).first<SyncRow>();
}

sync.get('/', async c => c.json({ success: true, data: remoteData(await currentRow(c)) }));

sync.put('/', async c => {
    if (!String(c.req.header('Content-Type') || '').toLowerCase().startsWith('application/json')) {
        return c.json({ success: false, error: { code: 'INVALID_CONTENT_TYPE', message: '请求格式错误' } }, 415);
    }
    const contentLength = Number(c.req.header('Content-Length') || 0);
    if (contentLength > MAX_SNAPSHOT_BYTES + 8192) return requestError(c, 'SNAPSHOT_TOO_LARGE', 413);
    let input;
    try { input = validateSyncWrite(await c.req.json()); }
    catch (error) {
        const code = error instanceof Error ? error.message : 'INVALID_REQUEST';
        return requestError(c, code, code === 'SNAPSHOT_TOO_LARGE' ? 413 : 400);
    }
    const userId = c.get('userId');
    const current = await currentRow(c);
    const decision = writeDecision(current?.revision || 0, input.baseRevision);
    if (decision === 'conflict') return conflict(c, current);
    const serialized = JSON.stringify(input.snapshot);
    const hash = await snapshotHash(input.snapshot);
    const now = Date.now();
    if (decision === 'create') {
        try {
            await c.env.DB.prepare(`INSERT INTO user_sync
                (user_id, anime_data, data_version, app_version, revision, client_updated_at, server_updated_at, data_hash)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
                .bind(userId, serialized, input.dataVersion, input.appVersion || null, input.clientUpdatedAt, now, hash).run();
            return c.json({ success: true, data: { revision: 1, serverUpdatedAt: now, dataHash: hash } });
        } catch { return conflict(c, await currentRow(c)); }
    }
    const nextRevision = input.baseRevision + 1;
    const result = await c.env.DB.prepare(`UPDATE user_sync SET anime_data = ?, data_version = ?, app_version = ?,
        revision = ?, client_updated_at = ?, server_updated_at = ?, data_hash = ? WHERE user_id = ? AND revision = ?`)
        .bind(serialized, input.dataVersion, input.appVersion || null, nextRevision, input.clientUpdatedAt, now, hash, userId, input.baseRevision).run();
    if (!result.meta.changes) return conflict(c, await currentRow(c));
    return c.json({ success: true, data: { revision: nextRevision, serverUpdatedAt: now, dataHash: hash } });
});

function requestError(c: Context<AppEnv>, code: string, status: 400 | 413) {
    const messages: Record<string, string> = {
        SNAPSHOT_TOO_LARGE: '同步快照超过 1 MB 限制', UNSUPPORTED_DATA_VERSION: '数据版本不兼容',
    };
    return c.json({ success: false, error: { code, message: messages[code] || '同步数据格式错误' } }, status);
}

function conflict(c: Context<AppEnv>, row: SyncRow | null) {
    return c.json({
        success: false, error: { code: 'SYNC_CONFLICT', message: '云端数据已被其他设备修改' },
        remote: remoteData(row),
    }, 409);
}

export default sync;
