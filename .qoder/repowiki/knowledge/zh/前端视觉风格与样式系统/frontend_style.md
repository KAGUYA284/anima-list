## 1. 样式系统与架构
该项目采用**原生 CSS (Vanilla CSS)** 作为唯一的样式解决方案，未引入 Tailwind CSS、Bootstrap 或 CSS-in-JS 库。所有样式均内联于 `www/index.html` 的 `<style>` 标签中，属于典型的**单文件 SPA (Single Page Application)** 架构。

- **CSS 方法论**：采用语义化类名（如 `.anime-card`, `.header-content`, `.btn-primary`），遵循 BEM 的简化变体或功能导向命名。
- **设计令牌 (Design Tokens)**：通过硬编码的颜色值和尺寸单位实现视觉一致性。
  - **主色调**：`#e94560` (红色系)，用于主要按钮、激活状态和进度条渐变。
  - **背景色**：`#f8f9fb` (浅灰白)，用于页面背景和 Android 原生主题背景，确保启动时不闪烁。
  - **文本色**：`#1f2937` (深灰) 用于标题，`#6b7280` / `#9ca3af` 用于次要文本。
  - **圆角规范**：普遍使用 `0.5rem` - `0.75rem` 的圆角，按钮和标签使用 `9999px` 实现胶囊形状。

## 2. 核心视觉特征
- **毛玻璃效果 (Glassmorphism)**：顶部导航栏、筛选栏和搜索栏使用了 `backdrop-filter: blur(12px)` 和半透明背景 (`rgba(255,255,255,0.92)`)，在滚动时提供现代感的层级透视效果。
- **微交互与动画**：
  - **Toast 提示**：使用 `@keyframes toastIn` 实现从底部滑入并淡出的动画。
  - **模态框**：导入/导出弹窗使用 `modalSlideUp` 动画从底部滑出。
  - **折叠面板**：年份/季度分组支持展开/折叠，通过 `max-height` 过渡实现平滑动画。
  - **滚轮选择器**：集数选择器使用 `scroll-snap-type: y mandatory` 实现原生般的滚轮吸附效果。
- **状态可视化**：
  - **进度条**：使用线性渐变 (`linear-gradient(to right, #e94560, #f97316)`) 展示观看进度。
  - **状态徽章**：不同观看状态（想看、在看、已看完等）对应不同的背景色和文字色组合（如 `#dcfce7` 配 `#15803d`）。

## 3. 移动端适配策略
- **响应式布局**：内容区域限制最大宽度 `max-width: 800px` 并居中，适配桌面端浏览；在移动端则占满屏幕。
- **安全区域处理**：模态框底部使用 `padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px))` 适配 iPhone X+ 等全面屏设备的 Home Indicator。
- **触摸优化**：
  - 滚动容器启用 `-webkit-overflow-scrolling: touch`。
  - 隐藏水平滚动条 (`scrollbar-width: none`) 以提升筛选栏的视觉整洁度。
  - 针对移动端隐藏“粘贴导入”功能（因 Clipboard API 限制）。
- **原生主题同步**：Android 原生层 (`styles.xml`) 的背景色 `#f8f9fb` 与 Web 层背景色保持一致，消除 WebView 加载前的白屏差异。

## 4. 开发者规范与建议
- **样式维护**：当前所有 CSS 集中在一个文件中，随着功能增加可能导致维护困难。建议后续重构时将 CSS 提取为独立模块（如 `styles.css`）或引入 CSS 预处理器。
- **颜色管理**：目前颜色值分散在 CSS 规则中。建议引入 CSS 自定义属性（Variables）统一管理主题色，以便未来轻松支持**暗色模式**（项目文档中已列为改进建议）。
- **组件化趋势**：虽然当前是 Vanilla JS，但项目依赖中包含了 React。若迁移至 React，应将现有的 CSS 类映射为 Styled-components 或 CSS Modules，以保持样式的局部作用域。