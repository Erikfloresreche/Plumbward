import type { PackageManager } from '@plumbward/core'
import type { Profile } from '@plumbward/packs-sdk'

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

/**
 * Hook de pre-commit.
 *
 * Aquí vive el trinquete en su forma más pura: `lint-staged` sólo mira los
 * ficheros en el área de preparación, así que en un repositorio con 200.000
 * líneas de legado sigue siendo instantáneo y no pide arreglar el pasado.
 */
export function preCommitHook(manager: PackageManager): string {
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

/** Hook que valida el formato del mensaje de commit. */
export function commitMsgHook(manager: PackageManager): string {
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

/** Configuración de commitlint con mensajes de error en español. */
export function commitlintConfig(): string {
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

/** Configuración de Gitleaks con reglas propias y exclusiones razonables. */
export function gitleaksConfig(): string {
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
id = "variable-de-entorno-con-valor"
description = "Variable de entorno sensible con un valor asignado en el código"
regex = '''(?i)(api[_-]?key|secret|password|passwd|token|credential)\\s*[:=]\\s*["'][^"'\\s$\\{]{8,}["']'''
tags = ["clave", "generico"]

[[rules]]
id = "clave-privada"
description = "Bloque de clave privada"
regex = '''-----BEGIN[ A-Z]*PRIVATE KEY-----'''
tags = ["clave"]

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

/** Configuración de estilo compartida por todos los editores. */
export function editorConfig(): string {
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

/** Makefile universal: los mismos comandos en cualquier proyecto del cliente. */
export function makefile(manager: PackageManager): string {
  const install =
    manager === 'pnpm'
      ? 'pnpm install'
      : manager === 'yarn'
        ? 'yarn install'
        : manager === 'bun'
          ? 'bun install'
          : 'npm install'

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

/** Definición de DevContainer: mismo entorno para todo el equipo. */
export function devcontainer(manager: PackageManager, nodeVersion: string): string {
  const managerInstall =
    manager === 'pnpm'
      ? 'corepack enable && corepack prepare pnpm@latest --activate && pnpm install'
      : manager === 'yarn'
        ? 'corepack enable && yarn install'
        : manager === 'bun'
          ? 'npm i -g bun && bun install'
          : 'npm install'

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

/** Configuración de lint-staged: qué se ejecuta sobre cada tipo de fichero. */
export function lintStagedConfig(profile: Profile): Record<string, string[]> {
  const jsCommands = ['eslint --fix --max-warnings=0', 'prettier --write']

  return {
    '*.{ts,tsx,js,jsx,mjs,cjs}': profile.strictness === 'strict'
      ? jsCommands
      : ['eslint --fix', 'prettier --write'],
    '*.{json,md,yml,yaml,css,scss}': ['prettier --write'],
  }
}
