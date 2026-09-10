import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPlan, rollbackLastApply, simulatePlan } from '@plumbward/core'
import type { ChangePlan, Operation } from '@plumbward/core'
import { scanRepository } from '@plumbward/scanner'
import { PackRegistry, checkPackConformance, file, recommendedProfile } from '@plumbward/packs-sdk'
import { nodeTsPack } from '@plumbward/pack-node-ts'

const VERSION = '0.1.0-test'

/** Crea un repositorio git realista sobre el que ejecutar el ciclo completo. */
async function crearRepoDePrueba(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'governance-e2e-'))

  await writeFile(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'proyecto-cliente',
        version: '1.0.0',
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      },
      null,
      2,
    ) + '\n',
  )
  await writeFile(join(root, 'tsconfig.json'), '{\n  // Comentario del cliente.\n  "compilerOptions": { "strict": true }\n}\n')
  await writeFile(join(root, '.gitignore'), 'node_modules/\ndist/\n')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'app.ts'), 'export const saludo = (): string => "hola"\n')

  await execa('git', ['init', '-b', 'main'], { cwd: root })
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  await execa('git', ['config', 'user.name', 'Test'], { cwd: root })
  await execa('git', ['add', '.'], { cwd: root })
  await execa('git', ['commit', '-m', 'commit inicial'], { cwd: root })

  return root
}

async function construirPlan(root: string): Promise<ChangePlan> {
  const scan = await scanRepository(root)
  const profile = recommendedProfile(scan)
  const registry = new PackRegistry([nodeTsPack])
  const plan = await registry.buildPlan({ scan, profile, cliVersion: VERSION })

  const config: Operation = file(
    '.governance/config.yml',
    'strictness: strict\n',
    'Perfil de gobernanza.',
    { managed: false },
  )

  return { ...plan, operations: [config, ...plan.operations] }
}

async function gitStatus(root: string): Promise<string> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd: root })
  return stdout.trim()
}

describe('ciclo completo sobre un repositorio real', () => {
  let root: string

  beforeEach(async () => {
    root = await crearRepoDePrueba()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('detecta el stack, el tamaño y el modo correctos', async () => {
    const scan = await scanRepository(root)

    expect(scan.git.isRepo).toBe(true)
    expect(scan.git.branch).toBe('main')
    expect(scan.git.fingerprint).toBeTruthy()
    expect(scan.primaryStack?.id).toBe('node-ts')
    expect(scan.primaryStack?.typescript).toBe(true)
    expect(scan.primaryStack?.frameworks).toContain('React')
    expect(scan.sloc.mode).toBe('greenfield')
    expect(scan.maturity.score).toBeLessThan(30)
  })

  it('el plan describe exactamente lo que apply va a hacer', async () => {
    const plan = await construirPlan(root)
    const simulation = await simulatePlan(plan, { repoRoot: root, version: VERSION })

    const rutas = simulation.changes.map((cambio) => cambio.path)
    expect(rutas).toContain('.github/workflows/ci-dev.yml')
    expect(rutas).toContain('.gitleaks.toml')
    expect(rutas).toContain('.husky/pre-commit')
    expect(rutas).toContain('.cursorrules')
    expect(rutas).toContain('GOBERNANZA.md')
    expect(rutas).toContain('package.json')
    expect(rutas).toContain('.gitignore')

    // Nada se ha escrito todavía: `plan` es de sólo lectura.
    expect(await gitStatus(root)).toBe('')
  })

  it('apply escribe lo planificado y rollback deja el repositorio idéntico', async () => {
    const plan = await construirPlan(root)
    const paqueteOriginal = await readFile(join(root, 'package.json'), 'utf8')

    const resultado = await applyPlan(plan, {
      repoRoot: root,
      version: VERSION,
      branch: 'main',
      runCommands: false,
    })

    expect(resultado.applied).toBeGreaterThan(10)
    expect(existsSync(join(root, '.github/workflows/ci-dev.yml'))).toBe(true)
    expect(existsSync(join(root, '.husky/pre-commit'))).toBe(true)
    expect(await gitStatus(root)).not.toBe('')

    // El parche de package.json respeta los scripts que ya existían.
    const paqueteModificado = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    expect(paqueteModificado.scripts.dev).toBe('vite')
    expect(paqueteModificado.scripts.build).toBe('vite build')
    expect(paqueteModificado.scripts.lint).toBe('eslint .')

    // El comentario del tsconfig del cliente sigue ahí.
    expect(await readFile(join(root, 'tsconfig.json'), 'utf8')).toContain('Comentario del cliente')

    await rollbackLastApply(root)

    expect(await gitStatus(root)).toBe('')
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(paqueteOriginal)
    expect(existsSync(join(root, '.github/workflows/ci-dev.yml'))).toBe(false)
  })

  it('un segundo apply no produce ningún cambio (idempotencia de punta a punta)', async () => {
    await applyPlan(await construirPlan(root), {
      repoRoot: root,
      version: VERSION,
      branch: 'main',
      runCommands: false,
    })

    const segundoPlan = await construirPlan(root)
    const simulacion = await simulatePlan(segundoPlan, { repoRoot: root, version: VERSION })

    expect(simulacion.changes).toHaveLength(0)

    const segundo = await applyPlan(segundoPlan, {
      repoRoot: root,
      version: VERSION,
      branch: 'main',
      runCommands: false,
    })
    expect(segundo.applied).toBe(0)
  })

  it('revierte automáticamente si una operación falla a mitad', async () => {
    const plan = await construirPlan(root)
    const roto: ChangePlan = {
      ...plan,
      operations: [
        ...plan.operations,
        {
          kind: 'patchJson',
          path: 'no-existe.json',
          pointer: '/a',
          value: 1,
          strategy: 'set',
          reason: 'Operación imposible a propósito.',
        },
      ],
    }

    await expect(
      applyPlan(roto, { repoRoot: root, version: VERSION, branch: 'main', runCommands: false }),
    ).rejects.toThrow(/no existe el fichero/)

    // Requisito de resiliencia operativa: el repositorio queda intacto.
    expect(await gitStatus(root)).toBe('')
  })

  it('el pack node-ts cumple el contrato de conformidad', async () => {
    const scan = await scanRepository(root)
    const contexto = { scan, profile: recommendedProfile(scan), cliVersion: VERSION }

    expect(await checkPackConformance(nodeTsPack, contexto)).toEqual([])
  })

  it('impide que un pack escriba fuera del repositorio', async () => {
    const plan = await construirPlan(root)
    const malicioso: ChangePlan = {
      ...plan,
      operations: [
        {
          kind: 'createFile',
          path: '../../fuera-del-repo.txt',
          content: 'no debería llegar aquí',
          managed: false,
          reason: 'Intento de escapar de la raíz.',
        },
      ],
    }

    await expect(
      applyPlan(malicioso, { repoRoot: root, version: VERSION, branch: 'main', runCommands: false }),
    ).rejects.toThrow(/escapa de la raíz/)
  })
})
