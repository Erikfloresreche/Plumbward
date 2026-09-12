import { describe, expect, it } from 'vitest'
import { branchReturnNotice } from '../src/branch-notice.js'

/**
 * Punto 2 de F0-24, la decisión sola. Los dos casos de punta a punta —fallo de
 * `apply` con EACCES y `rollback`— están en `branch-notice.e2e.test.ts`; aquí
 * van las combinaciones que no se pueden provocar sin montar un HEAD
 * desacoplado, y el caso en que **no hay que decir nada**, que es el que se
 * rompe al escribir el aviso sin condición.
 */

const ISOLATED = 'chore/setup-ai-governance'

function notice(currentBranch: string | null, startedOnBranch: string | null): string {
  return branchReturnNotice({ currentBranch, startedOnBranch, isolatedBranch: ISOLATED }).join('\n')
}

describe('branchReturnNotice', () => {
  it('calla cuando el repositorio ha quedado donde estaba', () => {
    expect(branchReturnNotice({
      currentBranch: 'Prod',
      startedOnBranch: 'Prod',
      isolatedBranch: ISOLATED,
    })).toEqual([])
  })

  it('calla también con HEAD desacoplado si ya se empezó así', () => {
    expect(branchReturnNotice({
      currentBranch: null,
      startedOnBranch: null,
      isolatedBranch: ISOLATED,
    })).toEqual([])
  })

  it('dice dónde estás, cómo volver y que la rama aislada sobra', () => {
    const text = notice(ISOLATED, 'Prod')

    expect(text).toContain(`Sigues en la rama "${ISOLATED}"`)
    expect(text).toContain('git checkout Prod')
    expect(text).toContain(`git branch -d ${ISOLATED}`)
  })

  it('no propone borrar una rama que no es la aislada', () => {
    const text = notice('otra-rama', 'Prod')

    expect(text).toContain('git checkout Prod')
    expect(text).not.toContain('git branch -d')
  })

  it('avisa de que HEAD ha quedado desacoplado', () => {
    const text = notice(null, 'Prod')

    expect(text).toContain('desacoplado')
    expect(text).toContain('git checkout Prod')
  })

  it('no inventa una rama de vuelta si se empezó con HEAD desacoplado', () => {
    const text = notice(ISOLATED, null)

    expect(text).toContain(`Sigues en la rama "${ISOLATED}"`)
    expect(text).toContain('git checkout <commit>')
    expect(text).not.toMatch(/git checkout (?!<commit>)/)
  })
})
