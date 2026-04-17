# 03 · Protocol(标记协议)

定义模型产出给渲染器的标记格式、生命周期、错误恢复、编辑协议。

---

## 设计目标

- **流式友好**:半完成状态下可渲染
- **解析简单**:解析器 <200 行代码
- **错误容忍**:未闭合标签、非法嵌套都有兜底
- **可扩展**:新 widget 类型不改协议
- **可编辑**:支持定位到已有 artifact 的 widget 做修改

---

## 基本语法

标记使用 XML-like 语法。**保留标签**只有下面列出的几个。其他都是原始内容。

### 完整示例

```xml
<plan recipe="explainer" depth="standard">
  <phase id="p1" goal="搭建 OAuth 流程骨架">
    <acceptance>
      <criterion type="widget_exists" widget="svg"/>
      <criterion type="covers_topics" topics="授权码流程,4个角色,token 换取"/>
    </acceptance>
  </phase>
  <phase id="p2" goal="填充每一步的细节">
    <acceptance>
      <criterion type="word_count" min="200" max="500"/>
    </acceptance>
  </phase>
</plan>

<phase id="p1">
  <think>
    这是一个概念解释请求,我会先用图再用文字。先画流程图。
  </think>

  <widget id="w1" type="svg" title="OAuth 授权码流程">
    <svg viewBox="0 0 600 400">
      ...
    </svg>
  </widget>

  <widget id="w2" type="markdown">
# OAuth 2.0 授权流程

上图展示了四个角色之间的交互...
  </widget>

  <milestone/>
</phase>

<phase id="p2">
  ...
</phase>
```

---

## 标签参考

### `<plan>`

**位置**:响应的最开头。

**属性**:
- `recipe`(可选):使用的 recipe id
- `depth`(可选):skim / standard / deep-dive

**子元素**:
- 1-5 个 `<phase>`(仅声明,不含内容)

**语义**:这是整个 artifact 的规划声明。UI 收到后立即展示进度指示器。

---

### `<phase>`

**两种出现位置**:

1. **在 `<plan>` 里**(声明态):只含 `goal` 和 `acceptance`
2. **在 `<plan>` 之后**(执行态):含实际内容

**属性**:
- `id`(必需):phase 唯一标识,两种出现位置的 id 必须一致
- `goal`(声明态必需):一句话目标

**子元素**(声明态):
- `<acceptance>`:验收标准

**子元素**(执行态):
- `<think>`(0-1 个)
- `<widget>`(0+ 个)
- `<milestone/>`(0-1 个,建议放在末尾)

**语义**:phase 是 Orchestrator 的工作单元。一个 phase 内的内容在 Critic 介入前视为一个整体。

---

### `<acceptance>` 和 `<criterion>`

结构化的验收标准,便于 Critic 机械化检查。

**类型枚举**:

| type | 参数 | 说明 |
|---|---|---|
| `widget_exists` | `widget="type"` | 必须产出某种 widget |
| `widget_count` | `widget="type" min=".." max=".."` | 某种 widget 数量范围 |
| `word_count` | `min=".." max=".."` | 文字总量(markdown widget 内) |
| `covers_topics` | `topics="a,b,c"` | 必须覆盖的主题点 |
| `has_title` | - | 必须有标题 |
| `semantic` | `desc="..."` | 无法机械检查时的兜底,调 Critic |

**例**:
```xml
<acceptance>
  <criterion type="widget_exists" widget="svg"/>
  <criterion type="word_count" min="100" max="300"/>
  <criterion type="covers_topics" topics="authorization code, token exchange"/>
</acceptance>
```

设计上强制**至少 1 个机械可检查的 criterion**。不能只有 `semantic`。这保证 Critic 有低成本的 fast path。

---

### `<think>`

**属性**:无

**内容**:自由文本,模型的思考过程

**渲染**:UI 以可折叠气泡展示,默认折叠

**约束**:
- 单个 `<think>` ≤ 300 token 输出
- 一个 phase 内最多 1 个 `<think>`(一般在 phase 开头)

---

### `<widget>`

**属性**:
- `id`(必需):widget 唯一标识
- `type`(必需):widget 类型,必须在 WidgetRegistry 中注册
- `title`(可选):用户可见的标题
- 其他属性由具体 widget 类型定义(见 skill pack 的 widgets/*.md)

**子元素**:
- 原始内容,由 widget 自己解析

**生命周期事件**:
- 开标签到达 → `widget.opened`,挂载骨架屏
- 内容流入 → `widget.chunk`,widget 决定是否实时更新
- 闭标签到达 → `widget.closed`,最终化 + 入场动画

**id 稳定性**(重要):
- 同一 artifact 内 id 必须唯一
- 编辑场景下,引用已有 widget 必须用其原 id(见"编辑协议"章节)
- 新建 widget 应生成不与现有 id 冲突的新 id

---

### `<milestone/>`

**属性**:无

**语义**:模型主动标记"我觉得这个 phase 做完了"。

**Orchestrator 处理**:
- 收到 milestone → 触发 Critic
- Phase 闭合标签 `</phase>` 时若没有 milestone,Orchestrator **强制插入**一个 milestone

**用途**:允许模型在 phase 中间请求"提前检查"。罕见场景用。

---

## 流式解析

解析器不构建完整 AST,只做**基于开闭标签的事件分发**。

### 状态机

```
idle
 ├─ 遇到 <plan>       → in_plan
 ├─ 遇到 <phase>      → in_phase
 ├─ 遇到其他保留标签   → 按对应状态
 └─ 遇到裸文本        → 作为隐式 markdown widget

in_plan
 └─ 遇到 </plan>      → idle,发 plan.created

in_phase
 ├─ 遇到 <widget>     → in_widget
 ├─ 遇到 <think>      → in_think
 ├─ 遇到 <milestone/> → 发 milestone 事件
 └─ 遇到 </phase>     → idle,若无 milestone 则插入一个

in_widget
 ├─ chunk 到达        → widget.chunk
 └─ 遇到 </widget>    → in_phase,发 widget.closed

in_think
 ├─ chunk 到达        → think.chunk(UI 累积显示)
 └─ 遇到 </think>     → in_phase
```

**关键点**:
- 解析器**不理解 widget 内部结构**,原样转发 chunk
- HTML / SVG 内部的 `<div>` 、`<svg>` 这些**不被当成协议标签**,因为它们在 `<widget>` 体内
- 协议标签的识别方式:顶层 + 明确的保留名(plan / phase / widget / think / milestone / acceptance / criterion)

---

## 错误恢复

协议必须应对模型犯错的情况。以下是每种错误的处理策略:

### E1. 未闭合的 widget

**场景**:`<widget>...`,没有 `</widget>`,后面出现了另一个 `<widget>` 或 `</phase>`

**处理**:
- 检测到同级新标签时,强制闭合上一个 widget
- 发 `widget.closed` 事件,但标记为 `partial=true`
- Widget 实例根据 partial 标志决定显示方式(通常显示"内容被截断")
- Critic 的 Structural Check 会将 partial widget 判定为失败,触发档位 1 重试

### E2. 非法嵌套的 widget

**场景**:`<widget>` 内部又出现 `<widget>`

**处理**:
- 忽略内层的 `<widget>` 开标签,作为原始文本处理
- 记录 warning 事件(可观测性)
- 不立即失败(内容可能还能看)

### E3. 未知的 widget type

**场景**:`<widget type="unknown_type">`

**处理**:
- 降级为 markdown widget
- 发出 warning
- 内容原样作为 markdown 渲染

### E4. 孤儿 phase(没有对应 plan 声明)

**场景**:`<phase id="p99">` 但 plan 里没有 p99

**处理**:
- 动态追加一个 phase 声明(goal="未声明",acceptance 最小化)
- 记录 warning
- 执行继续,但 Critic 对此 phase 用最宽松的检查

### E5. Plan 为空或缺失

**场景**:模型直接开始 `<phase>` 没有 `<plan>`,或 `<plan>` 为空

**处理**:
- 视为"单 phase 隐式请求"
- 创建一个隐式 plan 包含一个 phase
- 不触发 ReviewPhase(因为没有多 phase 一致性可言)

### E6. 裸文本(不在任何 widget 内)

**场景**:`<phase>` 里直接写内容,没有包在 `<widget>` 里

**处理**:
- 隐式包装成 markdown widget
- 发 warning
- 继续处理

### E7. 流中断(模型响应截断)

**场景**:网络中断、模型超时,流没发完就结束

**处理**:
- 当前所有 open 状态的标签强制闭合,标记 partial
- 当前 phase 标记为 incomplete
- Orchestrator 收到流结束信号后判断:
  - 已完成 phase ≥1 个 → 交付已完成部分 + 提示"生成中断"
  - 0 个完成的 phase → 返回错误给用户

---

## 编辑协议(Edit Mode)

针对 V1 的迭代编辑需求。不是全功能的 edit-in-place,而是"有限的局部修改"。

### 触发条件

用户对已有 artifact 发起修改请求(如"把第二个图改成横向"、"再加一段关于 X 的说明")。Orchestrator 判断这是**编辑请求**而非新建请求,进入 Edit Mode。

### 编辑协议的特殊标签

模型在 Edit Mode 下,输出的响应**顶层不再是 `<plan>`,而是 `<edit>`**:

```xml
<edit target_artifact="a_xxx">
  <think>用户想把第二个图从竖向改成横向</think>

  <modify widget_id="w2">
    <widget id="w2" type="svg" title="OAuth 授权码流程(横向)">
      <svg viewBox="0 0 800 200">...</svg>
    </widget>
  </modify>

  <!-- 也可以是: -->
  <append_after widget_id="w3">
    <widget id="w4_new" type="markdown">
# 补充说明
...
    </widget>
  </append_after>

  <remove widget_id="w5"/>
</edit>
```

### 编辑操作类型

| 标签 | 含义 |
|---|---|
| `<modify widget_id="...">` | 替换某个 widget 的全部内容 |
| `<append_after widget_id="...">` | 在某 widget 之后插入新 widget |
| `<prepend_before widget_id="...">` | 在某 widget 之前插入 |
| `<remove widget_id="..."/>` | 删除某 widget |
| `<replace_all>` | 整个 artifact 重写(降级为"新建") |

### Edit Mode 的约束

- 一次 `<edit>` 不得包含超过 5 个操作(避免大改伪装成小改)
- `modify` 时新的 widget id 必须与原 id 相同
- `append/prepend` 时新 widget id 必须是新的(不能复用已有 id)
- `remove` 后续 operation 不能再引用已删除的 widget id

### 为什么是 widget 粒度不是更细

- 文本级的 patch(行号、字符偏移)在流式场景下不可靠
- Widget 是天然的"原子单位",用户对 artifact 的认知也是以 widget 为单位
- 粒度更细 = 模型更容易搞错边界 = 结果不稳定

**反向取舍**:如果用户说"把标题改一个字",我们宁可重新生成整个 widget 也不做字符级 patch。这是 V1 的设计权衡。

### Edit Mode 下的 Orchestrator 行为

- **不走完整 Plan 流程**,而是走单 phase 流程
- **Critic 只做 Structural Check**,不做全文 coherence 检查
- **Budget 比新建少**(通常只有 1/3)
- **不触发 ReviewPhase**

这让编辑快速响应,不像新建那么重。

---

## Schema 版本化

协议本身的版本通过响应的首标签属性标记:

```xml
<plan protocol_version="1.0" ...>
```

或 edit:
```xml
<edit protocol_version="1.0" ...>
```

V1 固定 `1.0`。未来协议升级时解析器按版本切换行为。模型的 skill pack 也要声明所依赖的协议版本。

---

## 设计权衡记录

一些当前选择背后的取舍:

**为什么用 XML-like 而非 JSON?**
流式场景下 JSON 半截解析痛苦。XML 可以"识别到标签就处理",结构也更容易被模型准确产出。

**为什么 milestone 可选而非必需?**
Phase 末尾由 Orchestrator 强制触发,milestone 是模型"主动请求提前检查"的机制,大部分情况用不到,所以设为可选。

**为什么 acceptance 结构化?**
让 Critic 60% 的工作由代码做,不用调模型。这是成本和稳定性的关键。

**为什么编辑协议不支持跨 artifact?**
一次编辑应该聚焦单个 artifact,跨 artifact 编辑会让状态管理极度复杂。用户如果要跨 artifact 改,应该发起新请求。
