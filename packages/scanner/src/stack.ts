import { readFileIfExists } from '@plumbward/core'
import type { PackageManager } from '@plumbward/core'
import { join } from 'node:path'
import type { StackDetection } from './types.js'

/** Reads and parses a JSON file of the repo, tolerating that it is missing or broken. */
async function readJson(
  repoRoot: string,
  relativePath: string,
): Promise<Record<string, unknown> | undefined> {
  const raw = await readFileIfExists(join(repoRoot, relativePath))
  if (raw === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry
  }
  return result
}

/** Infers the package manager from the lockfile and the `packageManager` field. */
export function detectPackageManager(
  files: ReadonlySet<string>,
  manifest: Record<string, unknown> | undefined,
): PackageManager {
  const declared = typeof manifest?.['packageManager'] === 'string'
    ? (manifest['packageManager'] as string)
    : ''
  if (declared.startsWith('pnpm')) return 'pnpm'
  if (declared.startsWith('yarn')) return 'yarn'
  if (declared.startsWith('bun')) return 'bun'
  if (declared.startsWith('npm')) return 'npm'

  if (files.has('pnpm-lock.yaml')) return 'pnpm'
  if (files.has('yarn.lock')) return 'yarn'
  if (files.has('bun.lockb') || files.has('bun.lock')) return 'bun'
  return 'npm'
}

const NODE_FRAMEWORKS: ReadonlyArray<readonly [string, string]> = [
  ['next', 'Next.js'],
  ['nuxt', 'Nuxt'],
  ['@nestjs/core', 'NestJS'],
  ['@angular/core', 'Angular'],
  ['@remix-run/react', 'Remix'],
  ['astro', 'Astro'],
  ['svelte', 'Svelte'],
  ['vue', 'Vue'],
  ['react', 'React'],
  ['express', 'Express'],
  ['fastify', 'Fastify'],
  ['hono', 'Hono'],
  ['vite', 'Vite'],
]

async function detectNode(
  repoRoot: string,
  files: ReadonlySet<string>,
): Promise<StackDetection | undefined> {
  const manifest = await readJson(repoRoot, 'package.json')
  if (!manifest) return undefined

  const dependencies = {
    ...asRecord(manifest['dependencies']),
    ...asRecord(manifest['devDependencies']),
  }
  const typescript = 'typescript' in dependencies || files.has('tsconfig.json')
  const frameworks = NODE_FRAMEWORKS.filter(([dep]) => dep in dependencies).map(
    ([, label]) => label,
  )

  const evidence = ['package.json']
  if (typescript) evidence.push(files.has('tsconfig.json') ? 'tsconfig.json' : 'typescript')

  return {
    id: 'node-ts',
    name: typescript ? 'Node.js + TypeScript' : 'Node.js + JavaScript',
    confidence: 0.95,
    evidence,
    packageManager: detectPackageManager(files, manifest),
    frameworks,
    typescript,
  }
}

async function detectPhp(
  repoRoot: string,
  files: ReadonlySet<string>,
): Promise<StackDetection | undefined> {
  const manifest = await readJson(repoRoot, 'composer.json')
  if (!manifest) return undefined

  const requires = { ...asRecord(manifest['require']), ...asRecord(manifest['require-dev']) }
  const frameworks: string[] = []
  let id = 'php'
  let name = 'PHP'

  if ('laravel/framework' in requires || files.has('artisan')) {
    id = 'laravel'
    name = 'PHP + Laravel'
    frameworks.push('Laravel')
  } else if (Object.keys(requires).some((dep) => dep.startsWith('symfony/'))) {
    id = 'symfony'
    name = 'PHP + Symfony'
    frameworks.push('Symfony')
  }

  return {
    id,
    name,
    confidence: 0.9,
    evidence: ['composer.json'],
    packageManager: 'composer',
    frameworks,
  }
}

async function detectGo(
  repoRoot: string,
  files: ReadonlySet<string>,
): Promise<StackDetection | undefined> {
  if (!files.has('go.mod')) return undefined
  const raw = (await readFileIfExists(join(repoRoot, 'go.mod'))) ?? ''
  const module = /^module\s+(\S+)/m.exec(raw)?.[1]

  return {
    id: 'go',
    name: 'Go',
    confidence: 0.95,
    evidence: module ? ['go.mod', `module ${module}`] : ['go.mod'],
    packageManager: 'go',
    frameworks: [],
  }
}

async function detectPython(
  repoRoot: string,
  files: ReadonlySet<string>,
): Promise<StackDetection | undefined> {
  const candidates = ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py']
  const present = candidates.filter((candidate) => files.has(candidate))
  if (present.length === 0) return undefined

  const contents = (
    await Promise.all(present.map((file) => readFileIfExists(join(repoRoot, file))))
  )
    .filter((value): value is string => value !== undefined)
    .join('\n')
    .toLowerCase()

  const frameworks: string[] = []
  let id = 'python'
  let name = 'Python'

  if (contents.includes('django') || files.has('manage.py')) {
    id = 'django'
    name = 'Python + Django'
    frameworks.push('Django')
  } else if (contents.includes('fastapi')) {
    id = 'fastapi'
    name = 'Python + FastAPI'
    frameworks.push('FastAPI')
  } else if (contents.includes('flask')) {
    frameworks.push('Flask')
  }

  const packageManager: PackageManager = files.has('uv.lock')
    ? 'uv'
    : files.has('poetry.lock') || contents.includes('[tool.poetry]')
      ? 'poetry'
      : 'pip'

  return {
    id,
    name,
    confidence: 0.85,
    evidence: present,
    packageManager,
    frameworks,
  }
}

/** Monorepo signals. They decide the non-disruptive mode regardless of SLOC. */
export function detectMonorepo(files: ReadonlySet<string>): boolean {
  return (
    files.has('pnpm-workspace.yaml') ||
    files.has('turbo.json') ||
    files.has('nx.json') ||
    files.has('lerna.json') ||
    files.has('rush.json') ||
    files.has('go.work')
  )
}

/**
 * Runs every detector and sorts by confidence.
 *
 * A repository can have several stacks at once (a Laravel backend with a Node
 * frontend); returning all of them lets several packs contribute.
 */
export async function detectStacks(
  repoRoot: string,
  files: readonly string[],
): Promise<StackDetection[]> {
  const fileSet = new Set(files)
  const detected = await Promise.all([
    detectNode(repoRoot, fileSet),
    detectPhp(repoRoot, fileSet),
    detectGo(repoRoot, fileSet),
    detectPython(repoRoot, fileSet),
  ])

  return detected
    .filter((detection): detection is StackDetection => detection !== undefined)
    .sort((a, b) => b.confidence - a.confidence)
}
