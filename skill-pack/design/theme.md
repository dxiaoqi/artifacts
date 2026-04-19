# Design Theme

所有视觉 widget 使用以下颜色，保持视觉一致性。

## 色板

- 主色：`#6366f1`（靛紫）、`#8b5cf6`（紫）
- 辅色：`#3b82f6`（蓝）、`#10b981`（绿）、`#f59e0b`（橙）、`#ef4444`（红）
- 中性：`#0f172a`（深灰）、`#1e293b`（灰）、`#64748b`（中灰）、`#94a3b8`（浅灰）、`#f8fafc`（极浅灰）

## SVG 颜色使用

- **节点**：使用 `.c-blue` `.c-purple` 等 CSS 类，`rect`/`circle` 不手动设 `fill`/`stroke`
- **容器背景**（大框套小框）：`fill="[主色]" fill-opacity="0.06" stroke="[主色]" stroke-opacity="0.2" stroke-width="0.5"`
- **连接线**：`stroke="#94a3b8" stroke-width="1.5"`，箭头用 `class="arr" marker-end="url(#arrow)"`
- **文字**：节点内用 `class="th"`/`class="ts"`，不设 `fill`（由 CSS 类决定）
- **强调线/标注**：`stroke="#6366f1" stroke-dasharray="4,3"`

> 不要用 `#0f172a`、`#1e293b` 等深色作为节点的 `fill`，会渲染成黑色。

## HTML Widget 样式

```css
font-family: system-ui, -apple-system, sans-serif;
background: #f8fafc;
border-radius: 12px;
padding: 20px;
```

按钮主色：`background: #6366f1; color: white; border: none; border-radius: 8px; padding: 8px 20px; cursor: pointer`
按钮次要：`background: #e2e8f0; color: #1e293b; border: none; border-radius: 8px`
