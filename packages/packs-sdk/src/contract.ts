import type { Operation } from '@governance/core'
import type { GovernanceMode, RepoScan } from '@governance/scanner'

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
  /** Qué hacer para arreglarlo. Alimenta `governance doctor`. */
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

  /** Comprobaciones de salud para `governance doctor`. */
  validate(context: RepoContext): Promise<HealthCheck[]> | HealthCheck[]
}

/** Perfil por defecto derivado del escaneo, para el modo no interactivo. */
export function recommendedProfile(scan: RepoScan): Profile {
  const strictness: StrictnessLevel = scan.sloc.mode === 'greenfield' ? 'strict' : 'moderate'

  return {
    strictness,
    mode: scan.sloc.mode,
    branches: {
      main: scan.git.branch === 'master' ? 'master' : 'main',
      staging: null,
      dev: null,
    },
    deployTarget: 'none',
    devcontainer: scan.sloc.mode === 'greenfield',
    dockerCompose: false,
    aiAssistants: ['cursor', 'claude', 'copilot'],
    language: 'es',
  }
}
