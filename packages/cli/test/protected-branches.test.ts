import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runApply } from '../src/commands.js'

/**
 * Pruebas de punta a punta de la decisión "¿escribo en esta rama o creo una
 * aislada?", ejecutando `runApply` entero sobre repositorios git reales.
 *
 * Cada caso pregunta lo único que importa: **en qué rama queda el repositorio
 * después de `apply`**. Una versión anterior comprobaba que el commit de la rama
 * no se movía, lo cual era cierto también con el fallo sin arreglar, porque
 * `apply` nunca hace commit.
 */

const ISOLATED = 'refs/heads/chore/setup-ai-governance'
const created: string[] = []
const savedEnv = { global: process.env['GIT_CONFIG_GLOBAL'], system: process.env['GIT_CONFIG_NOSYSTEM'] }

// Aísla git de la configuración de la máquina: con `commit.gpgsign` o un
// `core.hooksPath` globales, estas pruebas fallaban por motivos ajenos a lo que
// comprueban. `runApply` hereda estas variables al lanzar git.
beforeAll(() => {
  process.env['GIT_CONFIG_GLOBAL'] = '/dev/null'
  process.env['GIT_CONFIG_NOSYSTEM'] = '1'
})
afterAll(() => {
  for (const [key, value] of [['GIT_CONFIG_GLOBAL', savedEnv.global], ['GIT_CONFIG_NOSYSTEM', savedEnv.system]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

/** Repositorio Node mínimo en la rama indicada, con un commit salvo que se pida lo contrario. */
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

/** Escribe un `config.yml` parcial, como lo dejaría un equipo a mano. */
async function writeConfig(root: string, yaml: string): Promise<void> {
  await mkdir(join(root, '.governance'), { recursive: true })
  await writeFile(join(root, '.governance/config.yml'), yaml)
}

async function apply(root: string, options: { branch?: boolean } = {}): Promise<number> {
  return runApply(root, { yes: true, install: false, branch: options.branch ?? true })
}

async function headRef(root: string): Promise<string> {
  const result = await execa('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: root, reject: false })
  return result.exitCode === 0 ? result.stdout.trim() : 'DETACHED'
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

  it('en un repositorio sin commits también protege la rama', async () => {
    const root = await createRepo('Prod', { commit: false })
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })

  // Nombres que no están en ninguna lista. Antes, cualquier nombre desconocido
  // quedaba desprotegido; ahora sólo se opera directamente sobre ramas de
  // trabajo reconocibles, y lo desconocido cae del lado seguro.
  for (const branch of ['pro', 'pre', 'live', 'release/prod', 'env/production', 'staging']) {
    it(`protege una rama llamada "${branch}" aunque no esté en ninguna lista`, async () => {
      const root = await createRepo(branch)
      await apply(root)
      expect(await headRef(root)).toBe(ISOLATED)
    })
  }
})

describe('apply sí trabaja donde debe', () => {
  it('en una rama de trabajo opera sobre ella, sin crear otra', async () => {
    const root = await createRepo('main')
    await git(root, 'checkout', '-b', 'feat/login')
    await apply(root)
    expect(await headRef(root)).toBe('refs/heads/feat/login')
  })

  it('--no-branch respeta la decisión del usuario, incluso en una rama protegida', async () => {
    const root = await createRepo('Prod')
    await apply(root, { branch: false })
    expect(await headRef(root)).toBe('refs/heads/Prod')
  })

  it('una segunda ejecución reutiliza la rama aislada sin fallar', async () => {
    const root = await createRepo('Prod')
    await apply(root)
    await git(root, 'add', '-A')
    await git(root, 'commit', '-m', 'governance')
    await git(root, 'checkout', 'Prod')
    await apply(root)
    expect(await headRef(root)).toBe(ISOLATED)
  })
})

describe('el perfil generado no adivina lo que no se puede deducir', () => {
  it('en git-flow, integración es la rama por defecto y la de despliegue queda sin configurar', async () => {
    const root = await createRepo('main')
    await git(root, 'branch', 'develop')
    await git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    await simulateClone(root, 'develop')
    await apply(root)
    const config = await readFile(join(root, '.governance/config.yml'), 'utf8')
    expect(config).toMatch(/^\s+integration: develop$/m)
    // Desde dónde se despliega nunca se deduce: se configura a mano.
    expect(config).toMatch(/^\s+release: null$/m)
  })

  it('sin rama de despliegue configurada no se genera el workflow de producción', async () => {
    const root = await createRepo('feat/deploy')
    await writeConfig(root, 'deployTarget: vercel\n')
    await apply(root)
    expect(existsSync(join(root, '.github/workflows/ci-prod.yml'))).toBe(false)
  })

  it('con la rama de despliegue configurada, despliega desde esa y sólo desde esa', async () => {
    const root = await createRepo('feat/deploy')
    await writeConfig(root, 'deployTarget: vercel\nbranches:\n  release: Prod\n')
    await apply(root)
    const workflow = await readFile(join(root, '.github/workflows/ci-prod.yml'), 'utf8')
    expect(workflow).toMatch(/branches: \[Prod\]/)
  })

  it('un config.yml antiguo con "main" no convierte esa rama en rama de despliegue', async () => {
    // `main` era un valor adivinado por versiones anteriores. Traducirlo a
    // `release` sería desplegar desde una rama que nadie eligió.
    const root = await createRepo('feat/legacy')
    await writeConfig(root, 'deployTarget: vercel\nbranches:\n  main: Prod\n  dev: develop\n')
    await apply(root)
    expect(existsSync(join(root, '.github/workflows/ci-prod.yml'))).toBe(false)
    // `dev` sí se traduce, a `integration`. El config.yml del equipo no se
    // reescribe —es su fuente de verdad—, así que se comprueba en su efecto: la
    // CI generada se ejecuta al hacer push a esa rama.
    const workflow = await readFile(join(root, '.github/workflows/ci-dev.yml'), 'utf8')
    expect(workflow).toMatch(/push:\s*\n\s+branches: \[develop\]/)
  })

  it('la CI generada revisa todas las Pull Requests, vayan a la rama que vayan', async () => {
    // Antes sólo se disparaba en las ramas que el perfil creía principales; en un
    // repo con `main` (donde van las PRs) y `Prod` (despliegue), las PRs a
    // `main` se quedaban sin revisar.
    const root = await createRepo('main')
    await git(root, 'branch', 'Prod')
    await simulateClone(root, 'main')
    await git(root, 'checkout', '-b', 'feat/ci')
    await apply(root)
    const workflow = await readFile(join(root, '.github/workflows/ci-dev.yml'), 'utf8')
    expect(workflow).toMatch(/^ {2}pull_request:\s*$/m)
    expect(workflow).not.toMatch(/pull_request:\s*\n\s+branches:/)
  })
})
