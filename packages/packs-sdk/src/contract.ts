import type { Operation } from '@plumbward/core'
import type { GovernanceMode, RepoScan } from '@plumbward/scanner'
import { isWorkBranch } from './branches.js'

/**
 * Public contract of a StackPack.
 *
 * It is the piece that makes the product scale: adding support for a new stack
 * (Rails, .NET, Spring...) is publishing a package that implements this
 * interface and passes the conformance tests. The core is never modified.
 */

export type StrictnessLevel = 'moderate' | 'strict'

export type AiAssistant = 'cursor' | 'claude' | 'copilot' | 'agents'

export type DeployTarget = 'vercel' | 'aws' | 'docker' | 'render' | 'none'

export type OutputLanguage = 'es' | 'en'

/**
 * Operating limits imposed on the AI assistants that work in the repository.
 *
 * They exist because there are actions whose cost of a mistake is not paid by
 * the file but by the team: a push puts unreviewed code into a shared
 * repository, and a migration has no undo button. Who runs those actions is
 * the team's decision, so it is configurable and audited in
 * `.governance/config.yml`.
 */
export interface AgentBoundaries {
  /**
   * Forbids the assistant from running git commands that change state
   * (commit, push, merge, rebase, reset...). Read-only ones are allowed.
   */
  readonly git: boolean
  /**
   * Forbids the assistant from running migrations, seeds or any statement that
   * writes to the database or alters its schema. SELECTs are allowed.
   */
  readonly database: boolean
  /**
   * Language the assistant must write commit messages and Pull Request
   * descriptions in, regardless of the language of the project.
   */
  readonly commitLanguage: OutputLanguage
}

/**
 * Governance profile. It is the content of `.governance/config.yml`: the source
 * of truth, versioned in the client's repo and reviewable in the PR.
 *
 * The wizard runs no actions; it only produces this object. The rest of the CLI
 * is a deterministic function of it, which makes runs reproducible.
 */
export interface Profile {
  readonly strictness: StrictnessLevel
  readonly mode: GovernanceMode
  /**
   * Role of each branch. They are two different questions that an earlier
   * version mixed into a single field, and that is why it got them wrong
   * (ADR 0005).
   */
  readonly branches: {
    /**
     * Branch Pull Requests go to. It is inferred from `origin/HEAD` because on
     * GitHub that is exactly what the default branch means.
     */
    readonly integration: string | null
    /**
     * Branch deployed to production from. **It is never inferred**: it stays
     * `null` until the team configures it. Without it the deploy workflow is not
     * generated, because deploying from a guessed branch is the kind of mistake
     * that cannot be undone.
     */
    readonly release: string | null
    /** Pre-production branch, if the team uses one. */
    readonly staging: string | null
  }
  readonly deployTarget: DeployTarget
  readonly devcontainer: boolean
  readonly dockerCompose: boolean
  readonly aiAssistants: readonly AiAssistant[]
  /**
   * Language of the generated comments and texts. English unless the profile
   * sets `es` (F0-45).
   */
  readonly language: OutputLanguage
  /** What an AI assistant is forbidden to run in this repository. */
  readonly agentBoundaries: AgentBoundaries
}

export interface RepoContext {
  readonly scan: RepoScan
  readonly profile: Profile
  readonly cliVersion: string
}

export interface DetectionResult {
  readonly applies: boolean
  /** 0-1. Sets the contribution order and which pack is the primary one. */
  readonly confidence: number
  readonly reason: string
}

export interface HealthCheck {
  readonly id: string
  readonly label: string
  readonly ok: boolean
  readonly detail: string
  /** What to do to fix it. Feeds `plumbward doctor`. */
  readonly fixHint?: string
}

export interface StackPack {
  readonly id: string
  readonly name: string
  readonly version: string

  /** Does this pack apply to the analysed repository? */
  detect(context: RepoContext): Promise<DetectionResult> | DetectionResult

  /** Operations the pack wants to add to the plan. It NEVER writes to disk. */
  contribute(context: RepoContext): Promise<Operation[]> | Operation[]

  /** Health checks for `plumbward doctor`. */
  validate(context: RepoContext): Promise<HealthCheck[]> | HealthCheck[]
}

/** Default profile derived from the scan, for the non-interactive mode. */
/**
 * Integration branch proposed for the first `config.yml`.
 *
 * In order: the default branch of the remote; the current branch if it is not
 * a work branch; and an existing `main` or `master`. The fallback exists
 * because a repository created with `git init` + `push` has no `origin/HEAD`,
 * and without it the generated CI did not run when pushing to the main branch.
 * If it fails, the damage is running the CI on one branch too many, not one too
 * few.
 */
function proposeIntegrationBranch(scan: RepoScan): string | null {
  if (scan.git.defaultBranch) return scan.git.defaultBranch
  if (scan.git.branch && !isWorkBranch(scan.git.branch)) return scan.git.branch
  return scan.git.branches.find((name) => name === 'main' || name === 'master') ?? null
}

export function recommendedProfile(scan: RepoScan): Profile {
  const strictness: StrictnessLevel = scan.sloc.mode === 'greenfield' ? 'strict' : 'moderate'

  return {
    strictness,
    mode: scan.sloc.mode,
    branches: {
      // Proposal for the initial config.yml. Once written, the file rules.
      // The deploy branch is never proposed (ADR 0005).
      integration: proposeIntegrationBranch(scan),
      release: null,
      staging: null,
    },
    deployTarget: 'none',
    devcontainer: scan.sloc.mode === 'greenfield',
    dockerCompose: false,
    aiAssistants: ['cursor', 'claude', 'copilot'],
    language: 'en',
    // By default the assistant runs nothing irreversible, and writes commit
    // messages in English: it is the dominant convention in git histories,
    // even in teams that document in another language.
    agentBoundaries: { git: true, database: true, commitLanguage: 'en' },
  }
}
