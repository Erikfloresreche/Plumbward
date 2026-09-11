import { afterEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDefaultBranch, scanRepository } from '@plumbward/scanner'
import { recommendedProfile } from '@plumbward/packs-sdk'

const creados: string[] = []

/** Repositorio con un commit, sin remoto. */
async function repo(ramaInicial = 'main'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-default-branch-'))
  creados.push(root)
  await writeFile(join(root, 'package.json'), '{"name":"x","version":"1.0.0"}\n')
  const g = (...args: string[]) => execa('git', args, { cwd: root })
  await g('init', '-b', ramaInicial)
  await g('config', 'user.email', 'test@example.com')
  await g('config', 'user.name', 'Test')
  await g('add', '.')
  await g('commit', '-m', 'inicial')
  return root
}

/**
 * Simula lo que deja `git clone`: una referencia remota y `origin/HEAD`
 * apuntando a ella. Sin red: se escriben las referencias directamente.
 */
async function simularClon(root: string, ramaPorDefecto: string, crearDestino = true): Promise<void> {
  const g = (...args: string[]) => execa('git', args, { cwd: root })
  if (crearDestino) await g('update-ref', `refs/remotes/origin/${ramaPorDefecto}`, 'HEAD')
  await g('symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${ramaPorDefecto}`)
}

afterEach(async () => {
  await Promise.all(creados.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

describe('rama por defecto del remoto', () => {
  it('es null en un repositorio sin remoto', async () => {
    expect(await readDefaultBranch(await repo())).toBeNull()
  })

  it('detecta una rama por defecto que no se llama main', async () => {
    const root = await repo('Prod')
    await simularClon(root, 'Prod')
    expect(await readDefaultBranch(root)).toBe('Prod')
  })

  it('ignora un origin/HEAD que apunta a una referencia inexistente', async () => {
    const root = await repo()
    await simularClon(root, 'rama-borrada', false)
    expect(await readDefaultBranch(root)).toBeNull()
  })

  it('lo lleva hasta el perfil recomendado', async () => {
    const root = await repo('Prod')
    await simularClon(root, 'Prod')
    const scan = await scanRepository(root)
    expect(scan.git.defaultBranch).toBe('Prod')
    // Antes de F0-14 esto devolvía 'main' en cualquier repo que no usara 'master'.
    expect(recommendedProfile(scan).branches.main).toBe('Prod')
  })
})
