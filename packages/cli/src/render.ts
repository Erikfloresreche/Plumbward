import pc from 'picocolors'
import type { ChangePlan, SimulationResult } from '@plumbward/core'
import { synthesiseInstallCommands } from '@plumbward/core'
import type { RepoScan } from '@plumbward/scanner'
import type { HealthCheck } from '@plumbward/packs-sdk'
import { collapseContext, lineDiff } from './diff.js'

const BULLET = '·'

export function title(text: string): string {
  return `\n${pc.bold(pc.cyan(text))}\n${pc.dim('─'.repeat(Math.min(text.length, 60)))}`
}

export function section(text: string): string {
  return `\n${pc.bold(text)}`
}

export function dim(text: string): string {
  return pc.dim(text)
}

/** Text progress bar, for the maturity score. */
function bar(score: number, width = 24): string {
  const filled = Math.round((score / 100) * width)
  const colour = score >= 70 ? pc.green : score >= 40 ? pc.yellow : pc.red
  return colour('█'.repeat(filled)) + pc.dim('░'.repeat(width - filled))
}

const MODE_LABELS: Record<RepoScan['sloc']['mode'], string> = {
  greenfield: 'Greenfield · full strict configuration',
  ratchet: 'Ratchet · strict rules only on new code',
  'non-disruptive': 'Non-disruptive · only new PRs are audited',
}

export function renderScan(scan: RepoScan): string {
  const lines: string[] = []

  lines.push(title('Repository diagnosis'))

  const stack = scan.primaryStack
  lines.push(
    `${BULLET} Stack        ${stack ? pc.bold(stack.name) : pc.yellow('undetermined')}`,
  )
  if (stack?.frameworks.length) {
    lines.push(`${BULLET} Frameworks   ${stack.frameworks.join(', ')}`)
  }
  if (stack?.packageManager) {
    lines.push(`${BULLET} Manager      ${stack.packageManager}`)
  }
  lines.push(
    `${BULLET} Size         ${pc.bold(scan.sloc.total.toLocaleString('en-US'))} lines ${pc.dim(
      `(${scan.sloc.filesScanned} files)`,
    )}`,
  )
  lines.push(`${BULLET} Mode         ${pc.bold(MODE_LABELS[scan.sloc.mode])}`)
  if (scan.isMonorepo) {
    lines.push(`${BULLET} Monorepo     ${pc.yellow('yes')} ${pc.dim('(forces the non-disruptive mode)')}`)
  }

  lines.push(section('Git status'))
  if (!scan.git.isRepo) {
    lines.push(
      `  ${pc.yellow('Not a git repository.')} ${pc.dim('Run `git init` before applying changes.')}`,
    )
  } else {
    lines.push(`  Current branch  ${scan.git.branch ?? '—'}`)
    lines.push(
      `  Uncommitted changes  ${scan.git.isDirty ? pc.yellow('yes') : pc.green('no')}`,
    )
    lines.push(`  Repo fingerprint  ${pc.dim(scan.git.fingerprint ?? '—')}`)
  }

  if (scan.sloc.byLanguage.length > 0) {
    lines.push(section('Languages'))
    for (const language of scan.sloc.byLanguage.slice(0, 6)) {
      const share = scan.sloc.total === 0 ? 0 : Math.round((language.sloc / scan.sloc.total) * 100)
      lines.push(
        `  ${language.language.padEnd(12)} ${String(language.sloc).padStart(8)} lines ${pc.dim(
          `${share}%`,
        )}`,
      )
    }
  }

  lines.push(section('DevSecOps maturity'))
  lines.push(`  ${bar(scan.maturity.score)}  ${pc.bold(`${scan.maturity.score}/100`)}`)
  lines.push('')

  for (const signal of scan.maturity.signals) {
    const mark = signal.present ? pc.green('✓') : pc.red('✗')
    lines.push(`  ${mark} ${signal.label}`)
  }

  if (scan.maturity.missing.length > 0) {
    lines.push(section('What you need most'))
    for (const signal of scan.maturity.missing.slice(0, 4)) {
      lines.push(`  ${pc.yellow('→')} ${pc.bold(signal.label)}`)
      lines.push(`    ${pc.dim(signal.hint)}`)
    }
  }

  return lines.join('\n')
}

/** Renders the plan: first the summary, then the detail and the optional diff. */
export function renderPlan(
  plan: ChangePlan,
  simulation: SimulationResult,
  options: { showDiff: boolean },
): string {
  const lines: string[] = []

  lines.push(title('Change plan'))

  if (plan.operations.length === 0) {
    lines.push(pc.green('  Nothing to do: the repository already complies.'))
    return lines.join('\n')
  }

  lines.push(
    `  ${pc.green(`${simulation.changes.filter((change) => change.before === null).length} new files`)}` +
      `  ${pc.yellow(`${simulation.changes.filter((change) => change.before !== null).length} modified`)}` +
      `  ${pc.dim(`${simulation.noOps.length} already up to date`)}`,
  )
  lines.push(
    `  ${plan.summary.dependencies} dependencies  ${BULLET}  ${
      synthesiseInstallCommands(plan.operations).length + plan.summary.commands
    } commands`,
  )
  lines.push(`  ${pc.dim(`Packs: ${plan.contributors.join(', ')}`)}`)

  if (plan.conflicts.length > 0) {
    lines.push(section('Conflicts'))
    for (const conflict of plan.conflicts) {
      const marker = conflict.severity === 'block' ? pc.red('BLOCKS') : pc.yellow('WARNING')
      lines.push(`  ${marker} ${conflict.path}`)
      lines.push(`    ${pc.dim(conflict.reason)}`)
    }
  }

  lines.push(section('Files'))
  for (const change of simulation.changes) {
    const label = change.before === null ? pc.green('create') : pc.yellow('edit  ')
    lines.push(`  ${label} ${pc.bold(change.path)}`)
    for (const reason of change.reasons) {
      lines.push(`         ${pc.dim(reason)}`)
    }
  }

  if (simulation.sideEffects.length > 0) {
    lines.push(section('Dependencies and commands'))
    const installs = synthesiseInstallCommands(plan.operations)
    for (const operation of simulation.sideEffects) {
      if (operation.kind === 'addDependency') continue
      lines.push(`  ${pc.magenta('run   ')} ${operation.cmd} ${operation.args.join(' ')}`)
      lines.push(`         ${pc.dim(operation.reason)}`)
    }
    for (const install of installs) {
      lines.push(`  ${pc.magenta('run   ')} ${install.cmd} ${install.args.join(' ')}`)
      lines.push(`         ${pc.dim(install.reason)}`)
    }
  }

  if (options.showDiff) {
    lines.push(section('Diff'))
    for (const change of simulation.changes) {
      lines.push(`\n${pc.bold(pc.underline(change.path))}`)
      if (change.before === null) {
        const preview = change.after.split('\n').slice(0, 14)
        for (const line of preview) lines.push(pc.green(`  + ${line}`))
        const remaining = change.after.split('\n').length - preview.length
        if (remaining > 0) lines.push(pc.dim(`  ... ${remaining} more lines`))
        continue
      }
      for (const line of collapseContext(lineDiff(change.before, change.after))) {
        if (line.kind === 'added') lines.push(pc.green(`  + ${line.text}`))
        else if (line.kind === 'removed') lines.push(pc.red(`  - ${line.text}`))
        else lines.push(pc.dim(`    ${line.text}`))
      }
    }
  } else {
    lines.push(`\n${pc.dim('Use `--diff` to see the exact content of each change.')}`)
  }

  return lines.join('\n')
}

export function renderHealthChecks(checks: readonly HealthCheck[]): string {
  const lines: string[] = [title('Configuration diagnosis')]

  for (const check of checks) {
    const mark = check.ok ? pc.green('✓') : pc.red('✗')
    lines.push(`  ${mark} ${check.label}`)
    lines.push(`    ${pc.dim(check.detail)}`)
    if (!check.ok && check.fixHint) {
      lines.push(`    ${pc.cyan('→')} ${check.fixHint}`)
    }
  }

  const failing = checks.filter((check) => !check.ok).length
  lines.push(
    failing === 0
      ? `\n${pc.green('All good.')}`
      : `\n${pc.yellow(`${failing} check(s) not passing.`)}`,
  )

  return lines.join('\n')
}

export function error(message: string): string {
  return `${pc.red('✗')} ${message}`
}

export function success(message: string): string {
  return `${pc.green('✓')} ${message}`
}

export function warn(message: string): string {
  return `${pc.yellow('!')} ${message}`
}
