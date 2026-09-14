/**
 * Data contracts of the transactional core.
 *
 * Golden rule of the architecture: NO module writes to disk on its own. They
 * all declare their intent by emitting `Operation[]`, which are gathered into a
 * `ChangePlan`. The plan can be rendered (`plan`) without touching anything,
 * and only the `apply` engine materialises the changes, leaving a trail in the
 * journal.
 */

/** Package managers supported by the `addDependency` operation. */
export type PackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'composer'
  | 'pip'
  | 'poetry'
  | 'uv'
  | 'go'

/** Comment style of the target file, to inject managed blocks. */
export type CommentStyle = 'hash' | 'slash' | 'html' | 'semicolon'

/** Merge strategy when patching a structured document. */
export type PatchStrategy = 'set' | 'merge' | 'appendUnique'

/** Creates a new file. By default it does NOT overwrite existing files. */
export interface CreateFileOp {
  readonly kind: 'createFile'
  /** Path relative to the repository root, always in POSIX format. */
  readonly path: string
  readonly content: string
  /**
   * `true` marks the file as managed by the tool: it gets a control header,
   * and `upgrade` can regenerate it if the client did not touch it.
   */
  readonly managed: boolean
  /** If the file already exists: `skip` (default), `overwrite` or `conflict`. */
  readonly onExists?: 'skip' | 'overwrite' | 'conflict'
  readonly reason: string
}

/** Modifies an existing JSON file (package.json, tsconfig.json, composer.json...). */
export interface PatchJsonOp {
  readonly kind: 'patchJson'
  readonly path: string
  /** RFC-6901 pointer, e.g. `/scripts/lint`. */
  readonly pointer: string
  readonly value: unknown
  readonly strategy: PatchStrategy
  readonly reason: string
}

/** Modifies an existing YAML file, preserving comments and format. */
export interface PatchYamlOp {
  readonly kind: 'patchYaml'
  readonly path: string
  readonly pointer: string
  readonly value: unknown
  readonly strategy: PatchStrategy
  readonly reason: string
}

/**
 * Inserts or updates a delimited block inside a client file.
 * It is the mechanism that makes `upgrade` possible without destroying manual
 * edits: nothing outside the markers is ever touched.
 */
export interface EnsureBlockOp {
  readonly kind: 'ensureBlock'
  readonly path: string
  /** Stable identifier of the block, e.g. `gitignore-artifacts`. */
  readonly blockId: string
  readonly content: string
  readonly commentStyle: CommentStyle
  /** Creates the file if it does not exist. */
  readonly createIfMissing: boolean
  readonly reason: string
}

/** Declares a dependency to install. The actual installation is an `execCommand`. */
export interface AddDependencyOp {
  readonly kind: 'addDependency'
  readonly manager: PackageManager
  readonly name: string
  readonly version?: string
  readonly dev: boolean
  readonly reason: string
}

/** Runs a command. It always requires a reason visible in the plan. */
export interface ExecCommandOp {
  readonly kind: 'execCommand'
  readonly cmd: string
  readonly args: readonly string[]
  readonly reason: string
  /** Relative to the repo root. The root itself by default. */
  readonly cwd?: string
  /** If `true`, a failure does not abort the apply (e.g. optional formatters). */
  readonly optional?: boolean
}

export type Operation =
  | CreateFileOp
  | PatchJsonOp
  | PatchYamlOp
  | EnsureBlockOp
  | AddDependencyOp
  | ExecCommandOp

export type OperationKind = Operation['kind']

/** Reason why an operation cannot be applied cleanly. */
export interface Conflict {
  readonly path: string
  readonly reason: string
  /** `block` prevents the apply; `warn` only informs. */
  readonly severity: 'block' | 'warn'
}

export interface PlanSummary {
  readonly filesCreated: number
  readonly filesModified: number
  readonly dependencies: number
  readonly commands: number
  readonly conflicts: number
}

export interface ChangePlan {
  /** Version of the plan format, for future compatibility. */
  readonly version: 1
  readonly operations: readonly Operation[]
  readonly conflicts: readonly Conflict[]
  readonly summary: PlanSummary
  /** Packs that contributed operations, for traceability. */
  readonly contributors: readonly string[]
}

/** Previous state of a file, to be able to revert it exactly. */
export interface FileSnapshot {
  readonly path: string
  readonly existed: boolean
  /** Original content in base64. Absent if the file did not exist. */
  readonly contentBase64?: string
  readonly mode?: number
}

export interface JournalEntry {
  readonly index: number
  readonly operation: Operation
  /** Files touched by the operation, with their previous content. */
  readonly snapshots: readonly FileSnapshot[]
  readonly appliedAt: string
  readonly status: 'applied' | 'skipped'
  readonly note?: string
}

export interface Journal {
  readonly version: 3
  readonly startedAt: string
  readonly repoRoot: string
  /**
   * Branch `apply` actually wrote on, not the one it started from.
   *
   * The distinction is what separates reverting from losing work: `apply`
   * isolates the changes in `chore/setup-ai-governance`, and the journal is in
   * the `.gitignore` the pack installs, so it survives checkouts. A journal
   * that remembers the starting branch makes `rollback` on `Prod` restore on
   * `Prod` files photographed on the isolated branch.
   *
   * `null` with a detached HEAD: there is no branch to name there. `rollback`
   * compares that `null` like any other name and lets the commit identify the
   * site (F0-29).
   */
  readonly writtenOnBranch: string | null
  /**
   * Commit HEAD pointed to when `apply` wrote. `null` in a repository with no
   * commit yet.
   *
   * The branch name says where you are, not whether it is the same site: a
   * branch deleted and recreated with the same name on another commit, or a
   * commit made on the isolated branch after the `apply`, pass a check by name
   * and lose data all the same. The snapshots are of the tree at this commit.
   *
   * It is also the starting commit, and that is why there is no second field:
   * `headMoved` aborts if HEAD moves between the plan and the confirmation, and
   * `prepareBranch` creates the isolated branch from HEAD without committing.
   * The return notice uses it to name where to go back to when the run started
   * with a detached HEAD.
   */
  readonly writtenOnCommit: string | null
  /**
   * Branch `apply` was launched from, before isolating. `null` if HEAD was
   * already detached.
   *
   * It decides nothing: it is the one `rollback` names when saying how to go
   * back. Without it the advice had to be `git checkout -`, which depends on
   * what the previous ref was and is only right if nobody switched branches in
   * between.
   */
  readonly startedOnBranch: string | null
  readonly entries: readonly JournalEntry[]
}

export interface ApplyResult {
  readonly applied: number
  readonly skipped: number
  readonly journalPath: string
  readonly journal: Journal
}

/** State directory of the tool inside the client's repo. */
export const GOVERNANCE_DIR = '.governance'
export const JOURNAL_FILE = `${GOVERNANCE_DIR}/journal.json`
export const CONFIG_FILE = `${GOVERNANCE_DIR}/config.yml`
export const BASELINE_FILE = `${GOVERNANCE_DIR}/baseline.json`
