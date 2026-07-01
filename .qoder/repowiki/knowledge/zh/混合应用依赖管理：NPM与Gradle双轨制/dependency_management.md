该工程采用典型的 Capacitor 混合开发架构，依赖管理分为前端（Web）和原生（Android）两个独立但协同的系统。

### 1. 前端依赖管理 (NPM)
- **包管理器**：使用 `npm`，通过 `package.json` 声明依赖，`package-lock.json` 锁定版本以确保构建一致性。
- **核心框架**：基于 `React` (^18.2.0) 和 `Vite` (^5.1.0) 构建。
- **状态管理**：使用 `zustand` (^4.5.0) 进行轻量级状态管理。
- **Capacitor 桥接**：引入 `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` 等包（^6.0.0），用于实现 Web 代码与原生能力的通信。

### 2. 原生依赖管理 (Gradle)
- **构建系统**：使用 Android Gradle Plugin (AGP) 8.13.2。
- **版本集中管理**：通过 `android/variables.gradle` 统一定义 SDK 版本（compileSdk 35, minSdk 22）及 AndroidX 库版本，避免硬编码。
- **仓库配置**：在 `android/build.gradle` 中配置 `google()` 和 `mavenCentral()` 作为主要依赖源。
- **插件化依赖**：
  - `capacitor-android`：作为本地项目依赖 (`implementation project(':capacitor-android')`)，由 Capacitor CLI 同步生成。
  - `capacitor-cordova-android-plugins`：用于兼容 Cordova 插件，通过 `flatDir` 和本地项目引用集成。

### 3. 同步机制
- **Capacitor Sync**：通过 `npx cap sync` 命令将前端构建产物（`www` 目录）复制到 Android 资产的 `public` 文件夹，并自动更新原生项目的依赖配置（如 `capacitor.build.gradle`）。

### 4. 开发规范
- **版本锁定**：前端必须提交 `package-lock.json`；原生依赖版本应在 `variables.gradle` 中统一维护。
- **依赖添加**：新增原生功能应优先寻找对应的 Capacitor 插件并通过 npm 安装，随后执行 sync 命令，而非直接修改 `build.gradle`。