import { describe, expect, it } from 'vitest'
import { parseYamlToJson } from '@plumbward/ast'
import type { Profile } from '@plumbward/packs-sdk'
import { profileToYaml } from './context.js'

/** Header of the `config.yml` written for the client (F0-45). */

const profile: Profile = {
  strictness: 'strict',
  mode: 'greenfield',
  branches: { integration: 'develop', release: null, staging: null },
  deployTarget: 'none',
  devcontainer: false,
  dockerCompose: false,
  aiAssistants: ['claude'],
  language: 'en',
  agentBoundaries: { git: true, database: true, commitLanguage: 'en' },
}

function header(yaml: string): string {
  return yaml
    .split('\n')
    .filter((line) => line.startsWith('#'))
    .join('\n')
}

describe('profileToYaml', () => {
  it('explains the fields in English by default, and says English is the default', () => {
    const text = header(profileToYaml(profile))
    expect(text).toContain('# Governance configuration of the repository')
    expect(text).toContain('"en" (the\n#                 default) or "es"')
    // Every Spanish letter this header used carries an accent; English needs none.
    expect(text).not.toMatch(/[^\x00-\x7F]/)
  })

  it('explains the fields in Spanish with language: es', () => {
    const text = header(profileToYaml({ ...profile, language: 'es' }))
    expect(text).toContain('Idioma de los textos y comentarios generados: "en" (por')
    expect(text).not.toContain('Governance configuration')
  })

  it('writes the same profile in either language', () => {
    for (const language of ['en', 'es'] as const) {
      const written = { ...profile, language }
      expect(parseYamlToJson(profileToYaml(written))).toEqual(written)
    }
  })
})
