import type { PackageManager } from '@governance/core'

/** Clasificación por tamaño según la especificación (SLOC). */
export type SizeClass = 'small' | 'medium' | 'large'

/**
 * Modo de gobernanza derivado del tamaño. Es la decisión más importante del
 * escáner: determina si se puede exigir todo desde el minuto uno o si hay que
 * aplicar el trinquete sólo sobre código nuevo.
 */
export type GovernanceMode =
  /** < 2.000 SLOC: configuración estricta total e inmediata. */
  | 'greenfield'
  /** 2.000 - 50.000 SLOC: reglas estrictas sólo sobre lo que cambia. */
  | 'ratchet'
  /** > 50.000 SLOC o monorepo: baseline y auditoría sólo de PRs nuevas. */
  | 'non-disruptive'

export interface GitState {
  readonly isRepo: boolean
  readonly branch: string | null
  readonly isDirty: boolean
  /** Hash del primer commit: identificador estable del proyecto. */
  readonly rootCommit: string | null
  readonly remoteUrl: string | null
  /**
   * Huella del repositorio para vincular la licencia. Deriva del primer commit
   * y, en su defecto, de la URL remota normalizada.
   */
  readonly fingerprint: string | null
}

export interface LanguageStat {
  readonly language: string
  readonly files: number
  readonly sloc: number
}

export interface SlocReport {
  readonly total: number
  readonly filesScanned: number
  readonly byLanguage: readonly LanguageStat[]
  readonly sizeClass: SizeClass
  readonly mode: GovernanceMode
}

export interface StackDetection {
  /** Identificador del pack que debe encargarse de este stack. */
  readonly id: string
  readonly name: string
  /** Confianza 0-1. El pack con mayor confianza se considera principal. */
  readonly confidence: number
  readonly evidence: readonly string[]
  readonly packageManager?: PackageManager
  readonly frameworks: readonly string[]
  readonly typescript?: boolean
}

export interface MaturitySignal {
  readonly id: string
  readonly label: string
  readonly present: boolean
  readonly weight: number
  /** Qué aporta activarlo. Es el texto que vende la herramienta al cliente. */
  readonly hint: string
}

export interface MaturityReport {
  /** Puntuación 0-100 ponderada. */
  readonly score: number
  readonly signals: readonly MaturitySignal[]
  readonly missing: readonly MaturitySignal[]
}

export interface RepoScan {
  readonly repoRoot: string
  readonly git: GitState
  readonly sloc: SlocReport
  readonly stacks: readonly StackDetection[]
  readonly primaryStack: StackDetection | null
  readonly maturity: MaturityReport
  readonly isMonorepo: boolean
  /** Rutas relativas de todos los ficheros considerados (respeta .gitignore). */
  readonly files: readonly string[]
}
