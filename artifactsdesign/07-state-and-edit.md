# 07 · 状态、持久化、编辑迭代

这一层解决"用户刷新页面后还在不在"、"前面的 artifact 还能不能引用和编辑"、"生成中断怎么恢复"等问题。

---

## 核心实体

```
Session (一个用户的一段连续交互)
  └── Conversation (一段对话,包含多轮)
        └── Turn (一个请求-响应对)
              └── Artifact (如果这一 turn 产生了 artifact)
                    ├── Plan (一次性,可能有多版本如果重规划)
                    │     └── Phase[]
                    └── Widget[] (最终产出,按顺序)
```

### 各实体的定义

**Session**
- 用户登录或匿名标识的连续交互
- 存储偏好、主题选择、跨 conversation 的 state
- V1 简化:可以直接和用户账号或浏览器标识绑定

**Conversation**
- 一个主题聚焦的对话流
- 包含多个 turn
- UI 上通常对应一个"对话窗口"

**Turn**
- 一轮"用户说 → Claude 响应"
- 一个 turn 最多关联一个 artifact
- Turn 的状态:pending / running / completed / interrupted / errored

**Artifact**
- Turn 产生的结构化产出
- 有持久 id,可被后续 turn 引用和编辑
- Artifact 的状态:generating / ready / editing / archived

**Widget**
- Artifact 的组成单元,有稳定 id
- 见 03 号文档

---

## 状态存储(V1 极简)

V1 不做分布式,不做复杂缓存。单一存储可以是:

- **开发阶段**:内存 + 本地 JSON 文件
- **早期部署**:单实例 SQLite 或 PostgreSQL
- **数据结构**:扁平表,靠外键关联

### 推荐表结构

```
sessions (id, user_id, created_at, updated_at, preferences_json)

conversations (id, session_id, title, created_at, updated_at)

turns (
  id, conversation_id, sequence, role,
  user_input, status, error_info,
  artifact_id,            -- 关联产出
  created_at, completed_at
)

artifacts (
  id, turn_id, status,
  plan_snapshot_json,     -- 最终 plan 的完整快照
  created_at, updated_at,
  parent_artifact_id      -- 如果是编辑衍生出的新版本
)

widgets (
  id, artifact_id, sequence,
  type, title, content,
  status,                 -- complete / partial / failed
  metadata_json
)

traces (id, turn_id, trace_json)   -- 可观测性,见 06 号文档
```

### Artifact 的"版本"机制

**V1 不做真正的版本树**,但要支持"基于旧 artifact 编辑产生新 artifact":

- 每次编辑创建新 artifact,带 `parent_artifact_id` 指向上一版
- UI 上默认展示最新版
- 用户可以"回到上一版"(通过 parent_artifact_id 导航)
- 不做分支、不做 merge

---

## Turn 生命周期

```
              ┌─────────────┐
              │   pending   │  (用户输入已接收,未开始处理)
              └──────┬──────┘
                     ↓
              ┌─────────────┐
              │   running   │  (Orchestrator 正在执行)
              └──────┬──────┘
                     ↓
          ┌──────────┼──────────┬──────────┐
          ↓          ↓          ↓          ↓
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │completed│ │ errored │ │interrupt│ │ timeout │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

### 每个状态的含义

- **pending**:队列中(V1 串行,一般不会停在这)
- **running**:正在生成。Orchestrator 持有执行上下文。
- **completed**:成功交付 artifact
- **errored**:遇到不可恢复错误。有 error_info 记录原因。
- **interrupted**:用户主动取消,或页面关闭后恢复检测到的"半成品"
- **timeout**:整体超时(V1 建议 5 分钟上限)

### interrupted 的恢复策略

用户刷新页面后,如果检测到有 running 或 interrupted 状态的 turn:

**V1 简化策略**:
- 如果 artifact 已有至少 1 个完成的 widget → 显示"生成中断,这是已完成的部分",让用户选择"继续生成"或"从头开始"
- 如果没有 widget → 静默放弃,像这个 turn 没发生过

**不支持**:
- 从中断点精确恢复继续生成
- 自动重试

原因:Orchestrator 的执行上下文(plan 状态、budget 余量、attempts 计数)不容易完美重建,重新生成比精确恢复更可靠。

---

## Artifact 的状态管理

### 状态定义

- **generating**:Orchestrator 正在产出
- **ready**:生成完成,可被查看、引用、编辑
- **editing**:正在被 edit mode 修改(此时 UI 上应该锁住其他编辑入口)
- **archived**:被归档(V1 不用,预留)

### 并发保护

V1 假设单用户串行,但仍需基本保护:
- 一个 artifact 同时只能有一个 editing 进行中
- generating 状态下不能接受 edit 请求(要等 ready)
- 如果用户快速发起第二个请求,前一个请求没完成 → UI 层阻止或提示

---

## 新建 vs 编辑的判定

用户发起请求时,Orchestrator 需要判断这是**新建 artifact** 还是**编辑已有 artifact**。

### 判定规则(按优先级)

1. **用户显式指令**:用户点击了"编辑当前 artifact"的按钮 → 编辑
2. **引用式输入**:用户消息里含"把刚才的..."、"上面那个..."、"第二个图..." 等引用词 → 编辑
3. **低门槛启发式**:
   - 上一个 turn 有 artifact 产出
   - 用户输入 < 20 字
   - 输入里含修改动词("改"、"换"、"加"、"删"、"调整")
   → 编辑
4. **否则** → 新建

### 判定的模糊处理

如果启发式判断为"可能是编辑但不确定",可以:
- Orchestrator 先用 Layer A 的轻量模型调用确认
- 在 prompt 里同时给模型"新建"和"编辑"两种可能,让模型自己选并标记

### 判定错误的恢复

如果判定错了(比如用户想新建但被识别为编辑):
- UI 上显示"我正在编辑上一个 artifact,如果你想新建请点此"
- 允许用户一键切换模式

---

## Edit Mode 的状态流

```
用户触发编辑 → 判定为 edit → Orchestrator 进入 edit flow

edit flow:
  1. 加载上一版 artifact 的 widgets 列表
  2. 构造 prompt 给模型:包括当前 artifact 的结构 + 用户编辑意图
  3. 模型输出 <edit> 协议
  4. 解析 <edit> 操作 (modify/append/remove/...)
  5. 创建新的 artifact 记录(parent_artifact_id = 旧 id)
  6. 把未被 modify/remove 的 widget 拷贝到新 artifact
  7. 执行 modify/append 操作,产生新 widget
  8. 新 artifact 状态 → ready
  9. UI 切换到新 artifact(旧 artifact 仍可访问)
```

### Edit 的 prompt 构造

```
[System] SKILL.md + protocol.md + edit_protocol_section
[User] 原始请求(最近的那一轮)
[Assistant] <plan>...</plan> (旧 artifact 的 plan)
[Orchestrator Summary] 旧 artifact 的结构:
  widgets:
    - id=w1, type=svg, title="OAuth 流程图"
    - id=w2, type=markdown, title="介绍文字"
    - id=w3, type=svg, title="详细步骤图"
[User] {当前编辑请求}
[Orchestrator] 请用 <edit> 协议产出,只改动需要改的 widget。
```

### Edit 的约束(重复 03 号文档,这里再强调)

- 一次 edit 最多 5 个操作
- 每个 operation 互斥(不能对同一 widget 既 modify 又 remove)
- 不触发完整 plan / Critic,只做 Structural Check
- Budget 比新建少(约 1/3)
- 不生成 Review Phase

---

## 跨 Turn 的 Artifact 引用

用户在后续 turn 里引用前面的 artifact("那个图很好,按同样风格再画一个"):

### 引用如何注入 prompt

- Orchestrator 把被引用的 artifact 的结构化摘要注入 prompt
- 不注入完整 widget 内容(除非用户明确说"改一下那个图")
- 摘要格式:
  ```
  [Reference] Artifact {id}:
    - widget w1 (svg, "流程图"): 展示了 A → B → C → D 四步
    - widget w2 (markdown, "说明"): 描述了 token 交换机制
  ```

### 引用的自动化检测

- 简单规则:用户输入里含代词("那个"、"刚才的")且上一 turn 有 artifact → 尝试注入引用
- 精确引用:用户点击 artifact 里的 widget → UI 附加引用信息到下一条消息

---

## 持久化的最小实现

V1 不需要复杂的 ORM。推荐:

**读路径**:
- 启动时,如果有 session_id,从存储加载最近 N 条 turn
- 打开 artifact 详情时加载其 widgets

**写路径**:
- Turn 开始 → 创建 turn 记录,status=running
- Widget 关闭(闭合标签)→ 立即持久化该 widget
- Phase 完成 → 更新 plan_snapshot
- Turn 完成 → 更新 status=completed 和 artifact_id

**关键**:widget 的持久化是**流式的**,每个 widget 完成就写。不等整个 turn 结束。这让中断恢复有东西可展示。

---

## Session 级偏好

存储在 session 记录的 preferences_json 里:

```
{
  "theme": "dark" | "light",
  "default_depth": "skim" | "standard" | "deep-dive",
  "animation_enabled": boolean,
  "hil_tolerance": "low" | "normal" | "high"   // 决定 HIL 触发阈值
}
```

这些偏好:
- 不影响 artifact 内容本身
- 影响 Orchestrator 的默认行为
- 影响 UI 渲染

用户可以在设置里修改。V1 可以只做主题和 hil_tolerance 两个。

---

## 清理策略

V1 不做自动清理,但建议:

- Trace 只保留最近 30 天(可观测性用)
- Artifact 保留,不自动删(用户的内容)
- Session preferences 永久保留

清理可以是一个简单的定时任务,不是核心功能。

---

## 状态管理的 V1 简化总结

不做的事(都留给 V2):
- 多设备同步
- 实时协作
- 复杂的版本树与 merge
- 冷热数据分层
- 分布式锁
- 精确的中断恢复

做的事:
- 基本的 CRUD + 外键
- Turn / Artifact / Widget 状态机
- 流式持久化(widget 完成就写)
- 新建 vs 编辑的判定
- Edit Mode 的衍生 artifact
- 跨 turn 引用的 prompt 注入

这些做到,V1 就能支撑"记得住、改得了、恢复得动"的基本体验。
