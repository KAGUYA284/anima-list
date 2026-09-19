# Anima List

记录动漫观看进度的跨端应用。核心为一套 Vanilla JS + ES Module 前端（`www/`），
通过 Vite 打包到 `dist/`，再由三种外壳分发：

| 端 | 外壳 | 产物 |
| --- | --- | --- |
| Web | Vite 静态文件 + PowerShell 启动器 | `发布版本/v1.3.0/Web/` |
| Android / iOS | Capacitor | APK / IPA |
| Windows 免安装版 | Electron | 正式无缓存包、缓存测试包 |
| Windows 安装版 | Electron + NSIS | NSIS 安装程序 |
| 番剧数据代理 | 腾讯云 SCF | Bangumi API/图片代理 + yuc.wiki 季度信息抓取 |
| 云同步 API | Cloudflare Workers + Hono + D1 | 账号认证、JSON 快照、revision 冲突检测 |

## 目录速览

- `www/js/` — 前端源码，分层单向数据流：
  - `app.js`（入口） → `store.js`（状态 + `setRenderer` 回调解耦）
  - `renderer/`（渲染层，`renderer.js` 为兼容再导出入口）
  - `events/`（事件层，`events.js` 为兼容再导出入口）
  - `api.js` / `core.js` / `data.js` / `storage.js` / `grouping.js`（纯函数）/ `constants.js` / `utils.js`
- `scripts/` — 构建脚本（版本同步、产物校验、源码检查、发布密钥）
- `tests/` — 基于 `node:test` 的单元测试
- `docs/` — 累计工作说明、升级计划和架构分析
- `cloudflare/` — TypeScript 云同步服务、D1 迁移、Wrangler 示例配置和测试
- `发布版本/v<版本号>/` — 面向用户和测试人员的最终产物（Git 忽略）
- `scf_bangumi_proxy.js` — Bangumi API/图片代理及 yuc.wiki 季度页解析（CORS/路径白名单、体积限制、缓存）

## 番剧信息来源

更新时间与放送日期统一使用 yuc.wiki。在 Electron 中通过 Node.js 端侧读取，在 Web/移动端
尝试直接读取 yuc.wiki，失败后才通过腾讯云 SCF 的 `/yuc/anime` 路由读取
`yuc.wiki/YYYYMM/` 季度页，按封面和标准化
中日文标题映射番剧，获取首播日期、每周更新时间（具体到小时）以及原作、导演、
副导演、编剧、人物设计、动画人设、动画制作。详情页信息可通过“显示番剧具体信息”
单独开关。

列表页设置按钮右侧的日历图标打开季度新番表。新番表通过年份和季度筛选器加载 2019 年
10 月至未来任意年份的季度页面，并按周一至周日显示 yuc.wiki 图片。点击“加入待看”时
先通过 Bangumi API 匹配 subject ID，搜索顺序为 yuc.wiki 日文标题优先、中文标题兜底，
匹配后读取完整 Bangumi 条目，以 Bangumi ID 去重并导入规范标题、集数和首播日期，
随后留在当前新番表页面；主列表封面与详情页角色、
声优继续使用 Bangumi 数据。历史季度页面缺少具体首播日时，加入待看会优先使用 Bangumi
首播日期，并以所选季度首日作为最终归类兜底。2019 年 10 月前统一显示“无数据”，也不展示 yuc.wiki
具体时间段和制作信息。

列表在没有既有用户设置时默认使用封面模式；用户仍可在设置中切换为仅文字模式。
设置中的“展示次序”支持两种方式：时间次序保持周一至周日；更新次序从昨天开始按最近
更新日倒序，例如周三依次展示周二、周一、周日，同一天优先展示较晚的时段和更新时间。
主页番剧卡片支持向左滑动或用鼠标向左拖动，展开扳手编辑与叉号删除按钮。设置的数据管理
区域也可以在确认后一次清空所有番剧。

导入 JSON 后会在不覆盖已有字段的前提下，通过 Bangumi 和 yuc.wiki 补齐缺失的 Bangumi ID、
集数、首播日期、更新星期、具体时间和时段，并把补全结果写回本地存储。单条查询失败不会
撤销已经成功的导入。

## 跨端云同步

生产 Worker 地址已写入共享配置，设置页的“云同步”区域只需注册或登录。注册密码要求为
8–128 个字符。Web 的 MVP Token 保存在
localStorage；Electron 使用系统凭据加密能力保存到独立文件；Android 使用 Android Keystore
生成的 AES-GCM 密钥保存密文。所有平台共享 `sync-service.js` 的 revision 同步状态机。

本地每次修改都会写入 `ANIMA_LOCAL_DIRTY` 与 `ANIMA_LAST_UPDATED`。同步比较只使用服务端
`revision`：云端领先且本地未修改时下载，修订号一致且本地有修改时上传，双方同时修改则
显示冲突面板，必须明确选择云端、本地覆盖或导出双方 JSON，不按客户端时间静默覆盖。

Worker 部署、D1 迁移和密钥配置见 [cloudflare/README.md](cloudflare/README.md)。应用固定连接
`https://anima-list-api.anima-list-api.workers.dev`；实际 D1 ID 与 JWT 密钥仍不进入仓库。

代理仅访问固定的 `yuc.wiki` 主机和季度路径，并把远端 HTML 解析成白名单纯文本字段，
不会执行或向客户端透传页面脚本。当前该站 HTTPS 证书已过期，因此代理暂时从同一
固定主机的公开 HTTP 页面读取数据；应用到代理的连接仍使用 HTTPS。站点证书恢复后，
应将抓取传输切回 HTTPS。

## 常用命令

```bash
npm install            # 安装依赖

npm run dev            # 本地开发（Vite）
npm run build          # 打包到 dist/（prebuild 会自动同步版本号）
npm run check          # 质量门禁：lint → test → build → check:dist

npm run sync           # 打包并 `cap sync` 到原生工程（Android/iOS）
npm run android:release# 生成发布密钥并出 Android release APK
npm run desktop:preview# 打包并用 electron-builder 出便携版目录
npm run desktop:installer# 打包并生成 Windows NSIS 安装程序
npm run release:package# 将已构建产物整理为统一发布目录
npm run release:all   # 检查并构建、整理 Windows / Android / Web 全部产物
npm run cloud:install # 安装 Cloudflare Worker 锁定依赖
npm run cloud:check   # Worker TypeScript 检查与测试
```

## 发布目录

`npm run release:all` 完成后，当前版本统一放在 `发布版本/v1.3.0/`：

```text
发布版本/v1.3.0/
├─ Windows/
│  ├─ 安装版/Anima-List-Setup-1.3.0.exe
│  ├─ 免安装版/Anima List v1.3.0/（目录版）
│  └─ 缓存测试版/Anima List v1.3.0 缓存测试版/（目录版）
├─ Android/Anima-List-v1.3.0-signed.apk
├─ Web/
│  ├─ 启动网页版.cmd
│  ├─ server.ps1
│  └─ web/
└─ 版本说明.txt
```

正式免安装版不携带运行缓存，直接进入目录运行 `Anima List.exe`。缓存测试版会把缓存、
Local Storage 和 IndexedDB 固定保存在同目录的 `test-user-data/` 中；首次启动会创建
该目录，后续启动会复用缓存，删除该目录即可重置。网页版双击 `启动网页版.cmd` 即可运行，
不依赖 Node.js。

## 版本号单一来源

`package.json` 的 `version` 是**唯一权威来源**。`npm run build`
的 `prebuild` 钩子会执行 `scripts/sync-version.mjs`，把版本号写入：

- `www/js/constants.js` → `APP_VERSION`
- `android/app/build.gradle` → `versionName`

`npm run lint`（`check-source.mjs`）会强校验三处一致，不一致即报错。
`versionCode`（Android 内部版本号）需在 `build.gradle` 中**人工递增**。

## 发布 Checklist

发布前按顺序执行：

1. **改版本**：在 `package.json` 里更新 `version`（如 `1.2.1` → `1.3.0`）。
2. **递增 versionCode**：在 `android/app/build.gradle` 手动 +1。
3. **同步版本号**：`npm run sync:version`（`prebuild` 也会自动跑）。
4. **过门禁**：`npm run check` 全绿（lint + test + build + dist 校验）。
5. **代理**：如改动 `scf_bangumi_proxy.js`，重新部署腾讯云 SCF，并确认
   `/yuc/anime`、Bangumi API 和图片代理均在线生效。
   - 推荐运行时：Node.js 16.13 或 Node.js 18。
   - 源文件名为 `scf_bangumi_proxy.js` 时，函数入口使用
     `scf_bangumi_proxy.main_handler`；若部署为 `index.js`，入口使用
     `index.main_handler`。
   - 只上传原始 JavaScript 文件，不要把 Markdown 代码围栏或说明文字粘贴到函数源码。
6. **出多端产物**：执行 `npm run release:all`。Android 签名需要
   `android/keystore.properties`，格式见 `keystore.properties.example`。
7. **冒烟测试**：安装 APK / 运行便携版，验证列表、详情、导入导出、图片代理正常。
8. **核对归档**：确认 `发布版本/v<版本号>/` 中的安装版、两种免安装版、APK
   和 Web 启动器齐全。

## 安全约定（由 `check-source.mjs` 守卫）

- Gradle 不得出现明文 `storePassword` / `keyPassword`（走 `keystore.properties` 或环境变量）。
- AndroidManifest 不得含 `MANAGE_EXTERNAL_STORAGE` / `requestLegacyExternalStorage` / 明文流量。
- Electron 便携版必须启用 `contextIsolation` / 禁用 `nodeIntegration` / 开启 `sandbox`。
