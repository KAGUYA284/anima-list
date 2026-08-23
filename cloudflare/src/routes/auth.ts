import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv, UserRow } from '../types';
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from '../services/password';
import { ACCESS_TOKEN_SECONDS, signAccessToken } from '../services/jwt';
import { rateLimit } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';

const auth = new Hono<AppEnv>();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function body(c: Context<AppEnv>) {
    if (!String(c.req.header('Content-Type') || '').toLowerCase().startsWith('application/json')) throw new Error('INVALID_CONTENT_TYPE');
    const length = Number(c.req.header('Content-Length') || 0);
    if (length > 4096) throw new Error('REQUEST_TOO_LARGE');
    const raw = await c.req.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) throw new Error('REQUEST_TOO_LARGE');
    return JSON.parse(raw) as Record<string, unknown>;
}

function normalizeCredentials(value: Record<string, unknown>) {
    const email = String(value.email || '').trim().toLowerCase();
    const password = String(value.password || '');
    if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new Error('INVALID_EMAIL');
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) throw new Error('INVALID_PASSWORD');
    return { email, password };
}

auth.post('/register', rateLimit(), async c => {
    try {
        const { email, password } = normalizeCredentials(await body(c));
        const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').bind(email).first();
        if (existing) return c.json({ success: false, error: { code: 'ACCOUNT_CONFLICT', message: '无法创建账号' } }, 409);
        const passwordData = await hashPassword(password);
        const id = crypto.randomUUID();
        const now = Date.now();
        await c.env.DB.prepare(`INSERT INTO users
            (id, email, password_hash, password_salt, password_iterations, password_algorithm, token_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
            .bind(id, email, passwordData.hash, passwordData.salt, passwordData.iterations, passwordData.algorithm, now, now).run();
        return c.json({ success: true, data: { user: { id, email } } }, 201);
    } catch (error) {
        const code = error instanceof Error ? error.message : 'INVALID_REQUEST';
        return c.json({ success: false, error: { code, message: '注册信息不符合要求' } }, 400);
    }
});

auth.post('/login', rateLimit(), async c => {
    try {
        const { email, password } = normalizeCredentials(await body(c));
        const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').bind(email).first<UserRow>();
        if (!user) {
            await hashPassword(password);
            return invalidCredentials(c);
        }
        const valid = user.password_algorithm === 'PBKDF2-SHA256'
            ? await verifyPassword(password, user.password_hash, user.password_salt, user.password_iterations)
            : false;
        if (!valid) return invalidCredentials(c);
        const accessToken = await signAccessToken(user.id, user.token_version, c.env.JWT_SECRET);
        return c.json({ success: true, data: { accessToken, expiresIn: ACCESS_TOKEN_SECONDS, user: { id: user.id, email: user.email } } });
    } catch {
        return invalidCredentials(c);
    }
});

auth.post('/logout-all', requireAuth, async c => {
    const userId = c.get('userId');
    await c.env.DB.prepare('UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?').bind(Date.now(), userId).run();
    return c.json({ success: true, data: {} });
});

function invalidCredentials(c: Context<AppEnv>) {
    return c.json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: '邮箱或密码错误' } }, 401);
}

export default auth;
