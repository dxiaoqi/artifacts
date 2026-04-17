# 05 · Render Runtime(流式渲染运行时)

接收 Orchestrator 产出的标记流,解析并驱动 widget 渲染。这一层相对独立,职责清晰。

---

## 模块组成

```
                  标记流 (从 Orchestrator)
                        ↓
              ┌──────────────────┐
              │  StreamParser    │  识别保留标签 + 分 chunk
              └─────────┬────────┘
                        ↓ 解析事件
              ┌──────────────────┐
              │  Dispatcher      │  按 widget 路由 chunk
              └─────────┬────────┘
                        ↓
              ┌──────────────────┐
              │  WidgetRegistry  │  查 type 映射到实现类
              └─────────┬────────┘
                        ↓
              ┌──────────────────┐
              │  Widget 实例      │  挂载/更新/卸载
              └─────────┬────────┘
                        ↑
              ┌──────────────────┐
              │  ContextBus      │  注入 sendPrompt / tool / state
              └──────────────────┘
```

---

## StreamParser

### 职责

- 接收字符流
- 识别保留标签边界
- 发出解析事件

### 状态机

参见 03 号文档。这里补充实现要点。

### 解析策略

**基于 token 扫描,不做完整 XML 解析**。

伪代码思路:
```
buffer = ""
state = idle
open_widgets = []   // 栈结构,处理嵌套

onChunk(text):
  buffer += text
  while 可以从 buffer 抽出一个保留标签:
    extract_tag()
    dispatch_event()
  flush_content_to_current_widget()
```

**保留标签识别**:
- 只识别顶层出现的保留名:plan / phase / widget / think / milestone / acceptance / criterion / edit / modify / append_after / prepend_before / remove
- 在 `<widget>` 内部,其他标签(包括 HTML 的 `<div>`)不被识别为协议标签,原样作为 chunk 转发
- 自闭合标签 `<milestone/>` 特别处理

**chunk 转发策略**:
- `<widget>` 内的内容,按字符边界转发给 widget(不要累积到完整再转)
- 但对于 "半个标签" 的情况要缓冲(例如 buffer 末尾是 `<wid`,需要等更多字符判断这是 `<widget>` 还是别的)

### 解析事件

对外发出的事件:
- `parser.plan_started` / `parser.plan_finished`
- `parser.phase_started(id)` / `parser.phase_finished(id)`
- `parser.widget_opened(id, type, props)`
- `parser.widget_chunk(id, text)`
- `parser.widget_closed(id, partial?)`
- `parser.think_started` / `parser.think_chunk` / `parser.think_finished`
- `parser.milestone(phase_id)`
- `parser.warning(code, detail)` — 用于错误恢复的软提示

---

## Dispatcher

### 职责

- 接收 parser 事件
- 维护当前活动 widget 的映射表
- 把 chunk 路由到正确的 widget 实例
- 处理错误恢复

### 关键逻辑

- 收到 `widget_opened` → 查 WidgetRegistry 创建实例 → 触发实例 `onOpen(props)`
- 收到 `widget_chunk` → 找到实例 → 触发 `onChunk(text)`
- 收到 `widget_closed` → 触发 `onClose(partial)` → 从活动表移除
- 未匹配的 widget_id 操作 → 记录 warning,忽略(容错)

### 活动 widget 表

```
activeWidgets: Map<widget_id, WidgetInstance>
```

同时最多活动 widget 数量有上限(建议 10),防止异常情况下无限创建实例。

---

## WidgetRegistry

### 职责

- 维护 widget type → 实现类的映射
- 支持注册和查询
- 提供默认 fallback

### 接口

```
register(type: string, widgetClass: typeof Widget)
get(type: string): typeof Widget    // 找不到返回 MarkdownWidget 作为 fallback
list(): WidgetType[]
```

### 注册时机

- 系统启动时批量注册内置 widget
- 用户/开发者扩展时手动注册
- 不做运行时热加载(V1 简化)

---

## Widget 统一接口

每个 widget 实现以下生命周期:

```
interface Widget {
  // 构造时收到 props 和 contextBus
  constructor(props: WidgetProps, bus: ContextBus)

  // 开标签到达,挂载骨架屏
  onOpen(): void

  // 内容流入(某些 widget 会实时更新,某些会缓冲)
  onChunk(text: string): void

  // 闭标签到达,最终化 + 入场动画
  onClose(partial: boolean): void

  // 卸载时清理(比如定时器、事件监听)
  onUnmount(): void

  // 被 edit 修改时的 hook(可选)
  onReopen?(newProps: WidgetProps): void
}
```

### 流式策略矩阵

不同 widget 对流式内容的处理策略:

| Widget | onChunk 策略 | 骨架屏 | onClose 行为 |
|---|---|---|---|
| markdown | 实时追加,边到边显示 | 几行灰色占位 | 无特殊处理 |
| svg | 全量缓冲 | 框架占位(保留预期尺寸) | 一次性 innerHTML + 入场动画 |
| html | 全量缓冲 | 骨架 | 一次性 innerHTML + 入场动画,然后绑定事件 |
| chart | 全量缓冲 | 骨架占位(保留尺寸) | 解析 data,初始化图表库 |
| 自定义交互 | 全量缓冲 | 骨架 | 全量挂载 |

**关键**:除 markdown 外,都是"骨架屏 → 全量 swap"模式,不要试图对 SVG/HTML 做逐 token 渲染。

---

## ContextBus

### 职责

- 给 widget 提供统一的外部能力
- 作用域管理(widget / artifact / session)
- 权限和速率限制

### API

```
interface ContextBus {
  // 向主会话注入 prompt
  sendPrompt(text: string): Promise<void>

  // 调用 tool
  callTool(name: string, args: any): Promise<any>

  // 状态读写(作用域: artifact)
  getState(key: string): any
  setState(key: string, value: any): void

  // 派发事件(用于动画联动等)
  emit(event: string, payload?: any): void
  on(event: string, handler: Function): () => void  // 返回取消函数

  // 元信息
  readonly widgetId: string
  readonly phaseId: string
  readonly artifactId: string
}
```

### 作用域嵌套

```
session (跨多个 artifact,如用户偏好)
  └── artifact (一次完整产出)
        └── plan
              └── phase
                    └── widget (单个组件)
```

`getState/setState` 默认作用域在 **artifact**。跨 widget 的共享通过同一 artifact 的 state。跨 artifact 的共享通过显式 session API(不在 widget ContextBus 里暴露)。

### 速率限制

- `sendPrompt`:单 widget 10 秒内最多 1 次
- `callTool`:单 widget 30 秒内最多 5 次
- 超限 → 返回 rate_limit 错误,不抛异常(让 widget 优雅处理)

### Tool 调用

```
callTool(name, args) 的内部流程:
  1. 查询 Tool Registry,找到 handler
  2. 如果 tool 标记 needs_confirmation,触发 UI 确认
  3. 用户确认后执行 handler
  4. 结果返回给 widget
```

Tool 本身的定义:

```
interface Tool {
  name: string
  description: string
  paramsSchema: JSONSchema
  handler: (args) => Promise<any>
  needsConfirmation?: boolean
  ratelimit?: { count: number, window: number }
}
```

### 安全约束

- `sendPrompt` 内容进入主会话前,由 Orchestrator 审查(过长?注入?)
- `callTool` 参数 schema 验证
- Widget 运行在受限环境(如果是 html widget,考虑 sandbox)

---

## 渲染层与 UI 层的边界

- Render Runtime **不直接操作 UI 的全局状态**(比如 chat message 列表)
- Render Runtime **只管 artifact 容器内部**的 widget 渲染
- UI 层负责 artifact 容器的布局、切换、历史管理

换句话说:Render Runtime 提供一个 `render(container, stream)` 能力,UI 层决定把它挂载在哪、什么时候销毁、怎么切换。

---

## 错误处理

Render Runtime 里的错误处理原则:

- **解析错误不抛异常,发 warning 事件**
- **Widget 内部错误隔离**,单个 widget 渲染失败不影响其他 widget
- **整个 runtime 崩溃有兜底**:展示错误占位 + 提示用户重新生成
- **所有错误事件上报到可观测系统**(不吞异常)

错误的具体分类参见 08 号文档。

---

## 测试要点

Render Runtime 是少数可以做充分单元测试的模块。必须测的:

1. **标记流边界情况**:标签跨 chunk 分片、未闭合、非法嵌套
2. **widget 生命周期**:onOpen → onChunk × N → onClose 顺序
3. **错误恢复**:每个 E1-E7 场景都要有测试
4. **ContextBus 速率限制**
5. **作用域隔离**:widget A 的 state 变化不影响 widget B

这些测试是 Step 1 MVP 必须做的,早期投入回报极高。

---

## V1 简化

- 不做服务端渲染(SSR)
- 不做 widget 的热加载(修改 widget 类需要刷新)
- 不做 widget 的持久化状态(state 随 session 清空)
- 不做 widget 之间的复杂依赖管理

这些都可以在 V1 跑通后再加。
