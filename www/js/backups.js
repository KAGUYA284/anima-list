import { createBackup, readBackup } from './data.js';
import { generateId } from './utils.js';

const BACKUP_KEY = 'anima-operation-backups';
export const MAX_OPERATION_BACKUPS = 3;

export function loadOperationBackups() {
    try {
        const saved = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
        if (!Array.isArray(saved)) return [];
        return saved.filter(item => item && typeof item.id === 'string' && Array.isArray(item.backup?.records))
            .slice(0, MAX_OPERATION_BACKUPS);
    } catch { return []; }
}

/** 操作前仅保留最近三份非空记录，失败时让调用方停止覆盖。 */
export function saveOperationBackup(records, reason) {
    if (!records.length) return true;
    try {
        const entry = { id: generateId(), reason, createdAt: new Date().toISOString(), backup: createBackup(records) };
        const backups = [entry, ...loadOperationBackups()].slice(0, MAX_OPERATION_BACKUPS);
        localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
        return true;
    } catch (error) {
        console.error('[Backup] 操作前备份失败', error);
        globalThis.window?.dispatchEvent?.(new CustomEvent('backup-error'));
        return false;
    }
}

export function readOperationBackup(id) {
    const entry = loadOperationBackups().find(item => item.id === id);
    return entry ? readBackup(entry.backup).records : null;
}
