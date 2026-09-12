/**
 * Contratos de datos del núcleo transaccional.
 *
 * Regla de oro de la arquitectura: NINGÚN módulo escribe en disco por su cuenta.
 * Todos declaran su intención emitiendo `Operation[]`, que se agregan en un
 * `ChangePlan`. El plan se puede renderizar (`plan`) sin tocar nada, y sólo el
 * motor de `apply` materializa los cambios dejando rastro en el journal.
 */

/** Gestores de paquetes soportados para la operación `addDependency`. */
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

/** Estilo de comentario del fichero destino, para inyectar bloques gestionados. */
export type CommentStyle = 'hash' | 'slash' | 'html' | 'semicolon'

/** Estrategia de fusión al parchear un documento estructurado. */
export type PatchStrategy = 'set' | 'merge' | 'appendUnique'

/** Crea un fichero nuevo. Por defecto NO pisa ficheros existentes. */
export interface CreateFileOp {
  readonly kind: 'createFile'
  /** Ruta relativa a la raíz del repositorio, siempre en formato POSIX. */
  readonly path: string
  readonly content: string
  /**
   * `true` marca el fichero como gestionado por la herramienta: se le añade
   * cabecera de control y `upgrade` podrá regenerarlo si el cliente no lo tocó.
   */
  readonly managed: boolean
  /** Si el fichero ya existe: `skip` (defecto), `overwrite` o `conflict`. */
  readonly onExists?: 'skip' | 'overwrite' | 'conflict'
  readonly reason: string
}

/** Modifica un JSON existente (package.json, tsconfig.json, composer.json...). */
export interface PatchJsonOp {
  readonly kind: 'patchJson'
  readonly path: string
  /** Puntero RFC-6901, p. ej. `/scripts/lint`. */
  readonly pointer: string
  readonly value: unknown
  readonly strategy: PatchStrategy
  readonly reason: string
}

/** Modifica un YAML existente preservando comentarios y formato. */
export interface PatchYamlOp {
  readonly kind: 'patchYaml'
  readonly path: string
  readonly pointer: string
  readonly value: unknown
  readonly strategy: PatchStrategy
  readonly reason: string
}

/**
 * Inserta o actualiza un bloque delimitado dentro de un fichero del cliente.
 * Es el mecanismo que hace posible `upgrade` sin destruir ediciones manuales:
 * fuera de los marcadores nunca se toca nada.
 */
export interface EnsureBlockOp {
  readonly kind: 'ensureBlock'
  readonly path: string
  /** Identificador estable del bloque, p. ej. `gitignore-artifacts`. */
  readonly blockId: string
  readonly content: string
  readonly commentStyle: CommentStyle
  /** Crea el fichero si no existe. */
  readonly createIfMissing: boolean
  readonly reason: string
}

/** Declara una dependencia a instalar. La instalación real es un `execCommand`. */
export interface AddDependencyOp {
  readonly kind: 'addDependency'
  readonly manager: PackageManager
  readonly name: string
  readonly version?: string
  readonly dev: boolean
  readonly reason: string
}

/** Ejecuta un comando. Siempre requiere justificación visible en el plan. */
export interface ExecCommandOp {
  readonly kind: 'execCommand'
  readonly cmd: string
  readonly args: readonly string[]
  readonly reason: string
  /** Relativo a la raíz del repo. Por defecto la propia raíz. */
  readonly cwd?: string
  /** Si `true`, un fallo no aborta el apply (p. ej. formateadores opcionales). */
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

/** Motivo por el que una operación no puede aplicarse limpiamente. */
export interface Conflict {
  readonly path: string
  readonly reason: string
  /** `block` impide el apply; `warn` sólo informa. */
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
  /** Versión del formato de plan, para compatibilidad futura. */
  readonly version: 1
  readonly operations: readonly Operation[]
  readonly conflicts: readonly Conflict[]
  readonly summary: PlanSummary
  /** Packs que han contribuido operaciones, para trazabilidad. */
  readonly contributors: readonly string[]
}

/** Estado previo de un fichero, para poder revertir con exactitud. */
export interface FileSnapshot {
  readonly path: string
  readonly existed: boolean
  /** Contenido original en base64. Ausente si el fichero no existía. */
  readonly contentBase64?: string
  readonly mode?: number
}

export interface JournalEntry {
  readonly index: number
  readonly operation: Operation
  /** Ficheros tocados por la operación, con su contenido anterior. */
  readonly snapshots: readonly FileSnapshot[]
  readonly appliedAt: string
  readonly status: 'applied' | 'skipped'
  readonly note?: string
}

export interface Journal {
  readonly version: 2
  readonly startedAt: string
  readonly repoRoot: string
  /**
   * Rama sobre la que `apply` escribió de verdad, no la de partida.
   *
   * La distinción es la que separa revertir de perder trabajo: `apply` aísla
   * los cambios en `chore/setup-ai-governance`, y el journal está en el
   * `.gitignore` que instala el pack, así que sobrevive a los checkouts. Un
   * journal que recuerde la rama de partida hace que `rollback` en `Prod`
   * restaure en `Prod` ficheros fotografiados en la rama aislada.
   *
   * `null` con HEAD desacoplado: ahí no hay rama que nombrar, y `rollback` se
   * niega porque no puede comprobar que sigue en el mismo sitio.
   */
  readonly writtenOnBranch: string | null
  readonly entries: readonly JournalEntry[]
}

export interface ApplyResult {
  readonly applied: number
  readonly skipped: number
  readonly journalPath: string
  readonly journal: Journal
}

/** Directorio de estado de la herramienta dentro del repo del cliente. */
export const GOVERNANCE_DIR = '.governance'
export const JOURNAL_FILE = `${GOVERNANCE_DIR}/journal.json`
export const CONFIG_FILE = `${GOVERNANCE_DIR}/config.yml`
export const BASELINE_FILE = `${GOVERNANCE_DIR}/baseline.json`
