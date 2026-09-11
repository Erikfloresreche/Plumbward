import { describe, expect, it } from 'vitest'
import { ciPushBranches, isWorkBranch, requiresIsolation } from './branches.js'

/** Perfil mínimo: sólo importa `branches`. */
function profileWith(
  branches: { integration?: string | null; release?: string | null; staging?: string | null } = {},
) {
  return { branches: { integration: null, release: null, staging: null, ...branches } }
}

function head(branch: string | null, options: { detached?: boolean; defaultBranch?: string | null } = {}) {
  return { branch, detachedHead: options.detached ?? false, defaultBranch: options.defaultBranch ?? null }
}

describe('ramas de trabajo', () => {
  it('reconoce los prefijos habituales, sin distinguir mayúsculas', () => {
    for (const name of ['feat/login', 'fix/f0-protected-branches', 'chore/setup-ai-governance', 'Feature/X', 'hotfix/urgent', 'dependabot/npm/x', 'claude/add-lint', 'copilot/fix-1', 'codex/task', 'cursor/x']) {
      expect(isWorkBranch(name), name).toBe(true)
    }
  })

  it('no confunde con trabajo ramas de larga duración ni nombres sin prefijo', () => {
    for (const name of ['Prod', 'pro', 'pre', 'live', 'main', 'release/prod', 'env/production', 'featured', 'feat', 'feat/', '/fix']) {
      expect(isWorkBranch(name), name).toBe(false)
    }
  })
})

describe('¿hay que aislar el trabajo?', () => {
  it('sí, en cualquier rama que no sea claramente de trabajo, esté o no en una lista', () => {
    for (const name of ['Prod', 'pro', 'pre', 'live', 'staging', 'release/prod', 'user-patch-1']) {
      expect(requiresIsolation(head(name), profileWith()), name).toBe(true)
    }
  })

  it('no, en una rama de trabajo', () => {
    expect(requiresIsolation(head('feat/login'), profileWith())).toBe(false)
  })

  it('sí, con HEAD desacoplado', () => {
    expect(requiresIsolation(head(null, { detached: true }), profileWith())).toBe(true)
  })

  it('sí, si el equipo configuró como larga duración una rama con aspecto de trabajo', () => {
    // Improbable, pero la configuración explícita manda sobre la convención.
    const profile = profileWith({ integration: 'feat/integration' })
    expect(requiresIsolation(head('feat/integration'), profile)).toBe(true)
  })

  it('sí, si la rama con aspecto de trabajo es la rama por defecto del remoto', () => {
    expect(requiresIsolation(head('feat/main', { defaultBranch: 'feat/main' }), profileWith())).toBe(true)
  })

  it('las ramas configuradas se comparan sin distinguir mayúsculas', () => {
    // El nombre configurado va en mayúsculas y la rama en minúsculas: así se
    // prueba que se normalizan las dos partes, no sólo la rama actual.
    expect(requiresIsolation(head('feat/x'), profileWith({ release: 'FEAT/X' }))).toBe(true)
  })
})

describe('ramas en las que la CI se ejecuta al hacer push', () => {
  it('salen sólo del perfil, en orden y sin duplicados de mayúsculas', () => {
    expect(ciPushBranches(profileWith({ integration: 'main', release: 'Prod', staging: 'pre' }))).toEqual([
      'main',
      'Prod',
      'pre',
    ])
    expect(ciPushBranches(profileWith({ integration: 'prod', release: 'Prod' }))).toEqual(['prod'])
  })

  it('sin ramas configuradas devuelve una lista vacía, y la CI sólo revisa PRs', () => {
    expect(ciPushBranches(profileWith())).toEqual([])
  })
})
