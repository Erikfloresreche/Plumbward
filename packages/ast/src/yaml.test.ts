import { describe, expect, it } from 'vitest'
import { patchYaml, getYamlValue } from './yaml.js'

describe('patchYaml', () => {
  const workflow = `# Main pipeline of the project.
name: CI
on:
  push:
    branches: [main]
jobs:
  test:
    # This comment must survive any patch.
    runs-on: ubuntu-latest
`

  it('preserves comments when patching', () => {
    const result = patchYaml(workflow, [
      { pointer: '/jobs/test/timeout-minutes', value: 15, strategy: 'set' },
    ])

    expect(result.changed).toBe(true)
    expect(result.text).toContain('# Main pipeline of the project.')
    expect(result.text).toContain('# This comment must survive')
    expect(getYamlValue(result.text, '/jobs/test/timeout-minutes')).toBe(15)
  })

  it('is idempotent', () => {
    const patches = [{ pointer: '/jobs/test/timeout-minutes', value: 15, strategy: 'set' as const }]
    const first = patchYaml(workflow, patches)
    const second = patchYaml(first.text, patches)

    expect(second.changed).toBe(false)
    expect(second.text).toBe(first.text)
  })

  it('does not overwrite a value the client had already defined', () => {
    const result = patchYaml(workflow, [
      { pointer: '/jobs/test/runs-on', value: 'windows-latest', strategy: 'set' },
    ])

    expect(result.changed).toBe(false)
    expect(getYamlValue(workflow, '/jobs/test/runs-on')).toBe('ubuntu-latest')
  })

  it('appends to a list without duplicating', () => {
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
