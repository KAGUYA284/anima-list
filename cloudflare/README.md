# Anima List 云同步服务

本目录是独立的 Cloudflare Workers + Hono + D1 TypeScript 服务。发布客户端固定连接生产 Worker；服务不可用时本地番剧数据仍可离线使用。

## 本地验证

```bash
npm install
npm run check
copy wrangler.toml.example wrangler.toml
npx wrangler d1 migrations apply anima-list-development --local
npx wrangler dev
```

本地联调如需连接 Wrangler 地址，可临时修改 `www/js/constants.js` 中的 `SYNC_API_URL`；提交及发布前必须恢复生产 HTTPS 地址。HTTP 仅允许 `localhost` 与 `127.0.0.1`。

## 创建并部署环境

开发、预发布和生产必须分别创建 D1 数据库。以下命令中的名称只是示例：

```bash
npx wrangler d1 create anima-list-development
npx wrangler d1 create anima-list-staging
npx wrangler d1 create anima-list-production
```

复制 `wrangler.toml.example` 为被 Git 忽略的 `wrangler.toml`，填入对应环境的数据库 ID 和严格的
`ALLOWED_ORIGINS` 白名单。不要提交实际生产配置。JWT 密钥仅通过 Secret 写入：

```bash
npx wrangler secret put JWT_SECRET
npx wrangler d1 migrations apply anima-list-development --remote
npx wrangler deploy
```

生产迁移前先使用 D1 导出备份，在 development/staging 验证相同迁移与客户端同步流程，再对 production 执行。

## 安全与同步约束

- 密码为 PBKDF2-HMAC-SHA-256、每用户 16 字节随机盐、210,000 次迭代、32 字节派生值。
- 注册密码长度限制为 8–128 个字符，客户端与 Worker 使用同一范围。
- MVP 使用 7 天 Access Token；JWT 校验签名、`iss`、`aud`、`exp` 与数据库 `token_version`。
- `POST /api/auth/logout-all` 会递增 `token_version`，使全部旧 Token 失效。
- Worker 不记录密码、哈希、Token 或请求体；认证路由带实例内基础限流。
- 单用户快照最大 1 MB，支持数据结构版本 1 和 2，并限制嵌套深度、节点与数组长度。
- 写入必须携带 `baseRevision`。D1 更新使用 `WHERE revision = ?` 条件写入，竞争失败返回 409，绝不静默覆盖。
- `wrangler.toml`、`.wrangler/`、JWT Secret 和实际 D1 ID 均不得提交。

内存限流只提供单 Worker 实例的基础保护。生产环境建议再配置 Cloudflare Rate Limiting/WAF，避免仅依赖实例内状态。
