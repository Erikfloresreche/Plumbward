import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { commentStyleForPath, pathExists, readFileIfExists, resolveInRepo } from './fs.js'
import { fullHash, shortHash } from './hash.js'

/**
 * `resolveInRepo` is the boundary every write of `apply` and `rollback` goes
 * through: no operation may name a path outside the client's repository. Its
 * two refusals had no test of their own (F0-7).
 */
describe('resolveInRepo: the repository boundary', () => {
  const root = resolve('/repo')

  it('resolves a relative path inside the repository', () => {
    expect(resolveInRepo(root, 'src/index.ts')).toBe(join(root, 'src', 'index.ts'))
  })

  it('accepts the root itself', () => {
    expect(resolveInRepo(root, '.')).toBe(root)
  })

  it('accepts a `..` that comes back inside the repository', () => {
    expect(resolveInRepo(root, 'src/../README.md')).toBe(join(root, 'README.md'))
  })

  it('refuses an absolute path', () => {
    expect(() => resolveInRepo(root, '/etc/passwd')).toThrow(/Absolute path not allowed/)
  })

  it('refuses a path that escapes the root with `..`', () => {
    expect(() => resolveInRepo(root, '../outside.txt')).toThrow(/escapes the repository root/)
  })

  it('refuses an escape hidden after a valid segment', () => {
    expect(() => resolveInRepo(root, 'src/../../outside.txt')).toThrow(
      /escapes the repository root/,
    )
  })
})

describe('file helpers', () => {
  const created: string[] = []

  afterEach(async () => {
    await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'plumbward-fs-'))
    created.push(dir)
    return dir
  }

  it('pathExists tells an existing path from a missing one', async () => {
    const dir = await tempDir()
    expect(await pathExists(dir)).toBe(true)
    expect(await pathExists(join(dir, 'missing'))).toBe(false)
  })

  it('readFileIfExists returns undefined only for a missing file', async () => {
    const dir = await tempDir()
    expect(await readFileIfExists(join(dir, 'missing'))).toBeUndefined()
  })

  it('readFileIfExists rethrows any other error instead of reading it as missing', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'a-directory'))
    // Reading a directory fails with EISDIR: taking it as "missing" would let
    // `apply` create a file where there is something it cannot see.
    await expect(readFileIfExists(join(dir, 'a-directory'))).rejects.toThrow()
  })
})

describe('commentStyleForPath', () => {
  it.each([
    ['Makefile', 'hash'],
    ['Dockerfile.dev', 'hash'],
    ['.gitignore', 'hash'],
    ['.env.example', 'hash'],
    ['.github/workflows/ci.yml', 'hash'],
    ['pyproject.toml', 'hash'],
    ['src/index.ts', 'slash'],
    ['main.go', 'slash'],
    ['styles.css', 'slash'],
    ['README.md', 'html'],
    ['pom.xml', 'html'],
  ] as const)('%s takes %s comments', (path, style) => {
    expect(commentStyleForPath(path)).toBe(style)
  })

  it.each(['package.json', 'LICENSE', 'image.png'])(
    '%s gets no comment, so no managed header breaks it',
    (path) => {
      expect(commentStyleForPath(path)).toBeUndefined()
    },
  )
})

describe('hashes', () => {
  it('shortHash is the first 12 characters of fullHash', () => {
    const content = 'governed content\n'
    expect(fullHash(content)).toHaveLength(64)
    expect(shortHash(content)).toBe(fullHash(content).slice(0, 12))
  })
})
