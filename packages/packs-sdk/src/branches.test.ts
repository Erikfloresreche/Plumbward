import { describe, expect, it } from 'vitest'
import { detectBranchRoles, isLongLivedBranch, longLivedBranches } from './branches.js'

/** Perfil mínimo: sólo importa `branches`. */
function profileWith(main: string, staging: string | null = null, dev: string | null = null) {
  return { branches: { main, staging, dev } }
}

/**
 * Nombres que NO están en la lista de respaldo. Las pruebas que los usan son las
 * que de verdad ejercitan cada fuente de la unión: con un nombre de la lista,
 * quitar una fuente no cambia nada y la prueba no detectaría el fallo.
 */
const UNKNOWN_RELEASE = 'live'
const UNKNOWN_WORK = 'fix/f0-protected-branches'

describe('ramas de larga duración', () => {
  it('protege una rama configurada en el perfil aunque no esté en ninguna lista', () => {
    expect(isLongLivedBranch(UNKNOWN_RELEASE, profileWith(UNKNOWN_RELEASE), null)).toBe(true)
  })

  it('protege la rama por defecto aunque el perfil no la mencione', () => {
    expect(isLongLivedBranch(UNKNOWN_RELEASE, profileWith('main'), UNKNOWN_RELEASE)).toBe(true)
  })

  it('protege staging y dev configurados en el perfil', () => {
    const profile = profileWith('Prod', 'pre', 'integracion')
    expect(isLongLivedBranch('pre', profile, null)).toBe(true)
    expect(isLongLivedBranch('integracion', profile, null)).toBe(true)
  })

  it('no distingue mayúsculas en ninguna de las fuentes', () => {
    expect(isLongLivedBranch('LIVE', profileWith('live'), null), 'perfil').toBe(true)
    expect(isLongLivedBranch('Live', profileWith('main'), 'LIVE'), 'rama por defecto').toBe(true)
    expect(isLongLivedBranch('PROD', profileWith('main'), null), 'lista de respaldo').toBe(true)
  })

  it('reconoce convenciones en español, con y sin tilde', () => {
    for (const name of ['produccion', 'producción', 'desarrollo']) {
      expect(isLongLivedBranch(name, profileWith('main'), null), name).toBe(true)
    }
  })

  it('una rama por defecto desfasada sólo añade protección, nunca la quita', () => {
    // Situación real de este repositorio: origin/HEAD apuntaba a `main` tras
    // renombrar la rama a `Prod`.
    const protectedNames = longLivedBranches(profileWith('Prod'), 'main')
    expect(protectedNames.has('prod')).toBe(true)
    expect(protectedNames.has('main')).toBe(true)
  })

  it('no protege las ramas de trabajo, ni por prefijo', () => {
    for (const name of [UNKNOWN_WORK, 'feature/login', 'productivity', 'devtools', 'maintenance']) {
      expect(isLongLivedBranch(name, profileWith('Prod'), 'Prod'), name).toBe(false)
    }
  })
})

describe('papel de cada rama', () => {
  it('en git-flow, la rama de releases es main y la de integración develop', () => {
    expect(detectBranchRoles(['develop', 'main'])).toEqual({ release: 'main', integration: 'develop' })
  })

  it('prefiere el nombre más específico: Prod antes que main', () => {
    expect(detectBranchRoles(['main', 'Prod']).release).toBe('Prod')
  })

  it('devuelve el nombre con las mayúsculas que tiene en el repositorio', () => {
    expect(detectBranchRoles(['PRODUCTION', 'Develop'])).toEqual({
      release: 'PRODUCTION',
      integration: 'Develop',
    })
  })

  it('no confunde una rama de trabajo con la de releases', () => {
    expect(detectBranchRoles(['feature/main-menu', 'productivity'])).toEqual({
      release: null,
      integration: null,
    })
  })

  it('sin ramas reconocibles no inventa ninguna', () => {
    expect(detectBranchRoles([])).toEqual({ release: null, integration: null })
  })
})
