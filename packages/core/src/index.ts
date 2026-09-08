export type {
  PackageManager,
  CommentStyle,
  PatchStrategy,
  CreateFileOp,
  PatchJsonOp,
  PatchYamlOp,
  EnsureBlockOp,
  AddDependencyOp,
  ExecCommandOp,
  Operation,
  OperationKind,
  Conflict,
  PlanSummary,
  ChangePlan,
  FileSnapshot,
  JournalEntry,
  Journal,
  ApplyResult,
} from './types.js'

export { GOVERNANCE_DIR, JOURNAL_FILE, CONFIG_FILE, BASELINE_FILE } from './types.js'

export { PlanBuilder, operationPath, isBlocked, isEmpty } from './plan.js'

export {
  applyPlan,
  revertEntries,
  synthesiseInstallCommands,
  describeOperation,
  withManagedHeader,
  ApplyFailedError,
} from './apply.js'
export type { ApplyOptions, CommandRunner, ProgressEvent } from './apply.js'

export { simulatePlan } from './simulate.js'
export type { SimulatedChange, SimulationResult } from './simulate.js'

export { rollbackLastApply, readJournal, RollbackError } from './rollback.js'
export type { RollbackResult } from './rollback.js'

export {
  resolveInRepo,
  pathExists,
  readFileIfExists,
  writeFileEnsuringDir,
  removeFile,
  commentStyleForPath,
} from './fs.js'

export { shortHash, fullHash } from './hash.js'
