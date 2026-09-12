import { describe, expect, it } from 'vitest'

import { esFallo, etiqueta, mutationOutcome } from './mutation-outcome.mjs'

describe('veredicto de una ejecución contra una mutación', () => {
  it('los tests corrieron y alguno falló: la mutación está cazada', () => {
    expect(mutationOutcome({ status: 1 })).toBe('detectada')
  })

  it('los tests corrieron y pasaron todos: la mutación sobrevive', () => {
    expect(mutationOutcome({ status: 0 })).toBe('sobrevive')
  })

  it('no se pudo lanzar el proceso: no es una detección', () => {
    // `pnpm` fuera del PATH, o un `install` a medias. Antes daba `detectada`
    // porque `null !== 0`, y las 30 mutaciones salían verdes sin ejecutar
    // un solo test.
    expect(mutationOutcome({ status: null, error: new Error('spawn ENOENT') })).toBe('no-ejecutada')
  })

  it('saltó el timeout: no es una detección', () => {
    expect(mutationOutcome({ status: null })).toBe('no-ejecutada')
  })

  it('sólo la detección deja la CI en verde', () => {
    expect(esFallo('detectada')).toBe(false)
    expect(esFallo('sobrevive')).toBe(true)
    expect(esFallo('no-ejecutada')).toBe(true)
  })

  it('cada veredicto tiene etiqueta y todas miden lo mismo', () => {
    const todas = ['detectada', 'sobrevive', 'no-ejecutada'].map(etiqueta)
    expect(todas.every((e) => e !== undefined)).toBe(true)
    expect(new Set(todas.map((e) => e.length)).size).toBe(1)
  })
})
