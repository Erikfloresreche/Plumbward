import { describe, expect, it } from 'vitest'
import { recommendedProfile } from '@governance/packs-sdk'
import type { Profile } from '@governance/packs-sdk'
import type { RepoScan } from '@governance/scanner'
import { aiRules, copilotInstructions } from './ai-rules.js'

/**
 * Escaneo mínimo pero completo: construirlo a mano en lugar de escanear un
 * repositorio real mantiene la prueba rápida y determinista.
 */
const scan: RepoScan = {
  repoRoot: '/tmp/proyecto',
  git: {
    isRepo: true,
    branch: 'main',
    isDirty: false,
    rootCommit: 'abc123',
    remoteUrl: null,
    fingerprint: 'abc123',
  },
  sloc: {
    total: 1200,
    filesScanned: 30,
    byLanguage: [{ language: 'TypeScript', files: 30, sloc: 1200 }],
    sizeClass: 'small',
    mode: 'greenfield',
  },
  stacks: [
    {
      id: 'node-ts',
      name: 'Node.js / TypeScript',
      confidence: 0.9,
      evidence: ['package.json'],
      packageManager: 'pnpm',
      frameworks: [],
      typescript: true,
    },
  ],
  primaryStack: {
    id: 'node-ts',
    name: 'Node.js / TypeScript',
    confidence: 0.9,
    evidence: ['package.json'],
    packageManager: 'pnpm',
    frameworks: [],
    typescript: true,
  },
  maturity: { score: 0, signals: [], missing: [] },
  isMonorepo: false,
  files: ['package.json'],
}

const base: Profile = recommendedProfile(scan)

function withBoundaries(overrides: Partial<Profile['agentBoundaries']>): Profile {
  return { ...base, agentBoundaries: { ...base.agentBoundaries, ...overrides } }
}

describe('límites operativos en las reglas de IA generadas', () => {
  it('por defecto prohíbe git y base de datos, y pide los commits en inglés', () => {
    const rules = aiRules(scan, base)

    expect(rules).toContain('Comandos de git que modifican el estado')
    expect(rules).toContain('Comandos de base de datos que escriben')
    expect(rules).toContain('se redactan siempre en inglés')
  })

  it('permite explícitamente los comandos de sólo lectura', () => {
    const rules = aiRules(scan, base)

    // Si esto desaparece, el asistente deja de poder leer el estado del repo y
    // la regla se vuelve inutilizable en la práctica.
    expect(rules).toContain('Sí puedes usar los de sólo lectura')
    expect(rules).toContain('Sí puedes hacer `SELECT` de inspección')
  })

  it('respeta la desactivación de cada límite por separado', () => {
    const sinGit = aiRules(scan, withBoundaries({ git: false }))
    expect(sinGit).not.toContain('Comandos de git que modifican el estado')
    expect(sinGit).toContain('Comandos de base de datos que escriben')

    const sinNada = aiRules(scan, withBoundaries({ git: false, database: false }))
    expect(sinNada).not.toContain('Comandos de base de datos que escriben')
  })

  it('mantiene la numeración de secciones aunque se desactive todo', () => {
    const sinNada = aiRules(scan, withBoundaries({ git: false, database: false }))

    // La regla del idioma de los commits siempre aplica, así que la sección 7
    // nunca desaparece y la 8 nunca queda huérfana.
    expect(sinNada).toContain('## 7. Lo que NO debes ejecutar')
    expect(sinNada).toContain('## 8. Lo que NUNCA debes hacer')
  })

  it('traduce el idioma de los commits cuando el perfil lo cambia', () => {
    const enEspanol = aiRules(scan, withBoundaries({ commitLanguage: 'es' }))
    expect(enEspanol).toContain('se redactan siempre en español')
  })

  it('lleva los mismos límites a las instrucciones de Copilot', () => {
    const copilot = copilotInstructions(scan, base)

    expect(copilot).toContain('No ejecutes comandos git que modifiquen el estado')
    expect(copilot).toContain('No ejecutes migraciones')
    expect(copilot).toContain('en inglés')
  })
})
