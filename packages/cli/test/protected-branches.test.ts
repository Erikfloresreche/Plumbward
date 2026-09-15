import { afterEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runApply } from '../src/commands.js'

/**
 * End-to-end tests of the decision "do I write on this branch or create an
 * isolated one?", running the whole `runApply` on real git repositories.
 *
 * Each case asks the only thing that matters: **which branch the repository is
 * on after `apply`**. An earlier version checked that the branch commit did not
 * move, which was also true with the bug unfixed, because `apply` never
 * commits.
 */

const ISOLATED = 'refs/heads/chore/setup-ai-governance'
const created: string[] = []
// Git isolation (global configuration and GIT_* variables) lives in vitest.setup.ts.

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

/** Minimal Node repository on the given branch, with a commit unless told otherwise. */
async function createRepo(branch: string, options: { commit?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-protected-'))
  created.push(root)
  await writeFile(
    join(root, 'package.json'),
    '{"name":"client","version":"1.0.0","devDependencies":{"typescript":"^5.0.0"}}\n',
  )
  await git(root, 'init', '-b', branch)
  await git(root, 'config', 'user.email', 'test@example.com')
  await git(root, 'config', 'user.name', 'Test')
  if (options.commit ?? true) {
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'initial')
  }
  return root
}

/** Leaves `origin/HEAD` pointing at a branch, as after a `git clone`, with no network. */
async function simulateClone(root: string, defaultBranch: string): Promise<void> {
  await git(root, 'update-ref', `refs/remotes/origin/${defaultBranch}`, 'HEAD')
  await git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${defaultBranch}`)
}

/** Writes a partial `config.yml`, as a team would leave it by hand. */
async function writeConfig(root: string, yaml: string): Promise<void> {
  await mkdir(join(root, '.governance'), { recursive: true })
  await writeFile(join(root, '.governance/config.yml'), yaml)
}

async function apply(root: string, options: { branch?: boolean } = {}): Promise<number> {
  return runApply(root, { yes: true, install: false, branch: options.branch ?? true })
}

async function headRef(root: string): Promise<string> {
  const result = await execa('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: root, reject: false })
  return result.exitCode === 0 ? result.stdout.trim() : 'DETACHED'
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('apply never writes directly on a long-lived branch', () => {
  it('control case: a Prod branch with nothing odd', async () => {
    const root = await createRepo('Prod')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  it('a tag with the same name as the branch does not disable the protection', async () => {
    const root = await createRepo('Prod')
    await git(root, 'tag', 'Prod')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  it('with a detached HEAD it creates the isolated branch instead of working loose', async () => {
    const root = await createRepo('Prod')
    await git(root, 'checkout', '--detach')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  it('in a repository with no commits it protects the branch too', async () => {
    const root = await createRepo('Prod', { commit: false })
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  // Names that are on no list. Before, any unknown name was left unprotected;
  // now work happens directly only on recognisable work branches, and the
  // unknown falls on the safe side.
  for (const branch of ['pro', 'pre', 'live', 'release/prod', 'env/production', 'staging']) {
    it(`protects a branch called "${branch}" even though it is on no list`, async () => {
      const root = await createRepo(branch)
      await apply(root)
      expect(await headRef(root)).toBe(ISOLATED)
    })
  }
})

describe('apply does work where it should', () => {
  it('on a work branch it operates on it, without creating another one', async () => {
    const root = await createRepo('main')
    await git(root, 'checkout', '-b', 'feat/login')
    await apply(root)
    expect(await headRef(root)).toBe('refs/heads/feat/login')
  })

  it('--no-branch respects the user decision, even on a protected branch', async () => {
    const root = await createRepo('Prod')
    await apply(root, { branch: false })
    expect(await headRef(root)).toBe('refs/heads/Prod')
  })

  it('if the isolated branch already exists, it aborts without writing anything', async () => {
    // It may be out of date, and the plan was computed on the starting branch:
    // writing on it would apply something different from what was shown.
    const root = await createRepo('Prod')
    await apply(root)
    await git(root, 'add', '-A')
    await git(root, 'commit', '-m', 'governance')
    await git(root, 'checkout', 'Prod')
    // The journal of the first apply is still there, untracked on Prod: the
    // state before and after is compared, not against an empty tree.
    const before = await git(root, 'status', '--porcelain', '--untracked-files=all')
    const code = await apply(root)
    expect(code).toBe(1)
    expect(await headRef(root)).toBe('refs/heads/Prod')
    expect(await git(root, 'status', '--porcelain', '--untracked-files=all')).toBe(before)
  })

  it('on a branch created by an AI assistant it operates on it', async () => {
    const root = await createRepo('main')
    await git(root, 'checkout', '-b', 'claude/add-lint')
    await apply(root)
    expect(await headRef(root)).toBe('refs/heads/claude/add-lint')
  })
})

describe('the generated profile does not guess what cannot be inferred', () => {
  it('in git-flow, integration is the default branch and the deploy one stays unconfigured', async () => {
    const root = await createRepo('main')
    await git(root, 'branch', 'develop')
    await git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    await simulateClone(root, 'develop')
    await apply(root)
    const config = await readFile(join(root, '.governance/config.yml'), 'utf8')
    expect(config).toMatch(/^\s+integration: develop$/m)
    // Where deploys come from is never inferred: it is configured by hand.
    expect(config).toMatch(/^\s+release: null$/m)
  })

  it('with no deploy branch configured, the production workflow is not generated', async () => {
    const root = await createRepo('feat/deploy')
    await writeConfig(root, 'deployTarget: vercel\n')
    await apply(root)
    expect(existsSync(join(root, '.github/workflows/ci-prod.yml'))).toBe(false)
  })

  it('with the deploy branch configured, it deploys from that one and only that one', async () => {
    const root = await createRepo('feat/deploy')
    await writeConfig(root, 'deployTarget: vercel\nbranches:\n  release: Prod\n')
    await apply(root)
    const workflow = await readFile(join(root, '.github/workflows/ci-prod.yml'), 'utf8')
    expect(workflow).toMatch(/branches: \[Prod\]/)
  })

  it('an old config.yml with "main" does not turn that branch into the deploy branch', async () => {
    // `main` was a value guessed by earlier versions. Translating it to
    // `release` would deploy from a branch nobody chose.
    const root = await createRepo('feat/legacy')
    await writeConfig(root, 'deployTarget: vercel\nbranches:\n  main: Prod\n  dev: develop\n')
    await apply(root)
    expect(existsSync(join(root, '.github/workflows/ci-prod.yml'))).toBe(false)
    // `dev` is translated, to `integration`. The team's config.yml is not
    // rewritten —it is their source of truth—, so it is checked by its effect:
    // the generated CI runs on push to that branch.
    const workflow = await readFile(join(root, '.github/workflows/ci-dev.yml'), 'utf8')
    expect(workflow).toMatch(/push:\s*\n\s+branches: \[develop\]/)
  })

  it('the same config.yml generates the same CI, whatever refs the repo has', async () => {
    // Invariant: the CLI is a deterministic function of its configuration. An
    // earlier version put the existing remote branches in the workflow, and
    // the stale refs of each copy changed the result.
    const config = 'branches:\n  integration: main\n  release: Prod\n'
    const clean = await createRepo('feat/a')
    await writeConfig(clean, config)
    const noisy = await createRepo('feat/a')
    await writeConfig(noisy, config)
    for (const ref of ['dev', 'staging', 'develop']) {
      await git(noisy, 'update-ref', `refs/remotes/origin/${ref}`, 'HEAD')
    }
    await apply(clean)
    await apply(noisy)
    const cleanWorkflow = await readFile(join(clean, '.github/workflows/ci-dev.yml'), 'utf8')
    const noisyWorkflow = await readFile(join(noisy, '.github/workflows/ci-dev.yml'), 'utf8')
    expect(noisyWorkflow).toBe(cleanWorkflow)
    expect(cleanWorkflow).toMatch(/push:\s*\n\s+branches: \[main, Prod\]/)
  })

  it('a config.yml without integration is not filled in with the origin/HEAD of each clone', async () => {
    // Invariant 2 the other way round: with the file, what it does not declare
    // stays unconfigured. It used to be filled in with each copy's local origin/HEAD.
    const config = 'deployTarget: vercel\nbranches:\n  release: main\n'
    const first = await createRepo('feat/a')
    await writeConfig(first, config)
    await simulateClone(first, 'main')
    const second = await createRepo('feat/a')
    await writeConfig(second, config)
    await simulateClone(second, 'develop')
    await apply(first)
    await apply(second)
    const firstWorkflow = await readFile(join(first, '.github/workflows/ci-dev.yml'), 'utf8')
    expect(await readFile(join(second, '.github/workflows/ci-dev.yml'), 'utf8')).toBe(firstWorkflow)
  })

  it('in a repo created with git init and push, with no origin/HEAD, the CI runs on the main branch', async () => {
    const root = await createRepo('main')
    await apply(root)
    const workflow = await readFile(join(root, '.github/workflows/ci-dev.yml'), 'utf8')
    expect(workflow).toMatch(/push:\s*\n\s+branches: \[main\]/)
  })

  it('proposes the existing main even when the first apply runs from a work branch', async () => {
    const root = await createRepo('main')
    await git(root, 'checkout', '-b', 'feat/first')
    await apply(root)
    const config = await readFile(join(root, '.governance/config.yml'), 'utf8')
    expect(config).toMatch(/^\s+integration: main$/m)
  })

  it('with no branches configured, the CI only reviews Pull Requests and declares no push', async () => {
    const root = await createRepo('feat/nothing')
    await writeConfig(root, 'branches: {}\n')
    await apply(root)
    const workflow = await readFile(join(root, '.github/workflows/ci-dev.yml'), 'utf8')
    expect(workflow).not.toMatch(/^ {2}push:/m)
  })

  it('a branch configured as integration is protected even if it looks like a work branch', async () => {
    const root = await createRepo('main')
    await git(root, 'checkout', '-b', 'feat/integration')
    await writeConfig(root, 'branches:\n  integration: feat/integration\n')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  it('the isolated branch does not inherit the upstream of the starting branch', async () => {
    // With branch.autoSetupMerge=inherit, a normal checkout -b would copy the
    // upstream of Prod, and a git push with no arguments would go to production.
    const root = await createRepo('Prod')
    await git(root, 'update-ref', 'refs/remotes/origin/Prod', 'HEAD')
    await git(root, 'config', 'remote.origin.url', 'https://example.invalid/repo.git')
    await git(root, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*')
    await git(root, 'branch', '--set-upstream-to=origin/Prod', 'Prod')
    await git(root, 'config', 'branch.autoSetupMerge', 'inherit')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
    const upstream = await execa('git', ['rev-parse', '--abbrev-ref', 'chore/setup-ai-governance@{u}'], { cwd: root, reject: false })
    expect(upstream.exitCode).not.toBe(0)
  })

  it('the configured staging branch generates its workflow and triggers on it', async () => {
    const root = await createRepo('feat/staging')
    await writeConfig(root, 'branches:\n  staging: pre\n')
    await apply(root)
    const workflow = await readFile(join(root, '.github/workflows/ci-staging.yml'), 'utf8')
    expect(workflow).toMatch(/branches: \[pre\]/)
  })

  it('an empty deploy branch counts as not configured', async () => {
    const root = await createRepo('feat/empty')
    await writeConfig(root, 'deployTarget: vercel\nbranches:\n  release: ""\n')
    await apply(root)
    expect(existsSync(join(root, '.github/workflows/ci-prod.yml'))).toBe(false)
  })

  it('in an old config, a null dev does not cancel a main that did have a value', async () => {
    const root = await createRepo('feat/legacy-null')
    await writeConfig(root, 'branches:\n  main: live\n  dev: null\n')
    await apply(root)
    const workflow = await readFile(join(root, '.github/workflows/ci-dev.yml'), 'utf8')
    expect(workflow).toMatch(/push:\s*\n\s+branches: \[live\]/)
  })

  it('the generated CI reviews every Pull Request, whatever branch it targets', async () => {
    // It used to trigger only on the branches the profile believed were main;
    // in a repo with `main` (where PRs go) and `Prod` (deploy), PRs to `main`
    // were left unreviewed.
    const root = await createRepo('main')
    await git(root, 'branch', 'Prod')
    await simulateClone(root, 'main')
    await git(root, 'checkout', '-b', 'feat/ci')
    await apply(root)
    const workflow = await readFile(join(root, '.github/workflows/ci-dev.yml'), 'utf8')
    expect(workflow).toMatch(/^ {2}pull_request:\s*$/m)
    expect(workflow).not.toMatch(/pull_request:\s*\n\s+branches:/)
  })
})
