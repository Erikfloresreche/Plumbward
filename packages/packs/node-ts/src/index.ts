import type { Operation, PackageManager } from '@plumbward/core'
import { block, ciPushBranches, cmd, dep, file, json } from '@plumbward/packs-sdk'
import type {
  DetectionResult,
  HealthCheck,
  OutputLanguage,
  Profile,
  RepoContext,
  StackPack,
} from '@plumbward/packs-sdk'
import { ciDevWorkflow, ciProdWorkflow, ciStagingWorkflow } from './templates/ci.js'
import { aiRules, copilotInstructions } from './templates/ai-rules.js'
import {
  commitMsgHook,
  commitlintConfig,
  devcontainer,
  editorConfig,
  gitleaksConfig,
  lintStagedConfig,
  makefile,
  preCommitHook,
} from './templates/tooling.js'
import { governanceDoc } from './templates/docs.js'
import { workflowChecks } from './workflow-checks.js'

const PACK_VERSION = '0.1.0'
const DEFAULT_NODE_VERSION = '22'

/**
 * Flat ESLint configuration, for projects that have no linter yet. English by
 * default; Spanish with `language: es` (F0-45).
 */
function eslintConfig(typescript: boolean, profile: Profile): string {
  return profile.language === 'es' ? eslintConfigEs(typescript, profile) : eslintConfigEn(typescript, profile)
}

function eslintConfigEn(typescript: boolean, profile: Profile): string {
  return `// ---------------------------------------------------------------------------
// ESLint configuration (flat format, ESLint 9+).
//
// Only rules that catch real bugs are enabled, not style preferences: Prettier
// already takes care of style. Every rule turned off here is one argument less
// in code reviews.
// ---------------------------------------------------------------------------
import js from '@eslint/js'
${typescript ? "import tseslint from 'typescript-eslint'\n" : ''}
export default [
  {
    // Never analyse build output or dependencies.
    ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**', '.next/**'],
  },
  js.configs.recommended,
${typescript ? '  ...tseslint.configs.recommended,\n' : ''}  {
    rules: {
      // An empty catch hides failures that will show up in production.
      'no-empty': ['error', { allowEmptyCatch: false }],
      // A forgotten console.log is the most common information leak.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
${
  typescript
    ? `      // 'any' cancels the only automatic defence there is against code
      // invented by an AI assistant.
      '@typescript-eslint/no-explicit-any': '${profile.strictness === 'strict' ? 'error' : 'warn'}',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
`
    : ''
}    },
  },
]
`
}

/** Spanish variant of `eslintConfigEn`. */
function eslintConfigEs(typescript: boolean, profile: Profile): string {
  return `// ---------------------------------------------------------------------------
// Configuración de ESLint (formato plano, ESLint 9+).
//
// Sólo se han activado reglas que atrapan errores reales, no preferencias de
// estilo: del estilo ya se encarga Prettier. Cada regla desactivada aquí es una
// discusión menos en las revisiones de código.
// ---------------------------------------------------------------------------
import js from '@eslint/js'
${typescript ? "import tseslint from 'typescript-eslint'\n" : ''}
export default [
  {
    // Nunca analices artefactos ni dependencias.
    ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**', '.next/**'],
  },
  js.configs.recommended,
${typescript ? '  ...tseslint.configs.recommended,\n' : ''}  {
    rules: {
      // Un catch vacío esconde fallos que aparecerán en producción.
      'no-empty': ['error', { allowEmptyCatch: false }],
      // console.log olvidado es la fuga de información más habitual.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
${
  typescript
    ? `      // 'any' anula la única defensa automática que hay contra el código
      // inventado por un asistente de IA.
      '@typescript-eslint/no-explicit-any': '${profile.strictness === 'strict' ? 'error' : 'warn'}',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
`
    : ''
}    },
  },
]
`
}

/** Scripts the pipeline and the Makefile take for granted. Their messages follow the profile. */
function packageScripts(typescript: boolean, language: OutputLanguage): Record<string, string> {
  const es = language === 'es'
  return {
    prepare: 'husky',
    lint: 'eslint .',
    format: 'prettier --write .',
    typecheck: typescript
      ? 'tsc --noEmit'
      : es
        ? 'echo "Sin TypeScript: no hay comprobación de tipos que ejecutar."'
        : 'echo "No TypeScript: there is no type check to run."',
    test: 'vitest run --passWithNoTests',
    build: es
      ? 'echo "Configura aquí el build real del proyecto."'
      : 'echo "Configure the real build of the project here."',
    'plumbward:check': 'npx @plumbward/cli doctor',
  }
}

/** Managed `.gitignore` block that keeps the journal out of the repository. */
function gitignoreArtifacts(language: OutputLanguage): string {
  return (
    language === 'es'
      ? [
          '# Estado local de la herramienta de gobernanza.',
          '# El journal permite revertir la última ejecución y no debe compartirse.',
        ]
      : [
          '# Local state of the governance tool.',
          '# The journal lets you revert the last run and must not be shared.',
        ]
  )
    .concat('.governance/journal.json')
    .join('\n')
}

function hasSignal(context: RepoContext, id: string): boolean {
  return context.scan.maturity.signals.some((signal) => signal.id === id && signal.present)
}

/**
 * Node.js / TypeScript pack.
 *
 * It covers Node and plain JavaScript as well as TypeScript: the detector tells
 * the cases apart and adjusts rules and scripts accordingly.
 */
export const nodeTsPack: StackPack = {
  id: 'node-ts',
  name: 'Node.js / TypeScript',
  version: PACK_VERSION,

  detect(context: RepoContext): DetectionResult {
    const detection = context.scan.stacks.find((stack) => stack.id === 'node-ts')
    if (!detection) {
      return {
        applies: false,
        confidence: 0,
        reason: 'No package.json was found at the root of the repository.',
      }
    }
    return {
      applies: true,
      confidence: detection.confidence,
      reason: `Detected ${detection.name} (${detection.evidence.join(', ')}).`,
    }
  },

  contribute(context: RepoContext): Operation[] {
    const { scan, profile } = context
    const stack = scan.stacks.find((entry) => entry.id === 'node-ts')
    const manager: PackageManager = stack?.packageManager ?? 'npm'
    const typescript = stack?.typescript ?? false
    const operations: Operation[] = []

    // --- Environment and style ----------------------------------------------
    operations.push(
      file('.editorconfig', editorConfig(profile.language), 'Unifies the file style across editors.'),
      file(
        '.nvmrc',
        `${DEFAULT_NODE_VERSION}\n`,
        'Pins the Node version so CI and development use the same one.',
      ),
      file(
        'Makefile',
        makefile(manager, profile.language),
        'Unified commands: anyone who joins the project only needs to know "make".',
      ),
    )

    // --- Continuous integration ---------------------------------------------
    operations.push(
      file(
        '.github/workflows/ci-dev.yml',
        ciDevWorkflow(
          manager,
          profile.mode,
          profile,
          ciPushBranches(profile),
        ),
        'Validates each Pull Request before a person reviews it.',
      ),
    )
    if (profile.branches.staging) {
      operations.push(
        file(
          '.github/workflows/ci-staging.yml',
          ciStagingWorkflow(manager, profile),
          'Staging deploy pipeline, ready to connect to the provider.',
        ),
      )
    }
    // With no deploy branch configured the workflow is not generated: deploying
    // from a guessed branch cannot be undone. `validate` warns about it.
    const release = profile.branches.release
    if (profile.deployTarget !== 'none' && release !== null) {
      operations.push(
        file(
          '.github/workflows/ci-prod.yml',
          ciProdWorkflow(manager, release, profile.language),
          'Production pipeline with a manual approval gate.',
        ),
      )
    }

    // --- Security -----------------------------------------------------------
    operations.push(
      file(
        '.gitleaks.toml',
        gitleaksConfig(profile.language),
        'Configures secret detection before secrets reach the history.',
      ),
      file(
        '.husky/pre-commit',
        preCommitHook(manager, profile.language),
        'Checks format, linter and secrets only on what is about to be committed.',
      ),
      file(
        '.husky/commit-msg',
        commitMsgHook(manager, profile.language),
        'Validates the format of the commit message.',
      ),
      file(
        'commitlint.config.js',
        commitlintConfig(profile.language),
        'Conventional Commits rules with reasonable limits.',
      ),
    )

    // --- Linter (only if the project does not have one already) -------------
    if (!hasSignal(context, 'linter')) {
      operations.push(
        file(
          'eslint.config.js',
          eslintConfig(typescript, profile),
          'The project had no linter: adds one focused on real bugs.',
        ),
        dep(manager, '@eslint/js', 'Base ESLint rules.'),
        dep(manager, 'eslint', 'Project linter.'),
      )
      if (typescript) {
        operations.push(dep(manager, 'typescript-eslint', 'ESLint rules for TypeScript.'))
      }
    }

    // --- Rules for AI assistants ---------------------------------------------
    const rules = aiRules(scan, profile)
    if (profile.aiAssistants.includes('cursor')) {
      operations.push(
        file('.cursorrules', rules, 'Architecture and security rules for Cursor.'),
      )
    }
    if (profile.aiAssistants.includes('claude')) {
      operations.push(file('CLAUDE.md', rules, 'Project rules for Claude Code.'))
    }
    if (profile.aiAssistants.includes('agents')) {
      operations.push(
        file('AGENTS.md', rules, 'Project rules in the standard AGENTS.md format.'),
      )
    }
    if (profile.aiAssistants.includes('copilot')) {
      operations.push(
        file(
          '.github/copilot-instructions.md',
          copilotInstructions(scan, profile),
          'Project instructions for GitHub Copilot.',
        ),
      )
    }

    // --- DevContainer -------------------------------------------------------
    if (profile.devcontainer) {
      operations.push(
        file(
          '.devcontainer/devcontainer.json',
          devcontainer(manager, DEFAULT_NODE_VERSION, profile.language),
          'The same development environment for the whole team.',
        ),
      )
    }

    // --- Documentation ------------------------------------------------------
    operations.push(
      file(
        'GOVERNANCE.md',
        governanceDoc(scan, profile),
        'Explains to the team what was installed and how to live with it.',
        { managed: false },
      ),
    )

    // --- package.json -------------------------------------------------------
    operations.push(
      json(
        'package.json',
        '/scripts',
        packageScripts(typescript, profile.language),
        'Adds the scripts the pipeline and the Makefile expect (keeps the existing ones).',
      ),
      json(
        'package.json',
        '/lint-staged',
        lintStagedConfig(profile),
        'Defines what runs on each type of staged file.',
      ),
    )

    // --- .gitignore ---------------------------------------------------------
    operations.push(
      block(
        '.gitignore',
        'gitignore-artifacts',
        gitignoreArtifacts(profile.language),
        'Keeps the local state of the tool out of the repository.',
        { commentStyle: 'hash', createIfMissing: true },
      ),
    )

    // --- Dependencies and bootstrap -----------------------------------------
    operations.push(
      dep(manager, 'husky', 'Manages the git hooks.'),
      dep(manager, 'lint-staged', 'Runs checks only on staged files.'),
      dep(manager, 'prettier', 'Code formatter.'),
      dep(manager, '@commitlint/cli', 'Validates the format of commit messages.'),
      dep(manager, '@commitlint/config-conventional', 'Standard commit convention.'),
      dep(manager, 'vitest', 'Test runner.'),
      cmd(
        manager === 'npm' ? 'npx' : manager,
        manager === 'npm' ? ['husky'] : ['exec', 'husky'],
        'Enables the git hooks in the local clone.',
        { optional: true },
      ),
    )

    return operations
  },

  async validate(context: RepoContext): Promise<HealthCheck[]> {
    const files = new Set(context.scan.files)

    const checks: HealthCheck[] = [
      {
        id: 'package-json',
        label: 'package.json present',
        ok: files.has('package.json'),
        detail: files.has('package.json')
          ? 'Found at the root.'
          : 'There is no package.json at the root.',
        fixHint: 'Run the CLI from the root of the Node project.',
      },
      {
        id: 'ci',
        label: 'PR validation pipeline',
        ok: files.has('.github/workflows/ci-dev.yml'),
        detail: files.has('.github/workflows/ci-dev.yml')
          ? 'Configured.'
          : 'The validation workflow is missing.',
        fixHint: 'Run `plumbward apply` to generate it.',
      },
      {
        id: 'hooks',
        label: 'Pre-commit hooks',
        ok: files.has('.husky/pre-commit'),
        detail: files.has('.husky/pre-commit') ? 'Installed.' : 'There is no pre-commit hook.',
        fixHint: 'Run `plumbward apply` and then the `prepare` script.',
      },
      {
        id: 'secrets',
        label: 'Secret scanning configuration',
        ok: files.has('.gitleaks.toml'),
        detail: files.has('.gitleaks.toml') ? 'Configured.' : '.gitleaks.toml is missing.',
        fixHint: 'Run `plumbward apply`.',
      },
      {
        id: 'ai-rules',
        label: 'Rules for AI assistants',
        ok: files.has('.cursorrules') || files.has('CLAUDE.md') || files.has('AGENTS.md'),
        detail:
          files.has('.cursorrules') || files.has('CLAUDE.md') || files.has('AGENTS.md')
            ? 'Present.'
            : 'The repository declares no rules for AI assistants.',
        fixHint: 'Run `plumbward apply`.',
      },
    ]

    // Workflows read as they are on disk: see workflow-checks.ts.
    checks.push(...(await workflowChecks(context)))

    return checks
  },
}

export default nodeTsPack
