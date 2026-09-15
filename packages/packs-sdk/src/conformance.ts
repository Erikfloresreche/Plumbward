import { operationPath } from '@plumbward/core'
import type { Operation } from '@plumbward/core'
import type { RepoContext, StackPack } from './contract.js'

/**
 * Conformance tests every pack must pass to be published.
 *
 * They exist because the pack catalogue is the scaling axis of the product: as
 * soon as there are third-party packs, this suite is the only thing that
 * guarantees a badly written one does not break a client's repository.
 */

export interface ConformanceViolation {
  readonly rule: string
  readonly detail: string
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

function checkOperationSafety(operations: readonly Operation[]): ConformanceViolation[] {
  const violations: ConformanceViolation[] = []

  for (const operation of operations) {
    if (operation.reason.trim().length === 0) {
      violations.push({
        rule: 'reason-required',
        detail: `Operation "${operation.kind}" does not explain why it is applied; the user must be able to read it in the plan.`,
      })
    }

    const path = operationPath(operation)
    if (path === undefined) continue

    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      violations.push({
        rule: 'relative-paths-only',
        detail: `Absolute path forbidden: "${path}".`,
      })
    }
    if (path.split('/').includes('..')) {
      violations.push({
        rule: 'no-path-traversal',
        detail: `The path "${path}" tries to leave the repository.`,
      })
    }
    if (path.includes('\\')) {
      violations.push({
        rule: 'posix-paths-only',
        detail: `The path "${path}" uses Windows separators; always use "/".`,
      })
    }
  }

  return violations
}

/**
 * Checks a pack against the contract.
 *
 * The most important rule is determinism: `contribute` must return exactly the
 * same for the same context. Without it, `plan` would lie about what `apply` is
 * going to do, and the whole trust model falls apart.
 */
export async function checkPackConformance(
  pack: StackPack,
  context: RepoContext,
): Promise<ConformanceViolation[]> {
  const violations: ConformanceViolation[] = []

  if (!ID_PATTERN.test(pack.id)) {
    violations.push({
      rule: 'id-format',
      detail: `The id "${pack.id}" must be lowercase kebab-case.`,
    })
  }
  if (pack.name.trim().length === 0) {
    violations.push({ rule: 'name-required', detail: 'The pack does not declare a readable name.' })
  }
  if (!/^\d+\.\d+\.\d+/.test(pack.version)) {
    violations.push({
      rule: 'semver-version',
      detail: `The version "${pack.version}" does not follow semver.`,
    })
  }

  const detection = await pack.detect(context)
  if (detection.confidence < 0 || detection.confidence > 1) {
    violations.push({
      rule: 'confidence-range',
      detail: `The confidence must be between 0 and 1, got ${detection.confidence}.`,
    })
  }

  if (!detection.applies) return violations

  const first = await pack.contribute(context)
  const second = await pack.contribute(context)

  if (JSON.stringify(first) !== JSON.stringify(second)) {
    violations.push({
      rule: 'deterministic-contribute',
      detail:
        'Two calls to contribute() with the same context returned different operations. The plan would no longer be reliable.',
    })
  }

  violations.push(...checkOperationSafety(first))

  const checks = await pack.validate(context)
  for (const check of checks) {
    if (check.id.trim().length === 0) {
      violations.push({
        rule: 'health-check-id',
        detail: 'A health check does not declare an id.',
      })
    }
  }

  return violations
}
