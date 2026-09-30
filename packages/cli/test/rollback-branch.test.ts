import { afterEach, describe, expect, it, vi } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runApply, runRollback, GOVERNANCE_BRANCH } from '../src/commands.js'

/**
 * Item 1 of F0-24: `rollback` overwrites files of the starting branch with a
 * journal from an `apply` that wrote on the isolated branch.
 *
 * The journal stores the starting branch instead of the written branch, it is
 * ignored by git —`.governance/journal.json` goes into the `.gitignore` the pack
 * installs— and so it survives checkouts. The consequence is data loss:
 * `rollback` on `Prod` returns the `package.json` of `Prod` to the version it
 * had when `apply` was launched.
 *
 * Each case checks the content of the file after `rollback`, not only the exit
 * code: the failure is that it writes, not that it reports badly.
 */

const created: string[] = []

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

function manifest(version: string): string {
  return `{"name":"client","version":"${version}","devDependencies":{"typescript":"^5.0.0"}}\n`
}

/** Minimal Node repository on the given branch, with an initial commit. */
async function createRepo(branch: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-rollback-'))
  created.push(root)
  await writeFile(join(root, 'package.json'), manifest('1.0.0'))
  await git(root, 'init', '-b', branch)
  await git(root, 'config', 'user.email', 'test@example.com')
  await git(root, 'config', 'user.name', 'Test')
  await git(root, 'add', '.')
  await git(root, 'commit', '-m', 'initial')
  return root
}

async function apply(root: string): Promise<number> {
  return runApply(root, { yes: true, install: false, branch: true })
}

async function readManifest(root: string): Promise<string> {
  return readFile(join(root, 'package.json'), 'utf8')
}

async function currentBranch(root: string): Promise<string> {
  const ref = await git(root, 'symbolic-ref', '-q', 'HEAD')
  return ref.replace(/^refs\/heads\//, '')
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

/** Everything the CLI printed, without colours. */
function captureOutput(): () => string {
  const lines: string[] = []
  const ansi = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  return () => {
    spy.mockRestore()
    return lines.join('\n').replace(ansi, '')
  }
}

describe('rollback outside the branch apply wrote on', () => {
  it('does not overwrite the package.json of Prod with the snapshot of the isolated branch', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    // The developer goes back to Prod and keeps working. The journal, ignored
    // by git, survives the checkout.
    await git(root, 'checkout', 'Prod')
    await writeFile(join(root, 'package.json'), manifest('2.0.0'))
    await git(root, 'add', 'package.json')
    await git(root, 'commit', '-m', 'bump version')

    const exitCode = await runRollback(root)

    expect(await readManifest(root)).toBe(manifest('2.0.0'))
    expect(exitCode).toBe(1)
  })

  it('the journal stores the branch it wrote on, not the starting one', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)

    const journal: unknown = JSON.parse(
      await readFile(join(root, '.governance/journal.json'), 'utf8'),
    )
    expect((journal as { writtenOnBranch: string | null }).writtenOnBranch).toBe(GOVERNANCE_BRANCH)
  })

  it('does promise the rollback when it really will be able to do it', async () => {
    const root = await createRepo('Prod')
    const output = captureOutput()

    expect(await apply(root)).toBe(0)
    const printed = output()

    expect(printed).toContain('`plumbward rollback` leaves everything as it was')
  })

  /**
   * Finding 1 of the review of F0-30. The previous step says to open a Pull
   * Request, and that needs a commit; since F0-30, committing moves the commit
   * and `rollback` refuses. The promise stopped being true as soon as the
   * previous step was followed, which is the same false promise F0-24 withdrew.
   */
  it('does not promise a rollback the previous step invalidates', async () => {
    const root = await createRepo('Prod')
    const output = captureOutput()

    expect(await apply(root)).toBe(0)
    const printed = output()

    expect(printed).toContain('you have not committed yet')
    expect(printed).not.toContain('If something does not fit: `plumbward rollback`')
  })

  it('keeps reverting normally on the branch apply wrote on', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    expect(await runRollback(root)).toBe(0)
    expect(await readManifest(root)).toBe(manifest('1.0.0'))
    expect(await git(root, 'status', '--porcelain')).toBe('')
  })
})

/**
 * F0-30: the branch name says where you are, not whether it is the same place.
 *
 * `assertSameBranch` (F0-24) compares names, and `revertEntries` writes as soon
 * as the name matches. A branch deleted and recreated on another commit carries
 * the same name and is not the same place: the journal snapshots belong to the
 * old branch, and restoring them there is the same data loss F0-24 fixed for the
 * easy case.
 */
describe('rollback on a branch of the same name created on another commit', () => {
  it('does not restore the old snapshot over the work of the new branch', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    // The isolated branch is dropped and work goes on in Prod. The journal,
    // ignored by git, survives: it is in `.governance/`, which the checkout
    // does not delete.
    await git(root, 'checkout', '-f', 'Prod')
    await writeFile(join(root, 'package.json'), manifest('2.0.0'))
    await git(root, 'add', 'package.json')
    await git(root, 'commit', '-m', 'bump version')
    await git(root, 'branch', '-D', GOVERNANCE_BRANCH)

    // Later a branch with the same name is created again, on the new commit.
    // For the F0-24 guard it is indistinguishable from the original.
    await git(root, 'checkout', '-b', GOVERNANCE_BRANCH)

    const exitCode = await runRollback(root)

    expect(await readManifest(root)).toBe(manifest('2.0.0'))
    expect(exitCode).toBe(1)
  })

  it('does not revert either if there was a commit on the isolated branch after the apply', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'governance')
    await writeFile(join(root, 'package.json'), manifest('3.0.0'))

    const exitCode = await runRollback(root)

    expect(await readManifest(root)).toBe(manifest('3.0.0'))
    expect(exitCode).toBe(1)
  })

  /**
   * The recorded commit is also the starting one: `headMoved` aborts if HEAD
   * moves between the plan and the confirmation, and `prepareBranch` creates the
   * branch from HEAD without committing. This test pins that equality, which is
   * why the journal stores one commit and not two.
   */
  it('the journal stores the commit it wrote on, which is the starting one', async () => {
    const root = await createRepo('Prod')
    await git(root, 'checkout', '--detach')
    const startCommit = await git(root, 'rev-parse', 'HEAD')

    expect(await apply(root)).toBe(0)

    const journal: unknown = JSON.parse(
      await readFile(join(root, '.governance/journal.json'), 'utf8'),
    )
    expect((journal as { writtenOnCommit: string | null }).writtenOnCommit).toBe(startCommit)
  })

  it('the way-back notice names the starting commit, not a gap to fill', async () => {
    const root = await createRepo('Prod')
    await git(root, 'checkout', '--detach')
    const startCommit = await git(root, 'rev-parse', 'HEAD')

    expect(await apply(root)).toBe(0)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    const output = captureOutput()
    expect(await runRollback(root)).toBe(0)
    const printed = output()

    expect(printed).toContain(`git checkout ${startCommit}`)
    expect(printed).not.toContain('git checkout <commit>')
  })
})

/**
 * F0-29, finding 2 of the review of PR #11. With `--no-branch` and a detached
 * HEAD, `prepareBranch` returns early, the write happens on the detached HEAD
 * and `writtenOnBranch` stays `null`. F0-24 always refused to revert that
 * journal; before F0-24 it worked.
 *
 * Decision: the commit identifies the place (F0-30), and the empty label is
 * compared like any other. See `assertSameBranch`.
 */
describe('apply --no-branch with a detached HEAD', () => {
  async function applyDetached(root: string): Promise<number> {
    await git(root, 'checkout', '--detach')
    return runApply(root, { yes: true, install: false, branch: false })
  }

  it('is reverted with rollback and leaves the tree clean', async () => {
    const root = await createRepo('Prod')

    expect(await applyDetached(root)).toBe(0)
    expect(await readManifest(root)).not.toBe(manifest('1.0.0'))

    expect(await runRollback(root)).toBe(0)
    expect(await readManifest(root)).toBe(manifest('1.0.0'))
    expect(await git(root, 'status', '--porcelain')).toBe('')
  })

  it('promises the rollback, with the same commit caveat', async () => {
    const root = await createRepo('Prod')
    const output = captureOutput()

    expect(await applyDetached(root)).toBe(0)
    const printed = output()

    expect(printed).toContain('`plumbward rollback` leaves everything as it was')
    expect(printed).toContain('you have not committed yet')
    expect(printed).not.toContain('it will not be possible to revert')
  })

  it('does not revert if there was a commit on the detached HEAD after the apply', async () => {
    const root = await createRepo('Prod')

    expect(await applyDetached(root)).toBe(0)
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'governance')
    await writeFile(join(root, 'package.json'), manifest('3.0.0'))

    expect(await runRollback(root)).toBe(1)
    expect(await readManifest(root)).toBe(manifest('3.0.0'))
  })

  it('does not revert from a branch, even one pointing at the same commit, and says how to go back', async () => {
    const root = await createRepo('Prod')
    const startCommit = await git(root, 'rev-parse', 'HEAD')

    expect(await applyDetached(root)).toBe(0)
    await git(root, 'switch', '-c', 'rescue')
    await writeFile(join(root, 'package.json'), manifest('3.0.0'))
    const output = captureOutput()

    expect(await runRollback(root)).toBe(1)
    expect(output()).toContain(`git checkout --detach ${startCommit}`)
    expect(await readManifest(root)).toBe(manifest('3.0.0'))
  })
})
