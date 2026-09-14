import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPlan, rollbackLastApply, simulatePlan } from '@plumbward/core'
import type { ChangePlan, Operation } from '@plumbward/core'
import { scanRepository } from '@plumbward/scanner'
import { PackRegistry, checkPackConformance, file, recommendedProfile } from '@plumbward/packs-sdk'
import { nodeTsPack } from '@plumbward/pack-node-ts'

const VERSION = '0.1.0-test'

/** Creates a realistic git repository to run the full cycle on. */
async function createTestRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-e2e-'))

  await writeFile(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'client-project',
        version: '1.0.0',
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      },
      null,
      2,
    ) + '\n',
  )
  await writeFile(join(root, 'tsconfig.json'), '{\n  // Client comment.\n  "compilerOptions": { "strict": true }\n}\n')
  await writeFile(join(root, '.gitignore'), 'node_modules/\ndist/\n')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'app.ts'), 'export const greeting = (): string => "hello"\n')

  await execa('git', ['init', '-b', 'main'], { cwd: root })
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  await execa('git', ['config', 'user.name', 'Test'], { cwd: root })
  await execa('git', ['add', '.'], { cwd: root })
  await execa('git', ['commit', '-m', 'initial commit'], { cwd: root })

  return root
}

async function buildTestPlan(root: string): Promise<ChangePlan> {
  const scan = await scanRepository(root)
  const profile = recommendedProfile(scan)
  const registry = new PackRegistry([nodeTsPack])
  const plan = await registry.buildPlan({ scan, profile, cliVersion: VERSION })

  const config: Operation = file(
    '.governance/config.yml',
    'strictness: strict\n',
    'Governance profile.',
    { managed: false },
  )

  return { ...plan, operations: [config, ...plan.operations] }
}

async function gitStatus(root: string): Promise<string> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd: root })
  return stdout.trim()
}

describe('full cycle on a real repository', () => {
  let root: string

  beforeEach(async () => {
    root = await createTestRepo()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('detects the right stack, size and mode', async () => {
    const scan = await scanRepository(root)

    expect(scan.git.isRepo).toBe(true)
    expect(scan.git.branch).toBe('main')
    expect(scan.git.fingerprint).toBeTruthy()
    expect(scan.primaryStack?.id).toBe('node-ts')
    expect(scan.primaryStack?.typescript).toBe(true)
    expect(scan.primaryStack?.frameworks).toContain('React')
    expect(scan.sloc.mode).toBe('greenfield')
    expect(scan.maturity.score).toBeLessThan(30)
  })

  it('the plan describes exactly what apply is going to do', async () => {
    const plan = await buildTestPlan(root)
    const simulation = await simulatePlan(plan, { repoRoot: root, version: VERSION })

    const changedPaths = simulation.changes.map((change) => change.path)
    expect(changedPaths).toContain('.github/workflows/ci-dev.yml')
    expect(changedPaths).toContain('.gitleaks.toml')
    expect(changedPaths).toContain('.husky/pre-commit')
    expect(changedPaths).toContain('.cursorrules')
    expect(changedPaths).toContain('GOVERNANCE.md')
    expect(changedPaths).toContain('package.json')
    expect(changedPaths).toContain('.gitignore')

    // Nothing has been written yet: `plan` is read-only.
    expect(await gitStatus(root)).toBe('')
  })

  it('apply writes what was planned and rollback leaves the repository identical', async () => {
    const plan = await buildTestPlan(root)
    const originalPackage = await readFile(join(root, 'package.json'), 'utf8')

    const firstApply = await applyPlan(plan, {
      repoRoot: root,
      version: VERSION,
      writtenOnBranch: 'main',
      writtenOnCommit: null,
      startedOnBranch: 'main',
      runCommands: false,
    })

    expect(firstApply.applied).toBeGreaterThan(10)
    expect(existsSync(join(root, '.github/workflows/ci-dev.yml'))).toBe(true)
    expect(existsSync(join(root, '.husky/pre-commit'))).toBe(true)
    expect(await gitStatus(root)).not.toBe('')

    // The package.json patch respects the scripts that already existed.
    const modifiedPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    expect(modifiedPackage.scripts.dev).toBe('vite')
    expect(modifiedPackage.scripts.build).toBe('vite build')
    expect(modifiedPackage.scripts.lint).toBe('eslint .')

    // The comment in the client's tsconfig is still there.
    expect(await readFile(join(root, 'tsconfig.json'), 'utf8')).toContain('Client comment')

    await rollbackLastApply(root, { currentBranch: 'main', currentCommit: null })

    expect(await gitStatus(root)).toBe('')
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(originalPackage)
    expect(existsSync(join(root, '.github/workflows/ci-dev.yml'))).toBe(false)
  })

  it('a second apply produces no change (end-to-end idempotence)', async () => {
    await applyPlan(await buildTestPlan(root), {
      repoRoot: root,
      version: VERSION,
      writtenOnBranch: 'main',
      writtenOnCommit: null,
      startedOnBranch: 'main',
      runCommands: false,
    })

    const secondPlan = await buildTestPlan(root)
    const secondSimulation = await simulatePlan(secondPlan, { repoRoot: root, version: VERSION })

    expect(secondSimulation.changes).toHaveLength(0)

    const secondApply = await applyPlan(secondPlan, {
      repoRoot: root,
      version: VERSION,
      writtenOnBranch: 'main',
      writtenOnCommit: null,
      startedOnBranch: 'main',
      runCommands: false,
    })
    expect(secondApply.applied).toBe(0)
  })

  it('reverts automatically if an operation fails halfway', async () => {
    const plan = await buildTestPlan(root)
    const brokenPlan: ChangePlan = {
      ...plan,
      operations: [
        ...plan.operations,
        {
          kind: 'patchJson',
          path: 'missing.json',
          pointer: '/a',
          value: 1,
          strategy: 'set',
          reason: 'Impossible operation on purpose.',
        },
      ],
    }

    await expect(
      applyPlan(brokenPlan, {
        repoRoot: root,
        version: VERSION,
        writtenOnBranch: 'main',
        writtenOnCommit: null,
        startedOnBranch: 'main',
        runCommands: false,
      }),
    ).rejects.toThrow(/no existe el fichero/)

    // Operational resilience requirement: the repository stays intact.
    expect(await gitStatus(root)).toBe('')
  })

  it('the node-ts pack meets the conformance contract', async () => {
    const scan = await scanRepository(root)
    const packContext = { scan, profile: recommendedProfile(scan), cliVersion: VERSION }

    expect(await checkPackConformance(nodeTsPack, packContext)).toEqual([])
  })

  it('stops a pack from writing outside the repository', async () => {
    const plan = await buildTestPlan(root)
    const maliciousPlan: ChangePlan = {
      ...plan,
      operations: [
        {
          kind: 'createFile',
          path: '../../outside-the-repo.txt',
          content: 'should never get here',
          managed: false,
          reason: 'Attempt to escape the root.',
        },
      ],
    }

    await expect(
      applyPlan(maliciousPlan, {
        repoRoot: root,
        version: VERSION,
        writtenOnBranch: 'main',
        writtenOnCommit: null,
        startedOnBranch: 'main',
        runCommands: false,
      }),
    ).rejects.toThrow(/escapa de la raíz/)
  })
})
