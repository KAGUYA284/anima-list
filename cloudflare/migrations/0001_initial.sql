PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL,
    password_algorithm TEXT NOT NULL DEFAULT 'PBKDF2-SHA256',
    token_version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sync (
    user_id TEXT PRIMARY KEY,
    anime_data TEXT NOT NULL,
    data_version INTEGER NOT NULL DEFAULT 1,
    app_version TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    client_updated_at INTEGER,
    server_updated_at INTEGER NOT NULL,
    data_hash TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
