import { execa } from 'execa'
import { createHash } from 'node:crypto'
import type { GitState } from './types.js'

/** Ejecuta git devolviendo `undefined` si el comando falla (repo sin commits, etc.). */
async function git(repoRoot: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execa('git', [...args], { cwd: repoRoot, reject: true })
    return stdout.trim()
  } catch {
    return undefined
  }
}

/**
 * Normaliza una URL remota para que `git@github.com:org/repo.git` y
 * `https://github.com/org/repo` produzcan la misma huella.
 */
export function normaliseRemote(url: string): string {
  return url
    .trim()
    .replace(/^git\+/, '')
    .replace(/^ssh:\/\//, '')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/**
 * Rama por defecto del remoto `origin`, sin conectarse a la red.
 *
 * Devuelve `null` si no hay remoto, si `origin/HEAD` no está definido o si
 * apunta a una referencia que no existe. Ver la advertencia sobre desfases en
 * `GitState.defaultBranch`: este valor informa, pero no decide por sí solo.
 */
export async function readDefaultBranch(repoRoot: string): Promise<string | null> {
  const symbolic = await git(repoRoot, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])
  if (!symbolic?.startsWith('refs/remotes/origin/')) return null

  const exists = await git(repoRoot, ['rev-parse', '--verify', '--quiet', symbolic])
  if (exists === undefined) return null

  const name = symbolic.slice('refs/remotes/origin/'.length)
  return name.length > 0 ? name : null
}

export async function readGitState(repoRoot: string): Promise<GitState> {
  const insideRepo = await git(repoRoot, ['rev-parse', '--is-inside-work-tree'])
  if (insideRepo !== 'true') {
    return {
      isRepo: false,
      branch: null,
      defaultBranch: null,
      isDirty: false,
      rootCommit: null,
      remoteUrl: null,
      fingerprint: null,
    }
  }

  const [branch, status, rootCommits, remoteUrl, defaultBranch] = await Promise.all([
    git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(repoRoot, ['status', '--porcelain']),
    // Huella del repositorio: hash del primer commit (especificación, módulo 1).
    git(repoRoot, ['rev-list', '--max-parents=0', 'HEAD']),
    git(repoRoot, ['config', '--get', 'remote.origin.url']),
    readDefaultBranch(repoRoot),
  ])

  // Un repo puede tener varias raíces (historiales fusionados): se toma la última,
  // que es la más antigua en el orden de `rev-list`.
  const rootCommit = rootCommits ? (rootCommits.split('\n').at(-1)?.trim() ?? null) : null

  const fingerprintSource = rootCommit ?? (remoteUrl ? normaliseRemote(remoteUrl) : null)
  const fingerprint = fingerprintSource
    ? createHash('sha256').update(fingerprintSource).digest('hex').slice(0, 32)
    : null

  return {
    isRepo: true,
    branch: branch ?? null,
    defaultBranch,
    isDirty: status !== undefined && status.length > 0,
    rootCommit,
    remoteUrl: remoteUrl ?? null,
    fingerprint,
  }
}

/**
 * Enumera los ficheros del repositorio usando `git ls-files`, que respeta
 * `.gitignore` gratis y es órdenes de magnitud más rápido que recorrer el disco
 * en repos con `node_modules` o `vendor`.
 */
export async function listTrackedFiles(repoRoot: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await execa(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: repoRoot, reject: true, maxBuffer: 256 * 1024 * 1024 },
    )
    return stdout.split('\0').filter((entry) => entry.length > 0)
  } catch {
    return undefined
  }
}

/** Comprueba si una rama existe en local. */
export async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  const result = await git(repoRoot, ['rev-parse', '--verify', `refs/heads/${branch}`])
  return result !== undefined
}
