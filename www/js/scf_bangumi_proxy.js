/**
 * Tencent Cloud SCF - Bangumi API Proxy
 *
 * 部署方式：
 * 1. 登录腾讯云控制台 → 云函数（SCF）
 * 2. 创建新函数，运行环境选 Node.js 16+
 * 3. 将本文件内容粘贴到 index.js
 * 4. 部署函数后获取**函数 URL**（非 API 网关触发器），在控制台开启 CORS
 * 5. 将函数 URL 配置到前端 API_PROXIES.proxy1
 *
 * 触发方式：函数 URL（事件函数）
 */

const https = require('https');

exports.main_handler = async (event, context) => {
    // 打印事件结构方便调试
    console.log('[Proxy] 收到请求:', JSON.stringify({
        path: event.path,
        method: event.httpMethod,
        headers: event.headers,
        bodyLength: event.body ? event.body.length : 0
    }));

    // 1. 获取请求路径
    const path = event.path || '/v0/search/subjects';
    const method = (event.httpMethod || 'GET').toUpperCase();

    // 2. 处理 CORS 预检
    if (method === 'OPTIONS') {
        return {
            isBase64Encoded: false,
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            }
        };
    }

    // 3. 拼接 Bangumi 官方 API 地址
    const targetUrl = 'https://api.bgm.tv' + path;
    console.log('[Proxy] 转发至:', method, targetUrl);

    return new Promise((resolve) => {
        const urlObj = new URL(targetUrl);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + (urlObj.search || ''),
            method: method,
            headers: {
                'User-Agent': 'AnimeTracker/1.0'
            }
        };

        // POST 请求：转发 Content-Type 和 body
        if (method === 'POST') {
            options.headers['Content-Type'] = 'application/json';
            if (event.body) {
                const bodyStr = typeof event.body === 'string'
                    ? event.body
                    : JSON.stringify(event.body);
                options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
                console.log('[Proxy] POST body:', bodyStr.substring(0, 200));
            }

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    console.log('[Proxy] 响应状态:', res.statusCode, '| 响应长度:', data.length);
                    resolve({
                        isBase64Encoded: false,
                        statusCode: res.statusCode,
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type'
                        },
                        body: data
                    });
                });
            });

            req.on('error', (err) => {
                console.error('[Proxy] 请求失败:', err.message);
                resolve({
                    isBase64Encoded: false,
                    statusCode: 502,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    },
                    body: JSON.stringify({ error: err.message })
                });
            });

            const bodyStr = typeof event.body === 'string'
                ? event.body
                : JSON.stringify(event.body);
            req.write(bodyStr);
            req.end();
        } else {
            // GET 请求
            https.get(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    resolve({
                        isBase64Encoded: false,
                        statusCode: res.statusCode,
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type'
                        },
                        body: data
                    });
                });
            }).on('error', (err) => {
                console.error('[Proxy] GET 请求失败:', err.message);
                resolve({
                    isBase64Encoded: false,
                    statusCode: 502,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    },
                    body: JSON.stringify({ error: err.message })
                });
            });
        }
    });
};
