/**
 * build-iframe-doc.ts
 * Constructs complete HTML documents injected into sandboxed iframes.
 * Each visual type gets a different base environment:
 *   svg     — SVG class system + CSS vars, body centered
 *   html    — CSS vars + basic reset, no position:fixed
 *   threejs — THREE r128 from CDN, black background, canvas full-screen
 */

// ---------------------------------------------------------------------------
// CSS variable extraction from the host page
// ---------------------------------------------------------------------------

export function extractHostCssVars(): string {
  if (typeof window === 'undefined') return ''
  const cs = getComputedStyle(document.documentElement)
  const vars = [
    '--bg-primary', '--bg-secondary', '--bg-tertiary',
    '--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled',
    '--accent', '--accent-hover', '--accent-bg',
    '--border-default', '--border-hover', '--border-strong',
    '--success', '--success-bg',
    '--warning', '--warning-bg',
    '--danger', '--danger-bg',
    '--info', '--info-bg',
    '--font-sans', '--font-serif', '--font-mono',
    '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl',
    '--duration-fast', '--duration-base', '--duration-moderate',
    '--ease-smooth', '--ease-out',
  ]
  return vars
    .map(v => { const val = cs.getPropertyValue(v).trim(); return val ? `${v}:${val}` : null })
    .filter(Boolean)
    .join(';')
}

// ---------------------------------------------------------------------------
// Communication bridge — injected into every iframe
// ---------------------------------------------------------------------------

const BRIDGE = `<script>
(function(){
  function sendPrompt(text) {
    parent.postMessage({ type: 'SEND_PROMPT', payload: String(text) }, '*')
  }
  function openLink(url) {
    parent.postMessage({ type: 'OPEN_LINK', payload: String(url) }, '*')
  }
  window.sendPrompt = sendPrompt
  window.openLink   = openLink

  window.onerror = function(msg, src, line, col, err) {
    parent.postMessage({ type: 'VISUAL_ERROR', payload: { msg: String(msg), line: line } }, '*')
    return true
  }

  // ResizeObserver must be set up after <body> exists.
  // When this script runs in <head>, document.body is null — defer to DOMContentLoaded.
  function setupResize() {
    var body = document.body
    var ro = new ResizeObserver(function() {
      // Use body.scrollHeight (actual content height), NOT documentElement.scrollHeight.
      // documentElement.scrollHeight is clamped to the iframe's viewport height, so once
      // the iframe grows tall, it never reports a smaller value even when content shrinks.
      parent.postMessage({ type: 'RESIZE', payload: body.scrollHeight }, '*')
    })
    ro.observe(body)
  }
  if (document.body) {
    setupResize()
  } else {
    window.addEventListener('DOMContentLoaded', setupResize)
  }

  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]')
    if (a) { e.preventDefault(); openLink(a.href) }
  })

  // Theme update from host
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'THEME_UPDATE') {
      var el = document.getElementById('__theme-vars')
      if (el) el.textContent = ':root{' + e.data.cssVars + '}'
    }
  })
})()
<\/script>`

// ---------------------------------------------------------------------------
// SVG class system — 9-color semantic palette + utility classes
// Exported so export-image.ts can apply the same styles in inline exports.
// ---------------------------------------------------------------------------

export const SVG_CLASS_SYSTEM = `
/* ── Text ── */
text.t   { font: 400 13px var(--font-sans, system-ui); fill: var(--text-primary, #3D3929); }
text.ts  { font: 400 11px var(--font-sans, system-ui); fill: var(--text-secondary, #83827D); }
text.th  { font: 500 13px var(--font-sans, system-ui); fill: var(--text-primary, #3D3929); }
text.sm  { font: 400 11px var(--font-sans, system-ui); fill: var(--text-secondary, #83827D); }

/* ── Shape utilities ── */
.box    { fill: var(--bg-secondary, #F0EEE6); stroke: var(--border-default, rgba(61,57,41,.1)); stroke-width: 0.5; }
.arr    { stroke: var(--text-secondary, #83827D); fill: none; stroke-width: 1.5; }
.leader { stroke: var(--text-tertiary, #B4B2A7); fill: none; stroke-width: 0.5; stroke-dasharray: 4 3; }
.node   { cursor: pointer; }
.node:hover > rect, .node:hover > circle { opacity: 0.82; }

/* ── Color system (light) ──
   Uses DESCENDANT selector (space, not >) so it matches at any nesting depth.
   fill-opacity:1 / stroke-opacity:1 override inline fill-opacity="0.15" presentation attrs.
   color: sets CSS currentColor so fill="currentColor" resolves to the right hue. */

/* Descendant rect/circle — applies regardless of how deeply the node is nested */
.c-purple { color: #534AB7; }
.c-purple rect, .c-purple circle { fill: #EEEDFE; stroke: #534AB7; stroke-width: 0.5; fill-opacity: 1; stroke-opacity: 1; }
.c-purple text.t, .c-purple text.th { fill: #3C3489; }
.c-purple text.ts { fill: #534AB7; }

.c-teal { color: #0F6E56; }
.c-teal rect, .c-teal circle { fill: #E1F5EE; stroke: #0F6E56; stroke-width: 0.5; fill-opacity: 1; stroke-opacity: 1; }
.c-teal text.t, .c-teal text.th { fill: #085041; }
.c-teal text.ts { fill: #0F6E56; }

.c-blue { color: #185FA5; }
.c-blue rect, .c-blue circle { fill: #E6F1FB; stroke: #185FA5; stroke-width: 0.5; fill-opacity: 1; stroke-opacity: 1; }
.c-blue text.t, .c-blue text.th { fill: #0C447C; }
.c-blue text.ts { fill: #185FA5; }

.c-coral { color: #993C1D; }
.c-coral rect, .c-coral circle { fill: #FAECE7; stroke: #993C1D; stroke-width: 0.5; fill-opacity: 1; stroke-opacity: 1; }
.c-coral text.t, .c-coral text.th { fill: #712B13; }
.c-coral text.ts { fill: #993C1D; }

.c-amber { color: #854F0B; }
.c-amber rect, .c-amber circle { fill: #FAEEDA; stroke: #854F0B; stroke-width: 0.5; fill-opacity: 1; stroke-opacity: 1; }
.c-amber text.t, .c-amber text.th { fill: #633806; }
.c-amber text.ts { fill: #854F0B; }

.c-gray { color: #5F5E5A; }
.c-gray rect, .c-gray circle { fill: #F1EFE8; stroke: #5F5E5A; stroke-width: 0.5; fill-opacity: 1; stroke-opacity: 1; }
.c-gray text.t, .c-gray text.th { fill: #444441; }
.c-gray text.ts { fill: #5F5E5A; }

.c-green { color: #3B6D11; }
.c-green rect, .c-green circle { fill: #EAF3DE; stroke: #3B6D11; stroke-width: 0.5; fill-opacity: 1; stroke-opacity: 1; }
.c-green text.t, .c-green text.th { fill: #27500A; }
.c-green text.ts { fill: #3B6D11; }

.c-red { color: #A32D2D; }
.c-red rect, .c-red circle { fill: #FCEBEB; stroke: #A32D2D; stroke-width: 0.5; fill-opacity: 1; stroke-opacity: 1; }
.c-red text.t, .c-red text.th { fill: #791F1F; }
.c-red text.ts { fill: #A32D2D; }

.c-pink { color: #993556; }
.c-pink rect, .c-pink circle { fill: #FBEAF0; stroke: #993556; stroke-width: 0.5; fill-opacity: 1; stroke-opacity: 1; }
.c-pink text.t, .c-pink text.th { fill: #72243E; }
.c-pink text.ts { fill: #993556; }

/* ── Dark-mode overrides ── */
@media (prefers-color-scheme: dark) {
  .c-purple { color: #AFA9EC; }
  .c-purple rect, .c-purple circle { fill: #3C3489; stroke: #AFA9EC; fill-opacity: 1; }
  .c-purple text.t, .c-purple text.th { fill: #CECBF6; }
  .c-teal { color: #5DCAA5; }
  .c-teal rect,   .c-teal circle   { fill: #085041; stroke: #5DCAA5; fill-opacity: 1; }
  .c-teal text.t, .c-teal text.th   { fill: #9FE1CB; }
  .c-blue { color: #85B7EB; }
  .c-blue rect,   .c-blue circle   { fill: #0C447C; stroke: #85B7EB; fill-opacity: 1; }
  .c-blue text.t, .c-blue text.th   { fill: #B5D4F4; }
  .c-coral { color: #F0997B; }
  .c-coral rect,  .c-coral circle  { fill: #712B13; stroke: #F0997B; fill-opacity: 1; }
  .c-coral text.t,.c-coral text.th { fill: #F5C4B3; }
  .c-amber { color: #EF9F27; }
  .c-amber rect,  .c-amber circle  { fill: #633806; stroke: #EF9F27; fill-opacity: 1; }
  .c-amber text.t,.c-amber text.th { fill: #FAC775; }
  .c-gray { color: #B4B2A9; }
  .c-gray rect,   .c-gray circle   { fill: #444441; stroke: #B4B2A9; fill-opacity: 1; }
  .c-gray text.t, .c-gray text.th  { fill: #D3D1C7; }
  .c-green { color: #97C459; }
  .c-green rect,  .c-green circle  { fill: #27500A; stroke: #97C459; fill-opacity: 1; }
  .c-green text.t,.c-green text.th { fill: #C0DD97; }
  .c-red { color: #F09595; }
  .c-red rect,    .c-red circle    { fill: #791F1F; stroke: #F09595; fill-opacity: 1; }
  .c-red text.t,  .c-red text.th   { fill: #F7C1C1; }
  .c-pink { color: #ED93B1; }
  .c-pink rect,   .c-pink circle   { fill: #72243E; stroke: #ED93B1; fill-opacity: 1; }
  .c-pink text.t, .c-pink text.th  { fill: #F4C0D1; }
}`

// Standard arrow marker included in every SVG iframe.
// Uses currentColor so the arrowhead inherits the stroke color of the parent line.
// Also injects a CSS override that replaces `context-stroke` (SVG 2.0, limited support)
// with currentColor for any model-defined markers.
const SVG_ARROW_DEFS = `<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M2 1L8 5L2 9" fill="none" stroke="currentColor"
          stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
</defs>`

// CSS injected into SVG iframes to handle common model SVG quirks
const SVG_COMPAT_CSS = `
/* Replace context-stroke (SVG 2.0, low browser support) with currentColor */
marker path { stroke: currentColor; }
/* Ensure inline stroke-width on lines/paths isn't reset to 0 by accident */
line, path, polyline { vector-effect: non-scaling-stroke; }
`

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------

export function buildSvgDoc(code: string, cssVars: string): string {
  // Inject arrow defs if not present
  const svgCode = code.includes('<defs>') ? code
    : code.replace(/^(<svg[^>]*>)/, `$1${SVG_ARROW_DEFS}`)

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style id="__theme-vars">:root{${cssVars}}</style>
<style>
${SVG_CLASS_SYSTEM}
${SVG_COMPAT_CSS}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
body { display: flex; justify-content: center; align-items: flex-start;
       /* overflow: visible so tall SVGs are not clipped before iframe resizes */ }
svg  { max-width: 100%; height: auto; display: block; }
</style>
${BRIDGE}
</head><body>${svgCode}</body></html>`
}

export function buildHtmlDoc(code: string, cssVars: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style id="__theme-vars">:root{${cssVars}}</style>
<style>
*, *::before, *::after { box-sizing: border-box; }
body {
  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
  color: var(--text-primary, #3D3929);
  background: transparent;
  margin: 0; padding: 0;
  line-height: 1.6;
}
button { cursor: pointer; font-family: inherit; }
input, select, textarea { font-family: inherit; }
/* Honour sendPrompt-style buttons */
[data-send-prompt] { cursor: pointer; }
</style>
${BRIDGE}
</head><body>${code}</body></html>`
}

export function buildThreejsDoc(code: string, cssVars: string): string {
  // Strip any import statements (THREE is provided as a global)
  const cleaned = code
    .replace(/^\s*import\s+\*\s+as\s+THREE\s+from\s+['"]three['"]\s*;?\s*$/gm, '')
    .replace(/^\s*import\s+\{[^}]+\}\s+from\s+['"]three['"]\s*;?\s*$/gm, '')
    .replace(/^\s*import\s+THREE\s+from\s+['"]three['"]\s*;?\s*$/gm, '')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style id="__theme-vars">:root{${cssVars}}</style>
<style>
*, *::before, *::after { box-sizing: border-box; }
body   { margin: 0; overflow: hidden; background: #000; }
canvas { display: block; width: 100vw; height: 100vh; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
${BRIDGE}
</head><body>
<script>
(function(){
${cleaned}
})()
<\/script>
</body></html>`
}
