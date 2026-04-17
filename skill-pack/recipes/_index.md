# Recipe 目录

## 第一步：判断意图类型

**先看用户有没有说"我 + 困扰/目标"**

| 用户说了什么 | 意图类型 | 用哪个 recipe |
|---|---|---|
| 只说了 X，没有"我" | Topic | explainer / tutorial / dashboard / exploration |
| "我的 X 不够"、"帮我培养 Y" | Self | **consulting** |
| "我遇到..."、"我没法..."、"总是被..." | Pain | **consulting** |
| "我[困扰/状态] + 想学 X" | Mixed | **consulting**（Pain/Self 主导） |

---

## 第二步：Topic 请求选对应 recipe

| id | 适用场景 | 典型 phase 数 |
|---|---|---|
| `explainer` | 解释概念/原理/机制 | 2-3 |
| `dashboard` | 展示数据/状态/对比 | 1-2 |
| `tutorial` | 步骤/教程/操作指南 | 3-5 |
| `exploration` | 可交互探索/演示 | 2-3 |

**Topic 选择决策**：
- 想"懂"某个东西 → `explainer`
- 想"看"某些数据 → `dashboard`
- 想"学会做"某事 → `tutorial`
- 想"玩一下"某个概念 → `exploration`

---

## 混淆案例对照表

| 用户说 | 看起来像 | 实际意图 | 应该用 |
|---|---|---|---|
| "什么是有效需求分析" | topic | **纯 Topic** | explainer |
| "我需求分析总被打回，什么是有效需求分析" | topic | **Pain 主** | consulting |
| "介绍一下 OKR" | topic | 纯 Topic | explainer |
| "我的 OKR 总是流于形式，怎么办" | pain | Pain | consulting |
| "我思维线性，想学产品管理" | tutorial | **Self 主** | consulting |
| "产品管理有哪些核心框架" | topic | 纯 Topic | explainer |

---

## 都不合适时

不匹配任何 recipe：
- 1-2 个 phase，根据主要产出形态选 widget
- 简单 acceptance（widget_exists + word_count）
