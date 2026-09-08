import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { CommentStyle } from '@governance/ast'

/**
 * Resuelve una ruta relativa dentro del repositorio impidiendo escapar de él.
 *
 * Es una barrera de seguridad real, no defensiva: los packs son extensibles y
 * en el futuro podrán venir de terceros. Ninguno debe poder escribir en
 * `~/.ssh/authorized_keys` mediante una ruta con `../`.
 */
export function resolveInRepo(repoRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Ruta absoluta no permitida en una operación: "${relativePath}".`)
  }
  const root = resolve(repoRoot)
  const target = resolve(root, relativePath)
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`La ruta "${relativePath}" escapa de la raíz del repositorio.`)
  }
  return target
}

export async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath)
    return true
  } catch {
    return false
  }
}

/** Lee un fichero o devuelve `undefined` si no existe. */
export async function readFileIfExists(absolutePath: string): Promise<string | undefined> {
  try {
    return await readFile(absolutePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Escribe creando los directorios intermedios que falten. */
export async function writeFileEnsuringDir(
  absolutePath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, 'utf8')
}

export async function removeFile(absolutePath: string): Promise<void> {
  await rm(absolutePath, { force: true })
}

/**
 * Estilo de comentario adecuado para un fichero según su extensión o nombre.
 *
 * Devuelve `undefined` cuando el formato no admite comentarios de forma segura
 * (JSON estricto como `package.json`, que otras herramientas reescriben).
 */
export function commentStyleForPath(filePath: string): CommentStyle | undefined {
  const name = filePath.split('/').pop() ?? filePath

  if (name === 'Makefile' || name.startsWith('Dockerfile')) return 'hash'
  if (name === '.gitignore' || name === '.dockerignore' || name === '.editorconfig') return 'hash'
  if (name.startsWith('.env')) return 'hash'

  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
  switch (extension) {
    case '.yml':
    case '.yaml':
    case '.sh':
    case '.bash':
    case '.toml':
    case '.py':
    case '.rb':
    case '.conf':
      return 'hash'
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
    case '.go':
    case '.java':
    case '.php':
    case '.css':
      return 'slash'
    case '.md':
    case '.html':
    case '.xml':
      return 'html'
    case '.json':
      // JSON estricto: no se inyecta cabecera para no romper otras herramientas.
      return undefined
    default:
      return undefined
  }
}
