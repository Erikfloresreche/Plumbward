import { afterEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runApply } from '../src/commands.js'

/**
 * Pruebas de punta a punta de la decisión "¿escribo en esta rama o creo una
 * aislada?", ejecutando `runApply` entero sobre repositorios git reales.
 *
 * Cada caso pregunta lo único que importa: **en qué rama queda el repositorio
 * después de `apply`**. Una versión anterior de esta verificación comprobaba que
 * el commit de la rama no se movía, lo cual era cierto también con el fallo sin
 * arreglar, porque `apply` nunca hace commit.
 */

const ISOLATED = 'refs/heads/chore/setup-ai-governance'
const created: string[] = []

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

/** Repositorio Node mínimo, con un commit, en la rama indicada. */
async function createRepo(branch: string, options: { commit?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-protected-'))
  created.push(root)
  await writeFile(
    join(root, 'package.json'),
    '{"name":"client","version":"1.0.0","devDependencies":{"typescript":"^5.0.0"}}\n',
  )
  await git(root, 'init', '-b', branch)
  await git(root, 'config', 'user.email', 'test@example.com')
  await git(root, 'config', 'user.name', 'Test')
  if (options.commit ?? true) {
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'initial')
  }
  return root
}

/** Deja `origin/HEAD` apuntando a una rama, como tras un `git clone`, sin red. */
async function simulateClone(root: string, defaultBranch: string): Promise<void> {
  await git(root, 'update-ref', `refs/remotes/origin/${defaultBranch}`, 'HEAD')
  await git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${defaultBranch}`)
}

async function apply(root: string): Promise<void> {
  await runApply(root, { yes: true, install: false, branch: true })
}

async function headRef(root: string): Promise<string> {
  return execa('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: root, reject: false }).then((r) =>
    r.exitCode === 0 ? r.stdout.trim() : 'DETACHED',
  )
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('apply nunca escribe directamente en una rama de larga duración', () => {
  it('caso de control: rama Prod sin nada raro', async () => {
    const root = await createRepo('Prod')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  it('una etiqueta con el mismo nombre que la rama no desactiva la protección', async () => {
    // `git rev-parse --abbrev-ref HEAD` devuelve `heads/Prod` si existe la
    // etiqueta `Prod`, y ese nombre no coincide con nada. Etiquetar despliegues
    // con el nombre de la rama es habitual.
    const root = await createRepo('Prod')
    await git(root, 'tag', 'Prod')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  it('con HEAD desacoplado crea la rama aislada en vez de trabajar suelto', async () => {
    const root = await createRepo('Prod')
    await git(root, 'checkout', '--detach')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  it('en un repositorio sin commits también protege la rama de releases', async () => {
    const root = await createRepo('Prod', { commit: false })
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  it('protege una rama por defecto que no está en ninguna lista conocida', async () => {
    // `live` no está en la lista de respaldo: sólo la rama por defecto
    // detectada la protege. Si alguien quita esa fuente de la decisión, falla.
    const root = await createRepo('live')
    await simulateClone(root, 'live')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })
})

describe('el perfil generado identifica bien la rama de releases', () => {
  it('en un repositorio git-flow, la rama de releases es main y no develop', async () => {
    // En git-flow la rama por defecto de GitHub es `develop`. Tomarla como rama
    // de releases hace que la CI generada despliegue a producción desde develop.
    const root = await createRepo('main')
    await git(root, 'branch', 'develop')
    await git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    await simulateClone(root, 'develop')
    await apply(root)
    const config = await readFile(join(root, '.governance/config.yml'), 'utf8')
    expect(config).toMatch(/^\s+main: main$/m)
    expect(config).toMatch(/^\s+dev: develop$/m)
  })

  it('en un repositorio con Prod y develop, la rama de releases es Prod', async () => {
    const root = await createRepo('Prod')
    await git(root, 'branch', 'develop')
    await apply(root)
    const config = await readFile(join(root, '.governance/config.yml'), 'utf8')
    expect(config).toMatch(/^\s+main: Prod$/m)
  })
})
