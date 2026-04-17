# Tutorial Recipe

## 何时用

用户想学会做某件事、操作步骤、上手指南。
关键词："怎么做"、"如何"、"步骤"、"教程"、"入门"

## Phase Goal 规则

❌ "介绍 X 的基础概念" → ✅ "用可运行代码+注释拆解 X 的第一个完整示例"
❌ "讲解 A、B、C 步骤" → ✅ "用 SVG 流程图展示 A→B→C 的决策路径和每步的注意事项"
❌ "总结最佳实践" → ✅ "对比三种常见错误做法和正确做法（代码 diff 风格）"

## 典型 Plan 骨架

```xml
<plan recipe="tutorial" depth="standard">
  <phase id="p1" goal="用 SVG 流程图展示整体步骤和关键决策点">
    <acceptance>
      <criterion type="widget_exists" widget="svg"/>
    </acceptance>
  </phase>
  <phase id="p2" goal="用可运行代码+行内注释展示核心步骤的完整实现">
    <acceptance>
      <criterion type="word_count" min="200" max="600"/>
      <criterion type="covers_topics" topics="步骤1,步骤2,步骤3"/>
    </acceptance>
  </phase>
  <phase id="p3" goal="对比三种常见错误写法和正确写法（附错误原因）">
    <acceptance>
      <criterion type="semantic" desc="每种错误有代码示例和原因说明"/>
    </acceptance>
  </phase>
</plan>
```

## Widget 组合建议

- Phase 1：**svg**（步骤流程图，标注决策点）
- Phase 2：**markdown**（代码块为主，inline 注释）
- Phase 3：**markdown** 或 **html**（对比 diff 展示）
- 有安装/配置步骤：html widget 做交互式命令选择器
