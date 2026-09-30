import { cac } from 'cac'
import { resolve } from 'node:path'
import pc from 'picocolors'
import { CLI_VERSION } from './context.js'
import { runApply, runDoctor, runPlan, runRollback, runScan } from './commands.js'
import { error } from './render.js'

const cli = cac('plumbward')

function target(dir: string | undefined): string {
  return resolve(dir ?? process.cwd())
}

/** Wraps a command to turn any exception into a readable message. */
async function guard(action: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await action()
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    console.error(`\n${error(detail)}`)
    if (process.env['PLUMBWARD_DEBUG'] === '1' && cause instanceof Error) {
      console.error(pc.dim(cause.stack ?? ''))
    } else {
      console.error(pc.dim('  Run it again with PLUMBWARD_DEBUG=1 to see the stack trace.'))
    }
    process.exitCode = 1
  }
}

cli
  .command('scan [dir]', 'Analyses the repository and scores its DevSecOps maturity (writes nothing)')
  .action((dir?: string) => guard(() => runScan(target(dir))))

cli
  .command('plan [dir]', 'Shows exactly what would change, without touching the repository')
  .option('--diff', 'Includes the full content of each change')
  .action((dir: string | undefined, options: { diff?: boolean }) =>
    guard(() => runPlan(target(dir), { diff: options.diff ?? false })),
  )

cli
  .command('apply [dir]', 'Applies the plan on an isolated branch, with journal and rollback')
  .option('--yes', 'Does not ask for confirmation (for CI and scripts)')
  .option('--no-install', 'Does not install dependencies, only writes files')
  .option('--no-branch', 'Works on the current branch instead of creating a dedicated one')
  .action((dir: string | undefined, options: { yes?: boolean; install?: boolean; branch?: boolean }) =>
    guard(() =>
      runApply(target(dir), {
        yes: options.yes ?? false,
        install: options.install ?? true,
        branch: options.branch ?? true,
      }),
    ),
  )

cli
  .command('rollback [dir]', 'Undoes the last run and leaves the repository as it was')
  .action((dir?: string) => guard(() => runRollback(target(dir))))

cli
  .command('doctor [dir]', 'Checks that the installed configuration is still healthy')
  .action((dir?: string) => guard(() => runDoctor(target(dir))))

cli.help()
cli.version(CLI_VERSION)

// No subcommand: show the help instead of failing in silence.
if (process.argv.length <= 2) {
  cli.outputHelp()
} else {
  cli.parse()
}
