import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPlan } from './apply.js'
import { PlanBuilder } from './plan.js'
import { simulatePlan } from './simulate.js'
import type { ChangePlan, Operation } from './types.js'

/**
 * `simulatePlan` is what `plan` shows the user before anything is written. Its
 * promise is that the diff is literally what `apply` will do, so the main case
 * compares the simulation with a real apply on the same files (F0-7).
 */

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-simulate-'))
  created.push(root)
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(root, path), content)
  }
  return root
}

function planOf(operations: readonly Operation[]): ChangePlan {
  return new PlanBuilder('en').add('test-pack', operations).build()
}

const files = {
  'package.json': '{\n  "name": "client"\n}\n',
  'ci.yml': 'name: CI\njobs:\n  test:\n    runs-on: ubuntu-latest\n',
  '.gitignore': 'node_modules/\n',
}

const operations: Operation[] = [
  {
    kind: 'patchJson',
    path: 'package.json',
    pointer: '/scripts/lint',
    value: 'eslint .',
    strategy: 'set',
    reason: 'lint script',
  },
  {
    kind: 'patchYaml',
    path: 'ci.yml',
    pointer: '/jobs/test/timeout-minutes',
    value: 15,
    strategy: 'set',
    reason: 'timeout',
  },
  {
    kind: 'ensureBlock',
    path: '.gitignore',
    blockId: 'plumbward',
    content: 'coverage/',
    commentStyle: 'hash',
    createIfMissing: false,
    reason: 'ignore coverage',
  },
  { kind: 'addDependency', manager: 'pnpm', name: 'eslint', dev: true, reason: 'linter' },
]

describe('simulatePlan', () => {
  it('shows for every patched file exactly the content apply writes', async () => {
    const root = await tempRepo(files)

    const simulation = await simulatePlan(planOf(operations), { repoRoot: root, version: '0.0.0' })
    await applyPlan(planOf(operations), {
      repoRoot: root,
      version: '0.0.0',
      writtenOnBranch: null,
      writtenOnCommit: null,
      startedOnBranch: null,
      runCommands: false,
    })

    expect(simulation.changes.map((change) => change.path)).toEqual([
      '.gitignore',
      'ci.yml',
      'package.json',
    ])
    for (const change of simulation.changes) {
      expect(change.before).toBe(files[change.path as keyof typeof files])
      expect(change.after).toBe(await readFile(join(root, change.path), 'utf8'))
    }
    expect(simulation.changes.find((c) => c.path === 'ci.yml')?.reasons).toEqual(['timeout'])
    expect(simulation.sideEffects.map((op) => op.kind)).toEqual(['addDependency'])
  })

  it('reports as no-ops the patches the repository already complies with', async () => {
    const root = await tempRepo(files)
    await applyPlan(planOf(operations), {
      repoRoot: root,
      version: '0.0.0',
      writtenOnBranch: null,
      writtenOnCommit: null,
      startedOnBranch: null,
      runCommands: false,
    })

    const simulation = await simulatePlan(planOf(operations), { repoRoot: root, version: '0.0.0' })

    expect(simulation.changes).toEqual([])
    expect(simulation.noOps.map((op) => op.kind)).toEqual(['ensureBlock', 'patchJson', 'patchYaml'])
  })

  it('a block that may not create its missing file is a no-op, as in apply', async () => {
    const root = await tempRepo({})

    const simulation = await simulatePlan(planOf([operations[2] as Operation]), {
      repoRoot: root,
      version: '0.0.0',
    })

    expect(simulation.changes).toEqual([])
    expect(simulation.noOps).toHaveLength(1)
  })
})
