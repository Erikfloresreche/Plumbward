import type { MaturityReport, MaturitySignal } from './types.js'

interface SignalDefinition {
  readonly id: string
  readonly label: string
  readonly weight: number
  readonly hint: string
  readonly matches: (has: (pattern: string | RegExp) => boolean) => boolean
}

/**
 * DevSecOps maturity signals.
 *
 * The weight reflects how much pain each one prevents, not how hard it is to
 * put in place. This report is the commercial piece of the tool: it is what the
 * client is shown before buying and what justifies the renewal a year later.
 */
const SIGNALS: readonly SignalDefinition[] = [
  {
    id: 'ci',
    label: 'Continuous integration',
    weight: 15,
    hint: 'Without CI, every PR is validated by eye. It is the base of everything else.',
    matches: (has) =>
      has(/^\.github\/workflows\/.+\.ya?ml$/) ||
      has('.gitlab-ci.yml') ||
      has('Jenkinsfile') ||
      has(/^\.circleci\//),
  },
  {
    id: 'tests',
    label: 'Test suite',
    weight: 15,
    hint: 'Without tests, AI-generated code gets in with no safety net.',
    matches: (has) =>
      has(/(^|\/)(tests?|__tests__|spec)\//i) ||
      has(/\.(test|spec)\.[jt]sx?$/) ||
      has(/_test\.go$/) ||
      has(/(^|\/)test_.+\.py$/),
  },
  {
    id: 'linter',
    label: 'Linter configured',
    weight: 12,
    hint: 'Automates half of the comments a senior writes on every PR today.',
    matches: (has) =>
      has(/^(eslint\.config\.[mc]?[jt]s|\.eslintrc(\.[a-z]+)?)$/) ||
      has('biome.json') ||
      has('biome.jsonc') ||
      has(/^\.?ruff\.toml$/) ||
      has('phpstan.neon') ||
      has('.golangci.yml') ||
      has('.golangci.yaml'),
  },
  {
    id: 'formatter',
    label: 'Formatter and unified style',
    weight: 6,
    hint: 'Removes the formatting diffs that clutter reviews.',
    matches: (has) =>
      has(/^\.prettierrc/) ||
      has('prettier.config.js') ||
      has('.editorconfig') ||
      has('biome.json') ||
      has('.php-cs-fixer.dist.php'),
  },
  {
    id: 'hooks',
    label: 'Pre-commit hooks',
    weight: 12,
    hint: 'Stops problems before the push, not in review.',
    matches: (has) =>
      has(/^\.husky\//) || has('.pre-commit-config.yaml') || has('lefthook.yml'),
  },
  {
    id: 'secrets',
    label: 'Secret scanning',
    weight: 14,
    hint: 'A token leaked by an AI assistant is the most common and most expensive breach.',
    matches: (has) =>
      has('.gitleaks.toml') ||
      has('gitleaks.toml') ||
      has(/^\.github\/workflows\/.*(gitleaks|secret|trufflehog).*\.ya?ml$/i) ||
      has('.trufflehogignore'),
  },
  {
    id: 'ai-rules',
    label: 'Context rules for AI assistants',
    weight: 12,
    hint: 'Without them, each developer gets a different architecture from the same prompt.',
    matches: (has) =>
      has('.cursorrules') ||
      has(/^\.cursor\/rules\//) ||
      has('CLAUDE.md') ||
      has('.clauderules') ||
      has('AGENTS.md') ||
      has('.github/copilot-instructions.md'),
  },
  {
    id: 'containers',
    label: 'Containerised environment',
    weight: 8,
    hint: 'Ends "it works on my machine" and speeds up onboarding new people.',
    matches: (has) =>
      has(/^Dockerfile/) || has(/^docker-compose\.ya?ml$/) || has(/^compose\.ya?ml$/),
  },
  {
    id: 'devcontainer',
    label: 'DevContainer',
    weight: 4,
    hint: 'Clone and start working: an identical environment for the whole team.',
    matches: (has) => has(/^\.devcontainer\//),
  },
  {
    id: 'codeowners',
    label: 'CODEOWNERS',
    weight: 5,
    hint: 'Routes each PR to whoever really knows that part of the code.',
    matches: (has) => has(/(^|\/)CODEOWNERS$/),
  },
  {
    id: 'dependency-updates',
    label: 'Automatic dependency updates',
    weight: 5,
    hint: 'Keeps security debt from piling up in silence.',
    matches: (has) =>
      has('renovate.json') || has('.github/dependabot.yml') || has('.renovaterc.json'),
  },
  {
    id: 'docs',
    label: 'README and getting-started documentation',
    weight: 4,
    hint: 'It is the first thing both a new developer and an AI assistant read.',
    matches: (has) => has(/^README(\.md)?$/i),
  },
  {
    id: 'security-policy',
    label: 'Security policy',
    weight: 3,
    hint: 'A common requirement in audits and in enterprise sales.',
    matches: (has) => has(/(^|\/)SECURITY\.md$/i),
  },
  {
    id: 'env-example',
    label: 'Environment variables template',
    weight: 5,
    hint: 'Documents which secrets are needed without publishing any.',
    matches: (has) => has(/^\.env\.(example|sample|template)$/),
  },
]

/**
 * Assesses the maturity of the repository from its file listing.
 *
 * It works on the listing the scanner already obtained: it does not touch the
 * disk again.
 */
export function assessMaturity(files: readonly string[]): MaturityReport {
  const fileSet = new Set(files)

  const has = (pattern: string | RegExp): boolean => {
    if (typeof pattern === 'string') return fileSet.has(pattern)
    return files.some((file) => pattern.test(file))
  }

  const signals: MaturitySignal[] = SIGNALS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    weight: definition.weight,
    hint: definition.hint,
    present: definition.matches(has),
  }))

  const maxScore = signals.reduce((sum, signal) => sum + signal.weight, 0)
  const earned = signals.reduce((sum, signal) => sum + (signal.present ? signal.weight : 0), 0)

  return {
    score: maxScore === 0 ? 0 : Math.round((earned / maxScore) * 100),
    signals,
    missing: signals.filter((signal) => !signal.present).sort((a, b) => b.weight - a.weight),
  }
}
