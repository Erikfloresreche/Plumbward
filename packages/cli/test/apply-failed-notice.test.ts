import { afterEach, describe, expect, it, vi } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Hallazgo bloqueante de la revisión de la PR #11: el aviso de rama se imprimía
 * sin mirar `cause.rolledBack`. Cuando la reversión automática falla, el consejo
 * lleva a un callejón sin salida (ver `branch-notice.test.ts` para el detalle).
 *
 * Esa rama no se puede provocar de verdad desde fuera: haría falta que
 * `revertEntries` reventara a mitad, y para eso hay que cambiar los permisos del
 * árbol entre dos operaciones de un mismo `apply`. Se sustituye `applyPlan` por
 * uno que lanza el error ya construido; lo que se prueba aquí es el cableado
 * —qué se imprime con `rolledBack === false`—, no la reversión.
 */

const { applyPlanMock } = vi.hoisted(() => ({ applyPlanMock: vi.fn() }))

vi.mock('@plumbward/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@plumbward/core')>()
  return { ...actual, applyPlan: applyPlanMock }
})

const { ApplyFailedError } = await import('@plumbward/core')
const { runApply, GOVERNANCE_BRANCH } = await import('../src/commands.js')

const created: string[] = []
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

async function createRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-failed-notice-'))
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

afterEach(async () => {
  vi.restoreAllMocks()
  applyPlanMock.mockReset()
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('apply que falla y tampoco puede revertir', () => {
  it('no propone volver a la rama de partida con el árbol a medias', async () => {
    const root = await createRepo()
    applyPlanMock.mockRejectedValue(new ApplyFailedError('EACCES al escribir', undefined, false))
    const output = captureOutput()

    const exitCode = await runApply(root, { yes: true, install: false, branch: true })
    const printed = output()

    expect(exitCode).toBe(1)
    expect(printed).toContain('no se pudo revertir del todo')

    // Las dos instrucciones que cerraban la única salida.
    expect(printed).not.toContain(`git branch -d ${GOVERNANCE_BRANCH}`)

    // Anclado a la línea del aviso, no a `plumbward rollback` a secas: esa
    // cadena ya sale en la línea "ATENCIÓN" anterior, y con ella la aserción se
    // cumpliría aunque el aviso pusiera el `checkout` primero.
    const revertHere = printed.indexOf('Ejecuta `plumbward rollback` aquí')
    expect(revertHere).toBeGreaterThan(-1)
    expect(revertHere).toBeLessThan(printed.indexOf('git checkout Prod'))
  })

  it('sigue proponiendo volver y borrar cuando sí se revirtió', async () => {
    const root = await createRepo()
    applyPlanMock.mockRejectedValue(new ApplyFailedError('EACCES al escribir', undefined, true))
    const output = captureOutput()

    expect(await runApply(root, { yes: true, install: false, branch: true })).toBe(1)
    const printed = output()

    expect(printed).toContain('git checkout Prod')
    expect(printed).toContain(`git branch -d ${GOVERNANCE_BRANCH}`)
  })
})
