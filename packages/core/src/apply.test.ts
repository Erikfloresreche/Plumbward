import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ApplyFailedError,
  applyPlan,
  describeOperation,
  synthesiseInstallCommands,
  type ApplyOptions,
  type CommandRunner,
} from './apply.js'
import { pathExists } from './fs.js'
import { PlanBuilder } from './plan.js'
import type { ChangePlan, Conflict, Operation, PackageManager } from './types.js'
import { JOURNAL_FILE } from './types.js'

/**
 * `applyPlan` at core level, without git or the CLI: the paths the end-to-end
 * tests never reach (F0-7). Every refusal and every failure also checks what
 * is left on disk, because failing and leaving the repository half done is the
 * risk this package exists to prevent (R5).
 */

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempRepo(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-apply-core-'))
  created.push(root)
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(root, path), content)
  }
  return root
}

function options(repoRoot: string, extra: Partial<ApplyOptions> = {}): ApplyOptions {
  return {
    repoRoot,
    version: '0.0.0-test',
    writtenOnBranch: 'feature',
    writtenOnCommit: null,
    startedOnBranch: 'feature',
    runCommands: false,
    ...extra,
  }
}

function planOf(operations: readonly Operation[], conflicts: readonly Conflict[] = []): ChangePlan {
  const builder = new PlanBuilder('en').add('test-pack', operations)
  for (const conflict of conflicts) builder.conflict(conflict)
  return builder.build()
}

function createFile(path: string, content: string, onExists?: 'skip' | 'overwrite' | 'conflict'): Operation {
  return {
    kind: 'createFile',
    path,
    content,
    managed: false,
    reason: 'test',
    ...(onExists === undefined ? {} : { onExists }),
  }
}

const read = (root: string, path: string): Promise<string> => readFile(join(root, path), 'utf8')

describe('applyPlan: refusals that write nothing', () => {
  it('refuses a plan with a blocking conflict before creating any file or journal', async () => {
    const root = await tempRepo()
    const plan = planOf(
      [createFile('NEW.md', 'new\n')],
      [{ path: 'NEW.md', reason: 'clash', severity: 'block' }],
    )

    const failure = await applyPlan(plan, options(root)).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApplyFailedError)
    expect((failure as ApplyFailedError).rolledBack).toBe(false)
    expect((failure as ApplyFailedError).operation).toBeUndefined()
    expect(await pathExists(join(root, 'NEW.md'))).toBe(false)
    expect(await pathExists(join(root, JOURNAL_FILE))).toBe(false)
  })

  it('applies a plan whose conflicts are only warnings', async () => {
    const root = await tempRepo()
    const plan = planOf(
      [createFile('NEW.md', 'new\n')],
      [{ path: 'NEW.md', reason: 'heads-up', severity: 'warn' }],
    )

    const result = await applyPlan(plan, options(root))

    expect(result.applied).toBe(1)
    expect(await read(root, 'NEW.md')).toBe('new\n')
  })
})

describe('applyPlan: createFile and its existing-file policy', () => {
  it('skips by default a file that already exists, without touching it', async () => {
    const root = await tempRepo({ 'README.md': 'theirs\n' })

    const result = await applyPlan(planOf([createFile('README.md', 'ours\n')]), options(root))

    expect(result).toMatchObject({ applied: 0, skipped: 1 })
    expect(result.journal.entries[0]?.note).toBe('already exists, left untouched')
    expect(await read(root, 'README.md')).toBe('theirs\n')
  })

  it('overwrites when asked, and the journal keeps the previous content', async () => {
    const root = await tempRepo({ 'README.md': 'theirs\n' })

    const result = await applyPlan(
      planOf([createFile('README.md', 'ours\n', 'overwrite')]),
      options(root),
    )

    expect(result.applied).toBe(1)
    expect(await read(root, 'README.md')).toBe('ours\n')
    const snapshot = result.journal.entries[0]?.snapshots[0]
    expect(snapshot?.existed).toBe(true)
    expect(Buffer.from(snapshot?.contentBase64 ?? '', 'base64').toString('utf8')).toBe('theirs\n')
  })

  it('a `conflict` policy fails and reverts what was already written', async () => {
    const root = await tempRepo({ 'README.md': 'theirs\n' })
    // `A.md` is applied first (operations are sorted by path), then the
    // conflict on `README.md` has to undo it.
    const plan = planOf([createFile('A.md', 'a\n'), createFile('README.md', 'ours\n', 'conflict')])

    const failure = await applyPlan(plan, options(root)).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApplyFailedError)
    expect((failure as ApplyFailedError).rolledBack).toBe(true)
    expect((failure as ApplyFailedError).message).toMatch(/already exists and cannot be overwritten/)
    expect(await pathExists(join(root, 'A.md'))).toBe(false)
    expect(await read(root, 'README.md')).toBe('theirs\n')
    expect(await pathExists(join(root, JOURNAL_FILE))).toBe(false)
  })

  it('an operation with a path outside the repository fails and writes nothing', async () => {
    const root = await tempRepo()

    const failure = await applyPlan(
      planOf([createFile('../escaped.md', 'x\n')]),
      options(root),
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApplyFailedError)
    expect((failure as ApplyFailedError).message).toMatch(/escapes the repository root/)
    expect(await pathExists(join(root, '..', 'escaped.md'))).toBe(false)
    expect(await pathExists(join(root, JOURNAL_FILE))).toBe(false)
  })
})

describe('applyPlan: patch operations', () => {
  const workflow = 'name: CI\njobs:\n  test:\n    runs-on: ubuntu-latest\n'
  const patchYaml: Operation = {
    kind: 'patchYaml',
    path: 'ci.yml',
    pointer: '/jobs/test/timeout-minutes',
    value: 15,
    strategy: 'set',
    reason: 'test',
  }

  it('patchYaml writes the change and records the previous content', async () => {
    const root = await tempRepo({ 'ci.yml': workflow })

    const result = await applyPlan(planOf([patchYaml]), options(root))

    expect(result.applied).toBe(1)
    expect(await read(root, 'ci.yml')).toContain('timeout-minutes: 15')
    expect(result.journal.entries[0]?.snapshots[0]?.existed).toBe(true)
  })

  it('patchYaml skips a file that is already up to date', async () => {
    const root = await tempRepo({ 'ci.yml': workflow })
    await applyPlan(planOf([patchYaml]), options(root))
    const before = await read(root, 'ci.yml')

    const result = await applyPlan(planOf([patchYaml]), options(root))

    expect(result).toMatchObject({ applied: 0, skipped: 1 })
    expect(await read(root, 'ci.yml')).toBe(before)
  })

  it.each([
    ['patchYaml', patchYaml],
    [
      'patchJson',
      {
        kind: 'patchJson',
        path: 'ci.yml',
        pointer: '/name',
        value: 'x',
        strategy: 'set',
        reason: 'test',
      } satisfies Operation,
    ],
  ] as const)('%s fails without creating the file when the target does not exist', async (_, op) => {
    const root = await tempRepo()

    const failure = await applyPlan(planOf([op]), options(root)).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApplyFailedError)
    expect((failure as ApplyFailedError).message).toMatch(/to patch does not exist/)
    expect(await pathExists(join(root, 'ci.yml'))).toBe(false)
  })

  it('ensureBlock skips a missing file it is not allowed to create', async () => {
    const root = await tempRepo()
    const op: Operation = {
      kind: 'ensureBlock',
      path: '.gitignore',
      blockId: 'plumbward',
      content: 'dist/',
      commentStyle: 'hash',
      createIfMissing: false,
      reason: 'test',
    }

    const result = await applyPlan(planOf([op]), options(root))

    expect(result.journal.entries[0]?.note).toBe('the target file does not exist')
    expect(await pathExists(join(root, '.gitignore'))).toBe(false)
  })
})

describe('applyPlan: commands', () => {
  const command: Operation = { kind: 'execCommand', cmd: 'tool', args: ['--x'], reason: 'test' }

  it('records but does not run commands when execution is disabled', async () => {
    const root = await tempRepo()
    const calls: string[] = []
    const runner: CommandRunner = async (cmd) => {
      calls.push(cmd)
    }

    const result = await applyPlan(planOf([command]), options(root, { runner }))

    expect(calls).toEqual([])
    expect(result.journal.entries[0]?.note).toBe('skipped (command execution disabled)')
  })

  it('fails if execution is enabled but no runner was injected', async () => {
    const root = await tempRepo()

    const failure = await applyPlan(
      planOf([command]),
      options(root, { runCommands: true }),
    ).catch((error: unknown) => error)

    expect((failure as ApplyFailedError).message).toMatch(/no command runner was injected/)
  })

  it('runs the command in the repository, or in its `cwd` inside it', async () => {
    const root = await tempRepo()
    const seen: string[] = []
    const runner: CommandRunner = async (cmd, _args, cwd) => {
      seen.push(`${cmd}@${cwd}`)
    }
    const inSub: Operation = { ...command, cmd: 'other', cwd: 'sub' }

    const result = await applyPlan(planOf([command, inSub]), options(root, { runCommands: true, runner }))

    expect(result.applied).toBe(2)
    expect(seen.sort()).toEqual([`other@${join(root, 'sub')}`, `tool@${root}`])
  })

  it('an optional command that fails is skipped with its reason', async () => {
    const root = await tempRepo()
    const runner: CommandRunner = async () => {
      throw new Error('exit 1')
    }

    const result = await applyPlan(
      planOf([{ ...command, optional: true }]),
      options(root, { runCommands: true, runner }),
    )

    expect(result.journal.entries[0]?.note).toBe('optional, failed: exit 1')
  })

  it('a required command that fails reverts the files written before it', async () => {
    const root = await tempRepo()
    const runner: CommandRunner = async () => {
      throw 'not an Error'
    }

    const failure = await applyPlan(
      planOf([createFile('NEW.md', 'new\n'), command]),
      options(root, { runCommands: true, runner }),
    ).catch((error: unknown) => error)

    expect((failure as ApplyFailedError).message).toBe('Failed to apply "run tool --x": not an Error')
    expect((failure as ApplyFailedError).rolledBack).toBe(true)
    expect(await pathExists(join(root, 'NEW.md'))).toBe(false)
    expect(await pathExists(join(root, JOURNAL_FILE))).toBe(false)
  })
})

describe('synthesiseInstallCommands', () => {
  const dependency = (manager: PackageManager, dev: boolean, name = 'lib'): Operation => ({
    kind: 'addDependency',
    manager,
    name,
    dev,
    reason: 'test',
  })

  it('groups the dependencies of one manager and kind into one command', () => {
    const commands = synthesiseInstallCommands([
      dependency('pnpm', true, 'a'),
      { ...dependency('pnpm', true, 'b'), version: '1.2.3' } as Operation,
      dependency('pnpm', false, 'c'),
      createFile('x', 'y'),
    ])

    expect(commands.map((c) => [c.cmd, ...c.args].join(' '))).toEqual([
      'pnpm add -D a b@1.2.3',
      'pnpm add c',
    ])
  })

  it.each([
    ['npm', true, 'npm install --save-dev lib'],
    ['npm', false, 'npm install --save lib'],
    ['pnpm', true, 'pnpm add -D lib'],
    ['yarn', true, 'yarn add -D lib'],
    ['yarn', false, 'yarn add lib'],
    ['bun', true, 'bun add -d lib'],
    ['bun', false, 'bun add lib'],
    ['composer', true, 'composer require --dev lib'],
    ['composer', false, 'composer require lib'],
    ['pip', true, 'pip install lib'],
    ['poetry', true, 'poetry add --group dev lib'],
    ['poetry', false, 'poetry add lib'],
    ['uv', true, 'uv add --dev lib'],
    ['uv', false, 'uv add lib'],
    ['go', false, 'go get lib'],
  ] as const)('%s (dev: %s) installs with `%s`', (manager, dev, expected) => {
    const [command] = synthesiseInstallCommands([dependency(manager, dev)])
    expect(command && [command.cmd, ...command.args].join(' ')).toBe(expected)
  })
})

describe('describeOperation', () => {
  it.each([
    [createFile('a.md', ''), 'create a.md'],
    [
      { kind: 'patchJson', path: 'p.json', pointer: '/a', value: 1, strategy: 'set', reason: '' },
      'patch p.json at /a',
    ],
    [
      { kind: 'patchYaml', path: 'c.yml', pointer: '/b', value: 1, strategy: 'set', reason: '' },
      'patch c.yml at /b',
    ],
    [
      {
        kind: 'ensureBlock',
        path: '.gitignore',
        blockId: 'id',
        content: '',
        commentStyle: 'hash',
        createIfMissing: true,
        reason: '',
      },
      'block "id" in .gitignore',
    ],
    [
      { kind: 'addDependency', manager: 'npm', name: 'lib', dev: true, reason: '' },
      'dependency lib (npm)',
    ],
    [{ kind: 'execCommand', cmd: 'tool', args: ['a', 'b'], reason: '' }, 'run tool a b'],
  ] as const satisfies readonly (readonly [Operation, string])[])('%o reads "%s"', (op, text) => {
    expect(describeOperation(op)).toBe(text)
  })
})
