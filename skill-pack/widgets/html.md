# HTML Widget

## 用途（三种合法用途）

html widget **只用于**以下三种场景。其他场景退化成 markdown。

### 1. 诊断（Diagnosis）
通过用户的选择/点击，反馈"你是哪种类型/可能卡在哪里"。

判断标准：用户点击后，理解了自己的状态 → ✅；只是看了更多信息 → ❌

```html
<div style="font-family:system-ui;padding:20px;max-width:520px;background:#f8fafc;border-radius:12px">
  <p style="font-size:14px;color:#64748b;margin:0 0 14px">以下哪种最像你的情况？</p>
  <div style="display:flex;flex-direction:column;gap:8px" id="opts">
    <!-- 每个选项 -->
  </div>
  <div id="fb" style="margin-top:16px;padding:12px;border-radius:8px;display:none"></div>
  <script>
    const data = [
      { text: 'A. ...', fb: '你卡在X层，通常需要...', bg: '#ede9fe' },
      { text: 'B. ...', fb: '你的问题是Y，关键在...', bg: '#d1fae5' },
    ]
    document.getElementById('opts').innerHTML = data.map((d, i) =>
      `<button onclick="show(${i})" style="text-align:left;padding:10px 14px;background:white;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:13px">${d.text}</button>`
    ).join('')
    function show(i) {
      const fb = document.getElementById('fb')
      fb.style.display = 'block'
      fb.style.background = data[i].bg
      fb.innerHTML = `<strong style="font-size:13px">${data[i].fb}</strong>`
    }
  </script>
</div>
```

### 2. 练习（Practice）
用户做一个操作，系统给实质性反馈（不是只展示更多内容）。

```html
<div style="font-family:system-ui;padding:20px;max-width:520px;background:#f8fafc;border-radius:12px">
  <p style="font-size:13px;color:#64748b;margin:0 0 10px">输入你最近遇到的一个用户投诉：</p>
  <textarea id="inp" rows="3" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;resize:vertical"></textarea>
  <button onclick="analyze()" style="margin-top:10px;padding:8px 20px;background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer">分析思维路径</button>
  <div id="res" style="margin-top:14px"></div>
  <script>
    function analyze() {
      const v = document.getElementById('inp').value.trim()
      if (!v) return
      // 给出引导性反馈（具体建议，不是空洞鼓励）
      document.getElementById('res').innerHTML = `...`
    }
  </script>
</div>
```

### 3. 镜像（Mirror）
用户输入自己的内容，系统用新视角重新呈现，让用户"看见自己"。

```html
<!-- 用户输入 → 系统用非线性视角/对立面/追问链 重新呈现 -->
```

---

## 不合法的用途（退化成 markdown）

- ❌ 把 3 个步骤放在 tab 里——这只是换了展示，没有给用户新理解
- ❌ 折叠/展开展示信息——这是展示技巧，不是诊断/练习/镜像
- ❌ "点击看更多"——只要信息是静态的，用 markdown

**判定规则**：widget 结束后，用户对自己/对方法的理解变深了吗？  
没有变深 → 不该用 html widget。

---

## 语法

```xml
<widget id="w1" type="html" title="诊断：你卡在哪里">
  <div style="font-family:system-ui,sans-serif;padding:16px;max-width:480px">
    ...HTML 内容...
  </div>
</widget>
```

## 约束

- 必须用内联 style，不能引用外部 CSS
- JavaScript 写在 `<script>` 内，不引用外部资源
- 颜色使用 CSS 变量（`var(--color-accent, #6366f1)` 等）
- 最外层容器加 `max-width` 和 `padding`
- **绝对不能**在内容中写 `</widget>` 字面量（用 `&lt;/widget&gt;` 或 `'</' + 'widget>'`）
