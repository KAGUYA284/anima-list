import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(limit = 10, windowMs = 15 * 60 * 1000) {
    return createMiddleware<AppEnv>(async (c, next) => {
        const address = c.req.header('CF-Connecting-IP') || 'unknown';
        const key = `${address}:${c.req.path}`;
        const now = Date.now();
        const current = buckets.get(key);
        const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
        bucket.count += 1;
        buckets.set(key, bucket);
        if (bucket.count > limit) {
            c.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
            return c.json({ success: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试' } }, 429);
        }
        await next();
    });
}
