# Explainer Recipe（参考示范，不是模板）

> v5 说明：不要"识别为 Topic → 套 explainer 模板"。这个文件是**参考示范**，
> 展示当用户做纯知识性查询时高质量产出是什么样的。看模式，不要复制结构。

## 适用场景

用户做纯知识性查询，**主语是话题，没有说"我有 Y 困扰"**。

例：
- "什么是有效需求分析" ✅
- "JWT 是怎么工作的" ✅
- "我需求分析总被打回，什么是有效需求分析" ❌（这是 Mixed → consulting）

---

## 平庸产出 vs 高质量产出（必须模仿高质量）

### 用户问："什么是有效需求分析"

---

#### ❌ 平庸产出（要避免）

```
P1: SVG 展示五阶段流程: 理解业务目标 → 识别用户痛点 → 收集整理 → 澄清验证 → 优先级排序

P2: 列出四大误区:
  - 用户说了算（直接实现需求）
  - 闭门造车（不做用户验证）
  - 一次性分析（没有迭代）
  - 重功能轻目标

P3: 持续优化建议: 学习用户研究方法 / 培养同理心 / 建立反馈闭环 / 团队协作
```

**为什么平庸**：把任何入门书第一章的内容复述了一遍。信息密度低，用户读完没新东西。
SVG 去掉文字就是五个横排方块；HTML 没有；P3 全是笼统建议。

---

#### ✅ 高质量产出（要模仿）

```xml
<think>
Topic 请求，教学模式。独特价值：
  P1 展示"有效"和"无效"在具体决策点的差异，用真实案例，不是流程图
  P2 给可立即套用的"需求成熟度自测"，让用户对照自己最近一次分析
  P3 深挖一个"看起来对但其实错"的反例，给出识别信号
这些都是入门书里找不到的。
</think>

<plan recipe="explainer" depth="standard">
  <phase id="p1" goal="用 SVG 对比图展示同一需求'导出报表'经有效/无效分析后产生的不同结论，标注关键分叉点">
    <acceptance>
      <criterion type="widget_exists" widget="svg"/>
      <criterion type="semantic" desc="有完整的追问链，不是流程图"/>
    </acceptance>
  </phase>
  <phase id="p2" goal="用 html 展示需求分析成熟度自测，用户对照最近一次分析打分，每项附'成熟者做法 vs 新手做法'对比">
    <acceptance>
      <criterion type="widget_exists" widget="html"/>
      <criterion type="semantic" desc="用户做完后能知道自己卡在哪个维度"/>
    </acceptance>
  </phase>
  <phase id="p3" goal="拆解'用户说要什么就做什么'的反直觉代价：为什么这个行为看起来对？它的隐藏成本是什么？给出识别信号清单">
    <acceptance>
      <criterion type="word_count" min="200" max="500"/>
      <criterion type="semantic" desc="有具体的信号清单，不是笼统建议"/>
    </acceptance>
  </phase>
</plan>

<phase id="p1">
  <think>SVG 对比图：左边是无效分析路径（直接做功能），右边是有效分析路径（5 Why 追问→真实需求）。去掉文字后路径差异仍然可见。</think>
  <widget id="w1" type="svg" title="同一需求的两条分析路径">
    <svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg">
      <style>
        .box-bad { fill: var(--color-danger, #ef4444); opacity: 0.15; stroke: var(--color-danger, #ef4444); stroke-width: 1.5; }
        .box-good { fill: var(--color-success, #10b981); opacity: 0.15; stroke: var(--color-success, #10b981); stroke-width: 1.5; }
        .box-start { fill: var(--color-accent, #6366f1); opacity: 0.2; stroke: var(--color-accent, #6366f1); stroke-width: 1.5; }
        .arrow { stroke: var(--color-muted, #94a3b8); stroke-width: 1.5; fill: none; }
        .label { fill: var(--color-fg, #e2e8f0); font-size: 11px; font-family: system-ui; }
        .sublabel { fill: var(--color-muted, #94a3b8); font-size: 10px; font-family: system-ui; }
        .tag { font-size: 10px; font-weight: 600; }
      </style>
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-muted, #94a3b8)"/>
        </marker>
      </defs>
      <!-- 起点 -->
      <rect x="220" y="20" width="200" height="36" rx="6" class="box-start"/>
      <text x="320" y="38" text-anchor="middle" class="label" font-weight="600">需求："我想要导出报表"</text>
      <!-- 分叉箭头 -->
      <line x1="260" y1="56" x2="130" y2="95" stroke="var(--color-muted,#94a3b8)" stroke-width="1.5" marker-end="url(#arr)"/>
      <line x1="380" y1="56" x2="510" y2="95" stroke="var(--color-muted,#94a3b8)" stroke-width="1.5" marker-end="url(#arr)"/>
      <!-- 标签 -->
      <text x="140" y="82" text-anchor="middle" class="sublabel" fill="var(--color-danger,#ef4444)" font-weight="600">无效分析路径</text>
      <text x="500" y="82" text-anchor="middle" class="sublabel" fill="var(--color-success,#10b981)" font-weight="600">有效分析路径</text>
      <!-- 左路：直接开发 -->
      <rect x="60" y="100" width="160" height="32" rx="4" class="box-bad"/>
      <text x="140" y="121" text-anchor="middle" class="label">直接设计导出功能</text>
      <line x1="140" y1="132" x2="140" y2="165" stroke="var(--color-muted,#94a3b8)" stroke-width="1.5" marker-end="url(#arr)"/>
      <rect x="60" y="170" width="160" height="32" rx="4" class="box-bad"/>
      <text x="140" y="191" text-anchor="middle" class="label">开发完上线</text>
      <line x1="140" y1="202" x2="140" y2="235" stroke="var(--color-muted,#94a3b8)" stroke-width="1.5" marker-end="url(#arr)"/>
      <rect x="60" y="240" width="160" height="36" rx="4" class="box-bad"/>
      <text x="140" y="258" text-anchor="middle" class="label">用户："不是我要的"</text>
      <text x="140" y="271" text-anchor="middle" class="sublabel">沉没成本 + 返工</text>
      <!-- 右路：5 Why 追问 -->
      <rect x="420" y="100" width="180" height="32" rx="4" class="box-good"/>
      <text x="510" y="121" text-anchor="middle" class="label">Why？导出后做什么？</text>
      <line x1="510" y1="132" x2="510" y2="155" stroke="var(--color-muted,#94a3b8)" stroke-width="1.5" marker-end="url(#arr)"/>
      <text x="510" y="168" text-anchor="middle" class="sublabel">"发给销售主管看业绩"</text>
      <line x1="510" y1="175" x2="510" y2="193" stroke="var(--color-muted,#94a3b8)" stroke-width="1.5" marker-end="url(#arr)"/>
      <text x="510" y="208" text-anchor="middle" class="sublabel">"评估各地区达成率"</text>
      <line x1="510" y1="215" x2="510" y2="233" stroke="var(--color-muted,#94a3b8)" stroke-width="1.5" marker-end="url(#arr)"/>
      <rect x="420" y="238" width="180" height="36" rx="4" class="box-good"/>
      <text x="510" y="256" text-anchor="middle" class="label">真实需求：销售绩效看板</text>
      <text x="510" y="269" text-anchor="middle" class="sublabel">完全不同的产品方向 ✓</text>
    </svg>
  </widget>
  <widget id="w2" type="markdown">
上图的关键分叉在**第一个 Why**。

两条路径的本质差异不是"做不做需求分析"，而是**在哪一步停止追问**。

无效分析路径的隐性假设是："用户要的功能 = 用户的真实目标"。这个假设在功能简单时偶尔成立，在功能背后有业务逻辑时几乎总是错的。

有效需求分析的核心动作是**把功能描述转化成行为目标**：不问"要什么功能"，问"用这个功能完成什么任务"。这一步的追问质量，决定了后续所有工作的方向是否正确。
  </widget>
  <milestone/>
</phase>

<phase id="p2">
  <think>HTML 自测工具：用户对照自己最近一次需求分析打分，5个维度，每项附对比。用完后用户知道自己卡在哪里——认知有变化，满足 HTML 质量标准。</think>
  <widget id="w3" type="html" title="需求分析成熟度自测">
    <div style="font-family:system-ui,sans-serif;padding:20px;max-width:560px;background:#0f172a;color:#e2e8f0;border-radius:12px">
      <p style="font-size:13px;color:#94a3b8;margin:0 0 16px">对照你最近一次做需求分析的经历，每项选一个：</p>
      <div id="quiz" style="display:flex;flex-direction:column;gap:14px"></div>
      <div id="result" style="margin-top:20px;padding:14px;border-radius:8px;display:none;background:#1e293b"></div>
      <script>
        const items = [
          {
            q: "1. 你在分析需求时，主要的信息来源是？",
            opts: [
              { t: "产品文档/需求单里用户写的功能描述", s: 0 },
              { t: "和用户/业务方的对话记录", s: 1 },
              { t: "观察用户实际使用行为或追问'做这个功能之后你会做什么'", s: 2 },
            ]
          },
          {
            q: "2. 当用户说'我要 A 功能'时，你的第一反应是？",
            opts: [
              { t: "直接规划 A 功能的实现方案", s: 0 },
              { t: "问'为什么需要 A'，但只问一层", s: 1 },
              { t: "问'用 A 功能完成什么任务'，追问到能描述出具体场景", s: 2 },
            ]
          },
          {
            q: "3. 你如何判断需求分析'做完了'？",
            opts: [
              { t: "把用户提的功能点都列出来了", s: 0 },
              { t: "澄清了优先级和边界", s: 1 },
              { t: "能用一句话说清楚'用户要解决的核心问题'，且这句话和用户原话不一样", s: 2 },
            ]
          },
          {
            q: "4. 需求评审时，你主要回答哪类问题？",
            opts: [
              { t: "功能细节和交互规范", s: 0 },
              { t: "为什么做这个需求，优先级如何", s: 1 },
              { t: "'如果不做这个功能，用户会用什么方式解决？'类的替代方案问题", s: 2 },
            ]
          },
          {
            q: "5. 一个需求被开发完上线后，你关注什么？",
            opts: [
              { t: "功能是否按需求文档实现了", s: 0 },
              { t: "用户是否在用这个功能", s: 1 },
              { t: "用了这个功能后，原来的业务问题是否真的被解决了", s: 2 },
            ]
          }
        ]
        const selected = Array(items.length).fill(-1)
        function render() {
          document.getElementById('quiz').innerHTML = items.map((item, i) =>
            `<div>
              <p style="font-size:13px;margin:0 0 8px;color:#cbd5e1">${item.q}</p>
              <div style="display:flex;flex-direction:column;gap:6px">
                ${item.opts.map((o, j) =>
                  `<button onclick="pick(${i},${j})" style="text-align:left;padding:9px 13px;border-radius:7px;cursor:pointer;font-size:12px;border:1px solid ${selected[i]===j?'#6366f1':'#334155'};background:${selected[i]===j?'rgba(99,102,241,0.15)':'#1e293b'};color:#e2e8f0;transition:all 0.15s">${o.t}</button>`
                ).join('')}
              </div>
            </div>`
          ).join('')
          if (selected.every(s => s !== -1)) showResult()
        }
        function pick(i, j) { selected[i] = j; render() }
        function showResult() {
          const total = selected.reduce((sum, j, i) => sum + items[i].opts[j].s, 0)
          const max = items.length * 2
          const pct = Math.round(total / max * 100)
          const levels = [
            { min: 0, label: '功能执行者', desc: '你目前主要在"翻译"用户的功能请求。关键突破点：在说"好，我们来规划"之前，先追问一句"完成这个功能后，你接下来会做什么"。' },
            { min: 35, label: '需求澄清者', desc: '你在做需求分析，但还在功能层面澄清。下一步：把"为什么要这个功能"变成"用这个功能解决什么具体场景下的什么问题"。' },
            { min: 65, label: '问题定义者', desc: '你已经在用问题思维做需求分析。精进方向：把"用户的问题"和"业务的问题"分开——同一个功能，两个视角的重要性可能完全不同。' },
          ]
          const level = [...levels].reverse().find(l => pct >= l.min) || levels[0]
          document.getElementById('result').style.display = 'block'
          document.getElementById('result').innerHTML =
            `<div style="font-size:12px;color:#94a3b8;margin-bottom:6px">你的需求分析成熟度</div>
             <div style="font-size:18px;font-weight:700;color:#a78bfa;margin-bottom:8px">${level.label}（${pct}%）</div>
             <div style="font-size:13px;color:#cbd5e1;line-height:1.6">${level.desc}</div>`
        }
        render()
      </script>
    </div>
  </widget>
  <milestone/>
</phase>

<phase id="p3">
  <think>深挖反直觉反例："用户说要什么就做什么"看起来最尊重用户，但为什么会导致失败？给识别信号清单。这是入门书里找不到的深度拆解。</think>
  <widget id="w4" type="markdown" title="最危险的需求分析陷阱：完全按用户说的做">
## "用户说什么就做什么"为什么看起来对

这个行为有三重正面包装：
1. **显得尊重用户**："我不替用户做决定"
2. **规避内部争议**："这是用户要的，不是我发明的"
3. **降低沟通成本**：不需要深入理解，照单执行更快

正是因为这三个理由，它是需求分析里最隐蔽的陷阱。

## 它的真实代价

用户描述的是他看到的**解法**，不是他想解决的**问题**。

当你实现用户说的解法时，你实际上是在验证他对自己问题的诊断是否正确。但用户通常不是产品设计师，他的诊断往往是局部的、表面的，甚至是错的。

结果：功能上线了，但那个业务问题还在。

## 识别你是否正在犯这个错

如果以下情况出现在你的工作中，说明你在完全按用户说的做需求分析：

- 需求文档里，需求的描述和用户原话几乎一样
- 你说不清楚"如果不做这个功能，用户会用什么方式解决"
- 需求评审里，你主要回答"用户要的"，很少说"用户要解决的"
- 功能上线后，你衡量成功的指标是"功能是否正常运行"，不是"问题是否被解决"
- 你很少会说出"用户要的是 A，但他真正的问题其实是 B"这类句子

## 不是不听用户的，而是听不同的层

用户说的话有两层：

| 层次 | 内容 | 正确处理方式 |
|---|---|---|
| **功能层**（用户明确表达的） | "我要导出报表" | 作为线索，追问背后是什么 |
| **目标层**（用户想达成的） | "评估销售业绩" | 这才是需求分析的起点 |

有效需求分析的核心不是"怎么实现用户要的功能"，而是"找到用户要实现的目标，然后判断他说的功能是不是最好的路径"。
  </widget>
  <milestone/>
</phase>
```

---

## Phase 结构模板

```xml
<plan recipe="explainer" depth="standard">
  <phase id="p1" goal="用 SVG 对比图展示[有效 vs 无效]在[关键决策点]的差异">
    <acceptance>
      <criterion type="widget_exists" widget="svg"/>
      <criterion type="semantic" desc="有完整案例，不是流程图"/>
    </acceptance>
  </phase>
  <phase id="p2" goal="用 html [自测工具/对比演示]让用户对照自己的实际情况">
    <acceptance>
      <criterion type="widget_exists" widget="html"/>
      <criterion type="semantic" desc="用完后用户知道自己卡在哪里"/>
    </acceptance>
  </phase>
  <phase id="p3" goal="拆解一个[反直觉的反例/常见误用]，给出识别信号清单">
    <acceptance>
      <criterion type="word_count" min="200" max="500"/>
      <criterion type="semantic" desc="有具体信号，不是笼统建议"/>
    </acceptance>
  </phase>
</plan>
```

## 独特价值自检（每个 phase 前回答）

- P1：SVG 去掉文字后，路径差异是否仍然可见？
- P2：HTML 自测用完后，用户是否知道自己卡在哪个维度？
- P3：有没有"看起来对但实际是陷阱"的具体机制拆解？

全部否 → 退化成通识教材，重写。
