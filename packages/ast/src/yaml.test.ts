import { describe, expect, it } from 'vitest'
import { patchYaml, getYamlValue } from './yaml.js'

describe('patchYaml', () => {
  const workflow = `# Pipeline principal del proyecto.
name: CI
on:
  push:
    branches: [main]
jobs:
  test:
    # Este comentario debe sobrevivir a cualquier parche.
    runs-on: ubuntu-latest
`

  it('preserva los comentarios al parchear', () => {
    const result = patchYaml(workflow, [
      { pointer: '/jobs/test/timeout-minutes', value: 15, strategy: 'set' },
    ])

    expect(result.changed).toBe(true)
    expect(result.text).toContain('# Pipeline principal del proyecto.')
    expect(result.text).toContain('# Este comentario debe sobrevivir')
    expect(getYamlValue(result.text, '/jobs/test/timeout-minutes')).toBe(15)
  })

  it('es idempotente', () => {
    const patches = [{ pointer: '/jobs/test/timeout-minutes', value: 15, strategy: 'set' as const }]
    const first = patchYaml(workflow, patches)
    const second = patchYaml(first.text, patches)

    expect(second.changed).toBe(false)
    expect(second.text).toBe(first.text)
  })

  it('no pisa un valor que el cliente ya había definido', () => {
    const result = patchYaml(workflow, [
      { pointer: '/jobs/test/runs-on', value: 'windows-latest', strategy: 'set' },
    ])

    expect(result.changed).toBe(false)
    expect(getYamlValue(workflow, '/jobs/test/runs-on')).toBe('ubuntu-latest')
  })

  it('añade a una lista sin duplicar', () => {
    const patch = {
      pointer: '/on/push/branches',
      value: ['main', 'develop'],
      strategy: 'appendUnique' as const,
    }
    const first = patchYaml(workflow, [patch])
    const second = patchYaml(first.text, [patch])

    expect(getYamlValue(first.text, '/on/push/branches')).toEqual(['main', 'develop'])
    expect(second.changed).toBe(false)
  })
})
