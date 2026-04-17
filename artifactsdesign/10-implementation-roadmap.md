# 10 · 实施路线图

从零到可用的 6 个 Step。每个 Step 都能独立跑通并看到结果,避免一上来就搭完整架构。

---

## 总览

```
Step 1 (MVP 基础)         Protocol + 最小 Runtime
  ↓
Step 2 (模型接入)         接 LLM + 基础 Skill Pack
  ↓
Step 3 (Plan/Phase)       Orchestrator 骨架
  ↓  ← ← ← 这之前都是 MVP,证明架构跑通
Step 4 (防兔子洞)          Critic + Budget + Replan
  ↓  ← ← ← 这之后才算能用,决定能否上线
Step 5 (交互能力)          Context Bus + HIL + Edit Mode
  ↓
Step 6 (打磨)             更多 widget + Theme + Animation + Recipes
```

每个 Step 的估算是**人-天**,假设 1 个熟练开发者全职。用 AI 生成代码可能快一些,但集成和调试时间不会少。

---

## Step 1: Protocol + 最小 Render Runtime

**目标**:把一段预设的标记流,流式渲染成可看的页面。

**做什么**:
- [ ] 实现 StreamParser(只识别 plan / phase / widget / milestone / think)
- [ ] 实现 Dispatcher 和 WidgetRegistry
- [ ] 实现两个 widget:MarkdownWidget、HtmlWidget
- [ ] 实现一个极简 UI 容器,能接收 display stream 事件并渲染
- [ ] 写一段测试代码,用预设的字符串喂给 parser,看能不能正确渲染

**验收标准**:
- 预设的多 phase、多 widget 标记流,能正确分 widget 渲染
- Markdown widget 能流式显示(边来边显示)
- Html widget 能骨架屏 → 完整替换
- 错误恢复的 E1-E7 有至少 5 个有单元测试覆盖

**不做**:
- 不接模型
- 不做 SVG widget(规则更复杂,Step 2 再加)
- 不做动画
- 不做 Chat UI(只有一个 artifact 容器)

**估算**:5-7 人-天

---

## Step 2: 接上真 LLM

**目标**:给模型一个请求,它产出符合协议的流,UI 能正确渲染。

**做什么**:
- [ ] 写 `SKILL.md`(永远加载的入口,≤ 800 tokens)
- [ ] 写 `protocol.md`(协议速查,≤ 1200 tokens)
- [ ] 写 `widgets/_index.md`(widget 目录,≤ 600 tokens)
- [ ] 写 `widgets/markdown.md` 和 `widgets/html.md`(按需加载)
- [ ] 搭一个最简单的模型调用层(支持流式输出)
- [ ] 把模型输出直接接入 StreamParser
- [ ] 做 5-10 个手工测试(不同类型的请求)

**验收标准**:
- 常见请求("解释 X"、"给我一个 Y 的例子")能产出符合协议的流
- 产出的 widget 组合合理(不会无脑全用 markdown 或全用 html)
- 失败率 < 20%(定义"失败"为:协议不合法或渲染出不来)

**不做**:
- 不做 plan / phase(直接让模型自由发挥,只约束 widget 语法)
- 不做 Critic
- 不做错误恢复自动化(手工发现问题)

**估算**:4-6 人-天

---

## Step 3: 加入 Plan 和 Phase

**目标**:Orchestrator 骨架。请求会触发多 phase 生成,UI 能看到分阶段推进。

**做什么**:
- [ ] 实现 Plan / Phase 的数据结构
- [ ] 实现 StreamParser 对 plan/phase 标签的识别
- [ ] 实现 Orchestrator 的基本状态机(IntentFunnel → PlanMaterialization → PhaseLoop)
- [ ] 实现 Layer A(合并版,一次调用产出维度 + plan)
- [ ] 写 2 个 recipe(explainer 和 tutorial),对应的 md 文件和元数据
- [ ] UI 加 Plan 进度指示器
- [ ] UI 加 Transition Pause 的视觉(至少"正在思考"气泡)

**验收标准**:
- 复杂请求能产出 2-4 phase 的 plan,逐 phase 流出
- UI 能看到 plan 结构和当前进度
- Phase 之间有短暂 pause,UI 不像卡住
- 新增 recipe 只需要加 md 文件和元数据,不改代码

**不做**:
- 不做 Critic(phase 完成直接进入下一个)
- 不做 budget(信任模型不会太长)
- 不做 replan(失败就失败)
- 不做 edit mode

**估算**:7-10 人-天

---

## ⭐ Step 3 完成就是 MVP,证明架构跑通 ⭐

此时你有一个能跑的 demo,可以给团队看、给潜在用户看,收集反馈。但**离能上线还差一大截**。

---

## Step 4: Critic + Budget + Replan(防兔子洞)

**目标**:复杂请求也能稳定交付,不会失控。

**做什么**:
- [ ] 实现 Critic 三层检查(Structural / Semantic / Quality)
- [ ] 实现 acceptance criterion 的机械检查(代码实现 widget_exists / word_count 等)
- [ ] 实现 Critic 的模型调用(短输出 + 结构化摘要)
- [ ] 实现 Budget 系统(Turn / Plan / Phase / Attempt 各级)
- [ ] 实现三档重规划(档位 1 全部 + 档位 2 diff + 档位 3 全重做)
- [ ] 实现 Abandon 的合法终态
- [ ] 实现 Phase Outcome(结构化摘要)
- [ ] 实现 Review Phase(全局一致性)
- [ ] 补全错误分类和处理路径
- [ ] Orchestrator 的 Trace 采集

**验收标准**:
- 长复杂请求(深度解释、多层次结构)不陷入兔子洞
- Critic 能拦截明显的"跑题"和"缺失"
- 遇到无法达成的 phase 能 abandoned 而不是卡住
- Trace 能完整回溯每次决策
- 自动化指标稳定在健康区间(见 09 号文档的表格)

**不做**:
- 不做 HIL(先纯自动运转)
- 不做 edit mode
- 不做 tool 调用
- 可观测性只做 trace 存储,不做看板

**估算**:12-18 人-天(这一步是技术含量最高的)

---

## ⭐ Step 4 完成才算"能上线" ⭐

此时系统能可靠地处理各种请求。可以做小范围灰度。

---

## Step 5: Context Bus + HIL + Edit Mode

**目标**:Artifact 可交互,系统会在关键时刻问用户,支持迭代编辑。

**做什么**:
- [ ] 实现 ContextBus(sendPrompt / callTool / state)
- [ ] 实现 Tool Registry 和注册机制
- [ ] 实现 Tool 的确认流(UI + 权限)
- [ ] 实现速率限制
- [ ] 实现 HIL 的触发逻辑(Layer A ambiguous → HIL)
- [ ] 实现 HIL 的 UI(不是弹窗,是 chat message)
- [ ] 实现 Edit Mode 的协议解析(`<edit>` 标签)
- [ ] 实现 新建 vs 编辑 的判定
- [ ] 实现 Edit 的 Orchestrator 分支(简化流程,不走完整 plan)
- [ ] 实现 Artifact 版本关系(parent_artifact_id)
- [ ] 实现跨 turn 的 artifact 引用

**验收标准**:
- 模糊请求会触发 HIL 澄清,用户选择后正确继续
- 用户说"改一下那个图",系统识别为编辑并精确修改
- Widget 里的按钮能触发 sendPrompt,不陷入循环
- Tool 调用有确认流,用户能拒绝
- 编辑后的新 artifact 能回溯到旧版本

**不做**:
- 不做复杂的多 Tool 编排
- 不做跨 session 的状态共享
- 不做精确的流中断恢复

**估算**:10-14 人-天

---

## Step 6: 打磨

**目标**:产出具备视觉一致性和打磨感,覆盖更多场景。

**做什么**:
- [ ] 实现 SVG widget(正确处理骨架屏 + 全量 swap)
- [ ] 实现 Chart widget(基于主流图表库)
- [ ] 完整的 Theme 系统(CSS 变量 + design/theme.md)
- [ ] 实现 Animation Engine(入场 / 更新 / 注意力三种场景)
- [ ] 完整的 animation.md
- [ ] 补全 recipe 库(至少 4 个:explainer / dashboard / tutorial / exploration)
- [ ] 评测体系落地(基准集 + 简单 dashboard)
- [ ] 文档和示例(给用户看的"最佳实践")

**验收标准**:
- 视觉一致性:所有 widget 遵循同一套 theme
- 动画不打断阅读,只用在三处
- 基准集 30+ 测试,每周回归
- 有 bad case → 基准 → 修复 的闭环

**不做**:
- 国际化(V2)
- 无障碍(V2)
- 更多 widget 类型(form / video / 3d 等,根据需求渐进添加)

**估算**:10-15 人-天

---

## 总时间估算

| Step | 乐观 | 悲观 |
|---|---|---|
| 1 | 5 | 7 |
| 2 | 4 | 6 |
| 3 | 7 | 10 |
| 4 | 12 | 18 |
| 5 | 10 | 14 |
| 6 | 10 | 15 |
| **合计** | **48 人-天** | **70 人-天** |

加上协作、调试、需求返工,实际项目建议 ×1.5 倍:72-105 人-天。

---

## 关键节点的验收

### MVP 节点(Step 3 完成)

**能做到**:
- 给一个复杂请求,展示 plan,分 phase 产出 widget
- Markdown、HTML、SVG widget 都能流式渲染
- 基本错误不会让系统崩

**还做不到**:
- 质量稳定(可能跑偏、可能太长)
- 能应对失败
- 可交互

**用途**:内部 demo,团队反馈,吸引早期用户

### 可上线节点(Step 4 完成)

**能做到**:
- MVP 的一切
- 复杂请求质量稳定
- 不会失控
- 预算可控
- 出错能降级

**还做不到**:
- 编辑迭代
- 问用户澄清
- Widget 内交互

**用途**:小范围公测,收集真实用户反馈

### 完整节点(Step 6 完成)

**能做到**:
- 上面的一切
- 可迭代编辑
- HIL 澄清
- 丰富的 widget 和视觉体验
- 评测体系防退化

**还做不到**:
- 多用户协作、国际化、无障碍(V2)

**用途**:正式发布

---

## 风险点和建议

**风险 1**:Step 4 被低估
- Critic 和 Replan 的细节很多,容易估不准
- 建议:Step 4 单独当成一个"里程碑冲刺",预留足够时间

**风险 2**:Skill Pack 反复改
- 开始写的 skill 质量一定不够好,会持续改
- 建议:Step 2 就把评测基础设施的壳搭起来,改 skill 时能跑基准

**风险 3**:UI 和 Orchestrator 耦合
- 早期容易为了 demo 效果让 UI 直接读 Orchestrator 内部状态
- 建议:从 Step 1 就严格用 display stream 解耦

**风险 4**:用 AI 生成的代码集成困难
- AI 倾向于在单模块内过度发挥,模块间约定不稳定
- 建议:一个 Step 完成的代码要先人工过一遍再下一个 Step

**风险 5**:过早优化
- 想在 Step 3 就做好所有 widget、所有 recipe
- 建议:严格按 Step 顺序,抵制诱惑

---

## 给 AI 生成代码时的指引

如果你打算让 AI 生成这套系统的代码:

1. **一次一个 Step**,不要整体甩给 AI
2. **在 prompt 里引用对应的 md 文档**,让 AI 按文档实现
3. **产出后人工跑一遍测试**,再进入下一个 Step
4. **关键模块的接口定义**先让 AI 产出,你 review 后再让它填内部实现
5. **Orchestrator 这层要格外仔细**,AI 容易在这里发挥过度。多用"严格按文档实现,不要引入文档没有的概念"的指令

---

## 结语

这 6 个 Step 是经过挑选的最小必要路径。每个 Step 都有明确的"验收 / 不做 / 估算",便于规划和管理。

**最关键的提醒**:Step 1-3 是地基,不要省。Step 4 是分水岭,不要草草带过。Step 5-6 是锦上添花,可以根据资源调整。

当你走完 Step 4,系统就具备了"Claude.ai 那种流式 artifact 的核心能力"。之后的 Step 5-6 是把它从"能用"变成"好用"。
