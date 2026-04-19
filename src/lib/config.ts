import fs from 'fs'
import path from 'path'

export interface ProjectConfig {
  version: string
  artifacts: { defaultEnabled: boolean }
  llm: { maxTokens: number; temperature: number; routingMaxTokens: number }
}

const DEFAULTS: ProjectConfig = {
  version: '1',
  artifacts: { defaultEnabled: true },
  llm: { maxTokens: 16000, temperature: 0.7, routingMaxTokens: 80 },
}

function loadConfig(): ProjectConfig {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'project.config.json'), 'utf-8')
    const p = JSON.parse(raw)
    return {
      version: p.version ?? DEFAULTS.version,
      artifacts: { defaultEnabled: p.artifacts?.defaultEnabled ?? DEFAULTS.artifacts.defaultEnabled },
      llm: {
        maxTokens: p.llm?.maxTokens ?? DEFAULTS.llm.maxTokens,
        temperature: p.llm?.temperature ?? DEFAULTS.llm.temperature,
        routingMaxTokens: p.llm?.routingMaxTokens ?? DEFAULTS.llm.routingMaxTokens,
      },
    }
  } catch { return { ...DEFAULTS } }
}

export const projectConfig = loadConfig()
export const artifactsDefaultEnabled = projectConfig.artifacts.defaultEnabled
