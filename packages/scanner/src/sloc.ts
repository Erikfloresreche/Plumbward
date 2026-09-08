import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { GovernanceMode, LanguageStat, SizeClass, SlocReport } from './types.js'

/** Umbrales de la especificación, en líneas de código efectivas. */
export const SIZE_THRESHOLDS = { small: 2_000, medium: 50_000 } as const

/** Ficheros mayores que esto se ignoran: son datos o artefactos, no código. */
const MAX_FILE_BYTES = 2 * 1024 * 1024

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.php': 'PHP',
  '.go': 'Go',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.cs': 'C#',
  '.rs': 'Rust',
  '.swift': 'Swift',
  '.scala': 'Scala',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.css': 'CSS',
  '.scss': 'CSS',
  '.sass': 'CSS',
  '.less': 'CSS',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.bash': 'Shell',
}

/** Directorios que nunca cuentan como código propio del proyecto. */
const IGNORED_SEGMENTS = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'Pods',
  'bower_components',
  'third_party',
  'generated',
])

/** Prefijos que indican línea de comentario en la mayoría de lenguajes. */
const COMMENT_PREFIXES = ['//', '#', '*', '/*', '*/', '--', '<!--']

export function languageFor(relativePath: string): string | undefined {
  const name = relativePath.split('/').pop() ?? relativePath
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return undefined
  return LANGUAGE_BY_EXTENSION[name.slice(dot).toLowerCase()]
}

export function isIgnoredPath(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => IGNORED_SEGMENTS.has(segment))
}

/**
 * Cuenta líneas efectivas: descarta vacías y comentarios de línea.
 *
 * No es un analizador sintáctico y no pretende serlo: para clasificar un repo
 * en tres cubos de tamaño, una heurística estable vale más que la exactitud.
 */
export function countSloc(content: string): number {
  let count = 0
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    if (COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix))) continue
    count += 1
  }
  return count
}

export function classifySize(total: number, isMonorepo: boolean): SizeClass {
  if (isMonorepo) return 'large'
  if (total < SIZE_THRESHOLDS.small) return 'small'
  if (total <= SIZE_THRESHOLDS.medium) return 'medium'
  return 'large'
}

export function modeFor(sizeClass: SizeClass): GovernanceMode {
  switch (sizeClass) {
    case 'small':
      return 'greenfield'
    case 'medium':
      return 'ratchet'
    case 'large':
      return 'non-disruptive'
  }
}

export async function measureSloc(
  repoRoot: string,
  files: readonly string[],
  isMonorepo: boolean,
): Promise<SlocReport> {
  const totals = new Map<string, { files: number; sloc: number }>()
  let total = 0
  let filesScanned = 0

  for (const relativePath of files) {
    if (isIgnoredPath(relativePath)) continue
    const language = languageFor(relativePath)
    if (!language) continue

    const absolute = join(repoRoot, relativePath)
    try {
      const info = await stat(absolute)
      if (!info.isFile() || info.size > MAX_FILE_BYTES) continue
      const content = await readFile(absolute, 'utf8')
      const sloc = countSloc(content)

      const bucket = totals.get(language) ?? { files: 0, sloc: 0 }
      bucket.files += 1
      bucket.sloc += sloc
      totals.set(language, bucket)

      total += sloc
      filesScanned += 1
    } catch {
      // Enlaces rotos, permisos, binarios mal etiquetados: se ignoran sin ruido.
    }
  }

  const byLanguage: LanguageStat[] = [...totals.entries()]
    .map(([language, bucket]) => ({ language, files: bucket.files, sloc: bucket.sloc }))
    .sort((a, b) => b.sloc - a.sloc)

  const sizeClass = classifySize(total, isMonorepo)

  return { total, filesScanned, byLanguage, sizeClass, mode: modeFor(sizeClass) }
}
