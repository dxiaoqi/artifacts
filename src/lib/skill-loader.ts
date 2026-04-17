/**
 * Skill Loader — 从文件系统加载 Skill Pack 文件
 * 永远加载的核心文件 + 按需加载的具体文件
 */

import fs from 'fs'
import path from 'path'

const SKILL_ROOT = path.join(process.cwd(), 'skill-pack')

function readSkillFile(relativePath: string): string {
  try {
    return fs.readFileSync(path.join(SKILL_ROOT, relativePath), 'utf-8')
  } catch {
    return `[skill file not found: ${relativePath}]`
  }
}

/**
 * 永远加载的核心 skill 文件
 * SKILL.md + protocol.md + rules.md + widgets/_index.md + recipes/_index.md
 */
export function loadCoreSkills(): string {
  const skill = readSkillFile('SKILL.md')
  const rules = readSkillFile('rules.md')
  const protocol = readSkillFile('protocol.md')
  const widgetIndex = readSkillFile('widgets/_index.md')
  const recipeIndex = readSkillFile('recipes/_index.md')

  return [
    '# Skill Pack\n',
    skill,
    '\n---\n',
    rules,
    '\n---\n',
    protocol,
    '\n---\n',
    widgetIndex,
    '\n---\n',
    recipeIndex,
  ].join('\n')
}

/**
 * 根据意图和 recipe 按需加载额外 skill 文件
 */
export function loadExtraSkills(opts: {
  recipeId?: string | null
  widgetTypes?: string[]
  needsTheme?: boolean
}): string {
  const parts: string[] = []

  // Recipe 文件
  if (opts.recipeId) {
    const recipeFile = `recipes/${opts.recipeId}.md`
    parts.push(`\n---\n## Recipe: ${opts.recipeId}\n` + readSkillFile(recipeFile))
  }

  // Widget 规范文件
  const widgetTypes = new Set(opts.widgetTypes ?? [])
  for (const type of ['svg', 'html', 'chart']) {
    if (widgetTypes.has(type)) {
      parts.push(`\n---\n## Widget Spec: ${type}\n` + readSkillFile(`widgets/${type}.md`))
    }
  }

  // 主题
  if (opts.needsTheme) {
    parts.push('\n---\n## Design Theme\n' + readSkillFile('design/theme.md'))
  }

  return parts.join('\n')
}

/**
 * 构建 Executor 调用的 system prompt
 */
export function buildSystemPrompt(opts: {
  recipeId?: string | null
  widgetTypes?: string[]
  needsTheme?: boolean
}): string {
  const core = loadCoreSkills()
  const extra = loadExtraSkills(opts)
  return core + (extra ? '\n' + extra : '')
}
