import { describe, expect, it } from 'vitest';
import app from '../src/index';

const env = {
    ALLOWED_ORIGINS: 'https://localhost,http://localhost:5173',
    DB: {} as D1Database,
    JWT_SECRET: 'test-only-secret',
};

describe('CORS', () => {
    it('allows the Capacitor Android https origin', async () => {
        const response = await app.request('/api/auth/register', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://localhost',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            },
        }, env);
        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
    });

    it('rejects origins outside the configured allowlist', async () => {
        const response = await app.request('/api/health', {
            headers: { Origin: 'https://example.invalid' },
        }, env);
        expect(response.status).toBe(403);
    });
});
