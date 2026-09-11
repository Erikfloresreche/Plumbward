import { describe, expect, it } from 'vitest'
import { isLongLivedBranch, longLivedBranches } from './branches.js'

/** Perfil mínimo: sólo importa `branches`. */
function perfil(main: string, staging: string | null = null, dev: string | null = null) {
  return { branches: { main, staging, dev } }
}

describe('ramas de larga duración', () => {
  it('protege la rama de releases aunque no se llame main', () => {
    // El caso que destapó el fallo: la rama de este mismo repositorio.
    expect(isLongLivedBranch('Prod', perfil('Prod'), 'Prod')).toBe(true)
  })

  it('no distingue mayúsculas', () => {
    for (const rama of ['Prod', 'PROD', 'prod', 'Main', 'MASTER']) {
      expect(isLongLivedBranch(rama, perfil('main'), null), rama).toBe(true)
    }
  })

  it('reconoce convenciones que no son main ni master', () => {
    for (const rama of ['trunk', 'produccion', 'desarrollo', 'staging', 'release']) {
      expect(isLongLivedBranch(rama, perfil('main'), null), rama).toBe(true)
    }
  })

  it('respeta las ramas configuradas en el perfil aunque sean inusuales', () => {
    expect(isLongLivedBranch('pre', perfil('Prod', 'pre', 'integracion'), null)).toBe(true)
    expect(isLongLivedBranch('integracion', perfil('Prod', 'pre', 'integracion'), null)).toBe(true)
  })

  it('una rama por defecto desfasada no le quita protección a la real', () => {
    // Situación real de este repositorio: origin/HEAD sigue apuntando a `main`
    // tras renombrarla a `Prod` en GitHub. La unión hace que el dato erróneo
    // sólo añada protección.
    const protegidas = longLivedBranches(perfil('Prod'), 'main')
    expect(protegidas.has('prod')).toBe(true)
    expect(protegidas.has('main')).toBe(true)
  })

  it('funciona sin rama por defecto detectada (repositorio sin remoto)', () => {
    expect(isLongLivedBranch('Prod', perfil('Prod'), null)).toBe(true)
  })

  it('no protege las ramas de trabajo', () => {
    for (const rama of ['fix/f0-protected-branches', 'feature/login', 'productivity', 'devtools']) {
      expect(isLongLivedBranch(rama, perfil('Prod'), 'Prod'), rama).toBe(false)
    }
  })
})
