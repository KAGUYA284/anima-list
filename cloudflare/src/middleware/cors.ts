import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

export const configuredCors = createMiddleware<AppEnv>(async (c, next) => {
    const origin = c.req.header('Origin') || '';
    const allowed = new Set(String(c.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
    if (origin && !allowed.has(origin)) {
        return c.json({ success: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: '请求来源不受信任' } }, 403);
    }
    if (origin) c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    c.header('Access-Control-Max-Age', '86400');
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    await next();
});
