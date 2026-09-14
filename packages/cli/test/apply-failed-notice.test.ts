import { afterEach, describe, expect, it, vi } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Blocking finding of the review of PR #11: the branch notice was printed
 * without looking at `cause.rolledBack`. When the automatic revert fails, the
 * advice leads into a dead end (see `branch-notice.test.ts` for the detail).
 *
 * That path cannot really be triggered from outside: `revertEntries` would have
 * to blow up halfway, and that needs the tree permissions to change between two
 * operations of the same `apply`. `applyPlan` is replaced by one that throws the
 * error already built; what is tested here is the wiring —what is printed with
 * `rolledBack === false`—, not the revert.
 */

const { applyPlanMock } = vi.hoisted(() => ({ applyPlanMock: vi.fn() }))

vi.mock('@plumbward/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@plumbward/core')>()
  return { ...actual, applyPlan: applyPlanMock }
})

const { ApplyFailedError } = await import('@plumbward/core')
const { runApply, GOVERNANCE_BRANCH } = await import('../src/commands.js')

const created: string[] = []
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

async function createRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-failed-notice-'))
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

afterEach(async () => {
  vi.restoreAllMocks()
  applyPlanMock.mockReset()
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('apply that fails and cannot revert either', () => {
  it('does not propose going back to the starting branch with a half-written tree', async () => {
    const root = await createRepo()
    applyPlanMock.mockRejectedValue(new ApplyFailedError('EACCES while writing', undefined, false))
    const output = captureOutput()

    const exitCode = await runApply(root, { yes: true, install: false, branch: true })
    const printed = output()

    expect(exitCode).toBe(1)
    expect(printed).toContain('no se pudo revertir del todo')

    // The two instructions that closed the only way out.
    expect(printed).not.toContain(`git branch -d ${GOVERNANCE_BRANCH}`)

    // Anchored to the notice line, not to a bare `plumbward rollback`: that
    // string already appears in the warning line before it, and with it the
    // assertion would hold even if the notice put the `checkout` first.
    const revertHere = printed.indexOf('Ejecuta `plumbward rollback` aquí')
    expect(revertHere).toBeGreaterThan(-1)
    expect(revertHere).toBeLessThan(printed.indexOf('git checkout Prod'))
  })

  /**
   * Finding 2 of the review of F0-30. The two cases above start on the `Prod`
   * branch, so `startedOnBranch` is never `null` and the starting commit passed
   * to the notice is not used: replacing it with `null` broke no test. With a
   * detached HEAD it is just the opposite —there is no branch to name— and it is
   * the path where the user is most trapped: `apply` has failed and they are on
   * the isolated branch.
   */
  it('names the starting commit if the work started with a detached HEAD', async () => {
    const root = await createRepo()
    await git(root, 'checkout', '--detach')
    const startCommit = await git(root, 'rev-parse', 'HEAD')
    applyPlanMock.mockRejectedValue(new ApplyFailedError('EACCES while writing', undefined, true))
    const output = captureOutput()

    expect(await runApply(root, { yes: true, install: false, branch: true })).toBe(1)
    const printed = output()

    expect(printed).toContain(`git checkout ${startCommit}`)
    expect(printed).not.toContain('no tenía ningún commit')
  })

  it('still proposes going back and deleting when it did revert', async () => {
    const root = await createRepo()
    applyPlanMock.mockRejectedValue(new ApplyFailedError('EACCES while writing', undefined, true))
    const output = captureOutput()

    expect(await runApply(root, { yes: true, install: false, branch: true })).toBe(1)
    const printed = output()

    expect(printed).toContain('git checkout Prod')
    expect(printed).toContain(`git branch -d ${GOVERNANCE_BRANCH}`)
  })
})
