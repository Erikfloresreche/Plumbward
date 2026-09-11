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

/** Repositorio en disco con los ficheros indicados: `doctor` los lee de verdad. */
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

describe('doctor: rama de despliegue', () => {
  it('avisa si hay destino de despliegue pero no rama', async () => {
    expect((await check('release-branch', {}, { deployTarget: 'vercel', ...branches(null) }))?.ok).toBe(false)
  })

  it('avisa si existe un ci-prod.yml sin rama configurada, aunque no haya destino', async () => {
    const result = await check('release-branch', { [PROD]: 'on:\n  push:\n    branches: [develop]\n' }, { deployTarget: 'none', ...branches(null) })
    expect(result?.ok).toBe(false)
  })

  it('avisa si el ci-prod.yml existente despliega desde otra rama que la configurada', async () => {
    // El caso que dejó la versión que deducía la rama: despliegue desde develop.
    const result = await check('release-branch', { [PROD]: 'on:\n  push:\n    branches: [develop]\n' }, { deployTarget: 'vercel', ...branches('Prod') })
    expect(result?.ok).toBe(false)
    expect(result?.detail).toContain('develop')
  })

  it('avisa si el ci-prod.yml despliega en cualquier rama', async () => {
    expect((await check('release-branch', { [PROD]: 'on:\n  push:\n' }, { deployTarget: 'vercel', ...branches('Prod') }))?.ok).toBe(false)
  })

  it('avisa si no puede interpretar el ci-prod.yml', async () => {
    expect((await check('release-branch', { [PROD]: 'on: [push\n' }, { deployTarget: 'vercel', ...branches('Prod') }))?.ok).toBe(false)
  })

  it('da por bueno un ci-prod.yml que despliega exactamente desde la rama configurada', async () => {
    const block = 'on:\n  push:\n    branches:\n      - Prod\n'
    expect((await check('release-branch', { [PROD]: block }, { deployTarget: 'vercel', ...branches('Prod') }))?.ok).toBe(true)
  })

  it('no dice nada si no hay despliegue ni workflow', async () => {
    expect(await check('release-branch', {}, { deployTarget: 'none', ...branches(null) })).toBeUndefined()
  })
})

describe('doctor: cobertura de Pull Requests', () => {
  it('avisa si ci-dev.yml sólo revisa PRs a ciertas ramas', async () => {
    const result = await check('pr-coverage', { [DEV]: 'on:\n  pull_request:\n    branches: [main]\n' }, {})
    expect(result?.ok).toBe(false)
  })

  it('da por bueno un ci-dev.yml que revisa todas las PRs', async () => {
    expect((await check('pr-coverage', { [DEV]: 'on:\n  pull_request:\n  push:\n    branches: [main]\n' }, {}))?.ok).toBe(true)
  })

  it('avisa si ci-dev.yml no se dispara en Pull Requests', async () => {
    expect((await check('pr-coverage', { [DEV]: 'on:\n  push:\n    branches: [main]\n' }, {}))?.ok).toBe(false)
  })
})

describe('lectura de disparadores', () => {
  it('distingue lista de ramas, todas las ramas y disparador ausente', () => {
    expect(triggerBranches('on:\n  push:\n    branches: [a, b]\n', 'push')).toEqual(['a', 'b'])
    expect(triggerBranches('on:\n  push:\n', 'push')).toBeNull()
    expect(triggerBranches('on:\n  push:\n', 'pull_request')).toBeUndefined()
  })
})
