#!/usr/bin/env node
/**
 * Mutation tests of the protected-branch logic.
 *
 * Each mutation undoes, on purpose, one specific piece of the logic —almost all
 * of them are real failures the reviews of F0-14 found— and checks that some
 * test fails. If a mutation survives, that piece is not covered.
 *
 * It exists so that "N mutations detected" is something anyone can reproduce,
 * not a claim in a PR. Since F0-27 `.github/workflows/mutations.yml` runs it,
 * only on the PRs that touch what it mutates; it is slow, so it is not in
 * `ci.yml`. By hand:
 *
 *     pnpm check:mutations
 *
 * Before mutating anything it checks that the suite passes dry: an environment
 * that cannot run the tests would give "all detected" without testing anything.
 *
 * Everything runs with a hostile git configuration —commit signing with a gpg
 * that always fails, in the global configuration and also injected through
 * `GIT_CONFIG_COUNT`—, so the tests also prove their isolation. It restores
 * every file even if interrupted.
 *
 * With an argument, it only runs the mutations whose name contains it:
 *
 *     pnpm check:mutations HEAD
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isFailure, label, mutationOutcome } from './mutation-outcome.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = [
  'packages/packs-sdk/src/branches.test.ts',
  'packages/scanner/test/default-branch.test.ts',
  'packages/cli/test/protected-branches.test.ts',
  'packages/cli/test/head-moved.test.ts',
  'packages/packs/node-ts/src/validate.test.ts',
  'packages/cli/test/e2e.test.ts',
]

const BR = 'packages/packs-sdk/src/branches.ts'
const CT = 'packages/packs-sdk/src/contract.ts'
const GT = 'packages/scanner/src/git.ts'
const CM = 'packages/cli/src/commands.ts'
const CX = 'packages/cli/src/context.ts'
const PK = 'packages/packs/node-ts/src/index.ts'
const CI = 'packages/packs/node-ts/src/templates/ci.ts'
const WF = 'packages/packs/node-ts/src/workflow-checks.ts'
const VS = 'vitest.setup.ts'

/** [description, file, original text, mutated text, optional extra replacement] */
const MUTATIONS = [
  ['Always isolate, on work branches too', BR, '  if (head.detachedHead) return true\n', '  return true\n'],
  ['Do not isolate with a detached HEAD', BR, '  if (head.detachedHead) return true\n', ''],
  ['Protect only what is configured, with no inversion', BR, '  return !isWorkBranch(head.branch)\n', '  return false\n'],
  ['Ignore the branches configured in the profile', BR, '  if (configuredBranches(profile, head.defaultBranch).has(head.branch.toLowerCase())) return true\n', ''],
  ['Compare configured branches case-sensitively', BR, '      .map((name) => name.toLowerCase()),\n', ''],
  ['Case-sensitive work prefixes', BR, 'branch.slice(0, slash).toLowerCase()', 'branch.slice(0, slash)'],
  ['Remove the AI assistant prefixes', BR, "  'claude',\n", ''],
  ['Ignore --no-branch', CM, '  if (!createBranch) return\n', ''],
  ['Write on the existing isolated branch', CM, '  if (!(await branchExists(repoRoot, GOVERNANCE_BRANCH))) return false\n', '  return false\n'],
  ['Create the isolated branch inheriting the upstream', CM, "['checkout', '--no-track', '-b', GOVERNANCE_BRANCH]", "['checkout', '-b', GOVERNANCE_BRANCH]"],
  ['Apply without consulting the profile', CM, '  if (!requiresIsolation(git, profile)) {', '  if (!requiresIsolation(git, { branches: { integration: null, release: null, staging: null } })) {'],
  ['Read the abbreviated branch (heads/X)', GT, "git(repoRoot, ['symbolic-ref', '-q', 'HEAD'])", "git(repoRoot, ['symbolic-ref', '-q', 'HEAD']).then((r) => r?.replace('refs/heads/', 'refs/heads/heads/'))"],
  ['Guess the deploy branch again', CT, '      release: null,\n', '      release: scan.git.defaultBranch,\n'],
  ['No integration fallback (git init + push)', CT, "  if (scan.git.branch && !isWorkBranch(scan.git.branch)) return scan.git.branch\n  return scan.git.branches.find((name) => name === 'main' || name === 'master') ?? null", '  return null'],
  ['No fallback to an existing main', CT, "  return scan.git.branches.find((name) => name === 'main' || name === 'master') ?? null", '  return null'],
  ['Translate the old main to release', CX, "    release: text(source['release']),\n", "    release: text(source['release']) ?? text(source['main']),\n"],
  ['Do not read the old main', CX, "    integration: text(source['integration']) ?? text(source['dev']) ?? text(source['main']),\n", "    integration: text(source['integration']) ?? text(source['dev']),\n"],
  ['Accept an empty branch as configured', CX, "typeof value === 'string' && value.trim() !== ''", "typeof value === 'string'"],
  ['Fill in the config with the local origin/HEAD', CX, '      branches: normaliseBranches(fromFile.branches),\n', '      branches: Object.fromEntries(Object.entries(normaliseBranches(fromFile.branches)).map(([k, v]) => [k, v ?? base.branches[k]])),\n'],
  ['Filter PRs by branch again', CI, 'on:\n  pull_request:\n$', 'on:\n  pull_request:\n    branches: [main]\n$'],
  ['Declare push even with no branches', CI, "${pushBranches.length > 0 ? `  push:\n    branches: [${pushBranches.join(', ')}]\n` : ''}", "  push:\n    branches: [${pushBranches.join(', ')}]\n"],
  ['Staging with a literal name', CI, "  const staging = profile.branches.staging ?? 'staging'", "  const staging = 'staging'"],
  ['Push CI without wiring the profile', PK, '          ciPushBranches(profile),', '          ciPushBranches({ branches: { integration: null, release: null, staging: null } }),'],
  ['Deploy with no configured branch', PK, "if (profile.deployTarget !== 'none' && release !== null) {", "if (profile.deployTarget !== 'none') {", ['ciProdWorkflow(manager, release)', "ciProdWorkflow(manager, release ?? 'main')"]],
  ['doctor ignores an existing ci-prod.yml', WF, "  if (deployTarget === 'none' && prodText === undefined) return undefined\n", "  if (deployTarget === 'none') return undefined\n"],
  ['doctor does not compare the branch of ci-prod.yml', WF, '  if (deploysFrom.length !== 1 || deploysFrom[0] !== release) {', '  if (false) {'],
  ['doctor accepts filtered PRs', WF, '  if (filter === null) return { ...base, ok: true', '  if (filter !== undefined) return { ...base, ok: true'],
  ['Inherit the GIT_* variables of the environment', VS, "  if (name.startsWith('GIT_')) delete process.env[name]\n", ''],
  ['Apply even if HEAD changes during the confirmation', CM, '  if (headMoved(scan.git, headBefore, await readHead(scan.repoRoot))) {', '  if (false) {'],
  ['Compare only the branch, not the commit', CM, ' || now.commit !== before.commit', ''],
]

const hostile = join(mkdtempSync(join(tmpdir(), 'plumbward-hostile-')), 'gitconfig')
writeFileSync(hostile, '[commit]\n\tgpgsign = true\n[tag]\n\tgpgSign = true\n[gpg]\n\tprogram = false\n')

const testEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: hostile,
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'commit.gpgsign',
  GIT_CONFIG_VALUE_0: 'true',
  GIT_CONFIG_KEY_1: 'gpg.program',
  GIT_CONFIG_VALUE_1: 'false',
}

const runTests = () =>
  spawnSync('pnpm', ['vitest', 'run', ...TESTS], {
    cwd: root,
    encoding: 'utf8',
    env: testEnv,
    timeout: 300_000,
  })

// Dry start: the suite has to pass WITHOUT mutating anything. Without this, an
// environment that cannot run the tests gave "all detected" and green, which is
// the most dangerous verdict possible: it says everything is covered precisely
// when nothing has been checked.
const dryRun = runTests()
if (dryRun.status !== 0) {
  console.error(
    dryRun.error || dryRun.status === null
      ? `  NOT RUN       the suite could not run without mutating: ${dryRun.error?.message ?? 'timeout'}`
      : '  RED AT BASE   the suite fails without mutating anything. Fix the tests before measuring mutations.',
  )
  process.exit(1)
}

let restoring = null
process.on('SIGINT', () => {
  if (restoring) writeFileSync(restoring.path, restoring.content)
  process.exit(130)
})

let survivors = 0
const only = process.argv[2]
const selected = only ? MUTATIONS.filter(([name]) => name.includes(only)) : MUTATIONS
for (const [name, file, from, to, extra] of selected) {
  const path = join(root, file)
  const original = readFileSync(path, 'utf8')
  const count = original.split(from).length - 1
  if (count !== 1) {
    console.error(`  STALE ANCHOR  ${name} (${file}: ${count} occurrences). Update the list.`)
    survivors++
    continue
  }
  let mutated = original.replace(from, to)
  if (extra) mutated = mutated.replace(extra[0], extra[1])
  restoring = { path, content: original }
  writeFileSync(path, mutated)
  try {
    const outcome = mutationOutcome(runTests())
    if (isFailure(outcome)) survivors++
    console.log(`  ${label(outcome)}  ${name}`)
  } finally {
    writeFileSync(path, original)
    restoring = null
  }
}

console.log(`\n${selected.length - survivors} of ${selected.length} mutations detected.`)
process.exit(survivors === 0 ? 0 : 1)
