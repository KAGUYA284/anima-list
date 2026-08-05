# Anima List

记录动漫观看进度的跨端应用。核心为一套 Vanilla JS + ES Module 前端（`www/`），
通过 Vite 打包到 `dist/`，再由三种外壳分发：

| 端 | 外壳 | 产物 |
| --- | --- | --- |
| Web | Vite 静态文件 + PowerShell 启动器 | `发布版本/v1.2.0/Web/` |
| Android / iOS | Capacitor | APK / IPA |
| Windows 免安装版 | Electron | 正式无缓存包、缓存测试包 |
| Windows 安装版 | Electron + NSIS | NSIS 安装程序 |
| 番剧数据代理 | 腾讯云 SCF | Bangumi API/图片代理 + yuc.wiki 季度信息抓取 |

## 目录速览

- `www/js/` — 前端源码，分层单向数据流：
  - `app.js`（入口） → `store.js`（状态 + `setRenderer` 回调解耦）
  - `renderer/`（渲染层，`renderer.js` 为兼容再导出入口）
  - `events/`（事件层，`events.js` 为兼容再导出入口）
  - `api.js` / `core.js` / `data.js` / `storage.js` / `grouping.js`（纯函数）/ `constants.js` / `utils.js`
- `scripts/` — 构建脚本（版本同步、产物校验、源码检查、发布密钥）
- `tests/` — 基于 `node:test` 的单元测试
- `docs/` — 累计工作说明、升级计划和架构分析
- `发布版本/v<版本号>/` — 面向用户和测试人员的最终产物（Git 忽略）
- `scf_bangumi_proxy.js` — Bangumi API/图片代理及 yuc.wiki 季度页解析（CORS/路径白名单、体积限制、缓存）

## 番剧信息来源

设置页的“更新时间来源”支持“1. 长门有希”和“2. bangumi”。长门有希模式在 Electron
中通过 Node.js 端侧读取，在 Web/移动端尝试直接读取 yuc.wiki，失败后才通过腾讯云 SCF
的 `/yuc/anime` 路由读取 `yuc.wiki/YYYYMM/` 季度页，按封面和标准化
中日文标题映射番剧，获取首播日期、每周更新时间（具体到小时）以及原作、导演、
副导演、编剧、人物设计、动画人设、动画制作。详情页信息可通过“显示番剧具体信息”
单独开关。

列表页设置按钮右侧的日历图标打开季度新番表。新番表通过同一套端侧优先抓取逻辑加载
每个季度页面，点击“加入待看”即可创建一条“想看”状态的追番记录。

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
```

## 发布目录

`npm run release:all` 完成后，当前版本统一放在 `发布版本/v1.2.0/`：

```text
发布版本/v1.2.0/
├─ Windows/
│  ├─ 安装版/Anima-List-Setup-1.2.0.exe
│  ├─ 免安装版/Anima List v1.2.0/（目录版）
│  └─ 缓存测试版/Anima List v1.2.0 缓存测试版/（目录版）
├─ Android/Anima-List-v1.2.0-signed.apk
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

1. **改版本**：在 `package.json` 里更新 `version`（如 `1.1.0` → `1.2.0`）。
2. **递增 versionCode**：在 `android/app/build.gradle` 手动 +1。
3. **同步版本号**：`npm run sync:version`（`prebuild` 也会自动跑）。
4. **过门禁**：`npm run check` 全绿（lint + test + build + dist 校验）。
5. **代理**：如改动 `scf_bangumi_proxy.js`，重新部署腾讯云 SCF，并确认
   `/yuc/anime`、Bangumi API 和图片代理均在线生效。
6. **出多端产物**：执行 `npm run release:all`。Android 签名需要
   `android/keystore.properties`，格式见 `keystore.properties.example`。
7. **冒烟测试**：安装 APK / 运行便携版，验证列表、详情、导入导出、图片代理正常。
8. **核对归档**：确认 `发布版本/v<版本号>/` 中的安装版、两种免安装版、APK
   和 Web 启动器齐全。

## 安全约定（由 `check-source.mjs` 守卫）

- Gradle 不得出现明文 `storePassword` / `keyPassword`（走 `keystore.properties` 或环境变量）。
- AndroidManifest 不得含 `MANAGE_EXTERNAL_STORAGE` / `requestLegacyExternalStorage` / 明文流量。
- Electron 便携版必须启用 `contextIsolation` / 禁用 `nodeIntegration` / 开启 `sandbox`。
