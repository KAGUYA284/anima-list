/** Tencent Cloud SCF proxy for the small Bangumi API surface used by the app. */
const https = require('https');

const MAX_BODY_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'https://localhost,http://localhost:5173')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));

function response(statusCode, body = '', extraHeaders = {}, origin = '') {
    return {
        isBase64Encoded: false,
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'no-store',
            ...extraHeaders,
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    };
}

function isAllowedRequest(method, path) {
    if (method === 'POST' && path === '/v0/search/subjects') return true;
    if (method === 'GET' && /^\/v0\/subjects\/\d+$/.test(path)) return true;
    if (method === 'GET' && /^\/v0\/subjects\/\d+\/characters$/.test(path)) return true;
    return false;
}

exports.main_handler = async event => {
    const path = event.path || '';
    const method = (event.httpMethod || 'GET').toUpperCase();
    const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
    const corsOrigin = allowedOrigins.has(requestOrigin) ? requestOrigin : '';
    const send = (statusCode, body = '', headers = {}) => response(statusCode, body, headers, corsOrigin);

    if (method === 'OPTIONS') {
        if (!corsOrigin) return send(403, { error: 'Origin not allowed' });
        return send(204, '', { 'Access-Control-Max-Age': '86400' });
    }
    if (requestOrigin && !corsOrigin) return send(403, { error: 'Origin not allowed' });
    if (!isAllowedRequest(method, path)) return send(404, { error: 'Not found' });

    const body = event.body
        ? (typeof event.body === 'string' ? event.body : JSON.stringify(event.body))
        : '';
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return send(413, { error: 'Request body too large' });

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(event.queryString || {})) {
        if (typeof value === 'string' && value.length <= 500) query.set(key, value);
    }
    const targetPath = `${path}${query.size ? `?${query}` : ''}`;

    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };
        const request = https.request({
            hostname: 'api.bgm.tv',
            port: 443,
            path: targetPath,
            method,
            headers: {
                'User-Agent': 'AnimeTracker/1.1.0',
                ...(method === 'POST' ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                } : {}),
            },
        }, upstream => {
            const chunks = [];
            let size = 0;
            upstream.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_RESPONSE_BYTES) {
                    request.destroy(new Error('Upstream response too large'));
                    return;
                }
                chunks.push(chunk);
            });
            upstream.on('end', () => finish(send(upstream.statusCode || 502, Buffer.concat(chunks).toString('utf8'))));
        });

        request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('Upstream timeout')));
        request.on('error', error => finish(send(502, { error: error.message })));
        if (method === 'POST') request.write(body);
        request.end();
    });
};
