import { afterEach, describe, expect, it, vi } from 'vitest'
import { execa } from 'execa'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runApply, runRollback, GOVERNANCE_BRANCH } from '../src/commands.js'

/**
 * Punto 2 de F0-24: tras un fallo de `apply`, la reversión automática decía
 * "el repositorio está intacto" mientras dejaba HEAD en la rama aislada.
 *
 * Los ficheros sí quedan intactos; la rama no. Quien lea ese mensaje se cree en
 * su rama y sigue trabajando en `chore/setup-ai-governance`, que además queda
 * creada y bloquea el siguiente `apply` (`isolatedBranchBlocks`).
 *
 * El fallo se provoca con un `.github` de sólo lectura: `apply` escribe varios
 * ficheros y revienta con EACCES al llegar al workflow.
 */

const created: string[] = []
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

/** Repositorio Node mínimo en `Prod`, con un commit. */
async function createRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  created.push(root)
  await writeFile(
    join(root, 'package.json'),
    '{"name":"client","version":"1.0.0","devDependencies":{"typescript":"^5.0.0"}}\n',
  )
  await git(root, 'init', '-b', 'Prod')
  await git(root, 'config', 'user.email', 'test@example.com')
  await git(root, 'config', 'user.name', 'Test')
  await git(root, 'add', '.')
  await git(root, 'commit', '-m', 'initial')
  return root
}

/** Deja `.github` sin permiso de escritura: `apply` fallará con EACCES. */
async function blockGithubDir(root: string): Promise<void> {
  await mkdir(join(root, '.github'))
  await chmod(join(root, '.github'), 0o555)
}

/** Todo lo que la CLI ha impreso, sin colores. */
function captureOutput(): () => string {
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  return () => {
    spy.mockRestore()
    return lines.join('\n').replace(ANSI, '')
  }
}

async function currentBranch(root: string): Promise<string> {
  const ref = await git(root, 'symbolic-ref', '-q', 'HEAD')
  return ref.replace(/^refs\/heads\//, '')
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of created.splice(0)) {
    await chmod(join(root, '.github'), 0o755).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

describe('avisos de rama tras apply fallido y tras rollback', () => {
  it('no afirma que el repositorio está intacto cuando la rama ha cambiado', async () => {
    const root = await createRepo('plumbward-notice-')
    await blockGithubDir(root)
    const output = captureOutput()

    const exitCode = await runApply(root, { yes: true, install: false, branch: true })
    const printed = output()

    expect(exitCode).toBe(1)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    // La rama ha cambiado: decir sólo "el repositorio está intacto" es falso.
    expect(printed).not.toMatch(/el repositorio está intacto\.?\s*$/m)
    expect(printed).toContain(GOVERNANCE_BRANCH)
    expect(printed).toContain('git checkout Prod')
  })

  it('tras rollback dice cómo volver a la rama de partida, por su nombre', async () => {
    const root = await createRepo('plumbward-notice-ok-')

    expect(await runApply(root, { yes: true, install: false, branch: true })).toBe(0)

    const output = captureOutput()
    expect(await runRollback(root)).toBe(0)
    const printed = output()

    // `git checkout -` depende de cuál fuera el ref anterior; el journal sabe el nombre.
    expect(printed).toContain('git checkout Prod')
  })
})
