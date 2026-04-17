# SVG Widget

## 用途

用于绘制：流程图、架构图、关系图、状态机、时序图、概念示意图。

**不适合**：大量文字、数据表格（用 markdown）、需要点击交互（用 html）。

## 语法

```xml
<widget id="w1" type="svg" title="图表标题">
  <svg viewBox="0 0 宽 高" xmlns="http://www.w3.org/2000/svg">
    ...SVG 内容...
  </svg>
</widget>
```

## 约束

- viewBox 必须设置，建议宽高比合理（16:9 或 4:3）
- 宽度建议 400-800，高度建议 200-500
- 使用颜色时优先：`#6366f1`(紫)、`#8b5cf6`(紫2)、`#3b82f6`(蓝)、`#10b981`(绿)、`#f59e0b`(橙)、`#94a3b8`(灰)
- 文字 font-size 不小于 11，fill="white" 或 fill="#1e293b"
- 箭头使用 `<marker>` + `<line>` 或 `<path>`

## 正面示例

### 流程图

```xml
<widget id="w1" type="svg" title="登录流程">
  <svg viewBox="0 0 500 280" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8"/>
      </marker>
    </defs>
    <!-- 节点 -->
    <rect x="190" y="20" width="120" height="36" rx="18" fill="#6366f1"/>
    <text x="250" y="43" text-anchor="middle" fill="white" font-size="13" font-weight="600">用户输入</text>
    <line x1="250" y1="56" x2="250" y2="90" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr)"/>
    <rect x="190" y="90" width="120" height="36" rx="4" fill="#3b82f6"/>
    <text x="250" y="113" text-anchor="middle" fill="white" font-size="13">验证</text>
    <line x1="250" y1="126" x2="250" y2="160" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr)"/>
    <rect x="190" y="160" width="120" height="36" rx="4" fill="#10b981"/>
    <text x="250" y="183" text-anchor="middle" fill="white" font-size="13">登录成功</text>
  </svg>
</widget>
```

## 反面示例

❌ 不要用 SVG 写大量文字（用 markdown）
❌ 不要省略 xmlns 和 viewBox
❌ 不要用绝对像素大小（会在不同屏幕尺寸下溢出）
