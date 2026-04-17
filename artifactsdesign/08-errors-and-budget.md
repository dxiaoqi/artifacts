# 08 · 错误分类与预算模型

系统级的错误处理规范和成本控制锚点。其他所有模块应参考本文档来处理错误和设置预算。

---

## 错误分类

错误按"**谁的问题 + 能不能重试**"两个维度分类。

### 分类表

| 类别 | 子类 | 来源 | 可重试 | 对用户可见 |
|---|---|---|---|---|
| Protocol | 未闭合标签 | 模型 | 自动恢复 | 否(开发可见) |
| Protocol | 非法嵌套 | 模型 | 自动恢复 | 否 |
| Protocol | 未知 widget type | 模型 | 降级为 markdown | 否 |
| Validation | widget props 不合法 | 模型 | 档位 1 重试 | 否 |
| Validation | plan 结构不合法 | 模型 | 档位 1 重试(重出 plan) | 否 |
| Semantic | acceptance 未达成 | 模型 | 档位 1 重试 | 否 |
| Semantic | 整体不连贯(Review 发现) | 模型 | 档位 2 局部重规划 | 可能(降级提示) |
| Resource | 超 token 预算 | 系统 | 不重试,强制收敛 | 是(弱提示) |
| Resource | 单次调用超时 | 系统 | 有限重试(2次) | 否 |
| Resource | Turn 整体超时 | 系统 | 不重试 | 是 |
| Tool | tool 参数错误 | 模型 | 档位 1 重试 | 否 |
| Tool | tool 执行失败 | 外部 | 视具体 tool 定义 | 视情况 |
| Tool | tool 需要用户确认 | 系统 | 等待用户响应 | 是(确认弹窗) |
| System | 模型 API 错误 | 外部 | 指数退避,最多 3 次 | 重试用尽后可见 |
| System | 模型 API rate limit | 外部 | 不重试,直接错误提示 | 是 |
| System | 网络中断 | 外部 | 取决于阶段 | 是 |
| System | 存储写入失败 | 系统 | 重试 1 次,失败则错误 | 是 |
| User | HIL 超时(>5min 无响应) | 用户 | 标记 turn 为 abandoned | 是 |
| User | 用户主动取消 | 用户 | 不重试 | N/A |
| User | 输入不合法(太长/空) | 用户 | 不执行 | 是 |

### 错误的数据结构

```
Error {
  category: 'protocol' | 'validation' | 'semantic' | 'resource' | 'tool' | 'system' | 'user'
  code: string           // 具体错误码,如 "protocol.unclosed_widget"
  message: string        // 技术描述(日志用)
  user_message?: string  // 对用户可见的描述(对用户可见错误才有)
  context: {             // 发生位置
    turn_id?, artifact_id?, phase_id?, widget_id?
  }
  retryable: boolean
  retry_count?: number
  caused_by?: Error      // 原因链
}
```

---

## 错误恢复的路径

### 自动恢复(Protocol 类)

在 Render Runtime 里直接处理,不打扰 Orchestrator。发 `parser.warning` 事件,记录到 trace。

### Orchestrator 层恢复(Validation / Semantic / Tool)

通过重规划的三档机制处理,详见 06 号文档。

### 硬降级(Resource / System)

超预算、超时、API 错误这些不重试,直接结束当前 turn,给用户一个明确错误。

### 用户介入(User 类)

通过 HIL 或错误提示让用户决定下一步。

---

## 对用户可见的错误如何呈现

原则:**说清楚发生了什么 + 用户能做什么**。

### 错误消息模板

```
❌ 生成被中断: {原因}

已产出的部分仍然可用。
你可以:
- 重新请求(可以把你想要的东西说得更具体一些)
- 继续生成剩余部分 {如果可行}
- 查看详情 {开发模式下展示 trace}
```

**不要**:
- 技术栈错(stack trace)
- 代码错误信息(如"JSON parse error")
- 模糊的"抱歉出错了"

### 不同错误的具体文案

- **超预算**:"这个请求的生成消耗超过了预期,已交付当前部分。可以试试把请求拆小。"
- **Rate limit**:"请求频率过高,请稍后再试。"
- **模型 API 错误**:"Claude 服务暂时有问题,请稍后重试。"
- **HIL 超时**:"一段时间没有收到你的回答,这次生成已暂停。可以重新开始。"

---

## 预算模型

每个层级都有明确的预算上限。超限行为也明确。

### 层级

```
Turn Budget (整次请求)
 ├── Plan Budget (整个 plan 的累积上限)
 │    └── Phase Budget (单 phase 上限)
 │         └── Attempt Budget (单次 Executor 调用上限)
 │
 ├── Replan Budget (重规划次数上限)
 ├── HIL Budget (HIL 次数上限)
 └── Time Budget (整体超时)
```

### 默认值(可配置)

以下是 V1 建议值,根据请求复杂度可配置:

| 预算项 | 默认值 | 说明 |
|---|---|---|
| Turn max_output_tokens | 20000 | 整个 turn 的模型输出 token 总和 |
| Turn max_duration_ms | 300000 | 5 分钟 |
| Plan max_phases | 5 | 超过视为 plan 太细,压缩 |
| Phase max_output_tokens | 6000 | 单 phase 产出上限 |
| Phase max_attempts | 2 | 档位 1 重试次数 |
| Phase timeout_ms | 60000 | 单 phase 1 分钟 |
| Attempt timeout_ms | 45000 | 单次 Executor 调用 45 秒 |
| Replan max_count | 2 | 档位 2 次数 |
| Replan (档位 3) max_count | 1 | 整次会话最多 1 次 |
| HIL max_count | 2 | 整次 turn 最多 2 次 HIL |

### Token 预算的定义(澄清 V1 定义)

**Turn output_tokens 指的是**:
- Executor 的所有 completion tokens 之和
- Critic 的所有 completion tokens 之和
- Layer A(Intent)的 completion tokens
- **不包括**:prompt tokens(输入侧不控预算)、thinking tokens(如果用 thinking 模型)

不把 prompt tokens 纳入的原因:
- skill pack 占用的 input 是固定成本
- context 膨胀是 Orchestrator 该控制的(通过 PhaseOutcome 摘要)
- 控 prompt token 会让系统变得过度保守

**thinking tokens** 不纳入预算的原因:
- 对用户不可见,只影响 API 费用
- V1 简化,只盯着可见产出

生产环境可以另加一个 cost budget(美元数)作为第二道保险。

### 超预算的行为定义

超预算时系统的具体行为:

**Phase 级超预算**:
- 流式生成中,实时计数 token
- 接近上限时,发一个控制消息给模型:"budget 已消耗 80%,请尽快收敛"
- 达到上限 → 立即停止流,强制插入 `</phase>` + `<milestone/>`
- Critic 照常判断,可能导致 fail → 进入档位 1 重试(重试时减半 budget)

**Plan 级超预算**:
- 累积 Token 到上限 → 停止开启新 phase
- 当前 phase 如果未完成,让它跑完当前 widget 再停
- 跳过 Review Phase
- 状态为 `completed` 但附加"部分截断"标记

**Turn 级超预算**:
- 上面都是软界限,Turn 级是硬上限
- 到 Turn 上限立即 abort,turn.status = errored 或 completed with warning
- 已产出部分持久化并展示

### 预算的动态调整

不要做"预算用剩了多少,平均分给剩下的 phase"这种动态优化。保持预算静态、可预测。

唯一的动态规则:档位 2 产出的新 phase 用**减半 budget**,防止升档时的预算爆炸。

---

## 可观测性要求(补充 06 号文档)

每次错误和预算事件必须记录到 trace:

- 错误类别、错误码、发生位置、caused_by 链
- 每次预算检查点的消耗情况
- 每次升档的决策依据

开发阶段把 trace 可视化成时间轴,一眼看清"哪里超预算、哪里重试、哪里降级"。

---

## 与 Orchestrator 的协作

**预算判定的时机**:
- 每次 Executor 调用前检查剩余 Turn budget
- 每次 Phase 开始前检查剩余 Plan budget
- Phase 内流式生成时,每 N 个 chunk 检查 Phase budget
- 每次升档前检查 Replan budget

**错误上报的时机**:
- Parser 的 warning → 立即上报,不阻塞
- Critic 的 fail → 作为 Orchestrator 决策输入,不是错误
- 模型 API 错误 → 立即上报并退避重试
- 其他系统错误 → 立即上报并按分类处理

---

## 失败降级的优雅性

**系统的目标不是"不失败",是"失败时仍有价值"**。

- 部分 phase 失败 → 交付成功部分 + 说明缺失什么
- Review 发现不连贯 → 仍然交付,附警告
- 超预算中断 → 交付当前状态,提示用户可以继续请求补充
- HIL 超时 → 保留已产出 artifact,不清空

**不接受的做法**:
- "抱歉出错了"然后什么都不给
- 清空用户已经看到的内容
- 无限重试直到成功

每一次失败,都应该至少留下可供用户参考的部分产出。

---

## V1 不处理

明确放弃的边界:

- API Rate Limit → 直接错误提示,不做智能退避队列
- 模型切换 → 单一模型,不做 fallback 到另一个模型
- 跨区域容灾 → 单机部署
- 幂等性保证 → 用户重复提交可能产生重复 artifact(V1 不去重)
- 恶意输入检测 → 假设可信环境

这些在 V2 再考虑。
