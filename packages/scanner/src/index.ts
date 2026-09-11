import { resolve } from 'node:path'
import { listTrackedFiles, readGitState } from './git.js'
import { measureSloc } from './sloc.js'
import { detectMonorepo, detectStacks } from './stack.js'
import { assessMaturity } from './maturity.js'
import { walkFiles } from './walk.js'
import type { RepoScan } from './types.js'

export type {
  SizeClass,
  GovernanceMode,
  GitState,
  LanguageStat,
  SlocReport,
  StackDetection,
  MaturitySignal,
  MaturityReport,
  RepoScan,
} from './types.js'

export {
  readGitState,
  readDefaultBranch,
  listBranchNames,
  listTrackedFiles,
  branchExists,
  normaliseRemote,
} from './git.js'
export {
  measureSloc,
  countSloc,
  classifySize,
  modeFor,
  languageFor,
  isIgnoredPath,
  SIZE_THRESHOLDS,
} from './sloc.js'
export { detectStacks, detectMonorepo, detectPackageManager } from './stack.js'
export { assessMaturity } from './maturity.js'
export { walkFiles } from './walk.js'

/**
 * Análisis completo del repositorio. Es la única función que la CLI necesita
 * llamar antes de construir un plan.
 *
 * Es de sólo lectura por contrato: nunca escribe nada, para que `scan` se pueda
 * ofrecer gratis y sin licencia como gancho comercial.
 */
export async function scanRepository(repoRootInput: string): Promise<RepoScan> {
  const repoRoot = resolve(repoRootInput)

  const git = await readGitState(repoRoot)
  const files = (await listTrackedFiles(repoRoot)) ?? (await walkFiles(repoRoot))

  const isMonorepo = detectMonorepo(new Set(files))
  const [sloc, stacks] = await Promise.all([
    measureSloc(repoRoot, files, isMonorepo),
    detectStacks(repoRoot, files),
  ])

  return {
    repoRoot,
    git,
    sloc,
    stacks,
    primaryStack: stacks[0] ?? null,
    maturity: assessMaturity(files),
    isMonorepo,
    files,
  }
}
