import { afterEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listBranchNames, readDefaultBranch, readGitState } from '@plumbward/scanner'

const created: string[] = []

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execa('git', args, { cwd })
}

/** Repository with one commit, without a remote. */
async function createRepo(branch = 'main', options: { commit?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-git-state-'))
  created.push(root)
  await writeFile(join(root, 'package.json'), '{"name":"x","version":"1.0.0"}\n')
  await git(root, 'init', '-b', branch)
  await git(root, 'config', 'user.email', 'test@example.com')
  await git(root, 'config', 'user.name', 'Test')
  if (options.commit ?? true) {
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'initial')
  }
  return root
}

/**
 * Simulates what `git clone` leaves behind: a remote ref and `origin/HEAD`
 * pointing to it. Without network: the refs are written directly.
 */
async function simulateClone(root: string, defaultBranch: string, createTarget = true): Promise<void> {
  if (createTarget) await git(root, 'update-ref', `refs/remotes/origin/${defaultBranch}`, 'HEAD')
  await git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${defaultBranch}`)
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('current branch', () => {
  it('returns the clean name even if a tag with the same name exists', async () => {
    // With `rev-parse --abbrev-ref HEAD` or `symbolic-ref --short`, this gave
    // `heads/Prod`, which matched no protected branch.
    const root = await createRepo('Prod')
    await git(root, 'tag', 'Prod')
    const state = await readGitState(root)
    expect(state.branch).toBe('Prod')
    expect(state.detachedHead).toBe(false)
  })

  it('with a detached HEAD does not make up a branch called "HEAD"', async () => {
    const root = await createRepo('Prod')
    await git(root, 'checkout', '--detach')
    const state = await readGitState(root)
    expect(state.branch).toBeNull()
    expect(state.detachedHead).toBe(true)
  })

  it('knows the branch even in a repository without commits', async () => {
    const state = await readGitState(await createRepo('Prod', { commit: false }))
    expect(state.branch).toBe('Prod')
    expect(state.detachedHead).toBe(false)
  })
})

describe('known branches', () => {
  it('gathers local and remote ones, without prefixes, duplicates or HEAD', async () => {
    const root = await createRepo('Prod')
    await git(root, 'branch', 'develop')
    await simulateClone(root, 'Prod')
    await git(root, 'update-ref', 'refs/remotes/origin/feature/login', 'HEAD')
    expect(await listBranchNames(root)).toEqual(['Prod', 'develop', 'feature/login'])
  })
})

describe('default branch of the remote', () => {
  it('is null in a repository without a remote', async () => {
    expect(await readDefaultBranch(await createRepo())).toBeNull()
  })

  it('detects a default branch not called main', async () => {
    const root = await createRepo('Prod')
    await simulateClone(root, 'Prod')
    expect(await readDefaultBranch(root)).toBe('Prod')
  })

  it('ignores an origin/HEAD that points to a ref that does not exist', async () => {
    const root = await createRepo()
    await simulateClone(root, 'deleted-branch', false)
    expect(await readDefaultBranch(root)).toBeNull()
  })
})
