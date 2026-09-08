import { describe, expect, it } from 'vitest'
import { ensureBlock, readBlock, managedHeader, parseManagedHeader } from './blocks.js'

describe('ensureBlock', () => {
  const gitignore = 'node_modules/\ndist/\n'

  it('añade el bloque al final sin tocar lo anterior', () => {
    const result = ensureBlock(gitignore, 'governance', '.governance/journal.json', 'hash')

    expect(result.changed).toBe(true)
    expect(result.replaced).toBe(false)
    expect(result.text.startsWith(gitignore)).toBe(true)
    expect(readBlock(result.text, 'governance', 'hash')).toContain('.governance/journal.json')
  })

  it('es idempotente', () => {
    const first = ensureBlock(gitignore, 'governance', 'contenido', 'hash')
    const second = ensureBlock(first.text, 'governance', 'contenido', 'hash')

    expect(second.changed).toBe(false)
    expect(second.text).toBe(first.text)
  })

  it('actualiza el contenido del bloque sin duplicarlo', () => {
    const first = ensureBlock(gitignore, 'governance', 'version-1', 'hash')
    const second = ensureBlock(first.text, 'governance', 'version-2', 'hash')

    expect(second.replaced).toBe(true)
    expect(second.text).toContain('version-2')
    expect(second.text).not.toContain('version-1')
    expect(second.text.match(/governance:begin/g)).toHaveLength(1)
  })

  it('conserva intacto lo que el cliente escriba fuera de los marcadores', () => {
    const first = ensureBlock(gitignore, 'governance', 'a', 'hash')
    const editado = `${first.text}\n# regla propia del equipo\n*.local\n`
    const second = ensureBlock(editado, 'governance', 'b', 'hash')

    expect(second.text).toContain('# regla propia del equipo')
    expect(second.text).toContain('*.local')
    expect(second.text).toContain('node_modules/')
  })
})

describe('cabecera gestionada', () => {
  it('se puede leer de vuelta', () => {
    const header = managedHeader('hash', '1.2.3', 'abc123def456')
    expect(parseManagedHeader(header)).toEqual({ version: '1.2.3', hash: 'abc123def456' })
  })

  it('devuelve undefined en un fichero sin cabecera', () => {
    expect(parseManagedHeader('contenido normal')).toBeUndefined()
  })
})
