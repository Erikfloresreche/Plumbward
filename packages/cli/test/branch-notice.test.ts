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

const STARTED_COMMIT = '9f1c0d3a8b7e6f5d4c3b2a1908f7e6d5c4b3a219'

function notice(currentBranch: string | null, startedOnBranch: string | null): string {
  return branchReturnNotice({
    currentBranch,
    startedOnBranch,
    startedOnCommit: STARTED_COMMIT,
    isolatedBranch: ISOLATED,
    pendingRollback: false,
  }).join('\n')
}

/** El caso en que `apply` falló y **no** pudo revertir: queda trabajo a medias. */
function noticePending(currentBranch: string | null, startedOnBranch: string | null): string {
  return branchReturnNotice({
    currentBranch,
    startedOnBranch,
    startedOnCommit: STARTED_COMMIT,
    isolatedBranch: ISOLATED,
    pendingRollback: true,
  }).join('\n')
}

describe('branchReturnNotice', () => {
  it('calla cuando el repositorio ha quedado donde estaba', () => {
    expect(notice('Prod', 'Prod')).toBe('')
  })

  it('calla también con HEAD desacoplado si ya se empezó así', () => {
    expect(notice(null, null)).toBe('')
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
    // El único `git checkout` de vuelta es al commit anotado (F0-30): no hay
    // rama que nombrar, y antes aquí había un `<commit>` sin rellenar.
    expect(text).toContain(`git checkout ${STARTED_COMMIT}`)
    expect(text).not.toMatch(new RegExp(`git checkout (?!${STARTED_COMMIT})`))
  })
})

/**
 * Hallazgo bloqueante de la revisión de la PR #11. Cuando `apply` falla y la
 * reversión automática **también** falla, el árbol tiene ficheros a medias y el
 * journal sigue vivo. El aviso de antes proponía las dos cosas que cierran la
 * única salida:
 *
 *  - `git checkout <rama de partida>` arrastra los ficheros a medias a la otra
 *    rama: la misma contaminación que arregla el punto 1 de F0-24.
 *  - `git branch -d <rama aislada>` funciona, porque `apply` nunca commitea. Y
 *    sin esa rama `assertSameBranch` no se puede satisfacer jamás: el rollback
 *    que la línea anterior pedía queda imposible para siempre.
 */
describe('branchReturnNotice con un rollback pendiente', () => {
  it('no propone volver ni borrar: primero revertir, después volver', () => {
    const text = noticePending(ISOLATED, 'Prod')

    expect(text).toContain(`Sigues en la rama "${ISOLATED}"`)
    expect(text).toContain('plumbward rollback')
    expect(text).not.toContain('git branch -d')
    // El `git checkout` sólo puede aparecer detrás del rollback, nunca antes.
    expect(text.indexOf('plumbward rollback')).toBeLessThan(text.indexOf('git checkout Prod'))
  })

  it('avisa de que borrar la rama aislada deja el rollback imposible', () => {
    expect(noticePending(ISOLATED, 'Prod')).toMatch(/No borres[\s\S]*rollback/)
  })

  it('no llama "sin cambios" a un árbol con ficheros a medias', () => {
    expect(noticePending(ISOLATED, 'Prod')).not.toContain('sin cambios')
  })

  it('calla igualmente si la rama no cambió: no hay nada de ramas que decir', () => {
    expect(noticePending('Prod', 'Prod')).toBe('')
  })
})

/**
 * F0-30, punto 3: sin el commit anotado el consejo era `git checkout <commit>`,
 * un hueco que quien lo lee ya no puede rellenar: HEAD está en la rama aislada
 * desde que `apply` la creó, y el commit de partida no se ve por ninguna parte.
 */
describe('branchReturnNotice cuando se empezó con HEAD desacoplado', () => {
  it('nombra el commit de partida en lugar de un hueco', () => {
    const text = notice(ISOLATED, null)

    expect(text).toContain(`git checkout ${STARTED_COMMIT}`)
    expect(text).not.toContain('<commit>')
  })

  it('también con un rollback pendiente, detrás del rollback', () => {
    const text = noticePending(ISOLATED, null)

    expect(text).toContain(`git checkout ${STARTED_COMMIT}`)
    expect(text.indexOf('plumbward rollback')).toBeLessThan(
      text.indexOf(`git checkout ${STARTED_COMMIT}`),
    )
  })

  it('sin ningún commit en el repositorio no inventa uno al que volver', () => {
    const text = branchReturnNotice({
      currentBranch: ISOLATED,
      startedOnBranch: null,
      startedOnCommit: null,
      isolatedBranch: ISOLATED,
      pendingRollback: false,
    }).join('\n')

    expect(text).not.toContain('<commit>')
    expect(text).toContain('no tenía ningún commit')
  })
})
