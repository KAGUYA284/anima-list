import { Hono } from 'hono';
import type { AppEnv } from './types';
import { configuredCors } from './middleware/cors';
import auth from './routes/auth';
import sync from './routes/sync';

const app = new Hono<AppEnv>();
app.use('*', configuredCors);
app.get('/api/health', c => c.json({ success: true, data: { service: 'anima-list-api' } }));
app.route('/api/auth', auth);
app.route('/api/sync', sync);
app.notFound(c => c.json({ success: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404));
app.onError((error, c) => {
    console.error('[Worker] request failed', error instanceof Error ? error.name : 'UnknownError');
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } }, 500);
});

export default app;
