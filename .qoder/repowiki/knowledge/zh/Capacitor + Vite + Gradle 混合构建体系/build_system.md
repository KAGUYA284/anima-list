## 1. 核心构建系统
本项目采用 **Web 前端 (Vite/React) + 原生壳层 (Capacitor/Android)** 的混合构建模式。

- **前端构建**：使用 `Vite` 作为打包工具，将 React 代码编译为静态资源（HTML/CSS/JS）并输出至 `www` 目录。
- **桥接与同步**：通过 `@capacitor/cli` 将 Web 资源注入 Android 工程，并管理原生插件依赖。
- **原生构建**：使用 `Gradle` (AGP 8.13.2) 编译 Android 宿主应用，集成 Capacitor 运行时及 Cordova 兼容插件。

## 2. 关键配置文件
- `package.json`: 定义前端开发脚本 (`dev`, `build`) 及 Capacitor 同步命令 (`sync`, `open:android`)。
- `capacitor.config.ts`: 配置应用 ID (`com.animetracker.app`)、Web 资源路径 (`www`) 及平台特定行为（如 HTTPS Scheme）。
- `android/build.gradle`: 根级 Gradle 配置，声明 AGP 版本及全局仓库。
- `android/variables.gradle`: 集中管理 SDK 版本（Compile/Target SDK 35, Min SDK 22）及依赖库版本。
- `android/app/build.gradle`: 应用模块配置，处理签名、混淆规则及 Google Services 集成。

## 3. 构建流程与约定
1. **前端打包**：执行 `npm run build`，Vite 生成生产环境静态文件至 `www/`。
2. **资源同步**：执行 `npx cap sync`，Capacitor 将 `www/` 内容复制到 `android/app/src/main/assets/public/`，并更新原生插件依赖。
3. **原生编译**：通过 `npx cap open android` 在 Android Studio 中打开工程，或使用 `./gradlew assembleRelease` 进行命令行打包。

## 4. 开发者注意事项
- **版本一致性**：修改 `versionCode` 和 `versionName` 需在 `android/app/build.gradle` 中进行。
- **插件管理**：新增 Capacitor 插件后，必须重新运行 `npx cap sync` 以更新原生工程的 `build.gradle` 依赖。
- **资源路径**：严禁手动修改 `android/app/src/main/assets/public/` 下的文件，所有变更应通过前端构建流程自动同步。
- **Java 版本**：项目要求 Java 17 兼容性（由 `capacitor.build.gradle` 强制指定）。
