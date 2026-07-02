/**
 * Tencent Cloud SCF - Bangumi API Proxy
 * 
 * 部署方式：
 * 1. 登录腾讯云控制台 → 云函数（SCF）
 * 2. 创建新函数，运行环境选 Node.js 16+
 * 3. 将本文件内容粘贴到 index.js
 * 4. 创建 API 网关触发器，启用 CORS
 * 5. 获取触发 URL，配置到前端 API_PROXIES
 */

const https = require('https');

exports.main_handler = async (event, context) => {
    // 1. 获取请求路径（如 /v0/subjects/123 或 /v0/search/subjects）
    const path = event.path || '/v0/search/subjects';
    
    // 2. 获取 HTTP 方法
    const method = (event.httpMethod || 'GET').toUpperCase();

    // 3. 处理浏览器 CORS 预检请求
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

    // 4. 构建查询字符串（event.queryString 是 API 网关解析后的对象）
    const queryString = event.queryString
        ? Object.keys(event.queryString)
            .map(key => `${key}=${encodeURIComponent(event.queryString[key])}`)
            .join('&')
        : '';

    // 5. 拼接 Bangumi 官方 API 地址
    const targetUrl = `https://api.bgm.tv${path}${queryString ? '?' + queryString : ''}`;

    return new Promise((resolve) => {
        const urlObj = new URL(targetUrl);

        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'User-Agent': 'AnimeTracker/1.0'
            }
        };

        // POST 请求需要转发 Content-Type 和 body
        if (method === 'POST') {
            options.headers['Content-Type'] = 'application/json';
            if (event.body) {
                options.headers['Content-Length'] = Buffer.byteLength(
                    typeof event.body === 'string' ? event.body : JSON.stringify(event.body)
                );
            }
        }

        const req = https.request(options, (res) => {
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
        });

        req.on('error', (err) => {
            resolve({
                isBase64Encoded: false,
                statusCode: 502,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: err.message })
            });
        });

        // POST 请求向后转发 body
        if (method === 'POST' && event.body) {
            const bodyStr = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
            req.write(bodyStr);
        }

        req.end();
    });
};
