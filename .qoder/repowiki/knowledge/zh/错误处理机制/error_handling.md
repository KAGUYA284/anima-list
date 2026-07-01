该仓库未建立统一的错误处理架构，主要依赖语言原生的 `try...catch` 块进行局部异常捕获，并通过 UI 提示（Toast）或控制台日志呈现错误。

### 1. 前端逻辑 (JavaScript)
- **存储操作**：在 `loadFromStorage` 和 `saveToStorage` 中使用 `try...catch` 包裹 `localStorage` 操作。读取失败时返回默认空数组，写入失败时通过 `console.error` 记录日志，防止应用崩溃。
- **网络请求**：在 Bangumi API 搜索 (`searchBangumi`) 和详情获取 (`getBangumiSubject`) 中，通过检查 `res.ok` 判断 HTTP 状态。失败时返回空数组或 `null`，并在 UI 层显示“搜索失败”或“加载失败”的提示。
- **文件 I/O**：在导出/导入功能中，针对 `showSaveFilePicker` 和 `FileReader` 使用 `try...catch`。特别区分了用户主动取消（`AbortError`）与真实错误，仅对真实错误进行 Toast 提示。
- **全局策略**：缺乏全局错误边界（Error Boundary），错误处理分散在各个事件监听器中。

### 2. 后端/工具脚本 (Node.js)
- **静态服务**：`_server.js` 采用同步文件读取 (`fs.readFileSync`) 配合 `try...catch`。任何文件缺失或权限错误均统一返回 `404 Not found`，未区分具体错误类型。

### 3. Android 原生层 (Java/Gradle)
- **构建配置**：`build.gradle` 中使用 `try...catch` 检测 `google-services.json` 是否存在。若缺失则记录 Info 级别日志并跳过推送插件，属于非阻断式容错。
- **原生代码**：`MainActivity.java` 继承自 `BridgeActivity`，未重写任何错误回调或异常处理方法，依赖 Capacitor 框架的默认行为。

### 开发建议
- **统一错误类**：建议定义自定义 Error 类（如 `ApiError`, `StorageError`）以区分错误来源。
- **全局捕获**：在前端增加 `window.onerror` 或 React Error Boundary，防止未捕获异常导致白屏。
- **日志规范化**：将 `console.error` 替换为结构化日志工具，便于生产环境排查。