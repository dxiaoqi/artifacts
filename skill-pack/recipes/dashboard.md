# Dashboard Recipe

## 何时用

用户想看数据、状态概览、对比分析。
关键词："数据"、"统计"、"概览"、"对比"、"趋势"

## Phase Goal 规则

❌ "展示销售数据" → ✅ "用柱状图展示 Q1-Q4 销售额趋势，附最高/最低点标注"
❌ "分析各指标" → ✅ "用可交互 html 卡片展示 4 个核心 KPI，含环比变化色标"

## 典型 Plan 骨架

```xml
<plan recipe="dashboard" depth="standard">
  <phase id="p1" goal="用 chart/svg 可视化核心数据，标注关键趋势和异常点">
    <acceptance>
      <criterion type="widget_exists" widget="chart"/>
      <criterion type="has_title"/>
    </acceptance>
  </phase>
  <phase id="p2" goal="用 html 卡片展示关键 KPI 指标，附数据解读结论">
    <acceptance>
      <criterion type="word_count" min="80" max="250"/>
    </acceptance>
  </phase>
</plan>
```

## Widget 组合建议

- **chart widget**：柱/折/饼图，使用调色板颜色
- **html widget**：数字卡片、指标展示、可筛选表格
- **markdown**：分析结论（不超过 40%）
- **svg**：手绘风格数据图、架构关系图

## Chart 颜色规范

数据集颜色使用系统色板（不写死，通过 JS 注入变量值）：
```json
{
  "backgroundColor": ["var(--color-accent)", "var(--color-success)", "var(--color-warning)"]
}
```
若图表库不支持 CSS 变量，使用 fallback 色值：`#6366f1`, `#10b981`, `#f59e0b`, `#ef4444`, `#94a3b8`
