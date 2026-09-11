import type { Operation, PackageManager } from '@plumbward/core'
import { block, ciPushBranches, cmd, dep, file, json } from '@plumbward/packs-sdk'
import type {
  DetectionResult,
  HealthCheck,
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
import { gobernanzaDoc } from './templates/docs.js'
import { workflowChecks } from './workflow-checks.js'

const PACK_VERSION = '0.1.0'
const DEFAULT_NODE_VERSION = '22'

/** Configuración plana de ESLint, para proyectos que aún no tienen linter. */
function eslintConfig(typescript: boolean, profile: Profile): string {
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

/** Scripts que el pipeline y el Makefile dan por hechos. */
function packageScripts(typescript: boolean): Record<string, string> {
  return {
    prepare: 'husky',
    lint: 'eslint .',
    format: 'prettier --write .',
    typecheck: typescript
      ? 'tsc --noEmit'
      : 'echo "Sin TypeScript: no hay comprobación de tipos que ejecutar."',
    test: 'vitest run --passWithNoTests',
    build: 'echo "Configura aquí el build real del proyecto."',
    'plumbward:check': 'npx @plumbward/cli doctor',
  }
}

function hasSignal(context: RepoContext, id: string): boolean {
  return context.scan.maturity.signals.some((signal) => signal.id === id && signal.present)
}

/**
 * Pack de Node.js / TypeScript.
 *
 * Cubre Node y JavaScript puro además de TypeScript: el detector distingue el
 * caso y ajusta reglas y scripts en consecuencia.
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
        reason: 'No se ha encontrado package.json en la raíz del repositorio.',
      }
    }
    return {
      applies: true,
      confidence: detection.confidence,
      reason: `Detectado ${detection.name} (${detection.evidence.join(', ')}).`,
    }
  },

  contribute(context: RepoContext): Operation[] {
    const { scan, profile } = context
    const stack = scan.stacks.find((entry) => entry.id === 'node-ts')
    const manager: PackageManager = stack?.packageManager ?? 'npm'
    const typescript = stack?.typescript ?? false
    const operations: Operation[] = []

    // --- Entorno y estilo ---------------------------------------------------
    operations.push(
      file('.editorconfig', editorConfig(), 'Unifica el estilo de fichero entre editores.'),
      file(
        '.nvmrc',
        `${DEFAULT_NODE_VERSION}\n`,
        'Fija la versión de Node para que CI y desarrollo usen la misma.',
      ),
      file(
        'Makefile',
        makefile(manager),
        'Comandos unificados: quien entra al proyecto sólo necesita saber "make".',
      ),
    )

    // --- Integración continua ----------------------------------------------
    operations.push(
      file(
        '.github/workflows/ci-dev.yml',
        ciDevWorkflow(
          manager,
          profile.mode,
          profile,
          ciPushBranches(profile),
        ),
        'Valida cada Pull Request antes de que la revise una persona.',
      ),
    )
    if (profile.branches.staging) {
      operations.push(
        file(
          '.github/workflows/ci-staging.yml',
          ciStagingWorkflow(manager, profile),
          'Pipeline de despliegue a staging, listo para conectar con el proveedor.',
        ),
      )
    }
    // Sin rama de despliegue configurada no se genera el workflow: desplegar
    // desde una rama adivinada no se puede deshacer. `validate` lo avisa.
    const release = profile.branches.release
    if (profile.deployTarget !== 'none' && release !== null) {
      operations.push(
        file(
          '.github/workflows/ci-prod.yml',
          ciProdWorkflow(manager, release),
          'Pipeline de producción con puerta de aprobación manual.',
        ),
      )
    }

    // --- Seguridad ----------------------------------------------------------
    operations.push(
      file(
        '.gitleaks.toml',
        gitleaksConfig(),
        'Configura la detección de secretos antes de que lleguen al historial.',
      ),
      file(
        '.husky/pre-commit',
        preCommitHook(manager),
        'Comprueba formato, linter y secretos sólo sobre lo que vas a commitear.',
      ),
      file(
        '.husky/commit-msg',
        commitMsgHook(manager),
        'Valida el formato del mensaje de commit.',
      ),
      file(
        'commitlint.config.js',
        commitlintConfig(),
        'Reglas de Conventional Commits con límites razonables.',
      ),
    )

    // --- Linter (sólo si el proyecto no tiene ya uno) ------------------------
    if (!hasSignal(context, 'linter')) {
      operations.push(
        file(
          'eslint.config.js',
          eslintConfig(typescript, profile),
          'El proyecto no tenía linter: se añade uno centrado en errores reales.',
        ),
        dep(manager, '@eslint/js', 'Reglas base de ESLint.'),
        dep(manager, 'eslint', 'Linter del proyecto.'),
      )
      if (typescript) {
        operations.push(dep(manager, 'typescript-eslint', 'Reglas de ESLint para TypeScript.'))
      }
    }

    // --- Reglas para asistentes de IA ---------------------------------------
    const rules = aiRules(scan, profile)
    if (profile.aiAssistants.includes('cursor')) {
      operations.push(
        file('.cursorrules', rules, 'Reglas de arquitectura y seguridad para Cursor.'),
      )
    }
    if (profile.aiAssistants.includes('claude')) {
      operations.push(file('CLAUDE.md', rules, 'Reglas del proyecto para Claude Code.'))
    }
    if (profile.aiAssistants.includes('agents')) {
      operations.push(
        file('AGENTS.md', rules, 'Reglas del proyecto en el formato estándar AGENTS.md.'),
      )
    }
    if (profile.aiAssistants.includes('copilot')) {
      operations.push(
        file(
          '.github/copilot-instructions.md',
          copilotInstructions(scan, profile),
          'Instrucciones de proyecto para GitHub Copilot.',
        ),
      )
    }

    // --- DevContainer -------------------------------------------------------
    if (profile.devcontainer) {
      operations.push(
        file(
          '.devcontainer/devcontainer.json',
          devcontainer(manager, DEFAULT_NODE_VERSION),
          'Entorno de desarrollo idéntico para todo el equipo.',
        ),
      )
    }

    // --- Documentación ------------------------------------------------------
    operations.push(
      file(
        'GOBERNANZA.md',
        gobernanzaDoc(scan, profile),
        'Explica al equipo qué se ha instalado y cómo convivir con ello.',
        { managed: false },
      ),
    )

    // --- package.json -------------------------------------------------------
    operations.push(
      json(
        'package.json',
        '/scripts',
        packageScripts(typescript),
        'Añade los scripts que esperan el pipeline y el Makefile (respeta los existentes).',
      ),
      json(
        'package.json',
        '/lint-staged',
        lintStagedConfig(profile),
        'Define qué se ejecuta sobre cada tipo de fichero preparado.',
      ),
    )

    // --- .gitignore ---------------------------------------------------------
    operations.push(
      block(
        '.gitignore',
        'gitignore-artifacts',
        [
          '# Estado local de la herramienta de gobernanza.',
          '# El journal permite revertir la última ejecución y no debe compartirse.',
          '.governance/journal.json',
        ].join('\n'),
        'Evita subir al repositorio el estado local de la herramienta.',
        { commentStyle: 'hash', createIfMissing: true },
      ),
    )

    // --- Dependencias y arranque -------------------------------------------
    operations.push(
      dep(manager, 'husky', 'Gestiona los hooks de git.'),
      dep(manager, 'lint-staged', 'Ejecuta comprobaciones sólo sobre ficheros preparados.'),
      dep(manager, 'prettier', 'Formateador de código.'),
      dep(manager, '@commitlint/cli', 'Valida el formato de los mensajes de commit.'),
      dep(manager, '@commitlint/config-conventional', 'Convención estándar de commits.'),
      dep(manager, 'vitest', 'Ejecutor de pruebas.'),
      cmd(
        manager === 'npm' ? 'npx' : manager,
        manager === 'npm' ? ['husky'] : ['exec', 'husky'],
        'Activa los hooks de git en la copia local.',
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
        label: 'package.json presente',
        ok: files.has('package.json'),
        detail: files.has('package.json')
          ? 'Encontrado en la raíz.'
          : 'No se encuentra package.json en la raíz.',
        fixHint: 'Ejecuta la CLI desde la raíz del proyecto Node.',
      },
      {
        id: 'ci',
        label: 'Pipeline de validación de PRs',
        ok: files.has('.github/workflows/ci-dev.yml'),
        detail: files.has('.github/workflows/ci-dev.yml')
          ? 'Configurado.'
          : 'Falta el workflow de validación.',
        fixHint: 'Ejecuta `plumbward apply` para generarlo.',
      },
      {
        id: 'hooks',
        label: 'Hooks de pre-commit',
        ok: files.has('.husky/pre-commit'),
        detail: files.has('.husky/pre-commit') ? 'Instalados.' : 'No hay hook de pre-commit.',
        fixHint: 'Ejecuta `plumbward apply` y después el script `prepare`.',
      },
      {
        id: 'secrets',
        label: 'Configuración de escaneo de secretos',
        ok: files.has('.gitleaks.toml'),
        detail: files.has('.gitleaks.toml') ? 'Configurado.' : 'Falta .gitleaks.toml.',
        fixHint: 'Ejecuta `plumbward apply`.',
      },
      {
        id: 'ai-rules',
        label: 'Reglas para asistentes de IA',
        ok: files.has('.cursorrules') || files.has('CLAUDE.md') || files.has('AGENTS.md'),
        detail:
          files.has('.cursorrules') || files.has('CLAUDE.md') || files.has('AGENTS.md')
            ? 'Presentes.'
            : 'El repositorio no declara reglas para asistentes de IA.',
        fixHint: 'Ejecuta `plumbward apply`.',
      },
    ]

    // Workflows leídos tal como están en disco: ver workflow-checks.ts.
    checks.push(...(await workflowChecks(context)))

    return checks
  },
}

export default nodeTsPack
