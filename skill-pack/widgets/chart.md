# Chart Widget

## 用途

数据驱动的图表：柱状图、折线图、饼图、散点图。

**不适合**：手绘示意图（用 svg）、纯展示（用 markdown）。

## 语法

```xml
<widget id="w1" type="chart" title="图表标题">
{
  "type": "bar",
  "data": {
    "labels": ["A", "B", "C"],
    "datasets": [{
      "label": "数据系列",
      "data": [10, 20, 30],
      "backgroundColor": ["#6366f1", "#8b5cf6", "#3b82f6"]
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "legend": { "display": true }
    }
  }
}
</widget>
```

## 图表类型

- `bar` — 柱状图
- `line` — 折线图
- `pie` — 饼图
- `doughnut` — 环形图
- `radar` — 雷达图

## 约束

- 内容必须是合法 JSON
- `data.labels` 和 `data.datasets[].data` 长度必须相同
- 颜色推荐：`#6366f1`, `#8b5cf6`, `#3b82f6`, `#10b981`, `#f59e0b`, `#ef4444`
