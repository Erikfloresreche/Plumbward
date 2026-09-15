import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { CommentStyle } from '@plumbward/ast'

/**
 * Resolves a relative path inside the repository, preventing it from escaping.
 *
 * It is a real security boundary, not a defensive one: packs are extensible and
 * may come from third parties in the future. None of them must be able to
 * write to `~/.ssh/authorized_keys` through a path with `../`.
 */
export function resolveInRepo(repoRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Absolute path not allowed in an operation: "${relativePath}".`)
  }
  const root = resolve(repoRoot)
  const target = resolve(root, relativePath)
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`The path "${relativePath}" escapes the repository root.`)
  }
  return target
}

export async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath)
    return true
  } catch {
    return false
  }
}

/** Reads a file, or returns `undefined` if it does not exist. */
export async function readFileIfExists(absolutePath: string): Promise<string | undefined> {
  try {
    return await readFile(absolutePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Writes, creating the missing intermediate directories. */
export async function writeFileEnsuringDir(
  absolutePath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, 'utf8')
}

export async function removeFile(absolutePath: string): Promise<void> {
  await rm(absolutePath, { force: true })
}

/**
 * Comment style suited to a file, from its extension or name.
 *
 * Returns `undefined` when the format does not take comments safely (strict
 * JSON such as `package.json`, which other tools rewrite).
 */
export function commentStyleForPath(filePath: string): CommentStyle | undefined {
  const name = filePath.split('/').pop() ?? filePath

  if (name === 'Makefile' || name.startsWith('Dockerfile')) return 'hash'
  if (name === '.gitignore' || name === '.dockerignore' || name === '.editorconfig') return 'hash'
  if (name.startsWith('.env')) return 'hash'

  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
  switch (extension) {
    case '.yml':
    case '.yaml':
    case '.sh':
    case '.bash':
    case '.toml':
    case '.py':
    case '.rb':
    case '.conf':
      return 'hash'
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
    case '.go':
    case '.java':
    case '.php':
    case '.css':
      return 'slash'
    case '.md':
    case '.html':
    case '.xml':
      return 'html'
    case '.json':
      // Strict JSON: no header is injected, so as not to break other tools.
      return undefined
    default:
      return undefined
  }
}
