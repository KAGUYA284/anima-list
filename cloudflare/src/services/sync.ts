export const MAX_SNAPSHOT_BYTES = 1024 * 1024;
export const SUPPORTED_DATA_VERSIONS = new Set([1, 2]);

export interface SyncWriteInput {
    snapshot: Record<string, unknown>;
    dataVersion: number;
    appVersion?: string;
    baseRevision: number;
    clientUpdatedAt: number;
}

export function validateSyncWrite(value: unknown): SyncWriteInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SNAPSHOT');
    const input = value as Partial<SyncWriteInput>;
    if (!input.snapshot || typeof input.snapshot !== 'object' || Array.isArray(input.snapshot)) throw new Error('INVALID_SNAPSHOT');
    if (!SUPPORTED_DATA_VERSIONS.has(Number(input.dataVersion))) throw new Error('UNSUPPORTED_DATA_VERSION');
    if (!Number.isInteger(input.baseRevision) || Number(input.baseRevision) < 0) throw new Error('INVALID_BASE_REVISION');
    if (!Number.isSafeInteger(input.clientUpdatedAt) || Number(input.clientUpdatedAt) < 0) throw new Error('INVALID_CLIENT_TIME');
    const serialized = JSON.stringify(input.snapshot);
    if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) throw new Error('SNAPSHOT_TOO_LARGE');
    validateShape(input.snapshot);
    return {
        snapshot: input.snapshot,
        dataVersion: Number(input.dataVersion),
        appVersion: String(input.appVersion || '').slice(0, 32),
        baseRevision: Number(input.baseRevision),
        clientUpdatedAt: Number(input.clientUpdatedAt),
    };
}

function validateShape(root: unknown) {
    let nodes = 0;
    const visit = (value: unknown, depth: number) => {
        nodes += 1;
        if (nodes > 100_000 || depth > 20) throw new Error('SNAPSHOT_TOO_COMPLEX');
        if (Array.isArray(value)) {
            if (value.length > 20_000) throw new Error('SNAPSHOT_TOO_COMPLEX');
            value.forEach(item => visit(item, depth + 1));
        } else if (value && typeof value === 'object') {
            const entries = Object.entries(value as Record<string, unknown>);
            if (entries.length > 10_000) throw new Error('SNAPSHOT_TOO_COMPLEX');
            entries.forEach(([, item]) => visit(item, depth + 1));
        }
    };
    visit(root, 0);
}

function canonicalize(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value as object).sort().map(key => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export async function snapshotHash(snapshot: Record<string, unknown>) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(snapshot)));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function writeDecision(currentRevision: number, baseRevision: number): 'create' | 'update' | 'conflict' {
    if (currentRevision === 0 && baseRevision === 0) return 'create';
    return currentRevision === baseRevision ? 'update' : 'conflict';
}
