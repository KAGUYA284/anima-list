该工程采用 **Capacitor** 作为核心配置与桥接框架，通过分层配置文件管理 Web 前端与原生 Android 宿主的运行时行为。

### 1. 配置系统架构
配置体系分为三个主要层级：
- **Web/跨平台层**：由根目录下的 `capacitor.config.ts` 主导，定义应用 ID、名称、Web 资源目录（`www`）以及跨平台插件行为。该文件是开发的“单一事实来源”，在同步（sync）过程中会自动编译并分发到原生平台。
- **原生构建层 (Android)**：位于 `android/` 目录下，遵循 Gradle 标准规范。通过 `variables.gradle` 集中管理 SDK 版本及依赖库版本，确保构建环境的一致性；`gradle.properties` 负责 JVM 内存及 AndroidX 兼容性开关。
- **运行时资产层**：打包后的 `capacitor.config.json` 存在于 `android/app/src/main/assets/` 中，供原生容器在启动时读取以初始化 WebView 环境。

### 2. 关键配置项说明
- **应用标识**：`appId` 统一设定为 `com.animetracker.app`，在 `capacitor.config.ts` 与 `android/app/build.gradle` 的 `applicationId` 中保持严格一致。
- **网络与安全**：启用了 `androidScheme: 'https'` 以提升安全性，并在 Android 配置中允许混合内容（`allowMixedContent: true`），适配各类番剧资源链接。
- **UI 适配**：定义了统一的背景色 `#f8f9fb`，确保应用在原生容器加载瞬间与 Web 页面渲染完成后的视觉过渡平滑。

### 3. 开发者约定
- **修改原则**：所有跨平台配置应优先在根目录的 `capacitor.config.ts` 中进行修改，随后执行 `npx cap sync` 同步至原生项目。直接修改 `android/app/src/main/assets/capacitor.config.json` 可能会在下一次同步时被覆盖。
- **版本管理**：原生依赖的版本升级应通过修改 `android/variables.gradle` 中的 `ext` 变量实现，避免在 `build.gradle` 中硬编码版本号。
- **敏感信息**：目前工程未引入 `.env` 或复杂的密钥管理系统，若需接入 Firebase 等服务，需手动在 `android/app/` 下放置 `google-services.json` 并确保其不被提交至公共仓库。