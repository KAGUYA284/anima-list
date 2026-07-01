## 1. 使用的系统与方式
该仓库**未集成专用的日志框架**（如 Winston、Pino、Logback 等）。日志记录完全依赖于 JavaScript 环境原生的 `console` 对象（`console.log`, `console.error`）以及 Android Gradle 构建脚本中的 `logger` 实例。这是一种典型的开发阶段简易调试模式，缺乏生产环境所需的日志分级管理、持久化存储或远程上报能力。

## 2. 关键文件与位置
- **Web/前端逻辑**：`www/index.html` (及 `android/app/src/main/assets/public/index.html`) - 包含内联的 React 业务逻辑，使用 `console.error('Failed to save:', e)` 进行错误捕获输出。
- **构建脚本**：`android/app/build.gradle` - 在 Gradle 配置中使用 `logger.info` 处理 Google Services 插件缺失的提示信息。
- **辅助脚本**：`_check.js`, `_server.js` - 本地开发工具脚本，使用 `console.log` 和 `console.error` 输出运行状态。

## 3. 架构与约定
- **混合应用桥接日志**：作为基于 Capacitor 的混合应用，前端 Web 容器的 `console` 输出通常会被桥接到 Android 的 Logcat 中。目前架构下，开发者需通过 Android Studio 的 Logcat 或浏览器开发者工具查看日志。
- **无结构化日志**：所有日志均为纯文本字符串，没有统一的字段结构（如 timestamp, level, module, traceId），不利于自动化分析或监控。
- **无日志级别策略**：除了简单的 `error` 和 `log/info` 区分外，没有定义 WARN、DEBUG、TRACE 等细粒度级别，也没有在生产环境中屏蔽调试日志的机制。

## 4. 开发者应遵循的规则与建议
- **当前约束**：由于缺乏统一入口，目前在代码中直接使用 `console.*` 是唯一的日志记录方式。
- **改进建议**：
  1. **封装日志工具类**：建议创建一个统一的 `logger.ts` 模块，封装 `console` 调用，以便未来接入第三方日志服务或实现本地文件写入（利用 `@capacitor/filesystem`）。
  2. **环境隔离**：根据 `process.env.NODE_ENV` 控制日志输出，确保生产包（Production Build）中不包含敏感的调试信息。
  3. **错误追踪**：对于 `console.error` 捕获的异常，建议增加堆栈跟踪信息的格式化输出，或集成 Sentry 等错误监控平台。