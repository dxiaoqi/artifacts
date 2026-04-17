'use client'

import { useEffect, useRef } from 'react'

interface Props {
  content: string
  isStreaming?: boolean
  title?: string
}

// Design system CSS injected into every iframe
const IFRAME_DESIGN_SYSTEM = `
<style>
:root {
  --bg-primary:    #FAF9F5;
  --bg-secondary:  #F0EEE6;
  --bg-tertiary:   #FFFFFF;
  --bg-input:      #FFFFFF;
  --text-primary:   #3D3929;
  --text-secondary: #83827D;
  --text-tertiary:  #B4B2A7;
  --text-disabled:  #D3D1C7;
  --accent:       #C96442;
  --accent-hover: #B5573A;
  --accent-bg:    #F5E9E2;
  --border-default: rgba(61,57,41,0.10);
  --border-hover:   rgba(61,57,41,0.20);
  --border-strong:  rgba(61,57,41,0.30);
  --success: #3B6D11; --success-bg: #EAF3DE;
  --warning: #854F0B; --warning-bg: #FAEEDA;
  --danger:  #A32D2D; --danger-bg:  #FCEBEB;
  --info:    #185FA5; --info-bg:    #E6F1FB;
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px;
  --duration-fast: 150ms; --duration-base: 200ms;
  --ease-smooth: cubic-bezier(0.4,0,0.2,1);
  --font-sans: ui-sans-serif,system-ui,-apple-system,sans-serif;
  --font-mono: "JetBrains Mono","Fira Code",monospace;
}
*,*::before,*::after { box-sizing: border-box; }
body {
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
  background: transparent;
  margin: 0; padding: 0;
  line-height: 1.6;
}
button {
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: var(--radius-md);
  padding: 7px 16px;
  transition: all var(--duration-fast) var(--ease-smooth);
}
button:active { transform: scale(0.97); }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 0.5px solid var(--border-hover);
}
.btn-secondary:hover { background: var(--bg-secondary); }
input, select, textarea {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-input);
  border: 0.5px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 7px 11px;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-smooth), box-shadow var(--duration-fast) var(--ease-smooth);
}
input:focus, select:focus, textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-bg);
}
/* Scrollbar */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-hover); border-radius: 999px; }
</style>`

export function HtmlWidget({ content, isStreaming, title }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (isStreaming || !iframeRef.current) return
    const iframe = iframeRef.current
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${IFRAME_DESIGN_SYSTEM}
</head>
<body>
${content}
<script>
function resize() {
  try { parent.postMessage({type:'iframe-resize',height:document.body.scrollHeight},'*'); } catch(e){}
}
window.addEventListener('load', resize);
new ResizeObserver(resize).observe(document.body);
window.sendPrompt = function(text) { parent.postMessage({type:'send-prompt',text},'*'); };
<\/script>
</body>
</html>`
    doc.open(); doc.write(html); doc.close()
  }, [content, isStreaming])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'iframe-resize' && iframeRef.current) {
        iframeRef.current.style.height = `${e.data.height + 16}px`
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  if (isStreaming) {
    return (
      <div>
        {title && <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>}
        <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>正在生成交互组件…</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      {title && <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>}
      <div style={{ borderRadius: 'var(--radius-lg)', border: '0.5px solid var(--border-default)', overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
        <iframe
          ref={iframeRef}
          className="w-full"
          style={{ height: 200, border: 'none', display: 'block' }}
          sandbox="allow-scripts allow-same-origin"
          title={title || 'HTML Widget'}
        />
      </div>
    </div>
  )
}
