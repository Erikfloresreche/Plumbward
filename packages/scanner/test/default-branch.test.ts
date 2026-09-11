import { afterEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listBranchNames, readDefaultBranch, readGitState } from '@plumbward/scanner'

const created: string[] = []

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execa('git', args, { cwd })
}

/** Repositorio con un commit, sin remoto. */
async function createRepo(branch = 'main', options: { commit?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-git-state-'))
  created.push(root)
  await writeFile(join(root, 'package.json'), '{"name":"x","version":"1.0.0"}\n')
  await git(root, 'init', '-b', branch)
  await git(root, 'config', 'user.email', 'test@example.com')
  await git(root, 'config', 'user.name', 'Test')
  if (options.commit ?? true) {
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'initial')
  }
  return root
}

/**
 * Simula lo que deja `git clone`: una referencia remota y `origin/HEAD`
 * apuntando a ella. Sin red: se escriben las referencias directamente.
 */
async function simulateClone(root: string, defaultBranch: string, createTarget = true): Promise<void> {
  if (createTarget) await git(root, 'update-ref', `refs/remotes/origin/${defaultBranch}`, 'HEAD')
  await git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${defaultBranch}`)
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('rama actual', () => {
  it('devuelve el nombre limpio aunque exista una etiqueta con el mismo nombre', async () => {
    // Con `rev-parse --abbrev-ref HEAD` o `symbolic-ref --short`, esto daba
    // `heads/Prod`, que no coincidía con ninguna rama protegida.
    const root = await createRepo('Prod')
    await git(root, 'tag', 'Prod')
    const state = await readGitState(root)
    expect(state.branch).toBe('Prod')
    expect(state.detachedHead).toBe(false)
  })

  it('con HEAD desacoplado no inventa una rama llamada "HEAD"', async () => {
    const root = await createRepo('Prod')
    await git(root, 'checkout', '--detach')
    const state = await readGitState(root)
    expect(state.branch).toBeNull()
    expect(state.detachedHead).toBe(true)
  })

  it('en un repositorio sin commits conoce igualmente la rama', async () => {
    const state = await readGitState(await createRepo('Prod', { commit: false }))
    expect(state.branch).toBe('Prod')
    expect(state.detachedHead).toBe(false)
  })
})

describe('ramas conocidas', () => {
  it('reúne las locales y las remotas, sin prefijos, sin duplicados y sin HEAD', async () => {
    const root = await createRepo('Prod')
    await git(root, 'branch', 'develop')
    await simulateClone(root, 'Prod')
    await git(root, 'update-ref', 'refs/remotes/origin/feature/login', 'HEAD')
    expect(await listBranchNames(root)).toEqual(['Prod', 'develop', 'feature/login'])
  })
})

describe('rama por defecto del remoto', () => {
  it('es null en un repositorio sin remoto', async () => {
    expect(await readDefaultBranch(await createRepo())).toBeNull()
  })

  it('detecta una rama por defecto que no se llama main', async () => {
    const root = await createRepo('Prod')
    await simulateClone(root, 'Prod')
    expect(await readDefaultBranch(root)).toBe('Prod')
  })

  it('ignora un origin/HEAD que apunta a una referencia inexistente', async () => {
    const root = await createRepo()
    await simulateClone(root, 'deleted-branch', false)
    expect(await readDefaultBranch(root)).toBeNull()
  })
})
