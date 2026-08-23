import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { AppEnv, UserRow } from '../types';
import { verifyAccessToken } from '../services/jwt';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header('Authorization') || '';
    if (!header.startsWith('Bearer ')) return unauthorized(c);
    try {
        const payload = await verifyAccessToken(header.slice(7), c.env.JWT_SECRET);
        const user = await c.env.DB.prepare('SELECT id, token_version FROM users WHERE id = ?').bind(payload.sub).first<Pick<UserRow, 'id' | 'token_version'>>();
        if (!user || user.token_version !== payload.tv) return unauthorized(c);
        c.set('userId', user.id);
        await next();
    } catch {
        return unauthorized(c);
    }
});

function unauthorized(c: Context<AppEnv>) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: '登录状态已失效' } }, 401);
}
