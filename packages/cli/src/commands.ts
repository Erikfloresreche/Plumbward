import { confirm, isCancel, log, outro } from '@clack/prompts'
import { execa } from 'execa'
import pc from 'picocolors'
import {
  ApplyFailedError,
  CONFIG_FILE,
  applyPlan,
  isBlocked,
  rollbackLastApply,
  simulatePlan,
} from '@plumbward/core'
import type { ChangePlan, CommandRunner, Operation } from '@plumbward/core'
import { branchExists } from '@plumbward/scanner'
import type { GitState } from '@plumbward/scanner'
import { file, requiresIsolation } from '@plumbward/packs-sdk'
import type { Profile } from '@plumbward/packs-sdk'
import { CLI_VERSION, buildContext, buildRegistry, profileToYaml } from './context.js'
import { error, renderHealthChecks, renderPlan, renderScan, success, warn } from './render.js'
import { branchReturnNotice } from './branch-notice.js'

/**
 * Isolated branch where the changes are integrated. Work never happens directly
 * on a long-lived branch, whatever each team calls it.
 */
export const GOVERNANCE_BRANCH = 'chore/setup-ai-governance'

/** Real command runner, with the output visible to the user. */
const runner: CommandRunner = async (cmd, args, cwd) => {
  await execa(cmd, [...args], { cwd, stdio: 'inherit' })
}

/**
 * `scan` — read-only diagnosis.
 *
 * It needs no licence by design: it is the commercial hook. The report creates
 * the need the rest of the product solves.
 */
export async function runScan(cwd: string): Promise<number> {
  const { scan } = await buildContext(cwd)
  console.log(renderScan(scan))
  console.log(
    `\n${pc.dim('Run `plumbward plan` to see what would be configured, without touching anything.')}`,
  )
  return 0
}

/** Builds the plan adding the write of the profile, which belongs to no pack. */
async function buildFullPlan(cwd: string): Promise<{
  plan: ChangePlan
  cwd: string
  context: Awaited<ReturnType<typeof buildContext>>
}> {
  const context = await buildContext(cwd)
  const registry = buildRegistry()
  const plan = await registry.buildPlan(context.context)

  const configOperation: Operation = file(
    CONFIG_FILE,
    profileToYaml(context.context.profile),
    'Saves the governance profile as the versioned source of truth.',
    { managed: false },
  )

  const fullPlan: ChangePlan = {
    ...plan,
    operations: [configOperation, ...plan.operations],
  }

  return { plan: fullPlan, cwd, context }
}

/**
 * `plan` — shows the exact diff without writing anything.
 *
 * It is the operation that makes the tool safe: the user sees the result
 * before authorising it, and the client's security team can audit it.
 */
export async function runPlan(cwd: string, options: { diff: boolean }): Promise<number> {
  const { plan, context } = await buildFullPlan(cwd)

  console.log(renderScan(context.scan))

  const simulation = await simulatePlan(plan, {
    repoRoot: context.scan.repoRoot,
    version: CLI_VERSION,
  })

  console.log(renderPlan(plan, simulation, { showDiff: options.diff }))

  if (isBlocked(plan)) {
    console.log(`\n${error('The plan cannot be applied: there are blocking conflicts.')}`)
    return 1
  }

  console.log(
    `\n${pc.dim('Nothing has been modified. Run `plumbward apply` to apply this plan.')}`,
  )
  return 0
}

/**
 * Does the already existing isolated branch block this `apply`?
 *
 * If the work has to be isolated and the isolated branch already exists, **it
 * is not used**: it may be out of date, and the plan shown is computed on the
 * starting branch. It is checked **before** asking for confirmation, so as not
 * to ask about something that will not be done.
 */
async function isolatedBranchBlocks(
  repoRoot: string,
  git: Pick<GitState, 'branch' | 'detachedHead' | 'defaultBranch'>,
  createBranch: boolean,
  profile: Profile,
): Promise<boolean> {
  if (!createBranch || !requiresIsolation(git, profile)) return false
  if (!(await branchExists(repoRoot, GOVERNANCE_BRANCH))) return false

  console.log(`\n${error(`Branch "${GOVERNANCE_BRANCH}" already exists. Nothing has been written.`)}`)
  console.log(
    pc.dim(
      '  It may be out of date, and the plan was computed on the current branch. Options:\n' +
        `  · If it is your governance work in progress: git checkout ${GOVERNANCE_BRANCH} and run apply there.\n` +
        `  · If you already merged it: git branch -d ${GOVERNANCE_BRANCH} (it does not delete unmerged work) and run apply again.`,
    ),
  )
  return true
}

interface HeadSnapshot {
  /** `refs/heads/<branch>`, or `null` with a detached HEAD. */
  readonly ref: string | null
  /** Commit HEAD points at, or `null` in a repository with no commits. */
  readonly commit: string | null
}

async function readHead(repoRoot: string): Promise<HeadSnapshot> {
  const [ref, commit] = await Promise.all([
    execa('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: repoRoot, reject: false }),
    execa('git', ['rev-parse', '-q', '--verify', 'HEAD'], { cwd: repoRoot, reject: false }),
  ])
  return {
    ref: ref.exitCode === 0 ? ref.stdout.trim() : null,
    commit: commit.exitCode === 0 ? commit.stdout.trim() : null,
  }
}

/**
 * Prints, if needed, which branch the repository was left on and how to go back.
 *
 * The current branch is read now, not from the scan: in between, `apply` may
 * have created and checked out the isolated branch, which is exactly the case
 * to warn about.
 */
async function printBranchNotice(
  repoRoot: string,
  startedOnBranch: string | null,
  startedOnCommit: string | null,
  pendingRollback: boolean,
): Promise<void> {
  const notice = branchReturnNotice({
    currentBranch: branchNameOf(await readHead(repoRoot)),
    startedOnBranch,
    startedOnCommit,
    isolatedBranch: GOVERNANCE_BRANCH,
    pendingRollback,
  })
  for (const line of notice) console.log(pc.dim(`  ${line}`))
}

/**
 * Branch name of a HEAD, or `null` if it is detached.
 *
 * It comes from `symbolic-ref` unabbreviated on purpose: `rev-parse
 * --abbrev-ref HEAD` returns `heads/X` when a tag called `X` exists.
 */
function branchNameOf(head: HeadSnapshot): string | null {
  return head.ref === null ? null : head.ref.replace(/^refs\/heads\//, '')
}

/**
 * Has HEAD changed since the plan was computed?
 *
 * The confirmation can take a while, and meanwhile someone can switch branches
 * from another terminal, the IDE branch picker or a parallel agent. The plan and
 * the decision to isolate were computed on the scanned branch: applying them on
 * another one would write something nobody approved, maybe straight onto
 * `Prod`. If HEAD has moved, nothing is written.
 */
function headMoved(scanned: Pick<GitState, 'branch'>, before: HeadSnapshot, now: HeadSnapshot): boolean {
  const scannedRef = scanned.branch === null ? null : `refs/heads/${scanned.branch}`
  return now.ref !== scannedRef || now.ref !== before.ref || now.commit !== before.commit
}

/**
 * Prepares the isolated work branch, if needed.
 *
 * `requiresIsolation` decides which branches are isolated: all of them except
 * recognisable work branches, and always with a detached HEAD (ADR 0005). The
 * branch is created with `--no-track`: without it, with
 * `branch.autoSetupMerge=inherit` it would inherit the upstream of the starting
 * branch, and a `git push` with no arguments could send the work to `Prod`.
 */
async function prepareBranch(
  repoRoot: string,
  git: Pick<GitState, 'branch' | 'detachedHead' | 'defaultBranch'>,
  createBranch: boolean,
  profile: Profile,
): Promise<void> {
  if (!createBranch) return
  if (!requiresIsolation(git, profile)) {
    log.info(`Working on the current branch "${git.branch}".`)
    return
  }
  const origin = git.detachedHead ? 'a detached HEAD' : `branch "${git.branch}"`
  await execa('git', ['checkout', '--no-track', '-b', GOVERNANCE_BRANCH], { cwd: repoRoot })
  log.success(`Created and checked out branch "${GOVERNANCE_BRANCH}" from ${origin}, which was left untouched.`)
}

export interface ApplyOptions {
  readonly yes: boolean
  readonly install: boolean
  readonly branch: boolean
}

/** `apply` — materialises the plan with a journal, automatic rollback and an isolated branch. */
export async function runApply(cwd: string, options: ApplyOptions): Promise<number> {
  const { plan, context } = await buildFullPlan(cwd)
  const { scan } = context

  if (!scan.git.isRepo) {
    console.log(error('This directory is not a git repository.'))
    console.log(
      pc.dim('  Run `git init` first: the tool needs to be able to revert the changes.'),
    )
    return 1
  }

  const simulation = await simulatePlan(plan, {
    repoRoot: scan.repoRoot,
    version: CLI_VERSION,
  })
  console.log(renderPlan(plan, simulation, { showDiff: false }))

  if (isBlocked(plan)) {
    console.log(`\n${error('The plan cannot be applied: there are blocking conflicts.')}`)
    return 1
  }

  if (simulation.changes.length === 0 && simulation.sideEffects.length === 0) {
    console.log(`\n${success('The repository already complies. There is nothing to apply.')}`)
    return 0
  }

  if (scan.git.isDirty) {
    console.log(
      `\n${warn('You have uncommitted changes. Committing before continuing is recommended.')}`,
    )
  }

  if (await isolatedBranchBlocks(scan.repoRoot, scan.git, options.branch, context.context.profile)) {
    return 1
  }

  const headBefore = await readHead(scan.repoRoot)

  if (!options.yes) {
    const answer = await confirm({
      message: `Apply these changes${
        options.install ? ' and install the dependencies' : ''
      }?`,
      initialValue: true,
    })
    if (isCancel(answer) || !answer) {
      outro('Cancelled. Nothing has been modified.')
      return 0
    }
  }

  if (headMoved(scan.git, headBefore, await readHead(scan.repoRoot))) {
    console.log(`\n${error('The current branch or commit changed during the confirmation. Nothing has been written.')}`)
    console.log(pc.dim('  The plan was computed on the previous branch. Run apply again to see the plan for the current one.'))
    return 1
  }

  await prepareBranch(scan.repoRoot, scan.git, options.branch, context.context.profile)

  // After `prepareBranch`, not before: it is the place that is really written,
  // and the only one where `rollback` can restore without destroying work. The
  // commit goes with the branch: the name labels the place, the commit identifies it.
  const headWritten = await readHead(scan.repoRoot)
  const writtenOnBranch = branchNameOf(headWritten)

  try {
    const result = await applyPlan(plan, {
      repoRoot: scan.repoRoot,
      version: CLI_VERSION,
      writtenOnBranch,
      writtenOnCommit: headWritten.commit,
      startedOnBranch: scan.git.branch,
      runCommands: options.install,
      runner,
      onProgress: ({ operation, status, note }) => {
        if (status === 'skipped') return
        const path =
          operation.kind === 'execCommand'
            ? `${operation.cmd} ${operation.args.join(' ')}`
            : 'path' in operation
              ? operation.path
              : operation.kind
        log.step(`${pc.green('✓')} ${path}${note ? pc.dim(` (${note})`) : ''}`)
      },
    })

    console.log(
      `\n${success(
        `${result.applied} operations applied, ${result.skipped} skipped because they were already up to date.`,
      )}`,
    )
    console.log(pc.dim(`  Journal: ${result.journalPath}`))

    console.log(`\n${pc.bold('Next steps')}`)
    console.log('  1. Read GOVERNANCE.md: it explains to the team what was installed.')
    if (!options.install) {
      console.log('  2. Install the dependencies listed above.')
    }
    console.log(
      `  ${options.install ? '2' : '3'}. Review the diff with \`git diff\` and open a Pull Request.`,
    )
    // The promise also holds with a detached HEAD (F0-29): the commit identifies
    // the place and `rollback` compares the empty branch like any other.
    //
    // And it expires on commit: the previous step says to open a Pull Request,
    // and the commit moves the place `assertSameCommit` checks. Without the
    // condition, this step stops being true as soon as the one above is
    // followed, which is the same false promise F0-24 withdrew.
    const step = options.install ? '3' : '4'
    console.log(
      `  ${step}. If something does not fit and you have not committed yet: \`plumbward rollback\` leaves everything as it was.`,
    )
    console.log(
      pc.dim(
        '     Not after the commit: the journal photographed another commit and `rollback` refuses. Undo with git.',
      ),
    )

    return 0
  } catch (cause) {
    if (cause instanceof ApplyFailedError) {
      console.log(`\n${error(cause.message)}`)
      console.log(
        cause.rolledBack
          ? pc.dim('  The changes were reverted automatically: the files are as they were.')
          : pc.red('  WARNING: it could not revert completely. Run `plumbward rollback`.'),
      )
      // The files yes, the branch no: reverting does not undo the checkout. And
      // if it could not revert, the advice changes: recover first, then go back.
      await printBranchNotice(scan.repoRoot, scan.git.branch, headBefore.commit, !cause.rolledBack)
      return 1
    }
    throw cause
  }
}

/** `rollback` — undoes the last run from the journal. */
export async function runRollback(cwd: string): Promise<number> {
  const { scan } = await buildContext(cwd)

  try {
    // With `readHead`, the same source `apply` used to record the place.
    const headNow = await readHead(scan.repoRoot)
    const result = await rollbackLastApply(scan.repoRoot, {
      currentBranch: branchNameOf(headNow),
      currentCommit: headNow.commit,
    })
    console.log(
      success(
        `Reverted ${result.operationsReverted} operations (${result.restoredFiles} files restored).`,
      ),
    )
    console.log(pc.dim('  Check with `git status --porcelain` that the tree is clean.'))
    // The written commit is the starting one (see `Journal.writtenOnCommit`): it
    // is the one to name if the work started with a detached HEAD.
    await printBranchNotice(
      scan.repoRoot,
      result.journal.startedOnBranch,
      result.journal.writtenOnCommit,
      false,
    )
    return 0
  } catch (cause) {
    console.log(error(cause instanceof Error ? cause.message : String(cause)))
    return 1
  }
}

/** `doctor` — diagnoses the installed configuration and proposes fixes. */
export async function runDoctor(cwd: string): Promise<number> {
  const { context } = await buildContext(cwd)
  const registry = buildRegistry()
  const checks = await registry.runHealthChecks(context)

  if (checks.length === 0) {
    console.log(warn('No supported stack was recognised in this repository.'))
    return 1
  }

  console.log(renderHealthChecks(checks))
  return checks.every((check) => check.ok) ? 0 : 1
}
