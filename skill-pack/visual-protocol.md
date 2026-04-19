# Visual 协议规范

---

## 输出格式

响应由 `<text>` 和 `<visual>` 块交替组成。

```
<think>
1. 用户核心意图是什么？（动词是什么）
2. 是要"参考/结构"还是要"理解/体验"？
3. 内容有空间/流程/动态关系吗？
4. 节点有自然分层/分组吗？单行最多几个？是否需要拆图？
5. 有可操作控件吗？（决定 html 还是 svg）
6. 需要几个 visual？顺序是什么？
</think>

<text>
普通文字，支持 Markdown。
用于引导、解释、过渡、总结。
</text>

<visual type="svg">
<svg width="100%" viewBox="0 0 680 H">...</svg>
</visual>

<text>两个 visual 之间必须有 text 过渡，哪怕一句话。</text>

<visual type="html">
<!-- 完整 HTML 片段，不含 DOCTYPE/html/head/body -->
</visual>

<visual type="threejs">
// Three.js 代码，THREE 全局变量已注入，不写 import
</visual>
```

**规则**：
- `type` 必须声明：`svg` / `html` / `threejs`
- 两个 `<visual>` 之间必须有 `<text>` 过渡
- 每个 `<visual>` 只含一个 visual
- 不需要 visual 时只输出 `<text>` 块
- **`<visual>` 绝对不能嵌套在 `<text>` 里**：必须先 `</text>` 关闭文字块，再开 `<visual>`

---

## 路由决策（按优先级）

### 规则 0 — 不输出 Visual（否决）

以下只输出 `<text>`：
- 纯定义、建议、分析（无视觉意图词）
- 内容是并列枚举，无空间关系
- 用户说"告诉我/解释"但无"画/展示/图"等词
- 代码片段（用 Markdown 代码块，不用 visual）

### 规则 1 — 三维空间 → Three.js

触发：分子/天体/建筑/几何体，或"旋转""3D""360度"

### 规则 2 — 数值数据图表 → HTML + Chart.js

触发：有数值数据 + "趋势/分布/统计/对比"

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<canvas id="c" style="max-height:300px"></canvas>
<script>
new Chart(document.getElementById('c'), { type: 'bar', data: {...}, options: {...} })
</script>
```

### 规则 3 — 多阶段循环 → HTML Stepper

触发：3+ 个明确阶段，有顺序或循环关系（Krebs 循环、HTTP 生命周期、编译流程）

⚠️ **绝对不要画环形图**，循环用"下一步绕回第一步"表达。

```html
<div id="stepper">
  <div id="steps" style="display:flex;gap:8px;margin-bottom:16px"></div>
  <div id="content"></div>
  <div style="display:flex;gap:8px;margin-top:16px">
    <button onclick="prev()">← 上一步</button>
    <button onclick="next()">下一步 →</button>
  </div>
</div>
<script>
const steps = [{ title:'步骤1', body:'内容...' }, ...]
let cur = 0
function render() { /* 渲染当前步骤 */ }
function next() { cur = (cur+1) % steps.length; render() }
function prev() { cur = (cur-1+steps.length) % steps.length; render() }
render()
</script>
```

### 规则 4 — 解释机制 → 交互示意图或 SVG 示意图

触发：动词是"解释/讲明白/怎么工作/让我理解"

**4a**：主题有可操作控件（温度/速度/参数/输入）→ `<visual type="html">` 交互演示

**4b**：主题是纯视觉的，无需调节参数 → `<visual type="svg">` 示意图

⚠️ 反规则："解释 X 的**架构**"→ 动词是"解释"，意图是参考组件列表 → 触发规则 5，不是规则 4

### 规则 5 — 展示结构 → SVG

触发：动词是"画/展示/架构图/流程图/结构/列出"

**5a**：有顺序/决策分支 → SVG 流程图（从上到下）

**5b**：有包含/嵌套关系 → SVG 结构图（大框套小框）

**节点布局规则**（680px 宽，单行最多 4 个节点）：
- 节点有自然分层 → 每层一行，纵向叠层，单张图
- 对等节点 ≤ 4 → 单行
- 对等节点 5-8 → 2×N 网格
- 对等节点 > 8 → 总览图 + 子图
- 连线 > 10 条且严重交叉 → 拆图

---

## SVG 代码规范

```xml
<svg width="100%" viewBox="0 0 680 H">
  <!-- H = 最低元素的 y + height + 40，精确计算 -->
  <!-- 重要：所有元素的 y + height 必须 < H，否则会被裁剪 -->

  <!-- 箭头 marker（宿主已注入，如需自定义则覆盖） -->
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="currentColor"
            stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>

  <!-- ✅ 正确：使用预置色彩类，rect/circle 不设 fill/stroke，由 CSS 自动处理 -->
  <g class="node c-blue" onclick="sendPrompt('展开讲讲这个节点的细节')">
    <rect x="10" y="10" width="120" height="36" rx="6"/>
    <text x="70" y="33" text-anchor="middle" class="th">节点标题</text>
  </g>

  <!-- ✅ 容器背景（非节点）：使用 fill-opacity + 主色 -->
  <rect x="20" y="20" width="640" height="120" rx="12"
        fill="#6366f1" fill-opacity="0.06" stroke="#6366f1" stroke-opacity="0.2" stroke-width="0.5"/>

  <!-- ✅ 箭头连线 -->
  <line x1="130" y1="28" x2="190" y2="28" class="arr" marker-end="url(#arrow)"/>

  <!-- ❌ 错误示例（不要这样写）：
  <g class="c-blue">
    <g class="node">
      <rect fill="#1e293b"/>  ← 这会显示黑色！节点 rect 不要设 fill
    </g>
  </g>
  -->
</svg>
```

**可用类名**：
- 文字：`.t`（13px 主色）/ `.ts`（11px 次色）/ `.th`（13px 500weight）
- 形状：`.box` / `.arr` / `.leader`（虚线）
- 交互：`.node`（可点击，有 hover）
- 色彩：`.c-purple` / `.c-teal` / `.c-blue` / `.c-coral` / `.c-amber` / `.c-gray` / `.c-green` / `.c-red` / `.c-pink`

**颜色规则（关键）**：
- **节点 `rect`/`circle` 不设 `fill`/`stroke`/`fill-opacity`**，统一由 `.c-*` CSS 类控制
- `.c-blue` 类：填充 `#E6F1FB`（浅蓝），描边 `#185FA5`，文字 `#0C447C`
- `.c-purple` 类：填充 `#EEEDFE`（浅紫），描边 `#534AB7`，文字 `#3C3489`
- 容器背景（大框）：用 `fill-opacity="0.06"` + `stroke-opacity="0.2"` 半透明效果，**不用深色**

**约束**：
- `viewBox` 宽度固定 680，不要改
- 连线 `stroke-width` 用 `1.5`，节点边框由 CSS 控制（0.5px）
- 不要旋转文字
- 每个可点击节点：`onclick="sendPrompt('具体的下一个问题')"`
- 所有元素坐标 + 尺寸必须在 viewBox 范围内，超出会被截断

---

## HTML 代码规范

- **不含** `<!DOCTYPE>` `<html>` `<head>` `<body>`
- 颜色必须用 CSS 变量：`var(--text-primary)`, `var(--bg-secondary)`, `var(--accent)` 等
- 外部库只从以下 CDN：`cdnjs.cloudflare.com` / `cdn.jsdelivr.net` / `esm.sh` / `unpkg.com`
- 禁止 `position: fixed`
- 禁止 `localStorage` / `sessionStorage`，用 JS 变量管理状态
- `sendPrompt(text)` 全局可用，用于节点/按钮触发后续探索

---

## Three.js 代码规范

- `THREE` 全局变量已注入（r128），**不写 import**
- 自己管理 animate loop 和 window resize
- 默认黑色背景（3D 场景惯例）
- 不使用 `THREE.CapsuleGeometry`（r142 才有），用 `CylinderGeometry` 替代

---

## 多 Visual 规则

1. 先在 `<think>` 里规划数量和顺序
2. 每个 visual 前后都有 `<text>` 说明
3. 先输出总览图，再输出细节图
4. 每个 `<visual>` 必须自给自足，禁止"上图中的..."这类跨 visual 引用

---

## 禁止事项

- ❌ 禁止画环形布局（循环用 Stepper 或返回箭头）
- ❌ 禁止单行超过 4 个节点（可分层则先分层）
- ❌ 禁止用 Markdown 代码围栏包裹 SVG/HTML
- ❌ 禁止连续两个 `<visual>` 没有 `<text>` 过渡
- ❌ 禁止使用 `position: fixed`
- ❌ 禁止使用 `localStorage`
- ❌ 禁止 `<function_calls>`、`<invoke>`、`str_replace_editor` 等其他工具调用格式
