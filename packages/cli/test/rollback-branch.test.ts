import { afterEach, describe, expect, it, vi } from 'vitest'
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
  vi.restoreAllMocks()
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

/** Todo lo que la CLI ha impreso, sin colores. */
function captureOutput(): () => string {
  const lines: string[] = []
  const ansi = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  return () => {
    spy.mockRestore()
    return lines.join('\n').replace(ansi, '')
  }
}

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

  /**
   * Hallazgo 2 de la revisión de la PR #11. Con `--no-branch` y HEAD
   * desacoplado, `prepareBranch` sale pronto, se escribe sobre el HEAD
   * desacoplado y `writtenOnBranch` queda `null`, así que `rollback` se negará
   * siempre. Antes de esta PR ese `rollback` funcionaba: es una regresión que
   * introduce esta rama, y el paso 4 seguía prometiendo lo contrario.
   *
   * Aquí sólo se retira la promesa falsa. Qué hacer con esa combinación —avisar
   * o rechazarla— es diseño, y es F0-29.
   */
  it('apply no promete un rollback que no va a poder hacer', async () => {
    const root = await createRepo('Prod')
    await git(root, 'checkout', '--detach')
    const output = captureOutput()

    expect(await runApply(root, { yes: true, install: false, branch: false })).toBe(0)
    const printed = output()

    expect(printed).not.toContain('`plumbward rollback` lo deja todo como estaba')
    expect(printed).toContain('no se podrá revertir')
  })

  it('sí promete el rollback cuando de verdad va a poder hacerlo', async () => {
    const root = await createRepo('Prod')
    const output = captureOutput()

    expect(await apply(root)).toBe(0)
    const printed = output()

    expect(printed).toContain('`plumbward rollback` lo deja todo como estaba')
  })

  /**
   * Hallazgo 1 de la revisión de F0-30. El paso anterior manda abrir una Pull
   * Request, y para eso hay que commitear; desde F0-30, commitear mueve el
   * commit y `rollback` se niega. La promesa dejaba de ser cierta en cuanto se
   * seguía el paso de antes, que es la misma promesa falsa que retiró F0-24.
   */
  it('no promete un rollback que el paso anterior invalida', async () => {
    const root = await createRepo('Prod')
    const output = captureOutput()

    expect(await apply(root)).toBe(0)
    const printed = output()

    expect(printed).toContain('aún no has commiteado')
    expect(printed).not.toContain('Si algo no encaja: `plumbward rollback`')
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

/**
 * F0-30: el nombre de la rama dice dónde estás, no si es el mismo sitio.
 *
 * `assertSameBranch` (F0-24) compara nombres, y `revertEntries` escribe en
 * cuanto el nombre coincide. Una rama borrada y recreada sobre otro commit
 * lleva el mismo nombre y no es el mismo sitio: los snapshots del journal son
 * de la rama vieja, y restaurarlos ahí es la misma pérdida de datos que F0-24
 * arregló para el caso fácil.
 */
describe('rollback en una rama del mismo nombre creada sobre otro commit', () => {
  it('no restaura el snapshot viejo sobre el trabajo de la rama nueva', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    // Se tira la rama aislada y se sigue en Prod. El journal, ignorado por git,
    // sobrevive: está en `.governance/`, que no se borra con el checkout.
    await git(root, 'checkout', '-f', 'Prod')
    await writeFile(join(root, 'package.json'), manifest('2.0.0'))
    await git(root, 'add', 'package.json')
    await git(root, 'commit', '-m', 'bump version')
    await git(root, 'branch', '-D', GOVERNANCE_BRANCH)

    // Más tarde se vuelve a crear una rama con el mismo nombre, sobre el commit
    // nuevo. Para el guardián de F0-24 es indistinguible de la original.
    await git(root, 'checkout', '-b', GOVERNANCE_BRANCH)

    const exitCode = await runRollback(root)

    expect(await readManifest(root)).toBe(manifest('2.0.0'))
    expect(exitCode).toBe(1)
  })

  it('tampoco revierte si se ha commiteado en la rama aislada después del apply', async () => {
    const root = await createRepo('Prod')

    expect(await apply(root)).toBe(0)
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'governance')
    await writeFile(join(root, 'package.json'), manifest('3.0.0'))

    const exitCode = await runRollback(root)

    expect(await readManifest(root)).toBe(manifest('3.0.0'))
    expect(exitCode).toBe(1)
  })

  /**
   * El commit anotado es a la vez el de partida: `headMoved` aborta si HEAD se
   * mueve entre el plan y la confirmación, y `prepareBranch` crea la rama desde
   * HEAD sin commitear. Este test fija esa igualdad, que es la razón de que el
   * journal guarde un commit y no dos.
   */
  it('el journal guarda el commit sobre el que se escribió, que es el de partida', async () => {
    const root = await createRepo('Prod')
    await git(root, 'checkout', '--detach')
    const commitDePartida = await git(root, 'rev-parse', 'HEAD')

    expect(await apply(root)).toBe(0)

    const journal: unknown = JSON.parse(
      await readFile(join(root, '.governance/journal.json'), 'utf8'),
    )
    expect((journal as { writtenOnCommit: string | null }).writtenOnCommit).toBe(commitDePartida)
  })

  it('el aviso de vuelta nombra el commit de partida, no un hueco que rellenar', async () => {
    const root = await createRepo('Prod')
    await git(root, 'checkout', '--detach')
    const commitDePartida = await git(root, 'rev-parse', 'HEAD')

    expect(await apply(root)).toBe(0)
    expect(await currentBranch(root)).toBe(GOVERNANCE_BRANCH)

    const output = captureOutput()
    expect(await runRollback(root)).toBe(0)
    const printed = output()

    expect(printed).toContain(`git checkout ${commitDePartida}`)
    expect(printed).not.toContain('git checkout <commit>')
  })
})
