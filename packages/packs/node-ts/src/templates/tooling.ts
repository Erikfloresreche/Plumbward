import type { PackageManager } from '@plumbward/core'
import type { OutputLanguage, Profile } from '@plumbward/packs-sdk'

function exec(manager: PackageManager): string {
  switch (manager) {
    case 'pnpm':
      return 'pnpm exec'
    case 'yarn':
      return 'yarn'
    case 'bun':
      return 'bunx'
    default:
      return 'npx --no-install'
  }
}

function run(manager: PackageManager, script: string): string {
  switch (manager) {
    case 'yarn':
      return `yarn ${script}`
    case 'bun':
      return `bun run ${script}`
    case 'pnpm':
      return `pnpm run ${script}`
    default:
      return `npm run ${script}`
  }
}

function installAll(manager: PackageManager): string {
  return manager === 'pnpm'
    ? 'pnpm install'
    : manager === 'yarn'
      ? 'yarn install'
      : manager === 'bun'
        ? 'bun install'
        : 'npm install'
}

function containerInstall(manager: PackageManager): string {
  return manager === 'pnpm'
    ? 'corepack enable && corepack prepare pnpm@latest --activate && pnpm install'
    : manager === 'yarn'
      ? 'corepack enable && yarn install'
      : manager === 'bun'
        ? 'npm i -g bun && bun install'
        : 'npm install'
}

/*
 * Every file below is generated in English by default; the Spanish variant is
 * chosen with `language: es` in the profile (F0-45). Identifiers such as the
 * gitleaks rule ids are the same in both languages. Moving the texts to
 * catalogues is F1-2.
 */

/**
 * Pre-commit hook.
 *
 * This is the ratchet in its purest form: `lint-staged` only looks at the files
 * in the staging area, so in a repository with 200,000 lines of legacy code it
 * is still instant and does not ask to fix the past.
 */
export function preCommitHook(manager: PackageManager, language: OutputLanguage): string {
  return language === 'es' ? preCommitHookEs(manager) : preCommitHookEn(manager)
}

/** Hook that validates the format of the commit message. */
export function commitMsgHook(manager: PackageManager, language: OutputLanguage): string {
  return language === 'es' ? commitMsgHookEs(manager) : commitMsgHookEn(manager)
}

/** commitlint configuration, with explanatory comments. */
export function commitlintConfig(language: OutputLanguage): string {
  return language === 'es' ? commitlintConfigEs() : commitlintConfigEn()
}

/** Gitleaks configuration with its own rules and reasonable exclusions. */
export function gitleaksConfig(language: OutputLanguage): string {
  return language === 'es' ? gitleaksConfigEs() : gitleaksConfigEn()
}

/** Style configuration shared by every editor. */
export function editorConfig(language: OutputLanguage): string {
  return language === 'es' ? editorConfigEs() : editorConfigEn()
}

/** Universal Makefile: the same commands in any project of the client. */
export function makefile(manager: PackageManager, language: OutputLanguage): string {
  return language === 'es' ? makefileEs(manager) : makefileEn(manager)
}

/** DevContainer definition: the same environment for the whole team. */
export function devcontainer(
  manager: PackageManager,
  nodeVersion: string,
  language: OutputLanguage,
): string {
  return language === 'es'
    ? devcontainerEs(manager, nodeVersion)
    : devcontainerEn(manager, nodeVersion)
}

function preCommitHookEn(manager: PackageManager): string {
  return `#!/bin/sh
# ---------------------------------------------------------------------------
# Pre-commit hook
#
# Runs before each commit and only on the staged files. That is why it is fast
# even in large repositories: it does not review the old code, only what you
# are about to contribute.
#
# In a hurry and need to skip it? \`git commit --no-verify\`.
# Use it with judgement: the pipeline will check it again anyway.
# ---------------------------------------------------------------------------

# 1) Format and linter on the staged files.
${exec(manager)} lint-staged || exit 1

# 2) Secret scanning: stops a token from reaching the git history, where
#    removing it is expensive and noisy.
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --config .gitleaks.toml || {
    echo ""
    echo "  Possible secrets were detected in the staged files."
    echo "  Remove them from the code and use environment variables."
    echo "  If it is a false positive, add a rule to .gitleaks.toml."
    exit 1
  }
else
  echo "  gitleaks is not installed: the local secret scan is skipped."
  echo "  Install it with 'brew install gitleaks' (the pipeline will check anyway)."
fi
`
}

function commitMsgHookEn(manager: PackageManager): string {
  return `#!/bin/sh
# ---------------------------------------------------------------------------
# Commit message validation (Conventional Commits).
#
# Format: <type>(<optional scope>): <description>
# Examples: feat(auth): add sign-in with Google
#           fix: correct the VAT calculation in the cart
#
# Valid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
# ---------------------------------------------------------------------------
${exec(manager)} commitlint --edit "$1"
`
}

function commitlintConfigEn(): string {
  return `/**
 * Commit message rules (Conventional Commits).
 *
 * A history with a consistent format makes it possible to generate changelogs
 * automatically and to understand what happened in the project without opening
 * each PR.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The description must not end with a full stop.
    'subject-full-stop': [2, 'never', '.'],
    // At most 100 characters on the first line: it fits in any git viewer.
    'header-max-length': [2, 'always', 100],
  },
}
`
}

function gitleaksConfigEn(): string {
  return `# ---------------------------------------------------------------------------
# Gitleaks configuration — secret detection
#
# Inherits the default rule catalogue (hundreds of patterns of well-known
# providers) and adds what is specific to this project.
# ---------------------------------------------------------------------------
title = "Governance configuration"

[extend]
# Uses the official rule set as the base.
useDefault = true

# --- Own rules ------------------------------------------------------------
[[rules]]
id = "env-variable-with-value"
description = "Sensitive environment variable with a value assigned in the code"
regex = '''(?i)(api[_-]?key|secret|password|passwd|token|credential)\\s*[:=]\\s*["'][^"'\\s$\\{]{8,}["']'''
tags = ["key", "generic"]

[[rules]]
id = "private-key"
description = "Private key block"
regex = '''-----BEGIN[ A-Z]*PRIVATE KEY-----'''
tags = ["key"]

# --- Exclusions -----------------------------------------------------------
[allowlist]
description = "Paths and patterns that are not real secrets"

paths = [
  '''(.*?)(png|jpe?g|gif|svg|ico|pdf|zip|lock)$''',
  '''node_modules/''',
  '''dist/''',
  '''build/''',
  '''coverage/''',
  '''\\.env\\.example$''',
  '''\\.env\\.sample$''',
]

regexes = [
  # Obvious sample values, in English and in Spanish: they are not secrets and
  # only create noise.
  '''(?i)(ejemplo|example|placeholder|dummy|changeme|your[_-]?key|xxx+)''',
]
`
}

function editorConfigEn(): string {
  return `# ---------------------------------------------------------------------------
# File style shared by the whole team and every editor.
# It removes the formatting diffs that clutter code reviews.
# ---------------------------------------------------------------------------
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
# In Markdown, two trailing spaces mean a line break: do not strip them.
trim_trailing_whitespace = false

[Makefile]
# Make requires real tabs.
indent_style = tab
`
}

function makefileEn(manager: PackageManager): string {
  const install = installAll(manager)

  return `# ---------------------------------------------------------------------------
# Project commands
#
# Goal: anyone who joins the repository can work knowing only "make". The same
# commands work in every governed project, whatever its stack.
#
# Type "make" or "make help" to see the list.
# ---------------------------------------------------------------------------
.DEFAULT_GOAL := help
.PHONY: help setup dev lint format typecheck test build check clean

help: ## Shows this help
\t@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \\033[36m%-12s\\033[0m %s\\n", $$1, $$2}'

setup: ## Installs the dependencies and prepares the git hooks
\t${install}
\t@echo "Environment ready. Type 'make dev' to start."

dev: ## Starts the development environment
\t${run(manager, 'dev')}

lint: ## Runs the linter
\t${run(manager, 'lint')}

format: ## Formats the code
\t${run(manager, 'format')}

typecheck: ## Checks the types
\t${run(manager, 'typecheck')}

test: ## Runs the tests
\t${run(manager, 'test')}

build: ## Builds the project
\t${run(manager, 'build')}

check: lint typecheck test ## Runs ALL the checks (the same as CI)
\t@echo "All the checks passed."

clean: ## Deletes build artefacts and dependencies
\trm -rf dist build coverage .turbo node_modules
`
}

function devcontainerEn(manager: PackageManager, nodeVersion: string): string {
  const managerInstall = containerInstall(manager)

  return `{
  // -------------------------------------------------------------------------
  // Reproducible development environment.
  // Whoever clones the repository gets exactly the same versions of everything,
  // without installing anything on their machine. No more "it works on mine".
  // -------------------------------------------------------------------------
  "name": "Development environment",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:1-${nodeVersion}",

  "features": {
    // GitHub client and git utilities inside the container.
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },

  // Runs once, when the container is created.
  "postCreateCommand": "${managerInstall}",

  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "editorconfig.editorconfig"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.codeActionsOnSave": {
          "source.fixAll.eslint": "explicit"
        }
      }
    }
  },

  // Do not run the container as root: it limits the damage of a malicious package.
  "remoteUser": "node"
}
`
}

/** Spanish variant of `preCommitHookEn`. */
function preCommitHookEs(manager: PackageManager): string {
  return `#!/bin/sh
# ---------------------------------------------------------------------------
# Hook de pre-commit
#
# Se ejecuta antes de cada commit y sólo sobre los ficheros preparados (staged).
# Por eso es rápido incluso en repositorios grandes: no revisa el código antiguo,
# sólo lo que estás a punto de aportar.
#
# ¿Con prisa y necesitas saltártelo? \`git commit --no-verify\`.
# Úsalo con criterio: el pipeline volverá a comprobarlo igualmente.
# ---------------------------------------------------------------------------

# 1) Formato y linter sobre los ficheros preparados.
${exec(manager)} lint-staged || exit 1

# 2) Escaneo de secretos: impide que un token llegue al historial de git,
#    de donde borrarlo es caro y ruidoso.
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --config .gitleaks.toml || {
    echo ""
    echo "  Se han detectado posibles secretos en los ficheros preparados."
    echo "  Quítalos del código y usa variables de entorno."
    echo "  Si es un falso positivo, añade una regla a .gitleaks.toml."
    exit 1
  }
else
  echo "  gitleaks no está instalado: se omite el escaneo local de secretos."
  echo "  Instálalo con 'brew install gitleaks' (el pipeline lo comprobará igualmente)."
fi
`
}

/** Spanish variant of `commitMsgHookEn`. */
function commitMsgHookEs(manager: PackageManager): string {
  return `#!/bin/sh
# ---------------------------------------------------------------------------
# Validación del mensaje de commit (Conventional Commits).
#
# Formato: <tipo>(<ámbito opcional>): <descripción>
# Ejemplos: feat(auth): añade inicio de sesión con Google
#           fix: corrige el cálculo del IVA en el carrito
#
# Tipos válidos: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
# ---------------------------------------------------------------------------
${exec(manager)} commitlint --edit "$1"
`
}

/** Spanish variant of `commitlintConfigEn`. */
function commitlintConfigEs(): string {
  return `/**
 * Reglas del mensaje de commit (Conventional Commits).
 *
 * Un historial con formato consistente permite generar changelogs automáticos y
 * entender qué pasó en el proyecto sin abrir cada PR.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // La descripción no debe acabar en punto.
    'subject-full-stop': [2, 'never', '.'],
    // Máximo 100 caracteres en la primera línea: cabe en cualquier visor de git.
    'header-max-length': [2, 'always', 100],
  },
}
`
}

/** Spanish variant of `gitleaksConfigEn`. */
function gitleaksConfigEs(): string {
  return `# ---------------------------------------------------------------------------
# Configuración de Gitleaks — detección de secretos
#
# Hereda el catálogo de reglas por defecto (cientos de patrones de proveedores
# conocidos) y añade lo específico de este proyecto.
# ---------------------------------------------------------------------------
title = "Configuración de gobernanza"

[extend]
# Usa el conjunto de reglas oficial como base.
useDefault = true

# --- Reglas propias -------------------------------------------------------
[[rules]]
id = "env-variable-with-value"
description = "Variable de entorno sensible con un valor asignado en el código"
regex = '''(?i)(api[_-]?key|secret|password|passwd|token|credential)\\s*[:=]\\s*["'][^"'\\s$\\{]{8,}["']'''
tags = ["key", "generic"]

[[rules]]
id = "private-key"
description = "Bloque de clave privada"
regex = '''-----BEGIN[ A-Z]*PRIVATE KEY-----'''
tags = ["key"]

# --- Exclusiones ----------------------------------------------------------
[allowlist]
description = "Rutas y patrones que no son secretos reales"

paths = [
  '''(.*?)(png|jpe?g|gif|svg|ico|pdf|zip|lock)$''',
  '''node_modules/''',
  '''dist/''',
  '''build/''',
  '''coverage/''',
  '''\\.env\\.example$''',
  '''\\.env\\.sample$''',
]

regexes = [
  # Valores de ejemplo evidentes: no son secretos y generan ruido.
  '''(?i)(ejemplo|example|placeholder|dummy|changeme|your[_-]?key|xxx+)''',
]
`
}

/** Spanish variant of `editorConfigEn`. */
function editorConfigEs(): string {
  return `# ---------------------------------------------------------------------------
# Estilo de fichero común a todo el equipo y a todos los editores.
# Elimina los diffs de formato que ensucian las revisiones de código.
# ---------------------------------------------------------------------------
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
# En Markdown, dos espacios al final significan salto de línea: no los borres.
trim_trailing_whitespace = false

[Makefile]
# Make exige tabuladores reales.
indent_style = tab
`
}

/** Spanish variant of `makefileEn`. */
function makefileEs(manager: PackageManager): string {
  const install = installAll(manager)

  return `# ---------------------------------------------------------------------------
# Comandos del proyecto
#
# Objetivo: que cualquier persona que entre al repositorio pueda trabajar
# sabiendo sólo "make". Los mismos comandos funcionan en todos los proyectos
# gobernados, sea cual sea su stack.
#
# Escribe "make" o "make help" para ver la lista.
# ---------------------------------------------------------------------------
.DEFAULT_GOAL := help
.PHONY: help setup dev lint format typecheck test build check clean

help: ## Muestra esta ayuda
\t@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \\033[36m%-12s\\033[0m %s\\n", $$1, $$2}'

setup: ## Instala dependencias y prepara los hooks de git
\t${install}
\t@echo "Entorno listo. Escribe 'make dev' para arrancar."

dev: ## Arranca el entorno de desarrollo
\t${run(manager, 'dev')}

lint: ## Ejecuta el linter
\t${run(manager, 'lint')}

format: ## Formatea el código
\t${run(manager, 'format')}

typecheck: ## Comprueba los tipos
\t${run(manager, 'typecheck')}

test: ## Ejecuta las pruebas
\t${run(manager, 'test')}

build: ## Compila el proyecto
\t${run(manager, 'build')}

check: lint typecheck test ## Ejecuta TODAS las comprobaciones (lo mismo que el CI)
\t@echo "Todas las comprobaciones han pasado."

clean: ## Borra artefactos de compilación y dependencias
\trm -rf dist build coverage .turbo node_modules
`
}

/** Spanish variant of `devcontainerEn`. */
function devcontainerEs(manager: PackageManager, nodeVersion: string): string {
  const managerInstall = containerInstall(manager)

  return `{
  // -------------------------------------------------------------------------
  // Entorno de desarrollo reproducible.
  // Quien clone el repositorio obtiene exactamente las mismas versiones de todo,
  // sin instalar nada en su máquina. Se acabó el "en mi equipo funciona".
  // -------------------------------------------------------------------------
  "name": "Entorno de desarrollo",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:1-${nodeVersion}",

  "features": {
    // Cliente de GitHub y utilidades de git dentro del contenedor.
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },

  // Se ejecuta una vez, al crear el contenedor.
  "postCreateCommand": "${managerInstall}",

  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "editorconfig.editorconfig"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.codeActionsOnSave": {
          "source.fixAll.eslint": "explicit"
        }
      }
    }
  },

  // No ejecutes el contenedor como root: reduce el daño de un paquete malicioso.
  "remoteUser": "node"
}
`
}

/** lint-staged configuration: what runs on each file type. */
export function lintStagedConfig(profile: Profile): Record<string, string[]> {
  const jsCommands = ['eslint --fix --max-warnings=0', 'prettier --write']

  return {
    '*.{ts,tsx,js,jsx,mjs,cjs}': profile.strictness === 'strict'
      ? jsCommands
      : ['eslint --fix', 'prettier --write'],
    '*.{json,md,yml,yaml,css,scss}': ['prettier --write'],
  }
}
