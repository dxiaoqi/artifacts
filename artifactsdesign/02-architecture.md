# 02 · 整体架构

定义层级划分、模块边界、数据流、通信方式。具体实现细节在后续文档。

---

## 分层图

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer                                                    │
│  (类 Claude.ai: chat pane + artifact pane + HIL + status)    │
└───────────────────────┬─────────────────────────────────────┘
                        │ display stream(事件) + user actions
┌───────────────────────┴─────────────────────────────────────┐
│  Orchestrator Layer                                          │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌─────────────────┐  │
│  │ Planner  │ │ Executor │ │ Critic  │ │ Scheduler       │  │
│  │(意图漏斗) │ │(widget生成)│ │(三层检查)│ │(预算/升档/HIL) │  │
│  └──────────┘ └──────────┘ └─────────┘ └─────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ State Store (会话/artifact/plan/phase 状态)             │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────────┘
                        │ prompt/skill 加载 + widget DSL 接收
┌───────────────────────┴─────────────────────────────────────┐
│  Skill Layer (静态文件,给模型看)                              │
│  SKILL.md · protocol.md · widgets/ · design/ · recipes/      │
└───────────────────────┬─────────────────────────────────────┘
                        │ 标记流 (widget 边界 + 内容)
┌───────────────────────┴─────────────────────────────────────┐
│  Render Runtime                                              │
│  StreamParser → Dispatcher → WidgetRegistry → ContextBus    │
│  每个 widget: onOpen → onChunk → onClose                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 双 channel 通信

Orchestrator 对外输出**两条独立的流**:

### Display Stream (→ UI)

给用户看的事件,按时间顺序推送。UI 订阅并更新界面。

事件类型示例:
- `plan.created` — plan 出来了,UI 显示进度指示器
- `phase.started` — 当前 phase 开始
- `widget.opened` — 挂载骨架屏
- `widget.chunk` — widget 内容流入
- `widget.closed` — widget 完成,播放入场动画
- `milestone` — phase 级检查点(UI 可以做 tick 反馈)
- `critic.thinking` — Critic 正在判断(UI 显示柔和 pending)
- `phase.transition` — phase 切换(UI 显示"正在思考"掩护)
- `hil.requested` — 需要用户介入
- `phase.completed` / `plan.completed` — 完成
- `error.surfaced` — 对用户可见的错误

### Control Stream (Orchestrator 内部)

给 Orchestrator 自己用的,不对外。用于:
- 预算消耗跟踪
- Critic 的判定结果反馈
- 重规划决策
- 错误恢复状态机

**关键**:UI 永远不读 Control Stream,Orchestrator 内部事件想让 UI 看见必须显式转换成 Display Stream 事件。这强制解耦,避免 UI 代码偷看 Orchestrator 内部状态。

---

## 模块边界定义

### Orchestrator

**职责**:
- 意图识别(Planner.Intent)
- Plan 生成与维护(Planner.Plan)
- Executor 调用编排
- Critic 调用编排
- Budget / 升档 / HIL 决策(Scheduler)
- 状态持久化

**不负责**:
- Widget 内容怎么写(那是模型的事)
- Widget 怎么渲染(那是 Render Runtime 的事)
- UI 怎么展示(那是 UI 层的事)

### Skill Layer

**职责**:
- 定义标记协议的约束(protocol.md)
- 定义每个 widget 的规范(widgets/)
- 定义视觉设计规范(design/)
- 定义常见组合范式(recipes/)

**不负责**:
- 不是运行时代码,只是给模型看的静态文件
- 不直接被前端解析(前端只解析标记,不读 skill)

### Render Runtime

**职责**:
- 解析标记流,识别 widget 边界
- 路由到对应 widget 实例
- 管理 widget 生命周期
- 提供 ContextBus

**不负责**:
- 不生成内容
- 不判断质量
- 不做业务决策(如"这个 widget 是否该显示")

### UI Layer

**职责**:
- 消费 Display Stream
- 接收用户输入
- 触发 HIL 交互
- 状态可视化

**不负责**:
- 不直接调模型
- 不判断内容质量
- 不管 budget

---

## 数据流(一次典型请求)

```
1. 用户输入
   ↓
2. UI → Orchestrator.handleRequest(text)
   ↓
3. Orchestrator.Planner.Intent: 调模型做意图判断
   → 维度 + recipe 候选
   ↓
4. Orchestrator.Planner.Plan: 基于 recipe + 维度展开 plan
   → Phase 列表
   ↓ (发送 plan.created 到 Display Stream)
5. 进入 Phase 循环:
   5.1 Scheduler: 检查 budget,确定当前 phase
   5.2 Executor: 流式生成 phase 内容(通过 skill 加载对应 widget 规范)
       ↓ (边生成边发送 widget.* 事件到 Display Stream)
   5.3 Render Runtime: 接收标记流,渲染 widget
   5.4 Phase 结束标签到达 → 触发 milestone
   5.5 Critic: 三层检查
       - Structural(代码): 立即判断
       - Semantic(模型): 调模型判断
       - Quality(模型,选择性): 调模型判断
   5.6 根据 Critic 结果:
       - pass → 下一 phase
       - fail → 档位 1 重试(phase 内)
       - fail 过多 → 档位 2 局部重规划
       - 极端失败 → 档位 3 全局重规划 or HIL
   ↓
6. 所有 phase 完成 → ReviewPhase(全局一致性检查)
   ↓
7. plan.completed → UI 显示完成状态
   ↓
8. 持久化 artifact 状态
```

每一步的细节在对应文档里。

---

## V1 简化决策

几处架构上"应该做但 V1 不做"的简化,以及为什么:

**1. Plan 只用线性而非 DAG**
虽然数据结构支持 DAG,V1 只生成线性 plan。并行 phase 会让流式 UI 很难呈现(见 01 原则 6 的推论)。DAG 能力留给 V2。

**2. 单用户串行**
不处理并发请求。同一用户连续请求串行处理。rate limit 走错误提示。

**3. Critic 用同级模型**
不做"小模型省钱"的早期优化。需要时再降级。

**4. HIL 只在 phase 之间**
不支持 phase 中间打断。极端情况下让当前 phase 跑完再问。

**5. Skill Pack 是静态文件**
不做热加载、版本管理、A/B 测试。改 skill 就是改静态文件 + 重启。

**6. 状态存内存 + 单一存储**
不做分布式状态,不做多级缓存。V1 甚至可以只用一个本地数据库或文件。

这些简化让 V1 能在合理时间内跑通。真正能撬动架构质量的投入留给 Orchestrator、Protocol、Skill 这三块。
