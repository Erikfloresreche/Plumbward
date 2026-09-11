import type { Operation } from '@plumbward/core'
import type { GovernanceMode, RepoScan } from '@plumbward/scanner'

/**
 * Contrato público de un StackPack.
 *
 * Es la pieza que hace escalable el producto: añadir soporte para un stack nuevo
 * (Rails, .NET, Spring...) es publicar un paquete que implemente esta interfaz y
 * pase los tests de conformidad. El núcleo no se modifica nunca.
 */

export type StrictnessLevel = 'moderate' | 'strict'

export type AiAssistant = 'cursor' | 'claude' | 'copilot' | 'agents'

export type DeployTarget = 'vercel' | 'aws' | 'docker' | 'render' | 'none'

export type OutputLanguage = 'es' | 'en'

/**
 * Límites operativos que se imponen a los asistentes de IA que trabajen en el
 * repositorio.
 *
 * Existen porque hay acciones cuyo coste de equivocarse no lo paga el fichero,
 * lo paga el equipo: un push mete código sin revisar en un repositorio
 * compartido, y una migración no tiene botón de deshacer. La decisión de quién
 * ejecuta esas acciones es del equipo, así que es configurable y queda
 * auditada en `.governance/config.yml`.
 */
export interface AgentBoundaries {
  /**
   * Prohíbe al asistente ejecutar comandos git que modifiquen el estado
   * (commit, push, merge, rebase, reset...). Los de sólo lectura se permiten.
   */
  readonly git: boolean
  /**
   * Prohíbe al asistente ejecutar migraciones, seeds o cualquier sentencia que
   * escriba en la base de datos o altere su esquema. Los SELECT se permiten.
   */
  readonly database: boolean
  /**
   * Idioma en el que el asistente debe redactar los mensajes de commit y las
   * descripciones de Pull Request, con independencia del idioma del proyecto.
   */
  readonly commitLanguage: OutputLanguage
}

/**
 * Perfil de gobernanza. Es el contenido de `.governance/config.yml`: la fuente
 * de verdad, versionada en el repo del cliente y revisable en la PR.
 *
 * El wizard no ejecuta acciones; sólo produce este objeto. El resto de la CLI es
 * una función determinista de él, lo que hace las ejecuciones reproducibles.
 */
export interface Profile {
  readonly strictness: StrictnessLevel
  readonly mode: GovernanceMode
  readonly branches: {
    readonly main: string
    readonly staging: string | null
    readonly dev: string | null
  }
  readonly deployTarget: DeployTarget
  readonly devcontainer: boolean
  readonly dockerCompose: boolean
  readonly aiAssistants: readonly AiAssistant[]
  /** Idioma de los comentarios y textos generados. */
  readonly language: OutputLanguage
  /** Qué se le prohíbe ejecutar a un asistente de IA en este repositorio. */
  readonly agentBoundaries: AgentBoundaries
}

export interface RepoContext {
  readonly scan: RepoScan
  readonly profile: Profile
  readonly cliVersion: string
}

export interface DetectionResult {
  readonly applies: boolean
  /** 0-1. Determina el orden de contribución y cuál es el pack principal. */
  readonly confidence: number
  readonly reason: string
}

export interface HealthCheck {
  readonly id: string
  readonly label: string
  readonly ok: boolean
  readonly detail: string
  /** Qué hacer para arreglarlo. Alimenta `plumbward doctor`. */
  readonly fixHint?: string
}

export interface StackPack {
  readonly id: string
  readonly name: string
  readonly version: string

  /** ¿Este pack aplica al repositorio analizado? */
  detect(context: RepoContext): Promise<DetectionResult> | DetectionResult

  /** Operaciones que el pack quiere aportar al plan. NUNCA escribe en disco. */
  contribute(context: RepoContext): Promise<Operation[]> | Operation[]

  /** Comprobaciones de salud para `plumbward doctor`. */
  validate(context: RepoContext): Promise<HealthCheck[]> | HealthCheck[]
}

/** Perfil por defecto derivado del escaneo, para el modo no interactivo. */
export function recommendedProfile(scan: RepoScan): Profile {
  const strictness: StrictnessLevel = scan.sloc.mode === 'greenfield' ? 'strict' : 'moderate'

  return {
    strictness,
    mode: scan.sloc.mode,
    branches: {
      // La rama por defecto detectada, si la hay. Es una sugerencia: acaba en
      // `config.yml`, que el equipo revisa en una PR y puede corregir. El
      // último recurso conserva el comportamiento anterior.
      main: scan.git.defaultBranch ?? (scan.git.branch === 'master' ? 'master' : 'main'),
      staging: null,
      dev: null,
    },
    deployTarget: 'none',
    devcontainer: scan.sloc.mode === 'greenfield',
    dockerCompose: false,
    aiAssistants: ['cursor', 'claude', 'copilot'],
    language: 'es',
    // Por defecto el asistente no ejecuta nada irreversible, y escribe los
    // mensajes de commit en inglés: es la convención dominante en los
    // historiales de git, incluso en equipos que documentan en otro idioma.
    agentBoundaries: { git: true, database: true, commitLanguage: 'en' },
  }
}
