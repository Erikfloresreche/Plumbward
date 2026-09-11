export type {
  StrictnessLevel,
  AiAssistant,
  DeployTarget,
  OutputLanguage,
  AgentBoundaries,
  Profile,
  RepoContext,
  DetectionResult,
  HealthCheck,
  StackPack,
} from './contract.js'
export { recommendedProfile } from './contract.js'

export { file, json, yaml, block, dep, cmd } from './dsl.js'
export type { FileOptions } from './dsl.js'

export {
  WORK_BRANCH_PREFIXES,
  LONG_LIVED_BRANCH_NAMES,
  isWorkBranch,
  configuredBranches,
  requiresIsolation,
  ciPushBranches,
} from './branches.js'
export type { HeadState } from './branches.js'

export { PackRegistry } from './registry.js'
export type { SelectedPack } from './registry.js'

export { checkPackConformance } from './conformance.js'
export type { ConformanceViolation } from './conformance.js'
