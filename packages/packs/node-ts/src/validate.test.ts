import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { recommendedProfile } from '@plumbward/packs-sdk'
import type { HealthCheck, Profile, RepoContext } from '@plumbward/packs-sdk'
import type { RepoScan } from '@plumbward/scanner'
import { nodeTsPack } from './index.js'
import { triggerBranches } from './workflow-checks.js'

const created: string[] = []
afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/** Repository on disk with the given files: `doctor` really reads them. */
async function repoWith(files: Record<string, string>): Promise<RepoScan> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-doctor-'))
  created.push(root)
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return {
    repoRoot: root,
    git: {
      isRepo: true,
      branch: 'main',
      detachedHead: false,
      branches: ['main'],
      defaultBranch: 'main',
      isDirty: false,
      rootCommit: 'abc',
      remoteUrl: null,
      fingerprint: 'abc',
    },
    sloc: { total: 100, filesScanned: 1, byLanguage: [], sizeClass: 'small', mode: 'greenfield' },
    stacks: [],
    primaryStack: null,
    maturity: { score: 0, signals: [], missing: [] },
    isMonorepo: false,
    files: ['package.json', ...Object.keys(files)],
  }
}

async function check(id: string, files: Record<string, string>, changes: Partial<Profile>): Promise<HealthCheck | undefined> {
  const scan = await repoWith(files)
  const profile: Profile = { ...recommendedProfile(scan), ...changes }
  const context: RepoContext = { scan, profile, cliVersion: 'test' }
  return (await nodeTsPack.validate(context)).find((c) => c.id === id)
}

const PROD = '.github/workflows/ci-prod.yml'
const DEV = '.github/workflows/ci-dev.yml'
const branches = (release: string | null) => ({ branches: { integration: 'main', release, staging: null } })

describe('doctor: deploy branch', () => {
  it('warns if there is a deploy target but no branch', async () => {
    expect((await check('release-branch', {}, { deployTarget: 'vercel', ...branches(null) }))?.ok).toBe(false)
  })

  it('warns if a ci-prod.yml exists with no branch configured, even with no target', async () => {
    const result = await check('release-branch', { [PROD]: 'on:\n  push:\n    branches: [develop]\n' }, { deployTarget: 'none', ...branches(null) })
    expect(result?.ok).toBe(false)
  })

  it('warns if the existing ci-prod.yml deploys from a branch other than the configured one', async () => {
    // The case the version that inferred the branch left behind: deploying from develop.
    const result = await check('release-branch', { [PROD]: 'on:\n  push:\n    branches: [develop]\n' }, { deployTarget: 'vercel', ...branches('Prod') })
    expect(result?.ok).toBe(false)
    expect(result?.detail).toContain('develop')
  })

  it('warns if the ci-prod.yml deploys on any branch', async () => {
    expect((await check('release-branch', { [PROD]: 'on:\n  push:\n' }, { deployTarget: 'vercel', ...branches('Prod') }))?.ok).toBe(false)
  })

  it('warns if it cannot interpret the ci-prod.yml', async () => {
    expect((await check('release-branch', { [PROD]: 'on: [push\n' }, { deployTarget: 'vercel', ...branches('Prod') }))?.ok).toBe(false)
  })

  it('accepts a ci-prod.yml that deploys exactly from the configured branch', async () => {
    const block = 'on:\n  push:\n    branches:\n      - Prod\n'
    expect((await check('release-branch', { [PROD]: block }, { deployTarget: 'vercel', ...branches('Prod') }))?.ok).toBe(true)
  })

  it('says nothing if there is neither a deploy nor a workflow', async () => {
    expect(await check('release-branch', {}, { deployTarget: 'none', ...branches(null) })).toBeUndefined()
  })
})

describe('doctor: Pull Request coverage', () => {
  it('warns if ci-dev.yml only reviews PRs to certain branches', async () => {
    const result = await check('pr-coverage', { [DEV]: 'on:\n  pull_request:\n    branches: [main]\n' }, {})
    expect(result?.ok).toBe(false)
  })

  it('accepts a ci-dev.yml that reviews every PR', async () => {
    expect((await check('pr-coverage', { [DEV]: 'on:\n  pull_request:\n  push:\n    branches: [main]\n' }, {}))?.ok).toBe(true)
  })

  it('warns if ci-dev.yml does not trigger on Pull Requests', async () => {
    expect((await check('pr-coverage', { [DEV]: 'on:\n  push:\n    branches: [main]\n' }, {}))?.ok).toBe(false)
  })
})

describe('reading triggers', () => {
  it('tells apart a branch list, all branches and a missing trigger', () => {
    expect(triggerBranches('on:\n  push:\n    branches: [a, b]\n', 'push')).toEqual(['a', 'b'])
    expect(triggerBranches('on:\n  push:\n', 'push')).toBeNull()
    expect(triggerBranches('on:\n  push:\n', 'pull_request')).toBeUndefined()
  })
})
