# Protocol 速查

## 保留标签

| 标签 | 位置 | 含义 |
|---|---|---|
| `<plan>` | 响应开头 | 声明整个 artifact 的规划 |
| `<phase id="..." goal="...">` | plan 内（声明）或 plan 后（执行） | 工作单元 |
| `<widget id="..." type="...">` | phase 内 | 单个产出单元 |
| `<think>` | phase/plan 前（可选） | 决策说明（≤150字，每 phase 最多 1 个） |
| `<milestone/>` | phase 末尾 | 标记 phase 完成，**前必须走自检清单** |
| `<acceptance>/<criterion>` | plan 的 phase 声明中 | 验收标准 |

## Widget 类型

| type | 用途 | 流式策略 |
|---|---|---|
| `markdown` | 文本、列表、代码块 | 实时追加 |
| `svg` | 图示、流程图、架构图 | 全量缓冲后一次性渲染 |
| `html` | 可交互 UI | 全量缓冲后挂载 |
| `chart` | 数据可视化（JSON 格式） | 全量缓冲后初始化图表 |

## Criterion 类型

```xml
<criterion type="widget_exists" widget="svg"/>
<criterion type="word_count" min="100" max="500"/>
<criterion type="covers_topics" topics="主题1,主题2"/>
<criterion type="has_title"/>
<criterion type="semantic" desc="内容应该涵盖..."/>
```

## 完整示例（explainer 模式）

```xml
<think>
Audience: practitioner。结构性名词：授权流程、角色关系、token 交换。
决定：p1 用 svg 展示流程 + markdown 说明；p2 用 markdown 深入讲 + code 块。
</think>

<plan recipe="explainer" depth="standard">
  <phase id="p1" goal="用 SVG 流程图展示 OAuth 授权码流程的四个角色和六个步骤">
    <acceptance>
      <criterion type="widget_exists" widget="svg"/>
      <criterion type="has_title"/>
    </acceptance>
  </phase>
  <phase id="p2" goal="对比授权码 vs 隐式流的安全差异（表格+代码示例）">
    <acceptance>
      <criterion type="covers_topics" topics="授权码流,隐式流,安全差异"/>
      <criterion type="word_count" min="150" max="400"/>
    </acceptance>
  </phase>
</plan>

<phase id="p1">
  <think>本 phase 要画真实流程图。使用 svg，6 个步骤节点 + 箭头 + 角色分列。</think>
  <widget id="w1" type="svg" title="OAuth 授权码流程">
    <svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg">
      <!-- 使用 CSS 变量 -->
      <style>
        .node { fill: var(--color-accent, #6366f1); opacity: 0.85; }
        .label { fill: var(--color-fg, #e2e8f0); font-size: 12px; }
        .line { stroke: var(--color-muted, #94a3b8); stroke-width: 1.5; }
      </style>
      <!-- ... 真实内容 ... -->
    </svg>
  </widget>
  <widget id="w2" type="markdown">
上图展示了四个角色（用户、客户端、授权服务器、资源服务器）之间的完整交互...
  </widget>
  <milestone/>
</phase>
```

## 常见错误

❌ Phase goal 只有主题没有产出形态："概述 OAuth 的工作原理"
✅ Phase goal 包含动词+产出物："用 SVG 画出 OAuth 四个角色的交互流程图"

❌ SVG 里写死颜色：`fill="#6366f1"`
✅ 使用 CSS 变量：`fill="var(--color-accent, #6366f1)"`（fallback 可选）

❌ 所有内容用 markdown（占比 > 60%）
✅ 按请求类型混合 svg / html / chart
