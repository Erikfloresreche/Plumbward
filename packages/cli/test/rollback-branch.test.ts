import { afterEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runApply, runRollback, GOVERNANCE_BRANCH } from '../src/commands.js'

/**
 * Punto 1 de F0-24: `rollback` sobrescribe ficheros de la rama de partida con
 * un journal de un `apply` que escribió en la rama aislada.
 *
 * El journal guarda la rama de partida en lugar de la rama escrita, está
 * ignorado por git —`.governance/journal.json` entra en el `.gitignore` que
 * instala el pack— y por eso sobrevive a los checkouts. La consecuencia es
 * pérdida de datos: `rollback` en `Prod` devuelve el `package.json` de `Prod` a
 * la versión que tenía cuando se lanzó `apply`.
 *
 * Cada caso comprueba el contenido del fichero después de `rollback`, no sólo
 * el código de salida: el fallo es que se escribe, no que se informe mal.
 */

const created: string[] = []

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

function manifest(version: string): string {
  return `{"name":"client","version":"${version}","devDependencies":{"typescript":"^5.0.0"}}\n`
}

/** Repositorio Node mínimo en la rama indicada, con un commit inicial. */
async function createRepo(branch: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-rollback-'))
  created.push(root)
  await writeFile(join(root, 'package.json'), manifest('1.0.0'))
  await git(root, 'init', '-b', branch)
  await git(root, 'config', 'user.email', 'test@example.com')
  await git(root, 'config', 'user.name', 'Test')
  await git(root, 'add', '.')
  await git(root, 'commit', '-m', 'initial')
  return root
}

async function apply(root: string): Promise<number> {
  return runApply(root, { yes: true, install: false, branch: true })
}

async function readManifest(root: string): Promise<string> {
  return readFile(join(root, 'package.json'), 'utf8')
}

async function currentBranch(root: string): Promise<string> {
  const ref = await git(root, 'symbolic-ref', '-q', 'HEAD')
  return ref.replace(/^refs\/heads\//, '')
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('rollback fuera de la rama en la que apply escribió', () => {
  it('no sobrescribe el package.json de Prod con el snapshot de la rama aislada', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    // El desarrollador vuelve a Prod y sigue trabajando. El journal, ignorado
    // por git, sobrevive al checkout.
    await git(root, 'checkout', 'Prod')
    await writeFile(join(root, 'package.json'), manifest('2.0.0'))
    await git(root, 'add', 'package.json')
    await git(root, 'commit', '-m', 'bump version')

    const exitCode = await runRollback(root)

    expect(await readManifest(root)).toBe(manifest('2.0.0'))
    expect(exitCode).toBe(1)
  })

  it('el journal guarda la rama en la que se escribió, no la de partida', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)

    const journal: unknown = JSON.parse(
      await readFile(join(root, '.governance/journal.json'), 'utf8'),
    )
    expect((journal as { writtenOnBranch: string | null }).writtenOnBranch).toBe(GOVERNANCE_BRANCH)
  })

  it('sigue revirtiendo con normalidad en la rama en la que apply escribió', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    expect(await runRollback(root)).toBe(0)
    expect(await readManifest(root)).toBe(manifest('1.0.0'))
    expect(await git(root, 'status', '--porcelain')).toBe('')
  })
})
