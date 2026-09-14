import type { PackageManager } from '@plumbward/core'

/** Size classification according to the specification (SLOC). */
export type SizeClass = 'small' | 'medium' | 'large'

/**
 * Governance mode derived from the size. It is the most important decision of
 * the scanner: it sets whether everything can be required from minute one or
 * whether the ratchet has to be applied only to new code.
 */
export type GovernanceMode =
  /** < 2,000 SLOC: full, immediate strict configuration. */
  | 'greenfield'
  /** 2,000 - 50,000 SLOC: strict rules only on what changes. */
  | 'ratchet'
  /** > 50,000 SLOC or monorepo: baseline, and auditing of new PRs only. */
  | 'non-disruptive'

export interface GitState {
  readonly isRepo: boolean
  /**
   * Current branch, read with `git symbolic-ref HEAD` and without abbreviating.
   *
   * Neither `git rev-parse --abbrev-ref HEAD` nor `symbolic-ref --short` is
   * used: both return `heads/Prod` if a tag or a remote called `Prod` exists,
   * and that name matches nothing. It is `null` with a detached HEAD.
   */
  readonly branch: string | null
  /** `true` if HEAD points to no branch (checkout of a commit or a tag). */
  readonly detachedHead: boolean
  /**
   * Names of every known branch, local and remote-tracking, without prefix and
   * without duplicates. They only serve to **propose** the initial
   * `config.yml`; nothing generated depends on them once the file exists
   * (ADR 0005). They may include orphaned refs.
   */
  readonly branches: readonly string[]
  /**
   * Default branch of the remote, according to `refs/remotes/origin/HEAD`.
   *
   * It is read without network, and that is why it **can be stale**: if the
   * branch was renamed on the remote after cloning or after the first push, the
   * local ref keeps pointing to the old name until someone runs
   * `git remote set-head origin --auto`. It must never be used as the only
   * source to decide which branches to protect.
   */
  readonly defaultBranch: string | null
  readonly isDirty: boolean
  /** Hash of the first commit: stable identifier of the project. */
  readonly rootCommit: string | null
  readonly remoteUrl: string | null
  /**
   * Fingerprint of the repository to bind the licence to. It derives from the
   * first commit and, failing that, from the normalised remote URL.
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
  /** Identifier of the pack that must handle this stack. */
  readonly id: string
  readonly name: string
  /** Confidence 0-1. The pack with the highest confidence is the primary one. */
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
  /** What turning it on brings. It is the text that sells the tool to the client. */
  readonly hint: string
}

export interface MaturityReport {
  /** Weighted score 0-100. */
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
  /** Relative paths of every file considered (respects .gitignore). */
  readonly files: readonly string[]
}
