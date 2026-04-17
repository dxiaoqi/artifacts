# 09 · 质量评测体系

没有评测就没有质量。这一章定义"如何知道系统好不好"以及"怎么避免改动导致倒退"。

---

## 为什么需要评测体系

三个具体痛点:

1. **改了 skill 或 prompt 不知道是变好了还是变坏了**
2. **线上出了 bad case 无法系统性复现和回归**
3. **没有客观依据判断"系统够用了吗"**

Orchestrator 的 Critic 判的是"某次是否达标",质量评测判的是"系统整体水平"。两者不可替代。

---

## 评测的三层

```
Level 1: 自动化指标(每次请求都采集)
  └── 成本、延迟、失败率、升档率、HIL 频率

Level 2: 结构化验收(基准集回归)
  └── 预设一组请求,预期产出有明确特征

Level 3: 人工主观打分(定期抽样)
  └── 审美、实用性、创造力
```

三层从便宜到贵,从客观到主观。都要有。

---

## Level 1: 自动化指标

每次请求结束,Orchestrator 从 trace 提取以下指标,存入分析系统:

### 成本类

- `total_output_tokens`:单 turn 产出 token 总和
- `executor_tokens`:Executor 消耗
- `critic_tokens`:Critic 消耗
- `model_calls_count`:模型调用次数
- `total_cost_usd`:如果 API 计费,估算成本

### 延迟类

- `first_token_latency_ms`:从请求发出到第一个 display stream 事件
- `time_to_plan_ms`:到 `<plan>` 完整输出的时间
- `time_to_first_widget_ms`:到第一个 widget 开始渲染的时间
- `total_duration_ms`:整体耗时
- `pause_duration_total_ms`:所有 transition pause 的累积时长

### 稳定性类

- `turn_status`:completed / errored / interrupted / timeout
- `phase_success_rate`:本 turn 内 phase 一次通过的比例
- `retry_rate`:档位 1 触发率
- `replan_rate`:档位 2 触发率
- `abandon_rate`:phase 被标 abandoned 的比例
- `hil_count`:触发 HIL 次数
- `error_count_by_category`:按分类的错误次数

### 产出类

- `widget_count`:最终 widget 数量
- `widget_type_distribution`:各类型 widget 占比
- `phase_count`:最终 phase 数
- `edit_rate`:这个 artifact 被后续 edit 的次数(过一段时间回填)

### 指标的使用

- **监控看板**:实时展示最近 N 次请求的各项指标均值、P95、P99
- **异常告警**:超过阈值触发(例如 retry_rate > 30% 说明系统有问题)
- **长期趋势**:观察改 skill / prompt 后指标的变化

### 关键阈值建议(V1 参考)

| 指标 | 健康值 | 需关注 | 异常 |
|---|---|---|---|
| first_token_latency_ms | <1500 | 1500-3000 | >3000 |
| total_duration_ms (中等请求) | <30000 | 30000-60000 | >60000 |
| phase_success_rate | >80% | 60-80% | <60% |
| retry_rate | <20% | 20-40% | >40% |
| replan_rate | <10% | 10-20% | >20% |
| abandon_rate | <5% | 5-10% | >10% |
| hil_rate | <10% | 10-20% | >20% |
| turn errored rate | <2% | 2-5% | >5% |

---

## Level 2: 结构化验收(基准集)

### 基准集的组成

一组预先设计的请求 + 期望的产出特征。建议 V1 起步 30-50 个,覆盖主要场景。

### 每个基准测试的结构

```yaml
id: benchmark_001
category: explainer
input: "解释一下 OAuth 2.0 的授权码流程"
dimensions_expected:
  modality: mixed
  depth: standard
  audience: practitioner
assertions:
  - type: structural
    description: "至少有一个 SVG widget"
    check: widgets.filter(w => w.type == 'svg').length >= 1
  - type: structural
    description: "有 markdown 解释"
    check: widgets.filter(w => w.type == 'markdown').length >= 1
  - type: content
    description: "覆盖 4 个角色"
    check: all_text.includes_all(["Resource Owner", "Client", "Authorization Server", "Resource Server"])
  - type: content
    description: "覆盖 token 交换步骤"
    check: all_text.matches(/access[\s_]?token/i)
  - type: budget
    description: "在预算内完成"
    check: total_output_tokens < 8000
  - type: latency
    description: "首字节延迟合理"
    check: first_token_latency_ms < 2000
```

### 基准集的维护

- **覆盖面**:每个 recipe 至少 3 个测试(简单、中等、复杂),每个 widget 类型至少 1 个
- **bad case 回归**:线上发现的明显问题,简化后加入基准集
- **定期审视**:每季度检视基准集,删除过时的、补充新场景

### 执行策略

- **回归**:每次改 skill / prompt / Orchestrator 逻辑前后跑全量
- **pre-commit**:关键改动 CI 时跑 smoke 子集
- **随机抽样**:生产环境每天随机抽 N 个请求,按基准规则打分

### 断言类型

- **structural**:结构正确性(widget 数量、类型、属性)
- **content**:关键词/语义覆盖(最简单:包含某些词;更精细:调 Critic 判断)
- **budget**:预算合规
- **latency**:延迟合规
- **style**(可选):视觉一致性(比如 SVG 用了 theme 变量)

---

## Level 3: 人工主观打分

自动化指标和结构化断言覆盖不了的维度:审美、实用性、"感觉对不对"。

### 打分维度

每个维度 1-5 分:

| 维度 | 关注点 | 示例问题 |
|---|---|---|
| 准确性 | 事实对不对 | 流程图里的步骤正确吗 |
| 完整性 | 该说的说了吗 | 重要概念有没有遗漏 |
| 清晰度 | 容易懂吗 | 一个目标用户看了能理解吗 |
| 结构感 | 组织合理吗 | phase 和 widget 的组合是不是最优 |
| 视觉质量 | 好看吗 | 颜色/排版/动画是否舒服 |
| 实用性 | 有用吗 | 用户拿到这个能用上吗 |

### 打分流程

V1 推荐**极简流程**,不做复杂标注平台:

- 每天/每周固定时间,从生产环境随机抽 10-20 个 turn
- 开发者或指定评审打分(就用一张 Google Sheet / Notion 表)
- 记录打分 + 低分的具体原因
- 低分案例简化为基准测试,加入回归集

### 抽样策略

- **纯随机抽样**:看平均水平
- **异常抽样**:抽那些指标异常的(高 retry_rate、高 abandon_rate)
- **用户反馈驱动**:抽用户明确表示"不满意"的

---

## bad case 的闭环

任何一个质量问题,都要走完这个闭环:

```
1. 发现问题 (线上/评测/用户反馈)
     ↓
2. 保留 trace (turn_id)
     ↓
3. 诊断根因
   - 是 skill 没教清楚? → 改 widget 的 md,加反例
   - 是 Critic 漏判? → 加 acceptance criterion
   - 是 Orchestrator 决策错? → 改 Orchestrator 逻辑
   - 是模型能力限制? → 记录,暂不修
     ↓
4. 修复
     ↓
5. 加入基准集 (防止回归)
     ↓
6. 全量回归验证
```

没有第 5 步,同样的问题会反复出现。

---

## 跨版本对比

当系统升级(skill 版本、prompt 版本、模型版本)时:

- 全量跑基准集,对比前后指标
- 整体提升 → 采纳
- 局部倒退 → 决策:是否可接受,或修复后再采纳
- 倒退严重 → 回滚

关键是每次升级**有 before/after 数据**,不拍脑袋。

---

## 可观测基础设施

V1 推荐极简栈:

- **trace 存储**:本地 SQLite 或 PostgreSQL 的 json column
- **指标采集**:每次请求结束往一张 metrics 表插一行
- **看板**:简单的 web dashboard 展示时间序列
- **基准集运行**:一个命令行工具跑 yaml 定义的基准,产出报告

不需要:Datadog、Grafana、专门的 A/B 测试平台。那些 V2 再说。

---

## 常见的反模式

避免以下做法:

- **只看均值,不看分布**:P95/P99 暴露的问题比均值多
- **只跑基准集,不看生产**:基准集有盲区,生产是真实分布
- **只人工看,不自动化**:人工打分贵且不稳定,不做自动化会撑不住
- **改了不测,测了不改**:评测结果要有人消费,否则白测
- **基准集只加不删**:过时的基准会误导,要定期清理
- **打分维度太多**:一开始就上 10 个维度,结果没人打。V1 建议 3-5 个核心维度

---

## 一个最小的 V1 评测 Setup

如果资源极紧张,至少做到:

1. 每次请求采集 10 个核心自动化指标,存库
2. 20 个基准测试,每周跑一次
3. 开发者每周花 30 分钟看 5 个随机 turn
4. 发现的 bad case 加基准集

这个 setup 一周工作量大概 2-3 小时,但能撑起 V1 的质量底线。

---

## 与 Orchestrator 的接口

Orchestrator 需要暴露:
- Trace 可查询(按 turn_id / artifact_id)
- 指标事件的上报钩子
- 基准测试的执行 API(给指定输入,返回产出 + trace)

这些接口是评测体系的基础。在 Orchestrator 实现时就留出来,不要后来补。
