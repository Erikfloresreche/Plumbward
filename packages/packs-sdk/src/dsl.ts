import type {
  AddDependencyOp,
  CommentStyle,
  CreateFileOp,
  EnsureBlockOp,
  ExecCommandOp,
  PackageManager,
  PatchJsonOp,
  PatchStrategy,
  PatchYamlOp,
} from '@plumbward/core'

/**
 * Azúcar sintáctico para escribir packs.
 *
 * Sin esto, un pack es un muro de literales de objeto y nadie de fuera querría
 * escribir uno. Con esto, un pack se lee casi como una lista de requisitos.
 */

export interface FileOptions {
  /** Marca el fichero como gestionado (cabecera + regenerable por `upgrade`). */
  readonly managed?: boolean
  readonly onExists?: 'skip' | 'overwrite' | 'conflict'
}

/** Crea un fichero nuevo. Por defecto gestionado y sin pisar lo existente. */
export function file(
  path: string,
  content: string,
  reason: string,
  options: FileOptions = {},
): CreateFileOp {
  return {
    kind: 'createFile',
    path,
    content,
    managed: options.managed ?? true,
    reason,
    ...(options.onExists === undefined ? {} : { onExists: options.onExists }),
  }
}

/** Parchea un JSON existente. Por defecto fusiona sin pisar valores del cliente. */
export function json(
  path: string,
  pointer: string,
  value: unknown,
  reason: string,
  strategy: PatchStrategy = 'merge',
): PatchJsonOp {
  return { kind: 'patchJson', path, pointer, value, strategy, reason }
}

/** Parchea un YAML existente preservando comentarios. */
export function yaml(
  path: string,
  pointer: string,
  value: unknown,
  reason: string,
  strategy: PatchStrategy = 'merge',
): PatchYamlOp {
  return { kind: 'patchYaml', path, pointer, value, strategy, reason }
}

/** Inserta un bloque delimitado dentro de un fichero del cliente. */
export function block(
  path: string,
  blockId: string,
  content: string,
  reason: string,
  options: { commentStyle?: CommentStyle; createIfMissing?: boolean } = {},
): EnsureBlockOp {
  return {
    kind: 'ensureBlock',
    path,
    blockId,
    content,
    commentStyle: options.commentStyle ?? 'hash',
    createIfMissing: options.createIfMissing ?? true,
    reason,
  }
}

/** Declara una dependencia. Se agrupará con las demás en un solo comando. */
export function dep(
  manager: PackageManager,
  name: string,
  reason: string,
  options: { version?: string; dev?: boolean } = {},
): AddDependencyOp {
  return {
    kind: 'addDependency',
    manager,
    name,
    dev: options.dev ?? true,
    reason,
    ...(options.version === undefined ? {} : { version: options.version }),
  }
}

/** Declara un comando a ejecutar. Siempre visible en el plan antes de correr. */
export function cmd(
  command: string,
  args: readonly string[],
  reason: string,
  options: { cwd?: string; optional?: boolean } = {},
): ExecCommandOp {
  return {
    kind: 'execCommand',
    cmd: command,
    args,
    reason,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.optional === undefined ? {} : { optional: options.optional }),
  }
}
