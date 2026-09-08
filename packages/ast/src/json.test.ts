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

  it('añade las claves que faltan sin tocar las existentes', () => {
    const result = patchJson(packageJson, [
      {
        pointer: '/scripts',
        value: { dev: 'NO DEBE PISAR', lint: 'eslint .' },
        strategy: 'merge',
      },
    ])

    expect(result.changed).toBe(true)
    expect(getJsonValue(result.text, '/scripts/dev')).toBe('vite')
    expect(getJsonValue(result.text, '/scripts/lint')).toBe('eslint .')
  })

  it('es idempotente: la segunda pasada no cambia nada', () => {
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

  it('preserva los comentarios de un tsconfig con JSONC', () => {
    const tsconfig = `{
  // No permitimos any en ningún caso.
  "compilerOptions": {
    "strict": true
  }
}
`
    const result = patchJson(tsconfig, [
      { pointer: '/compilerOptions', value: { noImplicitAny: true }, strategy: 'merge' },
    ])

    expect(result.text).toContain('No permitimos any en ningún caso')
    expect(getJsonValue(result.text, '/compilerOptions/noImplicitAny')).toBe(true)
  })

  it('respeta la indentación original del fichero', () => {
    const cuatroEspacios = `{\n    "name": "demo"\n}\n`
    expect(detectIndent(cuatroEspacios)).toBe(4)

    const result = patchJson(cuatroEspacios, [
      { pointer: '/version', value: '1.0.0', strategy: 'set' },
    ])
    expect(result.text).toContain('\n    "version"')
  })

  it('crea rutas intermedias que no existen', () => {
    const result = patchJson('{}\n', [
      { pointer: '/a/b/c', value: 42, strategy: 'set' },
    ])
    expect(getJsonValue(result.text, '/a/b/c')).toBe(42)
  })

  it('appendUnique no duplica elementos ya presentes', () => {
    const source = `{ "files": ["dist"] }`
    const patch = { pointer: '/files', value: ['dist', 'README.md'], strategy: 'appendUnique' as const }

    const first = patchJson(source, [patch])
    const second = patchJson(first.text, [patch])

    expect(getJsonValue(first.text, '/files')).toEqual(['dist', 'README.md'])
    expect(second.changed).toBe(false)
  })

  it('falla con un mensaje claro si el JSON está roto', () => {
    expect(() => patchJson('{ roto', [{ pointer: '/a', value: 1, strategy: 'set' }], 'x.json'))
      .toThrow(/No se pudo parsear "x.json"/)
  })
})
