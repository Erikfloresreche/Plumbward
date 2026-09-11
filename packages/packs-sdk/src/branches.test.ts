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
    for (const name of ['feat/login', 'fix/f0-protected-branches', 'chore/setup-ai-governance', 'Feature/X', 'hotfix/urgent', 'dependabot/npm/x']) {
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
    expect(requiresIsolation(head('FEAT/X'), profileWith({ release: 'feat/x' }))).toBe(true)
  })
})

describe('ramas en las que la CI se ejecuta al hacer push', () => {
  it('reúne las del perfil, la rama por defecto y las existentes con nombre habitual', () => {
    const branches = ciPushBranches(
      profileWith({ integration: 'main', release: 'Prod' }),
      'main',
      ['main', 'Prod', 'develop', 'feat/x', 'live'],
    )
    expect(branches).toEqual(['main', 'Prod', 'develop'])
  })

  it('no duplica la misma rama escrita con otras mayúsculas', () => {
    expect(ciPushBranches(profileWith({ release: 'prod' }), null, ['Prod'])).toEqual(['prod'])
  })

  it('una rama de despliegue sin nombre habitual entra si está configurada', () => {
    expect(ciPushBranches(profileWith({ release: 'live' }), null, ['live'])).toEqual(['live'])
  })

  it('sin nada que añadir devuelve una lista vacía, y la CI sólo revisa PRs', () => {
    expect(ciPushBranches(profileWith(), null, ['feat/x'])).toEqual([])
  })
})
