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
 * Syntactic sugar to write packs.
 *
 * Without this, a pack is a wall of object literals and nobody from outside
 * would want to write one. With this, a pack reads almost like a list of
 * requirements.
 */

export interface FileOptions {
  /** Marks the file as managed (header + regenerable by `upgrade`). */
  readonly managed?: boolean
  readonly onExists?: 'skip' | 'overwrite' | 'conflict'
}

/** Creates a new file. Managed by default, and without overwriting what exists. */
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

/** Patches an existing JSON file. By default it merges without overwriting client values. */
export function json(
  path: string,
  pointer: string,
  value: unknown,
  reason: string,
  strategy: PatchStrategy = 'merge',
): PatchJsonOp {
  return { kind: 'patchJson', path, pointer, value, strategy, reason }
}

/** Patches an existing YAML file, preserving comments. */
export function yaml(
  path: string,
  pointer: string,
  value: unknown,
  reason: string,
  strategy: PatchStrategy = 'merge',
): PatchYamlOp {
  return { kind: 'patchYaml', path, pointer, value, strategy, reason }
}

/** Inserts a delimited block inside a client file. */
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

/** Declares a dependency. It is grouped with the others into a single command. */
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

/** Declares a command to run. Always visible in the plan before it runs. */
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
