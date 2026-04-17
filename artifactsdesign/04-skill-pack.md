# 04 · Skill Pack(对模型的约束)

Skill Pack 是一组静态 markdown 文件,存放在文件系统,作为 prompt 的一部分(或分块按需加载)注入到模型 context。它不是代码,不在运行时被执行。

目标:**用最少的 context tokens 让模型按协议、按风格、按约束产出**。

---

## 核心机制:分层按需加载

**反模式**:把所有 widget 规范、设计规范、recipe 全部塞进 system prompt。后果是 context 膨胀、关键指令被稀释、成本高。

**正确模式**:
- `SKILL.md` 是永远加载的入口,只含发现规则
- 具体 widget 的规范、recipe 按需加载
- Orchestrator 根据意图判断结果,决定加载哪些子文件

---

## 目录结构

```
skill-pack/
├── SKILL.md                    ← 永远加载,入口
├── protocol.md                 ← 永远加载,协议约束
├── widgets/
│   ├── _index.md               ← 永远加载,widget 目录
│   ├── markdown.md             ← 按需
│   ├── svg.md                  ← 按需
│   ├── html.md                 ← 按需
│   ├── chart.md                ← 按需
│   └── <custom>.md
├── design/
│   ├── theme.md                ← 涉及视觉时加载
│   └── animation.md            ← 涉及动画时加载
├── context/
│   └── api.md                  ← 涉及交互时加载
└── recipes/
    ├── _index.md               ← 永远加载,recipe 目录
    ├── explainer.md            ← 按需
    ├── dashboard.md            ← 按需
    ├── tutorial.md             ← 按需
    └── exploration.md          ← 按需
```

**永远加载的文件**:SKILL.md + protocol.md + widgets/_index.md + recipes/_index.md
这 4 个文件加起来应该 ≤ 2000 tokens。

**按需加载**:其他所有文件。Orchestrator 根据意图判断决定。

---

## SKILL.md(入口文件)

这是模型看到的第一份 skill 文档。必须极简、清晰、是"导航"而非"内容"。

### 模板

```markdown
# Streaming Artifacts Skill

## 你在做什么

你在通过一套流式 artifact 系统产出内容。你的响应必须符合 `protocol.md`
定义的标记协议。这套系统会:
- 流式解析你的响应
- 按 widget 切分并渲染给用户
- 在你声明的 milestone 处做质量检查
- 根据 Orchestrator 的控制信号决定是否重试或继续

## 基本流程

每次响应都按以下结构:

1. 先输出 `<plan>`,声明你打算分几个 phase,每个 phase 的 goal 和 acceptance
2. 然后按 phase 顺序产出内容
3. 每个 phase 内部使用 `<widget>` 包裹具体产出
4. 每个 phase 结束用 `<milestone/>` 标记(可选,Orchestrator 也会自动插入)

## 发现规则

- 需要解释概念 → 参考 `recipes/explainer.md`
- 需要展示数据/状态 → 参考 `recipes/dashboard.md`
- 需要教学/步骤 → 参考 `recipes/tutorial.md`
- 需要可交互探索 → 参考 `recipes/exploration.md`
- 找不到合适的 recipe → 自己组合 widget,参考 `widgets/_index.md`

## 关键约束

- Plan 最多 5 个 phase
- 每个 phase 应对应一个可独立评估的用户价值
- 涉及视觉时必须加载 `design/theme.md` 并使用其中的 CSS 变量
- 涉及交互时必须加载 `context/api.md`
- 每个 widget 必须有唯一 id
- 不要在 `<widget>` 之间写裸文本(会被包成隐式 markdown,但不推荐)

## 错误时

如果 Critic 返回"未达成",你会收到反馈,重新产出当前 phase。不要重做整个 plan。
如果 Orchestrator 指示切换策略,按指示执行,不要坚持原方案。
```

**硬性要求**:SKILL.md 必须 ≤ 800 tokens。这是永远占 context 的文件,不能胖。

---

## protocol.md

协议语法的速查版,给模型看的简化版。不是给解析器看的。

包含:
- 每个保留标签的作用和示例
- 最小产出示例(一个完整的响应)
- 常见错误和正确做法对比

**硬性要求**:≤ 1200 tokens。

---

## widgets/_index.md

widget 目录,一句话介绍 + 触发场景。

### 模板

```markdown
# Widget 目录

可用 widget 类型:

| type | 适用场景 | 详细规范 |
|---|---|---|
| markdown | 文本、解释、列表 | widgets/markdown.md |
| svg | 图示、流程、关系 | widgets/svg.md |
| html | 自定义交互 UI | widgets/html.md |
| chart | 数据可视化 | widgets/chart.md |

## 选择原则

- 优先 markdown(最便宜、最快、最稳)
- 只在文字无法表达结构时用 svg
- 只在需要可交互时用 html
- 数据驱动的图用 chart,手绘的图用 svg

## 组合原则

- 一个 phase 内的 widget 应该服务于同一个 goal
- 图 + 文说明的组合极常见(先图后文)
- 避免同一 phase 内超过 3 个 widget(拆 phase)
```

**硬性要求**:≤ 600 tokens。

---

## widgets/*.md 的标准结构

每个具体 widget 的规范文档,按需加载。每份必须包含以下章节:

### 1. 用途与场景

一段话说清楚:
- 这个 widget 适合什么
- 不适合什么
- 和其他 widget 的边界

### 2. 语法

```xml
<widget id="..." type="..." [其他属性]>
  ...内容...
</widget>
```

每个属性的含义、必需/可选。

### 3. 内容约束

- 最小/最大长度(字符或 token)
- 必需的结构元素
- 禁止的元素

### 4. 正面示例(3-5 个)

每个示例标注使用场景,展示不同风格。

### 5. 反面示例(2-3 个)

每个反例要说明**为什么不好**。这是质量杠杆。

### 6. 生命周期钩子

- onOpen 时 widget 会做什么
- onChunk 时如何处理流式输入
- onClose 时的最终化

### 7. 样例产出对比

给模型看"同样的请求用这个 widget 和用另一个 widget 的差异",帮助选型。

---

## design/theme.md

CSS 变量定义 + 使用约束。涉及视觉 widget(svg / html)时加载。

### 模板

```markdown
# Design Theme

所有视觉 widget 必须使用以下 CSS 变量,不要写死颜色和尺寸。

## 色板

- `--color-bg`: 背景
- `--color-fg`: 主文字
- `--color-muted`: 次要文字/辅助元素
- `--color-accent`: 强调色
- `--color-success` / `--color-warning` / `--color-danger`

## 排版

- `--font-display`: 标题字体
- `--font-body`: 正文字体
- `--font-mono`: 代码字体

## 间距

- `--space-xs` ~ `--space-xl`: 4/8/12/16/24/32/48

## 圆角与阴影

- `--radius-sm` / `--radius-md` / `--radius-lg`
- `--shadow-sm` / `--shadow-md`

## 时长

- `--duration-fast` / `--duration-base` / `--duration-slow`

## 使用范例

<svg>
  <rect fill="var(--color-accent)" rx="var(--radius-sm)"/>
</svg>
```

---

## design/animation.md

### 动画只用在三处

1. **入场**:widget 从骨架屏 swap 到内容时
2. **状态变化**:数据更新、选中、展开/折叠
3. **引导注意**:Critic 发现问题时高亮、HIL 请求时呼吸灯

### 禁止

- 纯装饰性循环动画
- 超过 400ms 的入场(打断阅读)
- 同一屏多个并发动画

### 实现约定

动画通过 CSS transition/animation 实现,不手写 JS 逐帧。每个 widget 暴露几个 CSS class,Animation Engine 在正确的生命周期节点加/减 class。

---

## context/api.md

交互 widget 通过 ContextBus 调用的 API,模型需要了解以下能力才能正确使用。

### 可用 API

- `sendPrompt(text)`:向主会话注入一条 prompt
- `callTool(name, args)`:调用注册的 tool
- `getState(key)` / `setState(key, value)`:访问共享状态
- `emit(event)`:派发自定义事件

### 使用约束

- `sendPrompt` 每个 widget 实例 10 秒内最多调用 1 次(防循环)
- `callTool` 调用涉及副作用的 tool 时,系统会弹确认框,设计 UI 时要考虑这点
- `setState` 只影响当前 artifact 作用域,不跨 artifact

### 典型模式

```html
<widget id="w1" type="html">
  <button onclick="sendPrompt('给我一个更深入的解释')">深入了解</button>
</widget>
```

---

## recipes/_index.md

recipe 目录,帮助模型快速选择。

### 模板

```markdown
# Recipe 目录

| id | 适用场景 | 典型 phase 数 | 详细 |
|---|---|---|---|
| explainer | 解释概念/原理 | 2-3 | recipes/explainer.md |
| dashboard | 展示数据/状态 | 1-2 | recipes/dashboard.md |
| tutorial | 步骤/教程 | 3-5 | recipes/tutorial.md |
| exploration | 可交互探索 | 2-3 | recipes/exploration.md |

## 选择决策

- 用户想"懂"某个东西 → explainer
- 用户想"看"某些数据 → dashboard
- 用户想"学会做"某事 → tutorial
- 用户想"玩一下"某个概念 → exploration

## 都不合适时

不匹配任何 recipe 的请求,按以下默认模板:
- 1 个 phase
- 根据产出主要形态选择 widget
- 简单 acceptance(widget_exists + 基本 word_count)
```

---

## recipes/*.md 的标准结构

每个 recipe 的完整规范。

### 1. 何时用这个 recipe

明确的触发条件。

### 2. 典型 plan 骨架

phase 的数量、每个 phase 的 goal 模板、acceptance 模板。

### 3. Widget 调色板

这个 recipe 下建议用哪些 widget、组合模式。

### 4. 完整示例

给一个真实请求,展示完整的响应应该长什么样(从 `<plan>` 到最后一个 `</phase>`)。

### 5. 反面示例

常见的"看起来像 explainer 但实际应该用 tutorial"的情况,帮模型不误选。

---

## Recipe 的数据结构(对应 Orchestrator 侧)

虽然 recipe 在 skill pack 里是 markdown,Orchestrator 侧需要一份元数据(可以是单独的 json 或从 markdown 解析):

```
Recipe {
  id: string
  when: {
    dimensions: { modality?, depth?, interactivity?, audience?, certainty? }
    keywords?: string[]    // 用户输入的关键词匹配
  }
  phase_templates: PhaseTemplate[]
  widget_palette: WidgetType[]
  constraints: {
    min_phases: number
    max_phases: number
    max_total_tokens: number
  }
  skill_files_to_load: string[]   // 触发此 recipe 时额外加载哪些 skill 文件
}
```

这份数据用于 Orchestrator 的 Layer B(Recipe Matching)。详见 06 号文档。

---

## Skill Pack 的维护原则

1. **每份文档有明确的 owner 章节**(在文件顶部),方便多人协作
2. **修改 SKILL.md / protocol.md 需要全链路测试**,因为它们影响所有响应
3. **增加新 widget 不需要改 SKILL.md**,只改 widgets/_index.md
4. **正反例子是质量杠杆,定期根据线上 bad case 补充**
5. **Token 预算监控**:每份文档有 token 上限,超了必须压缩

---

## 一些实现建议

- Skill Pack 文件在构建时可以被预处理(去掉注释、压缩空行)以节省 token
- `_index.md` 可以由代码从子目录扫描自动生成,避免手动维护不一致
- recipe 的元数据可以写在 recipe markdown 的 frontmatter 里(YAML),代码解析
- 生产环境建议对 skill pack 做 hash,context 里带版本 hash 便于追踪
