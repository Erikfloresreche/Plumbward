import { describe, expect, it } from 'vitest'
import { ensureBlock, readBlock, managedHeader, parseManagedHeader } from './blocks.js'

describe('ensureBlock', () => {
  const gitignore = 'node_modules/\ndist/\n'

  it('appends the block at the end without touching what came before', () => {
    const result = ensureBlock(gitignore, 'governance', '.governance/journal.json', 'hash')

    expect(result.changed).toBe(true)
    expect(result.replaced).toBe(false)
    expect(result.text.startsWith(gitignore)).toBe(true)
    expect(readBlock(result.text, 'governance', 'hash')).toContain('.governance/journal.json')
  })

  it('is idempotent', () => {
    const first = ensureBlock(gitignore, 'governance', 'content', 'hash')
    const second = ensureBlock(first.text, 'governance', 'content', 'hash')

    expect(second.changed).toBe(false)
    expect(second.text).toBe(first.text)
  })

  it('updates the content of the block without duplicating it', () => {
    const first = ensureBlock(gitignore, 'governance', 'version-1', 'hash')
    const second = ensureBlock(first.text, 'governance', 'version-2', 'hash')

    expect(second.replaced).toBe(true)
    expect(second.text).toContain('version-2')
    expect(second.text).not.toContain('version-1')
    expect(second.text.match(/plumbward:begin/g)).toHaveLength(1)
  })

  it('keeps intact whatever the client writes outside the markers', () => {
    const first = ensureBlock(gitignore, 'governance', 'a', 'hash')
    const edited = `${first.text}\n# the team's own rule\n*.local\n`
    const second = ensureBlock(edited, 'governance', 'b', 'hash')

    expect(second.text).toContain("# the team's own rule")
    expect(second.text).toContain('*.local')
    expect(second.text).toContain('node_modules/')
  })
})

describe('managed header', () => {
  it('can be read back', () => {
    const header = managedHeader('hash', '1.2.3', 'abc123def456')
    expect(parseManagedHeader(header)).toEqual({ version: '1.2.3', hash: 'abc123def456' })
  })

  it('returns undefined for a file without a header', () => {
    expect(parseManagedHeader('plain content')).toBeUndefined()
  })
})
