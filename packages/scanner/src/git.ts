import { execa } from 'execa'
import { createHash } from 'node:crypto'
import type { GitState } from './types.js'

/** Runs git, returning `undefined` if the command fails (repo without commits, etc.). */
async function git(repoRoot: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execa('git', [...args], { cwd: repoRoot, reject: true })
    return stdout.trim()
  } catch {
    return undefined
  }
}

/**
 * Normalises a remote URL so that `git@github.com:org/repo.git` and
 * `https://github.com/org/repo` produce the same fingerprint.
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
 * Default branch of the `origin` remote, without connecting to the network.
 *
 * Returns `null` if there is no remote, if `origin/HEAD` is not defined or if
 * it points to a ref that does not exist. See the warning about staleness in
 * `GitState.defaultBranch`: this value informs, but does not decide on its own.
 */
export async function readDefaultBranch(repoRoot: string): Promise<string | null> {
  const symbolic = await git(repoRoot, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])
  if (!symbolic?.startsWith('refs/remotes/origin/')) return null

  const exists = await git(repoRoot, ['rev-parse', '--verify', '--quiet', symbolic])
  if (exists === undefined) return null

  const name = symbolic.slice('refs/remotes/origin/'.length)
  return name.length > 0 ? name : null
}

/**
 * Names of every local and remote-tracking branch, without prefix.
 *
 * Works without network: it reads the refs already on disk. It excludes `HEAD`,
 * which in `refs/remotes/<remote>/HEAD` is a pointer and not a branch.
 */
export async function listBranchNames(repoRoot: string): Promise<string[]> {
  const output = await git(repoRoot, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'])
  if (!output) return []

  const names = new Set<string>()
  for (const ref of output.split('\n')) {
    const name = ref.startsWith('refs/heads/')
      ? ref.slice('refs/heads/'.length)
      : ref.replace(/^refs\/remotes\/[^/]+\//, '')
    if (name.length > 0 && name !== 'HEAD' && !name.startsWith('refs/')) names.add(name)
  }
  return [...names].sort()
}

export async function readGitState(repoRoot: string): Promise<GitState> {
  const insideRepo = await git(repoRoot, ['rev-parse', '--is-inside-work-tree'])
  if (insideRepo !== 'true') {
    return {
      isRepo: false,
      branch: null,
      detachedHead: false,
      branches: [],
      defaultBranch: null,
      isDirty: false,
      rootCommit: null,
      remoteUrl: null,
      fingerprint: null,
    }
  }

  const [headRef, status, rootCommits, remoteUrl, defaultBranch, branches] = await Promise.all([
    // Without `--short`: see the comment of `GitState.branch`.
    git(repoRoot, ['symbolic-ref', '-q', 'HEAD']),
    git(repoRoot, ['status', '--porcelain']),
    // Fingerprint of the repository: hash of the first commit (specification, module 1).
    git(repoRoot, ['rev-list', '--max-parents=0', 'HEAD']),
    git(repoRoot, ['config', '--get', 'remote.origin.url']),
    readDefaultBranch(repoRoot),
    listBranchNames(repoRoot),
  ])

  const branch = headRef?.startsWith('refs/heads/') ? headRef.slice('refs/heads/'.length) : null

  // A repo can have several roots (merged histories): the last one is taken,
  // which is the oldest in the order of `rev-list`.
  const rootCommit = rootCommits ? (rootCommits.split('\n').at(-1)?.trim() ?? null) : null

  const fingerprintSource = rootCommit ?? (remoteUrl ? normaliseRemote(remoteUrl) : null)
  const fingerprint = fingerprintSource
    ? createHash('sha256').update(fingerprintSource).digest('hex').slice(0, 32)
    : null

  return {
    isRepo: true,
    branch,
    detachedHead: branch === null,
    branches,
    defaultBranch,
    isDirty: status !== undefined && status.length > 0,
    rootCommit,
    remoteUrl: remoteUrl ?? null,
    fingerprint,
  }
}

/**
 * Lists the files of the repository with `git ls-files`, which respects
 * `.gitignore` for free and is orders of magnitude faster than walking the disk
 * in repos with `node_modules` or `vendor`.
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

/** Checks whether a branch exists locally. */
export async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  const result = await git(repoRoot, ['rev-parse', '--verify', `refs/heads/${branch}`])
  return result !== undefined
}
