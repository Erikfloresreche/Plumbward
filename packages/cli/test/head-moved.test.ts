import { afterEach, describe, expect, it, vi } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * What happens if someone switches branches while `apply` waits for the
 * confirmation: from another terminal, the IDE branch picker or a parallel agent.
 *
 * The confirmation is replaced by one that makes that change and then accepts.
 * That reproduces the race deterministically, with no timers.
 */

const duringPrompt = vi.hoisted(() => ({ action: async (): Promise<void> => {} }))

vi.mock('@clack/prompts', async (importOriginal) => {
  const original = await importOriginal<typeof import('@clack/prompts')>()
  return {
    ...original,
    confirm: async (): Promise<boolean> => {
      await duringPrompt.action()
      return true
    },
  }
})

const { runApply } = await import('../src/commands.js')

const created: string[] = []

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

async function createRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-head-moved-'))
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
  await git(root, 'checkout', '-b', 'feat/x')
  return root
}

afterEach(async () => {
  duringPrompt.action = async (): Promise<void> => {}
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('apply does not write if HEAD changes during the confirmation', () => {
  it('switching to Prod during the confirmation aborts without touching Prod', async () => {
    const root = await createRepo()
    duringPrompt.action = async (): Promise<void> => {
      await git(root, 'checkout', '-q', 'Prod')
    }
    const code = await runApply(root, { yes: false, install: false, branch: true })
    expect(code).toBe(1)
    expect(await git(root, 'symbolic-ref', 'HEAD')).toBe('refs/heads/Prod')
    expect(await git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('')
  })

  it('a new commit on the same branch during the confirmation aborts too', async () => {
    const root = await createRepo()
    duringPrompt.action = async (): Promise<void> => {
      await git(root, 'commit', '-q', '--allow-empty', '-m', 'meanwhile')
    }
    const code = await runApply(root, { yes: false, install: false, branch: true })
    expect(code).toBe(1)
    expect(await git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('')
  })

  it('control case: with no change during the confirmation, it applies on the work branch', async () => {
    const root = await createRepo()
    const code = await runApply(root, { yes: false, install: false, branch: true })
    expect(code).toBe(0)
    expect(await git(root, 'symbolic-ref', 'HEAD')).toBe('refs/heads/feat/x')
  })
})
