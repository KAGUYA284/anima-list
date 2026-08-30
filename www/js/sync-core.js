export function decideSyncAction({ remoteRevision, localRevision, localDirty, localCount, remoteHash, localHash }) {
    if (remoteRevision === 0) return localCount ? 'upload' : 'none';
    if (remoteRevision === localRevision) return localDirty ? 'upload' : 'none';
    if (remoteRevision > localRevision) {
        if (!localDirty) return 'download';
        if (remoteHash && remoteHash === localHash) return 'accept-equal';
        return 'conflict';
    }
    return 'conflict';
}

export function shouldRenderSyncConflictPanel(phase, hasPanel) {
    return (phase === 'conflict') !== Boolean(hasPanel);
}

export function hasSyncableAnimeList(records) {
    return Array.isArray(records) && records.length > 0;
}

export function hasSyncableSnapshot(snapshot) {
    return hasSyncableAnimeList(snapshot?.records);
}
