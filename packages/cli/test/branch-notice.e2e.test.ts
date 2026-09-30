import { afterEach, describe, expect, it, vi } from 'vitest'
import { execa } from 'execa'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runApply, runRollback, GOVERNANCE_BRANCH } from '../src/commands.js'

/**
 * Item 2 of F0-24: after an `apply` failure, the automatic revert said "the
 * repository is intact" while it left HEAD on the isolated branch.
 *
 * The files do stay intact; the branch does not. Whoever reads that message
 * believes they are on their branch and keeps working on
 * `chore/setup-ai-governance`, which also stays created and blocks the next
 * `apply` (`isolatedBranchBlocks`).
 *
 * The failure is caused with a read-only `.github`: `apply` writes several
 * files and blows up with EACCES when it reaches the workflow.
 */

const created: string[] = []
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

/** Minimal Node repository on `Prod`, with one commit. */
async function createRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  created.push(root)
  await writeFile(
    join(root, 'package.json'),
    '{"name":"client","version":"1.0.0","devDependencies":{"typescript":"^5.0.0"}}\n',
  )
  await git(root, 'init', '-b', 'Prod')
  await git(root, 'config', 'user.email', 'test@example.com')
  await git(root, 'config', 'user.name', 'Test')
  await git(root, 'add', '.')
  await git(root, 'commit', '-m', 'initial')
  return root
}

/** Leaves `.github` without write permission: `apply` will fail with EACCES. */
async function blockGithubDir(root: string): Promise<void> {
  await mkdir(join(root, '.github'))
  await chmod(join(root, '.github'), 0o555)
}

/** Everything the CLI printed, without colours. */
function captureOutput(): () => string {
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  return () => {
    spy.mockRestore()
    return lines.join('\n').replace(ANSI, '')
  }
}

async function currentBranch(root: string): Promise<string> {
  const ref = await git(root, 'symbolic-ref', '-q', 'HEAD')
  return ref.replace(/^refs\/heads\//, '')
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of created.splice(0)) {
    await chmod(join(root, '.github'), 0o755).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

describe('branch notices after a failed apply and after rollback', () => {
  it('does not claim the repository is intact when the branch has changed', async () => {
    const root = await createRepo('plumbward-notice-')
    await blockGithubDir(root)
    const output = captureOutput()

    const exitCode = await runApply(root, { yes: true, install: false, branch: true })
    const printed = output()

    expect(exitCode).toBe(1)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    // The branch has changed: saying only that the repository is intact is false.
    expect(printed).not.toMatch(/the repository is intact\.?\s*$/m)
    expect(printed).toContain(GOVERNANCE_BRANCH)
    expect(printed).toContain('git checkout Prod')
  })

  it('after rollback, says how to go back to the starting branch, by its name', async () => {
    const root = await createRepo('plumbward-notice-ok-')

    expect(await runApply(root, { yes: true, install: false, branch: true })).toBe(0)

    const output = captureOutput()
    expect(await runRollback(root)).toBe(0)
    const printed = output()

    // `git checkout -` depends on what the previous ref was; the journal knows the name.
    expect(printed).toContain('git checkout Prod')
  })
})
