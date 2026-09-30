import { describe, expect, it } from 'vitest'
import { patchJson, getJsonValue, detectIndent } from './json.js'

describe('patchJson', () => {
  const packageJson = `{
  "name": "demo",
  "scripts": {
    "dev": "vite"
  }
}
`

  it('adds the missing keys without touching the existing ones', () => {
    const result = patchJson(packageJson, [
      {
        pointer: '/scripts',
        value: { dev: 'MUST NOT OVERWRITE', lint: 'eslint .' },
        strategy: 'merge',
      },
    ])

    expect(result.changed).toBe(true)
    expect(getJsonValue(result.text, '/scripts/dev')).toBe('vite')
    expect(getJsonValue(result.text, '/scripts/lint')).toBe('eslint .')
  })

  it('is idempotent: the second pass changes nothing', () => {
    const patches = [
      { pointer: '/scripts', value: { lint: 'eslint .' }, strategy: 'merge' as const },
      { pointer: '/lint-staged', value: { '*.ts': ['eslint --fix'] }, strategy: 'merge' as const },
    ]

    const first = patchJson(packageJson, patches)
    const second = patchJson(first.text, patches)

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(second.text).toBe(first.text)
  })

  it('preserves the comments of a JSONC tsconfig', () => {
    const tsconfig = `{
  // We never allow any.
  "compilerOptions": {
    "strict": true
  }
}
`
    const result = patchJson(tsconfig, [
      { pointer: '/compilerOptions', value: { noImplicitAny: true }, strategy: 'merge' },
    ])

    expect(result.text).toContain('We never allow any')
    expect(getJsonValue(result.text, '/compilerOptions/noImplicitAny')).toBe(true)
  })

  it('keeps the original indentation of the file', () => {
    const fourSpaces = `{\n    "name": "demo"\n}\n`
    expect(detectIndent(fourSpaces)).toBe(4)

    const result = patchJson(fourSpaces, [
      { pointer: '/version', value: '1.0.0', strategy: 'set' },
    ])
    expect(result.text).toContain('\n    "version"')
  })

  it('creates intermediate paths that do not exist', () => {
    const result = patchJson('{}\n', [
      { pointer: '/a/b/c', value: 42, strategy: 'set' },
    ])
    expect(getJsonValue(result.text, '/a/b/c')).toBe(42)
  })

  it('appendUnique does not duplicate elements already present', () => {
    const source = `{ "files": ["dist"] }`
    const patch = { pointer: '/files', value: ['dist', 'README.md'], strategy: 'appendUnique' as const }

    const first = patchJson(source, [patch])
    const second = patchJson(first.text, [patch])

    expect(getJsonValue(first.text, '/files')).toEqual(['dist', 'README.md'])
    expect(second.changed).toBe(false)
  })

  it('fails with a clear message if the JSON is broken', () => {
    expect(() => patchJson('{ broken', [{ pointer: '/a', value: 1, strategy: 'set' }], 'x.json'))
      .toThrow(/Could not parse "x.json"/)
  })
})
