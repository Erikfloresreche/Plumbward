import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { mutationInputs, uncoveredMutationInputs, workflowPaths } from './mutation-paths.mjs'

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
const script = read('./check-mutations.mjs')
const workflow = read('../.github/workflows/mutations.yml')

describe('ficheros que el script muta o ejecuta', () => {
  it('lee las constantes de fichero', () => {
    expect(mutationInputs(script)).toContain('packages/packs-sdk/src/branches.ts')
    expect(mutationInputs(script)).toContain('vitest.setup.ts')
  })

  it('lee el array TESTS', () => {
    expect(mutationInputs(script)).toContain('packages/cli/test/e2e.test.ts')
  })

  it('lee una ruta escrita como literal en la mutación, no como constante', () => {
    const inline = "const MUTATIONS = [\n  ['Algo', 'packages/nuevo/src/pieza.ts', 'a', 'b'],\n]"
    expect(mutationInputs(inline)).toContain('packages/nuevo/src/pieza.ts')
  })

  it('no confunde el texto de una mutación con un fichero', () => {
    const con = "const BR = 'packages/a/b.ts'\nconst MUTATIONS = [\n  ['Algo', BR, '  if (x) return true\\n', ''],\n]"
    expect(mutationInputs(con)).toEqual(['packages/a/b.ts'])
  })

  it('no repite un fichero que aparece como constante y como test', () => {
    const dup = "const BR = 'packages/a/b.ts'\nconst TESTS = [\n  'packages/a/b.ts',\n]"
    expect(mutationInputs(dup)).toEqual(['packages/a/b.ts'])
  })
})

describe('rutas del filtro paths del workflow', () => {
  it('lee todas las entradas del filtro real', () => {
    expect(workflowPaths(workflow)).toContain('packages/packs-sdk/src/branches.ts')
    expect(workflowPaths(workflow)).toContain('vitest.config.ts')
  })

  it('no se detiene en un comentario ni en una línea en blanco dentro de la lista', () => {
    const wf = "on:\n  pull_request:\n    paths:\n      - 'a.ts'\n\n      # comentario\n      - 'b.ts'\n  workflow_dispatch:\n"
    expect(workflowPaths(wf)).toEqual(['a.ts', 'b.ts'])
  })

  it('termina la lista al llegar a otra clave', () => {
    const wf = "    paths:\n      - 'a.ts'\n  workflow_dispatch:\n      - 'no.ts'\n"
    expect(workflowPaths(wf)).toEqual(['a.ts'])
  })

  it('devuelve una lista vacía si no hay filtro', () => {
    expect(workflowPaths('on:\n  pull_request:\n    branches: [develop]\n')).toEqual([])
  })
})

describe('cobertura del filtro', () => {
  it('el workflow real cubre todo lo que el script muta o ejecuta', () => {
    expect(uncoveredMutationInputs(script, workflow)).toEqual([])
  })

  it('delata una mutación nueva sobre un fichero que el filtro no nombra', () => {
    const conNueva = script.replace(
      "const VS = 'vitest.setup.ts'",
      "const VS = 'vitest.setup.ts'\nconst NW = 'packages/nuevo/src/pieza.ts'",
    )
    expect(conNueva).not.toBe(script)
    expect(uncoveredMutationInputs(conNueva, workflow)).toEqual(['packages/nuevo/src/pieza.ts'])
  })

  it('no acepta un patrón amplio en lugar de la ruta exacta', () => {
    const amplio = "on:\n  pull_request:\n    paths:\n      - 'packages/**'\n"
    expect(uncoveredMutationInputs(script, amplio).length).toBeGreaterThan(0)
  })
})
