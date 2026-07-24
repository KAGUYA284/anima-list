# Anima List

记录动漫观看进度的跨端应用。核心为一套 Vanilla JS + ES Module 前端（`www/`），
通过 Vite 打包到 `dist/`，再由三种外壳分发：

| 端 | 外壳 | 产物 |
| --- | --- | --- |
| Web / 移动 | Capacitor（Android / iOS） | APK / IPA |
| 桌面便携版 | Electron | `Anima List/`、`Anima List.zip` |
| Windows 安装版 | Electron + NSIS | `Anima-List-Setup-1.2.0.exe` |
| 番剧数据代理 | 腾讯云 SCF | `scf_bangumi_proxy.js` |

## 目录速览

- `www/js/` — 前端源码，分层单向数据流：
  - `app.js`（入口） → `store.js`（状态 + `setRenderer` 回调解耦）
  - `renderer/`（渲染层，`renderer.js` 为兼容再导出入口）
  - `events/`（事件层，`events.js` 为兼容再导出入口）
  - `api.js` / `core.js` / `data.js` / `storage.js` / `grouping.js`（纯函数）/ `constants.js` / `utils.js`
- `scripts/` — 构建脚本（版本同步、产物校验、源码检查、发布密钥）
- `tests/` — 基于 `node:test` 的单元测试
- `scf_bangumi_proxy.js` — Bangumi API + 图片代理（CORS/路径白名单、体积限制）

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
```

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
5. **代理**：如改动 `scf_bangumi_proxy.js`，重新部署腾讯云 SCF 并确认线上生效。
6. **出三端产物**：
   - Android：`npm run android:release`（需 `android/keystore.properties`，见 `keystore.properties.example`）
   - 桌面便携版：`npm run desktop:preview`
   - Windows 安装版：`npm run desktop:installer`
   - 移动工程同步：`npm run sync`
7. **冒烟测试**：安装 APK / 运行便携版，验证列表、详情、导入导出、图片代理正常。
8. **归档**：签名 APK 与 Windows 安装程序放入 `发布版本/`，便携版压缩为 `Anima List.zip`。

## 安全约定（由 `check-source.mjs` 守卫）

- Gradle 不得出现明文 `storePassword` / `keyPassword`（走 `keystore.properties` 或环境变量）。
- AndroidManifest 不得含 `MANAGE_EXTERNAL_STORAGE` / `requestLegacyExternalStorage` / 明文流量。
- Electron 便携版必须启用 `contextIsolation` / 禁用 `nodeIntegration` / 开启 `sandbox`。
