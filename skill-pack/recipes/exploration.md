# Exploration Recipe

## 何时用

用户想互动探索、体验演示、玩某个概念。
关键词："演示"、"试试"、"交互"、"玩一下"、"模拟"

## Phase Goal 规则

❌ "展示 X 的交互效果" → ✅ "做一个可以调整参数实时看变化的 html 控制台演示 X"
❌ "介绍可交互探索" → ✅ "用 html demo 让用户输入数据，实时看算法输出变化"

## 典型 Plan 骨架

```xml
<plan recipe="exploration" depth="standard">
  <phase id="p1" goal="做一个可以[具体交互行为]的 html demo，让用户直接体验 X">
    <acceptance>
      <criterion type="widget_exists" widget="html"/>
    </acceptance>
  </phase>
  <phase id="p2" goal="用 SVG 展示 X 的内部机制，解释 demo 背后的工作原理">
    <acceptance>
      <criterion type="widget_exists" widget="svg"/>
      <criterion type="word_count" min="80" max="250"/>
    </acceptance>
  </phase>
</plan>
```

## HTML Widget 规范

- 使用内联 JS，不引用外部库
- 颜色使用 CSS 变量或 inline style 中的 fallback 值
- 提供明确的交互引导文字（按钮 label、placeholder）
- 布局最大宽度 480px，padding 16-24px

## 自指场景（讨论本系统时）

本系统的 exploration 请求必须：
1. html widget：展示真实可运行的 XML 流式解析 demo（用 JS 模拟流式输入）
2. svg widget：展示系统架构数据流
3. markdown：仅做精炼补充，不超过 40%
