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

  it('lee una constante con dígitos o guion bajo en el nombre', () => {
    // Las abreviaturas de dos letras están agotadas: la siguiente mutación
    // sobre un fichero ya usado se llamará `CX2` o `WF_2`. Si el nombre no se
    // reconoce, el fichero desaparece de la lista y el control da verde.
    expect(mutationInputs("const CX2 = 'packages/nuevo/a.ts'")).toEqual(['packages/nuevo/a.ts'])
    expect(mutationInputs("const WF_2 = 'packages/nuevo/b.ts'")).toEqual(['packages/nuevo/b.ts'])
    expect(mutationInputs("const Br = 'packages/nuevo/c.ts'")).toEqual(['packages/nuevo/c.ts'])
  })

  it('no toma por fichero una constante que no es una ruta', () => {
    expect(mutationInputs("const CMD = 'pnpm'")).toEqual([])
  })

  it('lee un fichero mutado que no es TypeScript', () => {
    // La lista de mutaciones no promete tocar sólo `.ts`: filtrar por extensión
    // conocida reabriría el mismo agujero para un `.yml` o un `.json`.
    expect(mutationInputs("const TP = 'packages/packs/node-ts/src/templates/ci.yml'")).toEqual([
      'packages/packs/node-ts/src/templates/ci.yml',
    ])
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
    const wf =
      "on:\n  pull_request:\n    paths:\n      - 'a.ts'\n  workflow_dispatch:\n      - 'no.ts'\n"
    expect(workflowPaths(wf)).toEqual(['a.ts'])
  })

  it('lee el filtro de pull_request, no el primer paths del fichero', () => {
    // Un disparador `push:` con su propia lista por delante secuestraba el
    // control: validaba esa lista y nunca miraba la que filtra las PRs.
    const wf =
      "on:\n  push:\n    paths:\n      - 'todo.ts'\n  pull_request:\n    paths:\n      - 'solo-uno.ts'\n"
    expect(workflowPaths(wf)).toEqual(['solo-uno.ts'])
  })

  it('no confunde paths-ignore con el filtro', () => {
    const wf = "on:\n  pull_request:\n    paths-ignore:\n      - 'docs/**'\n"
    expect(workflowPaths(wf)).toEqual([])
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
