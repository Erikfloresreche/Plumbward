import { describe, expect, it } from 'vitest'

import { isFailure, label, mutationOutcome } from './mutation-outcome.mjs'

describe('veredicto de una ejecución contra una mutación', () => {
  it('los tests corrieron y alguno falló: la mutación está cazada', () => {
    expect(mutationOutcome({ status: 1 })).toBe('detected')
  })

  it('los tests corrieron y pasaron todos: la mutación sobrevive', () => {
    expect(mutationOutcome({ status: 0 })).toBe('survived')
  })

  it('no se pudo lanzar el proceso: no es una detección', () => {
    // `pnpm` fuera del PATH, o un `install` a medias. Antes daba `detected`
    // porque `null !== 0`, y las 30 mutaciones salían verdes sin ejecutar
    // un solo test.
    expect(mutationOutcome({ status: null, error: new Error('spawn ENOENT') })).toBe('not-run')
  })

  it('saltó el timeout: no es una detección', () => {
    expect(mutationOutcome({ status: null })).toBe('not-run')
  })

  it('sólo la detección deja la CI en verde', () => {
    expect(isFailure('detected')).toBe(false)
    expect(isFailure('survived')).toBe(true)
    expect(isFailure('not-run')).toBe(true)
  })

  it('cada veredicto tiene etiqueta y todas miden lo mismo', () => {
    const labels = ['detected', 'survived', 'not-run'].map(label)
    expect(labels.every((e) => e !== undefined)).toBe(true)
    expect(new Set(labels.map((e) => e.length)).size).toBe(1)
  })
})
