import type { Profile } from './contract.js'

/**
 * Decisions about branches.
 *
 * This whole file follows one principle (ADR 0005): **when an inference fails,
 * it must fail towards more protection, never towards an action.** Three
 * earlier versions tried to infer which branch is the release branch, and each
 * one fixed some repositories and broke others. Here the only inference that
 * decides is "is this a work branch?", and its failure falls on the safe side:
 * a name that is not recognised is isolated.
 */

/**
 * Prefixes of work branches.
 *
 * It is the list that can be closed: work prefixes are a widespread and stable
 * convention (Conventional Commits, git-flow, dependency bots). The names of
 * long-lived branches, on the other hand, cannot be enumerated —`Prod`, `pro`,
 * `pre`, `live`, `release/prod`…—, and that is why the decision rests on this
 * list and not on that one.
 *
 * `release/` is left out on purpose: in many teams it is long-lived.
 */
export const WORK_BRANCH_PREFIXES: readonly string[] = [
  'feat',
  'feature',
  'fix',
  'bugfix',
  'hotfix',
  'chore',
  'docs',
  'refactor',
  'test',
  'tests',
  'build',
  'ci',
  'perf',
  'style',
  'revert',
  'dependabot',
  'renovate',
  // Branches created by the AI assistants themselves. They are direct users of
  // this product, and isolating their work on another branch would scramble it.
  'claude',
  'copilot',
  'codex',
  'cursor',
]

/** Is it a work branch, of the kind created for a task and then deleted? */
export function isWorkBranch(branch: string): boolean {
  const slash = branch.indexOf('/')
  if (slash <= 0 || slash === branch.length - 1) return false
  return WORK_BRANCH_PREFIXES.includes(branch.slice(0, slash).toLowerCase())
}

/** Branches the profile or the remote explicitly mark as long-lived. */
export function configuredBranches(
  profile: Pick<Profile, 'branches'>,
  defaultBranch: string | null,
): ReadonlySet<string> {
  const candidates = [
    profile.branches.integration,
    profile.branches.release,
    profile.branches.staging,
    defaultBranch,
  ]
  return new Set(
    candidates
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .map((name) => name.toLowerCase()),
  )
}

export interface HeadState {
  readonly branch: string | null
  readonly detachedHead: boolean
  readonly defaultBranch: string | null
}

/**
 * Must the work be isolated on its own branch before writing?
 *
 * Yes, unless we are on a recognisable work branch that is also not listed as
 * a long-lived branch in the profile and is not the default branch. An unknown
 * name falls on the safe side: the worst case is an unnecessary isolated
 * branch, against writing straight onto production.
 */
export function requiresIsolation(head: HeadState, profile: Pick<Profile, 'branches'>): boolean {
  if (head.detachedHead) return true
  if (head.branch === null) return false
  if (configuredBranches(profile, head.defaultBranch).has(head.branch.toLowerCase())) return true
  return !isWorkBranch(head.branch)
}

/**
 * Branches the generated CI runs on when pushing.
 *
 * They come **only from the profile**, and with `config.yml` the branch profile
 * comes only from that file: the local state of the repository is only used to
 * propose the initial file, never when regenerating. An earlier version added
 * the existing remote branches, and two copies of the same repository with the
 * same `config.yml` generated different workflows depending on the orphaned
 * refs each one had: it broke the invariant that the CLI is a deterministic
 * function of its configuration. Pull Requests do not depend on this: the
 * generated CI checks all of them.
 */
export function ciPushBranches(profile: Pick<Profile, 'branches'>): string[] {
  const names: string[] = []
  for (const name of [profile.branches.integration, profile.branches.release, profile.branches.staging]) {
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name)
  }
  return names
}
