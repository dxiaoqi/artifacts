# 06 · Orchestrator(编排层)

整个系统最有技术含量的一层。决定"智能 vs 机械"、"稳定 vs 失控"的分水岭。

本文档较长,分成以下部分:
- 意图识别
- Plan 数据结构
- Phase 执行循环
- Critic 设计
- 重规划策略
- 流式与规划的张力(关键章节)
- HIL 时机
- Phase 上下文管理
- 状态机总图
- 常见陷阱

---

## 1. 意图识别:两层漏斗

### 为什么不做单次分类

**反模式**:`classify intent into {explainer, dashboard, tutorial, ...}`

问题:
- 新意图要改 schema
- 模糊需求被强行归类
- 意图和 widget 组合绑死,失去灵活性

### 正确做法:维度 + Recipe Matching

```
用户输入
   ↓
[Layer A: Shape Detection]   输出: 5 个维度
   ↓
[Layer B: Recipe Matching]   输出: recipe_id + 初始 plan 草稿
   ↓
[Layer C: Plan Materialization]  输出: 完整 plan
```

### Layer A: Shape Detection

输出是**维度向量**,不是类别:

| 维度 | 可能值 | 作用 |
|---|---|---|
| modality | visual-heavy / text-heavy / interactive / mixed | 决定主力 widget |
| depth | skim / standard / deep-dive | 决定 phase 数量和 budget |
| interactivity | static / explorable / conversational | 决定要不要接 sendPrompt |
| audience | novice / practitioner / expert | 决定措辞和省略程度 |
| certainty | clear / ambiguous / exploratory | 决定要不要先 HIL |

### 延迟优化:合并 Layer A 和 Plan

**朴素做法**:Layer A 调一次模型,Plan 调一次模型,首字节延迟 = 两次模型调用。

**优化做法**:把 Layer A 和 Plan 合成一次调用。在一个 prompt 里要求模型:
1. 先输出维度声明(作为 `<plan>` 的属性)
2. 然后产出 phases

这样首字节延迟 ≈ 一次模型调用,UI 几乎立即看到 plan 结构。

**例外**:当启发式规则判断输入"很可能模糊"时(输入太短、含大量疑问词、没有具体名词),**先不展开 plan**,而是用一次轻量模型调用判断是否需要 HIL。这样在清晰请求上不加成本,在模糊请求上避免做无用功。

启发式规则示例:
- 用户输入 < 8 字 → 可能模糊
- 包含 "?" 超过 2 个 → 可能模糊
- 包含"怎么办/帮我/给点建议"等开放词且没有具体主题 → 可能模糊

### Layer A 的 prompt 模板(合并版)

```
用户请求: {user_input}
会话历史(最近 3 轮): {recent_context}

请你:

1. 判断这个请求的五个维度,选值:
   - modality: visual-heavy | text-heavy | interactive | mixed
   - depth: skim | standard | deep-dive
   - interactivity: static | explorable | conversational
   - audience: novice | practitioner | expert
   - certainty: clear | ambiguous | exploratory

2. 如果 certainty 是 clear 或 exploratory,直接输出 <plan>:
   - 选择一个 recipe(或自由组合)
   - 分解为 1-5 个 phase
   - 每个 phase 有明确 goal 和结构化 acceptance

3. 如果 certainty 是 ambiguous,输出 <clarify> 标签,含 1-2 个具体的澄清问题,
   每个问题附 2-4 个候选答案。不要输出 plan。

格式示例见 protocol.md。
```

### Layer B: Recipe Matching

从维度向量匹配到 recipe。实现上:
- 每个 recipe 声明它适用的维度组合
- 用简单打分(覆盖维度数 × 权重)选 top 1
- 匹配分 < 阈值 → fallback 到"自由组合"模式

这一步**纯代码**,不调模型。

### Layer C: Plan Materialization

这一步由模型做,但被 recipe 约束:
- Recipe 提供 phase 骨架模板
- 模型填入具体 goal 和 acceptance
- Recipe 规定 phase 数范围,超了就压缩

**如果用了合并版**:这一步已经在 Layer A 里完成,不需要额外调用。

---

## 2. Plan 数据结构

```
Plan {
  id: string
  recipe_id: string | null       // 用的哪个 recipe(null 表示自由组合)
  dimensions: Dimensions         // Layer A 输出
  phases: Phase[]                // 线性顺序(V1)
  budget: PlanBudget
  state: {
    currentPhaseId: string | null
    completedPhaseIds: string[]
    abandonedPhaseIds: string[]
    replanCount: number
  }
}

Phase {
  id: string
  goal: string                    // 一句话目标
  acceptance: Criterion[]         // 结构化验收标准
  expected_widget_types: string[] // 软约束(不强绑定具体 widget)
  depends_on: string[]            // V1 只能是前置 phase id
  budget: PhaseBudget
  status: pending | running | review | done | abandoned | skipped
  attempts: number                // 重试次数
  output: {
    widgets: WidgetSnapshot[]
    metrics: { tokens_used, duration_ms }
  }
}

PlanBudget {
  max_total_output_tokens: number
  max_phase_count: number
  max_replan_count: number
  max_hil_count: number
}

PhaseBudget {
  max_output_tokens: number
  max_attempts: number
  timeout_ms: number
}

Criterion {
  type: 'widget_exists' | 'widget_count' | 'word_count' | 'covers_topics' | 'has_title' | 'semantic'
  params: Record<string, any>
  weight?: number                 // 权重(Critic 综合判定时用)
}
```

### 关键设计

**acceptance 是结构化的**。不是自由文本。这让 60%+ 的检查由代码完成,不调模型。

**abandoned 是合法终态**。一个 phase 尝试 N 次失败,允许放弃。这是防兔子洞的关键。

**expected_widget_types 是软约束**。Critic 检查"产出的 widget 组合是否服务于 phase goal",而非"是否精确匹配声明列表"。这给了模型灵活度。

**depends_on 为空的 phase 可以并行**(V1 不用,但结构上留着)。

---

## 3. Phase 执行循环

```
for each phase in plan.phases:
  Scheduler: 检查是否还在总预算内
  Scheduler: 加载 phase 对应的 skill 文件(按 recipe)

  loop attempt = 1..phase.budget.max_attempts:
    Executor: 调模型生成 phase 内容
      - prompt 包含: skill + plan + 已完成 phases 的 outcome summary + 当前 phase 定义
      - 流式输出直接转发到 parser
    等待 phase 结束(闭合标签或 milestone)

    Critic: 三层检查
      step 1: Structural Check(代码)
        → fail 且是硬约束失败 → 立即标记失败,continue loop
      step 2: Semantic Check(模型)
        → fail → continue loop
      step 3: Quality Check(模型,仅特定 phase 触发)
        → fail → continue loop
      all pass → break loop,phase.status = done

  if attempt 用尽还没 pass:
    Scheduler: 判断升档
      - 如果当前 phase 可选(has_fallback) → 标记 abandoned,continue
      - 如果影响下游 → 触发档位 2 局部重规划
      - 如果档位 2 也用尽 → 档位 3 全局重规划 or HIL

  phase.output = 收集本轮产出
  生成 phase outcome(结构化,给后续 phase 用)

生成 ReviewPhase (如果 plan 有 ≥3 phase 且总 budget 还剩余 20%)
```

### Executor 的 prompt 构成

每次 Executor 调用,传入 context 包含:

```
[System] SKILL.md + protocol.md + widgets/_index.md + recipes/_index.md
[System] 本次用到的 recipe 文档
[System] 本次用到的 widget 文档(按 recipe.skill_files_to_load)
[User] 原始请求
[Assistant] <plan>...(由 Orchestrator 维护的 plan 结构,序列化回 XML)
[Assistant] <phase id="p1">... 已完成的 phase 内容 或 phase outcome summary
[Assistant] <phase id="p2">...
[User] (控制消息) 现在生成 phase p3,目标和 acceptance 如下:...
```

**关键**:前面 phase 的完整内容 vs outcome summary 的选择,见"Phase 上下文管理"章节。

### Critic 的 prompt 构成

Critic 调用极简:

```
[System] 你是质量检查员。只回答 YES 或 NO + 不超过 20 字的原因。不要提改进方案。
[User] Phase 目标: {goal}
       Phase 产出: {widgets 的摘要,不是完整内容}
       Acceptance: {criteria}

       这个 phase 是否达成?
```

**不要传完整 widget 内容给 Critic**,太贵且容易触发"吹毛求疵"。传结构化摘要:
- 每个 widget 的类型、title、字符数
- markdown 的前 100 字 + 结构(标题层级)
- svg 的 viewBox + 主要元素统计
- ...

Critic 只判断"结构和主题对不对",不判断"写得好不好"。

---

## 4. Critic 设计

### 三层 Check

**Structural Check(代码,必做)**:
- 所有 `widget_exists / widget_count / word_count / has_title` 类 criterion
- Token 是否超预算
- Protocol 错误(未闭合、非法嵌套)

**Semantic Check(模型,必做)**:
- `covers_topics` 类 criterion(判断是否覆盖了指定主题)
- `semantic` 类 criterion
- 用模型做,但限制输出 ≤ 100 tokens

**Quality Check(模型,选择性)**:
- 只在以下情况触发:
  - Plan 的最后一个 phase 完成前
  - 标记为"高价值产出"的 phase
  - 前两层都通过但开发者手动标记需要额外检查的场景
- 检查维度:事实性、连贯性、与 audience 维度的匹配
- 成本最高,用得最少

### 为什么 Critic 用同级模型而非小模型

经验教训:Critic 用小模型会:
- 判断不出细微的跑题
- False positive(觉得行)→ 垃圾内容过关
- False negative(觉得不行)→ 触发无意义重试

**V1 建议**:Critic 和 Executor 用同级模型。成本靠"短输出 + 结构化 input"控制,不靠换小模型。

如果后续有数据证明小模型够用,再降级。

### Critic 绝对不做的事

- **不提改进方案**:只回答 yes/no + 一句话原因。"建议怎么改"会让 Critic 越界变 Executor,成本爆炸。
- **不重写内容**:永远不触发重新生成,只给判断结果。重写由 Orchestrator 安排下一轮 Executor 做。
- **不跨 phase 比较**:单 phase 的 Critic 只看本 phase。跨 phase 一致性由 ReviewPhase 做。

### Critic 失败时的反馈循环

Critic 判 fail → Orchestrator 拿到一句话原因 → 下一轮 Executor 的 prompt 里**追加**:

```
[User] (控制消息) 上一次产出未达标,原因: {critic reason}
       请针对这个问题重新生成 phase p3。
```

Executor 自己决定怎么改,不是 Critic 告诉它。

---

## 5. 重规划策略:三档刹车

### 档位 1:Phase 内重试(便宜)

- 触发:Critic 判 fail
- 动作:重新调 Executor 生成当前 phase
- 预算:`phase.budget.max_attempts`(建议 2)
- 升档条件:attempts 用尽仍 fail

### 档位 2:局部重规划(中等)

- 触发:档位 1 用尽;或 phase 成功但下游依赖前提变了
- 动作:产出 plan diff,只改受影响的 phase
- 预算:`plan.budget.max_replan_count`(建议 2)
- diff 结构:

```
PlanDiff {
  remove: phase_id[]
  add: Phase[]
  modify: Map<phase_id, Partial<Phase>>
}
```

- 已完成的 phase **不动**,保留其 output
- 升档条件:replan_count 用尽仍无法产出 pass 的 phase

### 档位 3:全局重规划(昂贵)

- 触发:档位 2 用尽;或用户主动打断并给新指令
- 动作:保留已完成 widget 作为"素材",重新生成整个 plan
- 预算:整次会话最多 1 次
- 升档条件:用尽 → 请求 HIL

### 关键规则

- **模型不能自己决定升档**。模型只能报告"我试了但没成",Orchestrator 根据 attempts / replan_count 自动升档。
- **升档是成本递增的**,越往上越要克制。档位 1 是常规,档位 2 是异常,档位 3 是兜底。

### 防抖动

- 同一 phase 在档位 1 和档位 2 之间不能来回跳(即 modify 后的 phase 不能再走档位 1 的 max_attempts 次)
- 档位 2 产出的新 phase 使用**减半的 budget**(避免新 phase 消耗全部剩余 budget)

---

## 6. 流式与规划的张力(关键设计)

这是整个系统的一个**深层矛盾**,必须明确面对。

### 矛盾

- **真正的阶段性规划**意味着:phase N 开始时,phase N-1 的产出已经完整,Critic 已经判过,transition summary 已经生成。
- **流式体验**意味着:phase N-1 的最后一个 token 刚出,phase N 的第一个 token 立即出。

两者不能完全兼得。

### V1 的选择:Transition Pause

**Phase 之间存在一个短暂的"过渡态"**,UI 上是正面的视觉反馈,不是卡顿:

```
phase N 内容流出 ───┐
                    ├─→ phase N 结束(</phase>)
                    │
              ┌─────┴─────┐
              │ Transition │ 约 200-800ms
              │   Pause    │ UI 显示: "正在检查..."
              └─────┬─────┘ 或 "正在规划下一步..."
                    │
                    │ 这期间并行执行:
                    │ - Critic 检查
                    │ - 生成 phase outcome summary
                    │ - (如有)更新 plan
                    │
                    ↓
              phase N+1 开始流出
```

### UI 的配合

Transition Pause 不能是"界面卡住",必须有视觉掩护:
- Phase 进度指示器高亮下一步
- 显示"Claude 正在思考..."的气泡(带柔和动画)
- 不要空白屏幕或 spinner

有了这个视觉设计,200-800ms 的 pause 会被感知为"认真"而不是"卡顿"。

### Phase 内保持真正流式

Pause 只发生在 phase 之间。**Phase 内部的 token 流必须实时转发**,不做任何累积。这保证用户主要的观感是"一直在出东西"。

### 不要优化 Pause 为 0

听起来"让 Critic 在下一 phase 生成过程中并行跑,0 延迟"很诱人,但:
- Critic 的结果会影响下一 phase 该怎么写
- 如果并行,相当于"写着写着告诉你前面错了,回来改"
- 产生倒退的体验比 pause 糟糕

所以 V1 明确接受这个 pause,不优化。

### Plan 生成阶段的流式

Plan 本身也是流式出的(从 Layer A 合并版里自然出来):
- `<plan>` 的开标签一出,UI 立即显示"正在规划"
- Phase 声明流出,UI 一个个显示在进度指示器里
- 完整 `<plan>` 结束后,才进入第一个 phase

这样用户从"请求发出"到"看到结构"的延迟,等于 Layer A 的一次模型调用的首字节时间,非常短。

---

## 7. HIL 插入时机

HIL 是 **Orchestrator 决定触发**,不是模型决定。

### 四种触发点

| 触发点 | 例子 | 频率 |
|---|---|---|
| 意图歧义 | Layer A 判 certainty=ambiguous | 罕见但关键 |
| 规划确认 | plan 超过 4 phase 且 depth=deep-dive | 可选 |
| 阶段检查点 | 某个被标记的 major phase 完成后 | 长任务才用 |
| 失败兜底 | 档位 3 前 | 罕见 |

### V1 的约束

- HIL 只在 **phase 之间或 plan 开始前**触发,不在 phase 中间
- 整次会话 HIL ≤ 2 次(超过会打断心流)
- HIL 必须是"精准问题 + 候选选项",不是"请告诉我更多"这种模糊问

### HIL 的 UI 表达(参见 UI 层文档)

- 不是弹窗,是 chat pane 里的一条消息
- 带 2-4 个预设选项(来自 Layer A 或 Orchestrator 的建议)
- 允许用户自由输入覆盖
- Artifact pane 此时显示"等待你的回答"的柔和 pending,不清空已有内容

### HIL 的 Phase 中间限制(重要)

如果 phase 中间发生灾难性错误(比如模型完全跑偏),有两种处理:

1. **让当前 phase 跑完再问**(默认):即使质量差,等 `</phase>`,再在 transition pause 里决定是否 HIL
2. **强制 kill 当前 phase + 立即 HIL**:极端情况,目前视为 V2 功能

V1 选方案 1。避免 phase 中间状态带来的 UI 和状态管理复杂度。

---

## 8. Phase 上下文管理(避免 context 污染)

### 问题

后续 phase 生成时,是否需要看到前面 phase 的完整产出?

- 完整内容 → context 膨胀,长 plan 下爆炸
- 完全不看 → 内容重复、矛盾、不连贯
- 自动摘要 → 反复压缩会漂移

### V1 方案:结构化 Phase Outcome

每个 phase 完成后,Orchestrator 生成一份**结构化**的 outcome,不是自由摘要:

```
PhaseOutcome {
  phase_id: string
  goal: string
  status: done | abandoned
  widgets_produced: [
    { id, type, title, preview: string (前 150 字符) }
  ]
  key_points: string[]         // 由模型在 phase 末尾自己列出的要点
  topics_covered: string[]     // 实际覆盖了哪些 acceptance 里声明的主题
}
```

`key_points` 和 `topics_covered` 在 phase 末尾由模型自己产出(可以通过在 skill 里要求 "phase 结尾前,如果有需要承接给后续 phase 的信息,用 `<outcome>` 标签列出 key_points"实现)。

### 后续 phase 的 context 构造

```
[System] skill pack
[User] 原始请求
[Assistant] <plan>...</plan>
[Orchestrator Summary] 以下 phase 已完成:
  - p1: 目标 "...",产出 [widget1: svg "OAuth 流程图", widget2: markdown "简介"]
        key_points: [授权码流程有 4 个角色, token 分两步获取, ...]
[Orchestrator] 现在生成 p2,目标 "...",acceptance: ...
```

### 何时需要完整引用

在某些情况下,后续 phase 需要**精确引用**前面的 widget(比如"上图中的第 3 步..."):

- 模型可以在 skill 里学到:要精确引用时,用 `ref:widget_id`
- Orchestrator 收到 `ref:` 时,把该 widget 的**完整内容**临时展开进 context
- 用完就丢,不污染默认 context

### Audience Drift 检测

长生成中,模型的措辞难度会慢慢漂移。Phase Transition Pause 时,Critic 顺便判断:

```
上一个 phase 的语言难度等级大致如何(1-5)?
与 plan 声明的 audience={value} 匹配吗?
```

不匹配则在下一个 phase 的 prompt 里提醒:"请保持 {audience} 级别的措辞"。

---

## 9. Review Phase(全局一致性)

### 何时触发

- Plan 有 ≥ 3 phase
- 总 budget 剩余 ≥ 20%
- 最后一个 phase 完成后

### 内容

Review Phase **不产出新 widget**,只做一次 Critic 调用,问三个问题:

1. 所有 phase 之间有矛盾吗?
2. 有明显重复的内容吗?
3. 开头 plan 承诺的东西都兑现了吗?

### 处理

- 全 pass → artifact 完成
- 发现问题 + budget 还够 → 触发针对性的档位 2 重规划(只改有问题的 phase)
- 发现问题 + budget 不够 → 在最终产出上加一个"限制说明"(告知用户发现了什么但没改)

### 禁止的事

**不要触发重新生成整个 artifact**。Review Phase 是一次机会,用完就用完。防止无限追求完美。

---

## 10. 状态机总图

```
                    ┌──────────────┐
                    │     Idle     │
                    └──────┬───────┘
                           │ user_input
                           ↓
              ┌────────────────────────┐
              │   IntentFunnel (A+B+C) │
              └──────┬─────────────────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
       clear     ambiguous   exploratory
          │          │          │
          │          ↓          │
          │   ┌──────────┐      │
          │   │   HIL    │      │
          │   └─────┬────┘      │
          │         │           │
          └─────────┼───────────┘
                    ↓
           ┌──────────────────┐
           │  Plan Ready      │
           │  (phase queue)   │
           └────────┬─────────┘
                    │
                    ↓
           ┌──────────────────┐
           │   PhaseExecute   │←───────────┐
           └────────┬─────────┘            │
                    │                      │
          [phase end/milestone]            │
                    ↓                      │
           ┌──────────────────┐            │
           │ TransitionPause  │            │
           │ - Critic check    │           │
           │ - Outcome digest  │           │
           └────────┬─────────┘            │
                    │                      │
         ┌──────────┼────────────┐         │
       pass      retry         replan      │
         │         │              │        │
         │    [attempt+1]    [档位 2 diff]  │
         │    [<max?]─yes────────────────→─┤
         │         │              │        │
         │         │no             │        │
         │         │              ↓        │
         │         ↓       ┌──────────┐    │
         │    [档位 2]─→───│LocalReplan│────┤
         │         │       └──────────┘    │
         │         │                       │
         │         ↓                       │
         │    [档位 3]                      │
         │         │                       │
         │         ↓                       │
         │    ┌────────────┐               │
         │    │   HIL      │or ReplanAll───┤
         │    └────────────┘               │
         │                                 │
       [more phases?]─yes──────────────────┘
         │no
         ↓
         ┌──────────────────┐
         │  ReviewPhase     │
         └────────┬─────────┘
                  ↓
         ┌──────────────────┐
         │   Delivered      │
         └──────────────────┘
```

---

## 11. 常见陷阱与解决

| 陷阱 | 症状 | 解决 |
|---|---|---|
| Orchestrator 越界管内容 | 产出千篇一律 | 严守"管边界不管内容"原则 |
| Critic 变 Executor | 成本延迟爆炸 | 强制 ≤100 token 输出,禁止提改进方案 |
| 模型自主升档 | 兔子洞 | 升档决策完全由代码做 |
| 小模型做 Critic | 质量不稳定 | V1 用同级模型 |
| 合并 Layer A 和 Plan 遇到模糊请求 | 强行产出低质 plan | 启发式前置判断,模糊时先 HIL |
| Phase 中间触发 HIL | 状态混乱 | V1 只允许 phase 之间 HIL |
| 自由摘要累积漂移 | 后面 phase 偏离前面 | 用结构化 PhaseOutcome |
| Review Phase 触发重做 | 无法完成 | Review 只能做一次性局部调整 |
| Pause 被感知为卡顿 | 用户体验差 | UI 视觉掩护"正在思考" |
| 档位 2 的新 phase 吃掉所有 budget | 升档成本失控 | 新 phase 用减半的 budget |
| 跨 phase 重复内容 | 冗余啰嗦 | PhaseOutcome + Audience Drift 检测 |
| HIL 太频繁 | 打断心流 | 整次会话 ≤ 2 次 |

---

## 12. 可观测性要求

Orchestrator 是系统最复杂的部分,必须可观测。每次请求产生一份可查询的 trace:

```
Trace {
  request_id
  user_input
  intent_funnel_output: { dimensions, recipe_chosen, confidence }
  plan_snapshots: [ Plan ]   // 每次 replan 记录一份
  phase_traces: [
    {
      phase_id
      attempts: [
        {
          executor_call: { prompt_tokens, completion_tokens, duration },
          critic_calls: [ { type, result, reason } ],
          outcome: PhaseOutcome | null
        }
      ]
      final_status
    }
  ]
  hil_events: [ { reason, question, user_response } ]
  budget_consumption: { total_tokens, total_cost, total_duration }
  final_artifact_id
}
```

开发阶段这份 trace 必须可视化查看(可以做个简单 debug panel)。生产环境存储到日志/分析系统。

这份 trace 也是**质量评测的核心数据源**,见 09 号文档。
