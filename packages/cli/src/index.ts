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

/** Envuelve un comando para convertir cualquier excepción en un mensaje legible. */
async function guard(action: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await action()
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    console.error(`\n${error(detail)}`)
    if (process.env['PLUMBWARD_DEBUG'] === '1' && cause instanceof Error) {
      console.error(pc.dim(cause.stack ?? ''))
    } else {
      console.error(pc.dim('  Vuelve a ejecutarlo con PLUMBWARD_DEBUG=1 para ver la traza.'))
    }
    process.exitCode = 1
  }
}

cli
  .command('scan [dir]', 'Analiza el repositorio y puntúa su madurez DevSecOps (no escribe nada)')
  .action((dir?: string) => guard(() => runScan(target(dir))))

cli
  .command('plan [dir]', 'Muestra exactamente qué se cambiaría, sin tocar el repositorio')
  .option('--diff', 'Incluye el contenido completo de cada cambio')
  .action((dir: string | undefined, options: { diff?: boolean }) =>
    guard(() => runPlan(target(dir), { diff: options.diff ?? false })),
  )

cli
  .command('apply [dir]', 'Aplica el plan en una rama aislada, con journal y rollback')
  .option('--yes', 'No pide confirmación (para uso en CI y scripts)')
  .option('--no-install', 'No instala dependencias, sólo escribe ficheros')
  .option('--no-branch', 'Trabaja sobre la rama actual en lugar de crear una dedicada')
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
  .command('rollback [dir]', 'Deshace la última ejecución y deja el repositorio como estaba')
  .action((dir?: string) => guard(() => runRollback(target(dir))))

cli
  .command('doctor [dir]', 'Comprueba que la configuración instalada sigue sana')
  .action((dir?: string) => guard(() => runDoctor(target(dir))))

cli.help()
cli.version(CLI_VERSION)

// Sin subcomando: se muestra la ayuda en lugar de fallar en silencio.
if (process.argv.length <= 2) {
  cli.outputHelp()
} else {
  cli.parse()
}
