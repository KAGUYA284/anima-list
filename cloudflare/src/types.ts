export interface Bindings {
    DB: D1Database;
    JWT_SECRET: string;
    ALLOWED_ORIGINS: string;
}

export interface Variables {
    userId: string;
}

export interface UserRow {
    id: string;
    email: string;
    password_hash: string;
    password_salt: string;
    password_iterations: number;
    password_algorithm: string;
    token_version: number;
}

export interface SyncRow {
    user_id: string;
    anime_data: string;
    data_version: number;
    app_version: string | null;
    revision: number;
    client_updated_at: number | null;
    server_updated_at: number;
    data_hash: string | null;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
