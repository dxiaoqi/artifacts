/**
 * detect-visual.ts
 * Determines the sub-type of a visual block from its code content.
 * This is a deterministic check — it does not depend on the AI's type declaration.
 * If the AI declares type="svg" but code is actually Three.js, the code wins.
 */

export type VisualType = 'svg' | 'html' | 'threejs'

export function detectVisualType(code: string, declaredType?: string): VisualType {
  const c = code.trim()

  // Three.js signals (regardless of declared type)
  if (
    c.includes('THREE.') ||
    c.includes('WebGLRenderer') ||
    c.includes('BufferGeometry') ||
    c.includes('new THREE')
  ) return 'threejs'

  // SVG: starts with <svg tag
  if (c.startsWith('<svg') || c.match(/^<!--[\s\S]*?-->\s*<svg/)) return 'svg'

  // Use declared type as hint for html vs svg disambiguation
  if (declaredType === 'svg') return 'svg'
  if (declaredType === 'threejs') return 'threejs'

  // Default: html
  return 'html'
}
