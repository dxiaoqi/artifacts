# Design Theme

所有视觉 widget 使用以下颜色，保持视觉一致性。

## 色板

- 主色：`#6366f1`（靛紫）、`#8b5cf6`（紫）
- 辅色：`#3b82f6`（蓝）、`#10b981`（绿）、`#f59e0b`（橙）、`#ef4444`（红）
- 中性：`#0f172a`（深灰）、`#1e293b`（灰）、`#64748b`（中灰）、`#94a3b8`（浅灰）、`#f8fafc`（极浅灰）

## SVG 颜色使用

- 节点背景：主色 + `opacity="0.15"` 作填充，主色作描边
- 连接线：`#94a3b8`，宽度 1.5-2px
- 文字：`#1e293b`（深色背景上用 white）
- 强调：`#6366f1`

## HTML Widget 样式

```css
font-family: system-ui, -apple-system, sans-serif;
background: #f8fafc;
border-radius: 12px;
padding: 20px;
```

按钮主色：`background: #6366f1; color: white; border: none; border-radius: 8px; padding: 8px 20px; cursor: pointer`
按钮次要：`background: #e2e8f0; color: #1e293b; border: none; border-radius: 8px`
